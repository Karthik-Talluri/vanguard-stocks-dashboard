"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  StockOverview,
  getLocalWatchlistTickers,
  fetchWatchlist,
  addToWatchlist,
  removeFromWatchlist,
} from "../utils/api";

interface WatchlistViewProps {
  stocks: StockOverview[];
  userId: string;
  userName: string;
  onSelectStock: (ticker: string) => void;
}

export default function WatchlistView({
  stocks,
  userId,
  userName,
  onSelectStock,
}: WatchlistViewProps) {
  const [savedTickers, setSavedTickers] = useState<string[]>(() => getLocalWatchlistTickers(userId));
  const [selectedToAdd, setSelectedToAdd] = useState<string>("");
  const [syncing, setSyncing] = useState<boolean>(false);
  const [mutating, setMutating] = useState<boolean>(false);
  const [wlError, setWlError] = useState<string | null>(null);
  const opSeqRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    const startSeq = opSeqRef.current;
    setSyncing(true);
    setWlError(null);
    setSavedTickers(getLocalWatchlistTickers(userId));
    fetchWatchlist(userId)
      .then((tickers) => {
        if (!cancelled && opSeqRef.current === startSeq) {
          setSavedTickers(tickers);
        }
      })
      .catch((err) => {
        if (!cancelled) setWlError(err?.message || "Failed to sync watchlist");
      })
      .finally(() => {
        if (!cancelled) setSyncing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const stocksByTicker = useMemo(() => {
    const map = new Map<string, StockOverview>();
    for (const s of stocks) {
      map.set(s.ticker, s);
    }
    return map;
  }, [stocks]);

  const availableToAdd = useMemo(() => {
    const savedSet = new Set(savedTickers);
    return [...stocks]
      .filter((s) => !savedSet.has(s.ticker))
      .sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [stocks, savedTickers]);

  const effectiveSelectedToAdd =
    selectedToAdd && availableToAdd.some((s) => s.ticker === selectedToAdd)
      ? selectedToAdd
      : availableToAdd[0]?.ticker || "";

  const handleAddTicker = async (tickerToAdd?: string) => {
    const target = (tickerToAdd || effectiveSelectedToAdd || "").trim().toUpperCase();
    if (!target || savedTickers.includes(target) || mutating) return;
    const mySeq = ++opSeqRef.current;
    setMutating(true);
    setWlError(null);
    try {
      const updated = await addToWatchlist(userId, target);
      if (opSeqRef.current === mySeq) {
        setSavedTickers(updated);
        setSelectedToAdd("");
      }
    } catch (err: unknown) {
      setWlError(err instanceof Error ? err.message : `Failed to add ${target} to watchlist`);
    } finally {
      setMutating(false);
    }
  };

  const handleRemoveTicker = async (ticker: string) => {
    if (mutating) return;
    const mySeq = ++opSeqRef.current;
    setMutating(true);
    setWlError(null);
    try {
      const updated = await removeFromWatchlist(userId, ticker);
      if (opSeqRef.current === mySeq) {
        setSavedTickers(updated);
      }
    } catch (err: unknown) {
      setWlError(err instanceof Error ? err.message : `Failed to remove ${ticker} from watchlist`);
    } finally {
      setMutating(false);
    }
  };

  const getSignalColor = (rec?: string) => {
    const upper = (rec || "").toUpperCase();
    if (upper.includes("BUY")) return "var(--color-buy)";
    if (upper.includes("SELL")) return "var(--color-sell)";
    return "var(--color-hold)";
  };

  return (
    <div data-testid="watchlist-view" style={{ display: "flex", flexDirection: "column", gap: "14px" }} className="animate-fade-in">
      {/* Header + Add Stock Card */}
      <div
        className="glass-panel"
        style={{
          padding: "clamp(12px, 3.5vw, 20px)",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flexWrap: "wrap" }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="var(--accent-ml)"
              stroke="var(--accent-ml)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <h2
              style={{
                fontSize: "clamp(16px, 4.5vw, 19px)",
                fontWeight: "900",
                color: "var(--color-text-primary)",
                margin: 0,
              }}
            >
              Saved Watchlist
            </h2>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: "10px",
                fontWeight: "800",
                padding: "3px 8px",
                borderRadius: "12px",
                background: "rgba(79, 70, 229, 0.1)",
                color: "var(--accent-ml)",
                border: "1px solid rgba(79, 70, 229, 0.25)",
              }}
            >
              {savedTickers.length} Saved
            </span>
            <span
              style={{
                fontSize: "10px",
                fontWeight: "700",
                padding: "3px 8px",
                borderRadius: "12px",
                background: "rgba(0, 0, 0, 0.03)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {userName}
            </span>
          </div>
        </div>

        <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: 0, lineHeight: 1.4 }}>
          Track your saved NSE stocks with live market quotes, AI consensus scores, and one-tap research or paper trading.
        </p>

        {/* Add Stock Control */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", width: "100%" }}>
          <select
            id="watchlist-add-select"
            aria-label="Select stock to add to watchlist"
            value={effectiveSelectedToAdd}
            onChange={(e) => setSelectedToAdd(e.target.value)}
            disabled={availableToAdd.length === 0}
            style={{
              flex: "1 1 180px",
              minWidth: 0,
              maxWidth: "100%",
              padding: "9px 10px",
              borderRadius: "8px",
              background: "var(--bg-card)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--border-subtle)",
              fontSize: "12px",
              fontWeight: "600",
              cursor: availableToAdd.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            {stocks.length === 0 ? (
              <option value="">Loading NSE stocks...</option>
            ) : availableToAdd.length === 0 ? (
              <option value="">All 50 NSE stocks added</option>
            ) : (
              availableToAdd.map((s) => (
                <option key={s.ticker} value={s.ticker}>
                  {s.ticker}
                  {typeof s.price === "number"
                    ? ` (₹${s.price.toLocaleString("en-IN", { maximumFractionDigits: 1 })})`
                    : ""}
                </option>
              ))
            )}
          </select>

          <button
            type="button"
            onClick={() => handleAddTicker()}
            disabled={!effectiveSelectedToAdd || mutating}
            style={{
              padding: "9px 14px",
              borderRadius: "8px",
              background: effectiveSelectedToAdd && !mutating ? "var(--accent-ml)" : "var(--border-subtle)",
              color: "#ffffff",
              border: "none",
              fontSize: "12px",
              fontWeight: "800",
              cursor: effectiveSelectedToAdd && !mutating ? "pointer" : "not-allowed",
              minHeight: "38px",
              flexShrink: 0,
            }}
          >
            {mutating ? "Saving..." : "+ Add Stock"}
          </button>
        </div>

        {(syncing || wlError) && (
          <div style={{ fontSize: "11px", color: wlError ? "var(--color-sell)" : "var(--color-text-muted)", fontWeight: wlError ? "700" : "500" }}>
            {wlError ? `⚠️ ${wlError}` : `Syncing ${userName}'s watchlist...`}
          </div>
        )}
      </div>

      {/* Saved Stocks List */}
      {savedTickers.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            padding: "32px 16px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <div style={{ fontSize: "24px" }}>🔖</div>
          <div style={{ fontSize: "14px", fontWeight: "800", color: "var(--color-text-primary)" }}>
            No saved stocks in {userName}&apos;s watchlist
          </div>
          <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
            Choose any NSE stock above and tap + Add Stock to start tracking it.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {savedTickers.map((ticker) => {
            const stock = stocksByTicker.get(ticker);
            const isPositive = (stock?.change_pct ?? 0) >= 0;

            return (
              <div
                key={ticker}
                className="glass-panel"
                style={{
                  padding: "clamp(12px, 3vw, 16px)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {/* Top Row: Ticker & Live Price */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", minWidth: 0 }}>
                    <span
                      style={{
                        fontWeight: "900",
                        fontSize: "15px",
                        color: "var(--color-text-primary)",
                      }}
                    >
                      {ticker}
                    </span>
                    {stock?.sector && (
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--color-text-muted)",
                          background: "rgba(0, 0, 0, 0.04)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                        }}
                      >
                        {stock.sector}
                      </span>
                    )}
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontWeight: "900",
                        fontSize: "15px",
                        color: "var(--color-text-primary)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {typeof stock?.price === "number"
                        ? `₹${stock.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "Loading..."}
                    </div>
                    {stock && typeof stock.change_pct === "number" && (
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          color: isPositive ? "var(--color-buy)" : "var(--color-sell)",
                        }}
                      >
                        {isPositive ? "+" : ""}
                        {stock.change_pct.toFixed(2)}%
                      </div>
                    )}
                  </div>
                </div>

                {/* Middle Row: Key Metrics */}
                {stock && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: "6px",
                      background: "rgba(0, 0, 0, 0.015)",
                      padding: "8px",
                      borderRadius: "8px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>
                        AI SCORE
                      </div>
                      <div
                        style={{
                          fontSize: "clamp(11px, 3.2vw, 13px)",
                          fontWeight: "800",
                          color: "var(--accent-ml)",
                          marginTop: "2px",
                        }}
                      >
                        {stock.master_score}/100
                      </div>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>
                        SIGNAL
                      </div>
                      <div
                        style={{
                          fontSize: "clamp(11px, 3.2vw, 13px)",
                          fontWeight: "800",
                          color: getSignalColor(stock.recommendation),
                          marginTop: "2px",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {stock.recommendation}
                      </div>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>
                        DAY RANGE
                      </div>
                      <div
                        style={{
                          fontSize: "clamp(10px, 3vw, 12px)",
                          fontWeight: "700",
                          color: "var(--color-text-primary)",
                          marginTop: "2px",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {typeof stock.day_low === "number" && typeof stock.day_high === "number"
                          ? `₹${stock.day_low.toLocaleString("en-IN", { maximumFractionDigits: 0 })}–₹${stock.day_high.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                          : "—"}
                      </div>
                    </div>
                  </div>
                )}

                {/* Bottom Row: Actions */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => onSelectStock(ticker)}
                      style={{
                        background: "none",
                        border: "1px solid var(--border-subtle)",
                        padding: "6px 10px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "700",
                        color: "var(--accent-ml)",
                        cursor: "pointer",
                      }}
                    >
                      Research 🔬
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== "undefined") {
                          window.dispatchEvent(
                            new CustomEvent("open-paper-trade", { detail: { ticker, type: "BUY" } })
                          );
                        }
                      }}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "800",
                        background: "rgba(5, 150, 105, 0.12)",
                        color: "var(--color-buy)",
                        border: "1px solid var(--color-buy)",
                        cursor: "pointer",
                      }}
                    >
                      + BUY
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== "undefined") {
                          window.dispatchEvent(
                            new CustomEvent("open-futures-trade", { detail: { ticker, side: "BUY", lots: 1 } })
                          );
                        }
                      }}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "800",
                        background: "rgba(79, 70, 229, 0.1)",
                        color: "var(--accent-ml)",
                        border: "1px solid rgba(79, 70, 229, 0.35)",
                        cursor: "pointer",
                      }}
                    >
                      ⚡ Futures
                    </button>
                  </div>

                  <button
                    type="button"
                    aria-label={`Remove ${ticker} from watchlist`}
                    disabled={mutating}
                    onClick={() => handleRemoveTicker(ticker)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: "700",
                      background: "rgba(220, 38, 38, 0.06)",
                      color: "var(--color-sell)",
                      border: "1px solid rgba(220, 38, 38, 0.25)",
                      cursor: mutating ? "not-allowed" : "pointer",
                      opacity: mutating ? 0.6 : 1,
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
