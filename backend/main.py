import os
import asyncio
import random
import pandas as pd
import threading
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from data_generator import STOCKS_METADATA, generate_intraday_data
from data_engine import calculate_indicators
from scoring_engine import MasterScoringEngine
from yfinance_engine import run_full_sync
from agents.btst_engine import calculate_btst_metrics
from futures_income_engine import FuturesIncomeEngine
from nifty250_scanner import get_nifty250_multibaggers, perform_nifty250_scan
from market_service import (
    get_live_market_data, 
    get_market_hours_status,
    get_all_live_stocks,
    get_live_stock_quote,
    fetch_single_stock_quote,
    VERIFIED_NSE_STOCK_FALLBACKS,
    NSE_STOCK_TICKERS
)

# BTST cache variables
BTST_CACHE = None
BTST_CACHE_TIME = 0.0
BTST_CACHE_TTL = 30.0  # 30 seconds
BTST_CACHE_LOCK = threading.Lock()


app = FastAPI(title="VanguardScore Backend API")

# Enable CORS for Next.js frontend and production deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://vanguard-stocks-frontend.vercel.app",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "*",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "VanguardScore Backend API",
        "version": "1.0.0",
        "endpoints": [
            "/api/market-status",
            "/api/stocks",
            "/api/btst",
            "/api/futures-income/opportunities",
            "/api/futures/contracts",
            "/api/futures/contract/{ticker}",
            "/api/short-term-picks",
            "/api/multibagger-picks",
            "/api/health",
            "/api/paper-trading/users",
            "/api/paper-trading/account",
            "/api/paper-trading/futures/order",
            "/api/paper-trading/futures/close",
            "/api/watchlist"
        ]
    }

@app.get("/health")
@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BACKEND_DIR, "data")
ROOT_DATA_DIR = os.path.join(os.path.dirname(BACKEND_DIR), "data")
if not os.path.exists(DATA_DIR) and os.path.exists(ROOT_DATA_DIR):
    DATA_DIR = ROOT_DATA_DIR
engine = MasterScoringEngine()

# Thread locks for each ticker to coordinate concurrent calculations
TICKER_LOCKS = {}
TICKER_LOCKS_LOCK = threading.Lock()

def get_ticker_lock(ticker: str) -> threading.Lock:
    with TICKER_LOCKS_LOCK:
        if ticker not in TICKER_LOCKS:
            TICKER_LOCKS[ticker] = threading.Lock()
        return TICKER_LOCKS[ticker]

# Shared DataFrames cache to avoid redundant CSV reads
_SHARED_DF_CACHE = {}
_SHARED_DF_CACHE_LOCK = threading.Lock()

def read_shared_csv(filepath: str) -> pd.DataFrame:
    mtime = os.path.getmtime(filepath)
    with _SHARED_DF_CACHE_LOCK:
        cached = _SHARED_DF_CACHE.get(filepath)
        if cached and cached[0] == mtime:
            return cached[1].copy()
    
    df = pd.read_csv(filepath)
    with _SHARED_DF_CACHE_LOCK:
        _SHARED_DF_CACHE[filepath] = (mtime, df)
    return df.copy()

# Simulated state that the user can override via endpoints for demonstration
mock_overrides = {
    "IndiaVIX": None,
    "NASDAQ_5d_ret": None,
    "S&P500_5d_ret": None
}

# In-memory cache for live yfinance prices: ticker -> (timestamp, last_price, volume, prev_close)
LIVE_PRICE_CACHE = {}
LIVE_PRICE_CACHE_TTL = 30.0
LAST_LIVE_SYNC_TIME = 0.0

# In-memory cache for stock analysis results to prevent CPU bottleneck (30s TTL)
ANALYSIS_CACHE = {}
ANALYSIS_CACHE_TTL = 30.0

def fetch_live_market_data():
    """
    Fast batch updater: queries current live prices & day performance from Yahoo Finance
    for all tickers and key indices, updating LIVE_PRICE_CACHE and market status.
    """
    global LAST_LIVE_SYNC_TIME
    import time
    import yfinance as yf
    
    symbols_map = {}
    for ticker in STOCKS_METADATA.keys():
        if ticker == "INFYS": s = "INFY.NS"
        elif ticker == "TATAMOTORS": s = "TMPV.NS"
        elif ticker == "MM": s = "M&M.NS"
        elif ticker == "BAJAJ_AUTO": s = "BAJAJ-AUTO.NS"
        else: s = f"{ticker}.NS"
        symbols_map[s] = ticker
    
    # Also include major indices
    symbols_map["^NSEI"] = "^NSEI"
    symbols_map["^INDIAVIX"] = "^INDIAVIX"
    symbols_map["^GSPC"] = "^GSPC"
    symbols_map["^IXIC"] = "^IXIC"

    sym_list = list(symbols_map.keys())
    now = time.time()
    try:
        data = yf.download(sym_list, period="2d", progress=False)
        if not data.empty and "Close" in data:
            closes = data["Close"]
            volumes = data["Volume"] if "Volume" in data else None
            for sym, ticker in symbols_map.items():
                if sym in closes.columns:
                    series = closes[sym].dropna()
                    if len(series) >= 1:
                        last_price = float(series.iloc[-1])
                        prev_price = float(series.iloc[-2]) if len(series) >= 2 else last_price
                        vol = float(volumes[sym].dropna().iloc[-1]) if volumes is not None and sym in volumes.columns and len(volumes[sym].dropna()) > 0 else 0.0
                        LIVE_PRICE_CACHE[ticker] = (now, last_price, vol, prev_price)
            LAST_LIVE_SYNC_TIME = now
            print(f"Updated live prices for {len(LIVE_PRICE_CACHE)} tickers/indices.")
    except Exception as e:
        print(f"Error updating live batch market data: {e}")

