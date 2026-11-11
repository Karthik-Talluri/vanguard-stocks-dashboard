"use client";

import React, { useState } from "react";
import { StockOverview } from "../utils/api";

interface StockSelectorProps {
  stocks: StockOverview[];
  selectedTicker: string;
  onSelect: (ticker: string) => void;
}

export default function StockSelector({ stocks, selectedTicker, onSelect }: StockSelectorProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [mobileExpanded, setMobileExpanded] = useState(false);

  // Filter and search
  const filteredStocks = stocks.filter(s => {
    const matchesSearch = s.ticker.toLowerCase().includes(search.toLowerCase()) || 
                          s.sector.toLowerCase().includes(search.toLowerCase());
    if (filter === "ALL") return matchesSearch;
    if (filter === "BUY") return matchesSearch && (s.recommendation === "Strong Buy" || s.recommendation === "Buy");
    if (filter === "SELL") return matchesSearch && (s.recommendation === "Strong Sell" || s.recommendation === "Sell");
    if (filter === "HOLD") return matchesSearch && s.recommendation === "Hold";
    return matchesSearch;
  });

  const getBadgeStyle = (rec: string) => {
    switch (rec) {
      case "Strong Buy":
        return { color: "var(--color-buy)", background: "rgba(5, 150, 105, 0.1)", border: "1px solid rgba(5, 150, 105, 0.2)" };
      case "Buy":
        return { color: "var(--color-buy)", background: "rgba(5, 150, 105, 0.05)", border: "1px solid rgba(5, 150, 105, 0.1)" };
      case "Hold":
        return { color: "var(--color-hold)", background: "rgba(217, 119, 6, 0.05)", border: "1px solid rgba(217, 119, 6, 0.1)" };
      case "Sell":
        return { color: "var(--color-sell)", background: "rgba(220, 38, 38, 0.05)", border: "1px solid rgba(220, 38, 38, 0.1)" };
      case "Strong Sell":
        return { color: "var(--color-sell)", background: "rgba(220, 38, 38, 0.1)", border: "1px solid rgba(220, 38, 38, 0.2)" };
      default:
        return {};
    }
  };

  const selectedStockObj = stocks.find(s => s.ticker === selectedTicker);

  return (
    <aside className="glass-panel stock-selector-aside" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Mobile Top Active Stock Header (Click to expand/collapse full list < 900px) */}
      <div
        className="selector-mobile-toggle"
        onClick={() => setMobileExpanded(!mobileExpanded)}
        style={{
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px",
          borderRadius: "8px",
          background: "var(--bg-main)",
          cursor: "pointer",
          border: "1px solid var(--border-subtle)",
          width: "100%",
          gap: "8px",
          flexWrap: "wrap"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flexWrap: "wrap" }}>
          <span style={{ fontSize: "clamp(14px, 4vw, 16px)", fontWeight: "900", color: "var(--accent-ml)" }}>{selectedTicker}</span>
          {selectedStockObj && (
            <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--color-text-primary)" }}>
              ₹{selectedStockObj.price.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--accent-ml)", fontWeight: "700", flexShrink: 0 }}>
          <span>{mobileExpanded ? "Hide List ▲" : "Switch Stock (50) ▼"}</span>
        </div>
      </div>

      {/* Selector Content (Always visible >= 900px; collapsible < 900px) */}
      <div className={`selector-body ${mobileExpanded ? "is-expanded" : "is-collapsed"}`}>
        {/* Search Bar */}
        <div>
          <input 
            type="text" 
            placeholder="🔍 Search ticker or sector..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", fontSize: "12px", padding: "8px 10px" }}
          />
        </div>

        {/* Quick filters */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" }}>
          {["ALL", "BUY", "HOLD", "SELL"].map((f) => (
            <button 
              key={f}
              onClick={() => setFilter(f)}
              style={{ 
                fontSize: "10px", 
                padding: "5px 2px", 
                borderRadius: "6px",
                background: filter === f ? "var(--accent-ml)" : "var(--bg-button-unselected)",
                borderColor: filter === f ? "transparent" : "var(--border-subtle)",
                color: filter === f ? "#fff" : "var(--color-text-secondary)",
                fontWeight: "700"
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Stock list */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }} className="hide-scrollbar">
          {filteredStocks.length === 0 ? (
            <div style={{ color: "var(--color-text-muted)", fontSize: "12px", textAlign: "center", padding: "20px" }}>No matching stocks</div>
          ) : (
            filteredStocks.map((stock) => {
              const isActive = stock.ticker === selectedTicker;
              return (
                <div 
                  key={stock.ticker}
                  onClick={() => {
                    onSelect(stock.ticker);
                    setMobileExpanded(false); // Close dropdown on mobile selection
                  }}
                  style={{ 
                    padding: "8px 10px", 
                    borderRadius: "8px", 
                    background: isActive ? "rgba(79, 70, 229, 0.08)" : "rgba(0,0,0,0.01)",
                    border: isActive ? "1px solid rgba(79, 70, 229, 0.35)" : "1px solid var(--border-subtle)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                    transition: "all 0.15s"
                  }}
                  className="stock-item-hover"
                >
                  {/* Header row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px", flexWrap: "wrap", minWidth: 0 }}>
                    <span style={{ fontWeight: "800", fontSize: "13px", color: isActive ? "var(--accent-ml)" : "var(--color-text-primary)" }}>{stock.ticker}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-primary)", whiteSpace: "nowrap" }}>₹{stock.price.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (typeof window !== "undefined") {
                            window.dispatchEvent(new CustomEvent("open-paper-trade", { detail: { ticker: stock.ticker, type: "BUY" } }));
                          }
                        }}
                        style={{
                          padding: "2px 5px",
                          borderRadius: "4px",
                          fontSize: "9px",
                          fontWeight: "800",
                          background: "rgba(5, 150, 105, 0.12)",
                          color: "var(--color-buy)",
                          border: "1px solid var(--color-buy)",
                          cursor: "pointer"
                        }}
                        title="Buy Equity in Paper Trading"
                      >
                        BUY
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (typeof window !== "undefined") {
                            window.dispatchEvent(new CustomEvent("open-futures-trade", { detail: { ticker: stock.ticker, side: "BUY", lots: 1 } }));
                          }
                        }}
                        style={{
                          padding: "2px 5px",
                          borderRadius: "4px",
                          fontSize: "9px",
                          fontWeight: "800",
                          background: "rgba(79, 70, 229, 0.12)",
                          color: "var(--accent-ml)",
                          border: "1px solid rgba(79, 70, 229, 0.45)",
                          cursor: "pointer"
                        }}
                        title="Trade NSE Futures in Paper Trading"
                      >
                        FUT
                      </button>
                    </div>
                  </div>
                  
                  {/* Score & recommendation row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px", flexWrap: "wrap", minWidth: 0 }}>
                    <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>{stock.sector}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ 
                        fontSize: "9px", 
                        padding: "1px 5px", 
                        borderRadius: "4px", 
                        fontWeight: "700",
                        ...getBadgeStyle(stock.recommendation)
                      }}>
                        {stock.recommendation}
                      </span>
                      <span style={{ fontSize: "11px", fontWeight: "800", color: isActive ? "var(--accent-ml)" : "var(--color-text-secondary)" }}>
                        {stock.master_score}
                      </span>
                    </div>
                  </div>

                  {/* Price change subtext */}
                  <div style={{ fontSize: "9px", color: stock.change_pct >= 0 ? "var(--color-buy)" : "var(--color-sell)", alignSelf: "flex-end", marginTop: "-2px" }}>
                    {stock.change_pct >= 0 ? "+" : ""}{stock.change_pct.toFixed(2)}%
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
