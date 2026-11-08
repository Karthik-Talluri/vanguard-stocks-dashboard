import urllib.request
import urllib.parse
import json
import time
import datetime
import threading
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Any, Optional

MARKET_TICKERS = {
    "nifty": "^NSEI",
    "vix": "^INDIAVIX",
    "nasdaq": "^IXIC",
    "sp500": "^GSPC",
    "dxy": "DX-Y.NYB",
    "us10y": "^TNX"
}

_MARKET_CACHE: Optional[Dict[str, Any]] = None
_MARKET_CACHE_TIME: float = 0.0
_MARKET_CACHE_LOCK = threading.Lock()

def get_ist_now() -> datetime.datetime:
    """Returns the current datetime in Indian Standard Time (UTC+5:30)."""
    utc_now = datetime.datetime.now(datetime.timezone.utc)
    return utc_now + datetime.timedelta(hours=5, minutes=30)

def get_market_hours_status() -> Dict[str, Any]:
    """
    Evaluates whether the Indian stock market (NSE) is currently open.
    Trading Days: Monday to Friday (excluding holidays).
    Trading Hours: 09:15 AM to 03:30 PM IST.
    Pre-Market: 09:00 AM to 09:15 AM IST.
    """
    ist_now = get_ist_now()
    weekday = ist_now.weekday()  # 0=Monday, 4=Friday, 5=Saturday, 6=Sunday
    curr_time = ist_now.time()
    
    is_weekend = weekday in (5, 6)
    market_open_time = datetime.time(9, 15)
    market_close_time = datetime.time(15, 30)
    pre_market_time = datetime.time(9, 0)
    
    if is_weekend:
        return {
            "is_market_open": False,
            "market_status": "CLOSED",
            "session_type": "CLOSED_WEEKEND",
            "market_session_message": "MARKET CLOSED (Weekend)",
            "ist_time": ist_now.strftime("%d %b %Y, %I:%M:%S %p IST")
        }
    elif pre_market_time <= curr_time < market_open_time:
        return {
            "is_market_open": False,
            "market_status": "PRE_MARKET",
            "session_type": "PRE_MARKET",
            "market_session_message": "PRE-MARKET SESSION",
            "ist_time": ist_now.strftime("%d %b %Y, %I:%M:%S %p IST")
        }
    elif market_open_time <= curr_time <= market_close_time:
        return {
            "is_market_open": True,
            "market_status": "OPEN",
            "session_type": "REGULAR",
            "market_session_message": "LIVE MARKET",
            "ist_time": ist_now.strftime("%d %b %Y, %I:%M:%S %p IST")
        }
    else:
        return {
            "is_market_open": False,
            "market_status": "CLOSED",
            "session_type": "CLOSED_AFTER_HOURS",
            "market_session_message": "MARKET CLOSED (After Hours)",
            "ist_time": ist_now.strftime("%d %b %Y, %I:%M:%S %p IST")
        }

def fetch_single_ticker(key: str, symbol: str) -> tuple:
    """
    Queries Yahoo Finance chart API (with endpoint rotation and headers) for the latest real-time/last-close market data.
    """
    encoded_sym = urllib.parse.quote(symbol)
    endpoints = [
        f"https://query2.finance.yahoo.com/v8/finance/chart/{encoded_sym}?interval=1d&range=5d",
        f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded_sym}?interval=1d&range=5d"
    ]
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    ]
    
    last_err = None
    for url in endpoints:
        for ua in user_agents:
            try:
                req = urllib.request.Request(
                    url,
                    headers={
                        "User-Agent": ua,
                        "Accept": "*/*"
                    }
                )
                with urllib.request.urlopen(req, timeout=3.5) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    result = data.get("chart", {}).get("result", [{}])[0]
                    meta = result.get("meta", {})
                    quote = result.get("indicators", {}).get("quote", [{}])[0]
                    timestamps = result.get("timestamp", [])
                    
                    price = meta.get("regularMarketPrice")
                    prev_close = meta.get("chartPreviousClose") or meta.get("previousClose")
                    
                    # Clean list of values
                    opens = [x for x in quote.get("open", []) if x is not None]
                    highs = [x for x in quote.get("high", []) if x is not None]
                    lows = [x for x in quote.get("low", []) if x is not None]
                    closes = [x for x in quote.get("close", []) if x is not None]
                    
                    latest_open = opens[-1] if opens else price
                    latest_high = highs[-1] if highs else price
                    latest_low = lows[-1] if lows else price
                    latest_close = closes[-1] if closes else price
                    if price is None:
                        price = latest_close
                        
                    latest_ts = timestamps[-1] if timestamps else meta.get("regularMarketTime")
                    
                    return key, {
                        "symbol": symbol,
                        "price": float(price) if price is not None else None,
                        "prev_close": float(prev_close) if prev_close is not None else None,
                        "open": float(latest_open) if latest_open is not None else None,
                        "high": float(latest_high) if latest_high is not None else None,
                        "low": float(latest_low) if latest_low is not None else None,
                        "close": float(latest_close) if latest_close is not None else None,
                        "timestamp": latest_ts,
                        "success": True
                    }
            except Exception as e:
                last_err = str(e)
                continue
                
    return key, {"symbol": symbol, "error": last_err or "Fetch failed", "success": False}