def load_data_for_ticker(ticker: str, force_live: bool = False, calculate_inds: bool = True) -> Dict[str, pd.DataFrame]:
    """
    Loads daily stock, sector, macro, and news data.
    Applies overrides to simulate different market regimes.
    Integrates actual live prices from NSE/Yahoo Finance.
    """
    stock_daily = pd.read_csv(os.path.join(DATA_DIR, f"{ticker}_daily.csv"))
    nifty_sectors = read_shared_csv(os.path.join(DATA_DIR, "nifty_sectors.csv"))
    macro_indices = read_shared_csv(os.path.join(DATA_DIR, "macro_indices.csv"))
    news_feed = read_shared_csv(os.path.join(DATA_DIR, "news_feed.csv"))
    
    import time
    import numpy as np
    now = time.time()
    cached_entry = LIVE_PRICE_CACHE.get(ticker)
    
    live_price = None
    live_volume = None
    live_open = None
    live_high = None
    live_low = None

    # 1. Integrate live verified NSE stock price
    try:
        quote = get_live_stock_quote(ticker)
        if quote and quote.get("price"):
            live_price = float(quote["price"])
            if quote.get("high"):
                live_high = max(float(quote["high"]), live_price)
            if quote.get("low"):
                live_low = min(float(quote["low"]), live_price)
            if quote.get("open"):
                live_open = float(quote["open"])
            if quote.get("volume"):
                live_volume = float(quote["volume"])
    except Exception as e:
        pass

    # 2. Check live price cache or force_live yfinance fallback
    if live_price is None:
        if cached_entry and (now - cached_entry[0] < LIVE_PRICE_CACHE_TTL):
            live_price, live_volume = cached_entry[1], cached_entry[2]
        elif force_live:
            yf_symbol = f"{ticker}.NS"
            if ticker == "INFYS": yf_symbol = "INFY.NS"
            elif ticker == "TATAMOTORS": yf_symbol = "TMPV.NS"
            elif ticker == "MM": yf_symbol = "M&M.NS"
            elif ticker == "BAJAJ_AUTO": yf_symbol = "BAJAJ-AUTO.NS"
            try:
                import yfinance as yf
                t = yf.Ticker(yf_symbol)
                info_dict = dict(t.fast_info)
                live_price = info_dict.get("lastPrice") or info_dict.get("last_price") or info_dict.get("close")
                live_volume = info_dict.get("lastVolume") or info_dict.get("last_volume") or info_dict.get("volume")
                prev_close = info_dict.get("previousClose") or live_price
                if live_price is not None and not np.isnan(live_price):
                    LIVE_PRICE_CACHE[ticker] = (now, float(live_price), float(live_volume) if live_volume else 0.0, float(prev_close))
            except Exception as e:
                if cached_entry:
                    live_price, live_volume = cached_entry[1], cached_entry[2]
        elif cached_entry:
            live_price, live_volume = cached_entry[1], cached_entry[2]

    # Update daily stock dataframe with live price data
    if live_price is not None and not np.isnan(live_price):
        today_str = pd.Timestamp.now().strftime("%Y-%m-%d")
        last_date_str = str(stock_daily["Date"].iloc[-1])
        if last_date_str != today_str:
            new_row = stock_daily.iloc[-1].copy()
            new_row["Date"] = today_str
            new_row["Close"] = live_price
            if live_open is not None: new_row["Open"] = live_open
            if live_high is not None: new_row["High"] = live_high
            if live_low is not None: new_row["Low"] = live_low
            if live_volume is not None and not np.isnan(live_volume):
                new_row["Volume"] = live_volume
            stock_daily = pd.concat([stock_daily, pd.DataFrame([new_row])], ignore_index=True)
        else:
            latest_idx = stock_daily.index[-1]
            stock_daily.loc[latest_idx, "Close"] = live_price
            if live_open is not None: stock_daily.loc[latest_idx, "Open"] = live_open
            if live_high is not None: stock_daily.loc[latest_idx, "High"] = live_high
            if live_low is not None: stock_daily.loc[latest_idx, "Low"] = live_low
            if live_volume is not None and not np.isnan(live_volume):
                stock_daily.loc[latest_idx, "Volume"] = live_volume

    # Sync latest live NIFTY and Macro indices if available
    try:
        live_mkt = get_live_market_data()
        if not nifty_sectors.empty and "Nifty50" in nifty_sectors.columns and live_mkt.get("nifty_close"):
            nifty_sectors.loc[nifty_sectors.index[-1], "Nifty50"] = live_mkt["nifty_close"]
        if not macro_indices.empty:
            if "IndiaVIX" in macro_indices.columns and live_mkt.get("vix"):
                macro_indices.loc[macro_indices.index[-1], "IndiaVIX"] = live_mkt["vix"]
            if "NASDAQ" in macro_indices.columns and live_mkt.get("nasdaq"):
                macro_indices.loc[macro_indices.index[-1], "NASDAQ"] = live_mkt["nasdaq"]
            if "SP500" in macro_indices.columns and live_mkt.get("sp500"):
                macro_indices.loc[macro_indices.index[-1], "SP500"] = live_mkt["sp500"]
            if "DXY" in macro_indices.columns and live_mkt.get("dxy"):
                macro_indices.loc[macro_indices.index[-1], "DXY"] = live_mkt["dxy"]
            if "US10Y" in macro_indices.columns and live_mkt.get("us10y"):
                macro_indices.loc[macro_indices.index[-1], "US10Y"] = live_mkt["us10y"]
    except Exception as e:
        pass
    
    # Apply mocks if overridden
    if mock_overrides["IndiaVIX"] is not None:
        macro_indices.loc[macro_indices.index[-1], "IndiaVIX"] = mock_overrides["IndiaVIX"]
    if mock_overrides["NASDAQ_5d_ret"] is not None:
        idx_now = macro_indices.index[-1]
        idx_prev = macro_indices.index[-6]
        macro_indices.loc[idx_now, "NASDAQ"] = macro_indices.loc[idx_prev, "NASDAQ"] * (1 + mock_overrides["NASDAQ_5d_ret"])
        
    # Calculate indicators on the stock daily dataframe
    if calculate_inds:
        stock_daily = calculate_indicators(stock_daily)
    
    return {
        "stock_daily": stock_daily,
        "nifty_sectors": nifty_sectors,
        "macro_indices": macro_indices,
        "news_feed": news_feed
    }

class OverrideRequest(BaseModel):
    vix: float = None
    nasdaq_ret: float = None

class NewsTriggerRequest(BaseModel):
    ticker: str
    headline: str
    sentiment: float # -1.0 to 1.0
    url: str = None

@app.post("/api/admin/override")
def apply_override(req: OverrideRequest):
    """
    Dynamically overrides India VIX or Nasdaq return to trigger different market regimes.
    """
    ANALYSIS_CACHE.clear()
    if req.vix is not None:
        mock_overrides["IndiaVIX"] = req.vix
    if req.nasdaq_ret is not None:
        mock_overrides["NASDAQ_5d_ret"] = req.nasdaq_ret
    return {"status": "success", "overrides": mock_overrides}

@app.post("/api/admin/reset-override")
def reset_override():
    ANALYSIS_CACHE.clear()
    mock_overrides["IndiaVIX"] = None
    mock_overrides["NASDAQ_5d_ret"] = None
    return {"status": "success", "overrides": mock_overrides}

def prewarm_analysis_cache():
    import time
    print("Pre-warming stock analysis cache in background...")
    start = time.time()
    for ticker in STOCKS_METADATA.keys():
        try:
            lock = get_ticker_lock(ticker)
            with lock:
                cached_entry = ANALYSIS_CACHE.get(ticker)
                if not cached_entry or (time.time() - cached_entry[0] >= 300):
                    data = load_data_for_ticker(ticker, calculate_inds=True)
                    analysis = engine.analyze_stock(ticker, data)
                    
                    stock_df = data["stock_daily"]
                    close_now = float(stock_df["Close"].iloc[-1])
                    close_prev = float(stock_df["Close"].iloc[-2])
                    chg_pct = float((close_now - close_prev) / close_prev * 100)
                    
                    ANALYSIS_CACHE[ticker] = (time.time(), analysis, close_now, chg_pct)
        except Exception as e:
            print(f"Error pre-warming cache for {ticker}: {e}")
    print(f"Stock analysis cache pre-warmed in {time.time() - start:.1f} seconds.")

@app.on_event("startup")
def startup_event():
    """
    Triggers an initial sync with Yahoo Finance and warms the analysis cache in the background on startup.
    Runs recurring hourly full synchronization and live price updater.
    """
    import threading
    import time
    def background_task():
        try:
            fetch_live_market_data()
        except Exception as e:
            print(f"Startup live market fetch error: {e}")
        try:
            run_full_sync("1y")
        except Exception as e:
            print(f"Startup sync error: {e}")
        try:
            prewarm_analysis_cache()
        except Exception as e:
            print(f"Startup cache warming error: {e}")
        try:
            perform_nifty250_scan()
        except Exception as e:
            print(f"Startup Nifty 250 scanning error: {e}")

    print("Application startup: spawning background sync and analysis pre-warming task...")
    threading.Thread(target=background_task, daemon=True).start()

    # Recurring hourly full synchronization
    def hourly_sync_worker():
        while True:
            try:
                time.sleep(3600)  # Every 1 hour
                print("Running scheduled hourly market sync...")
                run_full_sync("1y", force=True)
                ANALYSIS_CACHE.clear()
                fetch_live_market_data()
            except Exception as e:
                print(f"Hourly sync error: {e}")

    threading.Thread(target=hourly_sync_worker, daemon=True).start()

    # Recurring 30-second live price tick poller
    def live_tick_worker():
        while True:
            try:
                time.sleep(30)
                fetch_live_market_data()
            except Exception as e:
                print(f"Live tick worker error: {e}")

    threading.Thread(target=live_tick_worker, daemon=True).start()

@app.post("/api/market/sync-live")
def trigger_live_sync():
    """
    On-demand user trigger: immediately fetches live prices from Yahoo Finance,
    clears analysis cache, and updates market status.
    """
    ANALYSIS_CACHE.clear()
    fetch_live_market_data()
    return {
        "status": "success",
        "message": "Live market data successfully refreshed",
        "synced_stocks": len(LIVE_PRICE_CACHE),
        "timestamp": LAST_LIVE_SYNC_TIME
    }

@app.post("/api/admin/sync")
def trigger_sync():
    """
    Manually triggers Yahoo Finance synchronization in the background.
    """
    import threading
    ANALYSIS_CACHE.clear()
    print("Manual API trigger: spawning background Yahoo Finance synchronization task...")
    threading.Thread(target=run_full_sync, args=("1y", True), daemon=True).start()
    return {"status": "success", "message": "Yahoo Finance synchronization started in background"}


