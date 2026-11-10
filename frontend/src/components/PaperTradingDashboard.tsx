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
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }} className="animate-fade-in">
      {/* Multi-User Selector Header Card */}
      <div className="glass-panel" style={{
        padding: "clamp(12px, 3vw, 18px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "12px",
        background: "linear-gradient(135deg, rgba(79, 70, 229, 0.08) 0%, rgba(15, 23, 42, 0.02) 100%)",
        border: "1px solid rgba(79, 70, 229, 0.25)",
        borderRadius: "12px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", width: "100%", justifyContent: "space-between", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", flex: "1 1 220px", minWidth: 0 }}>
            <span style={{ fontSize: "18px", flexShrink: 0 }}>👤</span>
            <label 
              htmlFor="select-trading-user"
              style={{ fontSize: "12px", fontWeight: "800", color: "var(--color-text-primary)", letterSpacing: "-0.2px", flexShrink: 0 }}
            >
              Trading User:
            </label>
            <select
              id="select-trading-user"
              value={activeUser.id}
              onChange={(e) => handleUserChange(e.target.value)}
              style={{
                fontSize: "12px",
                fontWeight: "800",
                padding: "6px 10px",
                borderRadius: "8px",
                background: "var(--bg-card)",
                color: "var(--accent-ml)",
                border: "1px solid rgba(79, 70, 229, 0.4)",
                cursor: "pointer",
                outline: "none",
                flex: "1 1 170px",
                maxWidth: "100%",
                minWidth: 0
              }}
            >
              {PAPER_TRADING_USERS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} (₹1,00,000 Portfolio)
                </option>
              ))}
            </select>
          </div>

          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 10px",
            borderRadius: "16px",
            background: "rgba(5, 150, 105, 0.1)",
            border: "1px solid rgba(5, 150, 105, 0.25)",
            color: "var(--color-buy)",
            fontSize: "11px",
            fontWeight: "700"
          }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--color-buy)" }}></span>
            <span>Active: <strong style={{ color: "var(--color-text-primary)" }}>{activeUser.name}</strong></span>
          </div>
        </div>
      </div>

      {/* Top Banner & Quick Controls */}
      <div className="glass-panel" style={{ padding: "clamp(12px, 3vw, 20px)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "20px" }}>📈</span>
            <h2 style={{ fontSize: "clamp(16px, 4.5vw, 18px)", fontWeight: "900", color: "var(--color-text-primary)", letterSpacing: "-0.4px", margin: 0 }}>
              Paper Trading Simulator
            </h2>
            <span style={{ 
              fontSize: "9px", 
              fontWeight: "800", 
              padding: "2px 6px", 
              borderRadius: "10px", 
              background: "rgba(5, 150, 105, 0.1)", 
              color: "var(--color-buy)",
              border: "1px solid rgba(5, 150, 105, 0.25)",
              textTransform: "uppercase"
            }}>
              Zero Risk
            </span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
            Execute simulated market trades with ₹1,00,000 virtual capital against live NSE quotes.
          </div>
        </div>

        {/* Quick Trade Selector & Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", width: "100%", justifyContent: "space-between", minWidth: 0 }}>
          <div style={{ flex: "1 1 180px", minWidth: 0 }}>
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
                width: "100%",
                maxWidth: "100%",
                minWidth: 0,
                fontSize: "12px",
                padding: "8px 10px",
                borderRadius: "8px",
                background: "var(--bg-card)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--border-subtle)",
                cursor: "pointer",
                outline: "none"
              }}
            >
              <option value="">🛒 + Quick Buy Stock (50 NSE)...</option>
              {stocks.map((s) => (
                <option key={s.ticker} value={s.ticker}>
                  {s.ticker} (₹{s.price.toLocaleString("en-IN", { maximumFractionDigits: 1 })})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={() => setResetConfirming(true)}
              style={{
                fontSize: "11px",
                padding: "7px 12px",
                borderRadius: "8px",
                background: "rgba(220, 38, 38, 0.08)",
                border: "1px solid rgba(220, 38, 38, 0.25)",
                color: "var(--color-sell)",
                fontWeight: "700",
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              🔄 Reset Funds
            </button>

            <button
              onClick={() => loadData(true)}
              style={{
                fontSize: "11px",
                padding: "7px 12px",
                borderRadius: "8px",
                background: "rgba(0, 0, 0, 0.02)",
                border: "1px solid var(--border-subtle)",
                color: "var(--color-text-secondary)",
                fontWeight: "600",
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              ↻ Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      {resetConfirming && (
        <div className="glass-panel" style={{
          padding: "16px 20px",
          background: "rgba(220, 38, 38, 0.08)",
          border: "1px solid var(--color-sell)",
          borderRadius: "10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px"
        }}>
          <div>
            <div style={{ fontWeight: "800", color: "var(--color-sell)", fontSize: "13px" }}>⚠️ Confirm Account Reset for {activeUser.name}</div>
            <div style={{ fontSize: "11px", color: "var(--color-text-primary)", marginTop: "2px" }}>
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
              {resetting ? "Resetting..." : `Yes, Reset ${activeUser.name}`}
            </button>
          </div>
        </div>
      )}

      {/* Metrics Summary Grid (Mobile Responsive 2-col on small screens) */}
      <div className="metrics-auto-grid">
        {/* Total Portfolio Value */}
        <div className="glass-panel" style={{ padding: "12px 14px" }}>
          <div style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", fontWeight: "700" }}>
            Portfolio Value
          </div>
          <div style={{ fontSize: "clamp(14px, 4vw, 20px)", fontWeight: "900", color: "var(--color-text-primary)", marginTop: "4px", overflowWrap: "anywhere" }}>
            ₹{(account?.total_portfolio_value ?? 100000).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </div>
          <div style={{ fontSize: "10px", color: isProfit ? "var(--color-buy)" : "var(--color-sell)", marginTop: "2px", fontWeight: "700" }}>
            {isProfit ? "▲ +" : "▼ "}₹{Math.abs(account?.total_pnl ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ({account?.total_pnl_pct.toFixed(2)}%)
          </div>
        </div>

        {/* Available Virtual Cash */}
        <div className="glass-panel" style={{ padding: "12px 14px" }}>
          <div style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", fontWeight: "700" }}>
            Virtual Cash
          </div>
          <div style={{ fontSize: "clamp(14px, 4vw, 20px)", fontWeight: "900", color: "#38bdf8", marginTop: "4px", overflowWrap: "anywhere" }}>
            ₹{(account?.available_cash ?? 100000).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </div>
          <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
            Initial: ₹1,00,000.00
          </div>
        </div>

        {/* Total Invested */}
        <div className="glass-panel" style={{ padding: "12px 14px" }}>
          <div style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", fontWeight: "700" }}>
            Capital Invested
          </div>
          <div style={{ fontSize: "clamp(14px, 4vw, 20px)", fontWeight: "900", color: "var(--color-text-primary)", marginTop: "4px", overflowWrap: "anywhere" }}>
            ₹{(account?.total_invested ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </div>
          <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
            {account?.holdings_count ?? 0} active position{account?.holdings_count === 1 ? "" : "s"}
          </div>
        </div>

        {/* Realized P&L */}
        <div className="glass-panel" style={{ padding: "12px 14px" }}>
          <div style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", fontWeight: "700" }}>
            Realized P&L
          </div>
          <div style={{ 
            fontSize: "clamp(14px, 4vw, 20px)", 
            fontWeight: "900", 
            color: (account?.realized_pnl ?? 0) >= 0 ? "var(--color-buy)" : "var(--color-sell)", 
            marginTop: "4px",
            overflowWrap: "anywhere"
          }}>
            {(account?.realized_pnl ?? 0) >= 0 ? "+" : ""}₹{(account?.realized_pnl ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </div>
          <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
            Closed trades
          </div>
        </div>

        {/* Unrealized P&L */}
        <div className="glass-panel" style={{ padding: "12px 14px" }}>
          <div style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", fontWeight: "700" }}>
            Unrealized P&L
          </div>
          <div style={{ 
            fontSize: "clamp(14px, 4vw, 20px)", 
            fontWeight: "900", 
            color: (account?.unrealized_pnl ?? 0) >= 0 ? "var(--color-buy)" : "var(--color-sell)", 
            marginTop: "4px",
            overflowWrap: "anywhere"
          }}>
            {(account?.unrealized_pnl ?? 0) >= 0 ? "+" : ""}₹{(account?.unrealized_pnl ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </div>
          <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
            Open positions MTM
          </div>
        </div>
      </div>

      {/* Holdings Section */}
      <div className="glass-panel" style={{ padding: "clamp(12px, 3vw, 18px)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: "800", color: "var(--color-text-primary)", margin: 0 }}>Active Simulated Holdings</h3>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>({account?.holdings.length ?? 0})</span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
            Holdings Value: <strong style={{ color: "var(--color-text-primary)" }}>₹{(account?.portfolio_market_value ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>
          </div>
        </div>

        {(!account || account.holdings.length === 0) ? (
          <div style={{
            padding: "36px 16px",
            textAlign: "center",
            background: "rgba(0, 0, 0, 0.02)",
            borderRadius: "10px",
            border: "1px dashed var(--border-subtle)"
          }}>
            <div style={{ fontSize: "28px", marginBottom: "6px" }}>📭</div>
            <div style={{ fontSize: "14px", fontWeight: "800", color: "var(--color-text-primary)" }}>No Active Paper Positions</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "4px", maxWidth: "420px", margin: "4px auto 14px auto" }}>
              You have ₹{(account?.available_cash ?? 100000).toLocaleString("en-IN", { minimumFractionDigits: 2 })} virtual cash. Buy any stock to start building your simulated portfolio.
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
                boxShadow: "0 4px 12px rgba(5, 150, 105, 0.3)"
              }}
            >
              + Buy First Stock
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="table-desktop-view table-responsive-wrapper">
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
                        style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.15s" }}
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
                            <span style={{ fontSize: "10px", color: "var(--color-text-muted)", background: "rgba(0, 0, 0, 0.04)", padding: "1px 6px", borderRadius: "4px" }}>
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
                                background: "rgba(5, 150, 105, 0.12)",
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
                                background: "rgba(220, 38, 38, 0.12)",
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

            {/* Mobile Cards View for Holdings */}
            <div className="cards-mobile-view" style={{ flexDirection: "column", gap: "10px" }}>
              {account.holdings.map((h: PaperHolding) => {
                const isPos = h.unrealized_pnl >= 0;
                return (
                  <div 
                    key={h.ticker}
                    className="glass-panel"
                    style={{
                      padding: "14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      borderRadius: "12px",
                      border: "1px solid var(--border-subtle)",
                      background: "var(--bg-card)"
                    }}
                  >
                    {/* Top Row: Symbol, Sector and P&L Badge */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <span 
                            onClick={() => onSelectStock && onSelectStock(h.ticker)}
                            style={{ fontSize: "16px", fontWeight: "900", color: "var(--accent-ml)", cursor: "pointer" }}
                          >
                            {h.ticker}
                          </span>
                          <span style={{ fontSize: "10px", color: "var(--color-text-muted)", background: "rgba(0,0,0,0.04)", padding: "1px 6px", borderRadius: "4px" }}>
                            {h.sector}
                          </span>
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                          {h.quantity} shares • Avg: ₹{h.avg_buy_price.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{
                          fontSize: "12px",
                          fontWeight: "800",
                          color: isPos ? "var(--color-buy)" : "var(--color-sell)",
                          background: isPos ? "rgba(5, 150, 105, 0.08)" : "rgba(220, 38, 38, 0.08)",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          display: "inline-block"
                        }}>
                          {isPos ? "▲ +" : "▼ "}₹{Math.abs(h.unrealized_pnl).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </div>
                        <div style={{ fontSize: "10px", color: isPos ? "var(--color-buy)" : "var(--color-sell)", fontWeight: "700", marginTop: "1px" }}>
                          ({isPos ? "+" : ""}{h.unrealized_pnl_pct.toFixed(2)}%)
                        </div>
                      </div>
                    </div>

                    {/* Middle Row: LTP, Invested, Current Value */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: "6px",
                      background: "rgba(0,0,0,0.02)",
                      padding: "8px 8px",
                      borderRadius: "8px",
                      textAlign: "center"
                    }}>
                      <div>
                        <div style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>LTP</div>
                        <div style={{ fontSize: "12px", fontWeight: "800", color: "var(--color-text-primary)", marginTop: "1px" }}>
                          ₹{h.current_price.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>INVESTED</div>
                        <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--color-text-secondary)", marginTop: "1px" }}>
                          ₹{h.total_invested.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>VALUE</div>
                        <div style={{ fontSize: "12px", fontWeight: "800", color: "var(--color-text-primary)", marginTop: "1px" }}>
                          ₹{h.market_value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Buy More & Sell Buttons */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "2px" }}>
                      <button
                        onClick={() => handleOpenTrade(h.ticker, "BUY")}
                        style={{
                          padding: "8px",
                          borderRadius: "8px",
                          background: "rgba(5, 150, 105, 0.08)",
                          border: "1px solid rgba(5, 150, 105, 0.3)",
                          color: "var(--color-buy)",
                          fontSize: "12px",
                          fontWeight: "800",
                          cursor: "pointer",
                          minHeight: "40px"
                        }}
                      >
                        + Buy More
                      </button>
                      <button
                        onClick={() => handleOpenTrade(h.ticker, "SELL")}
                        style={{
                          padding: "8px",
                          borderRadius: "8px",
                          background: "rgba(220, 38, 38, 0.08)",
                          border: "1px solid rgba(220, 38, 38, 0.3)",
                          color: "var(--color-sell)",
                          fontSize: "12px",
                          fontWeight: "800",
                          cursor: "pointer",
                          minHeight: "40px"
                        }}
                      >
                        Sell
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Trade History Section */}
      <div className="glass-panel" style={{ padding: "18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <h3 style={{ fontSize: "15px", fontWeight: "800", color: "var(--color-text-primary)", margin: 0 }}>Simulated Order History</h3>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>
              All simulated market executions for {activeUser.name}.
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: "4px" }}>
            {[
              { id: "ALL", label: "All" },
              { id: "BUY", label: "BUY" },
              { id: "SELL", label: "SELL" }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setTxFilter(f.id as any)}
                style={{
                  fontSize: "11px",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  background: txFilter === f.id ? "var(--accent-ml)" : "rgba(0, 0, 0, 0.03)",
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
          <div style={{ padding: "28px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "12px" }}>
            No simulated transactions executed yet for {activeUser.name}.
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="table-desktop-view table-responsive-wrapper">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--color-text-secondary)", fontSize: "10px", textTransform: "uppercase" }}>
                    <th style={{ padding: "10px 12px", textAlign: "left" }}>Order ID</th>
                    <th style={{ padding: "10px 12px", textAlign: "left" }}>Date & Time</th>
                    <th style={{ padding: "10px 12px", textAlign: "left" }}>Stock Symbol</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Order Type</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Quantity</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Price</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Total Amount</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Realized P&L</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const isBuy = tx.order_type === "BUY";
                    const isSell = tx.order_type === "SELL";
                    return (
                      <tr 
                        key={tx.id} 
                        style={{ borderBottom: "1px solid var(--border-subtle)" }}
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
                            background: isBuy ? "rgba(5, 150, 105, 0.12)" : isSell ? "rgba(220, 38, 38, 0.12)" : "rgba(100, 116, 139, 0.12)",
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
                              {tx.realized_pnl >= 0 ? "+" : ""}₹{tx.realized_pnl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          ) : "-"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <span style={{ fontSize: "10px", color: "var(--color-buy)", fontWeight: "700", padding: "1px 6px", background: "rgba(5, 150, 105, 0.08)", borderRadius: "3px" }}>
                            ✓ {tx.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View for Order History */}
            <div className="cards-mobile-view" style={{ flexDirection: "column", gap: "8px" }}>
              {transactions.map((tx) => {
                const isBuy = tx.order_type === "BUY";
                const isSell = tx.order_type === "SELL";
                return (
                  <div 
                    key={tx.id}
                    className="glass-panel"
                    style={{
                      padding: "12px 14px",
                      borderRadius: "10px",
                      border: "1px solid var(--border-subtle)",
                      background: "var(--bg-card)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "10px",
                          fontWeight: "800",
                          background: isBuy ? "rgba(5, 150, 105, 0.12)" : isSell ? "rgba(220, 38, 38, 0.12)" : "rgba(100, 116, 139, 0.12)",
                          color: isBuy ? "var(--color-buy)" : isSell ? "var(--color-sell)" : "var(--color-text-muted)",
                          border: `1px solid ${isBuy ? "rgba(5, 150, 105, 0.3)" : isSell ? "rgba(220, 38, 38, 0.3)" : "var(--border-subtle)"}`
                        }}>
                          {tx.order_type}
                        </span>
                        <span style={{ fontWeight: "900", color: "var(--color-text-primary)", fontSize: "14px" }}>
                          {tx.ticker}
                        </span>
                      </div>

                      <span style={{ fontWeight: "800", color: "var(--color-text-primary)", fontSize: "13px" }}>
                        ₹{tx.total_amount.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px", fontSize: "11px", color: "var(--color-text-secondary)" }}>
                      <span>{tx.quantity > 0 ? `${tx.quantity} shares @ ₹${tx.execution_price.toLocaleString("en-IN", { maximumFractionDigits: 1 })}` : "Account Reset"}</span>
                      <span style={{ color: "var(--color-buy)", fontWeight: "700" }}>✓ {tx.status}</span>
                    </div>

                    {isSell && (
                      <div style={{ fontSize: "11px", display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border-subtle)", paddingTop: "4px" }}>
                        <span style={{ color: "var(--color-text-muted)" }}>Realized P&L:</span>
                        <span style={{ fontWeight: "800", color: tx.realized_pnl >= 0 ? "var(--color-buy)" : "var(--color-sell)" }}>
                          {tx.realized_pnl >= 0 ? "+" : ""}₹{tx.realized_pnl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    <div style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
                      {tx.formatted_time || tx.timestamp}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
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
