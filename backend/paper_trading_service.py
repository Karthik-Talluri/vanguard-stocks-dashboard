"""
Paper Trading Service for Vanguard Stocks Dashboard
Simulates real-world market execution with virtual capital (₹1,00,000 initial).
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

from market_service import get_live_stock_quote, get_all_live_stocks, VERIFIED_NSE_STOCK_FALLBACKS, get_market_hours_status
try:
    from data_generator import STOCKS_METADATA
except Exception:
    STOCKS_METADATA = {}

INITIAL_VIRTUAL_CAPITAL = 100000.0  # ₹1 Lakh
_DB_LOCK = threading.Lock()
IST = ZoneInfo("Asia/Kolkata")

AVAILABLE_USERS = [
    {"id": "usr_karthik", "name": "Karthik"},
    {"id": "usr_ravindra", "name": "Ravindra"},
    {"id": "usr_priya", "name": "Priya"},
    {"id": "usr_arun", "name": "Arun"},
    {"id": "usr_sneha", "name": "Sneha"},
    {"id": "usr_vamsi", "name": "Vamsi"},
    {"id": "usr_harsha", "name": "Harsha"},
    {"id": "usr_pooja", "name": "Pooja"},
    {"id": "usr_sai", "name": "Sai"},
    {"id": "usr_divya", "name": "Divya"}
]

USER_NAME_MAP = {u["id"]: u["name"] for u in AVAILABLE_USERS}

def get_db_path() -> str:
    """Returns persistent SQLite path or fallback to /tmp in serverless environments."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base_dir, "data")
    try:
        os.makedirs(data_dir, exist_ok=True)
        primary_path = os.path.join(data_dir, "paper_trading.db")
        test_file = os.path.join(data_dir, ".write_test")
        with open(test_file, "w") as f:
            f.write("ok")
        os.remove(test_file)
        return primary_path
    except Exception:
        return "/tmp/paper_trading.db"

def init_db():
    """Initializes tables for accounts, holdings, and transactions."""
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

            # Pre-seed default accounts for the 10 multi-user profiles
            now_iso = datetime.now(IST).isoformat()
            for u in AVAILABLE_USERS:
                cursor.execute("SELECT user_id FROM accounts WHERE user_id = ?", (u["id"],))
                if not cursor.fetchone():
                    cursor.execute(
                        "INSERT INTO accounts (user_id, cash, realized_pnl, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                        (u["id"], INITIAL_VIRTUAL_CAPITAL, 0.0, now_iso, now_iso)
                    )

            conn.commit()

# Initialize on module load
init_db()