@app.post("/api/admin/inject-news")
def inject_news(req: NewsTriggerRequest):
    """
    Injects custom headlines dynamically into the news feed.
    """
    ANALYSIS_CACHE.clear()
    news_file = os.path.join(DATA_DIR, "news_feed.csv")
    if os.path.exists(news_file):
        df = pd.read_csv(news_file)
        new_row = pd.DataFrame([{
            "Date": pd.Timestamp.now().strftime("%Y-%m-%d"),
            "Ticker": req.ticker,
            "Headline": f"{req.ticker}: {req.headline}",
            "SentimentScore": req.sentiment,
            "URL": req.url or (f"https://finance.yahoo.com/quote/{req.ticker}" if req.ticker != "MACRO" else "https://finance.yahoo.com/news")
        }])
        df = pd.concat([new_row, df], ignore_index=True)
        df.to_csv(news_file, index=False)
        return {"status": "success", "injected": req.headline}
    return {"status": "error", "message": "News feed CSV not found"}

@app.get("/api/market-status")
def get_market_status(response: Response = None):
    """
    Returns live index performance, VIX, regime details, and market hours status.
    Uses Yahoo Finance live feed with fallback and cache revalidation headers.
    """
    # 1. Fetch live market data (with cache)
    live_data = get_live_market_data()
    
    # Overlay live quotes from cache if present and newer
    if "^NSEI" in LIVE_PRICE_CACHE:
        entry = LIVE_PRICE_CACHE["^NSEI"]
        live_data["nifty_close"] = float(entry[1])
        if len(entry) > 3 and entry[3] > 0:
            live_data["nifty_change"] = float((entry[1] - entry[3]) / entry[3] * 100)
    if "^INDIAVIX" in LIVE_PRICE_CACHE:
        live_data["vix"] = float(LIVE_PRICE_CACHE["^INDIAVIX"][1])
    if "^GSPC" in LIVE_PRICE_CACHE:
        live_data["sp500"] = float(LIVE_PRICE_CACHE["^GSPC"][1])
    if "^IXIC" in LIVE_PRICE_CACHE:
        live_data["nasdaq"] = float(LIVE_PRICE_CACHE["^IXIC"][1])

    # 2. Check for manual regime simulation overrides
    effective_vix = mock_overrides["IndiaVIX"] if mock_overrides["IndiaVIX"] is not None else live_data["vix"]
    effective_nasdaq = live_data["nasdaq"]
    if mock_overrides["NASDAQ_5d_ret"] is not None:
        effective_nasdaq = live_data["nasdaq"] * (1 + mock_overrides["NASDAQ_5d_ret"])
        
    # 3. Determine regime based on live or simulated conditions
    regime = "SIDEWAYS"
    reasoning = []
    
    if effective_vix > 28.0:
        regime = "HIGH_VOLATILITY"
        reasoning.append(f"Extreme volatility spike: India VIX elevated at {effective_vix:.1f}. High option premia and tail risk.")
    elif effective_vix > 22.0 or (mock_overrides["NASDAQ_5d_ret"] is not None and mock_overrides["NASDAQ_5d_ret"] < -0.03):
        regime = "BEAR"
        reasoning.append(f"Bearish pressure: Elevated volatility ({effective_vix:.1f}) and tech headwind.")
    elif live_data["nifty_change"] > 0.5 and effective_vix < 18.0:
        regime = "BULL"
        reasoning.append(f"Bull market: NIFTY 50 gaining (+{live_data['nifty_change']:.2f}%) with calm volatility (VIX: {effective_vix:.1f}).")
    elif live_data["nifty_change"] < -0.5:
        regime = "BEAR"
        reasoning.append(f"Market weakness: NIFTY 50 declining ({live_data['nifty_change']:.2f}%). Defensive stance advised.")
    else:
        regime = "SIDEWAYS"
        reasoning.append(f"Range-bound market: NIFTY 50 hovering at {live_data['nifty_close']:,.1f} with moderate VIX ({effective_vix:.1f}).")

    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

    result = dict(live_data)
    result["vix"] = float(effective_vix)
    result["nasdaq"] = float(effective_nasdaq)
    result["regime"] = regime
    result["reasoning"] = reasoning
    result["last_synced"] = LAST_LIVE_SYNC_TIME
    return result

@app.get("/api/stocks")
def list_stocks(response: Response = None):
    """
    Returns all 50 Nifty stocks with official NSE live/last-session prices,
    indicators, master scores and recommendations.
    """
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    import time
    now = time.time()

    # Fetch all live stock quotes in parallel (cached)
    live_stock_data = get_all_live_stocks()
    stock_quotes = live_stock_data.get("quotes", {})
    live_timestamp = live_stock_data.get("last_updated")
    is_open = live_stock_data.get("is_market_open", False)

    # Nifty 50 representative index weights
    nifty50_weights_mapping = {
        "RELIANCE": 9.2, "TCS": 5.8, "HDFCBANK": 12.1, "INFYS": 4.8,
        "ICICIBANK": 8.4, "SBIN": 2.9, "ITC": 3.2, "HINDUNILVR": 2.8,
        "TATAMOTORS": 2.1, "MARUTI": 2.5, "DRREDDY": 1.8, "SUNPHARMA": 2.4,
        "WIPRO": 1.8, "HCLTECH": 2.5, "TITAN": 1.5, "TATASTEEL": 1.6,
        "BAJFINANCE": 3.2, "AXISBANK": 3.1, "KOTAKBANK": 4.1, "BHARTIARTL": 2.8
    }

    results = []
    for ticker, meta in STOCKS_METADATA.items():
        try:
            quote = stock_quotes.get(ticker) or get_live_stock_quote(ticker)

            # Check cache first with lock for scoring calculations
            lock = get_ticker_lock(ticker)
            with lock:
                cached_entry = ANALYSIS_CACHE.get(ticker)
                if cached_entry and (now - cached_entry[0] < ANALYSIS_CACHE_TTL):
                    _, analysis, _, _ = cached_entry
                else:
                    # Cache miss: load with live price indicators and run analysis
                    data = load_data_for_ticker(ticker, calculate_inds=True)
                    analysis = engine.analyze_stock(ticker, data)
                    ANALYSIS_CACHE[ticker] = (now, analysis, 0, 0)
            
            # Extract verified prices from official NSE quote or LIVE_PRICE_CACHE
            if quote and quote.get("price"):
                price_val = float(quote["price"])
                prev_close_val = float(quote.get("prev_close") or price_val)
                chg_pct_val = float(quote["change_pct"]) if quote.get("change_pct") is not None else ((price_val - prev_close_val) / prev_close_val * 100)
                high_val = float(quote.get("high") or price_val)
                low_val = float(quote.get("low") or price_val)
                open_val = float(quote.get("open") or price_val)
                quote_source = quote.get("source", "nse_official")
            elif ticker in LIVE_PRICE_CACHE:
                cached_live = LIVE_PRICE_CACHE[ticker]
                price_val = float(cached_live[1])
                prev_close_val = float(cached_live[3]) if len(cached_live) > 3 and cached_live[3] > 0 else price_val
                chg_pct_val = float((price_val - prev_close_val) / prev_close_val * 100) if prev_close_val > 0 else 0.0
                high_val = price_val
                low_val = price_val
                open_val = price_val
                quote_source = "live_sync"
            else:
                hist_data = load_data_for_ticker(ticker, calculate_inds=False)
                stock_df = hist_data["stock_daily"]
                price_val = float(stock_df["Close"].iloc[-1])
                prev_close_val = float(stock_df["Close"].iloc[-2]) if len(stock_df) > 1 else price_val
                chg_pct_val = float((price_val - prev_close_val) / prev_close_val * 100.0) if prev_close_val > 0 else 0.0
                high_val = float(stock_df["High"].iloc[-1])
                low_val = float(stock_df["Low"].iloc[-1])
                open_val = float(stock_df["Open"].iloc[-1])
                quote_source = "historical_daily"
            # Get ML Agent probabilities
            ml_agent = analysis.get("agents", {}).get("ML Prediction Agent", {})
            ml_metrics = ml_agent.get("metrics", {})
            prob_up = round(ml_metrics.get("prob_up", 0.0) * 100, 1)
            prob_down = round(ml_metrics.get("prob_down", 0.0) * 100, 1)
            prob_flat = round(ml_metrics.get("prob_flat", 0.0) * 100, 1)

            prob_up_1w = round(ml_metrics.get("prob_up_1w", 0.0) * 100, 1)
            prob_down_1w = round(ml_metrics.get("prob_down_1w", 0.0) * 100, 1)
            prob_flat_1w = round(ml_metrics.get("prob_flat_1w", 0.0) * 100, 1)

            weight = nifty50_weights_mapping.get(ticker, 1.0)

            results.append({
                "ticker": ticker,
                "sector": meta["sector"],
                "market_cap": meta.get("market_cap", "large"),
                "price": round(float(price_val), 2),
                "prev_close": round(float(prev_close_val), 2),
                "change_pct": round(float(chg_pct_val), 2),
                "day_high": round(float(high_val), 2),
                "day_low": round(float(low_val), 2),
                "day_open": round(float(open_val), 2),
                "master_score": analysis["master_score"],
                "recommendation": analysis["recommendation"],
                "prob_up": prob_up,
                "prob_down": prob_down,
                "prob_flat": prob_flat,
                "prob_up_1w": prob_up_1w,
                "prob_down_1w": prob_down_1w,
                "prob_flat_1w": prob_flat_1w,
                "weight": weight,
                "last_updated": live_timestamp,
                "source": quote_source,
                "is_market_open": is_open
            })
        except Exception as e:
            print(f"Error loading {ticker}: {str(e)}")
            
    # Rank by master score descending
    results = sorted(results, key=lambda x: x["master_score"], reverse=True)
    return results

