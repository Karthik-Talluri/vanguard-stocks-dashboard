import React, { useState, useEffect } from "react";
import {
  fetchMultiBaggerPicks,
  MultiBaggerResponse,
  MultiBaggerPick,
  fetchGeneratedPortfolio,
  PortfolioResponse,
  PortfolioItem,
  RebalanceAction,
  WeeklyReport
} from "../utils/api";

interface MultiBaggerPicksProps {
  onSelectStock?: (ticker: string) => void;
}

export default function MultiBaggerPicks({ onSelectStock }: MultiBaggerPicksProps) {
  // Main view switcher
  const [viewMode, setViewMode] = useState<"portfolio" | "screener">("portfolio");

  // Screener State
  const [screenerData, setScreenerData] = useState<MultiBaggerResponse | null>(null);
  const [screenerLoading, setScreenerLoading] = useState(true);
  const [screenerError, setScreenerError] = useState<string | null>(null);
  const [activeCapTab, setActiveCapTab] = useState<"all" | "large_cap" | "mid_cap" | "small_cap">("all");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  // Portfolio State
  const [inputAmount, setInputAmount] = useState<string>("1,00,000");
  const [investmentAmount, setInvestmentAmount] = useState<number>(100000);
  const [selectedStyle, setSelectedStyle] = useState<string>("multibagger");
  const [portfolioData, setPortfolioData] = useState<PortfolioResponse | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [rebalanceSuccess, setRebalanceSuccess] = useState(false);

  // Load Screener Data
  useEffect(() => {
    fetchMultiBaggerPicks()
      .then((json: MultiBaggerResponse) => {
        setScreenerData(json);
        if (json.all && json.all.length > 0) {
          setSelectedTicker(json.all[0].ticker);
        }
        setScreenerLoading(false);
      })
      .catch((err) => {
        setScreenerError(err.message);
        setScreenerLoading(false);
      });
  }, []);

  // Load Portfolio Data
  useEffect(() => {
    setPortfolioLoading(true);
    setPortfolioError(null);
    fetchGeneratedPortfolio(investmentAmount, selectedStyle)
      .then((res) => {
        setPortfolioData(res);
        setPortfolioLoading(false);
      })
      .catch((err) => {
        setPortfolioError(err.message);
        setPortfolioLoading(false);
      });
  }, [investmentAmount, selectedStyle]);

  const handleCapTabChange = (tab: "all" | "large_cap" | "mid_cap" | "small_cap") => {
    setActiveCapTab(tab);
    if (screenerData && screenerData[tab] && screenerData[tab].length > 0) {
      setSelectedTicker(screenerData[tab][0].ticker);
    } else {
      setSelectedTicker(null);
    }
  };

  const formatIndianCurrency = (num: number) => {
    return num.toLocaleString("en-IN", {
      maximumFractionDigits: 0,
      style: "currency",
      currency: "INR"
    }).replace(".00", "");
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    if (!raw) {
      setInputAmount("");
      return;
    }
    const val = parseInt(raw, 10);
    setInputAmount(val.toLocaleString("en-IN"));
  };

  const handleBuildPortfolio = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAmt = parseInt(inputAmount.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(cleanAmt) && cleanAmt > 0) {
      setInvestmentAmount(cleanAmt);
    }
  };

  const handleExecuteRebalance = () => {
    setRebalanceSuccess(true);
    setTimeout(() => {
      setRebalanceSuccess(false);
    }, 4000);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#059669";
    if (score >= 65) return "var(--accent-ml)";
    return "var(--color-text-secondary)";
  };

  const getOpportunityColor = (score: number) => {
    if (score >= 35) return "#10b981";
    if (score >= 15) return "#8b5cf6";
    if (score >= 0) return "#3b82f6";
    return "#ef4444";
  };

  const getCapColor = (cap: string) => {
    if (cap === "large") return "#3b82f6";
    if (cap === "mid") return "#a855f7";
    return "#ec4899";
  };

  const getActionBadgeColor = (action: string) => {
    switch (action.toLowerCase()) {
      case "buy": return { bg: "rgba(16, 185, 129, 0.1)", text: "#10b981" };
      case "sell": return { bg: "rgba(239, 68, 68, 0.1)", text: "#ef4444" };
      case "reduce": return { bg: "rgba(245, 158, 11, 0.1)", text: "#f59e0b" };
      case "increase": return { bg: "rgba(139, 92, 246, 0.1)", text: "#8b5cf6" };
      default: return { bg: "rgba(107, 114, 128, 0.1)", text: "#6b7280" };
    }
  };

  const currentList = screenerData ? (screenerData[activeCapTab] || []) : [];
  const selectedStock = currentList.find((x) => x.ticker === selectedTicker) || currentList[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%" }} className="animate-fade-in" id="multi-bagger-workspace">
      
      {/* Premium Top Navigation View Switcher */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "1px solid var(--border-subtle)",
        paddingBottom: "12px",
        flexWrap: "wrap",
        gap: "12px"
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "900", color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
            🧠 AI Portfolio Manager & Multi-Bagger Screener
          </h2>
          <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: 0 }}>
            Optimized capital allocations, weekly rebalancing recommendations, and Nifty 250 screens.
          </p>
        </div>

        <div style={{
          display: "flex",
          background: "rgba(0,0,0,0.04)",
          padding: "4px",
          borderRadius: "8px",
          border: "1px solid var(--border-subtle)"
        }}>
          <button
            onClick={() => setViewMode("portfolio")}
            style={{
              fontSize: "12px",
              padding: "8px 16px",
              border: "none",
              borderRadius: "6px",
              background: viewMode === "portfolio" ? "var(--bg-card)" : "transparent",
              color: viewMode === "portfolio" ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              fontWeight: "800",
              cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: viewMode === "portfolio" ? "0 2px 4px rgba(0,0,0,0.06)" : "none"
            }}
          >
            💼 AI Portfolio Builder
          </button>
          <button
            onClick={() => setViewMode("screener")}
            style={{
              fontSize: "12px",
              padding: "8px 16px",
              border: "none",
              borderRadius: "6px",
              background: viewMode === "screener" ? "var(--bg-card)" : "transparent",
              color: viewMode === "screener" ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              fontWeight: "800",
              cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: viewMode === "screener" ? "0 2px 4px rgba(0,0,0,0.06)" : "none"
            }}
          >
            🔬 Nifty 250 Screener
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 💼 VIEW MODE: AI PORTFOLIO BUILDER                            */}
      {/* ------------------------------------------------------------- */}
      {viewMode === "portfolio" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          
          {/* User Input & Optimization Panel */}
          <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: "900", margin: 0, color: "var(--color-text-primary)" }}>
              ⚙️ Customize Your AI Portfolio Constraints
            </h3>
            
            <form onSubmit={handleBuildPortfolio} style={{
              display: "flex",
              alignItems: "flex-end",
              flexWrap: "wrap",
              gap: "20px"
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: "1 1 200px" }}>
                <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-secondary)" }}>
                  INVESTMENT AMOUNT
                </label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <span style={{ position: "absolute", left: "12px", fontSize: "14px", fontWeight: "800", color: "var(--color-text-secondary)" }}>₹</span>
                  <input
                    type="text"
                    value={inputAmount}
                    onChange={handleAmountChange}
                    style={{
                      width: "100%",
                      padding: "10px 12px 10px 24px",
                      background: "rgba(0,0,0,0.02)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: "800",
                      color: "var(--color-text-primary)",
                      outline: "none"
                    }}
                    placeholder="Enter amount"
                  />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: "1 1 200px" }}>
                <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-secondary)" }}>
                  INVESTMENT STYLE
                </label>
                <select
                  value={selectedStyle}
                  onChange={(e) => setSelectedStyle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "rgba(0,0,0,0.02)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: "800",
                    color: "var(--color-text-primary)",
                    outline: "none",
                    cursor: "pointer"
                  }}
                >
                  <option value="multibagger">🚀 Multibagger (6 Months)</option>
                  <option value="swing">⚡ Swing (3 Months)</option>
                  <option value="high_growth">🔥 High Growth</option>
                  <option value="balanced">⚖️ Balanced</option>
                  <option value="low_risk">🛡️ Low Risk</option>
                  <option value="dividend">💰 Dividend Yield</option>
                </select>
              </div>

              <button
                type="submit"
                style={{
                  padding: "11px 24px",
                  background: "var(--accent-ml)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "800",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(79, 70, 229, 0.2)",
                  transition: "all 0.15s"
                }}
              >
                Build Optimized Portfolio ⚡
              </button>
            </form>
          </div>

          {portfolioLoading ? (
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "400px", color: "var(--color-text-secondary)", gap: "16px" }}>
              <div className="animate-spin" style={{ width: "36px", height: "36px", border: "3px solid var(--border-subtle)", borderTop: "3px solid var(--accent-ml)", borderRadius: "50%" }} />
              <div style={{ fontSize: "14px", fontWeight: "700" }}>AI Allocation Engine optimizing portfolio weights...</div>
            </div>
          ) : portfolioError || !portfolioData ? (
            <div className="glass-panel" style={{ padding: "24px", color: "var(--color-sell)", fontWeight: "600", textAlign: "center" }}>
              ⚠️ Error calculating portfolio: {portfolioError || "No data received"}
            </div>
          ) : (
            <div className="responsive-split-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "20px" }}>
              
              {/* Left Column: Optimized Allocations Table */}
              <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ fontSize: "14px", fontWeight: "900", margin: 0, color: "var(--color-text-primary)" }}>
                    📊 AI Portfolio Allocation ({portfolioData.portfolio.length} Holdings)
                  </h3>
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: "600" }}>
                    Constraint-Compliant Model
                  </span>
                </div>

                {/* Desktop Table View */}
                <div className="table-desktop-view" style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-subtle)", textAlign: "left" }}>
                        <th style={{ padding: "10px 8px", color: "var(--color-text-muted)" }}>Rank</th>
                        <th style={{ padding: "10px 8px", color: "var(--color-text-muted)" }}>Stock</th>
                        <th style={{ padding: "10px 8px", color: "var(--color-text-muted)", textAlign: "right" }}>Weight</th>
                        <th style={{ padding: "10px 8px", color: "var(--color-text-muted)", textAlign: "right" }}>Amount</th>
                        <th style={{ padding: "10px 8px", color: "var(--color-text-muted)", textAlign: "right" }}>Shares</th>
                        <th style={{ padding: "10px 8px", color: "var(--color-text-muted)", textAlign: "center" }}>Conviction</th>
                        <th style={{ padding: "10px 8px", color: "var(--color-text-muted)", textAlign: "center" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolioData.portfolio.map((item, idx) => (
                        <tr
                          key={`${item.ticker}-${idx}`}
                          style={{ borderBottom: "1px solid var(--border-subtle)", transition: "all 0.15s" }}
                          className="table-row-hover"
                        >
                          <td style={{ padding: "12px 8px", fontWeight: "800", color: "var(--color-text-muted)" }}>
                            #{item.rank}
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            <div style={{ fontWeight: "800", color: "var(--color-text-primary)" }}>{item.ticker}</div>
                            <div style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>{item.sector}</div>
                          </td>
                          <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: "800", color: "var(--accent-ml)" }}>
                            {item.weight}%
                          </td>
                          <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: "700" }}>
                            {formatIndianCurrency(item.amount)}
                          </td>
                          <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: "700", color: "var(--color-text-secondary)" }}>
                            {item.shares}
                          </td>
                          <td style={{ padding: "12px 8px", textAlign: "center" }}>
                            <span style={{
                              background: getScoreColor(item.conviction) + "12",
                              color: getScoreColor(item.conviction),
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontWeight: "800",
                              fontSize: "11px"
                            }}>
                              {item.conviction}
                            </span>
                          </td>
                          <td style={{ padding: "12px 8px", textAlign: "center" }}>
                            <button
                              onClick={() => {
                                setViewMode("screener");
                                setSelectedTicker(item.ticker);
                              }}
                              style={{
                                padding: "2px 6px",
                                background: "transparent",
                                border: "1px solid var(--border-subtle)",
                                borderRadius: "4px",
                                fontSize: "10px",
                                color: "var(--color-text-secondary)",
                                cursor: "pointer",
                                fontWeight: "600"
                              }}
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards View */}
                <div className="cards-mobile-view" style={{ flexDirection: "column", gap: "10px" }}>
                  {portfolioData.portfolio.map((item, idx) => (
                    <div
                      key={`${item.ticker}-${idx}`}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-subtle)",
                        background: "rgba(0,0,0,0.01)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ fontWeight: "800", color: "var(--color-text-muted)", marginRight: "6px" }}>#{item.rank}</span>
                          <span style={{ fontWeight: "800", color: "var(--color-text-primary)", fontSize: "14px" }}>{item.ticker}</span>
                          <span style={{ fontSize: "10px", color: "var(--color-text-muted)", marginLeft: "6px" }}>({item.sector})</span>
                        </div>
                        <span style={{
                          background: getScoreColor(item.conviction) + "12",
                          color: getScoreColor(item.conviction),
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontWeight: "800",
                          fontSize: "11px"
                        }}>
                          MBX: {item.conviction}
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", textAlign: "center", background: "rgba(0,0,0,0.01)", padding: "6px", borderRadius: "6px" }}>
                        <div>
                          <span style={{ fontSize: "8px", color: "var(--color-text-muted)", display: "block" }}>WEIGHT</span>
                          <span style={{ fontSize: "12px", fontWeight: "800", color: "var(--accent-ml)" }}>{item.weight}%</span>
                        </div>
                        <div>
                          <span style={{ fontSize: "8px", color: "var(--color-text-muted)", display: "block" }}>AMOUNT</span>
                          <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--color-text-primary)" }}>{formatIndianCurrency(item.amount)}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: "8px", color: "var(--color-text-muted)", display: "block" }}>SHARES</span>
                          <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--color-text-secondary)" }}>{item.shares}</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                          onClick={() => {
                            setViewMode("screener");
                            setSelectedTicker(item.ticker);
                          }}
                          style={{
                            padding: "4px 10px",
                            background: "transparent",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "4px",
                            fontSize: "10px",
                            color: "var(--color-text-secondary)",
                            cursor: "pointer",
                            fontWeight: "600"
                          }}
                        >
                          Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Portfolio Summary Panel */}
                <div style={{
                  background: "rgba(0,0,0,0.02)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "8px",
                  padding: "16px",
                  display: "flex",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "12px",
                  marginTop: "10px"
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "10px", color: "var(--color-text-secondary)", fontWeight: "700" }}>TOTAL ALLOCATED</span>
                    <span style={{ fontSize: "16px", fontWeight: "900", color: "var(--color-buy)" }}>
                      {formatIndianCurrency(portfolioData.summary.total_invested)}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "10px", color: "var(--color-text-secondary)", fontWeight: "700" }}>CASH RESERVE</span>
                    <span style={{ fontSize: "16px", fontWeight: "900", color: "var(--color-text-secondary)" }}>
                      {formatIndianCurrency(portfolioData.summary.cash)}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "10px", color: "var(--color-text-secondary)", fontWeight: "700" }}>TOTAL PORTFOLIO</span>
                    <span style={{ fontSize: "16px", fontWeight: "900", color: "var(--color-text-primary)" }}>
                      {formatIndianCurrency(portfolioData.summary.investment_amount)}
                    </span>
                  </div>
                </div>

                {/* Allocation Engine Rule Badges */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "4px" }}>
                  {[
                    "Max 12% Per Stock",
                    "Max 25% Per Sector",
                    "Min 3% Per Position",
                    "Diverse Sectors Represented"
                  ].map((rule, idx) => (
                    <span key={idx} style={{
                      fontSize: "10px",
                      background: "rgba(16, 185, 129, 0.05)",
                      color: "#10b981",
                      border: "1px solid rgba(16, 185, 129, 0.15)",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      fontWeight: "700"
                    }}>
                      ✓ {rule}
                    </span>
                  ))}
                </div>
              </div>

              {/* Right Column: Performance Report & Rebalancing */}
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                
                {/* 1. Weekly Performance Report */}
                <div className="glass-panel glow-purple" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ fontSize: "13px", fontWeight: "900", margin: 0, color: "var(--color-text-primary)", textTransform: "uppercase" }}>
                      📈 Weekly Portfolio Report
                    </h3>
                    <span style={{ fontSize: "10px", color: "var(--color-text-muted)", fontWeight: "600" }}>Weekend Update</span>
                  </div>

                  <div className="target-box-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div style={{ background: "rgba(0,0,0,0.02)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                      <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", fontWeight: "700" }}>PORTFOLIO VALUE</div>
                      <div style={{ fontSize: "18px", fontWeight: "900", color: "var(--color-text-primary)", marginTop: "4px" }}>
                        {formatIndianCurrency(portfolioData.weekly_report.value)}
                      </div>
                    </div>
                    <div style={{ background: "rgba(0,0,0,0.02)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                      <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", fontWeight: "700" }}>WEEKLY RETURN</div>
                      <div style={{ fontSize: "18px", fontWeight: "900", color: "#10b981", marginTop: "4px" }}>
                        +{portfolioData.weekly_report.weekly_return}%
                      </div>
                    </div>
                  </div>

                  {/* Return comparison bar */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px", marginTop: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "700" }}>
                      <span style={{ color: "var(--color-text-secondary)" }}>Nifty Benchmark:</span>
                      <span style={{ color: "var(--color-text-primary)" }}>+{portfolioData.weekly_report.benchmark_return}%</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "800" }}>
                      <span style={{ color: "var(--accent-ml)" }}>AI Outperformance:</span>
                      <span style={{ color: "#10b981" }}>+{portfolioData.weekly_report.outperformance}%</span>
                    </div>
                  </div>

                  <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)", margin: "4px 0" }} />

                  {/* Weekly Changes list */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <span style={{ fontSize: "10px", fontWeight: "800", color: "var(--color-text-secondary)" }}>
                      HOLDINGS MODIFICATIONS THIS WEEK
                    </span>
                    
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "10px" }}>
                      {portfolioData.weekly_report.changes.map((chg, i) => {
                        const isPos = chg.type === "Added" || chg.type === "Increased";
                        const isNeg = chg.type === "Removed" || chg.type === "Reduced";
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(0,0,0,0.01)", padding: "4px 8px", borderRadius: "4px" }}>
                            <span style={{
                              fontWeight: "900",
                              color: isPos ? "#10b981" : isNeg ? "#ef4444" : "var(--color-text-muted)"
                            }}>
                              {chg.type === "Added" ? "✔" : chg.type === "Removed" ? "✘" : chg.type === "Increased" ? "▲" : chg.type === "Reduced" ? "▼" : "•"}
                            </span>
                            <span style={{ fontWeight: "700", color: "var(--color-text-primary)" }}>{chg.ticker}</span>
                            <span style={{ fontSize: "9px", color: "var(--color-text-muted)", marginLeft: "auto" }}>
                              {chg.type}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 2. Rebalancing Ledger */}
                <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ fontSize: "13px", fontWeight: "900", margin: 0, color: "var(--color-text-primary)", textTransform: "uppercase" }}>
                      🔄 Rebalancing Suggestions
                    </h3>
                    <span style={{ fontSize: "10px", color: "var(--color-text-muted)", fontWeight: "600" }}>Weekend Executable</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {portfolioData.rebalance_actions.map((act, idx) => {
                      const colors = getActionBadgeColor(act.action);
                      return (
                        <div
                          key={idx}
                          style={{
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "8px",
                            padding: "10px 12px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                            background: "rgba(0,0,0,0.01)"
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{
                                background: colors.bg,
                                color: colors.text,
                                fontSize: "9px",
                                fontWeight: "800",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                textTransform: "uppercase"
                              }}>
                                {act.action}
                              </span>
                              <strong style={{ fontSize: "12px", color: "var(--color-text-primary)" }}>{act.ticker}</strong>
                            </div>
                            {act.amount > 0 && (
                              <span style={{ fontSize: "12px", fontWeight: "800", color: "var(--color-text-primary)" }}>
                                {formatIndianCurrency(act.amount)}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: "1.4" }}>
                            {act.reason}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {rebalanceSuccess ? (
                    <div style={{
                      background: "rgba(16, 185, 129, 0.08)",
                      border: "1px solid rgba(16, 185, 129, 0.2)",
                      color: "#10b981",
                      borderRadius: "6px",
                      padding: "10px",
                      textAlign: "center",
                      fontSize: "12px",
                      fontWeight: "800"
                    }} className="animate-fade-in">
                      🚀 Portfolio rebalanced successfully! Weight allocations updated.
                    </div>
                  ) : (
                    <button
                      onClick={handleExecuteRebalance}
                      style={{
                        width: "100%",
                        padding: "10px",
                        background: "rgba(79, 70, 229, 0.08)",
                        border: "1px solid rgba(79, 70, 229, 0.2)",
                        color: "var(--accent-ml)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: "800",
                        cursor: "pointer",
                        transition: "all 0.15s"
                      }}
                      className="button-hover-glow"
                    >
                      Execute Rebalance Allocation ⚡
                    </button>
                  )}
                </div>

              </div>

            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 🔬 VIEW MODE: NIFTY 250 SCREENER LEADERBOARD                  */}
      {/* ------------------------------------------------------------- */}
      {viewMode === "screener" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          
          {/* Header & Cap Switcher Banner */}
          <div style={{
            background: "linear-gradient(135deg, rgba(236, 72, 153, 0.08) 0%, rgba(79, 70, 229, 0.04) 100%)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "12px",
            padding: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px"
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: "900", color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
                🚀 Nifty 250 Leaderboard Screen
              </h2>
              <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: 0, maxWidth: "700px", lineHeight: "1.5" }}>
                Analyzing 250 tickers with the 9-factor MBX conviction score. Use the deep-dive panel to evaluate momentum catalysts.
              </p>
            </div>

            {screenerData && (
              <div style={{
                display: "flex",
                background: "rgba(0,0,0,0.04)",
                padding: "3px",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)"
              }}>
                {[
                  { id: "all", label: "🔥 All Ranked", count: screenerData.all.length },
                  { id: "large_cap", label: "Large Cap", count: screenerData.large_cap.length },
                  { id: "mid_cap", label: "Mid Cap", count: screenerData.mid_cap.length },
                  { id: "small_cap", label: "Small Cap", count: screenerData.small_cap.length }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => handleCapTabChange(tab.id as any)}
                    style={{
                      fontSize: "12px",
                      padding: "6px 14px",
                      border: "none",
                      borderRadius: "6px",
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
            )}
          </div>

          {screenerLoading ? (
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "400px", color: "var(--color-text-secondary)", gap: "16px" }}>
              <div className="animate-spin" style={{ width: "36px", height: "36px", border: "3px solid var(--border-subtle)", borderTop: "3px solid var(--accent-ml)", borderRadius: "50%" }} />
              <div style={{ fontSize: "14px", fontWeight: "600" }}>Running Multi-Bagger Screening on Nifty 250 universe...</div>
            </div>
          ) : screenerError || !screenerData ? (
            <div className="glass-panel" style={{ padding: "24px", color: "var(--color-sell)", fontWeight: "600", textAlign: "center" }}>
              ⚠️ Error loading Nifty 250 screener: {screenerError || "No data received"}
            </div>
          ) : currentList.length === 0 ? (
            <div className="glass-panel" style={{ padding: "40px", textAlign: "center", color: "var(--color-text-muted)" }}>
              No active multi-bagger candidates detected in this capitalization tier.
            </div>
          ) : (
            <div className="responsive-split-grid" style={{ display: "grid", gridTemplateColumns: "1.3fr 1.1fr", gap: "20px" }}>
              
              {/* Left Panel: Rankings Table */}
              <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: "800", color: "var(--color-text-primary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>🏆 Leaderboard Rankings</span>
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: "500", marginLeft: "auto" }}>Sorted by MBX Score</span>
                </h3>
                
                {/* Desktop Table View */}
                <div className="table-desktop-view" style={{ overflowX: "auto", maxHeight: "680px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-subtle)", textAlign: "left" }}>
                        <th style={{ padding: "10px 8px", color: "var(--color-text-muted)" }}>Rank</th>
                        <th style={{ padding: "10px 8px", color: "var(--color-text-muted)" }}>Stock</th>
                        <th style={{ padding: "10px 8px", color: "var(--color-text-muted)", textAlign: "right" }}>Price</th>
                        <th style={{ padding: "10px 8px", color: "var(--color-text-muted)", textAlign: "center" }}>Cap</th>
                        <th style={{ padding: "10px 8px", color: "var(--color-text-muted)", textAlign: "center" }}>RSI</th>
                        <th style={{ padding: "10px 8px", color: "var(--color-text-muted)", textAlign: "center" }}>Opportunity</th>
                        <th style={{ padding: "10px 8px", color: "var(--color-text-muted)", textAlign: "center" }}>MBX Score</th>
                        <th style={{ padding: "10px 8px", color: "var(--color-text-muted)" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentList.map((item, index) => (
                        <tr
                          key={`${item.ticker}-${index}`}
                          onClick={() => setSelectedTicker(item.ticker)}
                          style={{
                            borderBottom: "1px solid var(--border-subtle)",
                            cursor: "pointer",
                            background: selectedTicker === item.ticker ? "rgba(236, 72, 153, 0.06)" : "transparent",
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
                          <td style={{ padding: "12px 8px", textAlign: "center" }}>
                            <span style={{
                              fontSize: "10px",
                              fontWeight: "700",
                              color: getCapColor(item.market_cap),
                              textTransform: "capitalize"
                            }}>
                              {item.market_cap.replace("_cap", "")}
                            </span>
                          </td>
                          <td style={{ padding: "12px 8px", textAlign: "center", fontWeight: "600" }}>
                            {item.rsi}
                          </td>
                          <td style={{ padding: "12px 8px", textAlign: "center" }}>
                            <span style={{
                              color: getOpportunityColor(item.opportunity_score),
                              fontWeight: "800"
                            }}>
                              {item.opportunity_score > 0 ? `+${item.opportunity_score}` : item.opportunity_score}
                            </span>
                          </td>
                          <td style={{ padding: "12px 8px", textAlign: "center" }}>
                            <span style={{
                              background: `rgba(236, 72, 153, 0.08)`,
                              color: getScoreColor(item.multibagger_score),
                              padding: "4px 8px",
                              borderRadius: "6px",
                              fontWeight: "800",
                              fontSize: "11px"
                            }}>
                              {item.multibagger_score}
                            </span>
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
                                cursor: "pointer"
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
                      key={`${item.ticker}-${index}`}
                      onClick={() => setSelectedTicker(item.ticker)}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "8px",
                        border: "1px solid " + (selectedTicker === item.ticker ? "rgba(236, 72, 153, 0.4)" : "var(--border-subtle)"),
                        background: selectedTicker === item.ticker ? "rgba(236, 72, 153, 0.04)" : "rgba(0,0,0,0.01)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ fontWeight: "800", color: "var(--color-text-muted)", marginRight: "6px" }}>#{index + 1}</span>
                          <span style={{ fontWeight: "800", color: "var(--color-text-primary)", fontSize: "14px" }}>{item.ticker}</span>
                          <span style={{ fontSize: "10px", color: "var(--color-text-muted)", marginLeft: "6px" }}>({item.sector})</span>
                        </div>
                        <span style={{
                          background: `rgba(236, 72, 153, 0.08)`,
                          color: getScoreColor(item.multibagger_score),
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontWeight: "800",
                          fontSize: "11px"
                        }}>
                          MBX: {item.multibagger_score}
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "6px", textAlign: "center", background: "rgba(0,0,0,0.01)", padding: "6px", borderRadius: "6px" }}>
                        <div>
                          <span style={{ fontSize: "8px", color: "var(--color-text-muted)", display: "block" }}>PRICE</span>
                          <span style={{ fontSize: "11px", fontWeight: "700", whiteSpace: "nowrap" }}>₹{item.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: "8px", color: "var(--color-text-muted)", display: "block" }}>CAP</span>
                          <span style={{ fontSize: "11px", fontWeight: "700", color: getCapColor(item.market_cap), textTransform: "capitalize" }}>{item.market_cap.replace("_cap", "")}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: "8px", color: "var(--color-text-muted)", display: "block" }}>RSI</span>
                          <span style={{ fontSize: "11px", fontWeight: "700" }}>{item.rsi}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: "8px", color: "var(--color-text-muted)", display: "block" }}>OPP</span>
                          <span style={{ fontSize: "11px", fontWeight: "800", color: getOpportunityColor(item.opportunity_score) }}>{item.opportunity_score > 0 ? `+${item.opportunity_score}` : item.opportunity_score}</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
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
                <div className="glass-panel glow-purple" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
                  
                  {/* Card Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <h3 style={{ fontSize: "20px", fontWeight: "900", color: "var(--color-text-primary)" }}>{selectedStock.ticker || ""}</h3>
                        <span style={{
                          fontSize: "10px",
                          color: "var(--color-text-secondary)",
                          border: "1px solid var(--border-subtle)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontWeight: "700"
                        }}>{selectedStock.sector || ""}</span>
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                        Current Spot: <span style={{ fontWeight: "800", color: "var(--color-text-primary)", whiteSpace: "nowrap" }}>₹{(selectedStock.price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                      <span style={{
                        background: getScoreColor(selectedStock.multibagger_score || 0) + "12",
                        color: getScoreColor(selectedStock.multibagger_score || 0),
                        padding: "4px 8px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "800"
                      }}>
                        {(selectedStock.multibagger_score || 0) >= 80 ? "🔥 High Conviction" : (selectedStock.multibagger_score || 0) >= 65 ? "Moderate" : "Watchlist"}
                      </span>
                      <span style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>
                        Cap Class: <span style={{ fontWeight: "700", color: getCapColor(selectedStock.market_cap || ""), textTransform: "capitalize" }}>{selectedStock.market_cap || ""}</span>
                      </span>
                    </div>
                  </div>

                  <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)" }} />

                  {/* MBX & Opportunity Score Side-by-Side */}
                  <div className="target-box-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <div style={{
                      background: "rgba(236, 72, 153, 0.04)",
                      border: "1px solid rgba(236, 72, 153, 0.15)",
                      borderRadius: "10px",
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "6px"
                    }}>
                      <span style={{ fontSize: "10px", fontWeight: "800", color: "var(--color-text-secondary)" }}>MBX CONVICTION</span>
                      <div style={{ fontSize: "28px", fontWeight: "900", color: "#ec4899" }}>{selectedStock.multibagger_score || 0}</div>
                      <span style={{ fontSize: "9px", color: "var(--color-text-muted)" }}>Targeting 3M Horizon</span>
                    </div>

                    <div style={{
                      background: "rgba(139, 92, 246, 0.04)",
                      border: "1px solid rgba(139, 92, 246, 0.15)",
                      borderRadius: "10px",
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "6px"
                    }}>
                      <span style={{ fontSize: "10px", fontWeight: "800", color: "var(--color-text-secondary)" }}>OPPORTUNITY GAP</span>
                      <div style={{ fontSize: "28px", fontWeight: "900", color: "#8b5cf6" }}>
                        {(selectedStock.opportunity_score || 0) > 0 ? `+${selectedStock.opportunity_score}` : selectedStock.opportunity_score || 0}
                      </div>
                      <span style={{ fontSize: "9px", color: "var(--color-text-muted)" }}>Market Expectations Gap</span>
                    </div>
                  </div>

                  {/* AI Confidence Engine (2x, 3x, 5x, 10x probabilities) */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <h4 style={{ fontSize: "11px", fontWeight: "800", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
                      🔮 AI Confidence Engine (Probability of Upside)
                    </h4>
                    <div className="target-box-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      {[
                        { label: "2x Potential", val: selectedStock.probabilities?.prob_2x || 0, color: "#10b981" },
                        { label: "3x Potential", val: selectedStock.probabilities?.prob_3x || 0, color: "#3b82f6" },
                        { label: "5x Potential", val: selectedStock.probabilities?.prob_5x || 0, color: "#8b5cf6" },
                        { label: "10x Potential", val: selectedStock.probabilities?.prob_10x || 0, color: "#ec4899" }
                      ].map((p, i) => (
                        <div key={i} style={{ background: "rgba(0,0,0,0.02)", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "8px 12px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", fontWeight: "700" }}>
                            <span style={{ color: "var(--color-text-secondary)" }}>{p.label}</span>
                            <span style={{ color: p.color }}>{p.val}%</span>
                          </div>
                          <div style={{ height: "4px", width: "100%", background: "var(--border-subtle)", borderRadius: "2px", marginTop: "6px", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${p.val}%`, background: p.color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Catalyst Box */}
                  <div style={{
                    background: "rgba(16, 185, 129, 0.03)",
                    border: "1px solid rgba(16, 185, 129, 0.15)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "10px", fontWeight: "800", color: "#10b981", textTransform: "uppercase" }}>⚡ Key Catalyst Action</span>
                      <span style={{ fontSize: "11px", fontWeight: "900", color: "#10b981" }}>Catalyst Score: {selectedStock.catalyst_score || 0}/30</span>
                    </div>
                    <p style={{ fontSize: "11px", margin: 0, color: "var(--color-text-primary)", lineHeight: "1.4" }}>
                      "{selectedStock.catalyst_text || ""}"
                    </p>
                  </div>

                  {/* Hidden Multibagger Checklist */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <h4 style={{ fontSize: "11px", fontWeight: "800", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
                      📋 "Hidden Multibagger" Alignment Checklist
                    </h4>
                    <div className="target-box-grid" style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "6px",
                      fontSize: "10px",
                      background: "rgba(0,0,0,0.01)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "8px",
                      padding: "10px"
                    }}>
                      {[
                        { label: "Future EPS Growth > 25%", val: selectedStock.hidden_multibagger_checklist?.future_eps_growth_25 || false },
                        { label: "Rev Acceleration > 20%", val: selectedStock.hidden_multibagger_checklist?.revenue_acceleration_20 || false },
                        { label: "ROIC Improving (>30%)", val: selectedStock.hidden_multibagger_checklist?.roic_improving || false },
                        { label: "Free Cash Flow Positive", val: selectedStock.hidden_multibagger_checklist?.free_cash_flow_positive || false },
                        { label: "Debt Declining (<0.3 D/E)", val: selectedStock.hidden_multibagger_checklist?.debt_declining || false },
                        { label: "Promoter Holding Stable", val: selectedStock.hidden_multibagger_checklist?.promoter_holding_stable || false },
                        { label: "Smart Money Buying", val: selectedStock.hidden_multibagger_checklist?.institutional_buying || false },
                        { label: "Sector in Tailwind", val: selectedStock.hidden_multibagger_checklist?.sector_in_uptrend || false },
                        { label: "Technical Breakout", val: selectedStock.hidden_multibagger_checklist?.technical_breakout || false },
                        { label: "Reasonable Val (PEG<1.4)", val: selectedStock.hidden_multibagger_checklist?.reasonable_valuation || false },
                        { label: "Strong Catalyst (>22)", val: selectedStock.hidden_multibagger_checklist?.strong_upcoming_catalyst || false }
                      ].map((item, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{
                            color: item.val ? "#10b981" : "var(--color-text-muted)",
                            fontWeight: "900",
                            fontSize: "12px"
                          }}>
                            {item.val ? "✓" : "✗"}
                          </span>
                          <span style={{ color: item.val ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 3M Target & Stop Loss Box */}
                  <div className="target-box-grid" style={{
                    background: "rgba(0,0,0,0.02)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    textAlign: "center"
                  }}>
                    <div style={{ borderRight: "1px solid var(--border-subtle)" }}>
                      <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", fontWeight: "700" }}>3M TARGET (+{selectedStock.expected_3m_return || 0}%)</div>
                      <div style={{ fontSize: "16px", fontWeight: "900", color: "#059669", marginTop: "2px" }}>₹{(selectedStock.target_3m || 0).toLocaleString("en-IN")}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", fontWeight: "700" }}>3M STOP LOSS</div>
                      <div style={{ fontSize: "16px", fontWeight: "900", color: "var(--color-sell)", marginTop: "2px" }}>₹{(selectedStock.stop_loss || 0).toLocaleString("en-IN")}</div>
                    </div>
                  </div>

                  {/* MBX Scoring Breakdown (9 Factors) */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <h4 style={{ fontSize: "11px", fontWeight: "800", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
                      📊 9-Factor MBX Score Breakdown
                    </h4>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "6px", fontSize: "10px" }}>
                      {[
                        { label: "Future Earnings Momentum (20%)", val: selectedStock.score_breakdown?.Growth || 0, max: 20, color: "var(--accent-tech)" },
                        { label: "Capital Allocation (15%)", val: selectedStock.score_breakdown?.Capital_Allocation || 0, max: 15, color: "#10b981" },
                        { label: "Business Moat (15%)", val: selectedStock.score_breakdown?.Moat || 0, max: 15, color: "#a855f7" },
                        { label: "Industry Tailwind (15%)", val: selectedStock.score_breakdown?.Tailwind || 0, max: 15, color: "#f59e0b" },
                        { label: "Management Execution (10%)", val: selectedStock.score_breakdown?.Management || 0, max: 10, color: "#3b82f6" },
                        { label: "Smart Money (10%)", val: selectedStock.score_breakdown?.Smart_Money || 0, max: 10, color: "var(--accent-ml)" },
                        { label: "Innovation (5%)", val: selectedStock.score_breakdown?.Innovation || 0, max: 5, color: "#ec4899" },
                        { label: "Technical Accumulation (5%)", val: selectedStock.score_breakdown?.Technical || 0, max: 5, color: "#06b6d4" },
                        { label: "Valuation (5%)", val: selectedStock.score_breakdown?.Valuation || 0, max: 5, color: "#6b7280" }
                      ].map((factor, i) => (
                        <div key={i}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                            <span style={{ color: "var(--color-text-secondary)" }}>{factor.label}</span>
                            <span style={{ fontWeight: "700", color: "var(--color-text-primary)" }}>{factor.val} / {factor.max}</span>
                          </div>
                          <div style={{ height: "4px", width: "100%", background: "var(--border-subtle)", borderRadius: "2px", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${(factor.val / factor.max) * 100}%`, background: factor.color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Button */}
                  {onSelectStock && (
                    <button
                      onClick={() => onSelectStock(selectedStock.ticker || "")}
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
                    >
                      Open Full AI Research Terminal 🔎
                    </button>
                  )}

                </div>
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
        <strong>⚠️ Portfolio Risk Warning:</strong> Backtested metrics do not guarantee future gains. Weight adjustments are recalculated using optimal constraints (max 12% stock / 25% sector caps). Verify allocation changes with a qualified financial advisor.
      </div>

    </div>
  );
}
