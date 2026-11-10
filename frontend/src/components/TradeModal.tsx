"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { 
  executePaperOrder, 
  PaperAccount, 
  getPaperUserId, 
  PAPER_TRADING_USERS, 
  getActiveTradingUser 
} from "../utils/api";

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticker: string;
  initialOrderType?: "BUY" | "SELL";
  currentPrice: number;
  availableCash: number;
  ownedQuantity: number;
  userId?: string;
  onTradeExecuted?: (account: PaperAccount) => void;
}

export default function TradeModal({
  isOpen,
  onClose,
  ticker,
  initialOrderType = "BUY",
  currentPrice,
  availableCash,
  ownedQuantity,
  userId,
  onTradeExecuted
}: TradeModalProps) {
  const [orderType, setOrderType] = useState<"BUY" | "SELL">(initialOrderType);
  const [quantity, setQuantity] = useState<number>(1);
  const [confirming, setConfirming] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const effectiveUserId = userId || getPaperUserId();
  const activeUser = PAPER_TRADING_USERS.find(u => u.id === effectiveUserId) || getActiveTradingUser();

  useEffect(() => {
    if (isOpen) {
      setOrderType(initialOrderType);
      setQuantity(1);
      setConfirming(false);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, initialOrderType, ticker]);

  if (!isOpen || typeof document === "undefined") return null;

  const totalValue = quantity * (currentPrice || 0);
  const isBuy = orderType === "BUY";
  const hasSufficientCash = isBuy ? availableCash >= totalValue : true;
  const hasSufficientShares = !isBuy ? ownedQuantity >= quantity : true;

  const maxBuyShares = currentPrice > 0 ? Math.floor(availableCash / currentPrice) : 0;
  const maxSellShares = ownedQuantity;

  const handleQuickQuantity = (qty: number) => {
    setQuantity(Math.max(1, qty));
    setError(null);
    setConfirming(false);
  };

  const handlePercentageQuantity = (pct: number) => {
    if (isBuy) {
      const shares = Math.floor((availableCash * pct) / (currentPrice || 1));
      setQuantity(Math.max(1, shares));
    } else {
      const shares = Math.floor(ownedQuantity * pct);
      setQuantity(Math.max(1, shares));
    }
    setError(null);
    setConfirming(false);
  };

  const handleExecute = async () => {
    if (quantity <= 0) {
      setError("Please enter a valid quantity of at least 1 share.");
      return;
    }

    if (isBuy && !hasSufficientCash) {
      setError(`Insufficient virtual cash balance. Required: ₹${totalValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}, Available: ₹${availableCash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
      return;
    }

    if (!isBuy && !hasSufficientShares) {
      setError(`Cannot sell more shares than currently owned. Owned: ${ownedQuantity}, Requested: ${quantity}`);
      return;
    }

    if (!confirming) {
      setConfirming(true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await executePaperOrder(effectiveUserId, ticker, orderType, quantity);
      setSuccessMsg(`Simulated ${orderType} order for ${quantity} shares of ${ticker} executed successfully for ${activeUser.name}!`);

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("paper-account-updated", {
          detail: {
            userId: effectiveUserId,
            account: res.account,
            order: res.order
          }
        }));
      }

      if (onTradeExecuted) {
        onTradeExecuted(res.account);
      }
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err?.message || "Failed to execute paper trade");
      setConfirming(false);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div 
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "flex-end", // Bottom sheet on mobile
        justifyContent: "center",
        zIndex: 99999,
        padding: 0
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="glass-panel animate-fade-in trade-modal-container">
        {/* Mobile Drag Bar */}
        <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: "var(--border-subtle)", margin: "0 auto 4px auto" }} />

        {/* Header: Stock, Price, Close button */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "20px", fontWeight: "900", color: "var(--color-text-primary)" }}>{ticker}</span>
              <span style={{ 
                fontSize: "10px", 
                fontWeight: "800", 
                padding: "2px 8px", 
                borderRadius: "12px", 
                background: isBuy ? "rgba(5, 150, 105, 0.1)" : "rgba(220, 38, 38, 0.1)", 
                color: isBuy ? "var(--color-buy)" : "var(--color-sell)",
                border: `1px solid ${isBuy ? "rgba(5, 150, 105, 0.3)" : "rgba(220, 38, 38, 0.3)"}`,
                textTransform: "uppercase"
              }}>
                NSE Live Order
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
              Live Price: <strong style={{ color: "var(--color-text-primary)", fontSize: "14px" }}>₹{currentPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </div>
          </div>

          <button 
            onClick={onClose}
            disabled={loading}
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
              flexShrink: 0
            }}
          >
            ✕
          </button>
        </div>

        {/* Trader Profile Pill */}
        <div style={{
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
          color: "var(--color-text-primary)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>👤</span>
            <span>Account: <strong style={{ color: "var(--accent-ml)" }}>{activeUser.name}</strong></span>
          </div>
          <span style={{ color: "var(--color-text-muted)", fontWeight: "600" }}>Zero Brokerage</span>
        </div>

        {/* Order Type Toggle (Zerodha Style Segmented Buttons) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <button
            type="button"
            onClick={() => { setOrderType("BUY"); setConfirming(false); setError(null); }}
            style={{
              padding: "12px",
              borderRadius: "10px",
              fontWeight: "900",
              fontSize: "14px",
              cursor: "pointer",
              transition: "all 0.15s ease",
              background: isBuy ? "var(--color-buy)" : "rgba(0, 0, 0, 0.03)",
              color: isBuy ? "#ffffff" : "var(--color-text-secondary)",
              border: isBuy ? "1px solid var(--color-buy)" : "1px solid var(--border-subtle)",
              boxShadow: isBuy ? "0 4px 14px rgba(5, 150, 105, 0.35)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px"
            }}
          >
            <span>🟢</span>
            <span>BUY</span>
          </button>
          <button
            type="button"
            onClick={() => { setOrderType("SELL"); setConfirming(false); setError(null); }}
            style={{
              padding: "12px",
              borderRadius: "10px",
              fontWeight: "900",
              fontSize: "14px",
              cursor: "pointer",
              transition: "all 0.15s ease",
              background: !isBuy ? "var(--color-sell)" : "rgba(0, 0, 0, 0.03)",
              color: !isBuy ? "#ffffff" : "var(--color-text-secondary)",
              border: !isBuy ? "1px solid var(--color-sell)" : "1px solid var(--border-subtle)",
              boxShadow: !isBuy ? "0 4px 14px rgba(220, 38, 38, 0.35)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px"
            }}
          >
            <span>🔴</span>
            <span>SELL</span>
          </button>
        </div>

        {/* Balance Status Card */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "6px",
          padding: "8px 12px",
          background: "rgba(0, 0, 0, 0.02)",
          borderRadius: "8px",
          border: "1px solid var(--border-subtle)",
          fontSize: "12px"
        }}>
          <span style={{ color: "var(--color-text-secondary)" }}>
            {isBuy ? "Available Virtual Cash:" : "Owned Shares in Holding:"}
          </span>
          <span style={{ fontWeight: "800", color: isBuy ? (hasSufficientCash ? "var(--color-buy)" : "var(--color-sell)") : (hasSufficientShares ? "var(--color-text-primary)" : "var(--color-sell)") }}>
            {isBuy ? `₹${availableCash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : `${ownedQuantity} shares`}
          </span>
        </div>

        {/* Quantity Stepper & Input */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px", marginBottom: "6px" }}>
            <label style={{ fontSize: "11px", fontWeight: "800", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
              Quantity (Shares)
            </label>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
              {isBuy ? `Max: ${maxBuyShares}` : `Owned: ${ownedQuantity}`}
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => handleQuickQuantity(quantity - 1)}
              style={{
                width: "48px",
                height: "48px",
                background: "rgba(0, 0, 0, 0.04)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "8px",
                color: "var(--color-text-primary)",
                fontSize: "20px",
                fontWeight: "800",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              −
            </button>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setQuantity(isNaN(val) ? 1 : Math.max(1, val));
                setError(null);
                setConfirming(false);
              }}
              style={{
                flex: 1,
                minWidth: 0,
                width: "100%",
                padding: "10px 12px",
                fontSize: "18px",
                fontWeight: "900",
                textAlign: "center",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-card)",
                color: "var(--color-text-primary)",
                outline: "none"
              }}
            />
            <button
              type="button"
              onClick={() => handleQuickQuantity(quantity + 1)}
              style={{
                width: "48px",
                height: "48px",
                background: "rgba(0, 0, 0, 0.04)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "8px",
                color: "var(--color-text-primary)",
                fontSize: "20px",
                fontWeight: "800",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              +
            </button>
          </div>

          {/* Quick Stepper Chips (+1, +5, +10, +25, +50, +100) */}
          <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
            {[1, 5, 10, 25, 50, 100].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleQuickQuantity(preset)}
                style={{
                  padding: "5px 10px",
                  fontSize: "11px",
                  borderRadius: "6px",
                  background: quantity === preset ? "rgba(79, 70, 229, 0.15)" : "rgba(0, 0, 0, 0.03)",
                  border: quantity === preset ? "1px solid var(--accent-ml)" : "1px solid var(--border-subtle)",
                  color: quantity === preset ? "var(--accent-ml)" : "var(--color-text-secondary)",
                  cursor: "pointer",
                  fontWeight: "700"
                }}
              >
                +{preset}
              </button>
            ))}
          </div>

          {/* Percentage Allocation Chips (25%, 50%, 75%, Max / All) */}
          <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
            {[0.25, 0.50, 0.75].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => handlePercentageQuantity(pct)}
                style={{
                  flex: 1,
                  minWidth: "60px",
                  padding: "6px 8px",
                  fontSize: "11px",
                  borderRadius: "6px",
                  background: "rgba(0, 0, 0, 0.02)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                  fontWeight: "700"
                }}
              >
                {pct * 100}%
              </button>
            ))}
            {isBuy ? (
              <button
                type="button"
                onClick={() => handleQuickQuantity(maxBuyShares)}
                style={{
                  flex: 1,
                  minWidth: "70px",
                  padding: "6px 8px",
                  fontSize: "11px",
                  borderRadius: "6px",
                  background: "rgba(5, 150, 105, 0.08)",
                  border: "1px solid rgba(5, 150, 105, 0.3)",
                  color: "var(--color-buy)",
                  cursor: "pointer",
                  fontWeight: "800"
                }}
              >
                Max ({maxBuyShares})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleQuickQuantity(maxSellShares)}
                style={{
                  flex: 1,
                  minWidth: "70px",
                  padding: "6px 8px",
                  fontSize: "11px",
                  borderRadius: "6px",
                  background: "rgba(220, 38, 38, 0.08)",
                  border: "1px solid rgba(220, 38, 38, 0.3)",
                  color: "var(--color-sell)",
                  cursor: "pointer",
                  fontWeight: "800"
                }}
              >
                All ({maxSellShares})
              </button>
            )}
          </div>
        </div>

        {/* Order Value Breakdown */}
        <div style={{
          padding: "12px 14px",
          borderRadius: "10px",
          background: "rgba(0, 0, 0, 0.02)",
          border: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          fontSize: "12px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "4px" }}>
            <span style={{ color: "var(--color-text-secondary)" }}>Total Order Value:</span>
            <span style={{ fontWeight: "900", fontSize: "15px", color: isBuy ? "var(--color-buy)" : "var(--color-sell)" }}>
              ₹{totalValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "4px", fontSize: "11px", color: "var(--color-text-muted)" }}>
            <span>Cash Remaining:</span>
            <span style={{ color: "var(--color-text-primary)", fontWeight: "600" }}>
              ₹{(isBuy ? Math.max(0, availableCash - totalValue) : availableCash + totalValue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Error / Success Feedback */}
        {error && (
          <div style={{
            padding: "8px 12px",
            borderRadius: "6px",
            background: "rgba(220, 38, 38, 0.1)",
            border: "1px solid var(--color-sell)",
            color: "var(--color-sell)",
            fontSize: "12px",
            fontWeight: "600"
          }}>
            ⚠️ {error}
          </div>
        )}

        {successMsg && (
          <div style={{
            padding: "8px 12px",
            borderRadius: "6px",
            background: "rgba(5, 150, 105, 0.1)",
            border: "1px solid var(--color-buy)",
            color: "var(--color-buy)",
            fontSize: "12px",
            fontWeight: "700"
          }}>
            ✓ {successMsg}
          </div>
        )}

        {/* Confirmation Question */}
        {confirming && !successMsg && (
          <div style={{
            padding: "10px",
            borderRadius: "8px",
            background: "rgba(79, 70, 229, 0.08)",
            border: "1px solid var(--accent-ml)",
            fontSize: "12px",
            color: "var(--color-text-primary)",
            textAlign: "center"
          }}>
            <span>Confirm simulated <strong>{orderType}</strong> of <strong>{quantity} shares</strong> of <strong>{ticker}</strong> at ₹{currentPrice.toFixed(2)}?</span>
          </div>
        )}

        {/* Action Buttons (Sticky at bottom of modal) */}
        <div style={{ display: "flex", gap: "10px", marginTop: "4px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
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
              minHeight: "48px"
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExecute}
            disabled={loading || (isBuy && !hasSufficientCash) || (!isBuy && !hasSufficientShares)}
            style={{
              flex: 2,
              minWidth: "160px",
              padding: "12px",
              borderRadius: "10px",
              background: isBuy ? "var(--color-buy)" : "var(--color-sell)",
              border: "none",
              color: "#ffffff",
              fontWeight: "900",
              fontSize: "14px",
              cursor: (isBuy && !hasSufficientCash) || (!isBuy && !hasSufficientShares) || loading ? "not-allowed" : "pointer",
              opacity: (isBuy && !hasSufficientCash) || (!isBuy && !hasSufficientShares) ? 0.5 : 1,
              boxShadow: isBuy ? "0 4px 14px rgba(5, 150, 105, 0.35)" : "0 4px 14px rgba(220, 38, 38, 0.35)",
              transition: "all 0.15s ease",
              minHeight: "48px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px"
            }}
          >
            {loading ? "Simulating Order..." : confirming ? `Confirm ${orderType}` : `Execute ${orderType} ${quantity} ${ticker}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