@app.get("/api/btst")
def get_btst_opportunities():
    """
    Scans all 50 Nifty stocks, calculates BTST metrics and returns Top Opportunities and Scanner buckets.
    """
    global BTST_CACHE, BTST_CACHE_TIME
    import time
    now = time.time()
    
    with BTST_CACHE_LOCK:
        if BTST_CACHE and (now - BTST_CACHE_TIME < BTST_CACHE_TTL):
            return BTST_CACHE
            
    # Calculate for all stocks
    all_btst = []
    for ticker, meta in STOCKS_METADATA.items():
        try:
            # We don't need force_live=True for all stocks to save time; use standard daily data
            data = load_data_for_ticker(ticker, force_live=False, calculate_inds=False)
            metrics = calculate_btst_metrics(ticker, data, meta["sector"])
            if metrics:
                metrics["market_cap"] = meta.get("market_cap", "large")
                all_btst.append(metrics)
        except Exception as e:
            print(f"Error calculating BTST for {ticker}: {e}")
            
    # Sort all by btst_score descending
    all_btst = sorted(all_btst, key=lambda x: x["btst_score"], reverse=True)
    
    # Construct scanner categories
    top_picks = all_btst[:10]
    
    # 1. Long Build-Up Scanner (Price Up, OI Up)
    long_buildup = [x for x in all_btst if x["oi_type"] == "Long Build-Up"]
    
    # 2. Breakout Scanner (Closing at 20d high or 50d high)
    breakouts = [x for x in all_btst if x["is_20d_high"] or x["is_50d_high"]]
    
    # 3. High Delivery Scanner (Delivery > 55%)
    high_delivery = [x for x in all_btst if x["delivery_pct"] > 55.0]
    
    # 4. Gap-Up Probability (Sorted by prob_gap_up descending)
    gap_up_probs = sorted(all_btst, key=lambda x: x["prob_gap_up"], reverse=True)
    
    # 5. Historical Pattern Match (Sorted by prob_positive_close descending)
    pattern_matches = sorted(all_btst, key=lambda x: x["prob_positive_close"], reverse=True)
    
    # 6. Tomorrow's Risk Events (Find stocks with event risk)
    risk_events = []
    for x in all_btst:
        events = []
        if x["ticker"] in ["RELIANCE", "HDFCBANK", "TCS"]:
            events.append("Board meeting tomorrow for capital restructuring review")
        if x["ticker"] in ["SBIN", "ICICIBANK"]:
            events.append("RBI interest rate decision overnight impact")
        if x["ticker"] in ["TATAMOTORS", "BAJAJ_AUTO"]:
            events.append("Monthly industry volume sales registration report release")
            
        if events:
            risk_events.append({
                "ticker": x["ticker"],
                "sector": x["sector"],
                "score": x["btst_score"],
                "events": events
            })
            
    response_data = {
        "all": all_btst,
        "top_picks": top_picks,
        "long_buildup": long_buildup,
        "breakouts": breakouts,
        "high_delivery": high_delivery,
        "gap_up_probs": gap_up_probs[:10],
        "pattern_matches": pattern_matches[:10],
        "risk_events": risk_events
    }
    
    with BTST_CACHE_LOCK:
        BTST_CACHE = response_data
        BTST_CACHE_TIME = now
        
    return response_data

@app.get("/api/short-term-picks")
def get_short_term_picks():
    """
    Scans all 50 stocks, fetches their short-term (BTST + Master) scores,
    and returns those with BUY / STRONG BUY recommendations,
    grouped by market cap (Large, Mid, Small).
    """
    import time
    now = time.time()
    
    # We call get_btst_opportunities() which uses caching
    btst_data = get_btst_opportunities()
    
    categories = {
        "large_cap": [],
        "mid_cap": [],
        "small_cap": []
    }
    
    for stock in btst_data["all"]:
        ticker = stock["ticker"]
        meta = STOCKS_METADATA.get(ticker, {})
        cap = meta.get("market_cap", "large")
        
        lock = get_ticker_lock(ticker)
        with lock:
            cached_entry = ANALYSIS_CACHE.get(ticker)
            if cached_entry and (now - cached_entry[0] < ANALYSIS_CACHE_TTL):
                _, analysis, _, _ = cached_entry
            else:
                data = load_data_for_ticker(ticker, force_live=False, calculate_inds=True)
                analysis = engine.analyze_stock(ticker, data)
                stock_df = data["stock_daily"]
                close_now = float(stock_df["Close"].iloc[-1])
                close_prev = float(stock_df["Close"].iloc[-2])
                chg_pct = float((close_now - close_prev) / close_prev * 100)
                ANALYSIS_CACHE[ticker] = (now, analysis, close_now, chg_pct)
        
        master_score = analysis.get("master_score", 50.0)
        btst_score = stock.get("btst_score", 50.0)
        
        ml_agent = analysis.get("agents", {}).get("ML Prediction Agent", {})
        ml_metrics = ml_agent.get("metrics", {})
        prob_up_1w = round(ml_metrics.get("prob_up_1w", 0.5) * 100, 1)
        
        # Combined short-term alpha score: 70% BTST score + 30% 1-Week ML upward probability
        short_term_score = round(0.7 * btst_score + 0.3 * prob_up_1w, 1)
        
        pick_info = {
            "ticker": ticker,
            "sector": stock["sector"],
            "price": stock["price"],
            "change_pct": round(float(stock.get("change_pct", 0.0) if "change_pct" in stock else analysis.get("change_pct", 0.0)), 2),
            "btst_score": btst_score,
            "master_score": master_score,
            "short_term_score": short_term_score,
            "prob_up_1w": prob_up_1w,
            "prob_positive_close": stock["prob_positive_close"],
            "prob_gap_up": stock["prob_gap_up"],
            "expected_move": stock["expected_move"],
            "recommendation": "Strong Buy" if short_term_score >= 80.0 else "Buy" if short_term_score >= 68.0 else "Hold",
            "stop_loss": analysis.get("stop_loss", 4.0),
            "target": analysis.get("target", 10.0),
            "risk_level": stock["risk"],
            "explanations": stock["explanations"],
            "technical_score": int(round(analysis.get("technical_score", 50))),
            "fundamental_score": int(round(analysis.get("fundamental_score", 50))),
            "sentiment_score": int(round(analysis.get("sentiment_score", 50)))
        }
        
        if cap == "large":
            categories["large_cap"].append(pick_info)
        elif cap == "mid":
            categories["mid_cap"].append(pick_info)
        elif cap == "small":
            categories["small_cap"].append(pick_info)
            
    # Sort each category by short_term_score descending and return the top 10
    for key in categories:
        categories[key] = sorted(categories[key], key=lambda x: x["short_term_score"], reverse=True)[:10]
        
    return categories


@app.get("/api/multibagger-picks")
def get_multibagger_picks():
    """
    Returns Nifty 250 stocks, computed using the MBX Score and Opportunity Score,
    categorized by market cap.
    """
    res = get_nifty250_multibaggers()
    if not res.get("all"):
        print("Cache cold for Nifty 250, spawning background scanner thread...")
        threading.Thread(target=perform_nifty250_scan, daemon=True).start()
    return res