def _get_connection():
    path = get_db_path()
    conn = sqlite3.connect(path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    return conn

def get_or_create_account(conn: sqlite3.Connection, user_id: str) -> Dict[str, Any]:
    """Ensures an account exists for user_id with initial ₹1,00,000 cash."""
    cursor = conn.cursor()
    cursor.execute("SELECT user_id, cash, realized_pnl, created_at, updated_at FROM accounts WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    now_iso = datetime.now(IST).isoformat()
    if not row:
        cursor.execute(
            "INSERT INTO accounts (user_id, cash, realized_pnl, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, INITIAL_VIRTUAL_CAPITAL, 0.0, now_iso, now_iso)
        )
        conn.commit()
        return {
            "user_id": user_id,
            "cash": INITIAL_VIRTUAL_CAPITAL,
            "realized_pnl": 0.0,
            "created_at": now_iso,
            "updated_at": now_iso
        }
    return dict(row)

def execute_order(user_id: str, ticker: str, order_type: str, quantity: int) -> Dict[str, Any]:
    """
    Executes a simulated buy or sell market order atomically.
    Validates virtual cash balance and share holdings.
    """
    ticker = ticker.upper().strip()
    order_type = order_type.upper().strip()

    if quantity <= 0:
        raise ValueError("Order quantity must be a positive integer greater than 0.")
    if order_type not in ["BUY", "SELL"]:
        raise ValueError(f"Invalid order type '{order_type}'. Must be 'BUY' or 'SELL'.")

    # 1. Fetch current verified NSE market price
    quote = get_live_stock_quote(ticker)
    price = 0.0
    if quote and quote.get("price"):
        price = float(quote["price"])
    elif ticker in VERIFIED_NSE_STOCK_FALLBACKS:
        price = float(VERIFIED_NSE_STOCK_FALLBACKS[ticker].get("price", 0.0))

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

            # Check/create account
            account = get_or_create_account(conn, user_id)
            current_cash = float(account["cash"])
            current_realized_pnl = float(account["realized_pnl"])

            # Check existing holding
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
                new_cash = current_cash - total_order_amount
                new_qty = current_holding_qty + quantity
                new_total_invested = current_total_invested + total_order_amount
                new_avg_price = new_total_invested / new_qty

                # Update account cash
                cursor.execute(
                    "UPDATE accounts SET cash = ?, updated_at = ? WHERE user_id = ?",
                    (new_cash, now_iso, user_id)
                )

                # Upsert holding
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
                new_cash = current_cash + total_order_amount
                new_total_realized = current_realized_pnl + realized_pnl_on_trade
                new_qty = current_holding_qty - quantity

                # Update account cash and realized PnL
                cursor.execute(
                    "UPDATE accounts SET cash = ?, realized_pnl = ?, updated_at = ? WHERE user_id = ?",
                    (new_cash, new_total_realized, now_iso, user_id)
                )

                if new_qty == 0:
                    cursor.execute("DELETE FROM holdings WHERE user_id = ? AND ticker = ?", (user_id, ticker))
                else:
                    new_total_invested = new_qty * current_avg_price
                    cursor.execute(
                        "UPDATE holdings SET quantity = ?, total_invested = ?, updated_at = ? WHERE user_id = ? AND ticker = ?",
                        (new_qty, new_total_invested, now_iso, user_id, ticker)
                    )

            # Insert transaction
            cursor.execute("""
                INSERT INTO transactions (
                    id, user_id, ticker, order_type, quantity, execution_price, total_amount, realized_pnl, timestamp, formatted_time, status, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                order_id, user_id, ticker, order_type, quantity, price, total_order_amount, realized_pnl_on_trade, now_iso, now_formatted, 'EXECUTED', 'PAPER_TRADING_SIMULATED'
            ))

            conn.commit()

            return {
                "success": True,
                "order_id": order_id,
                "user_id": user_id,
                "ticker": ticker,
                "order_type": order_type,
                "quantity": quantity,
                "execution_price": round(price, 2),
                "total_amount": round(total_order_amount, 2),
                "realized_pnl": round(realized_pnl_on_trade, 2),
                "timestamp": now_iso,
                "formatted_time": now_formatted,
                "status": "EXECUTED",
                "message": f"Successfully simulated {order_type} order for {quantity} shares of {ticker} at ₹{price:,.2f}"
            }

        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

def get_account_summary(user_id: str) -> Dict[str, Any]:
    """
    Returns complete portfolio dashboard metrics:
    - Available Cash
    - Total Portfolio Value (Cash + Current Market Value of Holdings)
    - Total Investment (Cost Basis)
    - Total Profit/Loss (Realized + Unrealized)
    - Profit/Loss Percentage
    - Active Holdings with live Mark-to-Market valuation
    """
    with _DB_LOCK:
        conn = _get_connection()
        try:
            account = get_or_create_account(conn, user_id)
            cursor = conn.cursor()
            cursor.execute("SELECT ticker, quantity, avg_buy_price, total_invested, updated_at FROM holdings WHERE user_id = ? ORDER BY total_invested DESC", (user_id,))
            holding_rows = cursor.fetchall()
        finally:
            conn.close()

    cash = float(account["cash"])
    realized_pnl = float(account["realized_pnl"])

    # Batch fetch live stock quotes for all holdings
    live_stocks_data = get_all_live_stocks()
    live_quotes = live_stocks_data.get("quotes", {})
    market_hours = get_market_hours_status()

    holdings = []
    total_invested = 0.0
    total_market_value = 0.0
    total_unrealized_pnl = 0.0

    for row in holding_rows:
        ticker = row["ticker"]
        qty = int(row["quantity"])
        avg_price = float(row["avg_buy_price"])
        invested = float(row["total_invested"])
        total_invested += invested

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
        total_unrealized_pnl += unrealized

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
            "day_change_pct": round(day_chg_pct, 2)
        })

    portfolio_value = round(cash + total_market_value, 2)
    total_pnl = round(realized_pnl + total_unrealized_pnl, 2)
    total_pnl_pct = round((total_pnl / INITIAL_VIRTUAL_CAPITAL) * 100.0, 2)

    now_dt = datetime.now(IST)

    user_display_name = USER_NAME_MAP.get(user_id, user_id.replace("usr_", "").capitalize())

    return {
        "user_id": user_id,
        "user_name": user_display_name,
        "initial_capital": INITIAL_VIRTUAL_CAPITAL,
        "available_cash": round(cash, 2),
        "total_invested": round(total_invested, 2),
        "portfolio_market_value": round(total_market_value, 2),
        "total_portfolio_value": portfolio_value,
        "realized_pnl": round(realized_pnl, 2),
        "unrealized_pnl": round(total_unrealized_pnl, 2),
        "total_pnl": total_pnl,
        "total_pnl_pct": total_pnl_pct,
        "holdings": holdings,
        "holdings_count": len(holdings),
        "is_simulated": True,
        "last_updated": now_dt.isoformat(),
        "last_updated_formatted": now_dt.strftime("%d %b %Y, %I:%M:%S %p IST"),
        "market_session": market_hours.get("market_session_message", "MARKET CLOSED"),
        "is_market_open": market_hours.get("is_market_open", False)
    }

def get_transactions(user_id: str, order_type: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    """Returns simulated transaction history for user_id with optional BUY/SELL filter."""
    with _DB_LOCK:
        conn = _get_connection()
        try:
            cursor = conn.cursor()
            if order_type and order_type.upper() in ["BUY", "SELL"]:
                cursor.execute(
                    "SELECT * FROM transactions WHERE user_id = ? AND order_type = ? ORDER BY timestamp DESC LIMIT ?",
                    (user_id, order_type.upper(), limit)
                )
            else:
                cursor.execute(
                    "SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?",
                    (user_id, limit)
                )
            rows = cursor.fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

def reset_account(user_id: str) -> Dict[str, Any]:
    """Resets user virtual account to ₹1,00,000 cash and wipes active holdings."""
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
            
            # Log reset transaction
            cursor.execute("""
                INSERT INTO transactions (
                    id, user_id, ticker, order_type, quantity, execution_price, total_amount, realized_pnl, timestamp, formatted_time, status, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                f"RST-{uuid.uuid4().hex[:10].upper()}", user_id, "ACCOUNT_RESET", "RESET", 0, 0.0, INITIAL_VIRTUAL_CAPITAL, 0.0, now_iso, now_formatted, 'EXECUTED', 'ACCOUNT_RESET_TO_1_LAKH'
            ))

            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

    return get_account_summary(user_id)
