"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  PaperAccount, 
  PaperTransaction, 
  PaperHolding,
  FuturesPosition,
  PendingFuturesOrder,
  ClosedFuturesPosition,
  fetchPaperAccount, 
  fetchPaperTransactions, 
  closeFuturesPosition,
  cancelFuturesOrder,
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
import FuturesTradeModal from "./FuturesTradeModal";

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
  const [txFilter, setTxFilter] = useState<"ALL" | "BUY" | "SELL" | "FUTURES">("ALL");
  const [loading, setLoading] = useState<boolean>(!initialAccount && !account);
  const [error, setError] = useState<string | null>(null);
  const [resetConfirming, setResetConfirming] = useState<boolean>(false);
  const [resetting, setResetting] = useState<boolean>(false);
  const [futuresBanner, setFuturesBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
  const closingIdsRef = useRef<Set<string>>(new Set());
  const cancellingIdsRef = useRef<Set<string>>(new Set());

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
    setFuturesBanner(null);
    const cached = getLocalPaperAccount(user.id);
    setAccount(cached);
    const cachedTxs = getLocalPaperTransactions(user.id);
    setTransactions(cachedTxs);
  };

  // Equity Trade Modal state
  const [tradeModalOpen, setTradeModalOpen] = useState<boolean>(false);
  const [tradeTicker, setTradeTicker] = useState<string>("RELIANCE");
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY");
  const [selectedQuickStock, setSelectedQuickStock] = useState<string>("");

  // Futures Trade Modal state
  const [futuresModalOpen, setFuturesModalOpen] = useState<boolean>(false);
  const [futuresTicker, setFuturesTicker] = useState<string>("HINDALCO");
  const [futuresSide, setFuturesSide] = useState<"BUY" | "SELL">("BUY");
  const [futuresLots, setFuturesLots] = useState<number>(1);
  const [selectedQuickFutures, setSelectedQuickFutures] = useState<string>("");

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

  const handleOpenFuturesTrade = (ticker: string, side: "BUY" | "SELL" = "BUY", lots = 1) => {
    setFuturesTicker(ticker);
    setFuturesSide(side);
    setFuturesLots(lots);
    setFuturesModalOpen(true);
  };

  const handleCloseFutures = async (pos: FuturesPosition) => {
    if (closingIdsRef.current.has(pos.id)) return;
    closingIdsRef.current.add(pos.id);
    setClosingIds(new Set(closingIdsRef.current));
    setFuturesBanner(null);

    try {
      const idemKey = `FUTCLOSE-${pos.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await closeFuturesPosition(activeUser.id, pos.id, idemKey);
      setAccount(res.account);
      if (onAccountUpdated) onAccountUpdated(res.account);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("paper-account-updated", {
            detail: { userId: activeUser.id, account: res.account, order: res.order },
          })
        );
      }
      const filterType = txFilter === "ALL" ? undefined : txFilter;
      fetchPaperTransactions(activeUser.id, filterType).then(setTransactions);
      setFuturesBanner({
        type: "success",
        message: res.order?.message || `Closed ${pos.contract_symbol}`,
      });
    } catch (err: any) {
      setFuturesBanner({
        type: "error",
        message: err?.message || `Failed to close ${pos.contract_symbol}`,
      });
    } finally {
      closingIdsRef.current.delete(pos.id);
      setClosingIds(new Set(closingIdsRef.current));
    }
  };

  const handleCancelPendingFutures = async (ord: PendingFuturesOrder) => {
    if (cancellingIdsRef.current.has(ord.id)) return;
    cancellingIdsRef.current.add(ord.id);
    setCancellingIds(new Set(cancellingIdsRef.current));
    setFuturesBanner(null);

    try {
      const res = await cancelFuturesOrder(activeUser.id, ord.id);
      setAccount(res.account);
      if (onAccountUpdated) onAccountUpdated(res.account);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("paper-account-updated", {
            detail: { userId: activeUser.id, account: res.account },
          })
        );
      }
      const filterType = txFilter === "ALL" ? undefined : txFilter;
      fetchPaperTransactions(activeUser.id, filterType).then(setTransactions);
      setFuturesBanner({
        type: "success",
        message: res.cancel?.message || `Cancelled pending order for ${ord.contract_symbol}`,
      });
    } catch (err: any) {
      setFuturesBanner({
        type: "error",
        message: err?.message || `Failed to cancel order for ${ord.contract_symbol}`,
      });
    } finally {
      cancellingIdsRef.current.delete(ord.id);
      setCancellingIds(new Set(cancellingIdsRef.current));
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await resetPaperAccount(activeUser.id);
      setAccount(res.account);
      if (onAccountUpdated) onAccountUpdated(res.account);
      setFuturesBanner(null);
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
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", flex: "1 1 320px", minWidth: 0 }}>
            <div style={{ flex: "1 1 160px", minWidth: 0 }}>
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

            <div style={{ flex: "1 1 160px", minWidth: 0 }}>
              <select
                value={selectedQuickFutures}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    handleOpenFuturesTrade(val, "BUY", 1);
                    setSelectedQuickFutures("");
                  }
                }}
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  minWidth: 0,
                  fontSize: "12px",
                  fontWeight: "700",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  background: "rgba(79, 70, 229, 0.06)",
                  color: "var(--accent-ml)",
                  border: "1px solid rgba(79, 70, 229, 0.35)",
                  cursor: "pointer",
                  outline: "none"
                }}
              >
                <option value="">⚡ + Trade NSE Futures (50)...</option>
                {stocks.map((s) => (
                  <option key={s.ticker} value={s.ticker}>
                    {s.ticker} FUT (Spot ₹{s.price.toLocaleString("en-IN", { maximumFractionDigits: 1 })})
                  </option>
                ))}
              </select>
            </div>
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
              Are you sure? This will wipe <strong>{activeUser.name}</strong>&apos;s simulated Equity holdings and Futures positions and restore virtual cash back to ₹1,00,000 without affecting other traders.
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
            {account?.holdings_count ?? 0} eq • {account?.futures_count ?? (account?.futures_positions?.length ?? 0)} fut
            {(account?.futures_margin_blocked ?? 0) > 0
              ? ` (Margin: ₹${(account?.futures_margin_blocked ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })})`
              : ""}
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
            Closed Equity &amp; Futures
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
            {(account?.futures_positions?.length ?? 0) > 0
              ? `Eq ${(account?.equity_unrealized_pnl ?? 0) >= 0 ? "+" : ""}₹${(account?.equity_unrealized_pnl ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })} • Fut ${(account?.futures_unrealized_pnl ?? 0) >= 0 ? "+" : ""}₹${(account?.futures_unrealized_pnl ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
              : "Open positions MTM"}
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

      {/* Active Futures Portfolio Section */}
      <div className="glass-panel" style={{ padding: "clamp(12px, 3vw, 18px)", border: "1px solid rgba(79, 70, 229, 0.25)" }} data-testid="futures-portfolio-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <h3 style={{ fontSize: "15px", fontWeight: "800", color: "var(--color-text-primary)", margin: 0 }}>
              ⚡ Active Futures Positions
            </h3>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
              ({account?.futures_positions?.length ?? 0})
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", fontSize: "11px", color: "var(--color-text-muted)" }}>
            <span>
              Margin Blocked: <strong style={{ color: "var(--color-text-primary)" }}>₹{(account?.futures_margin_blocked ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>
            </span>
            <span>
              Futures MTM:{" "}
              <strong style={{ color: (account?.futures_unrealized_pnl ?? 0) >= 0 ? "var(--color-buy)" : "var(--color-sell)" }}>
                {(account?.futures_unrealized_pnl ?? 0) >= 0 ? "+" : ""}₹{(account?.futures_unrealized_pnl ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => handleOpenFuturesTrade("HINDALCO", "BUY", 1)}
              style={{
                padding: "5px 10px",
                borderRadius: "6px",
                background: "var(--accent-ml)",
                border: "none",
                color: "#ffffff",
                fontSize: "11px",
                fontWeight: "800",
                cursor: "pointer"
              }}
            >
              + Trade Futures
            </button>
          </div>
        </div>

        {futuresBanner && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px 12px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: "600",
              background: futuresBanner.type === "success" ? "rgba(5, 150, 105, 0.1)" : "rgba(220, 38, 38, 0.1)",
              border: `1px solid ${futuresBanner.type === "success" ? "var(--color-buy)" : "var(--color-sell)"}`,
              color: futuresBanner.type === "success" ? "var(--color-buy)" : "var(--color-sell)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <span>{futuresBanner.type === "success" ? "✅ " : "⚠️ "}{futuresBanner.message}</span>
            <button
              type="button"
              onClick={() => setFuturesBanner(null)}
              style={{ background: "transparent", border: "none", padding: "0 4px", fontSize: "12px", cursor: "pointer", color: "inherit" }}
            >
              ✕
            </button>
          </div>
        )}

        {(!account?.futures_positions || account.futures_positions.length === 0) ? (
          <div style={{
            padding: "30px 16px",
            textAlign: "center",
            background: "rgba(0, 0, 0, 0.02)",
            borderRadius: "10px",
            border: "1px dashed var(--border-subtle)"
          }}>
            <div style={{ fontSize: "24px", marginBottom: "6px" }}>📜</div>
            <div style={{ fontSize: "14px", fontWeight: "800", color: "var(--color-text-primary)" }}>No Active Futures Positions</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", maxWidth: "440px", margin: "4px auto 14px auto" }}>
              Trade simulated NSE Stock Futures using exchange-defined lot sizes (e.g., HINDALCO 1 lot = 700 shares) with 5% virtual margin.
            </div>
            <button
              type="button"
              onClick={() => handleOpenFuturesTrade("HINDALCO", "BUY", 1)}
              style={{
                padding: "8px 18px",
                borderRadius: "8px",
                background: "var(--accent-ml)",
                border: "none",
                color: "#ffffff",
                fontWeight: "800",
                fontSize: "13px",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(79, 70, 229, 0.3)"
              }}
            >
              + Trade First Futures Contract
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Futures Table */}
            <div className="table-desktop-view table-responsive-wrapper">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--color-text-secondary)", fontSize: "10.5px", textTransform: "uppercase" }}>
                    <th style={{ padding: "10px 12px", textAlign: "left" }}>Stock &amp; Contract</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Side</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Lots &amp; Lot Size</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Total Shares</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Entry Price</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Current FUT</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Margin Blocked</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Unrealized P&amp;L</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {account.futures_positions.map((pos: FuturesPosition) => {
                    const isPos = pos.unrealized_pnl >= 0;
                    const isLong = pos.side === "BUY";
                    const isClosing = closingIds.has(pos.id);
                    return (
                      <tr key={pos.id} style={{ borderBottom: "1px solid var(--border-subtle)" }} className="table-row-hover">
                        <td style={{ padding: "12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span
                              onClick={() => onSelectStock && onSelectStock(pos.ticker)}
                              style={{ fontWeight: "800", color: "var(--accent-ml)", cursor: "pointer" }}
                            >
                              {pos.ticker}
                            </span>
                            <span style={{ fontSize: "9.5px", fontWeight: "700", color: "var(--color-text-muted)", background: "rgba(0,0,0,0.04)", padding: "1px 5px", borderRadius: "4px" }}>
                              {pos.exchange}
                            </span>
                          </div>
                          <div style={{ fontSize: "10.5px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                            {pos.contract_symbol} • Exp {pos.expiry_formatted}
                          </div>
                        </td>
                        <td style={{ padding: "12px", textAlign: "center" }}>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "10px",
                              fontWeight: "800",
                              background: isLong ? "rgba(5, 150, 105, 0.12)" : "rgba(220, 38, 38, 0.12)",
                              color: isLong ? "var(--color-buy)" : "var(--color-sell)",
                              border: `1px solid ${isLong ? "var(--color-buy)" : "var(--color-sell)"}`,
                            }}
                          >
                            {pos.side}
                          </span>
                        </td>
                        <td style={{ padding: "12px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <span style={{ fontWeight: "800" }}>{pos.lots} lot{pos.lots === 1 ? "" : "s"}</span>
                          <div style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
                            Lot: {pos.lot_size.toLocaleString("en-IN")}
                          </div>
                        </td>
                        <td style={{ padding: "12px", textAlign: "right", fontWeight: "800" }}>
                          {pos.total_quantity.toLocaleString("en-IN")}
                        </td>
                        <td style={{ padding: "12px", textAlign: "right", whiteSpace: "nowrap" }}>
                          ₹{pos.entry_price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: "12px", textAlign: "right", fontWeight: "700", whiteSpace: "nowrap" }}>
                          ₹{pos.current_futures_price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: "12px", textAlign: "right", fontWeight: "700", whiteSpace: "nowrap" }}>
                          ₹{pos.margin_blocked.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: "12px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: "800", color: isPos ? "var(--color-buy)" : "var(--color-sell)" }}>
                            {isPos ? "+" : ""}₹{pos.unrealized_pnl.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div style={{ fontSize: "10px", color: isPos ? "var(--color-buy)" : "var(--color-sell)", fontWeight: "700" }}>
                            ({isPos ? "+" : ""}{pos.unrealized_pnl_pct.toFixed(2)}% on margin)
                          </div>
                        </td>
                        <td style={{ padding: "12px", textAlign: "center" }}>
                          <button
                            type="button"
                            disabled={isClosing}
                            onClick={() => handleCloseFutures(pos)}
                            style={{
                              padding: "5px 10px",
                              borderRadius: "6px",
                              background: "rgba(220, 38, 38, 0.1)",
                              border: "1px solid var(--color-sell)",
                              color: "var(--color-sell)",
                              fontSize: "11px",
                              fontWeight: "800",
                              cursor: isClosing ? "not-allowed" : "pointer",
                              opacity: isClosing ? 0.6 : 1,
                              whiteSpace: "nowrap"
                            }}
                          >
                            {isClosing ? "Closing..." : "Close Position"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View for Futures Positions */}
            <div className="cards-mobile-view" style={{ flexDirection: "column", gap: "10px" }}>
              {account.futures_positions.map((pos: FuturesPosition) => {
                const isPos = pos.unrealized_pnl >= 0;
                const isLong = pos.side === "BUY";
                const isClosing = closingIds.has(pos.id);
                return (
                  <div
                    key={pos.id}
                    className="glass-panel"
                    style={{
                      padding: "14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      borderRadius: "12px",
                      border: "1px solid rgba(79, 70, 229, 0.2)",
                      background: "var(--bg-card)"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <span
                            onClick={() => onSelectStock && onSelectStock(pos.ticker)}
                            style={{ fontSize: "16px", fontWeight: "900", color: "var(--accent-ml)", cursor: "pointer" }}
                          >
                            {pos.ticker}
                          </span>
                          <span
                            style={{
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "10px",
                              fontWeight: "800",
                              background: isLong ? "rgba(5, 150, 105, 0.12)" : "rgba(220, 38, 38, 0.12)",
                              color: isLong ? "var(--color-buy)" : "var(--color-sell)",
                            }}
                          >
                            {pos.side} FUT
                          </span>
                          <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>{pos.expiry_formatted}</span>
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                          {pos.lots} lot{pos.lots === 1 ? "" : "s"} × {pos.lot_size.toLocaleString("en-IN")} = <strong>{pos.total_quantity.toLocaleString("en-IN")} shares</strong>
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: "800",
                            color: isPos ? "var(--color-buy)" : "var(--color-sell)",
                            background: isPos ? "rgba(5, 150, 105, 0.08)" : "rgba(220, 38, 38, 0.08)",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            display: "inline-block"
                          }}
                        >
                          {isPos ? "▲ +" : "▼ "}₹{Math.abs(pos.unrealized_pnl).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </div>
                        <div style={{ fontSize: "10px", color: isPos ? "var(--color-buy)" : "var(--color-sell)", fontWeight: "700", marginTop: "1px" }}>
                          ({isPos ? "+" : ""}{pos.unrealized_pnl_pct.toFixed(2)}%)
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: "6px",
                        background: "rgba(0,0,0,0.02)",
                        padding: "8px",
                        borderRadius: "8px",
                        textAlign: "center"
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>ENTRY FUT</div>
                        <div style={{ fontSize: "12px", fontWeight: "800", color: "var(--color-text-primary)", marginTop: "1px" }}>
                          ₹{pos.entry_price.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>CURR FUT</div>
                        <div style={{ fontSize: "12px", fontWeight: "800", color: "var(--accent-ml)", marginTop: "1px" }}>
                          ₹{pos.current_futures_price.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>MARGIN</div>
                        <div style={{ fontSize: "12px", fontWeight: "800", color: "var(--color-text-primary)", marginTop: "1px" }}>
                          ₹{pos.margin_blocked.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isClosing}
                      onClick={() => handleCloseFutures(pos)}
                      style={{
                        width: "100%",
                        padding: "9px",
                        borderRadius: "8px",
                        background: "rgba(220, 38, 38, 0.08)",
                        border: "1px solid rgba(220, 38, 38, 0.35)",
                        color: "var(--color-sell)",
                        fontSize: "12px",
                        fontWeight: "800",
                        cursor: isClosing ? "not-allowed" : "pointer",
                        minHeight: "40px",
                        opacity: isClosing ? 0.6 : 1
                      }}
                    >
                      {isClosing ? "Closing Position..." : `Close Position (${pos.total_quantity.toLocaleString("en-IN")} sh)`}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Pending Limit Futures Orders (If Any) */}
        {(account?.pending_futures_orders?.length ?? 0) > 0 && (
          <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--border-subtle)" }}>
            <h4 style={{ fontSize: "13px", fontWeight: "800", color: "var(--color-text-primary)", marginBottom: "8px" }}>
              ⏳ Pending Limit Futures Orders ({account?.pending_futures_orders?.length ?? 0})
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {account!.pending_futures_orders!.map((ord: PendingFuturesOrder) => {
                const isCancelling = cancellingIds.has(ord.id);
                return (
                  <div
                    key={ord.id}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: "rgba(217, 119, 6, 0.06)",
                      border: "1px solid rgba(217, 119, 6, 0.3)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "8px",
                      fontSize: "12px"
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <strong style={{ color: "var(--color-text-primary)" }}>{ord.contract_symbol}</strong>
                        <span style={{ fontSize: "10px", fontWeight: "800", color: ord.side === "BUY" ? "var(--color-buy)" : "var(--color-sell)" }}>
                          {ord.side} LIMIT
                        </span>
                        <span style={{ fontSize: "10.5px", color: "var(--color-text-secondary)" }}>
                          {ord.lots} lot(s) × {ord.lot_size} = {ord.total_quantity} sh
                        </span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                        Limit: <strong>₹{ord.limit_price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong> • Live FUT: ₹{ord.current_futures_price.toLocaleString("en-IN", { minimumFractionDigits: 2 })} • Margin Held: ₹{ord.margin_blocked.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isCancelling}
                      onClick={() => handleCancelPendingFutures(ord)}
                      style={{
                        padding: "5px 10px",
                        borderRadius: "6px",
                        background: "rgba(220, 38, 38, 0.08)",
                        border: "1px solid var(--color-sell)",
                        color: "var(--color-sell)",
                        fontSize: "11px",
                        fontWeight: "800",
                        cursor: isCancelling ? "not-allowed" : "pointer"
                      }}
                    >
                      {isCancelling ? "Cancelling..." : "Cancel Order"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Closed Futures Trades Summary (If Any) */}
        {(account?.closed_futures_positions?.length ?? 0) > 0 && (
          <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--border-subtle)" }}>
            <h4 style={{ fontSize: "13px", fontWeight: "800", color: "var(--color-text-primary)", marginBottom: "8px" }}>
              ✅ Recently Closed Futures ({account?.closed_futures_positions?.length ?? 0})
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "8px" }}>
              {account!.closed_futures_positions!.slice(0, 6).map((cp: ClosedFuturesPosition) => {
                const isGain = cp.realized_pnl >= 0;
                return (
                  <div
                    key={cp.id}
                    style={{
                      padding: "8px 10px",
                      borderRadius: "8px",
                      background: "rgba(0,0,0,0.02)",
                      border: "1px solid var(--border-subtle)",
                      fontSize: "11px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "8px"
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: "800", color: "var(--color-text-primary)" }}>
                        {cp.contract_symbol} ({cp.side})
                      </div>
                      <div style={{ color: "var(--color-text-muted)", fontSize: "10px" }}>
                        {cp.total_quantity.toLocaleString("en-IN")} sh • ₹{cp.entry_price.toFixed(2)} → ₹{cp.exit_price.toFixed(2)}
                      </div>
                    </div>
                    <span style={{ fontWeight: "900", color: isGain ? "var(--color-buy)" : "var(--color-sell)", whiteSpace: "nowrap" }}>
                      {isGain ? "+" : ""}₹{cp.realized_pnl.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Trade History Section */}
      <div className="glass-panel" style={{ padding: "18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <h3 style={{ fontSize: "15px", fontWeight: "800", color: "var(--color-text-primary)", margin: 0 }}>Simulated Order History</h3>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>
              All simulated Equity &amp; Futures executions for {activeUser.name}.
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {[
              { id: "ALL", label: "All" },
              { id: "BUY", label: "BUY" },
              { id: "SELL", label: "SELL" },
              { id: "FUTURES", label: "Futures" }
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
                    <th style={{ padding: "10px 12px", textAlign: "left" }}>Stock / Contract</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Order Type</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Quantity</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Price</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Value / Margin</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Realized P&L</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const isBuy = tx.order_type === "BUY" || tx.order_type === "FUTURES_BUY";
                    const isSell = tx.order_type === "SELL" || tx.order_type === "FUTURES_SELL";
                    const isFutClose = tx.order_type === "FUTURES_CLOSE";
                    const hasRealized = tx.order_type === "SELL" || isFutClose;
                    const isPending = tx.status === "PENDING_LIMIT";
                    const isCancelled = tx.status === "CANCELLED";
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
                          <div>{tx.ticker}</div>
                          {tx.contract_symbol && (
                            <div style={{ fontSize: "10px", fontWeight: "600", color: "var(--color-text-muted)" }}>
                              {tx.contract_symbol}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <span style={{
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "10px",
                            fontWeight: "800",
                            background: isBuy ? "rgba(5, 150, 105, 0.12)" : isSell ? "rgba(220, 38, 38, 0.12)" : isFutClose ? "rgba(79, 70, 229, 0.12)" : "rgba(100, 116, 139, 0.12)",
                            color: isBuy ? "var(--color-buy)" : isSell ? "var(--color-sell)" : isFutClose ? "var(--accent-ml)" : "var(--color-text-muted)",
                            border: isBuy ? "1px solid var(--color-buy)" : isSell ? "1px solid var(--color-sell)" : isFutClose ? "1px solid var(--accent-ml)" : "1px solid var(--border-subtle)",
                            whiteSpace: "nowrap"
                          }}>
                            {tx.order_type}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: "700", whiteSpace: "nowrap" }}>
                          {tx.quantity > 0 ? (
                            <>
                              {tx.quantity.toLocaleString("en-IN")}
                              {(tx.lots ?? 0) > 0 && (tx.lot_size ?? 0) > 0 && (
                                <div style={{ fontSize: "9.5px", color: "var(--color-text-muted)", fontWeight: "600" }}>
                                  {tx.lots}×{tx.lot_size}
                                </div>
                              )}
                            </>
                          ) : "-"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {tx.execution_price > 0 ? `₹${tx.execution_price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: "700", whiteSpace: "nowrap" }}>
                          ₹{tx.total_amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {hasRealized ? (
                            <span style={{ fontWeight: "800", color: tx.realized_pnl >= 0 ? "var(--color-buy)" : "var(--color-sell)" }}>
                              {tx.realized_pnl >= 0 ? "+" : ""}₹{tx.realized_pnl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          ) : "-"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <span style={{
                            fontSize: "10px",
                            color: isPending ? "var(--color-hold)" : isCancelled ? "var(--color-text-muted)" : "var(--color-buy)",
                            fontWeight: "700",
                            padding: "1px 6px",
                            background: isPending ? "rgba(217, 119, 6, 0.1)" : isCancelled ? "rgba(100, 116, 139, 0.1)" : "rgba(5, 150, 105, 0.08)",
                            borderRadius: "3px",
                            whiteSpace: "nowrap"
                          }}>
                            {isPending ? "⏳ " : isCancelled ? "✕ " : "✓ "}{tx.status}
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
                const isBuy = tx.order_type === "BUY" || tx.order_type === "FUTURES_BUY";
                const isSell = tx.order_type === "SELL" || tx.order_type === "FUTURES_SELL";
                const isFutClose = tx.order_type === "FUTURES_CLOSE";
                const hasRealized = tx.order_type === "SELL" || isFutClose;
                const isPending = tx.status === "PENDING_LIMIT";
                const isCancelled = tx.status === "CANCELLED";
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
                          background: isBuy ? "rgba(5, 150, 105, 0.12)" : isSell ? "rgba(220, 38, 38, 0.12)" : isFutClose ? "rgba(79, 70, 229, 0.12)" : "rgba(100, 116, 139, 0.12)",
                          color: isBuy ? "var(--color-buy)" : isSell ? "var(--color-sell)" : isFutClose ? "var(--accent-ml)" : "var(--color-text-muted)",
                          border: `1px solid ${isBuy ? "rgba(5, 150, 105, 0.3)" : isSell ? "rgba(220, 38, 38, 0.3)" : isFutClose ? "rgba(79, 70, 229, 0.3)" : "var(--border-subtle)"}`
                        }}>
                          {tx.order_type}
                        </span>
                        <span style={{ fontWeight: "900", color: "var(--color-text-primary)", fontSize: "14px" }}>
                          {tx.contract_symbol || tx.ticker}
                        </span>
                      </div>

                      <span style={{ fontWeight: "800", color: "var(--color-text-primary)", fontSize: "13px" }}>
                        ₹{tx.total_amount.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px", fontSize: "11px", color: "var(--color-text-secondary)" }}>
                      <span>
                        {tx.quantity > 0
                          ? (tx.lots && tx.lot_size
                              ? `${tx.lots} lot × ${tx.lot_size} (${tx.quantity} sh) @ ₹${tx.execution_price.toLocaleString("en-IN", { maximumFractionDigits: 1 })}`
                              : `${tx.quantity} shares @ ₹${tx.execution_price.toLocaleString("en-IN", { maximumFractionDigits: 1 })}`)
                          : "Account Reset"}
                      </span>
                      <span style={{ color: isPending ? "var(--color-hold)" : isCancelled ? "var(--color-text-muted)" : "var(--color-buy)", fontWeight: "700" }}>
                        {isPending ? "⏳ " : isCancelled ? "✕ " : "✓ "}{tx.status}
                      </span>
                    </div>

                    {hasRealized && (
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

      {/* Equity Trade Modal */}
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

      {/* Futures Trade Modal */}
      <FuturesTradeModal
        isOpen={futuresModalOpen}
        onClose={() => setFuturesModalOpen(false)}
        ticker={futuresTicker}
        initialSide={futuresSide}
        initialLots={futuresLots}
        availableCash={account?.available_cash ?? 100000.0}
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