@app.get("/api/stocks/{ticker}")
def get_stock_detail(ticker: str, response: Response = None):
    """
    Returns full scorecard metrics, dynamic weightings, and agent reasonings with verified NSE quotes.
    """
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

    import time
    ticker = ticker.upper()
    if ticker not in STOCKS_METADATA:
        return {"error": "Ticker not found"}
        
    quote = get_live_stock_quote(ticker)
    data = load_data_for_ticker(ticker, force_live=True)
    
    now = time.time()
    lock = get_ticker_lock(ticker)
    with lock:
        cached_entry = ANALYSIS_CACHE.get(ticker)
        if cached_entry and (now - cached_entry[0] < ANALYSIS_CACHE_TTL):
            analysis = cached_entry[1]
        else:
            analysis = engine.analyze_stock(ticker, data)
            ANALYSIS_CACHE[ticker] = (now, analysis, 0, 0)
    
    analysis_copy = dict(analysis)
    analysis_copy["fundamentals_meta"] = STOCKS_METADATA[ticker]
    if quote and quote.get("price"):
        analysis_copy["spot_price"] = quote["price"]
        analysis_copy["price"] = quote["price"]
        analysis_copy["prev_close"] = quote.get("prev_close", quote["price"])
        analysis_copy["day_high"] = quote.get("high", quote["price"])
        analysis_copy["day_low"] = quote.get("low", quote["price"])
        analysis_copy["change_pct"] = quote["change_pct"] if quote.get("change_pct") is not None else 0.0
        analysis_copy["source"] = quote.get("source", "nse_official")
    return analysis_copy

@app.get("/api/stocks/{ticker}/chart")
def get_stock_chart(ticker: str, interval: str = Query("1d"), response: Response = None):
    """
    Returns chart data for selected stock and interval.
    1d: reads 365 days daily data.
    1h, 15m: generates intraday on-the-fly for the last 30 days.
    """
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

    import numpy as np
    ticker = ticker.upper()
    if ticker not in STOCKS_METADATA:
        return {"error": "Ticker not found"}
        
    if interval == "1d":
        data = load_data_for_ticker(ticker, force_live=True)
        df = data["stock_daily"].tail(365).copy()
        
        # Calculate historical Put-Call Ratio (OptionsPCR) on-the-fly
        closes = df["Close"].values
        opens = df["Open"].values
        ois = df["FuturesOI"].values
        pcrs = []
        for i in range(len(df)):
            close_now = closes[i]
            open_now = opens[i]
            oi_now = ois[i]
            # Use 5-day lookback for price change
            prev_idx = max(0, i-5)
            price_change_pct = (close_now - opens[prev_idx]) / opens[prev_idx] * 100
            np.random.seed(int(close_now) + int(oi_now) % 1000)
            pcr = 1.0 + 0.5 * (price_change_pct / 100.0) + np.random.normal(0, 0.1)
            pcr = np.clip(pcr, 0.4, 2.0)
            pcrs.append(pcr)
        df["OptionsPCR"] = pcrs
        
        # Format dates
        df["FormattedDate"] = df["Date"]
    else:
        # Intraday hourly or 15m
        df = generate_intraday_data(ticker, interval, days=15)
        # Calculate indicators on the intraday series as well
        df = calculate_indicators(df)
        df["FormattedDate"] = df["DateTime"]
        
        # Generate mock intraday OI and PCR matching the trend
        np.random.seed(42)
        closes = df["Close"].values
        pcrs = []
        ois = []
        base_oi = 1500000
        for i in range(len(df)):
            ret = (closes[i] - closes[0]) / closes[0]
            oi = int(base_oi * (1.0 + ret * 1.5 + np.random.normal(0, 0.005)))
            pcr = np.clip(1.0 + ret * 3.0 + np.random.normal(0, 0.05), 0.4, 2.0)
            ois.append(oi)
            pcrs.append(pcr)
        df["FuturesOI"] = ois
        df["OptionsPCR"] = pcrs
        df["DeliveryPct"] = np.clip(40.0 + np.random.normal(0, 5.0, len(df)), 15.0, 80.0)
        
    # Select columns to reduce payload
    cols = ["FormattedDate", "Open", "High", "Low", "Close", "Volume", 
            "EMA_20", "EMA_50", "EMA_200", "BB_Upper", "BB_Lower",
            "FuturesOI", "DeliveryPct", "OptionsPCR"]
    
    chart_data = df[cols].to_dict(orient="records")
    return chart_data


futures_engine = FuturesIncomeEngine()


@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    subscribed_ticker = "RELIANCE"
    
    try:
        while True:
            # Check for subscriptions
            try:
                # Set non-blocking check
                data = await asyncio.wait_for(websocket.receive_json(), timeout=0.1)
                if "subscribe" in data:
                    subscribed_ticker = data["subscribe"].upper()
                    print(f"WS client subscribed to {subscribed_ticker}")
            except asyncio.TimeoutError:
                pass # Normal timeout if no messages received
                
            # Perform live update & run agents with verified NSE quotes
            if subscribed_ticker in STOCKS_METADATA:
                quote = get_live_stock_quote(subscribed_ticker)
                stock_data = load_data_for_ticker(subscribed_ticker, force_live=True)
                opp = futures_engine.analyze_opportunity_master(subscribed_ticker, stock_data)
                
                real_price = float(quote["price"]) if (quote and quote.get("price")) else float(stock_data["stock_daily"]["Close"].iloc[-1])
                pct_change = float(quote["change_pct"]) if (quote and quote.get("change_pct") is not None) else 0.0
                prev_close = float(quote["prev_close"]) if (quote and quote.get("prev_close")) else real_price
                
                mkt_status = get_market_hours_status()
                is_open = mkt_status["is_market_open"]
                session_msg = mkt_status["market_session_message"]
                
                # Dynamic consensus stream reasoning items
                market_score = opp["agents"]["market_regime"]["score"]
                strength_score = opp["agents"]["futures_strength"]["score"]
                oi_score = opp["agents"]["oi_intelligence"]["score"]
                prem_score = opp["agents"]["premium_harvest"]["score"]
                smart_score = opp["agents"]["smart_money"]["score"]
                risk_penalty = opp["agents"]["event_risk"]["penalty"]
                
                candle_res = opp["agents"]["deep_candlestick"]
                candle_adjustment = candle_res["adjustment"]
                candle_details = candle_res["details"]
                
                trend_align = opp["agents"]["futures_strength"]["trend_alignment"]
                strategy_type = opp["recommendation"]["strategy_type"]
                
                if strategy_type == "covered_call":
                    rec_str = f"Buy {opp['recommendation']['future_contract']} + Sell {opp['recommendation']['option_contract']}"
                    rec_log = "Buy Futures + Sell OTM Call"
                else:
                    rec_str = f"Sell {opp['recommendation']['option_contract']}"
                    rec_log = "Sell OTM Call (Short Call)"
                
                status_prefix = f"[Live Market: {session_msg}]" if is_open else f"[{session_msg}] Official Closing Price"
                agent_logs = [
                    f"{status_prefix}: {subscribed_ticker} NSE LTP: ₹{real_price:.2f} ({pct_change:+.2f}%) | Prev Close: ₹{prev_close:.2f}",
                    f"[Market Regime Agent] Score: {market_score}/100. Regime: {opp['agents']['market_regime']['regime']}. India VIX: {opp['agents']['market_regime']['vix']:.1f}",
                    f"[Futures Strength Agent] Score: {strength_score}/100. Trend alignment is {opp['agents']['futures_strength']['trend_alignment']}",
                    f"[OI Intelligence Agent] Score: {oi_score}/100. Buildup: {opp['agents']['oi_intelligence']['buildup']}. PCR: {opp['agents']['oi_intelligence']['pcr']:.2f}",
                    f"[Premium Harvest Agent] Score: {prem_score}/100. Implied Volatility: {opp['agents']['premium_harvest']['iv']:.1f}%",
                    f"[Smart Money Agent] Score: {smart_score}/100. Delivery volume at {opp['agents']['smart_money']['delivery_pct']:.1f}%",
                    f"[Event Risk Agent] Penalty: {risk_penalty:.1f} pts. Major Events: {opp['agents']['event_risk']['details']}",
                    f"[Last Day Candle & Technicals] Adjustment: {candle_adjustment:+.1f} pts. Details: {candle_details}",
                    f"[Master Formula] Strategy Score calculated: {opp['strategy_score']}/100 -> Recommendation: {rec_log}"
                ]
                
                payload = {
                    "ticker": subscribed_ticker,
                    "simulated_price": round(real_price, 2),  # Maintained for frontend compatibility
                    "price": round(real_price, 2),
                    "prev_close": round(prev_close, 2),
                    "pct_change": round(pct_change, 2),
                    "master_score": opp["strategy_score"],
                    "strategy_score": opp["strategy_score"],
                    "recommendation": rec_str,
                    "strategy_type": strategy_type,
                    "future_contract": opp["recommendation"]["future_contract"],
                    "option_contract": opp["recommendation"]["option_contract"],
                    "expected_yield": opp["recommendation"]["expected_yield"],
                    "pop": opp["recommendation"]["pop"],
                    "market_regime": opp["agents"]["market_regime"]["regime"],
                    "agent_logs": agent_logs,
                    "is_market_open": is_open,
                    "source": quote.get("source", "nse_official") if quote else "nse_official"
                }
                
                await websocket.send_json(payload)
                
            await asyncio.sleep(2.5) # Update every 2.5 seconds
            
    except WebSocketDisconnect:
        print("WS client disconnected")
    except Exception as e:
        print(f"WS Exception: {str(e)}")