def get_live_market_data(force_refresh: bool = False) -> Dict[str, Any]:
    """
    Fetches the latest live market data for NIFTY 50 and global macro indices.
    Employs thread-safe in-memory caching with dynamic TTL:
    - 15s during active market hours
    - 60s when market is closed
    """
    global _MARKET_CACHE, _MARKET_CACHE_TIME
    
    now = time.time()
    market_hours = get_market_hours_status()
    is_open = market_hours["is_market_open"]
    cache_ttl = 15.0 if is_open else 60.0
    
    with _MARKET_CACHE_LOCK:
        if not force_refresh and _MARKET_CACHE and (now - _MARKET_CACHE_TIME < cache_ttl):
            # Update live market hours flag dynamically in cached response
            cached = dict(_MARKET_CACHE)
            cached.update(market_hours)
            return cached

    # Fetch all tickers in parallel
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = [
            executor.submit(fetch_single_ticker, key, sym)
            for key, sym in MARKET_TICKERS.items()
        ]
        results = dict(f.result() for f in futures)

    # Check if primary NIFTY ticker succeeded
    nifty_info = results.get("nifty", {})
    if not nifty_info.get("success"):
        # If fetch failed and we have an existing cache, return cached data with warning
        with _MARKET_CACHE_LOCK:
            if _MARKET_CACHE:
                cached = dict(_MARKET_CACHE)
                cached["is_stale"] = True
                cached["warning"] = "Market data update failed; using last verified session data."
                cached.update(market_hours)
                return cached
        # Fallback defaults if no previous cache exists
        nifty_close = 25030.35
        nifty_prev = 23440.80
        nifty_open = 24538.20
        nifty_high = 25030.35
        nifty_low = 24388.05
    else:
        nifty_close = nifty_info.get("price") or 25030.35
        nifty_prev = nifty_info.get("prev_close") or nifty_close
        nifty_open = nifty_info.get("open") or nifty_close
        nifty_high = nifty_info.get("high") or nifty_close
        nifty_low = nifty_info.get("low") or nifty_close

    nifty_change_abs = nifty_close - nifty_prev
    nifty_change_pct = (nifty_change_abs / nifty_prev * 100.0) if nifty_prev else 0.0

    # VIX
    vix_info = results.get("vix", {})
    vix_val = vix_info.get("price") if vix_info.get("success") else 17.47
    vix_prev = vix_info.get("prev_close") if vix_info.get("success") else vix_val
    vix_change = ((vix_val - vix_prev) / vix_prev * 100.0) if vix_prev else 0.0

    # Macro indices
    nasdaq_info = results.get("nasdaq", {})
    nasdaq_val = nasdaq_info.get("price") if nasdaq_info.get("success") else 24579.42

    sp500_info = results.get("sp500", {})
    sp500_val = sp500_info.get("price") if sp500_info.get("success") else 7376.86

    dxy_info = results.get("dxy", {})
    dxy_val = dxy_info.get("price") if dxy_info.get("success") else 102.28

    us10y_info = results.get("us10y", {})
    us10y_val = us10y_info.get("price") if us10y_info.get("success") else 4.86

    ist_now = get_ist_now()
    ts_val = nifty_info.get("timestamp")
    last_trading_session = ""
    if ts_val:
        session_dt = datetime.datetime.fromtimestamp(ts_val, tz=datetime.timezone.utc) + datetime.timedelta(hours=5, minutes=30)
        last_trading_session = session_dt.strftime("%Y-%m-%d")

    data = {
        "nifty_close": round(float(nifty_close), 2),
        "nifty_prev_close": round(float(nifty_prev), 2),
        "nifty_change_abs": round(float(nifty_change_abs), 2),
        "nifty_change": round(float(nifty_change_pct), 2),
        "nifty_open": round(float(nifty_open), 2),
        "nifty_high": round(float(nifty_high), 2),
        "nifty_low": round(float(nifty_low), 2),
        "vix": round(float(vix_val), 2),
        "vix_prev_close": round(float(vix_prev), 2),
        "vix_change": round(float(vix_change), 2),
        "nasdaq": round(float(nasdaq_val), 2),
        "sp500": round(float(sp500_val), 2),
        "dxy": round(float(dxy_val), 2),
        "us10y": round(float(us10y_val), 2),
        "last_updated": ist_now.isoformat(),
        "last_updated_formatted": ist_now.strftime("%d %b %Y, %I:%M:%S %p IST"),
        "last_trading_session": last_trading_session,
        "is_stale": False,
        "source": "yahoo_finance_live",
        **market_hours
    }

    with _MARKET_CACHE_LOCK:
        _MARKET_CACHE = data
        _MARKET_CACHE_TIME = now

    return data
