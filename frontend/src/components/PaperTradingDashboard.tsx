"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  PaperAccount, 
  PaperTransaction, 
  PaperHolding,
  FuturesPosition,
  PendingFuturesOrder,
  fetchPaperAccount, 
  fetchPaperTransactions, 
  closeFuturesPosition,
  cancelFuturesOrder,
  resetPaperAccount,
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
  const [resetConfirming, setResetConfirming] = useState<boolean>(false);
  const [resetting, setResetting] = useState<boolean>(false);
  const [futuresBanner, setFuturesBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
  const closingIdsRef = useRef<Set<string>>(new Set());
  const cancellingIdsRef = useRef<Set<string>>(new Set());

  // Positions Search and Filter
  const [positionsFilter, setPositionsFilter] = useState<"ALL" | "FUTURES" | "EQUITY">("ALL");
  const [positionsSearch, setPositionsSearch] = useState<string>("");

  // Quick Trade Selectors
  const [selectedQuickStock, setSelectedQuickStock] = useState<string>("");
  const [selectedQuickFutures, setSelectedQuickFutures] = useState<string>("");

  // Equity Trade Modal state
  const [tradeModalOpen, setTradeModalOpen] = useState<boolean>(false);
  const [tradeTicker, setTradeTicker] = useState<string>("RELIANCE");
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY");

  // Futures Trade Modal state
  const [futuresModalOpen, setFuturesModalOpen] = useState<boolean>(false);
  const [futuresTicker, setFuturesTicker] = useState<string>("HINDALCO");
  const [futuresSide, setFuturesSide] = useState<"BUY" | "SELL">("BUY");
  const [futuresLots, setFuturesLots] = useState<number>(1);

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

  const loadData = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh || !account) {
        setLoading(true);
      }
      const acc = await fetchPaperAccount(activeUser.id);
      setAccount(acc);
      if (onAccountUpdated) onAccountUpdated(acc);

      const filterType = txFilter === "ALL" ? undefined : txFilter;
      const txs = await fetchPaperTransactions(activeUser.id, filterType);
      setTransactions(txs);
    } catch (err: any) {
      console.error("Error loading paper trading data:", err);
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

  const activeStock = stocks.find((s) => s.ticker === tradeTicker);
  const activeHolding = account?.holdings.find((h) => h.ticker === tradeTicker);
  const activePrice = activeStock?.price || activeHolding?.current_price || 1000.0;
  const activeOwnedQty = activeHolding?.quantity || 0;

  if (loading && !account) {
    return (
      <div className="glass-panel" style={{ padding: "36px", textAlign: "center", color: "var(--color-text-secondary)" }}>
        <div style={{ fontSize: "24px", marginBottom: "8px" }}>⏳</div>
        <div>Loading positions...</div>
      </div>
    );
  }

  const futuresPositions = account?.futures_positions || [];
  const equityHoldings = account?.holdings || [];
  const futuresCount = futuresPositions.length;
  const equityCount = equityHoldings.length;
  const totalPositionsCount = futuresCount + equityCount;

  // Filter positions
  const query = positionsSearch.trim().toUpperCase();
  const filteredFutures = futuresPositions.filter((pos) => {
    if (positionsFilter === "EQUITY") return false;
    if (!query) return true;
    return (
      pos.ticker.toUpperCase().includes(query) ||
      pos.contract_symbol.toUpperCase().includes(query) ||
      (pos.sector && pos.sector.toUpperCase().includes(query))
    );
  });

  const filteredEquity = equityHoldings.filter((h) => {
    if (positionsFilter === "FUTURES") return false;
    if (!query) return true;
    return (
      h.ticker.toUpperCase().includes(query) ||
      (h.sector && h.sector.toUpperCase().includes(query))
    );
  });

  // Total P&L
  const futuresUnrealized = account?.futures_unrealized_pnl ?? futuresPositions.reduce((sum, p) => sum + p.unrealized_pnl, 0);
  const equityUnrealized = account?.equity_unrealized_pnl ?? equityHoldings.reduce((sum, h) => sum + h.unrealized_pnl, 0);
  const positionsTotalPnl = positionsFilter === "FUTURES" 
    ? futuresUnrealized 
    : positionsFilter === "EQUITY" 
      ? equityUnrealized 
      : (account?.unrealized_pnl ?? (futuresUnrealized + equityUnrealized));

  const isProfit = positionsTotalPnl >= 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "100%", margin: "0 auto" }} className="animate-fade-in">
      {/* Top Header: User Switcher & Account Balance */}
      <div className="glass-panel" style={{
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "10px",
        borderRadius: "10px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)"
      }}>
        {/* User Selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <span style={{ fontSize: "16px" }}>👤</span>
          <select
            id="select-trading-user"
            aria-label="Select Trading User"
            value={activeUser.id}
            onChange={(e) => handleUserChange(e.target.value)}
            style={{
              fontSize: "12px",
              fontWeight: "800",
              padding: "5px 8px",
              borderRadius: "6px",
              background: "rgba(0, 0, 0, 0.04)",
              color: "var(--accent-ml)",
              border: "1px solid rgba(79, 70, 229, 0.3)",
              cursor: "pointer",
              outline: "none"
            }}
          >
            {PAPER_TRADING_USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} (Virtual ₹1L)
              </option>
            ))}
          </select>
        </div>

        {/* Quick Balance & Action buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
            Cash: <strong style={{ color: "#38bdf8" }}>₹{(account?.available_cash ?? 100000).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</strong>
          </div>

          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              onClick={() => setResetConfirming(true)}
              title="Reset account to ₹1,00,000"
              style={{
                fontSize: "11px",
                padding: "4px 8px",
                borderRadius: "6px",
                background: "rgba(220, 38, 38, 0.08)",
                border: "1px solid rgba(220, 38, 38, 0.25)",
                color: "var(--color-sell)",
                fontWeight: "700",
                cursor: "pointer"
              }}
            >
              🔄 Reset
            </button>
            <button
              type="button"
              onClick={() => loadData(true)}
              title="Refresh positions"
              style={{
                fontSize: "11px",
                padding: "4px 8px",
                borderRadius: "6px",
                background: "rgba(0, 0, 0, 0.04)",
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
      </div>

      {/* Reset Confirmation Dialog */}
      {resetConfirming && (
        <div className="glass-panel" style={{
          padding: "12px 16px",
          background: "rgba(220, 38, 38, 0.08)",
          border: "1px solid var(--color-sell)",
          borderRadius: "8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px"
        }}>
          <div style={{ fontSize: "12px", color: "var(--color-text-primary)" }}>
            ⚠️ Reset <strong>{activeUser.name}</strong>&apos;s account to ₹1,00,000 and clear positions?
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              onClick={() => setResetConfirming(false)}
              disabled={resetting}
              style={{
                padding: "4px 10px",
                borderRadius: "4px",
                background: "transparent",
                border: "1px solid var(--border-subtle)",
                color: "var(--color-text-secondary)",
                fontSize: "11px",
                fontWeight: "700",
                cursor: "pointer"
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={resetting}
              style={{
                padding: "4px 12px",
                borderRadius: "4px",
                background: "var(--color-sell)",
                border: "none",
                color: "#ffffff",
                fontSize: "11px",
                fontWeight: "800",
                cursor: "pointer"
              }}
            >
              {resetting ? "Resetting..." : "Yes, Reset"}
            </button>
          </div>
        </div>
      )}

      {/* POSITIONS SECTION (Reference Image Style) */}
      <div className="glass-panel" style={{
        padding: "14px",
        borderRadius: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)"
      }}>
        {/* Total P&L Card (Zerodha / Mobile App Reference Style) */}
        <div style={{
          padding: "12px 14px",
          borderRadius: "10px",
          background: isProfit 
            ? "linear-gradient(135deg, rgba(5, 150, 105, 0.1) 0%, rgba(15, 23, 42, 0.02) 100%)" 
            : "linear-gradient(135deg, rgba(220, 38, 38, 0.1) 0%, rgba(15, 23, 42, 0.02) 100%)",
          border: isProfit ? "1px solid rgba(5, 150, 105, 0.25)" : "1px solid rgba(220, 38, 38, 0.25)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px"
        }}>
          <div>
            <div style={{ fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)" }}>
              Total P&amp;L
            </div>
            <div style={{
              fontSize: "clamp(18px, 4.5vw, 24px)",
              fontWeight: "900",
              color: isProfit ? "var(--color-buy)" : "var(--color-sell)",
              marginTop: "2px"
            }}>
              {isProfit ? "+₹" : "-₹"}{Math.abs(positionsTotalPnl).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", fontSize: "11px" }}>
            <div style={{
              padding: "4px 8px",
              borderRadius: "6px",
              background: "rgba(0, 0, 0, 0.2)",
              color: "var(--color-text-secondary)"
            }}>
              Invested: <strong style={{ color: "var(--color-text-primary)" }}>₹{(account?.total_invested ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</strong>
            </div>
            <div style={{
              padding: "4px 8px",
              borderRadius: "6px",
              background: "rgba(0, 0, 0, 0.2)",
              color: "var(--color-text-secondary)"
            }}>
              Margin: <strong style={{ color: "var(--color-text-primary)" }}>₹{(account?.futures_margin_blocked ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</strong>
            </div>
          </div>
        </div>

        {/* Action Bar: Buy Futures & Buy Stock Options */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          paddingBottom: "10px",
          borderBottom: "1px solid var(--border-subtle)"
        }}>
          {/* Row 1: Simple & Visible Buy Futures and Buy Stock Options */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => handleOpenFuturesTrade("HINDALCO", "BUY", 1)}
              style={{
                flex: "1 1 140px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "8px",
                background: "var(--accent-ml)",
                border: "none",
                color: "#ffffff",
                fontSize: "12.5px",
                fontWeight: "800",
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(79, 70, 229, 0.25)"
              }}
            >
              <span>⚡</span>
              <span>Buy Futures</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenTrade("RELIANCE", "BUY")}
              style={{
                flex: "1 1 140px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "8px",
                background: "var(--color-buy)",
                border: "none",
                color: "#ffffff",
                fontSize: "12.5px",
                fontWeight: "800",
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(5, 150, 105, 0.25)"
              }}
            >
              <span>🛒</span>
              <span>Buy Stock</span>
            </button>
          </div>

          {/* Row 2: Stock Selectors for 1-Click Quantity / Lot Buy & Search */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            <select
              aria-label="Select Stock for Futures Buy"
              value={selectedQuickFutures}
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  handleOpenFuturesTrade(val, "BUY", 1);
                  setSelectedQuickFutures("");
                }
              }}
              style={{
                flex: "1 1 140px",
                fontSize: "11.5px",
                fontWeight: "700",
                padding: "6px 8px",
                borderRadius: "6px",
                background: "rgba(79, 70, 229, 0.08)",
                color: "var(--accent-ml)",
                border: "1px solid rgba(79, 70, 229, 0.3)",
                cursor: "pointer",
                outline: "none"
              }}
            >
              <option value="">⚡ + Pick Futures Contract (50)...</option>
              {stocks.map((s) => (
                <option key={s.ticker} value={s.ticker}>
                  {s.ticker} FUT (₹{s.price.toFixed(1)})
                </option>
              ))}
            </select>

            <select
              aria-label="Select Stock for Equity Buy"
              value={selectedQuickStock}
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  handleOpenTrade(val, "BUY");
                  setSelectedQuickStock("");
                }
              }}
              style={{
                flex: "1 1 140px",
                fontSize: "11.5px",
                fontWeight: "700",
                padding: "6px 8px",
                borderRadius: "6px",
                background: "rgba(5, 150, 105, 0.08)",
                color: "var(--color-buy)",
                border: "1px solid rgba(5, 150, 105, 0.3)",
                cursor: "pointer",
                outline: "none"
              }}
            >
              <option value="">🛒 + Pick Stock to Buy (50)...</option>
              {stocks.map((s) => (
                <option key={s.ticker} value={s.ticker}>
                  {s.ticker} (₹{s.price.toFixed(1)})
                </option>
              ))}
            </select>

            <input
              type="text"
              aria-label="Search positions"
              placeholder="🔍 Search..."
              value={positionsSearch}
              onChange={(e) => setPositionsSearch(e.target.value)}
              style={{
                flex: "1 1 110px",
                maxWidth: "180px",
                padding: "6px 8px",
                borderRadius: "6px",
                fontSize: "11.5px",
                background: "rgba(0, 0, 0, 0.04)",
                border: "1px solid var(--border-subtle)",
                color: "var(--color-text-primary)",
                outline: "none"
              }}
            />
          </div>
        </div>

        {/* Filter Pills (All / Futures / Equity) */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {[
            { id: "ALL", label: `All (${totalPositionsCount})` },
            { id: "FUTURES", label: `Futures (${futuresCount})` },
            { id: "EQUITY", label: `Equity (${equityCount})` },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setPositionsFilter(f.id as any)}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: "700",
                border: positionsFilter === f.id ? "1px solid var(--accent-ml)" : "1px solid var(--border-subtle)",
                background: positionsFilter === f.id ? "rgba(79, 70, 229, 0.15)" : "transparent",
                color: positionsFilter === f.id ? "var(--accent-ml)" : "var(--color-text-secondary)",
                cursor: "pointer"
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Feedback Banner */}
        {futuresBanner && (
          <div
            style={{
              padding: "8px 10px",
              borderRadius: "6px",
              fontSize: "11.5px",
              fontWeight: "600",
              background: futuresBanner.type === "success" ? "rgba(5, 150, 105, 0.1)" : "rgba(220, 38, 38, 0.1)",
              border: `1px solid ${futuresBanner.type === "success" ? "var(--color-buy)" : "var(--color-sell)"}`,
              color: futuresBanner.type === "success" ? "var(--color-buy)" : "var(--color-sell)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <span>{futuresBanner.type === "success" ? "✅ " : "⚠️ "}{futuresBanner.message}</span>
            <button
              type="button"
              onClick={() => setFuturesBanner(null)}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit", fontSize: "11px" }}
            >
              ✕
            </button>
          </div>
        )}

        {/* POSITIONS LIST (Compact Individual Rows matching Reference Image) */}
        {filteredFutures.length === 0 && filteredEquity.length === 0 ? (
          <div style={{
            padding: "32px 16px",
            textAlign: "center",
            background: "rgba(0, 0, 0, 0.02)",
            borderRadius: "8px",
            border: "1px dashed var(--border-subtle)"
          }}>
            <div style={{ fontSize: "24px", marginBottom: "6px" }}>⚡</div>
            <div style={{ fontSize: "13px", fontWeight: "800", color: "var(--color-text-primary)" }}>
              No Open Positions
            </div>
            <div style={{ fontSize: "11.5px", color: "var(--color-text-secondary)", marginTop: "4px", marginBottom: "12px" }}>
              Use Buy Futures or Buy Stock above to open your first simulated position.
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => handleOpenFuturesTrade("HINDALCO", "BUY", 1)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  background: "var(--accent-ml)",
                  border: "none",
                  color: "#ffffff",
                  fontWeight: "800",
                  fontSize: "12px",
                  cursor: "pointer"
                }}
              >
                ⚡ Buy Futures
              </button>
              <button
                type="button"
                onClick={() => handleOpenTrade(stocks[0]?.ticker || "RELIANCE", "BUY")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  background: "rgba(5, 150, 105, 0.12)",
                  border: "1px solid var(--color-buy)",
                  color: "var(--color-buy)",
                  fontWeight: "800",
                  fontSize: "12px",
                  cursor: "pointer"
                }}
              >
                🛒 Buy Stock
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* 1. Futures Position Rows */}
            {filteredFutures.map((pos: FuturesPosition) => {
              const posGain = pos.unrealized_pnl >= 0;
              const isBuy = pos.side === "BUY";
              const isClosing = closingIds.has(pos.id);

              return (
                <div
                  key={pos.id}
                  style={{
                    padding: "12px 4px",
                    borderBottom: "1px solid var(--border-subtle)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px"
                  }}
                >
                  {/* Row 1: Contract Name, Badges (Left) | Unrealized P&L (Right) */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", minWidth: 0 }}>
                      {/* Product badge */}
                      <span style={{
                        padding: "2px 5px",
                        borderRadius: "4px",
                        fontSize: "9px",
                        fontWeight: "800",
                        background: "rgba(79, 70, 229, 0.15)",
                        color: "var(--accent-ml)",
                        border: "1px solid rgba(79, 70, 229, 0.3)"
                      }}>
                        NRML
                      </span>

                      {/* Side badge */}
                      <span style={{
                        padding: "2px 5px",
                        borderRadius: "4px",
                        fontSize: "9.5px",
                        fontWeight: "800",
                        background: isBuy ? "rgba(5, 150, 105, 0.15)" : "rgba(220, 38, 38, 0.15)",
                        color: isBuy ? "var(--color-buy)" : "var(--color-sell)",
                        border: `1px solid ${isBuy ? "var(--color-buy)" : "var(--color-sell)"}`
                      }}>
                        {pos.side}
                      </span>

                      {/* Symbol & Contract */}
                      <span
                        onClick={() => onSelectStock && onSelectStock(pos.ticker)}
                        style={{
                          fontSize: "14px",
                          fontWeight: "800",
                          color: "var(--color-text-primary)",
                          cursor: "pointer"
                        }}
                      >
                        {pos.contract_symbol}
                      </span>
                    </div>

                    {/* Unrealized P&L */}
                    <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{
                        fontSize: "14px",
                        fontWeight: "900",
                        color: posGain ? "var(--color-buy)" : "var(--color-sell)"
                      }}>
                        {posGain ? "+₹" : "-₹"}{Math.abs(pos.unrealized_pnl).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div style={{ fontSize: "10px", color: posGain ? "var(--color-buy)" : "var(--color-sell)", fontWeight: "700" }}>
                        ({posGain ? "+" : ""}{pos.unrealized_pnl_pct.toFixed(2)}%)
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Quantity & Lots (Left) | Avg Price & Current LTP (Right) */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "6px",
                    fontSize: "12px",
                    color: "var(--color-text-secondary)"
                  }}>
                    <div>
                      Qty. <strong style={{ color: "var(--color-text-primary)" }}>{pos.total_quantity.toLocaleString("en-IN")}</strong>
                      <span style={{ fontSize: "11px", color: "var(--color-text-muted)", marginLeft: "4px" }}>
                        ({pos.lots} lot{pos.lots === 1 ? "" : "s"} × {pos.lot_size})
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span>Avg. <strong style={{ color: "var(--color-text-primary)" }}>₹{pos.entry_price.toFixed(2)}</strong></span>
                      <span style={{ color: "var(--color-text-muted)" }}>•</span>
                      <span>LTP <strong style={{ color: "var(--accent-ml)" }}>₹{pos.current_futures_price.toFixed(2)}</strong></span>
                    </div>
                  </div>

                  {/* Row 3: Margin / Details (Left) | Position Actions (Right) */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "6px",
                    fontSize: "11px",
                    color: "var(--color-text-muted)",
                    paddingTop: "2px"
                  }}>
                    <div>
                      Margin: ₹{pos.margin_blocked.toLocaleString("en-IN", { maximumFractionDigits: 0 })} • Exp: {pos.expiry_formatted}
                    </div>

                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        disabled={isClosing}
                        onClick={() => handleCloseFutures(pos)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "5px",
                          background: "rgba(220, 38, 38, 0.08)",
                          border: "1px solid rgba(220, 38, 38, 0.35)",
                          color: "var(--color-sell)",
                          fontSize: "11px",
                          fontWeight: "800",
                          cursor: isClosing ? "not-allowed" : "pointer"
                        }}
                      >
                        {isClosing ? "Closing..." : "Close Position"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenFuturesTrade(pos.ticker, pos.side, 1)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "5px",
                          background: "rgba(79, 70, 229, 0.1)",
                          border: "1px solid rgba(79, 70, 229, 0.35)",
                          color: "var(--accent-ml)",
                          fontSize: "11px",
                          fontWeight: "800",
                          cursor: "pointer"
                        }}
                      >
                        + Add Lots
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* 2. Equity Position Rows */}
            {filteredEquity.map((h: PaperHolding) => {
              const posGain = h.unrealized_pnl >= 0;

              return (
                <div
                  key={`EQ-${h.ticker}`}
                  style={{
                    padding: "12px 4px",
                    borderBottom: "1px solid var(--border-subtle)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px"
                  }}
                >
                  {/* Row 1: Symbol, Badges (Left) | Unrealized P&L (Right) */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", minWidth: 0 }}>
                      <span style={{
                        padding: "2px 5px",
                        borderRadius: "4px",
                        fontSize: "9px",
                        fontWeight: "800",
                        background: "rgba(59, 130, 246, 0.12)",
                        color: "#3b82f6",
                        border: "1px solid rgba(59, 130, 246, 0.3)"
                      }}>
                        CNC
                      </span>

                      <span style={{
                        padding: "2px 5px",
                        borderRadius: "4px",
                        fontSize: "9.5px",
                        fontWeight: "800",
                        background: "rgba(5, 150, 105, 0.15)",
                        color: "var(--color-buy)",
                        border: "1px solid var(--color-buy)"
                      }}>
                        BUY
                      </span>

                      <span
                        onClick={() => onSelectStock && onSelectStock(h.ticker)}
                        style={{
                          fontSize: "14px",
                          fontWeight: "800",
                          color: "var(--color-text-primary)",
                          cursor: "pointer"
                        }}
                      >
                        {h.ticker}
                      </span>
                    </div>

                    <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{
                        fontSize: "14px",
                        fontWeight: "900",
                        color: posGain ? "var(--color-buy)" : "var(--color-sell)"
                      }}>
                        {posGain ? "+₹" : "-₹"}{Math.abs(h.unrealized_pnl).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div style={{ fontSize: "10px", color: posGain ? "var(--color-buy)" : "var(--color-sell)", fontWeight: "700" }}>
                        ({posGain ? "+" : ""}{h.unrealized_pnl_pct.toFixed(2)}%)
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Quantity (Left) | Avg Price & Current LTP (Right) */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "6px",
                    fontSize: "12px",
                    color: "var(--color-text-secondary)"
                  }}>
                    <div>
                      Qty. <strong style={{ color: "var(--color-text-primary)" }}>{h.quantity}</strong>
                      <span style={{ fontSize: "11px", color: "var(--color-text-muted)", marginLeft: "4px" }}>
                        shares
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span>Avg. <strong style={{ color: "var(--color-text-primary)" }}>₹{h.avg_buy_price.toFixed(2)}</strong></span>
                      <span style={{ color: "var(--color-text-muted)" }}>•</span>
                      <span>LTP <strong style={{ color: "var(--color-text-primary)" }}>₹{h.current_price.toFixed(2)}</strong></span>
                    </div>
                  </div>

                  {/* Row 3: Invested / Sector (Left) | Position Actions (Right) */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "6px",
                    fontSize: "11px",
                    color: "var(--color-text-muted)",
                    paddingTop: "2px"
                  }}>
                    <div>
                      Invested: ₹{h.total_invested.toLocaleString("en-IN", { maximumFractionDigits: 0 })} • {h.sector}
                    </div>

                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        onClick={() => handleOpenTrade(h.ticker, "SELL")}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "5px",
                          background: "rgba(220, 38, 38, 0.08)",
                          border: "1px solid rgba(220, 38, 38, 0.35)",
                          color: "var(--color-sell)",
                          fontSize: "11px",
                          fontWeight: "800",
                          cursor: "pointer"
                        }}
                      >
                        Sell
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenTrade(h.ticker, "BUY")}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "5px",
                          background: "rgba(5, 150, 105, 0.1)",
                          border: "1px solid rgba(5, 150, 105, 0.35)",
                          color: "var(--color-buy)",
                          fontSize: "11px",
                          fontWeight: "800",
                          cursor: "pointer"
                        }}
                      >
                        + Buy More
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pending Limit Futures Orders (if any) */}
        {(account?.pending_futures_orders?.length ?? 0) > 0 && (
          <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: "12px", fontWeight: "800", color: "var(--color-text-primary)", marginBottom: "6px" }}>
              ⏳ Pending Orders ({account?.pending_futures_orders?.length ?? 0})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {account!.pending_futures_orders!.map((ord: PendingFuturesOrder) => {
                const isCancelling = cancellingIds.has(ord.id);
                return (
                  <div
                    key={ord.id}
                    style={{
                      padding: "8px 10px",
                      borderRadius: "6px",
                      background: "rgba(217, 119, 6, 0.06)",
                      border: "1px solid rgba(217, 119, 6, 0.25)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "11px"
                    }}
                  >
                    <div>
                      <strong>{ord.contract_symbol}</strong> {ord.side} Limit @ ₹{ord.limit_price.toFixed(2)} ({ord.total_quantity} sh)
                    </div>
                    <button
                      type="button"
                      disabled={isCancelling}
                      onClick={() => handleCancelPendingFutures(ord)}
                      style={{
                        padding: "3px 8px",
                        borderRadius: "4px",
                        background: "rgba(220, 38, 38, 0.08)",
                        border: "1px solid var(--color-sell)",
                        color: "var(--color-sell)",
                        fontSize: "10px",
                        fontWeight: "800",
                        cursor: isCancelling ? "not-allowed" : "pointer"
                      }}
                    >
                      {isCancelling ? "..." : "Cancel"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Compact Order History Section */}
      <div className="glass-panel" style={{
        padding: "14px",
        borderRadius: "12px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "6px" }}>
          <div style={{ fontSize: "13px", fontWeight: "800", color: "var(--color-text-primary)" }}>
            Order History
          </div>

          <div style={{ display: "flex", gap: "4px" }}>
            {[
              { id: "ALL", label: "All" },
              { id: "BUY", label: "BUY" },
              { id: "SELL", label: "SELL" },
              { id: "FUTURES", label: "Futures" }
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTxFilter(f.id as any)}
                style={{
                  fontSize: "10.5px",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  background: txFilter === f.id ? "var(--accent-ml)" : "transparent",
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
          <div style={{ padding: "16px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "11px" }}>
            No simulated orders executed yet for {activeUser.name}.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {transactions.slice(0, 10).map((tx) => {
              const isBuy = tx.order_type === "BUY" || tx.order_type === "FUTURES_BUY";
              const isSell = tx.order_type === "SELL" || tx.order_type === "FUTURES_SELL";
              const isFutClose = tx.order_type === "FUTURES_CLOSE";
              const hasRealized = tx.order_type === "SELL" || isFutClose;

              return (
                <div
                  key={tx.id}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "6px",
                    background: "rgba(0, 0, 0, 0.02)",
                    border: "1px solid var(--border-subtle)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "6px",
                    fontSize: "11.5px"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{
                      padding: "1px 5px",
                      borderRadius: "3px",
                      fontSize: "9.5px",
                      fontWeight: "800",
                      background: isBuy ? "rgba(5, 150, 105, 0.12)" : isSell ? "rgba(220, 38, 38, 0.12)" : isFutClose ? "rgba(79, 70, 229, 0.12)" : "rgba(100, 116, 139, 0.12)",
                      color: isBuy ? "var(--color-buy)" : isSell ? "var(--color-sell)" : isFutClose ? "var(--accent-ml)" : "var(--color-text-muted)"
                    }}>
                      {tx.order_type}
                    </span>
                    <strong style={{ color: "var(--color-text-primary)" }}>{tx.contract_symbol || tx.ticker}</strong>
                    <span style={{ color: "var(--color-text-muted)", fontSize: "10.5px" }}>
                      {tx.quantity > 0 ? `${tx.quantity} sh` : "Reset"}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontWeight: "700", color: "var(--color-text-primary)" }}>
                      ₹{tx.total_amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </span>
                    {hasRealized && (
                      <span style={{
                        fontSize: "10.5px",
                        fontWeight: "800",
                        color: tx.realized_pnl >= 0 ? "var(--color-buy)" : "var(--color-sell)"
                      }}>
                        ({tx.realized_pnl >= 0 ? "+" : ""}₹{tx.realized_pnl.toFixed(0)})
                      </span>
                    )}
                    <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
                      {tx.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
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
