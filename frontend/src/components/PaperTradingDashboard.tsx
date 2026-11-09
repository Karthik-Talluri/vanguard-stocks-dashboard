"use client";

import React, { useState, useEffect } from "react";
import { 
  PaperAccount, 
  PaperTransaction, 
  PaperHolding,
  fetchPaperAccount, 
  fetchPaperTransactions, 
  resetPaperAccount,
  getPaperUserId,
  StockOverview,
  TradingUser,
  PAPER_TRADING_USERS,
  getActiveTradingUser,
  setActiveTradingUserId,
  getLocalPaperAccount,
  getLocalPaperTransactions
} from "../utils/api";
import TradeModal from "./TradeModal";

interface PaperTradingDashboardProps {
  stocks: StockOverview[];
  initialAccount?: PaperAccount | null;
  onAccountUpdated?: (account: PaperAccount) => void;
  onSelectStock?: (ticker: string) => void;
}

export default function PaperTradingDashboard({ stocks, initialAccount, onAccountUpdated, onSelectStock }: PaperTradingDashboardProps) {
  const [activeUser, setActiveUser] = useState<TradingUser>(getActiveTradingUser());
  const [account, setAccount] = useState<PaperAccount | null>(() => initialAccount || getLocalPaperAccount(getActiveTradingUser().id));
  const [transactions, setTransactions] = useState<PaperTransaction[]>(() => getLocalPaperTransactions(getActiveTradingUser().id));
  const [txFilter, setTxFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [loading, setLoading] = useState<boolean>(!initialAccount && !account);
  const [error, setError] = useState<string | null>(null);
  const [resetConfirming, setResetConfirming] = useState<boolean>(false);
  const [resetting, setResetting] = useState<boolean>(false);

  // Synchronize if active user is changed from another component
  useEffect(() => {
    const handleUserChanged = (e: any) => {
      if (e.detail && e.detail.id !== activeUser.id) {
        setActiveUser(e.detail);
        const cached = getLocalPaperAccount(e.detail.id);
        if (cached) setAccount(cached);
        const cachedTxs = getLocalPaperTransactions(e.detail.id);
        if (cachedTxs.length > 0) setTransactions(cachedTxs);
      }
    };
    window.addEventListener("paper-user-changed", handleUserChanged);
    return () => window.removeEventListener("paper-user-changed", handleUserChanged);
  }, [activeUser.id]);

  // Listen for real-time order updates executed anywhere in the dashboard
  useEffect(() => {
    const handleAccountUpdated = (e: any) => {
      if (e.detail?.userId === activeUser.id && e.detail?.account) {
        setAccount(e.detail.account);
        if (onAccountUpdated) onAccountUpdated(e.detail.account);
        const filterType = txFilter === "ALL" ? undefined : txFilter;
        fetchPaperTransactions(activeUser.id, filterType).then(setTransactions);
      }
    };
    window.addEventListener("paper-account-updated", handleAccountUpdated);
    return () => window.removeEventListener("paper-account-updated", handleAccountUpdated);
  }, [activeUser.id, txFilter, onAccountUpdated]);

  const handleUserChange = (newUserId: string) => {
    const user = setActiveTradingUserId(newUserId);
    setActiveUser(user);
    const cached = getLocalPaperAccount(user.id);
    setAccount(cached);
    const cachedTxs = getLocalPaperTransactions(user.id);
    setTransactions(cachedTxs);
  };

  // Trade Modal state
  const [tradeModalOpen, setTradeModalOpen] = useState<boolean>(false);
  const [tradeTicker, setTradeTicker] = useState<string>("RELIANCE");
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY");
  const [selectedQuickStock, setSelectedQuickStock] = useState<string>("");

  const loadData = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh || !account) {
        setLoading(true);
      }
      setError(null);
      const acc = await fetchPaperAccount(activeUser.id);
      setAccount(acc);
      if (onAccountUpdated) onAccountUpdated(acc);

      const filterType = txFilter === "ALL" ? undefined : txFilter;
      const txs = await fetchPaperTransactions(activeUser.id, filterType);
      setTransactions(txs);
    } catch (err: any) {
      console.error("Error loading paper trading data:", err);
      setError(err?.message || "Failed to load paper trading data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(false), 15000);
    return () => clearInterval(interval);
  }, [activeUser.id, txFilter]);

  const handleOpenTrade = (ticker: string, type: "BUY" | "SELL") => {
    setTradeTicker(ticker);
    setTradeType(type);
    setTradeModalOpen(true);
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await resetPaperAccount(activeUser.id);
      setAccount(res.account);
      const txs = await fetchPaperTransactions(activeUser.id);
      setTransactions(txs);
      setResetConfirming(false);
    } catch (err: any) {
      alert(`Failed to reset ${activeUser.name}'s account: ` + (err?.message || "Unknown error"));
    } finally {
      setResetting(false);
    }
  };

  // Find price and owned shares for active modal
  const activeStock = stocks.find((s) => s.ticker === tradeTicker);
  const activeHolding = account?.holdings.find((h) => h.ticker === tradeTicker);
  const activePrice = activeStock?.price || activeHolding?.current_price || 1000.0;
  const activeOwnedQty = activeHolding?.quantity || 0;

  if (loading && !account) {
    return (
      <div className="glass-panel" style={{ padding: "40px", textAlign: "center", color: "var(--color-text-secondary)" }}>
        <div style={{ fontSize: "24px", marginBottom: "8px" }}>⏳</div>
        <div>Loading your simulated paper trading portfolio...</div>
      </div>
    );
  }

  const isProfit = (account?.total_pnl ?? 0) >= 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }} className="animate-fade-in">
      
      {/* Multi-User Selector Header Card */}
      <div className="glass-panel" style={{
        padding: "16px 22px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "14px",
        background: "linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(15, 23, 42, 0.7) 100%)",
        border: "1px solid rgba(99, 102, 241, 0.3)",
        borderRadius: "12px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>👤</span>
            <label 
              htmlFor="select-trading-user"
              style={{ fontSize: "13px", fontWeight: "800", color: "var(--color-text-primary)", letterSpacing: "-0.2px" }}
            >
              Select Trading User:
            </label>
          </div>

          <select
            id="select-trading-user"
            value={activeUser.id}
            onChange={(e) => handleUserChange(e.target.value)}
            style={{
              fontSize: "13px",
              fontWeight: "700",
              padding: "8px 14px",
              borderRadius: "8px",
              background: "var(--bg-card)",
              color: "#a5b4fc",
              border: "1px solid rgba(99, 102, 241, 0.4)",
              cursor: "pointer",
              outline: "none",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
            }}
          >
            {PAPER_TRADING_USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} (₹1,00,000 Portfolio)
              </option>
            ))}
          </select>

          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "5px 12px",
            borderRadius: "16px",
            background: "rgba(16, 185, 129, 0.12)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            color: "var(--color-buy)",
            fontSize: "12px",
            fontWeight: "700"
          }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-buy)" }}></span>
            <span>Active Account: <strong style={{ color: "#ffffff" }}>{activeUser.name}</strong></span>
          </div>
        </div>

        <div style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
          <span>🛡️</span>
          <span>Shared-device user selector (separate simulated portfolios, not authenticated).</span>
        </div>
      </div>

      {/* Top Banner & Quick Controls */}
      <div className="glass-panel" style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "22px" }}>📈</span>
            <h2 style={{ fontSize: "20px", fontWeight: "900", color: "var(--color-text-primary)", letterSpacing: "-0.5px" }}>
              Paper Trading Simulator
            </h2>
            <span style={{ 
              fontSize: "10px", 
              fontWeight: "700", 
              padding: "2px 8px", 
              borderRadius: "12px", 
              background: "rgba(16, 185, 129, 0.12)", 
              color: "var(--color-buy)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              textTransform: "uppercase"
            }}>
              Zero Risk • Real NSE Quotes
            </span>
          </div>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
            Execute simulated market trades with ₹1,00,000 virtual capital against live NSE market feeds.
          </div>
        </div>

        {/* Quick Trade Selector & Reset */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <select
              value={selectedQuickStock}
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  handleOpenTrade(val, "BUY");
                  setSelectedQuickStock("");
                }
              }}
              style={{
                fontSize: "12px",
                padding: "8px 12px",
                borderRadius: "8px",
                background: "var(--bg-card)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--border-subtle)",
                cursor: "pointer",
                outline: "none"
              }}
            >
              <option value="">🛒 Trade Stock (Select from 50)...</option>
              {stocks.map((s) => (
                <option key={s.ticker} value={s.ticker}>
                  {s.ticker} (₹{s.price.toLocaleString("en-IN", { maximumFractionDigits: 1 })})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setResetConfirming(true)}
            style={{
              fontSize: "12px",
              padding: "8px 14px",
              borderRadius: "8px",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "var(--color-sell)",
              fontWeight: "700",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            🔄 Reset Funds
          </button>

          <button
            onClick={() => loadData(true)}
            style={{
              fontSize: "12px",
              padding: "8px 14px",
              borderRadius: "8px",
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid var(--border-subtle)",
              color: "var(--color-text-secondary)",
              fontWeight: "600",
              cursor: "pointer"
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      {resetConfirming && (
        <div className="glass-panel" style={{
          padding: "16px 20px",
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid var(--color-sell)",
          borderRadius: "10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px"
        }}>
          <div>
            <div style={{ fontWeight: "800", color: "var(--color-sell)", fontSize: "14px" }}>⚠️ Confirm Account Reset for {activeUser.name}</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-primary)", marginTop: "2px" }}>
              Are you sure? This will wipe <strong>{activeUser.name}</strong>&apos;s simulated holdings and restore virtual cash back to ₹1,00,000 without affecting other traders.
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setResetConfirming(false)}
              disabled={resetting}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                background: "transparent",
                border: "1px solid var(--border-subtle)",
                color: "var(--color-text-secondary)",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer"
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleReset}
              disabled={resetting}
              style={{
                padding: "6px 16px",
                borderRadius: "6px",
                background: "var(--color-sell)",
                border: "none",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: "800",
                cursor: "pointer"
              }}
            >
              {resetting ? "Resetting..." : `Yes, Reset ${activeUser.name}'s Account`}
            </button>
          </div>
        </div>
      )}

      {/* Metrics Summary Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "14px" }}>
        {/* Total Portfolio Value */}
        <div className="glass-panel" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700" }}>
            Total Portfolio Value
          </div>
          <div style={{ fontSize: "24px", fontWeight: "900", color: "var(--color-text-primary)", marginTop: "6px", whiteSpace: "nowrap" }}>
            ₹{(account?.total_portfolio_value ?? 100000).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: "11px", color: isProfit ? "var(--color-buy)" : "var(--color-sell)", marginTop: "4px", fontWeight: "700" }}>
            {isProfit ? "▲ +" : "▼ "}₹{Math.abs(account?.total_pnl ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({account?.total_pnl_pct.toFixed(2)}%)
          </div>
        </div>

        {/* Available Virtual Cash */}
        <div className="glass-panel" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700" }}>
            Available Virtual Cash
          </div>
          <div style={{ fontSize: "24px", fontWeight: "900", color: "#38bdf8", marginTop: "6px", whiteSpace: "nowrap" }}>
            ₹{(account?.available_cash ?? 100000).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
            Initial: ₹1,00,000.00
          </div>
        </div>

        {/* Total Invested */}
        <div className="glass-panel" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700" }}>
            Total Capital Invested
          </div>
          <div style={{ fontSize: "24px", fontWeight: "900", color: "var(--color-text-primary)", marginTop: "6px", whiteSpace: "nowrap" }}>
            ₹{(account?.total_invested ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
            {account?.holdings_count ?? 0} active position{account?.holdings_count === 1 ? "" : "s"}
          </div>
        </div>

        {/* Realized P&L */}
        <div className="glass-panel" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700" }}>
            Realized P&L
          </div>
          <div style={{ 
            fontSize: "24px", 
            fontWeight: "900", 
            color: (account?.realized_pnl ?? 0) >= 0 ? "var(--color-buy)" : "var(--color-sell)", 
            marginTop: "6px",
            whiteSpace: "nowrap"
          }}>
            {(account?.realized_pnl ?? 0) >= 0 ? "+" : ""}₹{(account?.realized_pnl ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
            Locked profits from closed trades
          </div>
        </div>

        {/* Unrealized P&L */}
        <div className="glass-panel" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700" }}>
            Unrealized P&L
          </div>
          <div style={{ 
            fontSize: "24px", 
            fontWeight: "900", 
            color: (account?.unrealized_pnl ?? 0) >= 0 ? "var(--color-buy)" : "var(--color-sell)", 
            marginTop: "6px",
            whiteSpace: "nowrap"
          }}>
            {(account?.unrealized_pnl ?? 0) >= 0 ? "+" : ""}₹{(account?.unrealized_pnl ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
            Open positions mark-to-market
          </div>
        </div>
      </div>

      {/* Holdings Section */}
      <div className="glass-panel" style={{ padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "800", color: "var(--color-text-primary)" }}>Active Simulated Holdings</h3>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>({account?.holdings.length ?? 0} stocks)</span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
            Market Value: <strong style={{ color: "var(--color-text-primary)" }}>₹{(account?.portfolio_market_value ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </div>
        </div>

        {(!account || account.holdings.length === 0) ? (
          <div style={{
            padding: "40px 20px",
            textAlign: "center",
            background: "rgba(0, 0, 0, 0.15)",
            borderRadius: "10px",
            border: "1px dashed var(--border-subtle)"
          }}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>📭</div>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--color-text-primary)" }}>No Active Paper Positions</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "4px", maxWidth: "420px", margin: "4px auto 16px auto" }}>
              You have ₹{(account?.available_cash ?? 100000).toLocaleString("en-IN", { minimumFractionDigits: 2 })} virtual cash available to trade. Click BUY on any stock across the dashboard to build your paper portfolio.
            </div>
            <button
              onClick={() => handleOpenTrade("RELIANCE", "BUY")}
              style={{
                padding: "8px 18px",
                borderRadius: "8px",
                background: "var(--color-buy)",
                border: "none",
                color: "#ffffff",
                fontWeight: "800",
                fontSize: "13px",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)"
              }}
            >
              + Buy First Stock
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--color-text-secondary)", fontSize: "11px", textTransform: "uppercase" }}>
                  <th style={{ padding: "10px 14px", textAlign: "left" }}>Stock Symbol</th>
                  <th style={{ padding: "10px 14px", textAlign: "right" }}>Shares Owned</th>
                  <th style={{ padding: "10px 14px", textAlign: "right" }}>Avg Buy Price</th>
                  <th style={{ padding: "10px 14px", textAlign: "right" }}>Current LTP</th>
                  <th style={{ padding: "10px 14px", textAlign: "right" }}>Invested Amount</th>
                  <th style={{ padding: "10px 14px", textAlign: "right" }}>Current Value</th>
                  <th style={{ padding: "10px 14px", textAlign: "right" }}>Unrealized P&L</th>
                  <th style={{ padding: "10px 14px", textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {account.holdings.map((h: PaperHolding) => {
                  const isPos = h.unrealized_pnl >= 0;
                  return (
                    <tr 
                      key={h.ticker} 
                      style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.03)", transition: "background 0.2s" }}
                      className="table-row-hover"
                    >
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span 
                            onClick={() => onSelectStock && onSelectStock(h.ticker)}
                            style={{ fontWeight: "800", color: "var(--accent-ml)", cursor: "pointer" }}
                          >
                            {h.ticker}
                          </span>
                          <span style={{ fontSize: "10px", color: "var(--color-text-muted)", background: "rgba(255, 255, 255, 0.04)", padding: "1px 6px", borderRadius: "4px" }}>
                            {h.sector}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: "700" }}>
                        {h.quantity}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                        ₹{h.avg_buy_price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: "700", color: "var(--color-text-primary)" }}>
                          ₹{h.current_price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: "10px", color: h.day_change_pct >= 0 ? "var(--color-buy)" : "var(--color-sell)" }}>
                          {h.day_change_pct >= 0 ? "+" : ""}{h.day_change_pct.toFixed(2)}%
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                        ₹{h.total_invested.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: "700", whiteSpace: "nowrap" }}>
                        ₹{h.market_value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: "800", color: isPos ? "var(--color-buy)" : "var(--color-sell)" }}>
                          {isPos ? "+" : ""}₹{h.unrealized_pnl.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: "10px", color: isPos ? "var(--color-buy)" : "var(--color-sell)", fontWeight: "600" }}>
                          ({isPos ? "+" : ""}{h.unrealized_pnl_pct.toFixed(2)}%)
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                          <button
                            onClick={() => handleOpenTrade(h.ticker, "BUY")}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "4px",
                              background: "rgba(16, 185, 129, 0.12)",
                              border: "1px solid var(--color-buy)",
                              color: "var(--color-buy)",
                              fontSize: "11px",
                              fontWeight: "700",
                              cursor: "pointer"
                            }}
                          >
                            + Buy More
                          </button>
                          <button
                            onClick={() => handleOpenTrade(h.ticker, "SELL")}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "4px",
                              background: "rgba(239, 68, 68, 0.12)",
                              border: "1px solid var(--color-sell)",
                              color: "var(--color-sell)",
                              fontSize: "11px",
                              fontWeight: "700",
                              cursor: "pointer"
                            }}
                          >
                            Sell
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trade History Section */}
      <div className="glass-panel" style={{ padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: "800", color: "var(--color-text-primary)" }}>Simulated Order Execution History</h3>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>
              All simulated market executions stored persistently in the database.
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: "6px" }}>
            {[
              { id: "ALL", label: "All Orders" },
              { id: "BUY", label: "BUY Only" },
              { id: "SELL", label: "SELL Only" }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setTxFilter(f.id as any)}
                style={{
                  fontSize: "11px",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  background: txFilter === f.id ? "var(--accent-ml)" : "rgba(255, 255, 255, 0.04)",
                  border: txFilter === f.id ? "1px solid var(--accent-ml)" : "1px solid var(--border-subtle)",
                  color: txFilter === f.id ? "#ffffff" : "var(--color-text-secondary)",
                  fontWeight: "700",
                  cursor: "pointer"
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {transactions.length === 0 ? (
          <div style={{ padding: "30px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "13px" }}>
            No simulated transactions executed yet.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--color-text-secondary)", fontSize: "10px", textTransform: "uppercase" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>Order ID</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>Execution Date & Time</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>Stock Symbol</th>
                  <th style={{ padding: "10px 12px", textAlign: "center" }}>Order Type</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Quantity</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Execution Price</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Total Amount</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Realized P&L</th>
                  <th style={{ padding: "10px 12px", textAlign: "center" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const isBuy = tx.order_type === "BUY";
                  const isSell = tx.order_type === "SELL";
                  const isReset = tx.order_type === "RESET";
                  return (
                    <tr 
                      key={tx.id} 
                      style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.03)" }}
                      className="table-row-hover"
                    >
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "var(--color-text-muted)" }}>
                        {tx.id}
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                        {tx.formatted_time || tx.timestamp}
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: "800", color: "var(--color-text-primary)" }}>
                        {tx.ticker}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "10px",
                          fontWeight: "800",
                          background: isBuy ? "rgba(16, 185, 129, 0.15)" : isSell ? "rgba(239, 68, 68, 0.15)" : "rgba(148, 163, 184, 0.15)",
                          color: isBuy ? "var(--color-buy)" : isSell ? "var(--color-sell)" : "var(--color-text-muted)",
                          border: isBuy ? "1px solid var(--color-buy)" : isSell ? "1px solid var(--color-sell)" : "1px solid var(--border-subtle)"
                        }}>
                          {tx.order_type}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: "700" }}>
                        {tx.quantity > 0 ? tx.quantity : "-"}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                        {tx.execution_price > 0 ? `₹${tx.execution_price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: "700", whiteSpace: "nowrap" }}>
                        ₹{tx.total_amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                        {isSell ? (
                          <span style={{ fontWeight: "800", color: tx.realized_pnl >= 0 ? "var(--color-buy)" : "var(--color-sell)" }}>
                            {tx.realized_pnl >= 0 ? "+" : ""}₹{tx.realized_pnl.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : "-"}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        <span style={{ fontSize: "10px", color: "var(--color-buy)", fontWeight: "700", padding: "1px 6px", background: "rgba(16, 185, 129, 0.08)", borderRadius: "3px" }}>
                          ✓ {tx.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Global Trade Modal */}
      <TradeModal
        isOpen={tradeModalOpen}
        onClose={() => setTradeModalOpen(false)}
        ticker={tradeTicker}
        initialOrderType={tradeType}
        currentPrice={activePrice}
        availableCash={account?.available_cash ?? 100000.0}
        ownedQuantity={activeOwnedQty}
        userId={activeUser.id}
        onTradeExecuted={(updatedAccount) => {
          setAccount(updatedAccount);
          if (onAccountUpdated) onAccountUpdated(updatedAccount);
          fetchPaperTransactions(activeUser.id, txFilter === "ALL" ? undefined : txFilter).then(setTransactions);
        }}
      />
    </div>
  );
}

