import React, { useEffect, useState } from "react";
import { fetchFuturesOpportunities, FuturesOpportunity } from "../utils/api";

interface OpportunitiesDashboardProps {
  onSelectStock: (ticker: string) => void;
  onNavigateToTab: (tab: "dashboard" | "research" | "stream" | "scanners") => void;
}

export default function OpportunitiesDashboard({ onSelectStock, onNavigateToTab }: OpportunitiesDashboardProps) {
  const [opportunities, setOpportunities] = useState<FuturesOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterSector, setFilterSector] = useState("ALL");

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetchFuturesOpportunities();
      setOpportunities(Array.isArray(res) ? res : []);
    } catch (err: any) {
      console.error("[OpportunitiesDashboard] Error loading futures opportunities:", err);
      setError(err?.message || "Failed to load futures opportunities from backend.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRowClick = (ticker: string) => {
    onSelectStock(ticker);
    onNavigateToTab("research");
  };

  const sectors = ["ALL", ...Array.from(new Set(opportunities.map(o => o.sector)))];
  const filteredOpp = opportunities.filter(o => filterSector === "ALL" || o.sector === filterSector);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Filter & Refresh Controls */}
      <div className="glass-panel" style={{ padding: "clamp(10px, 2.5vw, 14px) clamp(12px, 3vw, 20px)", display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", maxWidth: "100%", minWidth: 0 }}>
          <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: "700", textTransform: "uppercase" }}>Filter Sector:</span>
          <select
            value={filterSector}
            onChange={(e) => setFilterSector(e.target.value)}
            style={{
              padding: "6px 10px",
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
              outline: "none",
              maxWidth: "100%",
              minWidth: 0
            }}
          >
            {sectors.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <button
            onClick={loadData}
            style={{
              padding: "6px 12px",
              background: "var(--accent-ml)",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: "700",
              cursor: "pointer",
              transition: "opacity 0.2s"
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Refresh List
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px", color: "var(--color-text-secondary)" }}>
          <div className="animate-spin" style={{ border: "2px solid var(--border-subtle)", borderTop: "2px solid var(--accent-ml)", borderRadius: "50%", width: "24px", height: "24px", marginRight: "10px" }} />
          Running 6-agent scoring matrix across Nifty 50 derivatives universe...
        </div>
      ) : error ? (
        <div className="glass-panel" style={{ padding: "20px", color: "var(--color-sell)", textAlign: "center", fontWeight: "600", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
          <div>⚠️ {error}</div>
          <button
            type="button"
            onClick={loadData}
            style={{
              padding: "6px 14px",
              background: "var(--accent-ml)",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer",
              transition: "opacity 0.2s"
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Retry
          </button>
        </div>
      ) : filteredOpp.length === 0 ? (
        <div className="glass-panel" style={{ padding: "40px 20px", textAlign: "center", color: "var(--color-text-muted)" }}>
          <div style={{ fontSize: "28px", marginBottom: "8px" }}>📊</div>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--color-text-primary)", marginBottom: "4px" }}>
            No Futures Opportunities Found
          </div>
          <div style={{ fontSize: "12px", marginBottom: "16px" }}>
            {filterSector !== "ALL"
              ? `No opportunities match the "${filterSector}" sector filter.`
              : "No futures opportunities currently available. Click Refresh to reload from backend."}
          </div>
          <button
            type="button"
            onClick={() => {
              if (filterSector !== "ALL") setFilterSector("ALL");
              loadData();
            }}
            style={{
              padding: "6px 14px",
              background: "var(--accent-ml)",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer",
              transition: "opacity 0.2s"
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
          >
            {filterSector !== "ALL" ? "Reset Filter & Refresh" : "Refresh List"}
          </button>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="table-desktop-view glass-panel table-responsive-wrapper" style={{ padding: "0px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "rgba(0,0,0,0.02)", borderBottom: "1px solid var(--border-subtle)" }}>
                  <th style={{ padding: "12px 16px", color: "var(--color-text-muted)", fontWeight: "700" }}>Rank</th>
                  <th style={{ padding: "12px 16px", color: "var(--color-text-muted)", fontWeight: "700" }}>Stock</th>
                  <th style={{ padding: "12px 16px", color: "var(--color-text-muted)", fontWeight: "700" }}>Sector</th>
                  <th style={{ padding: "12px 16px", color: "var(--color-text-muted)", fontWeight: "700", textAlign: "center" }}>Strategy Score</th>
                  <th style={{ padding: "12px 16px", color: "var(--color-text-muted)", fontWeight: "700", textAlign: "center" }}>POP</th>
                  <th style={{ padding: "12px 16px", color: "var(--color-text-muted)", fontWeight: "700", textAlign: "center" }}>Monthly Yield</th>
                  <th style={{ padding: "12px 16px", color: "var(--color-text-muted)", fontWeight: "700", textAlign: "right" }}>Spot Price</th>
                  <th style={{ padding: "12px 16px", color: "var(--color-text-muted)", fontWeight: "700", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredOpp.map((opp, idx) => {
                  const scoreColor = opp.strategy_score >= 85 ? "#10b981" : opp.strategy_score >= 70 ? "#3b82f6" : "#f59e0b";
                  return (
                    <tr
                      key={opp.ticker}
                      onClick={() => handleRowClick(opp.ticker)}
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                        cursor: "pointer",
                        transition: "background 0.15s"
                      }}
                      className="hover-row"
                    >
                      <td style={{ padding: "14px 16px", fontWeight: "700", color: "var(--color-text-muted)" }}>
                        #{idx + 1}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontWeight: "800", color: "var(--color-text-primary)", fontSize: "13px" }}>
                          {opp.ticker}
                        </div>
                        {(opp.lot_size || opp.expiry_formatted) && (
                          <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginTop: "2px", whiteSpace: "nowrap" }}>
                            {opp.lot_size ? `Lot: ${opp.lot_size.toLocaleString("en-IN")}` : ""}
                            {opp.lot_size && opp.expiry_formatted ? " • " : ""}
                            {opp.expiry_formatted || ""}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--color-text-secondary)" }}>
                        {opp.sector}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>
                        <span
                          style={{
                            background: `${scoreColor}15`,
                            color: scoreColor,
                            padding: "4px 10px",
                            borderRadius: "20px",
                            fontWeight: "800",
                            fontSize: "11px",
                            border: `1px solid ${scoreColor}30`
                          }}
                        >
                          {opp.strategy_score}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "center", fontWeight: "700", color: "#10b981", fontSize: "13px" }}>
                        {opp.pop}%
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "center", fontWeight: "700", color: "var(--color-text-primary)", fontSize: "13px" }}>
                        {(typeof opp.expected_yield === "number" ? opp.expected_yield : Number(opp.expected_yield || 0)).toFixed(2)}%
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: "600", whiteSpace: "nowrap" }}>
                        <div>₹{(typeof opp.price === "number" ? opp.price : Number(opp.price || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                        {typeof opp.futures_price === "number" && (
                          <div style={{ fontSize: "10px", color: "var(--accent-ml)", fontWeight: "700" }}>
                            FUT: ₹{opp.futures_price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "center", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (typeof window !== "undefined") {
                                window.dispatchEvent(
                                  new CustomEvent("open-futures-trade", {
                                    detail: {
                                      ticker: opp.ticker,
                                      side: opp.strategy_type === "sell_call" ? "SELL" : "BUY",
                                      lots: 1,
                                    },
                                  })
                                );
                              }
                            }}
                            style={{
                              background: "rgba(79, 70, 229, 0.1)",
                              border: "1px solid rgba(79, 70, 229, 0.35)",
                              padding: "4px 9px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              fontWeight: "800",
                              color: "var(--accent-ml)",
                              cursor: "pointer",
                              whiteSpace: "nowrap"
                            }}
                          >
                            ⚡ Trade FUT
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRowClick(opp.ticker);
                            }}
                            style={{
                              background: "none",
                              border: "1px solid var(--border-subtle)",
                              padding: "4px 10px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              fontWeight: "700",
                              color: "var(--accent-ml)",
                              cursor: "pointer",
                              transition: "all 0.15s",
                              whiteSpace: "nowrap"
                            }}
                            className="research-btn"
                          >
                            Research 🔬
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="cards-mobile-view" style={{ flexDirection: "column", gap: "12px" }}>
            {filteredOpp.map((opp, idx) => {
              const scoreColor = opp.strategy_score >= 85 ? "#10b981" : opp.strategy_score >= 70 ? "#3b82f6" : "#f59e0b";
              return (
                <div 
                  key={opp.ticker} 
                  className="glass-panel" 
                  onClick={() => handleRowClick(opp.ticker)}
                  style={{ padding: "clamp(12px, 3vw, 16px)", display: "flex", flexDirection: "column", gap: "10px", cursor: "pointer" }}
                >
                  {/* Top Row: Rank, Ticker & Sector */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", minWidth: 0 }}>
                      <span style={{ fontWeight: "800", color: "var(--color-text-muted)" }}>#{idx + 1}</span>
                      <span style={{ fontWeight: "900", color: "var(--color-text-primary)", fontSize: "15px" }}>{opp.ticker}</span>
                      <span style={{ fontSize: "11px", color: "var(--color-text-muted)", background: "rgba(0,0,0,0.04)", padding: "2px 6px", borderRadius: "4px" }}>{opp.sector}</span>
                    </div>
                    <span
                      style={{
                        background: `${scoreColor}15`,
                        color: scoreColor,
                        padding: "4px 10px",
                        borderRadius: "20px",
                        fontWeight: "800",
                        fontSize: "11px",
                        border: `1px solid ${scoreColor}30`
                      }}
                    >
                      Score: {opp.strategy_score}
                    </span>
                  </div>

                    {/* Middle Row: Metrics Grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "6px", background: "rgba(0,0,0,0.015)", padding: "8px", borderRadius: "8px", textAlign: "center" }}>
                    <div>
                      <div style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>POP / YIELD</div>
                      <div style={{ fontSize: "clamp(11px, 3.2vw, 13px)", fontWeight: "800", color: "#10b981", marginTop: "2px" }}>
                        {opp.pop}% • {(typeof opp.expected_yield === "number" ? opp.expected_yield : Number(opp.expected_yield || 0)).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>LOT / EXPIRY</div>
                      <div style={{ fontSize: "clamp(10px, 3vw, 12px)", fontWeight: "800", color: "var(--color-text-primary)", marginTop: "2px" }}>
                        {opp.lot_size ? `${opp.lot_size}` : "—"} {opp.expiry_formatted ? `• ${opp.expiry_formatted.split(" ").slice(0, 2).join(" ")}` : ""}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>SPOT / FUT</div>
                      <div style={{ fontSize: "clamp(10px, 3vw, 12px)", fontWeight: "800", color: "var(--color-text-primary)", marginTop: "2px" }}>
                        ₹{(typeof opp.price === "number" ? opp.price : Number(opp.price || 0)).toLocaleString("en-IN", { maximumFractionDigits: 1 })}
                        {typeof opp.futures_price === "number" && (
                          <span style={{ display: "block", fontSize: "9.5px", color: "var(--accent-ml)" }}>
                            F: ₹{opp.futures_price.toLocaleString("en-IN", { maximumFractionDigits: 1 })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row: Actions */}
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px", marginTop: "2px" }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (typeof window !== "undefined") {
                          window.dispatchEvent(
                            new CustomEvent("open-futures-trade", {
                              detail: {
                                ticker: opp.ticker,
                                side: opp.strategy_type === "sell_call" ? "SELL" : "BUY",
                                lots: 1,
                              },
                            })
                          );
                        }
                      }}
                      style={{
                        background: "rgba(79, 70, 229, 0.1)",
                        border: "1px solid rgba(79, 70, 229, 0.35)",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "800",
                        color: "var(--accent-ml)",
                        cursor: "pointer"
                      }}
                    >
                      ⚡ Trade FUT
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowClick(opp.ticker);
                      }}
                      className="research-btn"
                      style={{
                        background: "none",
                        border: "1px solid var(--border-subtle)",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "700",
                        color: "var(--accent-ml)",
                        cursor: "pointer",
                        transition: "all 0.15s"
                      }}
                    >
                      Research 🔬
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <style>{`
        .hover-row:hover {
          background: rgba(0,0,0,0.015);
        }
        .research-btn:hover {
          background: var(--accent-ml) !important;
          color: #ffffff !important;
          border-color: var(--accent-ml) !important;
        }
      `}</style>
    </div>
  );
}
