import React, { useState, useEffect } from "react";
import { fetchShortTermPicks, ShortTermPicksResponse, ShortTermPick } from "../utils/api";

interface ShortTermPicksProps {
  onSelectStock?: (ticker: string) => void;
}

export default function ShortTermPicks({ onSelectStock }: ShortTermPicksProps) {
  const [data, setData] = useState<ShortTermPicksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCapTab, setActiveCapTab] = useState<"large_cap" | "mid_cap" | "small_cap">("large_cap");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  useEffect(() => {
    fetchShortTermPicks()
      .then((json: ShortTermPicksResponse) => {
        setData(json);
        if (json.large_cap.length > 0) {
          setSelectedTicker(json.large_cap[0].ticker);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Update default selected stock when changing cap tab
  const handleCapTabChange = (tab: "large_cap" | "mid_cap" | "small_cap") => {
    setActiveCapTab(tab);
    if (data && data[tab] && data[tab].length > 0) {
      setSelectedTicker(data[tab][0].ticker);
    } else {
      setSelectedTicker(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "400px", color: "var(--color-text-secondary)", gap: "16px" }}>
        <div className="animate-spin" style={{ width: "36px", height: "36px", border: "3px solid var(--border-subtle)", borderTop: "3px solid var(--accent-ml)", borderRadius: "50%" }} />
        <div style={{ fontSize: "14px", fontWeight: "600" }}>Running F&O Build-Up Scans & Quant Regressions...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-panel" style={{ padding: "24px", color: "var(--color-sell)", fontWeight: "600", textAlign: "center" }}>
        ⚠️ Error loading Short-Term Alpha Picks: {error || "No data received"}
      </div>
    );
  }

  const currentList = data[activeCapTab] || [];
  const selectedStock = currentList.find((x) => x.ticker === selectedTicker) || currentList[0];

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#059669";
    if (score >= 68) return "var(--accent-ml)";
    return "var(--color-text-secondary)";
  };

  const getRecColor = (rec: string) => {
    if (rec.includes("Strong")) return "#059669";
    if (rec.includes("Buy")) return "var(--accent-ml)";
    return "var(--color-text-muted)";
  };

  const getRiskColor = (risk: string) => {
    if (risk.toLowerCase() === "low") return "#059669";
    if (risk.toLowerCase() === "medium") return "#d97706";
    return "var(--color-sell)";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%" }} className="animate-fade-in" id="short-term-workspace">
      
      {/* Intro Header Banner */}
      <div style={{
        background: "linear-gradient(135deg, rgba(79, 70, 229, 0.08) 0%, rgba(5, 150, 105, 0.04) 100%)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "12px",
        padding: "clamp(12px, 3vw, 20px)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "12px"
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0, flex: "1 1 240px" }}>
          <h2 style={{ fontSize: "clamp(16px, 4.5vw, 18px)", lineHeight: 1.25, fontWeight: "900", color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
            ⚡ Short-Term Alpha Workspace
          </h2>
          <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: 0, maxWidth: "700px", lineHeight: "1.5" }}>
            Identify high-probability swing setups combining option flow, volume surges, and 1-week predictive machine learning models. Standard long-term valuation metrics are ignored.
          </p>
        </div>

        {/* Market Cap Segments Switcher */}
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px",
          maxWidth: "100%",
          background: "rgba(0,0,0,0.04)",
          padding: "3px",
          borderRadius: "8px",
          border: "1px solid var(--border-subtle)"
        }}>
          {[
            { id: "large_cap", label: "Large Cap", count: data.large_cap.length },
            { id: "mid_cap", label: "Mid Cap", count: data.mid_cap.length },
            { id: "small_cap", label: "Small Cap", count: data.small_cap.length }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleCapTabChange(tab.id as any)}
              style={{
                fontSize: "clamp(11px, 3vw, 12px)",
                padding: "6px 10px",
                border: "none",
                borderRadius: "6px",
                flex: "1 1 auto",
                background: activeCapTab === tab.id ? "var(--bg-card)" : "transparent",
                color: activeCapTab === tab.id ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                fontWeight: "700",
                cursor: "pointer",
                transition: "all 0.15s",
                boxShadow: activeCapTab === tab.id ? "0 2px 4px rgba(0,0,0,0.06)" : "none"
              }}
            >
              {tab.label} <span style={{ opacity: 0.5, fontSize: "10px", marginLeft: "2px" }}>({tab.count})</span>
            </button>
          ))}
        </div>
      </div>

      {currentList.length === 0 ? (
        <div className="glass-panel" style={{ padding: "40px", textAlign: "center", color: "var(--color-text-muted)" }}>
          No active short-term buy triggers detected in this capitalization tier.
        </div>
      ) : (
        <div className="responsive-split-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "20px" }}>
          
          {/* Left Panel: Rankings Table */}
          <div className="glass-panel" style={{ padding: "clamp(14px, 3.5vw, 20px)", display: "flex", flexDirection: "column", gap: "16px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: "800", color: "var(--color-text-primary)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
              <span>🚀 Ranked Opportunities ({activeCapTab === "large_cap" ? "Large Cap" : activeCapTab === "mid_cap" ? "Mid Cap" : "Small Cap"})</span>
              <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: "500" }}>Sorted by Alpha Conviction</span>
            </h3>
            
            {/* Desktop Table View */}
            <div className="table-desktop-view table-responsive-wrapper">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)", textAlign: "left" }}>
                    <th style={{ padding: "10px 8px", color: "var(--color-text-muted)" }}>Rank</th>
                    <th style={{ padding: "10px 8px", color: "var(--color-text-muted)" }}>Stock</th>
                    <th style={{ padding: "10px 8px", color: "var(--color-text-muted)", textAlign: "right" }}>Price</th>
                    <th style={{ padding: "10px 8px", color: "var(--color-text-muted)", textAlign: "right" }}>Change %</th>
                    <th style={{ padding: "10px 8px", color: "var(--color-text-muted)", textAlign: "center" }}>Alpha Score</th>
                    <th style={{ padding: "10px 8px", color: "var(--color-text-muted)", textAlign: "center" }}>1-W Up Prob</th>
                    <th style={{ padding: "10px 8px", color: "var(--color-text-muted)" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentList.map((item, index) => (
                    <tr
                      key={item.ticker}
                      onClick={() => setSelectedTicker(item.ticker)}
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                        cursor: "pointer",
                        background: selectedTicker === item.ticker ? "rgba(79, 70, 229, 0.06)" : "transparent",
                        transition: "all 0.15s"
                      }}
                      className="table-row-hover"
                    >
                      <td style={{ padding: "12px 8px", fontWeight: "800", color: "var(--color-text-muted)" }}>#{index + 1}</td>
                      <td style={{ padding: "12px 8px" }}>
                        <div style={{ fontWeight: "800", color: "var(--color-text-primary)" }}>{item.ticker}</div>
                        <div style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>{item.sector}</div>
                      </td>
                      <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: "700" }}>
                        ₹{item.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: "700", color: item.change_pct >= 0 ? "#059669" : "var(--color-sell)" }}>
                        {item.change_pct >= 0 ? "+" : ""}{item.change_pct}%
                      </td>
                      <td style={{ padding: "12px 8px", textAlign: "center" }}>
                        <span style={{
                          background: `rgba(79, 70, 229, 0.08)`,
                          color: getScoreColor(item.short_term_score),
                          padding: "4px 8px",
                          borderRadius: "6px",
                          fontWeight: "800",
                          fontSize: "11px"
                        }}>
                          {item.short_term_score}
                        </span>
                      </td>
                      <td style={{ padding: "12px 8px", textAlign: "center" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                          <span style={{ fontWeight: "700", color: "var(--color-text-primary)" }}>{item.prob_up_1w}%</span>
                          <div style={{ width: "50px", height: "4px", background: "var(--border-subtle)", borderRadius: "2px", overflow: "hidden" }}>
                            <div style={{ width: `${item.prob_up_1w}%`, height: "100%", background: "#059669" }} />
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectStock) onSelectStock(item.ticker);
                          }}
                          style={{
                            padding: "4px 8px",
                            background: "transparent",
                            border: "1px solid var(--accent-ml)",
                            borderRadius: "4px",
                            fontSize: "10px",
                            color: "var(--accent-ml)",
                            fontWeight: "700",
                            cursor: "pointer",
                            transition: "all 0.15s"
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = "var(--accent-ml)";
                            e.currentTarget.style.color = "#ffffff";
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = "var(--accent-ml)";
                          }}
                        >
                          Research
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="cards-mobile-view" style={{ flexDirection: "column", gap: "10px" }}>
              {currentList.map((item, index) => (
                <div
                  key={item.ticker}
                  onClick={() => setSelectedTicker(item.ticker)}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "8px",
                    border: "1px solid " + (selectedTicker === item.ticker ? "rgba(79, 70, 229, 0.4)" : "var(--border-subtle)"),
                    background: selectedTicker === item.ticker ? "rgba(79, 70, 229, 0.04)" : "rgba(0,0,0,0.01)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px", minWidth: 0 }}>
                      <span style={{ fontWeight: "800", color: "var(--color-text-muted)" }}>#{index + 1}</span>
                      <span style={{ fontWeight: "800", color: "var(--color-text-primary)", fontSize: "14px" }}>{item.ticker}</span>
                      <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>({item.sector})</span>
                    </div>
                    <span style={{
                      background: `rgba(79, 70, 229, 0.08)`,
                      color: getScoreColor(item.short_term_score),
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontWeight: "800",
                      fontSize: "11px"
                    }}>
                      Alpha: {item.short_term_score}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "6px", textAlign: "center", background: "rgba(0,0,0,0.01)", padding: "6px", borderRadius: "6px" }}>
                    <div>
                      <div style={{ fontSize: "8px", color: "var(--color-text-muted)" }}>PRICE</div>
                      <div style={{ fontSize: "clamp(11px, 3vw, 12px)", fontWeight: "700", color: "var(--color-text-primary)" }}>₹{item.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "8px", color: "var(--color-text-muted)" }}>CHANGE</div>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: item.change_pct >= 0 ? "#059669" : "var(--color-sell)" }}>{item.change_pct >= 0 ? "+" : ""}{item.change_pct}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "8px", color: "var(--color-text-muted)" }}>1-W UP PROB</div>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--color-text-primary)" }}>{item.prob_up_1w}%</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (typeof window !== "undefined") {
                          window.dispatchEvent(new CustomEvent("open-paper-trade", { detail: { ticker: item.ticker, type: "BUY" } }));
                        }
                      }}
                      style={{
                        padding: "4px 8px",
                        background: "rgba(16, 185, 129, 0.15)",
                        border: "1px solid var(--color-buy)",
                        borderRadius: "4px",
                        fontSize: "10px",
                        color: "var(--color-buy)",
                        fontWeight: "800",
                        cursor: "pointer"
                      }}
                    >
                      + BUY
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectStock) onSelectStock(item.ticker);
                      }}
                      style={{
                        padding: "4px 10px",
                        background: "transparent",
                        border: "1px solid var(--accent-ml)",
                        borderRadius: "4px",
                        fontSize: "10px",
                        color: "var(--accent-ml)",
                        fontWeight: "700",
                        cursor: "pointer"
                      }}
                    >
                      Research
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Panel: Deep-Dive Card */}
          {selectedStock && (
            <div className="glass-panel glow-purple" style={{ padding: "clamp(14px, 3.5vw, 24px)", display: "flex", flexDirection: "column", gap: "18px" }}>
              
              {/* Card Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <h3 style={{ fontSize: "20px", fontWeight: "900", color: "var(--color-text-primary)", margin: 0 }}>{selectedStock.ticker}</h3>
                    <span style={{
                      fontSize: "10px",
                      color: "var(--color-text-secondary)",
                      border: "1px solid var(--border-subtle)",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontWeight: "700",
                      background: "rgba(0,0,0,0.02)"
                    }}>{selectedStock.sector}</span>
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "4px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                    <span>Current spot: <strong style={{ color: "var(--color-text-primary)", whiteSpace: "nowrap" }}>₹{selectedStock.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                    <button
                      onClick={() => {
                        if (typeof window !== "undefined") {
                          window.dispatchEvent(new CustomEvent("open-paper-trade", { detail: { ticker: selectedStock.ticker, type: "BUY" } }));
                        }
                      }}
                      style={{
                        padding: "2px 8px",
                        background: "var(--color-buy)",
                        border: "none",
                        borderRadius: "4px",
                        fontSize: "10px",
                        color: "#fff",
                        fontWeight: "800",
                        cursor: "pointer"
                      }}
                    >
                      + BUY
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                  <span style={{
                    background: getRecColor(selectedStock.recommendation) + "12",
                    color: getRecColor(selectedStock.recommendation),
                    padding: "4px 8px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: "800"
                  }}>
                    {selectedStock.recommendation.toUpperCase()}
                  </span>
                  <span style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>
                    Risk: <span style={{ fontWeight: "700", color: getRiskColor(selectedStock.risk_level) }}>{selectedStock.risk_level}</span>
                  </span>
                </div>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)" }} />

              {/* Guages & Core Target Metrics */}
              <div className="responsive-split-grid" style={{ gridTemplateColumns: "1fr 1.2fr", gap: "16px", alignItems: "center" }}>
                
                {/* Radial Indicator Score */}
                <div className="alpha-score-divider" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "10px", fontWeight: "800", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>Alpha Conviction</span>
                  <div style={{
                    width: "84px",
                    height: "84px",
                    borderRadius: "50%",
                    border: `5px solid var(--accent-ml)`,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    boxShadow: "0 4px 14px rgba(79, 70, 229, 0.15)"
                  }}>
                    <span style={{ fontSize: "24px", fontWeight: "900", color: "var(--color-text-primary)" }}>{selectedStock.short_term_score}</span>
                    <span style={{ fontSize: "9px", fontWeight: "700", color: "var(--color-text-secondary)" }}>/ 100</span>
                  </div>
                </div>

                {/* Sub Agent Scores */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "3px" }}>
                      <span style={{ color: "var(--color-text-secondary)", fontWeight: "600" }}>Technical Momentum</span>
                      <span style={{ fontWeight: "700", color: "var(--color-text-primary)" }}>{selectedStock.technical_score}/100</span>
                    </div>
                    <div style={{ height: "4px", width: "100%", background: "var(--border-subtle)", borderRadius: "2px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${selectedStock.technical_score}%`, background: "var(--accent-tech)" }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "3px" }}>
                      <span style={{ color: "var(--color-text-secondary)", fontWeight: "600" }}>1-Day Positive Close</span>
                      <span style={{ fontWeight: "700", color: "var(--color-text-primary)" }}>{selectedStock.prob_positive_close}%</span>
                    </div>
                    <div style={{ height: "4px", width: "100%", background: "var(--border-subtle)", borderRadius: "2px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${selectedStock.prob_positive_close}%`, background: "#059669" }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "3px" }}>
                      <span style={{ color: "var(--color-text-secondary)", fontWeight: "600" }}>Overnight Gap-Up</span>
                      <span style={{ fontWeight: "700", color: "var(--color-text-primary)" }}>{selectedStock.prob_gap_up}%</span>
                    </div>
                    <div style={{ height: "4px", width: "100%", background: "var(--border-subtle)", borderRadius: "2px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${selectedStock.prob_gap_up}%`, background: "var(--accent-ml)" }} />
                    </div>
                  </div>
                </div>

              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)" }} />

              {/* Short Term Target Box */}
              <div className="target-box-grid" style={{
                background: "rgba(0,0,0,0.02)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "8px",
                padding: "12px 16px",
                textAlign: "center"
              }}>
                <div className="target-box-divider">
                  <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", fontWeight: "700" }}>EXPECTED 1-W MOVE</div>
                  <div style={{ fontSize: "16px", fontWeight: "900", color: "#059669", marginTop: "2px" }}>{selectedStock.expected_move}</div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", fontWeight: "700" }}>SUGGESTED SL</div>
                  <div style={{ fontSize: "16px", fontWeight: "900", color: "var(--color-sell)", marginTop: "2px" }}>-{selectedStock.stop_loss}%</div>
                </div>
              </div>

              {/* Catalyst explanations list */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <h4 style={{ fontSize: "11px", fontWeight: "800", color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  💡 Short-Term Catalysts
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {selectedStock.explanations.map((exp, i) => (
                    <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "11px", color: "var(--color-text-primary)", lineHeight: "1.4" }}>
                      <span style={{ color: "#059669", fontWeight: "bold" }}>✓</span>
                      <span>{exp}</span>
                    </div>
                  ))}
                </div>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)" }} />

              {/* Action Button */}
              {onSelectStock && (
                <button
                  onClick={() => onSelectStock(selectedStock.ticker)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: "var(--accent-ml)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: "700",
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(79, 70, 229, 0.2)"
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#3b31df")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "var(--accent-ml)")}
                >
                  Open Full AI Research Terminal 🔎
                </button>
              )}

            </div>
          )}

        </div>
      )}

      {/* Risk Disclaimer */}
      <div style={{
        background: "rgba(220, 38, 38, 0.02)",
        border: "1px solid rgba(220, 38, 38, 0.15)",
        borderRadius: "8px",
        padding: "12px 16px",
        fontSize: "11px",
        color: "var(--color-sell)",
        lineHeight: "1.5"
      }}>
        <strong>⚠️ Risk Management Advisory:</strong> Short-term swing trading involves significant capital volatility. Strictly enforce the recommended Stop Loss percentage (SL) on entry. Standard position sizing should not exceed 5% of total portfolio value per setup.
      </div>

    </div>
  );
}
