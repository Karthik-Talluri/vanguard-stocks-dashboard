"""
Paper Trading Service for Vanguard Stocks Dashboard
Simulates real-world Equity & NSE Futures market execution with virtual capital (₹1,00,000 initial).
Persistent storage using SQLite with atomic transactions and fallback to /tmp.
Strictly simulation only - no connection to real financial brokers.
"""

import os
import time
import uuid
import sqlite3
import threading
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Dict, Any, List, Optional

from market_service import (
    get_live_stock_quote,
    get_all_live_stocks,
    VERIFIED_NSE_STOCK_FALLBACKS,
    get_market_hours_status,
)
from futures_contracts import (
    get_contract_spec,
    round_to_nse_tick,
    get_futures_config,
)

try:
    from data_generator import STOCKS_METADATA
except Exception:
    STOCKS_METADATA = {}

INITIAL_VIRTUAL_CAPITAL = 100000.0  # ₹1 Lakh
DEFAULT_WATCHLIST_TICKERS = ["RELIANCE", "TCS", "HDFCBANK", "INFYS", "TATAMOTORS"]
_DB_LOCK = threading.Lock()
IST = ZoneInfo("Asia/Kolkata")

AVAILABLE_USERS = [
    {"id": "usr_karthik", "name": "Karthik"},
    {"id": "usr_rahul", "name": "Rahul"},
    {"id": "usr_priya", "name": "Priya"},
    {"id": "usr_arun", "name": "Arun"},
    {"id": "usr_sneha", "name": "Sneha"},
    {"id": "usr_vamsi", "name": "Vamsi"},
    {"id": "usr_harsha", "name": "Harsha"},
    {"id": "usr_pooja", "name": "Pooja"},
    {"id": "usr_sai", "name": "Sai"},
    {"id": "usr_divya", "name": "Divya"},
]

USER_NAME_MAP = {u["id"]: u["name"] for u in AVAILABLE_USERS}
USER_NAME_MAP["usr_ravindra"] = "Rahul"


def normalize_user_id(user_id: str) -> str:
    """Normalizes and maps user IDs (including backward compatibility)."""
    uid = (user_id or "usr_karthik").strip()
    if uid == "usr_ravindra":
        return "usr_rahul"
    return uid


def get_db_path() -> str:
    """Returns persistent SQLite path or fallback to /tmp in serverless environments."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base_dir, "data")
    primary_path = os.path.join(data_dir, "paper_trading.db")
    tmp_path = "/tmp/paper_trading.db"
    try:
        os.makedirs(data_dir, exist_ok=True)
        test_file = os.path.join(data_dir, ".write_test")
        with open(test_file, "w") as f:
            f.write("ok")
        os.remove(test_file)
        return primary_path
    except Exception:
        if os.path.exists(primary_path) and not os.path.exists(tmp_path):
            try:
                import shutil
                shutil.copy2(primary_path, tmp_path)
            except Exception:
                pass
        return tmp_path


def _ensure_column(cursor: sqlite3.Cursor, table: str, col_name: str, col_def: str) -> None:
    cursor.execute(f"PRAGMA table_info({table})")
    existing = {row[1] for row in cursor.fetchall()}
    if col_name not in existing:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}")


def init_db():
    """Initializes tables for accounts, holdings, futures_positions, transactions, and watchlist."""
    path = get_db_path()
    with _DB_LOCK:
        with sqlite3.connect(path) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS accounts (
                    user_id TEXT PRIMARY KEY,
                    cash REAL NOT NULL DEFAULT 100000.0,
                    realized_pnl REAL NOT NULL DEFAULT 0.0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS holdings (
                    user_id TEXT NOT NULL,
                    ticker TEXT NOT NULL,
                    quantity INTEGER NOT NULL,
                    avg_buy_price REAL NOT NULL,
                    total_invested REAL NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (user_id, ticker)
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS futures_positions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    ticker TEXT NOT NULL,
                    contract_symbol TEXT NOT NULL,
                    expiry_date TEXT NOT NULL,
                    expiry_formatted TEXT NOT NULL,
                    exchange TEXT NOT NULL DEFAULT 'NSE',
                    side TEXT NOT NULL,
                    order_mode TEXT NOT NULL DEFAULT 'MARKET',
                    lot_size INTEGER NOT NULL,
                    lots INTEGER NOT NULL,
                    total_quantity INTEGER NOT NULL,
                    entry_price REAL NOT NULL,
                    limit_price REAL,
                    trade_value REAL NOT NULL,
                    margin_blocked REAL NOT NULL,
                    margin_pct REAL NOT NULL DEFAULT 0.05,
                    status TEXT NOT NULL DEFAULT 'OPEN',
                    exit_price REAL,
                    realized_pnl REAL NOT NULL DEFAULT 0.0,
                    idempotency_key TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    closed_at TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_futures_user_status ON futures_positions (user_id, status)")
            cursor.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_futures_user_idem
                ON futures_positions (user_id, idempotency_key)
                WHERE idempotency_key IS NOT NULL
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS transactions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    ticker TEXT NOT NULL,
                    order_type TEXT NOT NULL,
                    quantity INTEGER NOT NULL,
                    execution_price REAL NOT NULL,
                    total_amount REAL NOT NULL,
                    realized_pnl REAL NOT NULL DEFAULT 0.0,
                    timestamp TEXT NOT NULL,
                    formatted_time TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'EXECUTED',
                    notes TEXT DEFAULT 'PAPER_TRADING_SIMULATED'
                )
            """)

            # Backward-compatible schema migrations on existing transactions table
            _ensure_column(cursor, "transactions", "instrument_type", "TEXT DEFAULT 'EQUITY'")
            _ensure_column(cursor, "transactions", "side", "TEXT")
            _ensure_column(cursor, "transactions", "lots", "INTEGER DEFAULT 0")
            _ensure_column(cursor, "transactions", "lot_size", "INTEGER DEFAULT 0")
            _ensure_column(cursor, "transactions", "expiry_date", "TEXT")
            _ensure_column(cursor, "transactions", "contract_symbol", "TEXT")
            _ensure_column(cursor, "transactions", "margin_used", "REAL DEFAULT 0.0")
            _ensure_column(cursor, "transactions", "order_mode", "TEXT DEFAULT 'MARKET'")
            _ensure_column(cursor, "transactions", "idempotency_key", "TEXT")
            _ensure_column(cursor, "transactions", "position_id", "TEXT")
            cursor.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_user_idem
                ON transactions (user_id, idempotency_key)
                WHERE idempotency_key IS NOT NULL
            """)

            # Persistent Watchlist tables scoped by user_id
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS watchlist (
                    user_id TEXT NOT NULL,
                    ticker TEXT NOT NULL,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (user_id, ticker)
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS watchlist_meta (
                    user_id TEXT PRIMARY KEY,
                    initialized INTEGER NOT NULL DEFAULT 1,
                    updated_at TEXT NOT NULL
                )
            """)

            # Pre-seed default accounts for the 10 multi-user profiles
            now_iso = datetime.now(IST).isoformat()
            for u in AVAILABLE_USERS:
                cursor.execute("SELECT user_id FROM accounts WHERE user_id = ?", (u["id"],))
                if not cursor.fetchone():
                    cursor.execute(
                        "INSERT INTO accounts (user_id, cash, realized_pnl, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                        (u["id"], INITIAL_VIRTUAL_CAPITAL, 0.0, now_iso, now_iso),
                    )

            conn.commit()


