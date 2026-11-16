"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  PaperAccount, 
  PaperTransaction, 
  PaperHolding,
  FuturesPosition,
  PendingFuturesOrder,
  FuturesContractSpec,
  fetchPaperAccount, 
  fetchPaperTransactions, 
  fetchFuturesContracts,
  executePaperOrder,
  executeFuturesOrder,
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

interface FuturesDisplayContract {
  ticker: string;
  contract_symbol: string;
  expiry_date: string;
  expiry_formatted: string;
  lot_size: number;
  futures_price: number;
  spot_price: number;
  margin_pct?: number;
}

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
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
  const closingIdsRef = useRef<Set<string>>(new Set());
  const cancellingIdsRef = useRef<Set<string>>(new Set());

  // Available Futures Contracts (loaded from API with fallbacks from stocks)
  const [futuresContracts, setFuturesContracts] = useState<FuturesContractSpec[]>([]);

  // Buy Stock Modal State
  const [buyStockModalOpen, setBuyStockModalOpen] = useState<boolean>(false);
  const [selectedStock, setSelectedStock] = useState<StockOverview | null>(null);
  const [stockSearch, setStockSearch] = useState<string>("");
  const [stockQuantity, setStockQuantity] = useState<number>(10);
  const [stockSubmitting, setStockSubmitting] = useState<boolean>(false);
  const [stockError, setStockError] = useState<string | null>(null);

  // Buy Futures Modal State
  const [buyFuturesModalOpen, setBuyFuturesModalOpen] = useState<boolean>(false);
  const [selectedFuturesContract, setSelectedFuturesContract] = useState<FuturesDisplayContract | null>(null);
  const [futuresSearch, setFuturesSearch] = useState<string>("");
  const [futuresLots, setFuturesLots] = useState<number>(1);
  const [futuresSubmitting, setFuturesSubmitting] = useState<boolean>(false);
  const [futuresError, setFuturesError] = useState<string | null>(null);

  // Equity Sell Modal (opens TradeModal in SELL mode)
  const [sellModalOpen, setSellModalOpen] = useState<boolean>(false);
  const [sellTicker, setSellTicker] = useState<string>("RELIANCE");

  // Load all available NSE Futures contracts
  useEffect(() => {
    let cancelled = false;
    fetchFuturesContracts()
      .then((data) => {
        if (!cancelled && data?.contracts?.length > 0) {
          setFuturesContracts(data.contracts);
        }
      })
      .catch((err) => {
        console.warn("Using fallback futures specs from stocks:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Synchronize active trading user changes across components
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

  // Real-time order updates listener
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
    setFeedbackBanner(null);
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

  // Close Futures Position
  const handleCloseFutures = async (pos: FuturesPosition) => {
    if (closingIdsRef.current.has(pos.id)) return;
    closingIdsRef.current.add(pos.id);
    setClosingIds(new Set(closingIdsRef.current));
    setFeedbackBanner(null);

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
      setFeedbackBanner({
        type: "success",
        message: res.order?.message || `Closed ${pos.contract_symbol}`,
      });
    } catch (err: any) {
      setFeedbackBanner({
        type: "error",
        message: err?.message || `Failed to close ${pos.contract_symbol}`,
      });
    } finally {
      closingIdsRef.current.delete(pos.id);
      setClosingIds(new Set(closingIdsRef.current));
    }
  };

  // Cancel Pending Futures Order
  const handleCancelPendingFutures = async (ord: PendingFuturesOrder) => {
    if (cancellingIdsRef.current.has(ord.id)) return;
    cancellingIdsRef.current.add(ord.id);
    setCancellingIds(new Set(cancellingIdsRef.current));
    setFeedbackBanner(null);

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
      setFeedbackBanner({
        type: "success",
        message: res.cancel?.message || `Cancelled order for ${ord.contract_symbol}`,
      });
    } catch (err: any) {
      setFeedbackBanner({
        type: "error",
        message: err?.message || `Failed to cancel order for ${ord.contract_symbol}`,
      });
    } finally {
      cancellingIdsRef.current.delete(ord.id);
      setCancellingIds(new Set(cancellingIdsRef.current));
    }
  };

  // Account Reset
  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await resetPaperAccount(activeUser.id);
      setAccount(res.account);
      if (onAccountUpdated) onAccountUpdated(res.account);
      setFeedbackBanner(null);
      const txs = await fetchPaperTransactions(activeUser.id);
      setTransactions(txs);
      setResetConfirming(false);
    } catch (err: any) {
      alert(`Failed to reset ${activeUser.name}'s account: ` + (err?.message || "Unknown error"));
    } finally {
      setResetting(false);
    }
  };

  // Execute Buy Stock
  const handleExecuteBuyStock = async () => {
    if (!selectedStock || stockSubmitting) return;
    const availableCash = account?.available_cash ?? 100000;
    const totalVal = stockQuantity * selectedStock.price;

    if (totalVal > availableCash) {
      setStockError(`Insufficient virtual cash. Required: ₹${totalVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}, Available: ₹${availableCash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
      return;
    }

    if (stockQuantity <= 0) {
      setStockError("Please enter a valid quantity of at least 1 share.");
      return;
    }

    setStockSubmitting(true);
    setStockError(null);
    try {
      const idemKey = `EQBUY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await executePaperOrder(
        activeUser.id,
        selectedStock.ticker,
        "BUY",
        stockQuantity,
        idemKey
      );
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
      setFeedbackBanner({
        type: "success",
        message: `Bought ${stockQuantity} shares of ${selectedStock.ticker}!`
      });
      setBuyStockModalOpen(false);
      setSelectedStock(null);
      setStockQuantity(10);
    } catch (err: any) {
      setStockError(err?.message || "Failed to execute stock buy");
    } finally {
      setStockSubmitting(false);
    }
  };

  // Execute Buy Futures
  const handleExecuteBuyFutures = async () => {
    if (!selectedFuturesContract || futuresSubmitting) return;
    const availableCash = account?.available_cash ?? 100000;
    const price = selectedFuturesContract.futures_price || selectedFuturesContract.spot_price;
    const lotSize = selectedFuturesContract.lot_size || 1;
    const totalQty = futuresLots * lotSize;
    const tradeVal = totalQty * price;
    const marginReq = Math.round(tradeVal * (selectedFuturesContract.margin_pct || 0.05));

    if (marginReq > availableCash) {
      setFuturesError(`Insufficient cash for margin. Required: ₹${marginReq.toLocaleString("en-IN")}, Available: ₹${availableCash.toLocaleString("en-IN")}`);
      return;
    }

    setFuturesSubmitting(true);
    setFuturesError(null);
    try {
      const idemKey = `FUTBUY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await executeFuturesOrder(
        activeUser.id,
        selectedFuturesContract.ticker,
        "BUY",
        futuresLots,
        "MARKET",
        undefined,
        selectedFuturesContract.expiry_date,
        idemKey
      );
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
      setFeedbackBanner({
        type: "success",
        message: `Bought ${futuresLots} lot(s) (${totalQty} sh) of ${selectedFuturesContract.contract_symbol}!`
      });
      setBuyFuturesModalOpen(false);
      setSelectedFuturesContract(null);
      setFuturesLots(1);
    } catch (err: any) {
      setFuturesError(err?.message || "Failed to execute futures buy");
    } finally {
      setFuturesSubmitting(false);
    }
  };

  // Open Buy Stock modal for specific stock
  const openBuyStockForTicker = (ticker: string) => {
    const found = stocks.find((s) => s.ticker === ticker) || null;
    setSelectedStock(found);
    setStockSearch(ticker);
    setStockQuantity(10);
    setStockError(null);
    setBuyStockModalOpen(true);
  };

  // Open Buy Futures modal for specific contract
  const openBuyFuturesForTicker = (ticker: string) => {
    const found = displayFuturesContracts.find((c) => c.ticker === ticker) || null;
    setSelectedFuturesContract(found);
    setFuturesSearch(ticker);
    setFuturesLots(1);
    setFuturesError(null);
    setBuyFuturesModalOpen(true);
  };

  // Fallback futures contracts if API is loading
  const displayFuturesContracts: FuturesDisplayContract[] = futuresContracts.length > 0
    ? futuresContracts
    : stocks.map((s) => ({
        ticker: s.ticker,
        contract_symbol: `${s.ticker} FUT`,
        expiry_date: "2026-11-26",
        expiry_formatted: "26 Nov 2026",
        lot_size: 500,
        spot_price: s.price,
        futures_price: Math.round(s.price * 1.004 * 100) / 100,
        margin_pct: 0.05
      }));

  const filteredStocksList = stocks.filter((s) => {
    if (!stockSearch) return true;
    const q = stockSearch.trim().toUpperCase();
    return s.ticker.toUpperCase().includes(q) || (s.sector && s.sector.toUpperCase().includes(q));
  });

  const filteredContractsList = displayFuturesContracts.filter((c) => {
    if (!futuresSearch) return true;
    const q = futuresSearch.trim().toUpperCase();
    return c.ticker.toUpperCase().includes(q) || c.contract_symbol.toUpperCase().includes(q);
  });

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
  const totalPositionsCount = futuresPositions.length + equityHoldings.length;

  // Total Open Positions P&L
  const totalPnl = account?.unrealized_pnl ?? 0;
  const isProfit = totalPnl >= 0;

  // Active selling equity holding for SellModal
  const activeSellHolding = account?.holdings.find((h) => h.ticker === sellTicker);
  const activeSellStock = stocks.find((s) => s.ticker === sellTicker);
  const activeSellPrice = activeSellStock?.price || activeSellHolding?.current_price || 1000.0;
  const activeSellQty = activeSellHolding?.quantity || 0;

  const availableCash = account?.available_cash ?? 100000;

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
            Cash: <strong style={{ color: "#38bdf8" }}>₹{availableCash.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</strong>
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

      {/* POSITIONS SECTION */}
      <div className="glass-panel" style={{
        padding: "14px",
        borderRadius: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)"
      }}>
        {/* Total P&L Card (Zerodha Kite Reference Style) */}
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
              {isProfit ? "+₹" : "-₹"}{Math.abs(totalPnl).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

        {/* TWO PRIMARY OPTIONS ONLY AT TOP: Buy Stock & Buy Futures */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <button
            type="button"
            onClick={() => {
              setStockSearch("");
              setSelectedStock(null);
              setStockQuantity(10);
              setStockError(null);
              setBuyStockModalOpen(true);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "12px 16px",
              borderRadius: "8px",
              background: "var(--color-buy)",
              border: "none",
              color: "#ffffff",
              fontSize: "13.5px",
              fontWeight: "800",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(5, 150, 105, 0.3)",
              transition: "transform 0.1s ease"
            }}
          >
            <span style={{ fontSize: "16px" }}>🛒</span>
            <span>Buy Stock</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFuturesSearch("");
              setSelectedFuturesContract(null);
              setFuturesLots(1);
              setFuturesError(null);
              setBuyFuturesModalOpen(true);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "12px 16px",
              borderRadius: "8px",
              background: "var(--accent-ml)",
              border: "none",
              color: "#ffffff",
              fontSize: "13.5px",
              fontWeight: "800",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(79, 70, 229, 0.3)",
              transition: "transform 0.1s ease"
            }}
          >
            <span style={{ fontSize: "16px" }}>⚡</span>
            <span>Buy Futures</span>
          </button>
        </div>

        {/* Feedback Banner */}
        {feedbackBanner && (
          <div
            style={{
              padding: "8px 10px",
              borderRadius: "6px",
              fontSize: "11.5px",
              fontWeight: "600",
              background: feedbackBanner.type === "success" ? "rgba(5, 150, 105, 0.1)" : "rgba(220, 38, 38, 0.1)",
              border: `1px solid ${feedbackBanner.type === "success" ? "var(--color-buy)" : "var(--color-sell)"}`,
              color: feedbackBanner.type === "success" ? "var(--color-buy)" : "var(--color-sell)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <span>{feedbackBanner.type === "success" ? "✅ " : "⚠️ "}{feedbackBanner.message}</span>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit", fontSize: "11px" }}
            >
              ✕
            </button>
          </div>
        )}

        {/* UNIFIED POSITIONS LIST (Stocks + Futures together) */}
        {totalPositionsCount === 0 ? (
          <div style={{
            padding: "36px 16px",
            textAlign: "center",
            background: "rgba(0, 0, 0, 0.02)",
            borderRadius: "8px",
            border: "1px dashed var(--border-subtle)"
          }}>
            <div style={{ fontSize: "26px", marginBottom: "6px" }}>⚡</div>
            <div style={{ fontSize: "14px", fontWeight: "800", color: "var(--color-text-primary)" }}>
              No Open Positions
            </div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "4px", marginBottom: "16px" }}>
              Click Buy Stock or Buy Futures above to open your first simulated position.
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => {
                  setStockSearch("");
                  setSelectedStock(null);
                  setStockQuantity(10);
                  setBuyStockModalOpen(true);
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  background: "var(--color-buy)",
                  border: "none",
                  color: "#ffffff",
                  fontWeight: "800",
                  fontSize: "12.5px",
                  cursor: "pointer"
                }}
              >
                🛒 Buy Stock
              </button>
              <button
                type="button"
                onClick={() => {
                  setFuturesSearch("");
                  setSelectedFuturesContract(null);
                  setFuturesLots(1);
                  setBuyFuturesModalOpen(true);
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  background: "var(--accent-ml)",
                  border: "none",
                  color: "#ffffff",
                  fontWeight: "800",
                  fontSize: "12.5px",
                  cursor: "pointer"
                }}
              >
                ⚡ Buy Futures
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* 1. Equity Positions */}
            {equityHoldings.map((h: PaperHolding) => {
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
                  {/* Line 1: Product (Equity), Side (BUY), Symbol | P&L */}
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
                        EQUITY
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

                  {/* Line 2: Quantity (Left) | Avg Price & Current LTP (Right) */}
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

                  {/* Line 3: Invested Value (Left) | Actions (Right) */}
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
                        onClick={() => {
                          setSellTicker(h.ticker);
                          setSellModalOpen(true);
                        }}
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
                        onClick={() => openBuyStockForTicker(h.ticker)}
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

            {/* 2. Futures Positions */}
            {futuresPositions.map((pos: FuturesPosition) => {
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
                  {/* Line 1: Product (Futures), Side (BUY/SELL), Contract Symbol | P&L */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", minWidth: 0 }}>
                      <span style={{
                        padding: "2px 5px",
                        borderRadius: "4px",
                        fontSize: "9px",
                        fontWeight: "800",
                        background: "rgba(79, 70, 229, 0.15)",
                        color: "var(--accent-ml)",
                        border: "1px solid rgba(79, 70, 229, 0.3)"
                      }}>
                        FUTURES
                      </span>

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

                  {/* Line 2: Quantity & Lots (Left) | Avg Price & Current LTP (Right) */}
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

                  {/* Line 3: Margin Blocked (Left) | Actions (Right) */}
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
                        onClick={() => openBuyFuturesForTicker(pos.ticker)}
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

      {/* SEARCHABLE BUY STOCK MODAL */}
      {buyStockModalOpen && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "16px"
        }}>
          <div style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "14px",
            width: "100%",
            maxWidth: "460px",
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)"
          }}>
            {/* Modal Header */}
            <div style={{
              padding: "14px 16px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "18px" }}>🛒</span>
                <span style={{ fontSize: "15px", fontWeight: "900", color: "var(--color-text-primary)" }}>
                  Buy NSE Stock
                </span>
              </div>
              <button
                type="button"
                onClick={() => setBuyStockModalOpen(false)}
                style={{ background: "transparent", border: "none", color: "var(--color-text-muted)", fontSize: "18px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
              {!selectedStock ? (
                /* Step 1: Search & Pick Stock from all available NSE stocks */
                <>
                  <input
                    type="text"
                    placeholder="🔍 Search all 50 NSE stocks (e.g. RELIANCE, TCS)..."
                    value={stockSearch}
                    onChange={(e) => setStockSearch(e.target.value)}
                    autoFocus
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      fontSize: "12.5px",
                      background: "rgba(0, 0, 0, 0.05)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--color-text-primary)",
                      outline: "none"
                    }}
                  />

                  <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                    Select Stock ({filteredStocksList.length} available)
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "360px", overflowY: "auto" }}>
                    {filteredStocksList.map((s) => (
                      <div
                        key={s.ticker}
                        onClick={() => {
                          setSelectedStock(s);
                          setStockQuantity(10);
                          setStockError(null);
                        }}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "8px",
                          background: "rgba(0, 0, 0, 0.02)",
                          border: "1px solid var(--border-subtle)",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          transition: "background 0.15s ease"
                        }}
                        className="table-row-hover"
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <strong style={{ color: "var(--color-text-primary)", fontSize: "13px" }}>{s.ticker}</strong>
                            <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "3px", background: "rgba(59, 130, 246, 0.12)", color: "#3b82f6", fontWeight: "800" }}>EQUITY</span>
                          </div>
                          <div style={{ fontSize: "10.5px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                            {s.sector}
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: "800", color: "var(--color-text-primary)", fontSize: "13px" }}>
                            ₹{s.price.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                          </div>
                          <div style={{ fontSize: "10px", color: (s.change_pct ?? 0) >= 0 ? "var(--color-buy)" : "var(--color-sell)", fontWeight: "600" }}>
                            {(s.change_pct ?? 0) >= 0 ? "+" : ""}{(s.change_pct ?? 0).toFixed(2)}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                /* Step 2: Configure Share Quantity & Execute Buy */
                <>
                  <div style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: "rgba(5, 150, 105, 0.08)",
                    border: "1px solid rgba(5, 150, 105, 0.25)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <div>
                      <div style={{ fontWeight: "900", color: "var(--color-text-primary)", fontSize: "14px" }}>
                        {selectedStock.ticker}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                        {selectedStock.sector} • LTP: <strong>₹{selectedStock.price.toFixed(2)}</strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedStock(null)}
                      style={{
                        padding: "3px 8px",
                        borderRadius: "4px",
                        background: "transparent",
                        border: "1px solid var(--border-subtle)",
                        color: "var(--color-buy)",
                        fontSize: "10.5px",
                        fontWeight: "700",
                        cursor: "pointer"
                      }}
                    >
                      Change Stock
                    </button>
                  </div>

                  {/* Quantity Input */}
                  <div>
                    <label style={{ fontSize: "11.5px", fontWeight: "800", color: "var(--color-text-primary)", display: "block", marginBottom: "6px" }}>
                      Quantity of Shares
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() => setStockQuantity(Math.max(1, stockQuantity - 1))}
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "6px",
                          background: "rgba(0, 0, 0, 0.05)",
                          border: "1px solid var(--border-subtle)",
                          fontSize: "16px",
                          fontWeight: "800",
                          cursor: "pointer"
                        }}
                      >
                        -
                      </button>

                      <input
                        type="number"
                        min="1"
                        max="5000"
                        value={stockQuantity}
                        onChange={(e) => setStockQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{
                          flex: 1,
                          height: "36px",
                          textAlign: "center",
                          fontSize: "15px",
                          fontWeight: "900",
                          borderRadius: "6px",
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-subtle)",
                          color: "var(--color-text-primary)",
                          outline: "none"
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => setStockQuantity(stockQuantity + 1)}
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "6px",
                          background: "rgba(0, 0, 0, 0.05)",
                          border: "1px solid var(--border-subtle)",
                          fontSize: "16px",
                          fontWeight: "800",
                          cursor: "pointer"
                        }}
                      >
                        +
                      </button>
                    </div>

                    {/* Quick Quantity Pills */}
                    <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                      {[5, 10, 25, 50, 100].map((qty) => (
                        <button
                          key={qty}
                          type="button"
                          onClick={() => setStockQuantity(qty)}
                          style={{
                            flex: 1,
                            padding: "4px",
                            borderRadius: "4px",
                            fontSize: "10.5px",
                            fontWeight: "700",
                            background: stockQuantity === qty ? "var(--color-buy)" : "rgba(0, 0, 0, 0.03)",
                            color: stockQuantity === qty ? "#ffffff" : "var(--color-text-secondary)",
                            border: "1px solid var(--border-subtle)",
                            cursor: "pointer"
                          }}
                        >
                          {qty}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const maxSh = Math.floor(availableCash / selectedStock.price);
                          if (maxSh > 0) setStockQuantity(maxSh);
                        }}
                        style={{
                          flex: 1,
                          padding: "4px",
                          borderRadius: "4px",
                          fontSize: "10.5px",
                          fontWeight: "800",
                          background: "rgba(5, 150, 105, 0.1)",
                          color: "var(--color-buy)",
                          border: "1px solid var(--border-subtle)",
                          cursor: "pointer"
                        }}
                      >
                        Max
                      </button>
                    </div>
                  </div>

                  {/* Calculations */}
                  <div style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: "rgba(0, 0, 0, 0.03)",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "11.5px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--color-text-secondary)" }}>Price per Share:</span>
                      <strong>₹{selectedStock.price.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border-subtle)", paddingTop: "4px", marginTop: "2px" }}>
                      <span style={{ fontWeight: "800", color: "var(--color-text-primary)" }}>Total Investment:</span>
                      <strong style={{ color: "var(--color-buy)", fontSize: "12.5px" }}>
                        ₹{(stockQuantity * selectedStock.price).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)", fontSize: "10.5px" }}>
                      <span>Available Virtual Cash:</span>
                      <span>₹{availableCash.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>

                  {stockError && (
                    <div style={{ fontSize: "11px", color: "var(--color-sell)", fontWeight: "700" }}>
                      ⚠️ {stockError}
                    </div>
                  )}

                  {/* Execute Button */}
                  <button
                    type="button"
                    disabled={stockSubmitting}
                    onClick={handleExecuteBuyStock}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      background: "var(--color-buy)",
                      border: "none",
                      color: "#ffffff",
                      fontSize: "13px",
                      fontWeight: "900",
                      cursor: stockSubmitting ? "not-allowed" : "pointer",
                      opacity: stockSubmitting ? 0.7 : 1,
                      boxShadow: "0 2px 8px rgba(5, 150, 105, 0.3)"
                    }}
                  >
                    {stockSubmitting ? "Submitting Buy Order..." : `Execute Buy Stock (${stockQuantity} shares)`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SEARCHABLE BUY FUTURES MODAL */}
      {buyFuturesModalOpen && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "16px"
        }}>
          <div style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "14px",
            width: "100%",
            maxWidth: "460px",
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)"
          }}>
            {/* Modal Header */}
            <div style={{
              padding: "14px 16px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "18px" }}>⚡</span>
                <span style={{ fontSize: "15px", fontWeight: "900", color: "var(--color-text-primary)" }}>
                  Buy NSE Futures Contract
                </span>
              </div>
              <button
                type="button"
                onClick={() => setBuyFuturesModalOpen(false)}
                style={{ background: "transparent", border: "none", color: "var(--color-text-muted)", fontSize: "18px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
              {!selectedFuturesContract ? (
                /* Step 1: Search & Pick Contract from all available NSE futures */
                <>
                  <input
                    type="text"
                    placeholder="🔍 Search all 50 NSE Futures (e.g. HINDALCO, RELIANCE)..."
                    value={futuresSearch}
                    onChange={(e) => setFuturesSearch(e.target.value)}
                    autoFocus
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      fontSize: "12.5px",
                      background: "rgba(0, 0, 0, 0.05)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--color-text-primary)",
                      outline: "none"
                    }}
                  />

                  <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                    Select Contract ({filteredContractsList.length} available)
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "360px", overflowY: "auto" }}>
                    {filteredContractsList.map((c) => (
                      <div
                        key={c.ticker}
                        onClick={() => {
                          setSelectedFuturesContract(c);
                          setFuturesLots(1);
                          setFuturesError(null);
                        }}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "8px",
                          background: "rgba(0, 0, 0, 0.02)",
                          border: "1px solid var(--border-subtle)",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          transition: "background 0.15s ease"
                        }}
                        className="table-row-hover"
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <strong style={{ color: "var(--color-text-primary)", fontSize: "13px" }}>{c.contract_symbol}</strong>
                            <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "3px", background: "rgba(79, 70, 229, 0.12)", color: "var(--accent-ml)", fontWeight: "800" }}>FUTURES</span>
                          </div>
                          <div style={{ fontSize: "10.5px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                            Exp: {c.expiry_formatted} • Lot Size: <strong>{c.lot_size} sh</strong>
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: "800", color: "var(--accent-ml)", fontSize: "13px" }}>
                            ₹{(c.futures_price || c.spot_price).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                          </div>
                          <div style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
                            Margin ~₹{Math.round((c.futures_price || c.spot_price) * c.lot_size * 0.05).toLocaleString("en-IN")}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                /* Step 2: Configure Lots & Execute Buy */
                <>
                  <div style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: "rgba(79, 70, 229, 0.08)",
                    border: "1px solid rgba(79, 70, 229, 0.25)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <div>
                      <div style={{ fontWeight: "900", color: "var(--color-text-primary)", fontSize: "14px" }}>
                        {selectedFuturesContract.contract_symbol}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                        Exp: {selectedFuturesContract.expiry_formatted} • Lot Size: {selectedFuturesContract.lot_size} sh
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedFuturesContract(null)}
                      style={{
                        padding: "3px 8px",
                        borderRadius: "4px",
                        background: "transparent",
                        border: "1px solid var(--border-subtle)",
                        color: "var(--accent-ml)",
                        fontSize: "10.5px",
                        fontWeight: "700",
                        cursor: "pointer"
                      }}
                    >
                      Change Contract
                    </button>
                  </div>

                  {/* Lots Selector */}
                  <div>
                    <label style={{ fontSize: "11.5px", fontWeight: "800", color: "var(--color-text-primary)", display: "block", marginBottom: "6px" }}>
                      Number of Lots
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() => setFuturesLots(Math.max(1, futuresLots - 1))}
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "6px",
                          background: "rgba(0, 0, 0, 0.05)",
                          border: "1px solid var(--border-subtle)",
                          fontSize: "16px",
                          fontWeight: "800",
                          cursor: "pointer"
                        }}
                      >
                        -
                      </button>

                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={futuresLots}
                        onChange={(e) => setFuturesLots(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{
                          flex: 1,
                          height: "36px",
                          textAlign: "center",
                          fontSize: "15px",
                          fontWeight: "900",
                          borderRadius: "6px",
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-subtle)",
                          color: "var(--color-text-primary)",
                          outline: "none"
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => setFuturesLots(futuresLots + 1)}
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "6px",
                          background: "rgba(0, 0, 0, 0.05)",
                          border: "1px solid var(--border-subtle)",
                          fontSize: "16px",
                          fontWeight: "800",
                          cursor: "pointer"
                        }}
                      >
                        +
                      </button>
                    </div>

                    {/* Quick Lot Pills */}
                    <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                      {[1, 2, 5, 10].map((lt) => (
                        <button
                          key={lt}
                          type="button"
                          onClick={() => setFuturesLots(lt)}
                          style={{
                            flex: 1,
                            padding: "4px",
                            borderRadius: "4px",
                            fontSize: "10.5px",
                            fontWeight: "700",
                            background: futuresLots === lt ? "var(--accent-ml)" : "rgba(0, 0, 0, 0.03)",
                            color: futuresLots === lt ? "#ffffff" : "var(--color-text-secondary)",
                            border: "1px solid var(--border-subtle)",
                            cursor: "pointer"
                          }}
                        >
                          {lt} lot{lt > 1 ? "s" : ""}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const marginPerLot = Math.round((selectedFuturesContract.futures_price || selectedFuturesContract.spot_price) * (selectedFuturesContract.lot_size || 1) * 0.05);
                          const maxLots = marginPerLot > 0 ? Math.floor(availableCash / marginPerLot) : 1;
                          setFuturesLots(Math.max(1, maxLots));
                        }}
                        style={{
                          flex: 1,
                          padding: "4px",
                          borderRadius: "4px",
                          fontSize: "10.5px",
                          fontWeight: "800",
                          background: "rgba(79, 70, 229, 0.1)",
                          color: "var(--accent-ml)",
                          border: "1px solid var(--border-subtle)",
                          cursor: "pointer"
                        }}
                      >
                        Max
                      </button>
                    </div>
                  </div>

                  {/* Calculations */}
                  <div style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: "rgba(0, 0, 0, 0.03)",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "11.5px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--color-text-secondary)" }}>Total Quantity:</span>
                      <strong>{futuresLots * (selectedFuturesContract.lot_size || 1)} shares</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--color-text-secondary)" }}>Contract Price:</span>
                      <strong>₹{(selectedFuturesContract.futures_price || selectedFuturesContract.spot_price).toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--color-text-secondary)" }}>Estimated Trade Value:</span>
                      <span>₹{(futuresLots * (selectedFuturesContract.lot_size || 1) * (selectedFuturesContract.futures_price || selectedFuturesContract.spot_price)).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border-subtle)", paddingTop: "4px", marginTop: "2px" }}>
                      <span style={{ fontWeight: "800", color: "var(--color-text-primary)" }}>Required Margin (5%):</span>
                      <strong style={{ color: "var(--accent-ml)", fontSize: "12.5px" }}>
                        ₹{Math.round(futuresLots * (selectedFuturesContract.lot_size || 1) * (selectedFuturesContract.futures_price || selectedFuturesContract.spot_price) * 0.05).toLocaleString("en-IN")}
                      </strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)", fontSize: "10.5px" }}>
                      <span>Available Virtual Cash:</span>
                      <span>₹{availableCash.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>

                  {futuresError && (
                    <div style={{ fontSize: "11px", color: "var(--color-sell)", fontWeight: "700" }}>
                      ⚠️ {futuresError}
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="button"
                    disabled={futuresSubmitting}
                    onClick={handleExecuteBuyFutures}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      background: "var(--accent-ml)",
                      border: "none",
                      color: "#ffffff",
                      fontSize: "13px",
                      fontWeight: "900",
                      cursor: futuresSubmitting ? "not-allowed" : "pointer",
                      opacity: futuresSubmitting ? 0.7 : 1,
                      boxShadow: "0 2px 8px rgba(79, 70, 229, 0.3)"
                    }}
                  >
                    {futuresSubmitting ? "Submitting Buy Order..." : `Execute Buy Futures (${futuresLots * (selectedFuturesContract.lot_size || 1)} sh)`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Equity Sell Modal (Reusing TradeModal in SELL mode) */}
      <TradeModal
        isOpen={sellModalOpen}
        onClose={() => setSellModalOpen(false)}
        ticker={sellTicker}
        initialOrderType="SELL"
        currentPrice={activeSellPrice}
        availableCash={availableCash}
        ownedQuantity={activeSellQty}
        userId={activeUser.id}
        onTradeExecuted={(updatedAccount) => {
          setAccount(updatedAccount);
          if (onAccountUpdated) onAccountUpdated(updatedAccount);
          fetchPaperTransactions(activeUser.id, txFilter === "ALL" ? undefined : txFilter).then(setTransactions);
        }}
      />

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
    </div>
  );
}
