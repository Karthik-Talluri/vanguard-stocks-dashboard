"""
NSE Futures Contract Specification & Pricing Engine.
Provides exchange metadata, dynamic Last-Tuesday NSE expiry calendar,
configurable lot sizes, cost-of-carry futures pricing, and margin calculations.
"""

import os
import json
import calendar
import threading
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
from typing import Dict, Any, List, Optional

IST = ZoneInfo("Asia/Kolkata")
_CONFIG_LOCK = threading.Lock()
_RUNTIME_OVERRIDES: Dict[str, Any] = {}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CONFIG_PATH = os.path.join(BASE_DIR, "data", "futures_contracts.json")
TMP_OVERRIDE_PATH = "/tmp/futures_contracts_override.json"

NSE_DISPLAY_SYMBOLS = {
    "INFYS": "INFY",
    "BAJAJ_AUTO": "BAJAJ-AUTO",
    "MM": "M&M",
    "TATAMOTORS": "TATAMOTORS",
}


def _load_json_safe(path: str) -> Dict[str, Any]:
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
    except Exception:
        pass
    return {}


def get_futures_config() -> Dict[str, Any]:
    """Loads base futures_contracts.json merged with any mutable runtime overrides."""
    base = _load_json_safe(DEFAULT_CONFIG_PATH)
    tmp = _load_json_safe(TMP_OVERRIDE_PATH)

    merged = dict(base)
    merged["lot_sizes"] = dict(base.get("lot_sizes", {}))

    if tmp:
        for k in ("default_margin_pct", "annual_carry_rate", "tick_size", "exchange"):
            if k in tmp and tmp[k] is not None:
                merged[k] = tmp[k]
        if isinstance(tmp.get("lot_sizes"), dict):
            merged["lot_sizes"].update(tmp["lot_sizes"])

    with _CONFIG_LOCK:
        if _RUNTIME_OVERRIDES:
            for k in ("default_margin_pct", "annual_carry_rate", "tick_size"):
                if k in _RUNTIME_OVERRIDES and _RUNTIME_OVERRIDES[k] is not None:
                    merged[k] = _RUNTIME_OVERRIDES[k]
            if isinstance(_RUNTIME_OVERRIDES.get("lot_sizes"), dict):
                merged["lot_sizes"].update(_RUNTIME_OVERRIDES["lot_sizes"])

    return merged