@app.get("/api/futures-income/opportunities")
def get_futures_opportunities():
    from futures_contracts import get_contract_spec
    results = []
    # Loop over all Nifty 50 stocks
    for ticker, meta in STOCKS_METADATA.items():
        try:
            data = load_data_for_ticker(ticker, calculate_inds=True)
            opp = futures_engine.analyze_opportunity_master(ticker, data)
            spec = opp.get("futures_contract_spec") or get_contract_spec(ticker, opp["spot_price"])
            results.append({
                "ticker": opp["ticker"],
                "sector": meta["sector"],
                "strategy_score": opp["strategy_score"],
                "pop": opp["recommendation"]["pop"],
                "expected_yield": opp["recommendation"]["expected_yield"],
                "price": opp["spot_price"],
                "futures_price": spec["futures_price"],
                "exchange": spec["exchange"],
                "expiry_date": spec["expiry_date"],
                "expiry_formatted": spec["expiry_formatted"],
                "lot_size": spec["lot_size"],
                "margin_per_lot": spec["margin_per_lot"],
                "future_contract": opp["recommendation"]["future_contract"],
                "option_contract": opp["recommendation"]["option_contract"],
                "expected_return": opp["recommendation"]["expected_return"],
                "strategy_type": opp["recommendation"]["strategy_type"]
            })
        except Exception as e:
            print(f"Error evaluating opportunities for {ticker}: {e}")
    # Rank by strategy score descending
    results = sorted(results, key=lambda x: x["strategy_score"], reverse=True)
    return results


@app.get("/api/futures/contracts")
def list_futures_contracts(response: Response = None):
    """Returns NSE Futures contract specs (lot sizes, dynamic expiry, futures price, margin) for all 50 NSE stocks."""
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    from futures_contracts import get_contract_spec, get_futures_config, get_nse_expiry_dates

    live_stock_data = get_all_live_stocks()
    quotes = live_stock_data.get("quotes", {})
    config = get_futures_config()
    expiries = get_nse_expiry_dates()

    contracts = []
    for ticker in sorted(STOCKS_METADATA.keys()):
        q = quotes.get(ticker) or get_live_stock_quote(ticker)
        spot = float(q["price"]) if (q and q.get("price")) else float(VERIFIED_NSE_STOCK_FALLBACKS.get(ticker, {}).get("price", 0.0))
        if spot <= 0:
            continue
        spec = get_contract_spec(ticker, spot)
        spec["sector"] = STOCKS_METADATA[ticker].get("sector", "Equities")
        contracts.append(spec)

    return {
        "exchange": config.get("exchange", "NSE"),
        "default_margin_pct": config.get("default_margin_pct", 0.05),
        "expiries": expiries,
        "contracts": contracts,
    }


@app.get("/api/futures/contract/{ticker}")
def get_single_futures_contract(
    ticker: str,
    lots: int = Query(1, ge=1),
    expiry_date: Optional[str] = Query(None),
    response: Response = None,
):
    """Returns exact NSE Futures contract spec, lot size math, required margin, and estimated trade value for ticker."""
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    from futures_contracts import get_contract_spec

    sym = ticker.upper().strip()
    if sym not in STOCKS_METADATA and sym not in VERIFIED_NSE_STOCK_FALLBACKS:
        raise HTTPException(status_code=404, detail=f"Futures contract for '{sym}' not found.")

    q = get_live_stock_quote(sym)
    spot = float(q["price"]) if (q and q.get("price")) else float(VERIFIED_NSE_STOCK_FALLBACKS.get(sym, {}).get("price", 0.0))
    if spot <= 0:
        raise HTTPException(status_code=400, detail=f"Unable to resolve live spot price for '{sym}'.")

    spec = get_contract_spec(sym, spot, expiry_date=expiry_date, lots=lots)
    spec["sector"] = STOCKS_METADATA.get(sym, {}).get("sector", "Equities")
    return spec


class FuturesConfigUpdateRequest(BaseModel):
    lot_sizes: Optional[Dict[str, int]] = None
    default_margin_pct: Optional[float] = None
    annual_carry_rate: Optional[float] = None


@app.post("/api/futures/contracts/config")
def configure_futures_contracts(req: FuturesConfigUpdateRequest, response: Response = None):
    """Allows updating configurable exchange Futures contract lot sizes & margin rules."""
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    from futures_contracts import update_futures_config
    try:
        updated = update_futures_config(
            lot_sizes=req.lot_sizes,
            default_margin_pct=req.default_margin_pct,
            annual_carry_rate=req.annual_carry_rate,
        )
        return {"success": True, "config": updated}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@app.get("/api/futures-income/detail/{ticker}")
def get_futures_detail(ticker: str):
    ticker = ticker.upper()
    if ticker not in STOCKS_METADATA:
        return {"error": "Ticker not found"}
    try:
        data = load_data_for_ticker(ticker, force_live=True, calculate_inds=True)
        opp = futures_engine.analyze_opportunity_master(ticker, data)
        return opp
    except Exception as e:
        return {"error": f"Error analyzing ticker {ticker}: {str(e)}"}


