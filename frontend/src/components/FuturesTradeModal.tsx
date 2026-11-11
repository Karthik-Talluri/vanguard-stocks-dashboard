"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  FuturesContractSpec,
  FuturesExpiryOption,
  PaperAccount,
  PAPER_TRADING_USERS,
  getActiveTradingUser,
  getPaperUserId,
  fetchFuturesContract,
  executeFuturesOrder,
} from "../utils/api";

interface FuturesTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticker: string;
  initialSide?: "BUY" | "SELL";
  initialLots?: number;
  availableCash: number;
  userId?: string;
  onTradeExecuted?: (account: PaperAccount) => void;
}

function makeIdempotencyKey(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function FuturesTradeModal({
  isOpen,
  onClose,
  ticker,
  initialSide = "BUY",
  initialLots = 1,
  availableCash,
  userId,
  onTradeExecuted,
}: FuturesTradeModalProps) {
  const [side, setSide] = useState<"BUY" | "SELL">(initialSide);
  const [lots, setLots] = useState<number>(Math.max(1, initialLots || 1));
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [selectedExpiryDate, setSelectedExpiryDate] = useState<string>("");
  const [limitPriceInput, setLimitPriceInput] = useState<string>("");

  const [spec, setSpec] = useState<FuturesContractSpec | null>(null);
  const [specLoading, setSpecLoading] = useState<boolean>(false);
  const [confirming, setConfirming] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const submittingRef = useRef<boolean>(false);
  const idempotencyKeyRef = useRef<string>("");

  const effectiveUserId = userId || getPaperUserId();
  const activeUser = PAPER_TRADING_USERS.find((u) => u.id === effectiveUserId) || getActiveTradingUser();

  useEffect(() => {
    if (!isOpen || !ticker) return;
    setSide(initialSide);
    setLots(Math.max(1, initialLots || 1));
    setOrderType("MARKET");
    setConfirming(false);
    setSubmitting(false);
    submittingRef.current = false;
    setError(null);
    setSuccessMsg(null);
    idempotencyKeyRef.current = makeIdempotencyKey("FUT");

    let cancelled = false;
    setSpecLoading(true);
    fetchFuturesContract(ticker, 1)
      .then((data) => {
        if (cancelled) return;
        setSpec(data);
        const nearExp = data.available_expiries?.[0]?.expiry_date || data.expiry_date;
        setSelectedExpiryDate(nearExp);
        setLimitPriceInput(data.futures_price.toFixed(2));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || `Failed to load NSE Futures contract for ${ticker}`);
      })
      .finally(() => {
        if (!cancelled) setSpecLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, ticker, initialSide, initialLots]);

  // Refresh idempotency key when order parameters intentionally change
  const resetConfirmationAndKey = () => {
    setConfirming(false);
    setError(null);
    idempotencyKeyRef.current = makeIdempotencyKey("FUT");
  };

  if (!isOpen || typeof document === "undefined") return null;

  const expiries: FuturesExpiryOption[] = spec?.available_expiries || [];
  const activeExpiryObj =
    expiries.find((e) => e.expiry_date === selectedExpiryDate) || expiries[0] || null;

  const lotSize = spec?.lot_size || 1;
  const spotPrice = spec?.spot_price || 0;
  const liveFuturesPrice = activeExpiryObj?.futures_price ?? spec?.futures_price ?? 0;
  const expiryFormatted = activeExpiryObj?.expiry_formatted ?? spec?.expiry_formatted ?? "Current Month";
  const contractSymbol = activeExpiryObj?.contract_symbol ?? spec?.contract_symbol ?? `${ticker} FUT`;
  const daysToExpiry = activeExpiryObj?.days_to_expiry ?? spec?.days_to_expiry ?? 0;
  const marginPct = spec?.margin_pct ?? 0.05;
  const marginPctDisplay = spec?.margin_pct_display ?? 5.0;

  const parsedLimit = parseFloat(limitPriceInput);
  const effectivePrice =
    orderType === "LIMIT" && !isNaN(parsedLimit) && parsedLimit > 0 ? parsedLimit : liveFuturesPrice;

  const safeLots = Math.max(1, lots || 1);
  const totalQuantity = lotSize * safeLots;
  const estimatedTradeValue = Math.round(effectivePrice * totalQuantity * 100) / 100;
  const requiredMargin = Math.round(estimatedTradeValue * marginPct * 100) / 100;
  const marginPerLot = lotSize > 0 && effectivePrice > 0 ? effectivePrice * lotSize * marginPct : 0;
  const maxAffordableLots = marginPerLot > 0 ? Math.floor(availableCash / marginPerLot) : 0;

  const isBuy = side === "BUY";
  const hasSufficientMargin = availableCash >= requiredMargin && requiredMargin > 0;
  const hasValidLimit = orderType === "MARKET" || (!isNaN(parsedLimit) && parsedLimit > 0);
  const limitWillFillImmediately =
    orderType === "LIMIT" &&
    hasValidLimit &&
    liveFuturesPrice > 0 &&
    ((isBuy && parsedLimit >= liveFuturesPrice) || (!isBuy && parsedLimit <= liveFuturesPrice));

  const handleExpirySelect = (newExpDate: string) => {
    setSelectedExpiryDate(newExpDate);
    const found = expiries.find((e) => e.expiry_date === newExpDate);
    if (found) {
      setLimitPriceInput(found.futures_price.toFixed(2));
    }
    resetConfirmationAndKey();
  };

  const handleLotsChange = (nextLots: number) => {
    setLots(Math.max(1, Math.floor(nextLots) || 1));
    resetConfirmationAndKey();
  };

  const handleExecute = async () => {
    if (submittingRef.current || submitting) return;
    if (!spec) {
      setError("Futures contract data is still loading.");
      return;
    }
    if (safeLots < 1) {
      setError("Please select at least 1 Futures lot.");
      return;
    }
    if (!hasValidLimit) {
      setError("Please enter a valid positive Limit Price.");
      return;
    }
    if (!hasSufficientMargin) {
      setError(
        `Insufficient virtual cash for margin. Required: ₹${requiredMargin.toLocaleString("en-IN", { minimumFractionDigits: 2 })}, Available: ₹${availableCash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
      );
      return;
    }

    if (!confirming) {
      setConfirming(true);
      setError(null);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const res = await executeFuturesOrder(
        effectiveUserId,
        ticker,
        side,
        safeLots,
        orderType,
        orderType === "LIMIT" ? parsedLimit : undefined,
        activeExpiryObj?.expiry_date || selectedExpiryDate || undefined,
        idempotencyKeyRef.current
      );

      setSuccessMsg(
        res.order?.message ||
          `Simulated ${side} FUTURES for ${safeLots} lot(s) (${totalQuantity} shares) of ${contractSymbol} submitted for ${activeUser.name}!`
      );

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("paper-account-updated", {
            detail: {
              userId: effectiveUserId,
              account: res.account,
              order: res.order,
            },
          })
        );
      }

      if (onTradeExecuted && res.account) {
        onTradeExecuted(res.account);
      }

      setTimeout(() => {
        onClose();
      }, 1150);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to execute Futures paper order.";
      setError(msg);
      setConfirming(false);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 99999,
        padding: 0,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="glass-panel animate-fade-in trade-modal-container" style={{ maxWidth: "520px" }}>
        {/* Drag Indicator */}
        <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: "var(--border-subtle)", margin: "0 auto 2px auto" }} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "20px", fontWeight: "900", color: "var(--color-text-primary)" }}>{ticker}</span>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: "800",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: isBuy ? "rgba(5, 150, 105, 0.1)" : "rgba(220, 38, 38, 0.1)",
                  color: isBuy ? "var(--color-buy)" : "var(--color-sell)",
                  border: `1px solid ${isBuy ? "rgba(5, 150, 105, 0.3)" : "rgba(220, 38, 38, 0.3)"}`,
                  textTransform: "uppercase",
                }}
              >
                {spec?.exchange || "NSE"} Futures Sim
              </span>
            </div>
            <div style={{ fontSize: "11.5px", color: "var(--color-text-secondary)", marginTop: "3px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <span>
                Spot: <strong style={{ color: "var(--color-text-primary)" }}>₹{spotPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </span>
              <span>
                Futures: <strong style={{ color: "var(--accent-ml)", fontSize: "13px" }}>₹{liveFuturesPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </span>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close Futures Modal"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: "rgba(0,0,0,0.04)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "50%",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-text-muted)",
              fontSize: "16px",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Account & Margin Profile Bar */}
        <div
          style={{
            padding: "6px 12px",
            borderRadius: "8px",
            background: "rgba(79, 70, 229, 0.08)",
            border: "1px solid rgba(79, 70, 229, 0.25)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "6px",
            fontSize: "11px",
            color: "var(--color-text-primary)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>👤</span>
            <span>
              Account: <strong style={{ color: "var(--accent-ml)" }}>{activeUser.name}</strong>
            </span>
          </div>
          <span style={{ color: "var(--color-text-secondary)", fontWeight: "700" }}>
            Paper Margin: {marginPctDisplay}% ({Math.round(1 / marginPct)}x)
          </span>
        </div>

        {specLoading && !spec ? (
          <div style={{ padding: "28px 12px", textAlign: "center", fontSize: "12px", color: "var(--color-text-secondary)" }}>
            Loading NSE Futures contract specs for {ticker}...
          </div>
        ) : (
          <>
            {/* BUY FUTURES / SELL FUTURES Segmented Buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  setSide("BUY");
                  resetConfirmationAndKey();
                }}
                style={{
                  padding: "11px",
                  borderRadius: "10px",
                  fontWeight: "900",
                  fontSize: "13px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  background: isBuy ? "var(--color-buy)" : "rgba(0, 0, 0, 0.03)",
                  color: isBuy ? "#ffffff" : "var(--color-text-secondary)",
                  border: isBuy ? "1px solid var(--color-buy)" : "1px solid var(--border-subtle)",
                  boxShadow: isBuy ? "0 4px 14px rgba(5, 150, 105, 0.35)" : "none",
                }}
              >
                BUY FUTURES (LONG)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSide("SELL");
                  resetConfirmationAndKey();
                }}
                style={{
                  padding: "11px",
                  borderRadius: "10px",
                  fontWeight: "900",
                  fontSize: "13px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  background: !isBuy ? "var(--color-sell)" : "rgba(0, 0, 0, 0.03)",
                  color: !isBuy ? "#ffffff" : "var(--color-text-secondary)",
                  border: !isBuy ? "1px solid var(--color-sell)" : "1px solid var(--border-subtle)",
                  boxShadow: !isBuy ? "0 4px 14px rgba(220, 38, 38, 0.35)" : "none",
                }}
              >
                SELL FUTURES (SHORT)
              </button>
            </div>

            {/* Expiry Selector & Order Type Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: "10px", alignItems: "end" }}>
              <div style={{ minWidth: 0 }}>
                <label
                  htmlFor="futures-expiry-select"
                  style={{ display: "block", fontSize: "10px", fontWeight: "800", color: "var(--color-text-muted)", textTransform: "uppercase", marginBottom: "4px" }}
                >
                  Contract & Expiry ({daysToExpiry}d)
                </label>
                <select
                  id="futures-expiry-select"
                  value={selectedExpiryDate}
                  onChange={(e) => handleExpirySelect(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "12px",
                    fontWeight: "700",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                    background: "var(--bg-card)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  {expiries.map((exp) => (
                    <option key={exp.expiry_date} value={exp.expiry_date}>
                      {exp.expiry_formatted} ({exp.series}) — ₹{exp.futures_price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "10px", fontWeight: "800", color: "var(--color-text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>
                  Order Type
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                  {(["MARKET", "LIMIT"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setOrderType(mode);
                        if (mode === "LIMIT" && (!limitPriceInput || parseFloat(limitPriceInput) <= 0)) {
                          setLimitPriceInput(liveFuturesPrice.toFixed(2));
                        }
                        resetConfirmationAndKey();
                      }}
                      style={{
                        padding: "8px 6px",
                        borderRadius: "7px",
                        fontSize: "11px",
                        fontWeight: "800",
                        border: orderType === mode ? "1px solid var(--accent-ml)" : "1px solid var(--border-subtle)",
                        background: orderType === mode ? "rgba(79, 70, 229, 0.12)" : "rgba(0, 0, 0, 0.02)",
                        color: orderType === mode ? "var(--accent-ml)" : "var(--color-text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Limit Price Input when LIMIT selected */}
            {orderType === "LIMIT" && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "rgba(79, 70, 229, 0.05)",
                  border: "1px solid rgba(79, 70, 229, 0.25)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                  <label htmlFor="futures-limit-price" style={{ fontSize: "11px", fontWeight: "800", color: "var(--color-text-primary)" }}>
                    Limit Price (₹)
                  </label>
                  <span style={{ fontSize: "10.5px", color: "var(--color-text-muted)" }}>
                    Live Futures: ₹{liveFuturesPrice.toFixed(2)}
                  </span>
                </div>
                <input
                  id="futures-limit-price"
                  type="number"
                  step="0.05"
                  min="0.05"
                  value={limitPriceInput}
                  onChange={(e) => {
                    setLimitPriceInput(e.target.value);
                    resetConfirmationAndKey();
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "14px",
                    fontWeight: "800",
                    borderRadius: "7px",
                    border: "1px solid var(--border-subtle)",
                    background: "var(--bg-card)",
                    color: "var(--color-text-primary)",
                  }}
                />
                <div style={{ fontSize: "10px", color: limitWillFillImmediately ? "var(--color-buy)" : "var(--accent-ml)", fontWeight: "700" }}>
                  {!hasValidLimit
                    ? "Enter a valid positive limit price"
                    : limitWillFillImmediately
                      ? `Marketable limit: executes immediately at live ₹${liveFuturesPrice.toFixed(2)}`
                      : `Resting order: waits until ${contractSymbol} reaches ₹${parsedLimit.toFixed(2)}`}
                </div>
              </div>
            )}

            {/* Contract Specs Summary Box (Contract, Exchange, Lot Size, Total Share Qty) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: "6px",
                padding: "9px 10px",
                borderRadius: "8px",
                background: "rgba(0, 0, 0, 0.02)",
                border: "1px solid var(--border-subtle)",
                textAlign: "center",
              }}
            >
              <div>
                <div style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>EXCHANGE</div>
                <div style={{ fontSize: "12px", fontWeight: "900", color: "var(--color-text-primary)" }}>{spec?.exchange || "NSE"}</div>
              </div>
              <div>
                <div style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>LOT SIZE</div>
                <div style={{ fontSize: "12px", fontWeight: "900", color: "var(--color-text-primary)" }}>{lotSize.toLocaleString("en-IN")}</div>
              </div>
              <div>
                <div style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>LOTS</div>
                <div style={{ fontSize: "12px", fontWeight: "900", color: "var(--accent-ml)" }}>{safeLots}</div>
              </div>
              <div>
                <div style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>TOTAL QTY</div>
                <div style={{ fontSize: "12px", fontWeight: "900", color: "var(--color-buy)" }} data-testid="futures-modal-total-qty">
                  {totalQuantity.toLocaleString("en-IN")}
                </div>
              </div>
            </div>

            {/* Number of Lots Selector */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", fontSize: "11px" }}>
                <label htmlFor="futures-lots-input" style={{ fontWeight: "800", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
                  Number of Lots ({lotSize} units / lot)
                </label>
                <span style={{ color: "var(--color-text-muted)" }}>
                  Affordable Max: <strong>{maxAffordableLots} lots</strong>
                </span>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  aria-label="Decrease lots"
                  onClick={() => handleLotsChange(safeLots - 1)}
                  style={{
                    width: "46px",
                    height: "46px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                    background: "rgba(0,0,0,0.04)",
                    fontSize: "20px",
                    fontWeight: "800",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  −
                </button>
                <input
                  id="futures-lots-input"
                  type="number"
                  min={1}
                  value={safeLots}
                  onChange={(e) => handleLotsChange(parseInt(e.target.value, 10) || 1)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: "center",
                    fontSize: "18px",
                    fontWeight: "900",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                    background: "var(--bg-card)",
                  }}
                />
                <button
                  type="button"
                  aria-label="Increase lots"
                  onClick={() => handleLotsChange(safeLots + 1)}
                  style={{
                    width: "46px",
                    height: "46px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                    background: "rgba(0,0,0,0.04)",
                    fontSize: "20px",
                    fontWeight: "800",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  +
                </button>
              </div>

              {/* Quick Lot Presets */}
              <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
                {[1, 2, 3, 5].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleLotsChange(preset)}
                    style={{
                      flex: 1,
                      minWidth: "56px",
                      padding: "6px 8px",
                      fontSize: "11px",
                      fontWeight: "700",
                      borderRadius: "6px",
                      background: safeLots === preset ? "rgba(79, 70, 229, 0.14)" : "rgba(0, 0, 0, 0.03)",
                      border: safeLots === preset ? "1px solid var(--accent-ml)" : "1px solid var(--border-subtle)",
                      color: safeLots === preset ? "var(--accent-ml)" : "var(--color-text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    {preset} {preset === 1 ? "Lot" : "Lots"}
                  </button>
                ))}
                {maxAffordableLots >= 1 && (
                  <button
                    type="button"
                    onClick={() => handleLotsChange(maxAffordableLots)}
                    style={{
                      flex: 1,
                      minWidth: "70px",
                      padding: "6px 8px",
                      fontSize: "11px",
                      fontWeight: "800",
                      borderRadius: "6px",
                      background: "rgba(5, 150, 105, 0.08)",
                      border: "1px solid rgba(5, 150, 105, 0.3)",
                      color: "var(--color-buy)",
                      cursor: "pointer",
                    }}
                  >
                    Max ({maxAffordableLots})
                  </button>
                )}
              </div>
            </div>

            {/* Financial Summary Box */}
            <div
              style={{
                padding: "11px 14px",
                borderRadius: "10px",
                background: "rgba(0, 0, 0, 0.025)",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                gap: "5px",
                fontSize: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "4px", fontSize: "11px", color: "var(--color-text-muted)" }}>
                <span>Contract:</span>
                <strong style={{ color: "var(--color-text-primary)" }}>
                  {contractSymbol} • Exp {expiryFormatted}
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "4px" }}>
                <span style={{ color: "var(--color-text-secondary)" }}>Estimated Trade Value ({totalQuantity.toLocaleString("en-IN")} × ₹{effectivePrice.toFixed(2)}):</span>
                <strong style={{ color: "var(--color-text-primary)" }} data-testid="futures-modal-trade-value">
                  ₹{estimatedTradeValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
                <span style={{ color: "var(--color-text-secondary)", fontWeight: "700" }}>Required Margin ({marginPctDisplay}%):</span>
                <span
                  style={{ fontWeight: "900", fontSize: "15px", color: hasSufficientMargin ? (isBuy ? "var(--color-buy)" : "var(--color-sell)") : "var(--color-sell)" }}
                  data-testid="futures-modal-required-margin"
                >
                  ₹{requiredMargin.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "4px", fontSize: "11px", color: "var(--color-text-muted)", borderTop: "1px solid var(--border-subtle)", paddingTop: "4px" }}>
                <span>Available Cash: <strong>₹{availableCash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></span>
                <span>
                  After Margin: <strong style={{ color: hasSufficientMargin ? "var(--color-text-primary)" : "var(--color-sell)" }}>
                    ₹{Math.max(0, availableCash - requiredMargin).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </strong>
                </span>
              </div>
            </div>
          </>
        )}

        {/* Error & Success Feedback */}
        {error && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              background: "rgba(220, 38, 38, 0.1)",
              border: "1px solid var(--color-sell)",
              color: "var(--color-sell)",
              fontSize: "12px",
              fontWeight: "600",
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {successMsg && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              background: "rgba(5, 150, 105, 0.1)",
              border: "1px solid var(--color-buy)",
              color: "var(--color-buy)",
              fontSize: "12px",
              fontWeight: "700",
            }}
          >
            ✓ {successMsg}
          </div>
        )}

        {/* Two-step confirmation banner */}
        {confirming && !successMsg && (
          <div
            style={{
              padding: "10px",
              borderRadius: "8px",
              background: "rgba(79, 70, 229, 0.08)",
              border: "1px solid var(--accent-ml)",
              fontSize: "12px",
              color: "var(--color-text-primary)",
              textAlign: "center",
            }}
          >
            Confirm simulated <strong>{side} FUTURES</strong> ({orderType}) for{" "}
            <strong>{safeLots} lot{safeLots > 1 ? "s" : ""}</strong> ({totalQuantity.toLocaleString("en-IN")} shares) of{" "}
            <strong>{contractSymbol}</strong> at ₹{effectivePrice.toFixed(2)}? Margin blocked:{" "}
            <strong>₹{requiredMargin.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>.
          </div>
        )}

        {/* Footer Buttons */}
        <div style={{ display: "flex", gap: "10px", marginTop: "2px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              flex: 1,
              minWidth: "96px",
              padding: "12px",
              borderRadius: "10px",
              background: "transparent",
              border: "1px solid var(--border-subtle)",
              color: "var(--color-text-secondary)",
              fontWeight: "700",
              cursor: "pointer",
              minHeight: "46px",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExecute}
            disabled={!spec || submitting || !hasSufficientMargin || !hasValidLimit || Boolean(successMsg)}
            style={{
              flex: 2,
              minWidth: "170px",
              padding: "12px",
              borderRadius: "10px",
              background: isBuy ? "var(--color-buy)" : "var(--color-sell)",
              border: "none",
              color: "#ffffff",
              fontWeight: "900",
              fontSize: "13.5px",
              cursor: !spec || submitting || !hasSufficientMargin || !hasValidLimit ? "not-allowed" : "pointer",
              opacity: !spec || !hasSufficientMargin || !hasValidLimit ? 0.5 : 1,
              boxShadow: isBuy ? "0 4px 14px rgba(5, 150, 105, 0.35)" : "0 4px 14px rgba(220, 38, 38, 0.35)",
              minHeight: "46px",
            }}
          >
            {submitting
              ? "Simulating Futures Order..."
              : confirming
                ? `Confirm ${side} FUTURES`
                : `${side} FUTURES (${totalQuantity.toLocaleString("en-IN")} Qty)`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
