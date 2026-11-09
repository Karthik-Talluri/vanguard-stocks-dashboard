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
        return { color: "var(--color-buy)", background: "rgba(0, 230, 118, 0.1)", border: "1px solid rgba(0, 230, 118, 0.2)" };
      case "Buy":
        return { color: "var(--color-buy)", background: "rgba(0, 230, 118, 0.05)", border: "1px solid rgba(0, 230, 118, 0.1)" };
      case "Hold":
        return { color: "var(--color-hold)", background: "rgba(255, 196, 0, 0.05)", border: "1px solid rgba(255, 196, 0, 0.1)" };
      case "Sell":
        return { color: "var(--color-sell)", background: "rgba(255, 23, 68, 0.05)", border: "1px solid rgba(255, 23, 68, 0.1)" };
      case "Strong Sell":
        return { color: "var(--color-sell)", background: "rgba(255, 23, 68, 0.1)", border: "1px solid rgba(255, 23, 68, 0.2)" };
      default:
        return {};
    }
  };

  return (
    <aside className="glass-panel stock-selector-aside" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Search Bar */}
      <div>
        <input 
          type="text" 
          placeholder="🔍 Search ticker or sector..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", fontSize: "13px", padding: "8px 10px" }}
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
              padding: "4px 2px", 
              borderRadius: "4px",
              background: filter === f ? "var(--accent-ml)" : "var(--bg-button-unselected)",
              borderColor: filter === f ? "transparent" : "var(--border-subtle)",
              color: filter === f ? "#fff" : "var(--color-text-secondary)"
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Stock list */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }} className="hide-scrollbar">
        {filteredStocks.length === 0 ? (
          <div style={{ color: "var(--color-text-muted)", fontSize: "12px", textAlign: "center", padding: "20px" }}>No matching stocks</div>
        ) : (
          filteredStocks.map((stock) => {
            const isActive = stock.ticker === selectedTicker;
            return (
              <div 
                key={stock.ticker}
                onClick={() => onSelect(stock.ticker)}
                style={{ 
                  padding: "10px 12px", 
                  borderRadius: "8px", 
                  background: isActive ? "rgba(124, 77, 255, 0.08)" : "rgba(0,0,0,0.01)",
                  border: isActive ? "1px solid rgba(124, 77, 255, 0.3)" : "1px solid var(--border-subtle)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  transition: "all 0.2s"
                }}
                className="stock-item-hover"
              >
                {/* Header row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: "700", fontSize: "14px", color: isActive ? "var(--accent-ml)" : "var(--color-text-primary)" }}>{stock.ticker}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-primary)", whiteSpace: "nowrap" }}>₹{stock.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (typeof window !== "undefined") {
                          window.dispatchEvent(new CustomEvent("open-paper-trade", { detail: { ticker: stock.ticker, type: "BUY" } }));
                        }
                      }}
                      style={{
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontSize: "9px",
                        fontWeight: "800",
                        background: "rgba(16, 185, 129, 0.15)",
                        color: "var(--color-buy)",
                        border: "1px solid var(--color-buy)",
                        cursor: "pointer"
                      }}
                      title="Buy in Paper Trading"
                    >
                      BUY
                    </button>
                  </div>
                </div>
                
                {/* Score & recommendation row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>{stock.sector}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ 
                      fontSize: "9px", 
                      padding: "2px 6px", 
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
                <div style={{ fontSize: "10px", color: stock.change_pct >= 0 ? "var(--color-buy)" : "var(--color-sell)", alignSelf: "flex-end", marginTop: "-2px" }}>
                  {stock.change_pct >= 0 ? "+" : ""}{stock.change_pct.toFixed(2)}% today
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