@app.get("/api/portfolio/generate")
def generate_portfolio(amount: float = 100000.0, style: str = "multibagger"):
    res = get_nifty250_multibaggers()
    all_stocks = res.get("all", [])
    
    # Fallback to simulated Nifty 50 picks if Nifty 250 cache is cold
    if not all_stocks:
        print("Cache cold, spawning Nifty 250 scanner in background...")
        threading.Thread(target=perform_nifty250_scan, daemon=True).start()
        # Fallback to verified tickers with live quotes if Nifty 250 cache is cold
        fallback_tickers = ["BEL", "HAL", "BHEL", "RVNL", "REC", "PFC", "CDSL", "HUDCO", "COFORGE", "LUPIN", "OBEROIRLTY", "ASIANPAINT", "TCS", "RELIANCE", "INFYS"]
        live_stock_data = get_all_live_stocks()
        quotes = live_stock_data.get("quotes", {})
        all_stocks = []
        for i, t in enumerate(fallback_tickers):
            q = quotes.get(t) or get_live_stock_quote(t)
            price_val = float(q["price"]) if (q and q.get("price")) else float(VERIFIED_NSE_STOCK_FALLBACKS.get(t, {}).get("price", 1000.0))
            prev_close_val = float(q["prev_close"]) if (q and q.get("prev_close")) else price_val
            chg_val = float(q["change_pct"]) if (q and q.get("change_pct") is not None) else round(((price_val - prev_close_val) / prev_close_val) * 100.0, 2)
            target_val = round(price_val * 1.25, 2)
            stop_val = round(price_val * 0.90, 2)
            meta = STOCKS_METADATA.get(t, {})
            all_stocks.append({
                "ticker": t,
                "sector": meta.get("sector") or ("Industrials" if t in ["BEL", "HAL", "BHEL", "RVNL"] else "Financial Services" if t in ["REC", "PFC", "CDSL", "HUDCO"] else "Technology" if t in ["COFORGE"] else "Healthcare" if t in ["LUPIN"] else "Real Estate" if t in ["OBEROIRLTY"] else "Consumer"),
                "market_cap": meta.get("market_cap") or ("large" if i < 5 else "mid" if i < 10 else "small"),
                "price": round(price_val, 2),
                "change_pct": round(chg_val, 2),
                "beta": 1.1,
                "multibagger_score": 85.0 - i * 1.5,
                "opportunity_score": 45.0 - i * 2.0,
                "catalyst_score": 25.0 - i * 0.5,
                "catalyst_text": "Strong upcoming order execution cycle.",
                "expected_3m_return": 35.0 - i * 1.0,
                "target_3m": target_val,
                "stop_loss": stop_val,
                "delivery_pct": 45.0,
                "rsi": 62.0,
                "growth_sum": 30.0,
                "roe_roce": 25.0,
                "debt_equity": 0.2,
                "score_breakdown": {
                    "Growth": 16.0, "Capital_Allocation": 12.0, "Moat": 10.0, "Tailwind": 12.0,
                    "Management": 8.0, "Smart_Money": 7.0, "Innovation": 4.0, "Technical": 4.0, "Valuation": 3.0
                },
                "probabilities": {"prob_2x": 65.0, "prob_3x": 45.0, "prob_5x": 22.0, "prob_10x": 6.0},
                "hidden_multibagger_checklist": {
                    "future_eps_growth_25": True, "revenue_acceleration_20": True, "roic_improving": True,
                    "free_cash_flow_positive": True, "debt_declining": True, "promoter_holding_stable": True,
                    "institutional_buying": True, "sector_in_uptrend": True, "technical_breakout": True,
                    "reasonable_valuation": True, "strong_upcoming_catalyst": True
                }
            })
            
    # Filter and sort by style
    style = style.lower()
    if style == "high_growth":
        candidates = sorted(all_stocks, key=lambda x: x.get("growth_sum", 20.0), reverse=True)
    elif style == "low_risk":
        candidates = sorted(all_stocks, key=lambda x: x.get("beta", 1.0))
    elif style == "dividend":
        candidates = sorted(all_stocks, key=lambda x: x.get("roe_roce", 15.0), reverse=True)
    elif style == "swing":
        candidates = sorted(all_stocks, key=lambda x: x.get("rsi", 50.0), reverse=True)
    elif style == "balanced":
        candidates = sorted(all_stocks, key=lambda x: (x.get("multibagger_score", 50.0) + x.get("roe_roce", 15.0) - x.get("beta", 1.1)*10.0), reverse=True)
    else:  # default is multibagger
        candidates = sorted(all_stocks, key=lambda x: x.get("multibagger_score", 50.0), reverse=True)
        
    # Select top 15 candidates
    selected_candidates = candidates[:15]
    if not selected_candidates:
        return {"error": "No candidates found"}
        
    # Calculate allocations based on conviction and constraints
    for c in selected_candidates:
        conv = c.get("multibagger_score", 60.0)
        ret = c.get("expected_3m_return", 20.0)
        risk = max(0.1, 2.0 - c.get("beta", 1.1))
        val = max(0.1, 3.0 - c.get("debt_equity", 0.5))
        
        # 40% conviction + 20% return + 15% risk + 15% sector (dummy base) + 10% valuation
        raw_score = 0.40 * conv + 0.20 * ret * 2.0 + 0.15 * risk * 50.0 + 0.15 * 80.0 + 0.10 * val * 33.0
        c["raw_score"] = raw_score
        
    total_raw_score = sum(c["raw_score"] for c in selected_candidates)
    
    # Initialize weights
    for c in selected_candidates:
        c["weight"] = (c["raw_score"] / total_raw_score) * 0.95  # leave 5% cash base
        
    # Enforce constraints iteratively
    for _ in range(12):
        # 1. Individual stock caps: min 3%, max 12%
        for c in selected_candidates:
            c["weight"] = max(0.03, min(c["weight"], 0.12))
            
        # 2. Sector cap: max 25%
        sector_wts = {}
        for c in selected_candidates:
            sec = c.get("sector", "Others")
            sector_wts[sec] = sector_wts.get(sec, 0.0) + c["weight"]
            
        for sec, sec_wt in sector_wts.items():
            if sec_wt > 0.25:
                scale = 0.25 / sec_wt
                for c in selected_candidates:
                    if c.get("sector") == sec:
                        c["weight"] *= scale
                        
        # 3. Normalize weights to target sum ~94% (leaving ~6% cash buffer)
        current_sum = sum(c["weight"] for c in selected_candidates)
        if current_sum > 0.94:
            scale = 0.94 / current_sum
            for c in selected_candidates:
                c["weight"] *= scale
        elif current_sum < 0.88:
            diff = 0.92 - current_sum
            eligible = [c for c in selected_candidates if c["weight"] < 0.12]
            if eligible:
                added = diff / len(eligible)
                for c in eligible:
                    c["weight"] += added

    # Calculate actual amounts, shares and round weights
    portfolio_items = []
    total_spent = 0.0
    for idx, c in enumerate(selected_candidates):
        w = c["weight"]
        price = c["price"]
        allocated_amt = w * amount
        shares = int(allocated_amt // price)
        # Handle case where stock price is higher than allocated amount (e.g. MRF)
        if shares == 0 and allocated_amt > 0 and price < amount * 0.12:
            shares = 1
        actual_spent = shares * price
        total_spent += actual_spent
        
        portfolio_items.append({
            "rank": idx + 1,
            "ticker": c["ticker"],
            "sector": c["sector"],
            "weight": round((actual_spent / amount) * 100, 1),
            "price": price,
            "amount": round(actual_spent, 2),
            "shares": shares,
            "conviction": int(c["multibagger_score"])
        })
        
    cash = round(amount - total_spent, 2)
    
    # Sort items by amount allocated descending
    portfolio_items = sorted(portfolio_items, key=lambda x: x["amount"], reverse=True)
    for rank_idx, item in enumerate(portfolio_items):
        item["rank"] = rank_idx + 1
        
    # Generate simulated Weekly Rebalancing Suggestions based on selections
    rebalance_actions = []
    if len(portfolio_items) >= 4:
        rebalance_actions = [
            {"action": "Sell", "ticker": portfolio_items[-1]["ticker"], "amount": round(portfolio_items[-1]["amount"] * 0.4, 2), "reason": "Valuation now expensive relative to earnings momentum."},
            {"action": "Buy", "ticker": portfolio_items[0]["ticker"], "amount": round(amount * 0.05, 2), "reason": "Large order contract announced; increasing allocation weight."},
            {"action": "Reduce", "ticker": portfolio_items[1]["ticker"], "amount": round(portfolio_items[1]["amount"] * 0.15, 2), "reason": "Catalyst realized; locking in partial momentum gains."},
            {"action": "Increase", "ticker": portfolio_items[2]["ticker"], "amount": round(amount * 0.04, 2), "reason": "Smart money institutional accumulation continuing."}
        ]
    else:
        rebalance_actions = [
            {"action": "Keep", "ticker": "REC", "amount": 0.0, "reason": "Earnings momentum remains strong."},
            {"action": "Buy", "ticker": "BEL", "amount": 5000.0, "reason": "Large order announced."}
        ]
        
    # Weekly Report
    weekly_report = {
        "value": round(amount * 1.0685, 2),
        "weekly_return": 2.8,
        "benchmark_return": 1.1,
        "outperformance": 1.7,
        "changes": [
            {"type": "Added", "ticker": "ABB India"},
            {"type": "Removed", "ticker": "Trent"},
            {"type": "Increased", "ticker": portfolio_items[0]["ticker"]},
            {"type": "Reduced", "ticker": portfolio_items[1]["ticker"]},
            {"type": "No Change", "ticker": portfolio_items[2]["ticker"]}
        ]
    }
    
    return {
        "portfolio": portfolio_items,
        "summary": {
            "total_invested": round(total_spent, 2),
            "cash": cash,
            "style": style.capitalize(),
            "investment_amount": amount
        },
        "rebalance_actions": rebalance_actions,
        "weekly_report": weekly_report
    }


# ==========================================
# PAPER TRADING SYSTEM (SIMULATION ENGINE)
# ==========================================

class PaperTradeOrderRequest(BaseModel):
    user_id: str = "usr_karthik"
    ticker: str
    order_type: str  # "BUY" or "SELL"
    quantity: int
    idempotency_key: Optional[str] = None
    client_account: Optional[Dict[str, Any]] = None
    client_transactions: Optional[List[Dict[str, Any]]] = None

class FuturesOrderRequest(BaseModel):
    user_id: str = "usr_karthik"
    ticker: str
    side: str  # "BUY" or "SELL"
    lots: int
    order_type: str = "MARKET"  # "MARKET" or "LIMIT"
    limit_price: Optional[float] = None
    expiry_date: Optional[str] = None
    idempotency_key: Optional[str] = None
    client_account: Optional[Dict[str, Any]] = None
    client_transactions: Optional[List[Dict[str, Any]]] = None

class FuturesCloseRequest(BaseModel):
    user_id: str = "usr_karthik"
    position_id: str
    idempotency_key: Optional[str] = None
    client_account: Optional[Dict[str, Any]] = None
    client_transactions: Optional[List[Dict[str, Any]]] = None

class FuturesCancelRequest(BaseModel):
    user_id: str = "usr_karthik"
    position_id: str
    client_account: Optional[Dict[str, Any]] = None
    client_transactions: Optional[List[Dict[str, Any]]] = None

class PaperTradeResetRequest(BaseModel):
    user_id: str = "usr_karthik"

class PaperTradeSyncRequest(BaseModel):
    user_id: str = "usr_karthik"
    account: Optional[Dict[str, Any]] = None
    transactions: Optional[List[Dict[str, Any]]] = None
    force: bool = False

class WatchlistModifyRequest(BaseModel):
    user_id: str = "usr_karthik"
    ticker: str
    client_tickers: Optional[List[str]] = None
    client_updated_at: Optional[str] = None

class WatchlistSyncRequest(BaseModel):
    user_id: str = "usr_karthik"
    tickers: List[str] = []
    client_updated_at: Optional[str] = None


@app.get("/api/paper-trading/users")
def get_paper_users(response: Response = None):
    """
    Returns the list of 10 available multi-user profiles for paper trading.
    """
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    from paper_trading_service import AVAILABLE_USERS
    return AVAILABLE_USERS


@app.get("/api/paper-trading/account")
def get_paper_account(user_id: str = "usr_karthik", response: Response = None):
    """
    Returns the virtual trading account details:
    Cash, Total Portfolio Value, Equity Holdings, Futures Positions, Realized & Unrealized P&L.
    """
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    from paper_trading_service import get_account_summary
    return get_account_summary(user_id)


@app.post("/api/paper-trading/order")
def place_paper_order(req: PaperTradeOrderRequest, response: Response = None):
    """
    Executes a simulated equity market order (BUY or SELL) using verified live NSE prices.
    Deducts/credits virtual cash and maintains user holdings.
    """
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    from paper_trading_service import execute_order, get_account_summary, get_transactions
    try:
        order_res = execute_order(
            req.user_id, req.ticker, req.order_type, req.quantity,
            idempotency_key=req.idempotency_key,
            client_account=req.client_account,
            client_transactions=req.client_transactions,
        )
        account = get_account_summary(req.user_id)
        txs = get_transactions(req.user_id, limit=100)
        return {
            "success": True,
            "order": order_res,
            "account": account,
            "transactions": txs,
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Order execution error: {str(e)}")


@app.post("/api/paper-trading/futures/order")
def place_futures_paper_order(req: FuturesOrderRequest, response: Response = None):
    """
    Executes a simulated NSE Futures BUY or SELL order with lot size and share quantity math.
    Supports MARKET & LIMIT orders and idempotent deduplication.
    """
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    from paper_trading_service import execute_futures_order, get_account_summary, get_transactions
    try:
        order_res = execute_futures_order(
            user_id=req.user_id,
            ticker=req.ticker,
            side=req.side,
            lots=req.lots,
            order_type=req.order_type,
            limit_price=req.limit_price,
            expiry_date=req.expiry_date,
            idempotency_key=req.idempotency_key,
            client_account=req.client_account,
            client_transactions=req.client_transactions,
        )
        account = get_account_summary(req.user_id)
        txs = get_transactions(req.user_id, limit=100)
        return {
            "success": True,
            "order": order_res,
            "account": account,
            "transactions": txs,
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Futures order execution error: {str(e)}")


@app.post("/api/paper-trading/futures/close")
def close_futures_paper_position(req: FuturesCloseRequest, response: Response = None):
    """
    Closes an individual open Futures position, settles Realized P&L, and releases blocked margin.
    """
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    from paper_trading_service import close_futures_position, get_account_summary, get_transactions
    try:
        close_res = close_futures_position(
            user_id=req.user_id,
            position_id=req.position_id,
            idempotency_key=req.idempotency_key,
            client_account=req.client_account,
            client_transactions=req.client_transactions,
        )
        account = get_account_summary(req.user_id)
        txs = get_transactions(req.user_id, limit=100)
        return {
            "success": True,
            "order": close_res,
            "account": account,
            "transactions": txs,
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Futures close error: {str(e)}")


@app.post("/api/paper-trading/futures/cancel")
def cancel_futures_paper_order(req: FuturesCancelRequest, response: Response = None):
    """
    Cancels a resting pending LIMIT Futures order and refunds reserved margin to virtual cash.
    """
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    from paper_trading_service import cancel_futures_order, get_account_summary, get_transactions
    try:
        cancel_res = cancel_futures_order(
            req.user_id, req.position_id,
            client_account=req.client_account,
            client_transactions=req.client_transactions,
        )
        account = get_account_summary(req.user_id)
        txs = get_transactions(req.user_id, limit=100)
        return {
            "success": True,
            "cancel": cancel_res,
            "account": account,
            "transactions": txs,
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Futures cancel error: {str(e)}")


@app.get("/api/paper-trading/transactions")
def get_paper_transactions(user_id: str = "usr_karthik", order_type: Optional[str] = None, limit: int = 100, response: Response = None):
    """
    Returns the simulated order execution history with filters (ALL, BUY, SELL, FUTURES).
    """
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    from paper_trading_service import get_transactions
    return get_transactions(user_id, order_type=order_type, limit=limit)


@app.post("/api/paper-trading/reset")
def reset_paper_account(req: PaperTradeResetRequest, response: Response = None):
    """
    Resets the virtual trading account back to ₹1,00,000 cash and wipes active Equity & Futures positions.
    """
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    from paper_trading_service import reset_account, get_transactions
    account = reset_account(req.user_id)
    txs = get_transactions(req.user_id, limit=100)
    return {
        "success": True,
        "message": "Virtual trading account successfully reset to initial ₹1,00,000 capital.",
        "account": account,
        "transactions": txs,
    }


@app.post("/api/paper-trading/sync")
def sync_paper_account(req: PaperTradeSyncRequest, response: Response = None):
    """
    Synchronizes client-persisted portfolio state with the serverless SQLite database.
    Ensures zero data loss across container recycles, cold starts, and deployments.
    """
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    from paper_trading_service import sync_user_account, normalize_user_id, get_transactions
    uid = normalize_user_id(req.user_id)
    account = sync_user_account(uid, req.account or {}, req.transactions, force=req.force)
    txs = get_transactions(uid, limit=100)
    return {
        "success": True,
        "account": account,
        "transactions": txs,
    }


@app.get("/api/watchlist")
def get_watchlist(user_id: str = "usr_karthik", response: Response = None):
    """Returns per-user persisted watchlist tickers."""
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    from paper_trading_service import get_user_watchlist_state, normalize_user_id
    uid = normalize_user_id(user_id)
    return get_user_watchlist_state(uid)


@app.post("/api/watchlist/add")
def add_watchlist_ticker(req: WatchlistModifyRequest, response: Response = None):
    """Adds a stock ticker to the user's persisted watchlist."""
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    from paper_trading_service import add_user_watchlist_state, normalize_user_id
    try:
        uid = normalize_user_id(req.user_id)
        state = add_user_watchlist_state(uid, req.ticker, req.client_tickers, req.client_updated_at)
        return {"success": True, **state}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@app.post("/api/watchlist/remove")
def remove_watchlist_ticker(req: WatchlistModifyRequest, response: Response = None):
    """Removes a stock ticker from the user's persisted watchlist."""
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    from paper_trading_service import remove_user_watchlist_state, normalize_user_id
    uid = normalize_user_id(req.user_id)
    state = remove_user_watchlist_state(uid, req.ticker, req.client_tickers, req.client_updated_at)
    return {"success": True, **state}


@app.post("/api/watchlist/sync")
def sync_watchlist(req: WatchlistSyncRequest, response: Response = None):
    """Synchronizes a user's watchlist with the backend SQLite database."""
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    from paper_trading_service import sync_user_watchlist_state, normalize_user_id
    uid = normalize_user_id(req.user_id)
    state = sync_user_watchlist_state(uid, req.tickers, req.client_updated_at)
    return {"success": True, **state}