def update_futures_config(
    lot_sizes: Optional[Dict[str, int]] = None,
    default_margin_pct: Optional[float] = None,
    annual_carry_rate: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Updates configurable contract specs (e.g., when NSE revises exchange lot sizes).
    Persists to /tmp override (and updates primary JSON if filesystem is writable).
    """
    with _CONFIG_LOCK:
        current_lots = dict(_RUNTIME_OVERRIDES.get("lot_sizes", {}))
        if lot_sizes:
            for t, lsz in lot_sizes.items():
                ticker = str(t).upper().strip()
                qty = int(lsz)
                if qty <= 0:
                    raise ValueError(f"Lot size for {ticker} must be a positive integer.")
                current_lots[ticker] = qty
            _RUNTIME_OVERRIDES["lot_sizes"] = current_lots

        if default_margin_pct is not None:
            mp = float(default_margin_pct)
            if not (0.01 <= mp <= 1.0):
                raise ValueError("default_margin_pct must be between 0.01 and 1.0")
            _RUNTIME_OVERRIDES["default_margin_pct"] = mp

        if annual_carry_rate is not None:
            cr = float(annual_carry_rate)
            if not (0.0 <= cr <= 0.50):
                raise ValueError("annual_carry_rate must be between 0.0 and 0.50")
            _RUNTIME_OVERRIDES["annual_carry_rate"] = cr

        # Persist override safely to /tmp so serverless reloads keep updates
        tmp_existing = _load_json_safe(TMP_OVERRIDE_PATH)
        tmp_lots = dict(tmp_existing.get("lot_sizes", {}))
        tmp_lots.update(current_lots)
        tmp_payload = {
            **tmp_existing,
            **{k: v for k, v in _RUNTIME_OVERRIDES.items() if k != "lot_sizes"},
            "lot_sizes": tmp_lots,
        }
        try:
            with open(TMP_OVERRIDE_PATH, "w", encoding="utf-8") as f:
                json.dump(tmp_payload, f, indent=2)
        except Exception:
            pass

        # Also update primary JSON when writable (local dev / non-readonly env)
        try:
            base = _load_json_safe(DEFAULT_CONFIG_PATH)
            if base:
                base_lots = dict(base.get("lot_sizes", {}))
                base_lots.update(current_lots)
                base["lot_sizes"] = base_lots
                if default_margin_pct is not None:
                    base["default_margin_pct"] = _RUNTIME_OVERRIDES["default_margin_pct"]
                if annual_carry_rate is not None:
                    base["annual_carry_rate"] = _RUNTIME_OVERRIDES["annual_carry_rate"]
                with open(DEFAULT_CONFIG_PATH, "w", encoding="utf-8") as f:
                    json.dump(base, f, indent=2)
        except Exception:
            pass

    return get_futures_config()


def _is_nse_holiday(d: date, config: Dict[str, Any]) -> bool:
    if d.weekday() >= 5:  # Saturday / Sunday
        return True
    mm_dd = d.strftime("%m-%d")
    if mm_dd in set(config.get("nse_fixed_holidays_mm_dd", [])):
        return True
    if d.isoformat() in set(config.get("nse_additional_holidays_iso", [])):
        return True
    return False


def _last_tuesday_of_month(year: int, month: int, config: Dict[str, Any]) -> date:
    """
    Computes NSE monthly F&O expiry date: Last Tuesday of the month
    (effective Sept 2025 NSE rule), shifting back to prior trading day on holidays.
    """
    last_day = calendar.monthrange(year, month)[1]
    d = date(year, month, last_day)
    # Tuesday == 1 in Python weekday()
    while d.weekday() != 1:
        d -= timedelta(days=1)
    while _is_nse_holiday(d, config):
        d -= timedelta(days=1)
    return d


def get_nse_expiry_dates(reference_dt: Optional[datetime] = None, count: int = 3) -> List[Dict[str, Any]]:
    """Returns upcoming NSE monthly futures expiry dates (Near, Next, Far)."""
    config = get_futures_config()
    now_ist = reference_dt or datetime.now(IST)
    today = now_ist.date()
    after_market_close = now_ist.time() >= time(15, 30)

    expiries: List[Dict[str, Any]] = []
    year, month = today.year, today.month
    labels = ["Near Month", "Next Month", "Far Month"]

    while len(expiries) < count:
        exp_date = _last_tuesday_of_month(year, month, config)
        is_expired = (exp_date < today) or (exp_date == today and after_market_close)
        if not is_expired:
            days_left = max(1, (exp_date - today).days)
            idx = len(expiries)
            expiries.append({
                "series": labels[idx] if idx < len(labels) else f"Series {idx + 1}",
                "expiry_date": exp_date.isoformat(),
                "expiry_formatted": exp_date.strftime("%d %b %Y").upper(),
                "month_label": exp_date.strftime("%b").upper(),
                "year_short": exp_date.strftime("%y"),
                "days_to_expiry": days_left,
            })
        if month == 12:
            year += 1
            month = 1
        else:
            month += 1

    return expiries


def round_to_nse_tick(price: float, tick_size: float = 0.05) -> float:
    if price <= 0:
        return 0.0
    step = tick_size if tick_size > 0 else 0.05
    return round(round(price / step) * step, 2)


def get_lot_size(ticker: str, spot_price: float = 0.0) -> int:
    """Returns configurable NSE F&O contract lot size for ticker."""
    ticker = ticker.upper().strip()
    config = get_futures_config()
    lot_sizes = config.get("lot_sizes", {})
    if ticker in lot_sizes and int(lot_sizes[ticker]) > 0:
        return int(lot_sizes[ticker])

    # Fallback approximation (~₹6.5L contract notional) if an unconfigured ticker appears
    if spot_price > 0:
        raw_size = 650000.0 / spot_price
        if raw_size > 1000:
            return max(25, int(round(raw_size / 250) * 250))
        if raw_size > 100:
            return max(25, int(round(raw_size / 25) * 25))
        return max(10, int(round(raw_size / 10) * 10))
    return 100


def calculate_futures_price(
    spot_price: float,
    days_to_expiry: int,
    carry_rate: Optional[float] = None,
    tick_size: Optional[float] = None,
) -> float:
    """Computes Futures fair price using NSE cost-of-carry rounded to ₹0.05 tick."""
    if spot_price <= 0:
        return 0.0
    config = get_futures_config()
    rate = float(carry_rate if carry_rate is not None else config.get("annual_carry_rate", 0.065))
    tick = float(tick_size if tick_size is not None else config.get("tick_size", 0.05))
    days = max(1, int(days_to_expiry))
    raw_futures = spot_price * (1.0 + rate * (days / 365.0))
    return round_to_nse_tick(raw_futures, tick)


def get_contract_spec(
    ticker: str,
    spot_price: float,
    expiry_date: Optional[str] = None,
    lots: int = 1,
    reference_dt: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Returns full NSE Futures contract specification and position sizing math:
    Stock Name, Exchange, Spot Price, Futures Price, Contract Name, Expiry,
    Lot Size, Number of Lots, Total Share Quantity, Required Margin, Estimated Trade Value.
    """
    ticker = ticker.upper().strip()
    config = get_futures_config()
    expiries = get_nse_expiry_dates(reference_dt=reference_dt, count=3)

    selected_expiry = expiries[0]
    if expiry_date:
        target_exp = expiry_date.strip()
        matched = next((e for e in expiries if e["expiry_date"] == target_exp or e["expiry_formatted"] == target_exp.upper()), None)
        if matched:
            selected_expiry = matched
        else:
            # Support custom future ISO expiry already stored on an older open position
            try:
                parsed_d = date.fromisoformat(target_exp)
                today = (reference_dt or datetime.now(IST)).date()
                selected_expiry = {
                    "series": "Custom",
                    "expiry_date": parsed_d.isoformat(),
                    "expiry_formatted": parsed_d.strftime("%d %b %Y").upper(),
                    "month_label": parsed_d.strftime("%b").upper(),
                    "year_short": parsed_d.strftime("%y"),
                    "days_to_expiry": max(1, (parsed_d - today).days),
                }
            except ValueError:
                pass

    lot_size = get_lot_size(ticker, spot_price)
    lots_int = max(1, int(lots))
    total_quantity = lot_size * lots_int

    margin_pct = float(config.get("default_margin_pct", 0.05))
    tick_size = float(config.get("tick_size", 0.05))
    carry_rate = float(config.get("annual_carry_rate", 0.065))

    futures_price = calculate_futures_price(
        spot_price=spot_price,
        days_to_expiry=selected_expiry["days_to_expiry"],
        carry_rate=carry_rate,
        tick_size=tick_size,
    )

    display_sym = NSE_DISPLAY_SYMBOLS.get(ticker, ticker)
    contract_symbol = f"{display_sym} {selected_expiry['expiry_formatted']} FUT"
    short_contract = f"{display_sym}{selected_expiry['year_short']}{selected_expiry['month_label']}FUT"

    estimated_trade_value = round(futures_price * total_quantity, 2)
    required_margin = round(estimated_trade_value * margin_pct, 2)
    margin_per_lot = round(futures_price * lot_size * margin_pct, 2)
    value_per_lot = round(futures_price * lot_size, 2)
    basis = round(futures_price - spot_price, 2)
    basis_pct = round((basis / spot_price) * 100.0, 2) if spot_price > 0 else 0.0

    # Also compute available expiry options with their futures prices
    available_expiries = []
    for exp in expiries:
        fp = calculate_futures_price(
            spot_price=spot_price,
            days_to_expiry=exp["days_to_expiry"],
            carry_rate=carry_rate,
            tick_size=tick_size,
        )
        available_expiries.append({
            **exp,
            "contract_symbol": f"{display_sym} {exp['expiry_formatted']} FUT",
            "short_contract": f"{display_sym}{exp['year_short']}{exp['month_label']}FUT",
            "futures_price": fp,
            "margin_per_lot": round(fp * lot_size * margin_pct, 2),
        })

    return {
        "ticker": ticker,
        "display_symbol": display_sym,
        "exchange": config.get("exchange", "NSE"),
        "instrument": config.get("instrument", "FUTSTK"),
        "spot_price": round(float(spot_price), 2),
        "futures_price": futures_price,
        "basis": basis,
        "basis_pct": basis_pct,
        "contract_symbol": contract_symbol,
        "short_contract": short_contract,
        "expiry_date": selected_expiry["expiry_date"],
        "expiry_formatted": selected_expiry["expiry_formatted"],
        "month_label": selected_expiry["month_label"],
        "days_to_expiry": selected_expiry["days_to_expiry"],
        "lot_size": lot_size,
        "lots": lots_int,
        "total_quantity": total_quantity,
        "margin_pct": margin_pct,
        "margin_pct_display": round(margin_pct * 100.0, 2),
        "margin_per_lot": margin_per_lot,
        "value_per_lot": value_per_lot,
        "required_margin": required_margin,
        "estimated_trade_value": estimated_trade_value,
        "tick_size": tick_size,
        "available_expiries": available_expiries,
    }
