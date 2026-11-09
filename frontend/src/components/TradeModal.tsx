"use client";

import React, { useState, useEffect } from "react";
import { executePaperOrder, PaperAccount, getPaperUserId } from "../utils/api";

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticker: string;
  initialOrderType?: "BUY" | "SELL";
  currentPrice: number;
  availableCash: number;
  ownedQuantity: number;
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
  onTradeExecuted
}: TradeModalProps) {
  const [orderType, setOrderType] = useState<"BUY" | "SELL">(initialOrderType);
  const [quantity, setQuantity] = useState<number>(1);
  const [confirming, setConfirming] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setOrderType(initialOrderType);
      setQuantity(1);
      setConfirming(false);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, initialOrderType, ticker]);

  if (!isOpen) return null;

  const totalValue = quantity * (currentPrice || 0);
  const isBuy = orderType === "BUY";
  const hasSufficientCash = isBuy ? availableCash >= totalValue : true;
  const hasSufficientShares = !isBuy ? ownedQuantity >= quantity : true;

  const maxBuyShares = currentPrice > 0 ? Math.floor(availableCash / currentPrice) : 0;
  const maxSellShares = ownedQuantity;

  const handleQuickQuantity = (qty: number) => {
    setQuantity(Math.max(1, qty));
    setError(null);
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
      const userId = getPaperUserId();
      const res = await executePaperOrder(userId, ticker, orderType, quantity);
      setSuccessMsg(`Simulated ${orderType} order for ${quantity} shares of ${ticker} executed successfully!`);
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

  return (
    <div 
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div 
        className="glass-panel animate-fade-in"
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "14px",
          padding: "24px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          gap: "18px"
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "20px", fontWeight: "900", color: "var(--color-text-primary)" }}>{ticker}</span>
              <span style={{ 
                fontSize: "10px", 
                fontWeight: "700", 
                padding: "2px 8px", 
                borderRadius: "12px", 
                background: "rgba(139, 92, 246, 0.15)", 
                color: "var(--accent-ml)",
                border: "1px solid rgba(139, 92, 246, 0.3)",
                textTransform: "uppercase"
              }}>
                Simulated Market Order
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
              NSE Real-Time Price: <strong style={{ color: "var(--color-text-primary)" }}>₹{currentPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </div>
          </div>

          <button 
            onClick={onClose}
            disabled={loading}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-text-muted)",
              fontSize: "20px",
              cursor: "pointer",
              padding: "4px"
            }}
          >
            ✕
          </button>
        </div>

        {/* Disclaimer Banner */}
        <div style={{
          padding: "8px 12px",
          borderRadius: "8px",
          background: "rgba(255, 179, 0, 0.08)",
          border: "1px solid rgba(255, 179, 0, 0.25)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "11px",
          color: "#f59e0b"
        }}>
          <span>🛡️</span>
          <span><strong>Paper Trading:</strong> Virtual simulated funds only. No real money or brokers involved.</span>
        </div>

        {/* Order Type Toggle */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <button
            type="button"
            onClick={() => { setOrderType("BUY"); setConfirming(false); setError(null); }}
            style={{
              padding: "10px",
              borderRadius: "8px",
              fontWeight: "800",
              fontSize: "14px",
              cursor: "pointer",
              transition: "all 0.2s",
              background: isBuy ? "var(--color-buy)" : "rgba(255, 255, 255, 0.03)",
              color: isBuy ? "#ffffff" : "var(--color-text-secondary)",
              border: isBuy ? "1px solid var(--color-buy)" : "1px solid var(--border-subtle)",
              boxShadow: isBuy ? "0 4px 12px rgba(16, 185, 129, 0.3)" : "none"
            }}
          >
            🟢 BUY
          </button>
          <button
            type="button"
            onClick={() => { setOrderType("SELL"); setConfirming(false); setError(null); }}
            style={{
              padding: "10px",
              borderRadius: "8px",
              fontWeight: "800",
              fontSize: "14px",
              cursor: "pointer",
              transition: "all 0.2s",
              background: !isBuy ? "var(--color-sell)" : "rgba(255, 255, 255, 0.03)",
              color: !isBuy ? "#ffffff" : "var(--color-text-secondary)",
              border: !isBuy ? "1px solid var(--color-sell)" : "1px solid var(--border-subtle)",
              boxShadow: !isBuy ? "0 4px 12px rgba(239, 68, 68, 0.3)" : "none"
            }}
          >
            🔴 SELL
          </button>
        </div>

        {/* Account Available Balance Summary */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "rgba(0, 0, 0, 0.2)",
          borderRadius: "8px",
          border: "1px solid var(--border-subtle)",
          fontSize: "12px"
        }}>
          <span style={{ color: "var(--color-text-secondary)" }}>
            {isBuy ? "Available Virtual Cash:" : "Owned Shares Available:"}
          </span>
          <span style={{ fontWeight: "800", color: isBuy ? (hasSufficientCash ? "var(--color-buy)" : "var(--color-sell)") : (hasSufficientShares ? "var(--color-text-primary)" : "var(--color-sell)") }}>
            {isBuy ? `₹${availableCash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : `${ownedQuantity} shares`}
          </span>
        </div>

        {/* Quantity Input */}
        <div>
          <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-secondary)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
            Number of Shares
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => handleQuickQuantity(quantity - 1)}
              style={{
                width: "40px",
                height: "40px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "6px",
                color: "var(--color-text-primary)",
                fontSize: "18px",
                fontWeight: "700",
                cursor: "pointer"
              }}
            >
              -
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
                padding: "8px 12px",
                fontSize: "16px",
                fontWeight: "800",
                textAlign: "center",
                borderRadius: "6px",
                border: "1px solid var(--border-subtle)",
                background: "rgba(0, 0, 0, 0.25)",
                color: "var(--color-text-primary)",
                outline: "none"
              }}
            />
            <button
              type="button"
              onClick={() => handleQuickQuantity(quantity + 1)}
              style={{
                width: "40px",
                height: "40px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "6px",
                color: "var(--color-text-primary)",
                fontSize: "18px",
                fontWeight: "700",
                cursor: "pointer"
              }}
            >
              +
            </button>
          </div>

          {/* Quick Quantity Presets */}
          <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
            {[1, 5, 10, 25, 50].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleQuickQuantity(preset)}
                style={{
                  padding: "4px 8px",
                  fontSize: "11px",
                  borderRadius: "4px",
                  background: quantity === preset ? "rgba(139, 92, 246, 0.2)" : "rgba(255, 255, 255, 0.04)",
                  border: quantity === preset ? "1px solid var(--accent-ml)" : "1px solid var(--border-subtle)",
                  color: quantity === preset ? "var(--accent-ml)" : "var(--color-text-secondary)",
                  cursor: "pointer"
                }}
              >
                +{preset}
              </button>
            ))}
            {isBuy && maxBuyShares > 0 && (
              <button
                type="button"
                onClick={() => handleQuickQuantity(maxBuyShares)}
                style={{
                  padding: "4px 8px",
                  fontSize: "11px",
                  borderRadius: "4px",
                  background: "rgba(16, 185, 129, 0.1)",
                  border: "1px solid var(--color-buy)",
                  color: "var(--color-buy)",
                  cursor: "pointer",
                  fontWeight: "700"
                }}
              >
                Max ({maxBuyShares})
              </button>
            )}
            {!isBuy && maxSellShares > 0 && (
              <button
                type="button"
                onClick={() => handleQuickQuantity(maxSellShares)}
                style={{
                  padding: "4px 8px",
                  fontSize: "11px",
                  borderRadius: "4px",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid var(--color-sell)",
                  color: "var(--color-sell)",
                  cursor: "pointer",
                  fontWeight: "700"
                }}
              >
                All ({maxSellShares})
              </button>
            )}
          </div>
        </div>

        {/* Order Breakdown */}
        <div style={{
          padding: "14px",
          borderRadius: "8px",
          background: "rgba(0, 0, 0, 0.3)",
          border: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          fontSize: "13px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--color-text-secondary)" }}>Execution Price:</span>
            <span style={{ fontWeight: "700", color: "var(--color-text-primary)" }}>
              ₹{currentPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--color-text-secondary)" }}>Estimated Order Value:</span>
            <span style={{ fontWeight: "900", fontSize: "16px", color: isBuy ? "var(--color-buy)" : "var(--color-sell)" }}>
              ₹{totalValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", borderTop: "1px solid var(--border-subtle)", paddingTop: "6px" }}>
            <span style={{ color: "var(--color-text-muted)" }}>Projected Cash Balance:</span>
            <span style={{ color: "var(--color-text-secondary)", fontWeight: "600" }}>
              ₹{(isBuy ? Math.max(0, availableCash - totalValue) : availableCash + totalValue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Error / Success Feedback */}
        {error && (
          <div style={{
            padding: "8px 12px",
            borderRadius: "6px",
            background: "rgba(239, 68, 68, 0.15)",
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
            background: "rgba(16, 185, 129, 0.15)",
            border: "1px solid var(--color-buy)",
            color: "var(--color-buy)",
            fontSize: "12px",
            fontWeight: "600"
          }}>
            ✓ {successMsg}
          </div>
        )}

        {/* Confirmation Question */}
        {confirming && !successMsg && (
          <div style={{
            padding: "10px",
            borderRadius: "8px",
            background: "rgba(124, 77, 255, 0.1)",
            border: "1px solid var(--accent-ml)",
            fontSize: "12px",
            color: "var(--color-text-primary)",
            textAlign: "center"
          }}>
            <span>Confirm simulated <strong>{orderType}</strong> of <strong>{quantity} shares</strong> of <strong>{ticker}</strong> at ₹{currentPrice.toFixed(2)}?</span>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "8px",
              background: "transparent",
              border: "1px solid var(--border-subtle)",
              color: "var(--color-text-secondary)",
              fontWeight: "700",
              cursor: "pointer"
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
              padding: "12px",
              borderRadius: "8px",
              background: isBuy ? "var(--color-buy)" : "var(--color-sell)",
              border: "none",
              color: "#ffffff",
              fontWeight: "900",
              fontSize: "14px",
              cursor: (isBuy && !hasSufficientCash) || (!isBuy && !hasSufficientShares) || loading ? "not-allowed" : "pointer",
              opacity: (isBuy && !hasSufficientCash) || (!isBuy && !hasSufficientShares) ? 0.5 : 1,
              boxShadow: isBuy ? "0 4px 14px rgba(16, 185, 129, 0.4)" : "0 4px 14px rgba(239, 68, 68, 0.4)",
              transition: "all 0.2s"
            }}
          >
            {loading ? "Simulating Order..." : confirming ? `Confirm ${orderType}` : `Execute ${orderType}`}
          </button>
        </div>
      </div>
    </div>
  );
}
