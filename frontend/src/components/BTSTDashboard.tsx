import React, { useState, useEffect } from "react";
import { fetchBTSTData, BTSTData, BTSTMetric } from "../utils/api";

interface BTSTDashboardProps {
  onSelectStock?: (ticker: string) => void;
}

export default function BTSTDashboard({ onSelectStock }: BTSTDashboardProps) {
  const [data, setData] = useState<BTSTData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [activeScannerTab, setActiveScannerTab] = useState<
    "long_buildup" | "breakouts" | "high_delivery" | "gap_up" | "pattern_match" | "risk_events"
  >("long_buildup");

  useEffect(() => {
    fetchBTSTData()
      .then((json: BTSTData) => {
        setData(json);
        if (json.top_picks.length > 0) {
          setSelectedTicker(json.top_picks[0].ticker);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "400px", color: "var(--color-text-muted)", fontSize: "14px", fontWeight: "600" }}>
        Calculating BTST signals & analyzing historical patterns...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: "20px", color: "var(--color-sell)", fontWeight: "600" }}>
        Error loading BTST metrics: {error || "No data received"}
      </div>
    );
  }

  const selectedStock = data.all.find((x) => x.ticker === selectedTicker) || data.top_picks[0];

  const getRecColor = (rec: string) => {
    if (rec.includes("STRONG")) return "var(--color-buy)";
    if (rec.includes("BUY")) return "rgba(124, 77, 255, 0.9)";
    if (rec.includes("HOLD")) return "var(--color-text-muted)";
    return "var(--color-sell)";
  };

  const getRiskColor = (risk: string) => {
    if (risk.toLowerCase() === "low") return "var(--color-buy)";
    if (risk.toLowerCase() === "medium") return "var(--color-text-muted)";
    return "var(--color-sell)";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%", padding: "10px" }}>
      
      {/* Overview Intro Card */}
      <div style={{
        background: "linear-gradient(135deg, rgba(124, 77, 255, 0.08) 0%, rgba(0, 0, 0, 0) 100%)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "12px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "6px"
      }}>
        <h2 style={{ fontSize: "18px", fontWeight: "800", color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
          ⚡ Institutional BTST Workspace
        </h2>
        <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: 0, lineHeight: "1.5" }}>
          This dashboard focuses exclusively on **next-day predictive factors** (1-session price momentum, relative volume shocks, F&O Open Interest builds, smart money block accumulation) and backtests similar setups over the past 3-5 years to calculate probability weights. Long-term metrics such as P/E and ROE are discarded.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "20px" }}>
        
        {/* Left Side: Top BTST Opportunities */}
        <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "12px", background: "var(--color-bg-secondary)", padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <h3 style={{ fontSize: "14px", fontWeight: "800", color: "var(--color-text-primary)", margin: 0 }}>
            🔥 Top BTST Opportunities (Master Ranked)
          </h3>
          
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)", textAlign: "left" }}>
                  <th style={{ padding: "10px 8px", color: "var(--color-text-muted)" }}>Rank</th>
                  <th style={{ padding: "10px 8px", color: "var(--color-text-muted)" }}>Stock</th>
                  <th style={{ padding: "10px 8px", color: "var(--color-text-muted)", textAlign: "center" }}>Score</th>
                  <th style={{ padding: "10px 8px", color: "var(--color-text-muted)", textAlign: "center" }}>Positive Close Prob</th>
                  <th style={{ padding: "10px 8px", color: "var(--color-text-muted)", textAlign: "center" }}>Expected Move</th>
                  <th style={{ padding: "10px 8px", color: "var(--color-text-muted)" }}>Recommendation</th>
                  <th style={{ padding: "10px 8px", color: "var(--color-text-muted)" }}>Risk</th>
                </tr>
              </thead>
              <tbody>
                {data.top_picks.map((item, index) => (
                  <tr
                    key={item.ticker}
                    onClick={() => setSelectedTicker(item.ticker)}
                    style={{
                      borderBottom: "1px solid var(--border-subtle)",
                      cursor: "pointer",
                      background: selectedTicker === item.ticker ? "rgba(124, 77, 255, 0.08)" : "transparent",
                      transition: "background 0.2s"
                    }}
                  >
                    <td style={{ padding: "12px 8px", fontWeight: "700", color: "var(--color-text-muted)" }}>#{index + 1}</td>
                    <td style={{ padding: "12px 8px" }}>
                      <div style={{ fontWeight: "700", color: "var(--color-text-primary)" }}>{item.ticker}</div>
                      <div style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>{item.sector}</div>
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "center", fontWeight: "800", color: "var(--accent-ml)" }}>
                      {item.btst_score}
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "center", fontWeight: "700", color: "var(--color-text-primary)" }}>
                      {item.prob_positive_close}%
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "center", fontWeight: "600", color: "var(--color-buy)" }}>
                      {item.expected_move}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      <span style={{
                        padding: "3px 6px",
                        borderRadius: "4px",
                        fontSize: "9px",
                        fontWeight: "700",
                        background: selectedTicker === item.ticker ? "rgba(0, 0, 0, 0.1)" : "rgba(124, 77, 255, 0.1)",
                        color: getRecColor(item.recommendation)
                      }}>
                        {item.recommendation}
                      </span>
                    </td>
                    <td style={{ padding: "12px 8px", fontWeight: "600", color: getRiskColor(item.risk) }}>{item.risk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Deep-Dive Panel */}
        {selectedStock && (
          <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "12px", background: "var(--color-bg-secondary)", padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* Header detail */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "20px", fontWeight: "800", color: "var(--color-text-primary)" }}>{selectedStock.ticker}</span>
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: "600", border: "1px solid var(--border-subtle)", padding: "2px 6px", borderRadius: "4px" }}>
                    {selectedStock.sector}
                  </span>
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                  Last Close: <span style={{ fontWeight: "700", color: "var(--color-text-primary)", whiteSpace: "nowrap" }}>₹{selectedStock.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              {onSelectStock && (
                <button
                  onClick={() => onSelectStock(selectedStock.ticker)}
                  style={{
                    padding: "6px 12px",
                    background: "var(--color-buy)",
                    color: "#fff",
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
                  Analyze in Research ⭐
                </button>
              )}
            </div>

            <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)", margin: 0 }} />

            {/* BTST Score Gauge & Key stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "16px", alignItems: "center" }}>
              
              {/* Score Badge circle */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", borderRight: "1px solid var(--border-subtle)", paddingRight: "16px" }}>
                <div style={{ fontSize: "10px", fontWeight: "700", color: "var(--color-text-muted)", textTransform: "uppercase" }}>BTST Score</div>
                <div style={{
                  width: "76px",
                  height: "76px",
                  borderRadius: "50%",
                  border: "4px solid var(--accent-ml)",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: "24px",
                  fontWeight: "900",
                  color: "var(--color-text-primary)",
                  boxShadow: "0 4px 10px rgba(124, 77, 255, 0.15)"
                }}>
                  {selectedStock.btst_score}
                </div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: getRecColor(selectedStock.recommendation) }}>
                  {selectedStock.recommendation}
                </div>
              </div>

              {/* Core Probabilities */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                    <span style={{ color: "var(--color-text-muted)", fontWeight: "600" }}>Probability of Gap Up:</span>
                    <span style={{ fontWeight: "700", color: "var(--color-text-primary)" }}>{selectedStock.prob_gap_up}%</span>
                  </div>
                  <div style={{ height: "6px", width: "100%", background: "var(--border-subtle)", borderRadius: "3px" }}>
                    <div style={{ height: "100%", width: `${selectedStock.prob_gap_up}%`, background: "var(--accent-ml)", borderRadius: "3px" }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                    <span style={{ color: "var(--color-text-muted)", fontWeight: "600" }}>Positive Close Tomorrow:</span>
                    <span style={{ fontWeight: "700", color: "var(--color-text-primary)" }}>{selectedStock.prob_positive_close}%</span>
                  </div>
                  <div style={{ height: "6px", width: "100%", background: "var(--border-subtle)", borderRadius: "3px" }}>
                    <div style={{ height: "100%", width: `${selectedStock.prob_positive_close}%`, background: "var(--color-buy)", borderRadius: "3px" }} />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                  <div>
                    <div style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>EXPECTED MOVE</div>
                    <div style={{ fontSize: "13px", fontWeight: "800", color: "var(--color-buy)" }}>{selectedStock.expected_move}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>OVERNIGHT RISK</div>
                    <div style={{ fontSize: "13px", fontWeight: "800", color: getRiskColor(selectedStock.risk) }}>{selectedStock.risk.toUpperCase()}</div>
                  </div>
                </div>

              </div>

            </div>

            <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)", margin: 0 }} />

            {/* AI Explanations */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-primary)", textTransform: "uppercase" }}>Why BTST?</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {selectedStock.explanations.map((exp, i) => (
                  <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "11px", color: "var(--color-text-primary)", lineHeight: "1.4" }}>
                    <span style={{ color: "var(--color-buy)", fontWeight: "bold" }}>✓</span>
                    <span>{exp}</span>
                  </div>
                ))}
              </div>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)", margin: 0 }} />

            {/* Factor Weight breakdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-primary)", textTransform: "uppercase" }}>BTST Model Weights Breakdown</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {[
                  { label: "Price Action (20%)", val: selectedStock.factor_breakdown.price_action },
                  { label: "Volume Shock (15%)", val: selectedStock.factor_breakdown.volume },
                  { label: "OI Build-Up (20%)", val: selectedStock.factor_breakdown.oi },
                  { label: "Smart Money (15%)", val: selectedStock.factor_breakdown.smart_money },
                  { label: "Relative Strength (10%)", val: selectedStock.factor_breakdown.relative_strength },
                  { label: "Sector Momentum (10%)", val: selectedStock.factor_breakdown.sector_momentum },
                  { label: "Market Mood (5%)", val: selectedStock.factor_breakdown.market_mood },
                  { label: "Global Setup (5%)", val: selectedStock.factor_breakdown.global_setup }
                ].map((f) => (
                  <div key={f.label} style={{ display: "grid", gridTemplateColumns: "1.2fr 2fr 40px", alignItems: "center", gap: "10px", fontSize: "10px" }}>
                    <span style={{ color: "var(--color-text-muted)", fontWeight: "600" }}>{f.label}</span>
                    <div style={{ height: "4px", background: "var(--border-subtle)", borderRadius: "2px" }}>
                      <div style={{ height: "100%", width: `${f.val}%`, background: "var(--accent-ml)", borderRadius: "2px" }} />
                    </div>
                    <span style={{ fontWeight: "700", textAlign: "right", color: "var(--color-text-primary)" }}>{f.val}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>

      {/* Scanners Grid Header */}
      <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "12px", background: "var(--color-bg-secondary)", padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
        
        {/* Scanner tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)", gap: "16px" }}>
          {[
            { id: "long_buildup", label: "Long Build-up" },
            { id: "breakouts", label: "Breakout Scanner" },
            { id: "high_delivery", label: "High Delivery" },
            { id: "gap_up", label: "Gap-Up Probability" },
            { id: "pattern_match", label: "Pattern Reliability" },
            { id: "risk_events", label: "Risk Events" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveScannerTab(tab.id as any)}
              style={{
                background: "none",
                border: "none",
                borderBottom: activeScannerTab === tab.id ? "2px solid var(--color-buy)" : "2px solid transparent",
                padding: "8px 0px 10px 0px",
                color: activeScannerTab === tab.id ? "var(--color-text-primary)" : "var(--color-text-muted)",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scanner Results rendering */}
        <div style={{ minHeight: "150px" }}>
          {activeScannerTab !== "risk_events" ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--color-text-muted)" }}>
                  <th style={{ padding: "8px" }}>Ticker</th>
                  <th style={{ padding: "8px" }}>Sector</th>
                  <th style={{ padding: "8px", textAlign: "center" }}>BTST Score</th>
                  <th style={{ padding: "8px", textAlign: "center" }}>Volume Shock</th>
                  <th style={{ padding: "8px", textAlign: "center" }}>Delivery %</th>
                  <th style={{ padding: "8px", textAlign: "center" }}>OI Change</th>
                  <th style={{ padding: "8px", textAlign: "center" }}>PCR</th>
                  <th style={{ padding: "8px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let list: BTSTMetric[] = [];
                  if (activeScannerTab === "long_buildup") list = data.long_buildup;
                  else if (activeScannerTab === "breakouts") list = data.breakouts;
                  else if (activeScannerTab === "high_delivery") list = data.high_delivery;
                  else if (activeScannerTab === "gap_up") list = data.gap_up_probs;
                  else if (activeScannerTab === "pattern_match") list = data.pattern_matches;

                  if (list.length === 0) {
                    return (
                      <tr>
                        <td colSpan={8} style={{ padding: "20px", textAlign: "center", color: "var(--color-text-muted)", fontWeight: "600" }}>
                          No stocks currently matching this scanner trigger criteria.
                        </td>
                      </tr>
                    );
                  }

                  return list.slice(0, 8).map((x) => (
                    <tr
                      key={x.ticker}
                      onClick={() => setSelectedTicker(x.ticker)}
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                        cursor: "pointer",
                        background: selectedTicker === x.ticker ? "rgba(124, 77, 255, 0.05)" : "transparent"
                      }}
                    >
                      <td style={{ padding: "10px 8px", fontWeight: "700", color: "var(--color-text-primary)" }}>{x.ticker}</td>
                      <td style={{ padding: "10px 8px" }}>{x.sector}</td>
                      <td style={{ padding: "10px 8px", textAlign: "center", fontWeight: "800", color: "var(--accent-ml)" }}>{x.btst_score}</td>
                      <td style={{ padding: "10px 8px", textAlign: "center", fontWeight: "600", color: x.vol_shock > 1.5 ? "var(--color-buy)" : "var(--color-text-muted)" }}>
                        {x.vol_shock}x
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center", fontWeight: "600", color: x.delivery_pct > 55 ? "var(--color-buy)" : "var(--color-text-primary)" }}>
                        {x.delivery_pct}%
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center", fontWeight: "600", color: x.oi_change_pct > 2 ? "var(--color-buy)" : x.oi_change_pct < -2 ? "var(--color-sell)" : "var(--color-text-muted)" }}>
                        {x.oi_change_pct > 0 ? "+" : ""}{x.oi_change_pct}%
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center" }}>{x.pcr}</td>
                      <td style={{ padding: "10px 8px" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTicker(x.ticker);
                          }}
                          style={{
                            background: "none",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "4px",
                            padding: "2px 6px",
                            fontSize: "9px",
                            color: "var(--color-text-primary)",
                            fontWeight: "600",
                            cursor: "pointer"
                          }}
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {data.risk_events.map((re) => (
                <div key={re.ticker} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", border: "1px solid var(--border-subtle)", borderRadius: "6px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: "700", fontSize: "12px", color: "var(--color-text-primary)" }}>{re.ticker}</span>
                      <span style={{ fontSize: "9px", color: "var(--color-text-muted)" }}>{re.sector}</span>
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--color-sell)", marginTop: "4px", fontWeight: "600" }}>
                      ⚠️ {re.events[0]}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "9px", color: "var(--color-text-muted)" }}>BTST Score</div>
                    <div style={{ fontSize: "14px", fontWeight: "800", color: "var(--accent-ml)" }}>{re.score}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