# Initialize on module load
init_db()


def _get_connection():
    path = get_db_path()
    conn = sqlite3.connect(path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    return conn


def _resolve_spot_price(ticker: str, live_quotes: Optional[Dict[str, Any]] = None) -> float:
    ticker = ticker.upper().strip()
    quote = live_quotes.get(ticker) if live_quotes else None
    if not quote:
        quote = get_live_stock_quote(ticker)
    if quote and quote.get("price"):
        price = float(quote["price"])
        if price > 0:
            return price
    if ticker in VERIFIED_NSE_STOCK_FALLBACKS:
        price = float(VERIFIED_NSE_STOCK_FALLBACKS[ticker].get("price", 0.0))
        if price > 0:
            return price
    return 0.0


def get_or_create_account(conn: sqlite3.Connection, user_id: str) -> Dict[str, Any]:
    """Ensures an account exists for user_id with initial ₹1,00,000 cash."""
    user_id = normalize_user_id(user_id)
    cursor = conn.cursor()
    cursor.execute("SELECT user_id, cash, realized_pnl, created_at, updated_at FROM accounts WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    now_iso = datetime.now(IST).isoformat()
    if not row:
        cursor.execute(
            "INSERT INTO accounts (user_id, cash, realized_pnl, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, INITIAL_VIRTUAL_CAPITAL, 0.0, now_iso, now_iso),
        )
        conn.commit()
        return {
            "user_id": user_id,
            "cash": INITIAL_VIRTUAL_CAPITAL,
            "realized_pnl": 0.0,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
    return dict(row)


def execute_order(
    user_id: str,
    ticker: str,
    order_type: str,
    quantity: int,
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Executes a simulated equity buy or sell market order atomically.
    Validates virtual cash balance, share holdings, and optional idempotency key.
    """
    user_id = normalize_user_id(user_id)
    ticker = ticker.upper().strip()
    order_type = order_type.upper().strip()
    idem_key = idempotency_key.strip() if isinstance(idempotency_key, str) and idempotency_key.strip() else None

    if quantity <= 0:
        raise ValueError("Order quantity must be a positive integer greater than 0.")
    if order_type not in ["BUY", "SELL"]:
        raise ValueError(f"Invalid order type '{order_type}'. Must be 'BUY' or 'SELL'.")

    price = _resolve_spot_price(ticker)
    if price <= 0:
        raise ValueError(f"Could not retrieve a valid market price for ticker '{ticker}'. Order rejected.")

    total_order_amount = round(quantity * price, 2)
    now_dt = datetime.now(IST)
    now_iso = now_dt.isoformat()
    now_formatted = now_dt.strftime("%d %b %Y, %I:%M:%S %p IST")
    order_id = f"ORD-{uuid.uuid4().hex[:10].upper()}"

    with _DB_LOCK:
        conn = _get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("BEGIN IMMEDIATE")

            if idem_key:
                cursor.execute("SELECT * FROM transactions WHERE user_id = ? AND idempotency_key = ?", (user_id, idem_key))
                existing_tx = cursor.fetchone()
                if existing_tx:
                    conn.rollback()
                    return {
                        "success": True,
                        "duplicate_prevented": True,
                        "order_id": existing_tx["id"],
                        "user_id": user_id,
                        "ticker": existing_tx["ticker"],
                        "order_type": existing_tx["order_type"],
                        "quantity": existing_tx["quantity"],
                        "execution_price": round(float(existing_tx["execution_price"]), 2),
                        "total_amount": round(float(existing_tx["total_amount"]), 2),
                        "realized_pnl": round(float(existing_tx["realized_pnl"]), 2),
                        "timestamp": existing_tx["timestamp"],
                        "formatted_time": existing_tx["formatted_time"],
                        "status": existing_tx["status"],
                        "message": f"Order already processed ({existing_tx['id']}). Duplicate submission prevented.",
                    }

            account = get_or_create_account(conn, user_id)
            current_cash = float(account["cash"])
            current_realized_pnl = float(account["realized_pnl"])

            cursor.execute("SELECT quantity, avg_buy_price, total_invested FROM holdings WHERE user_id = ? AND ticker = ?", (user_id, ticker))
            holding_row = cursor.fetchone()
            current_holding_qty = int(holding_row["quantity"]) if holding_row else 0
            current_avg_price = float(holding_row["avg_buy_price"]) if holding_row else 0.0
            current_total_invested = float(holding_row["total_invested"]) if holding_row else 0.0

            realized_pnl_on_trade = 0.0

            if order_type == "BUY":
                if current_cash < total_order_amount:
                    raise ValueError(
                        f"Insufficient virtual cash balance. Required: ₹{total_order_amount:,.2f}, Available: ₹{current_cash:,.2f}"
                    )
                new_cash = round(current_cash - total_order_amount, 2)
                new_qty = current_holding_qty + quantity
                new_total_invested = current_total_invested + total_order_amount
                new_avg_price = new_total_invested / new_qty

                cursor.execute(
                    "UPDATE accounts SET cash = ?, updated_at = ? WHERE user_id = ?",
                    (new_cash, now_iso, user_id),
                )

                cursor.execute("""
                    INSERT INTO holdings (user_id, ticker, quantity, avg_buy_price, total_invested, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id, ticker) DO UPDATE SET
                        quantity = excluded.quantity,
                        avg_buy_price = excluded.avg_buy_price,
                        total_invested = excluded.total_invested,
                        updated_at = excluded.updated_at
                """, (user_id, ticker, new_qty, new_avg_price, new_total_invested, now_iso))

            elif order_type == "SELL":
                if current_holding_qty < quantity:
                    raise ValueError(
                        f"Cannot sell more shares than currently owned. Owned: {current_holding_qty}, Requested to sell: {quantity}"
                    )

                cost_basis_sold = quantity * current_avg_price
                realized_pnl_on_trade = total_order_amount - cost_basis_sold
                new_cash = round(current_cash + total_order_amount, 2)
                new_total_realized = current_realized_pnl + realized_pnl_on_trade
                new_qty = current_holding_qty - quantity

                cursor.execute(
                    "UPDATE accounts SET cash = ?, realized_pnl = ?, updated_at = ? WHERE user_id = ?",
                    (new_cash, new_total_realized, now_iso, user_id),
                )

                if new_qty == 0:
                    cursor.execute("DELETE FROM holdings WHERE user_id = ? AND ticker = ?", (user_id, ticker))
                else:
                    new_total_invested = new_qty * current_avg_price
                    cursor.execute(
                        "UPDATE holdings SET quantity = ?, total_invested = ?, updated_at = ? WHERE user_id = ? AND ticker = ?",
                        (new_qty, new_total_invested, now_iso, user_id, ticker),
                    )

            cursor.execute("""
                INSERT INTO transactions (
                    id, user_id, ticker, order_type, instrument_type, side, quantity,
                    lots, lot_size, execution_price, total_amount, realized_pnl,
                    timestamp, formatted_time, status, order_mode, idempotency_key, notes
                ) VALUES (?, ?, ?, ?, 'EQUITY', ?, ?, 0, 0, ?, ?, ?, ?, ?, 'EXECUTED', 'MARKET', ?, 'PAPER_TRADING_SIMULATED')
            """, (
                order_id, user_id, ticker, order_type, order_type, quantity,
                price, total_order_amount, realized_pnl_on_trade,
                now_iso, now_formatted, idem_key,
            ))

            conn.commit()

            return {
                "success": True,
                "order_id": order_id,
                "user_id": user_id,
                "ticker": ticker,
                "order_type": order_type,
                "instrument_type": "EQUITY",
                "quantity": quantity,
                "execution_price": round(price, 2),
                "total_amount": round(total_order_amount, 2),
                "realized_pnl": round(realized_pnl_on_trade, 2),
                "timestamp": now_iso,
                "formatted_time": now_formatted,
                "status": "EXECUTED",
                "message": f"Successfully simulated {order_type} order for {quantity} shares of {ticker} at ₹{price:,.2f}",
            }

        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()


def execute_futures_order(
    user_id: str,
    ticker: str,
    side: str,
    lots: int,
    order_type: str = "MARKET",
    limit_price: Optional[float] = None,
    expiry_date: Optional[str] = None,
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Executes or queues a simulated NSE Futures BUY or SELL order with lot size math.
    Each executed Futures order opens an individual trackable Futures position so users
    can hold multiple Futures positions and close them independently.
    """
    user_id = normalize_user_id(user_id)
    ticker = ticker.upper().strip()
    side = side.upper().strip()
    order_type = (order_type or "MARKET").upper().strip()
    idem_key = idempotency_key.strip() if isinstance(idempotency_key, str) and idempotency_key.strip() else None

    if side not in ("BUY", "SELL"):
        raise ValueError(f"Invalid Futures position side '{side}'. Must be 'BUY' or 'SELL'.")
    if order_type not in ("MARKET", "LIMIT"):
        raise ValueError(f"Invalid order type '{order_type}'. Must be 'MARKET' or 'LIMIT'.")
    if not isinstance(lots, int) or lots <= 0:
        raise ValueError("Number of lots must be a positive integer of at least 1 lot.")

    spot_price = _resolve_spot_price(ticker)
    if spot_price <= 0:
        raise ValueError(f"Could not retrieve a valid NSE spot price for '{ticker}'. Futures order rejected.")

    spec = get_contract_spec(ticker, spot_price, expiry_date=expiry_date, lots=lots)
    live_futures_price = float(spec["futures_price"])
    lot_size = int(spec["lot_size"])
    total_quantity = lot_size * lots
    margin_pct = float(spec["margin_pct"])
    tick_size = float(spec["tick_size"])

    parsed_limit_price: Optional[float] = None
    if order_type == "LIMIT":
        if limit_price is None or float(limit_price) <= 0:
            raise ValueError("A valid positive Limit Price is required for LIMIT Futures orders.")
        parsed_limit_price = round_to_nse_tick(float(limit_price), tick_size)
        is_marketable = (
            (side == "BUY" and parsed_limit_price >= live_futures_price)
            or (side == "SELL" and parsed_limit_price <= live_futures_price)
        )
        if is_marketable:
            exec_price = live_futures_price
            pos_status = "OPEN"
            tx_status = "EXECUTED"
        else:
            exec_price = parsed_limit_price
            pos_status = "PENDING_LIMIT"
            tx_status = "PENDING_LIMIT"
    else:
        exec_price = live_futures_price
        pos_status = "OPEN"
        tx_status = "EXECUTED"

    trade_value = round(exec_price * total_quantity, 2)
    required_margin = round(trade_value * margin_pct, 2)

    now_dt = datetime.now(IST)
    now_iso = now_dt.isoformat()
    now_formatted = now_dt.strftime("%d %b %Y, %I:%M:%S %p IST")
    position_id = f"FUT-{uuid.uuid4().hex[:10].upper()}"
    order_id = f"FORD-{uuid.uuid4().hex[:10].upper()}"

    with _DB_LOCK:
        conn = _get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("BEGIN IMMEDIATE")

            if idem_key:
                cursor.execute(
                    "SELECT * FROM futures_positions WHERE user_id = ? AND idempotency_key = ?",
                    (user_id, idem_key),
                )
                existing_pos = cursor.fetchone()
                if existing_pos:
                    conn.rollback()
                    return {
                        "success": True,
                        "duplicate_prevented": True,
                        "order_id": existing_pos["id"],
                        "position_id": existing_pos["id"],
                        "user_id": user_id,
                        "ticker": existing_pos["ticker"],
                        "contract_symbol": existing_pos["contract_symbol"],
                        "expiry_date": existing_pos["expiry_date"],
                        "expiry_formatted": existing_pos["expiry_formatted"],
                        "exchange": existing_pos["exchange"],
                        "side": existing_pos["side"],
                        "order_type": existing_pos["order_mode"],
                        "lot_size": existing_pos["lot_size"],
                        "lots": existing_pos["lots"],
                        "total_quantity": existing_pos["total_quantity"],
                        "execution_price": existing_pos["entry_price"],
                        "required_margin": existing_pos["margin_blocked"],
                        "trade_value": existing_pos["trade_value"],
                        "status": "EXECUTED" if existing_pos["status"] == "OPEN" else existing_pos["status"],
                        "message": f"Futures order already processed ({existing_pos['id']}). Duplicate prevented.",
                    }

            account = get_or_create_account(conn, user_id)
            current_cash = float(account["cash"])

            if current_cash < required_margin:
                raise ValueError(
                    f"Insufficient virtual cash for Futures margin. Required Margin: ₹{required_margin:,.2f}, Available Cash: ₹{current_cash:,.2f}"
                )

            new_cash = round(current_cash - required_margin, 2)
            cursor.execute(
                "UPDATE accounts SET cash = ?, updated_at = ? WHERE user_id = ?",
                (new_cash, now_iso, user_id),
            )

            cursor.execute("""
                INSERT INTO futures_positions (
                    id, user_id, ticker, contract_symbol, expiry_date, expiry_formatted,
                    exchange, side, order_mode, lot_size, lots, total_quantity,
                    entry_price, limit_price, trade_value, margin_blocked, margin_pct,
                    status, exit_price, realized_pnl, idempotency_key, created_at, updated_at, closed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0.0, ?, ?, ?, NULL)
            """, (
                position_id, user_id, ticker, spec["contract_symbol"], spec["expiry_date"],
                spec["expiry_formatted"], spec["exchange"], side, order_type, lot_size,
                lots, total_quantity, exec_price, parsed_limit_price, trade_value,
                required_margin, margin_pct, pos_status, idem_key, now_iso, now_iso,
            ))

            tx_order_type = f"FUTURES_{side}"
            cursor.execute("""
                INSERT INTO transactions (
                    id, user_id, ticker, order_type, instrument_type, side, quantity,
                    lots, lot_size, expiry_date, contract_symbol, execution_price,
                    total_amount, margin_used, realized_pnl, timestamp, formatted_time,
                    status, order_mode, idempotency_key, position_id, notes
                ) VALUES (?, ?, ?, ?, 'FUTURES', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?, ?, ?, ?, ?, ?, ?)
            """, (
                order_id, user_id, ticker, tx_order_type, side, total_quantity,
                lots, lot_size, spec["expiry_date"], spec["contract_symbol"], exec_price,
                required_margin, required_margin, now_iso, now_formatted,
                tx_status, order_type, idem_key, position_id,
                f"{spec['contract_symbol']} | {lots} lot(s) x {lot_size} = {total_quantity} qty | Value ₹{trade_value:,.2f}",
            ))

            conn.commit()

            msg = (
                f"Queued LIMIT {side} order for {lots} lot(s) ({total_quantity} shares) of {spec['contract_symbol']} @ ₹{exec_price:,.2f}"
                if pos_status == "PENDING_LIMIT"
                else f"Executed {side} FUTURES for {lots} lot(s) ({total_quantity} shares) of {spec['contract_symbol']} @ ₹{exec_price:,.2f}"
            )

            return {
                "success": True,
                "order_id": order_id,
                "position_id": position_id,
                "user_id": user_id,
                "ticker": ticker,
                "contract_symbol": spec["contract_symbol"],
                "expiry_date": spec["expiry_date"],
                "expiry_formatted": spec["expiry_formatted"],
                "exchange": spec["exchange"],
                "side": side,
                "order_type": order_type,
                "lot_size": lot_size,
                "lots": lots,
                "total_quantity": total_quantity,
                "execution_price": round(exec_price, 2),
                "limit_price": parsed_limit_price,
                "required_margin": required_margin,
                "trade_value": trade_value,
                "timestamp": now_iso,
                "formatted_time": now_formatted,
                "status": tx_status,
                "position_status": pos_status,
                "message": msg,
            }

        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()


def close_futures_position(
    user_id: str,
    position_id: str,
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Closes an individual open Futures position at the live Futures price,
    calculates Realized P&L, and releases blocked margin + realized P&L to cash.
    """
    user_id = normalize_user_id(user_id)
    position_id = (position_id or "").strip()
    idem_key = idempotency_key.strip() if isinstance(idempotency_key, str) and idempotency_key.strip() else None

    if not position_id:
        raise ValueError("position_id is required to close a Futures position.")

    now_dt = datetime.now(IST)
    now_iso = now_dt.isoformat()
    now_formatted = now_dt.strftime("%d %b %Y, %I:%M:%S %p IST")
    order_id = f"FCLS-{uuid.uuid4().hex[:10].upper()}"

    with _DB_LOCK:
        conn = _get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("BEGIN IMMEDIATE")

            if idem_key:
                cursor.execute("SELECT * FROM transactions WHERE user_id = ? AND idempotency_key = ?", (user_id, idem_key))
                existing_tx = cursor.fetchone()
                if existing_tx:
                    conn.rollback()
                    return {
                        "success": True,
                        "duplicate_prevented": True,
                        "order_id": existing_tx["id"],
                        "position_id": position_id,
                        "realized_pnl": round(float(existing_tx["realized_pnl"]), 2),
                        "exit_price": round(float(existing_tx["execution_price"]), 2),
                        "status": existing_tx["status"],
                        "message": "Futures close already executed.",
                    }

            cursor.execute(
                "SELECT * FROM futures_positions WHERE id = ? AND user_id = ?",
                (position_id, user_id),
            )
            pos = cursor.fetchone()
            if not pos:
                raise ValueError(f"Futures position '{position_id}' not found for user '{user_id}'.")

            if pos["status"] == "CLOSED":
                conn.rollback()
                return {
                    "success": True,
                    "duplicate_prevented": True,
                    "position_id": position_id,
                    "ticker": pos["ticker"],
                    "contract_symbol": pos["contract_symbol"],
                    "exit_price": round(float(pos["exit_price"] or pos["entry_price"]), 2),
                    "realized_pnl": round(float(pos["realized_pnl"]), 2),
                    "status": "CLOSED",
                    "message": f"Futures position {pos['contract_symbol']} is already closed.",
                }

            if pos["status"] != "OPEN":
                raise ValueError(f"Only OPEN Futures positions can be closed (current status: {pos['status']}).")

            ticker = pos["ticker"]
            spot_price = _resolve_spot_price(ticker)
            if spot_price <= 0:
                spot_price = float(pos["entry_price"])

            spec = get_contract_spec(ticker, spot_price, expiry_date=pos["expiry_date"], lots=int(pos["lots"]))
            exit_price = float(spec["futures_price"])

            entry_price = float(pos["entry_price"])
            total_qty = int(pos["total_quantity"])
            margin_blocked = float(pos["margin_blocked"])
            side = pos["side"].upper()

            if side == "BUY":
                realized_pnl = round((exit_price - entry_price) * total_qty, 2)
                close_side = "SELL"
            else:
                realized_pnl = round((entry_price - exit_price) * total_qty, 2)
                close_side = "BUY"

            account = get_or_create_account(conn, user_id)
            current_cash = float(account["cash"])
            current_realized = float(account["realized_pnl"])

            released_cash = round(margin_blocked + realized_pnl, 2)
            new_cash = round(current_cash + released_cash, 2)
            new_total_realized = round(current_realized + realized_pnl, 2)

            cursor.execute(
                "UPDATE accounts SET cash = ?, realized_pnl = ?, updated_at = ? WHERE user_id = ?",
                (new_cash, new_total_realized, now_iso, user_id),
            )
            cursor.execute("""
                UPDATE futures_positions
                SET status = 'CLOSED', exit_price = ?, realized_pnl = ?, updated_at = ?, closed_at = ?
                WHERE id = ? AND user_id = ?
            """, (exit_price, realized_pnl, now_iso, now_iso, position_id, user_id))

            cursor.execute("""
                INSERT INTO transactions (
                    id, user_id, ticker, order_type, instrument_type, side, quantity,
                    lots, lot_size, expiry_date, contract_symbol, execution_price,
                    total_amount, margin_used, realized_pnl, timestamp, formatted_time,
                    status, order_mode, idempotency_key, position_id, notes
                ) VALUES (?, ?, ?, 'FUTURES_CLOSE', 'FUTURES', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EXECUTED', 'MARKET', ?, ?, ?)
            """, (
                order_id, user_id, ticker, close_side, total_qty,
                int(pos["lots"]), int(pos["lot_size"]), pos["expiry_date"], pos["contract_symbol"],
                exit_price, released_cash, margin_blocked, realized_pnl,
                now_iso, now_formatted, idem_key, position_id,
                f"Closed {side} {pos['contract_symbol']} @ ₹{exit_price:,.2f} (Entry ₹{entry_price:,.2f})",
            ))

            conn.commit()

            return {
                "success": True,
                "order_id": order_id,
                "position_id": position_id,
                "user_id": user_id,
                "ticker": ticker,
                "contract_symbol": pos["contract_symbol"],
                "side": side,
                "lots": int(pos["lots"]),
                "lot_size": int(pos["lot_size"]),
                "total_quantity": total_qty,
                "entry_price": round(entry_price, 2),
                "exit_price": round(exit_price, 2),
                "margin_released": round(margin_blocked, 2),
                "realized_pnl": realized_pnl,
                "timestamp": now_iso,
                "formatted_time": now_formatted,
                "status": "CLOSED",
                "message": f"Closed {side} {pos['contract_symbol']} ({total_qty} shares) @ ₹{exit_price:,.2f} | Realized P&L: {'+' if realized_pnl >= 0 else ''}₹{realized_pnl:,.2f}",
            }

        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()


def cancel_futures_order(user_id: str, position_id: str) -> Dict[str, Any]:
    """Cancels a pending LIMIT Futures order and refunds reserved margin to virtual cash."""
    user_id = normalize_user_id(user_id)
    position_id = (position_id or "").strip()
    now_iso = datetime.now(IST).isoformat()

    with _DB_LOCK:
        conn = _get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("BEGIN IMMEDIATE")

            cursor.execute(
                "SELECT * FROM futures_positions WHERE id = ? AND user_id = ?",
                (position_id, user_id),
            )
            pos = cursor.fetchone()
            if not pos:
                raise ValueError(f"Futures order '{position_id}' not found.")
            if pos["status"] != "PENDING_LIMIT":
                raise ValueError(f"Only PENDING_LIMIT Futures orders can be cancelled (status is {pos['status']}).")

            account = get_or_create_account(conn, user_id)
            refund_margin = float(pos["margin_blocked"])
            new_cash = round(float(account["cash"]) + refund_margin, 2)

            cursor.execute(
                "UPDATE accounts SET cash = ?, updated_at = ? WHERE user_id = ?",
                (new_cash, now_iso, user_id),
            )
            cursor.execute("""
                UPDATE futures_positions
                SET status = 'CANCELLED', updated_at = ?, closed_at = ?
                WHERE id = ? AND user_id = ?
            """, (now_iso, now_iso, position_id, user_id))

            cursor.execute(
                "UPDATE transactions SET status = 'CANCELLED' WHERE position_id = ? AND user_id = ? AND status = 'PENDING_LIMIT'",
                (position_id, user_id),
            )
            conn.commit()
            return {
                "success": True,
                "position_id": position_id,
                "refunded_margin": refund_margin,
                "message": f"Cancelled pending limit order for {pos['contract_symbol']} and refunded ₹{refund_margin:,.2f}.",
            }
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()


def _process_pending_limit_orders(conn: sqlite3.Connection, user_id: str, live_quotes: Dict[str, Any]) -> None:
    """Checks PENDING_LIMIT futures orders against current futures prices and fills triggered ones."""
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM futures_positions WHERE user_id = ? AND status = 'PENDING_LIMIT'",
        (user_id,),
    )
    pending_rows = cursor.fetchall()
    if not pending_rows:
        return

    now_dt = datetime.now(IST)
    now_iso = now_dt.isoformat()
    now_formatted = now_dt.strftime("%d %b %Y, %I:%M:%S %p IST")

    for row in pending_rows:
        spot = _resolve_spot_price(row["ticker"], live_quotes)
        if spot <= 0:
            continue
        spec = get_contract_spec(row["ticker"], spot, expiry_date=row["expiry_date"], lots=int(row["lots"]))
        curr_fut = float(spec["futures_price"])
        lp = float(row["limit_price"] or row["entry_price"])
        side = row["side"].upper()

        should_fill = (side == "BUY" and curr_fut <= lp) or (side == "SELL" and curr_fut >= lp)
        if not should_fill:
            continue

        total_qty = int(row["total_quantity"])
        margin_pct = float(row["margin_pct"] or 0.05)
        new_trade_val = round(curr_fut * total_qty, 2)
        new_margin = round(new_trade_val * margin_pct, 2)
        old_margin = float(row["margin_blocked"])
        margin_delta = round(new_margin - old_margin, 2)

        account = get_or_create_account(conn, user_id)
        current_cash = float(account["cash"])
        if margin_delta > current_cash:
            continue  # Wait until cash permits if upward price delta needs extra margin

        adjusted_cash = round(current_cash - margin_delta, 2)
        cursor.execute(
            "UPDATE accounts SET cash = ?, updated_at = ? WHERE user_id = ?",
            (adjusted_cash, now_iso, user_id),
        )
        cursor.execute("""
            UPDATE futures_positions
            SET status = 'OPEN', entry_price = ?, trade_value = ?, margin_blocked = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
        """, (curr_fut, new_trade_val, new_margin, now_iso, row["id"], user_id))
        cursor.execute("""
            UPDATE transactions
            SET status = 'EXECUTED', execution_price = ?, total_amount = ?, margin_used = ?,
                timestamp = ?, formatted_time = ?
            WHERE position_id = ? AND user_id = ? AND status = 'PENDING_LIMIT'
        """, (curr_fut, new_margin, new_margin, now_iso, now_formatted, row["id"], user_id))

    conn.commit()


def get_account_summary(user_id: str) -> Dict[str, Any]:
    """
    Returns complete portfolio dashboard metrics (Equity + NSE Futures):
    - Available Cash
    - Total Portfolio Value (Cash + Equity Market Value + Futures Blocked Margin + Futures MTM)
    - Total Investment (Equity Cost Basis + Futures Blocked Margin)
    - Realized P&L, Unrealized P&L, Total P&L
    - Active Equity Holdings & Active/Closed/Pending Futures Positions
    """
    user_id = normalize_user_id(user_id)

    live_stocks_data = get_all_live_stocks()
    live_quotes = live_stocks_data.get("quotes", {})
    market_hours = get_market_hours_status()

    with _DB_LOCK:
        conn = _get_connection()
        try:
            account = get_or_create_account(conn, user_id)
            _process_pending_limit_orders(conn, user_id, live_quotes)
            # Re-read account after any triggered limit orders
            account = get_or_create_account(conn, user_id)

            cursor = conn.cursor()
            cursor.execute(
                "SELECT ticker, quantity, avg_buy_price, total_invested, updated_at FROM holdings WHERE user_id = ? ORDER BY total_invested DESC",
                (user_id,),
            )
            holding_rows = cursor.fetchall()

            cursor.execute(
                "SELECT * FROM futures_positions WHERE user_id = ? AND status = 'OPEN' ORDER BY created_at DESC",
                (user_id,),
            )
            open_futures_rows = cursor.fetchall()

            cursor.execute(
                "SELECT * FROM futures_positions WHERE user_id = ? AND status = 'PENDING_LIMIT' ORDER BY created_at DESC",
                (user_id,),
            )
            pending_futures_rows = cursor.fetchall()

            cursor.execute(
                "SELECT * FROM futures_positions WHERE user_id = ? AND status = 'CLOSED' ORDER BY closed_at DESC LIMIT 25",
                (user_id,),
            )
            closed_futures_rows = cursor.fetchall()
        finally:
            conn.close()

    cash = float(account["cash"])
    realized_pnl = float(account["realized_pnl"])

    holdings = []
    equity_invested = 0.0
    total_market_value = 0.0
    equity_unrealized_pnl = 0.0

    for row in holding_rows:
        ticker = row["ticker"]
        qty = int(row["quantity"])
        avg_price = float(row["avg_buy_price"])
        invested = float(row["total_invested"])
        equity_invested += invested

        quote = live_quotes.get(ticker) or get_live_stock_quote(ticker)
        current_price = avg_price
        day_chg_pct = 0.0
        if quote and quote.get("price"):
            current_price = float(quote["price"])
            day_chg_pct = float(quote.get("change_pct", 0.0))
        elif ticker in VERIFIED_NSE_STOCK_FALLBACKS:
            current_price = float(VERIFIED_NSE_STOCK_FALLBACKS[ticker].get("price", avg_price))
            day_chg_pct = float(VERIFIED_NSE_STOCK_FALLBACKS[ticker].get("change_pct", 0.0))

        market_val = round(qty * current_price, 2)
        total_market_value += market_val

        unrealized = round(market_val - invested, 2)
        unrealized_pct = round((unrealized / invested * 100.0) if invested > 0 else 0.0, 2)
        equity_unrealized_pnl += unrealized

        meta = STOCKS_METADATA.get(ticker, {})

        holdings.append({
            "ticker": ticker,
            "sector": meta.get("sector", "Equities"),
            "market_cap": meta.get("market_cap", "large"),
            "quantity": qty,
            "avg_buy_price": round(avg_price, 2),
            "current_price": round(current_price, 2),
            "total_invested": round(invested, 2),
            "market_value": round(market_val, 2),
            "unrealized_pnl": round(unrealized, 2),
            "unrealized_pnl_pct": unrealized_pct,
            "day_change_pct": round(day_chg_pct, 2),
        })

    futures_positions = []
    futures_margin_blocked = 0.0
    futures_unrealized_pnl = 0.0

    for row in open_futures_rows:
        ticker = row["ticker"]
        entry_price = float(row["entry_price"])
        lot_size = int(row["lot_size"])
        lots = int(row["lots"])
        total_qty = int(row["total_quantity"])
        margin_blocked = float(row["margin_blocked"])
        side = row["side"].upper()
        futures_margin_blocked += margin_blocked

        spot = _resolve_spot_price(ticker, live_quotes) or entry_price
        spec = get_contract_spec(ticker, spot, expiry_date=row["expiry_date"], lots=lots)
        current_futures_price = float(spec["futures_price"])

        if side == "BUY":
            fut_unrealized = round((current_futures_price - entry_price) * total_qty, 2)
        else:
            fut_unrealized = round((entry_price - current_futures_price) * total_qty, 2)

        futures_unrealized_pnl += fut_unrealized
        fut_unrealized_pct = round((fut_unrealized / margin_blocked * 100.0) if margin_blocked > 0 else 0.0, 2)
        current_trade_value = round(current_futures_price * total_qty, 2)
        meta = STOCKS_METADATA.get(ticker, {})

        futures_positions.append({
            "id": row["id"],
            "user_id": row["user_id"],
            "ticker": ticker,
            "sector": meta.get("sector", "Derivatives"),
            "contract_symbol": row["contract_symbol"],
            "expiry_date": row["expiry_date"],
            "expiry_formatted": row["expiry_formatted"],
            "exchange": row["exchange"],
            "side": side,
            "order_mode": row["order_mode"],
            "lot_size": lot_size,
            "lots": lots,
            "total_quantity": total_qty,
            "entry_price": round(entry_price, 2),
            "current_spot_price": round(spot, 2),
            "current_futures_price": round(current_futures_price, 2),
            "trade_value": current_trade_value,
            "margin_blocked": round(margin_blocked, 2),
            "margin_pct": float(row["margin_pct"]),
            "unrealized_pnl": fut_unrealized,
            "unrealized_pnl_pct": fut_unrealized_pct,
            "realized_pnl": round(float(row["realized_pnl"]), 2),
            "status": row["status"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        })

    pending_futures_orders = []
    futures_pending_margin = 0.0
    for row in pending_futures_rows:
        ticker = row["ticker"]
        margin_blocked = float(row["margin_blocked"])
        futures_pending_margin += margin_blocked
        spot = _resolve_spot_price(ticker, live_quotes) or float(row["entry_price"])
        spec = get_contract_spec(ticker, spot, expiry_date=row["expiry_date"], lots=int(row["lots"]))
        pending_futures_orders.append({
            "id": row["id"],
            "ticker": ticker,
            "contract_symbol": row["contract_symbol"],
            "expiry_date": row["expiry_date"],
            "expiry_formatted": row["expiry_formatted"],
            "exchange": row["exchange"],
            "side": row["side"],
            "order_mode": row["order_mode"],
            "lot_size": int(row["lot_size"]),
            "lots": int(row["lots"]),
            "total_quantity": int(row["total_quantity"]),
            "limit_price": round(float(row["limit_price"] or row["entry_price"]), 2),
            "current_futures_price": float(spec["futures_price"]),
            "margin_blocked": round(margin_blocked, 2),
            "status": row["status"],
            "created_at": row["created_at"],
        })

    closed_futures_positions = [
        {
            "id": row["id"],
            "ticker": row["ticker"],
            "contract_symbol": row["contract_symbol"],
            "expiry_date": row["expiry_date"],
            "expiry_formatted": row["expiry_formatted"],
            "exchange": row["exchange"],
            "side": row["side"],
            "lot_size": int(row["lot_size"]),
            "lots": int(row["lots"]),
            "total_quantity": int(row["total_quantity"]),
            "entry_price": round(float(row["entry_price"]), 2),
            "exit_price": round(float(row["exit_price"] or row["entry_price"]), 2),
            "margin_blocked": round(float(row["margin_blocked"]), 2),
            "realized_pnl": round(float(row["realized_pnl"]), 2),
            "status": row["status"],
            "created_at": row["created_at"],
            "closed_at": row["closed_at"],
        }
        for row in closed_futures_rows
    ]

    total_invested = round(equity_invested + futures_margin_blocked + futures_pending_margin, 2)
    total_unrealized_pnl = round(equity_unrealized_pnl + futures_unrealized_pnl, 2)
    portfolio_value = round(
        cash + total_market_value + futures_margin_blocked + futures_pending_margin + futures_unrealized_pnl,
        2,
    )
    total_pnl = round(realized_pnl + total_unrealized_pnl, 2)
    total_pnl_pct = round((total_pnl / INITIAL_VIRTUAL_CAPITAL) * 100.0, 2)

    now_dt = datetime.now(IST)
    user_display_name = USER_NAME_MAP.get(user_id, user_id.replace("usr_", "").capitalize())

    return {
        "user_id": user_id,
        "user_name": user_display_name,
        "initial_capital": INITIAL_VIRTUAL_CAPITAL,
        "available_cash": round(cash, 2),
        "equity_invested": round(equity_invested, 2),
        "total_invested": total_invested,
        "portfolio_market_value": round(total_market_value, 2),
        "total_portfolio_value": portfolio_value,
        "realized_pnl": round(realized_pnl, 2),
        "unrealized_pnl": total_unrealized_pnl,
        "equity_unrealized_pnl": round(equity_unrealized_pnl, 2),
        "futures_margin_blocked": round(futures_margin_blocked + futures_pending_margin, 2),
        "futures_unrealized_pnl": round(futures_unrealized_pnl, 2),
        "total_pnl": total_pnl,
        "total_pnl_pct": total_pnl_pct,
        "holdings": holdings,
        "holdings_count": len(holdings),
        "futures_positions": futures_positions,
        "futures_count": len(futures_positions),
        "pending_futures_orders": pending_futures_orders,
        "closed_futures_positions": closed_futures_positions,
        "is_simulated": True,
        "last_updated": now_dt.isoformat(),
        "last_updated_formatted": now_dt.strftime("%d %b %Y, %I:%M:%S %p IST"),
        "market_session": market_hours.get("market_session_message", "MARKET CLOSED"),
        "is_market_open": market_hours.get("is_market_open", False),
    }


def get_transactions(user_id: str, order_type: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    """Returns simulated transaction history for user_id with optional BUY/SELL/FUTURES filter."""
    user_id = normalize_user_id(user_id)
    with _DB_LOCK:
        conn = _get_connection()
        try:
            cursor = conn.cursor()
            ot = order_type.upper().strip() if order_type else None
            if ot == "FUTURES":
                cursor.execute(
                    "SELECT * FROM transactions WHERE user_id = ? AND instrument_type = 'FUTURES' ORDER BY timestamp DESC LIMIT ?",
                    (user_id, limit),
                )
            elif ot in ("BUY", "SELL"):
                cursor.execute(
                    "SELECT * FROM transactions WHERE user_id = ? AND (order_type = ? OR order_type = ?) ORDER BY timestamp DESC LIMIT ?",
                    (user_id, ot, f"FUTURES_{ot}", limit),
                )
            else:
                cursor.execute(
                    "SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?",
                    (user_id, limit),
                )
            rows = cursor.fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()


def reset_account(user_id: str) -> Dict[str, Any]:
    """Resets user virtual account to ₹1,00,000 cash and wipes active Equity & Futures positions."""
    user_id = normalize_user_id(user_id)
    now_dt = datetime.now(IST)
    now_iso = now_dt.isoformat()
    now_formatted = now_dt.strftime("%d %b %Y, %I:%M:%S %p IST")

    with _DB_LOCK:
        conn = _get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("BEGIN IMMEDIATE")
            cursor.execute("""
                INSERT INTO accounts (user_id, cash, realized_pnl, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    cash = excluded.cash,
                    realized_pnl = excluded.realized_pnl,
                    updated_at = excluded.updated_at
            """, (user_id, INITIAL_VIRTUAL_CAPITAL, 0.0, now_iso, now_iso))
            cursor.execute("DELETE FROM holdings WHERE user_id = ?", (user_id,))
            cursor.execute("DELETE FROM futures_positions WHERE user_id = ?", (user_id,))

            cursor.execute("""
                INSERT INTO transactions (
                    id, user_id, ticker, order_type, instrument_type, quantity, execution_price,
                    total_amount, realized_pnl, timestamp, formatted_time, status, notes
                ) VALUES (?, ?, ?, ?, 'SYSTEM', 0, 0.0, ?, 0.0, ?, ?, 'EXECUTED', 'ACCOUNT_RESET_TO_1_LAKH')
            """, (
                f"RST-{uuid.uuid4().hex[:10].upper()}", user_id, "ACCOUNT_RESET", "RESET",
                INITIAL_VIRTUAL_CAPITAL, now_iso, now_formatted,
            ))

            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

    return get_account_summary(user_id)


def sync_user_account(
    user_id: str,
    client_account: Dict[str, Any],
    client_transactions: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Synchronizes client-persisted state (Equity + Futures + Watchlist) with serverless SQLite.
    Ensures zero data loss across container recycles/cold starts.
    """
    user_id = normalize_user_id(user_id)
    now_dt = datetime.now(IST)
    now_iso = now_dt.isoformat()

    is_dict = isinstance(client_account, dict)
    client_holdings = client_account.get("holdings", []) if is_dict else []
    client_futures = client_account.get("futures_positions", []) if is_dict else []
    client_pending_futures = client_account.get("pending_futures_orders", []) if is_dict else []
    client_closed_futures = client_account.get("closed_futures_positions", []) if is_dict else []
    client_cash = float(client_account.get("available_cash", INITIAL_VIRTUAL_CAPITAL)) if is_dict else INITIAL_VIRTUAL_CAPITAL
    client_realized = float(client_account.get("realized_pnl", 0.0)) if is_dict else 0.0

    with _DB_LOCK:
        conn = _get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("BEGIN IMMEDIATE")

            cursor.execute("SELECT COUNT(*) as cnt FROM holdings WHERE user_id = ?", (user_id,))
            server_holdings_count = cursor.fetchone()["cnt"]
            cursor.execute("SELECT COUNT(*) as cnt FROM futures_positions WHERE user_id = ?", (user_id,))
            server_futures_count = cursor.fetchone()["cnt"]
            cursor.execute("SELECT COUNT(*) as cnt FROM transactions WHERE user_id = ?", (user_id,))
            server_tx_count = cursor.fetchone()["cnt"]

            has_client_state = (
                len(client_holdings) > 0
                or len(client_futures) > 0
                or len(client_pending_futures) > 0
                or len(client_closed_futures) > 0
                or client_cash != INITIAL_VIRTUAL_CAPITAL
                or client_realized != 0.0
            )

            if server_holdings_count == 0 and server_futures_count == 0 and server_tx_count == 0 and has_client_state:
                cursor.execute("""
                    INSERT INTO accounts (user_id, cash, realized_pnl, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET
                        cash = excluded.cash,
                        realized_pnl = excluded.realized_pnl,
                        updated_at = excluded.updated_at
                """, (user_id, client_cash, client_realized, now_iso, now_iso))

                for h in client_holdings:
                    t = h.get("ticker", "").upper().strip()
                    q = int(h.get("quantity", 0))
                    avg_p = float(h.get("avg_buy_price", 0.0))
                    tot_inv = float(h.get("total_invested", q * avg_p))
                    if t and q > 0:
                        cursor.execute("""
                            INSERT INTO holdings (user_id, ticker, quantity, avg_buy_price, total_invested, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?)
                            ON CONFLICT(user_id, ticker) DO UPDATE SET
                                quantity = excluded.quantity,
                                avg_buy_price = excluded.avg_buy_price,
                                total_invested = excluded.total_invested,
                                updated_at = excluded.updated_at
                        """, (user_id, t, q, avg_p, tot_inv, now_iso))

                all_client_futures = list(client_futures) + list(client_pending_futures) + list(client_closed_futures)
                for fp in all_client_futures:
                    fp_id = fp.get("id") or f"FUT-{uuid.uuid4().hex[:10].upper()}"
                    t = fp.get("ticker", "").upper().strip()
                    if not t:
                        continue
                    cursor.execute("""
                        INSERT OR IGNORE INTO futures_positions (
                            id, user_id, ticker, contract_symbol, expiry_date, expiry_formatted,
                            exchange, side, order_mode, lot_size, lots, total_quantity,
                            entry_price, limit_price, trade_value, margin_blocked, margin_pct,
                            status, exit_price, realized_pnl, created_at, updated_at, closed_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        fp_id, user_id, t,
                        fp.get("contract_symbol", f"{t} FUT"),
                        fp.get("expiry_date", ""),
                        fp.get("expiry_formatted", ""),
                        fp.get("exchange", "NSE"),
                        fp.get("side", "BUY"),
                        fp.get("order_mode", "MARKET"),
                        int(fp.get("lot_size", 1)),
                        int(fp.get("lots", 1)),
                        int(fp.get("total_quantity", 1)),
                        float(fp.get("entry_price", fp.get("limit_price", 0.0))),
                        fp.get("limit_price"),
                        float(fp.get("trade_value", 0.0)),
                        float(fp.get("margin_blocked", 0.0)),
                        float(fp.get("margin_pct", 0.05)),
                        fp.get("status", "OPEN"),
                        fp.get("exit_price"),
                        float(fp.get("realized_pnl", 0.0)),
                        fp.get("created_at", now_iso),
                        now_iso,
                        fp.get("closed_at"),
                    ))

                if client_transactions:
                    for tx in client_transactions:
                        tx_id = tx.get("id") or f"TX-{uuid.uuid4().hex[:8].upper()}"
                        tx_ticker = tx.get("ticker", "").upper()
                        tx_type = tx.get("order_type", "BUY").upper()
                        tx_qty = int(tx.get("quantity", 0))
                        tx_price = float(tx.get("execution_price", 0.0))
                        tx_tot = float(tx.get("total_amount", tx_qty * tx_price))
                        tx_pnl = float(tx.get("realized_pnl", 0.0))
                        tx_time = tx.get("timestamp", now_iso)
                        tx_formatted = tx.get("formatted_time", now_dt.strftime("%d %b %Y, %I:%M:%S %p IST"))
                        tx_status = tx.get("status", "EXECUTED")
                        cursor.execute("""
                            INSERT OR IGNORE INTO transactions (
                                id, user_id, ticker, order_type, instrument_type, side, quantity,
                                lots, lot_size, expiry_date, contract_symbol, execution_price,
                                total_amount, margin_used, realized_pnl, timestamp, formatted_time,
                                status, order_mode, position_id, notes
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNC_RESTORED')
                        """, (
                            tx_id, user_id, tx_ticker, tx_type,
                            tx.get("instrument_type", "FUTURES" if "FUTURES" in tx_type else "EQUITY"),
                            tx.get("side"),
                            tx_qty,
                            int(tx.get("lots", 0) or 0),
                            int(tx.get("lot_size", 0) or 0),
                            tx.get("expiry_date"),
                            tx.get("contract_symbol"),
                            tx_price, tx_tot,
                            float(tx.get("margin_used", 0.0) or 0.0),
                            tx_pnl, tx_time, tx_formatted, tx_status,
                            tx.get("order_mode", "MARKET"),
                            tx.get("position_id"),
                        ))

                conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

    return get_account_summary(user_id)


# ==========================================
# PER-USER WATCHLIST DATABASE PERSISTENCE
# ==========================================

def _ensure_watchlist_initialized(cursor: sqlite3.Cursor, user_id: str, now_iso: str) -> None:
    cursor.execute("SELECT initialized FROM watchlist_meta WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    if row:
        return
    cursor.execute(
        "INSERT INTO watchlist_meta (user_id, initialized, updated_at) VALUES (?, 1, ?)",
        (user_id, now_iso),
    )
    for idx, t in enumerate(DEFAULT_WATCHLIST_TICKERS):
        cursor.execute(
            "INSERT OR IGNORE INTO watchlist (user_id, ticker, sort_order, created_at) VALUES (?, ?, ?, ?)",
            (user_id, t, idx, now_iso),
        )


def get_user_watchlist(user_id: str) -> List[str]:
    """Returns the persisted watchlist tickers strictly scoped to user_id."""
    user_id = normalize_user_id(user_id)
    now_iso = datetime.now(IST).isoformat()
    with _DB_LOCK:
        conn = _get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("BEGIN IMMEDIATE")
            _ensure_watchlist_initialized(cursor, user_id, now_iso)
            conn.commit()

            cursor.execute(
                "SELECT ticker FROM watchlist WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC",
                (user_id,),
            )
            return [r["ticker"] for r in cursor.fetchall()]
        finally:
            conn.close()


def add_user_watchlist(user_id: str, ticker: str) -> List[str]:
    """Adds a stock ticker to the specified user's persisted watchlist."""
    user_id = normalize_user_id(user_id)
    ticker = (ticker or "").upper().strip()
    if not ticker:
        raise ValueError("Ticker is required.")
    now_iso = datetime.now(IST).isoformat()

    with _DB_LOCK:
        conn = _get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("BEGIN IMMEDIATE")
            _ensure_watchlist_initialized(cursor, user_id, now_iso)
            cursor.execute("SELECT COALESCE(MAX(sort_order), -1) as max_ord FROM watchlist WHERE user_id = ?", (user_id,))
            next_ord = int(cursor.fetchone()["max_ord"]) + 1
            cursor.execute(
                "INSERT OR IGNORE INTO watchlist (user_id, ticker, sort_order, created_at) VALUES (?, ?, ?, ?)",
                (user_id, ticker, next_ord, now_iso),
            )
            cursor.execute(
                "UPDATE watchlist_meta SET updated_at = ? WHERE user_id = ?",
                (now_iso, user_id),
            )
            conn.commit()
            cursor.execute(
                "SELECT ticker FROM watchlist WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC",
                (user_id,),
            )
            return [r["ticker"] for r in cursor.fetchall()]
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()


def remove_user_watchlist(user_id: str, ticker: str) -> List[str]:
    """Removes a stock ticker from the specified user's persisted watchlist."""
    user_id = normalize_user_id(user_id)
    ticker = (ticker or "").upper().strip()
    now_iso = datetime.now(IST).isoformat()

    with _DB_LOCK:
        conn = _get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("BEGIN IMMEDIATE")
            _ensure_watchlist_initialized(cursor, user_id, now_iso)
            cursor.execute("DELETE FROM watchlist WHERE user_id = ? AND ticker = ?", (user_id, ticker))
            cursor.execute(
                "UPDATE watchlist_meta SET updated_at = ? WHERE user_id = ?",
                (now_iso, user_id),
            )
            conn.commit()
            cursor.execute(
                "SELECT ticker FROM watchlist WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC",
                (user_id,),
            )
            return [r["ticker"] for r in cursor.fetchall()]
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()


def sync_user_watchlist(user_id: str, tickers: List[str]) -> List[str]:
    """Replaces or restores user's watchlist cleanly on sync."""
    user_id = normalize_user_id(user_id)
    now_iso = datetime.now(IST).isoformat()
    cleaned: List[str] = []
    seen = set()
    for t in (tickers or []):
        sym = str(t).upper().strip()
        if sym and sym not in seen:
            seen.add(sym)
            cleaned.append(sym)

    with _DB_LOCK:
        conn = _get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("BEGIN IMMEDIATE")
            cursor.execute(
                "INSERT INTO watchlist_meta (user_id, initialized, updated_at) VALUES (?, 1, ?) "
                "ON CONFLICT(user_id) DO UPDATE SET initialized = 1, updated_at = excluded.updated_at",
                (user_id, now_iso),
            )
            cursor.execute("DELETE FROM watchlist WHERE user_id = ?", (user_id,))
            for idx, sym in enumerate(cleaned):
                cursor.execute(
                    "INSERT INTO watchlist (user_id, ticker, sort_order, created_at) VALUES (?, ?, ?, ?)",
                    (user_id, sym, idx, now_iso),
                )
            conn.commit()
            return cleaned
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()
