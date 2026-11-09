import React, { useEffect, useState } from "react";
import { fetchFuturesDetail, fetchStockDetail, FuturesDetail, StockDetail, FuturesOptionCandidate } from "../utils/api";
import StockChart from "./StockChart";

interface FuturesResearchProps {
  selectedTicker: string;
  chartData: any[];
  chartInterval: string;
  onIntervalChange: (interval: string) => void;
}

export default function FuturesResearch({ selectedTicker, chartData, chartInterval, onIntervalChange }: FuturesResearchProps) {
  const [detail, setDetail] = useState<FuturesDetail | null>(null);
  const [stockDetail, setStockDetail] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Interactive Custom Option Strike override
  const [selectedStrike, setSelectedStrike] = useState<FuturesOptionCandidate | null>(null);

  // Position Sizing capital input state
  const [capitalInput, setCapitalInput] = useState<number>(500000); // Default ₹5 Lakh

  // Toggle for backtest detailed trade log breakdown
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Strategy Mode Toggle: Covered Call Income vs 2-Day Futures Swing
  const [strategyMode, setStrategyMode] = useState<"income" | "swing">("income");

  useEffect(() => {
    const loadDetail = async () => {
      try {
        setLoading(true);
        const [futuresRes, stockRes] = await Promise.all([
          fetchFuturesDetail(selectedTicker),
          fetchStockDetail(selectedTicker)
        ]);
        setDetail(futuresRes);
        setStockDetail(stockRes);
        // Default to the engine's recommended strike
        if (futuresRes && futuresRes.recommendation) {
          setSelectedStrike({
            strike: futuresRes.recommendation.strike,
            option_symbol: futuresRes.recommendation.option_contract,
            premium: futuresRes.recommendation.premium,
            pop: futuresRes.recommendation.pop,
            yield: futuresRes.recommendation.expected_yield,
            upside_remaining: futuresRes.recommendation.worst_case, // temporary binding
            expected_return: futuresRes.recommendation.expected_return,
            best_case: futuresRes.recommendation.best_case,
            worst_case: futuresRes.recommendation.worst_case
          });
        }
        setError("");
      } catch (err: any) {
        console.error(err);
        setError(`Failed to load details for ${selectedTicker}`);
      } finally {
        setLoading(false);
      }
    };

    loadDetail();
  }, [selectedTicker]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "80px", color: "var(--color-text-secondary)", fontSize: "14px" }}>
        <div className="animate-spin" style={{ border: "2px solid var(--border-subtle)", borderTop: "2px solid var(--accent-ml)", borderRadius: "50%", width: "24px", height: "24px", marginRight: "10px" }} />
        Analyzing options chain matrix and loading agent scores...
      </div>
    );
  }

  if (error || !detail || !stockDetail || (detail as any).error || (stockDetail as any).error || !detail.recommendation) {
    return (
      <div className="glass-panel" style={{ padding: "30px", color: "var(--color-error)", textAlign: "center", fontWeight: "700" }}>
        ⚠️ {error || (detail as any).error || (stockDetail as any).error || "Stock details could not be loaded."}
      </div>
    );
  }

  // Active strategy parameters (either default or overridden by user option choice)
  const activeStrike = selectedStrike || {
    strike: detail.recommendation.strike,
    option_symbol: detail.recommendation.option_contract,
    premium: detail.recommendation.premium,
    pop: detail.recommendation.pop,
    yield: detail.recommendation.expected_yield,
    expected_return: detail.recommendation.expected_return,
    best_case: detail.recommendation.best_case,
    worst_case: detail.recommendation.worst_case
  };

  // Position Sizing calculations
  const marginPerLot = detail.margin_blocked;
  const suggestedLots = Math.max(0, Math.floor(capitalInput / marginPerLot));
  const totalMarginNeeded = suggestedLots * marginPerLot;

  // Render return profile colors
  const bestColor = "#10b981";
  const expectedColor = "#3b82f6";
  const worstColor = "#ef4444";

  // Technical agent metrics
  const techMetrics = stockDetail?.agents?.["Technical Agent"]?.metrics || {};
  const advFeatures = stockDetail?.advanced_features || {};

  const rsiVal = techMetrics.rsi ?? 50;
  const adxVal = techMetrics.adx ?? 25;
  const macdVal = techMetrics.macd ?? 0;
  const macdSig = techMetrics.macd_signal ?? 0;
  const macdHist = (macdVal - macdSig);
  const supportZone = techMetrics.support_zone ?? (detail.spot_price * 0.95);
  const resistanceZone = techMetrics.resistance_zone ?? (detail.spot_price * 1.05);
  const volumeNode = techMetrics.volume_node ?? ((supportZone + resistanceZone) / 2);
  const dailyTrend = techMetrics.daily_trend ?? "Neutral";
  const weeklyTrend = techMetrics.weekly_trend ?? "Neutral";
  const monthlyTrend = techMetrics.monthly_trend ?? "Neutral";

  const pctFromSupport = advFeatures.sdz_pct_from_support ?? 0;
  const pctFromResistance = advFeatures.sdz_pct_from_resistance ?? 0;
  const zoneSignal = advFeatures.sdz_zone_signal ?? "MID-RANGE";

  // Sector agent metrics
  const sectorMetrics = stockDetail?.agents?.["Sector Agent"]?.metrics || {};
  const sectorName = sectorMetrics.sector ?? "Banking";
  const sectorScore = stockDetail?.sector_score ?? 50;
  const sectorReturn = sectorMetrics.sector_return_20d ?? 0;
  const niftyReturn = sectorMetrics.nifty_return_20d ?? 0;
  const sectorAlpha = sectorMetrics.rs_alpha ?? 0;
  const sectorBreadth = sectorMetrics.market_breadth || {};
  const breadthScore = sectorBreadth.breadth_score ?? 50;
  const advances = sectorBreadth.advances ?? 25;
  const declines = sectorBreadth.declines ?? 25;
  const pctAbove50 = sectorBreadth.pct_above_50_ema ?? 50;
  const pctAbove200 = sectorBreadth.pct_above_200_ema ?? 50;

  // Smart Money
  const smScore = advFeatures.sm_score ?? 50;
  const smBlocks = advFeatures.sm_block_5d_avg ?? 0;
  const smMfChange = advFeatures.sm_mf_holding_change_1m ?? 0;
  const smInsiderNet = advFeatures.sm_insider_net_events ?? 0;
  const smPledging = advFeatures.sm_pledging_pct ?? 0;
  const smPledgingChange = advFeatures.sm_pledging_change_1m ?? 0;
  const smSignals = advFeatures.sm_signals || [];

  // Analyst consensus
  const analystConsensus = advFeatures.analyst_consensus ?? "NEUTRAL";
  const analystBuyPct = advFeatures.analyst_buy_pct ?? 50;
  const analystHoldPct = advFeatures.analyst_hold_pct ?? 30;
  const analystSellPct = advFeatures.analyst_sell_pct ?? 20;
  const analystScore = advFeatures.analyst_score ?? 50;
  const analystTpTrend = advFeatures.analyst_tp_revision_trend ?? "STABLE";
  const analystEstTrend = advFeatures.analyst_est_revision_trend ?? "STABLE";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      
      {/* Upper 2-Column Grid */}
      <div className="responsive-split-grid" style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: "16px", alignItems: "start" }}>
        
        {/* Left Column: Strategy & Position Setup */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          
          {/* Strategy Mode Switcher */}
          <div style={{ display: "flex", gap: "8px", background: "rgba(0,0,0,0.02)", padding: "4px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
            {[
              { id: "income", label: "💰 30-Day Option Income Strategy", desc: "Buy Future + Sell Call (Bullish) or Sell Call only (Bearish)" },
              { id: "swing", label: "⚡ 2-Day Futures Swing (BTST)", desc: "Buy Future, Hold 2 Days" }
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => setStrategyMode(mode.id as any)}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "none",
                  background: strategyMode === mode.id ? "var(--bg-card)" : "transparent",
                  color: strategyMode === mode.id ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  boxShadow: strategyMode === mode.id ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                <span style={{ fontSize: "11px", fontWeight: "800" }}>{mode.label}</span>
                <span style={{ fontSize: "8px", color: "var(--color-text-muted)", marginTop: "2px" }}>{mode.desc}</span>
              </button>
            ))}
          </div>

          {/* Hero Score & Strategy Summary */}
          <div className="glass-panel" style={{ padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "24px", fontWeight: "900", color: "var(--color-text-primary)" }}>{detail.ticker}</span>
                <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-secondary)", background: "rgba(0,0,0,0.05)", padding: "2px 8px", borderRadius: "20px", whiteSpace: "nowrap" }}>
                  Spot: ₹{detail.spot_price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              
              {/* Displaying Setup Contract */}
              <div style={{ marginTop: "8px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                {strategyMode === "income" ? (
                  detail.recommendation.strategy_type === "sell_call" ? (
                    <>
                      <span style={{ color: "#ec4899", fontWeight: "800", fontSize: "12px", background: "rgba(236, 72, 153, 0.08)", padding: "4px 8px", borderRadius: "4px" }}>
                        SELL {activeStrike.option_symbol.split(" ").slice(2).join(" ")} (Premium: ₹{activeStrike.premium})
                      </span>
                      <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-secondary)", background: "rgba(0,0,0,0.05)", padding: "4px 8px", borderRadius: "4px" }}>
                        Short Call (Bearish Setup)
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={{ color: "#3b82f6", fontWeight: "800", fontSize: "12px", background: "rgba(59, 130, 246, 0.08)", padding: "4px 8px", borderRadius: "4px" }}>
                        BUY {detail.recommendation.future_contract}
                      </span>
                      <span style={{ fontSize: "12px", fontWeight: "700" }}>+</span>
                      <span style={{ color: "#ec4899", fontWeight: "800", fontSize: "12px", background: "rgba(236, 72, 153, 0.08)", padding: "4px 8px", borderRadius: "4px" }}>
                        SELL {activeStrike.option_symbol.split(" ").slice(2).join(" ")} (Premium: ₹{activeStrike.premium})
                      </span>
                    </>
                  )
                ) : (
                  <>
                    <span style={{ color: "#10b981", fontWeight: "800", fontSize: "12px", background: "rgba(16, 185, 129, 0.08)", padding: "4px 8px", borderRadius: "4px" }}>
                      BUY {detail.recommendation.future_contract} (BTST SWING)
                    </span>
                    <span style={{ fontSize: "12px", fontWeight: "700" }}>|</span>
                    <span style={{ color: "var(--color-text-secondary)", fontWeight: "800", fontSize: "12px", background: "rgba(0,0,0,0.05)", padding: "4px 8px", borderRadius: "4px" }}>
                      Target Hold: 2 Days
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Strategy Score Gauge */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: "10px", fontWeight: "800", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                {strategyMode === "income" ? "Income Score" : "Swing Score"}
              </span>
              <div 
                style={{ 
                  fontSize: "36px", 
                  fontWeight: "900", 
                  color: strategyMode === "income" ? "var(--accent-ml)" : "#10b981", 
                  lineHeight: "1.1" 
                }}
              >
                {strategyMode === "income" ? detail.strategy_score : (detail.btst_recommendation?.btst_score ?? 50)}
              </div>
              <span 
                style={{ 
                  fontSize: "10px", 
                  fontWeight: "700", 
                  color: (strategyMode === "income" ? detail.strategy_score : (detail.btst_recommendation?.btst_score ?? 50)) >= 75 ? "#10b981" : "#f59e0b" 
                }}
              >
                {strategyMode === "income" 
                  ? (detail.strategy_score >= 75 ? "HIGH CONVICTION" : "MODERATE") 
                  : (detail.btst_recommendation?.recommendation ?? "HOLD")}
              </span>
            </div>
          </div>

          {/* Expected Yield & Return Overview */}
          {strategyMode === "income" ? (
            <div className="three-columns-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
              <div className="glass-panel" style={{ padding: "14px", textAlign: "center" }}>
                <div style={{ fontSize: "10px", fontWeight: "800", color: "var(--color-text-muted)" }}>MONTHLY OPTION YIELD</div>
                <div style={{ fontSize: "20px", fontWeight: "900", color: "var(--color-text-primary)", marginTop: "4px" }}>
                  {activeStrike.yield.toFixed(2)}%
                </div>
              </div>
              <div className="glass-panel" style={{ padding: "14px", textAlign: "center" }}>
                <div style={{ fontSize: "10px", fontWeight: "800", color: "var(--color-text-muted)" }}>PROBABILITY OF PROFIT</div>
                <div style={{ fontSize: "20px", fontWeight: "900", color: "#10b981", marginTop: "4px" }}>
                  {activeStrike.pop}%
                </div>
              </div>
              <div className="glass-panel" style={{ padding: "14px", textAlign: "center" }}>
                <div style={{ fontSize: "10px", fontWeight: "800", color: "var(--color-text-muted)" }}>EXPECTED RETURN (M)</div>
                <div style={{ fontSize: "20px", fontWeight: "900", color: "#3b82f6", marginTop: "4px" }}>
                  {activeStrike.expected_return.toFixed(2)}%
                </div>
              </div>
            </div>
          ) : (
            <div className="three-columns-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
              <div className="glass-panel" style={{ padding: "14px", textAlign: "center" }}>
                <div style={{ fontSize: "10px", fontWeight: "800", color: "var(--color-text-muted)" }}>EXPECTED 2-DAY MOVE</div>
                <div style={{ fontSize: "20px", fontWeight: "900", color: "#3b82f6", marginTop: "4px" }}>
                  {detail.btst_recommendation?.expected_move}
                </div>
              </div>
              <div className="glass-panel" style={{ padding: "14px", textAlign: "center" }}>
                <div style={{ fontSize: "10px", fontWeight: "800", color: "var(--color-text-muted)" }}>2-D PROFIT PROBABILITY</div>
                <div style={{ fontSize: "20px", fontWeight: "900", color: "#10b981", marginTop: "4px" }}>
                  {detail.btst_recommendation?.prob_positive_close}%
                </div>
              </div>
              <div className="glass-panel" style={{ padding: "14px", textAlign: "center" }}>
                <div style={{ fontSize: "10px", fontWeight: "800", color: "var(--color-text-muted)" }}>CONVICTION SCORE</div>
                <div style={{ fontSize: "20px", fontWeight: "900", color: "var(--accent-ml)", marginTop: "4px" }}>
                  {detail.btst_recommendation?.btst_conviction}/100
                </div>
              </div>
            </div>
          )}

          {strategyMode === "income" ? (
            <>
              {/* Risk Profile Visualizer */}
              <div className="glass-panel" style={{ padding: "16px" }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: "12px", fontWeight: "800", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
                  📊 Leveraged Yield Risk Profile (Return on Margin)
                </h3>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {/* Best Case */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                      <span style={{ fontWeight: "700" }}>🚀 Best Case (Stock rises to Strike)</span>
                      <span style={{ fontWeight: "800", color: bestColor }}>+{activeStrike.best_case.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: "8px", background: "rgba(0,0,0,0.05)", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, activeStrike.best_case * 2.5))}%`, background: bestColor }} />
                    </div>
                  </div>

                  {/* Expected Case */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                      <span style={{ fontWeight: "700" }}>⚖️ Expected Case (Prob-Weighted)</span>
                      <span style={{ fontWeight: "800", color: expectedColor }}>+{activeStrike.expected_return.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: "8px", background: "rgba(0,0,0,0.05)", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, activeStrike.expected_return * 5))}%`, background: expectedColor }} />
                    </div>
                  </div>

                  {/* Worst Case */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                      <span style={{ fontWeight: "700" }}>⚠️ Worst Case (2-Std Dev Leveraged Drop)</span>
                      <span style={{ fontWeight: "800", color: worstColor }}>{activeStrike.worst_case.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: "8px", background: "rgba(0,0,0,0.05)", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, Math.abs(activeStrike.worst_case) * 1.5))}%`, background: worstColor }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Position Sizing Calculator */}
              <div className="glass-panel" style={{ padding: "16px" }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: "12px", fontWeight: "800", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
                  📐 Position Sizing Engine
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-secondary)" }}>Available Allocation Capital:</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "12px", fontWeight: "700" }}>₹</span>
                      <input
                        type="number"
                        value={capitalInput}
                        onChange={(e) => setCapitalInput(Number(e.target.value))}
                        style={{
                          width: "100px",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          border: "1px solid var(--border-subtle)",
                          background: "var(--bg-card)",
                          fontWeight: "700",
                          fontSize: "12px"
                        }}
                      />
                    </div>
                  </div>

                  <input
                    type="range"
                    min="200000"
                    max="5000000"
                    step="50000"
                    value={capitalInput}
                    onChange={(e) => setCapitalInput(Number(e.target.value))}
                    style={{ width: "100%", cursor: "pointer" }}
                  />

                  <div className="three-columns-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr", gap: "10px", marginTop: "6px", borderTop: "1px solid var(--border-subtle)", paddingTop: "10px" }}>
                    <div>
                      <div style={{ fontSize: "9px", fontWeight: "800", color: "var(--color-text-muted)" }}>SUGGESTED SIZING</div>
                      <div style={{ fontSize: "14px", fontWeight: "800", color: "var(--accent-ml)" }}>{suggestedLots} Lots</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "9px", fontWeight: "800", color: "var(--color-text-muted)" }}>MARGIN REQUIRED</div>
                      <div style={{ fontSize: "14px", fontWeight: "800" }}>₹{totalMarginNeeded.toLocaleString("en-IN")}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "9px", fontWeight: "800", color: "var(--color-text-muted)" }}>CONTRACT LOT SIZE</div>
                      <div style={{ fontSize: "14px", fontWeight: "800" }}>{detail.lot_size} Units</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Option Strike Selector Chain */}
              <div className="glass-panel" style={{ padding: "16px" }}>
                <h3 style={{ margin: "0 0 10px 0", fontSize: "12px", fontWeight: "800", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
                  ⛓️ Option Chain Candidate Strike Optimizer
                </h3>
                <p style={{ margin: "0 0 10px 0", fontSize: "10px", color: "var(--color-text-muted)" }}>
                  Select any Call Strike below to dynamically override the strategy recommendations and recalculate risk.
                </p>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <th style={{ padding: "6px 8px", color: "var(--color-text-muted)" }}>Strike</th>
                      <th style={{ padding: "6px 8px", color: "var(--color-text-muted)" }}>Premium</th>
                      <th style={{ padding: "6px 8px", color: "var(--color-text-muted)", textAlign: "center" }}>POP</th>
                      <th style={{ padding: "6px 8px", color: "var(--color-text-muted)", textAlign: "center" }}>Yield</th>
                      <th style={{ padding: "6px 8px", color: "var(--color-text-muted)", textAlign: "center" }}>Expected Ret</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.candidates.map((c) => {
                      const isSelected = activeStrike.strike === c.strike;
                      return (
                        <tr
                          key={c.strike}
                          onClick={() => setSelectedStrike(c)}
                          style={{
                            borderBottom: "1px solid var(--border-subtle)",
                            background: isSelected ? "rgba(59, 130, 246, 0.06)" : "none",
                            cursor: "pointer",
                            fontWeight: isSelected ? "800" : "500"
                          }}
                          className="strike-row"
                        >
                          <td style={{ padding: "8px", color: isSelected ? "#3b82f6" : "var(--color-text-primary)" }}>{c.strike} CE</td>
                          <td style={{ padding: "8px" }}>₹{c.premium}</td>
                          <td style={{ padding: "8px", textAlign: "center", color: "#10b981" }}>{c.pop}%</td>
                          <td style={{ padding: "8px", textAlign: "center" }}>{c.yield.toFixed(2)}%</td>
                          <td style={{ padding: "8px", textAlign: "center", color: "#3b82f6" }}>{c.expected_return.toFixed(2)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              {/* 2-Day Swing Catalyst Checklist */}
              <div className="glass-panel" style={{ padding: "16px" }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: "12px", fontWeight: "800", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
                  🚀 2-Day Futures Swing Catalyst Checklist
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {detail.btst_recommendation?.explanations && detail.btst_recommendation.explanations.length > 0 ? (
                    detail.btst_recommendation.explanations.map((exp, idx) => (
                      <div key={idx} style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "11px" }}>
                        <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
                        <span style={{ color: "var(--color-text-secondary)" }}>{exp}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                      No major short-term catalysts detected. Consolidation expected.
                    </div>
                  )}
                </div>
              </div>

              {/* Short-Term Price Action Breakouts & Delivery Metrics */}
              <div className="glass-panel" style={{ padding: "16px" }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: "12px", fontWeight: "800", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
                  📊 Short-Term Price Action & Delivery Stats
                </h3>
                <div className="target-box-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div style={{ background: "rgba(0,0,0,0.015)", padding: "10px", borderRadius: "6px" }}>
                    <span style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>DELIVERY PERCENTAGE</span>
                    <div style={{ fontSize: "16px", fontWeight: "900", color: "var(--color-text-primary)", marginTop: "2px" }}>
                      {detail.btst_recommendation?.delivery_pct}%
                    </div>
                  </div>
                  
                  <div style={{ background: "rgba(0,0,0,0.015)", padding: "10px", borderRadius: "6px" }}>
                    <span style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>VOLUME SHOCK (20D AVG)</span>
                    <div style={{ fontSize: "16px", fontWeight: "900", color: "#3b82f6", marginTop: "2px" }}>
                      {detail.btst_recommendation?.vol_shock}x
                    </div>
                  </div>

                  <div style={{ background: "rgba(0,0,0,0.015)", padding: "10px", borderRadius: "6px" }}>
                    <span style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>FUTURES OI BUILD-UP</span>
                    <div style={{ fontSize: "16px", fontWeight: "900", color: detail.btst_recommendation?.oi_type.includes("Long") ? "#10b981" : "#f59e0b", marginTop: "2px" }}>
                      {detail.btst_recommendation?.oi_type}
                    </div>
                  </div>

                  <div style={{ background: "rgba(0,0,0,0.015)", padding: "10px", borderRadius: "6px" }}>
                    <span style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>BREAKOUT STATE</span>
                    <div style={{ fontSize: "14px", fontWeight: "900", color: "#8b5cf6", marginTop: "4px" }}>
                      {detail.btst_recommendation?.is_50d_high 
                        ? "50-Day High Breakout" 
                        : detail.btst_recommendation?.is_20d_high 
                          ? "20-Day High Breakout" 
                          : "Consolidating Range"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Position Sizing Calculator (Customized for Swing) */}
              <div className="glass-panel" style={{ padding: "16px" }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: "12px", fontWeight: "800", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
                  📐 Swing Position Sizing Engine
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-secondary)" }}>Available Allocation Capital:</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "12px", fontWeight: "700" }}>₹</span>
                      <input
                        type="number"
                        value={capitalInput}
                        onChange={(e) => setCapitalInput(Number(e.target.value))}
                        style={{
                          width: "100px",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          border: "1px solid var(--border-subtle)",
                          background: "var(--bg-card)",
                          fontWeight: "700",
                          fontSize: "12px"
                        }}
                      />
                    </div>
                  </div>

                  <input
                    type="range"
                    min="200000"
                    max="5000000"
                    step="50000"
                    value={capitalInput}
                    onChange={(e) => setCapitalInput(Number(e.target.value))}
                    style={{ width: "100%", cursor: "pointer" }}
                  />

                  <div className="three-columns-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr", gap: "10px", marginTop: "6px", borderTop: "1px solid var(--border-subtle)", paddingTop: "10px" }}>
                    <div>
                      <div style={{ fontSize: "9px", fontWeight: "800", color: "var(--color-text-muted)" }}>SUGGESTED SIZING</div>
                      <div style={{ fontSize: "14px", fontWeight: "800", color: "#10b981" }}>{suggestedLots} Lots</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "9px", fontWeight: "800", color: "var(--color-text-muted)" }}>MARGIN REQUIRED</div>
                      <div style={{ fontSize: "14px", fontWeight: "800" }}>₹{totalMarginNeeded.toLocaleString("en-IN")}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "9px", fontWeight: "800", color: "var(--color-text-muted)" }}>CONTRACT LOT SIZE</div>
                      <div style={{ fontSize: "14px", fontWeight: "800" }}>{detail.lot_size} Units</div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

        </div>

        {/* Right Column: Historical Charts & Agents */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          
          {/* Backtesting Module */}
          <div className="glass-panel" style={{ padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ margin: 0, fontSize: "12px", fontWeight: "800", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
                🧪 5-Year Backtest History Verification
              </h3>
              <span style={{ fontSize: "10px", background: "rgba(16, 185, 129, 0.1)", color: "#10b981", padding: "2px 6px", borderRadius: "4px", fontWeight: "800" }}>
                {detail.backtest.accuracy}% ACCURACY
              </span>
            </div>

            <div className="target-box-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div style={{ background: "rgba(0,0,0,0.015)", padding: "10px", borderRadius: "6px" }}>
                <span style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>TOTAL TRADES FOUND</span>
                <div style={{ fontSize: "16px", fontWeight: "900", marginTop: "2px" }}>{detail.backtest.total_trades} Times</div>
              </div>
              <div style={{ background: "rgba(0,0,0,0.015)", padding: "10px", borderRadius: "6px" }}>
                <span style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>SUCCESSFUL SETUP</span>
                <div style={{ fontSize: "16px", fontWeight: "900", color: "#10b981", marginTop: "2px" }}>{detail.backtest.successful_trades} Times</div>
              </div>
              <div style={{ background: "rgba(0,0,0,0.015)", padding: "10px", borderRadius: "6px" }}>
                <span style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>PROFIT FACTOR</span>
                <div style={{ fontSize: "16px", fontWeight: "900", color: "#3b82f6", marginTop: "2px" }}>{detail.backtest.profit_factor}x</div>
              </div>
              <div style={{ background: "rgba(0,0,0,0.015)", padding: "10px", borderRadius: "6px" }}>
                <span style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "700" }}>MAX HISTORICAL DD</span>
                <div style={{ fontSize: "16px", fontWeight: "900", color: "#ef4444", marginTop: "2px" }}>-{detail.backtest.max_drawdown}%</div>
              </div>
            </div>

            <button
              onClick={() => setShowBreakdown(!showBreakdown)}
              style={{
                width: "100%",
                marginTop: "12px",
                padding: "8px",
                background: "rgba(59, 130, 246, 0.1)",
                color: "#3b82f6",
                border: "none",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: "800",
                cursor: "pointer",
                textAlign: "center",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(59, 130, 246, 0.18)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "rgba(59, 130, 246, 0.1)"}
            >
              {showBreakdown ? "Hide Detailed Trade Log ▲" : "View Technical Indicator Trade Log (122 Trades) ▼"}
            </button>

            {showBreakdown && detail.backtest.trades && (
              <div style={{ marginTop: "12px", borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "9px", fontWeight: "800", color: "var(--color-text-muted)" }}>TRADE HISTORY LOG</span>
                  <span style={{ fontSize: "9px", color: "var(--color-text-secondary)" }}>Showing {detail.backtest.trades.length} entries</span>
                </div>
                
                <div style={{ maxHeight: "250px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px", paddingRight: "4px" }}>
                  {detail.backtest.trades.map((t) => (
                    <div key={t.trade_id} style={{ background: "rgba(0,0,0,0.02)", padding: "8px", borderRadius: "6px", fontSize: "10px", border: "1px solid var(--border-subtle)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "700", marginBottom: "4px" }}>
                        <span style={{ color: "var(--color-text-secondary)" }}>
                          #{t.trade_id} | {t.entry_date} to {t.exit_date}
                        </span>
                        <span style={{ color: t.status === "PROFIT" ? "#10b981" : "#ef4444" }}>
                          {t.status} ({t.pnl_pct > 0 ? "+" : ""}{t.pnl_pct}%)
                        </span>
                      </div>
                      
                      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)", marginBottom: "4px" }}>
                        <span>Entry Spot: ₹{t.entry_price} → Exit: ₹{t.exit_price}</span>
                        <span style={{ fontWeight: "700", color: t.status === "PROFIT" ? "#10b981" : "#ef4444" }}>
                          ₹{t.pnl_amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "2px" }}>
                        {t.signals.map((sig, idx) => (
                          <span key={idx} style={{ fontSize: "8px", background: "rgba(59, 130, 246, 0.08)", color: "#3b82f6", padding: "1px 4px", borderRadius: "3px", fontWeight: "600" }}>
                            {sig}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Spot Price and indicators chart */}
          <div className="glass-panel" style={{ padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <h3 style={{ margin: 0, fontSize: "12px", fontWeight: "800", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
                📈 Underlying Future Price & Options PCR
              </h3>
              
              <div style={{ display: "flex", gap: "4px" }}>
                {["15m", "1h", "1d"].map((interval) => (
                  <button
                    key={interval}
                    onClick={() => onIntervalChange(interval)}
                    style={{
                      padding: "3px 8px",
                      background: chartInterval === interval ? "var(--accent-ml)" : "none",
                      color: chartInterval === interval ? "#ffffff" : "var(--color-text-secondary)",
                      border: "1px solid " + (chartInterval === interval ? "var(--accent-ml)" : "var(--border-subtle)"),
                      borderRadius: "4px",
                      fontSize: "10px",
                      fontWeight: "700",
                      cursor: "pointer"
                    }}
                  >
                    {interval}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ height: "240px" }}>
              <StockChart chartData={chartData} ticker={detail.ticker} interval={chartInterval} onIntervalChange={onIntervalChange} />
            </div>
          </div>

          {/* Agent Consensus Grid */}
          <div className="glass-panel" style={{ padding: "16px" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "12px", fontWeight: "800", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
              🤖 7-Agent Weight Matrix Consensus Details
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { id: "market_regime", label: "🛡️ Market Regime Agent", weight: "20%" },
                { id: "futures_strength", label: "📈 Futures Strength Agent", weight: "20%" },
                { id: "oi_intelligence", label: "🧠 OI Intelligence Agent", weight: "25%" },
                { id: "premium_harvest", label: "💰 Premium Harvest Agent", weight: "20%" },
                { id: "smart_money", label: "💼 Smart Money Agent", weight: "10%" },
                { id: "event_risk", label: "⚡ Event Risk Agent", weight: "5%", isPenalty: true },
                { id: "deep_candlestick", label: "🕯️ Deep Technicals & Candles", weight: "Accuracy Boost/Penalty", isAdjustment: true }
              ].map((ag) => {
                const res = (detail.agents as any)[ag.id];
                if (!res) return null;
                const isPenalty = ag.isPenalty;
                const isAdjustment = ag.isAdjustment;
                const valColor = isPenalty 
                  ? (res.penalty > 0 ? "#ef4444" : "var(--color-text-muted)")
                  : isAdjustment
                    ? (res.adjustment > 0 ? "#10b981" : res.adjustment < 0 ? "#ef4444" : "var(--color-text-muted)")
                    : (res.score >= 80 ? "#10b981" : res.score >= 50 ? "#3b82f6" : "#f59e0b");
                
                return (
                  <div key={ag.id} style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid rgba(0,0,0,0.03)", paddingBottom: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "700" }}>
                      <span>{ag.label} <span style={{ color: "var(--color-text-muted)", fontSize: "9px" }}>({ag.weight})</span></span>
                      <span style={{ color: valColor }}>
                        {isPenalty 
                          ? (res.penalty > 0 ? `-${res.penalty} Penalty` : "0 Penalty") 
                          : isAdjustment
                            ? (res.adjustment > 0 ? `+${res.adjustment} Boost` : res.adjustment < 0 ? `${res.adjustment} Penalty` : "0 Adjustment")
                            : `${res.score}/100`}
                      </span>
                    </div>
                    <span style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                      {res.details}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Multi-Agent Parameter Strength Summary Chart */}
          <div className="glass-panel" style={{ padding: "16px" }}>
            <h3 style={{ margin: "0 0 14px 0", fontSize: "12px", fontWeight: "800", color: "var(--color-text-secondary)", textTransform: "uppercase", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>📊 Multi-Agent Strength Summary Chart</span>
              <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>Selected: {detail.ticker}</span>
            </h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                { name: "Market Regime", score: detail.agents.market_regime.score, max: 100, color: "linear-gradient(90deg, #3b82f6, #60a5fa)", icon: "🛡️", weight: "20%" },
                { name: "Futures Strength", score: detail.agents.futures_strength.score, max: 100, color: "linear-gradient(90deg, #10b981, #34d399)", icon: "📈", weight: "20%" },
                { name: "OI Intelligence", score: detail.agents.oi_intelligence.score, max: 100, color: "linear-gradient(90deg, #8b5cf6, #a78bfa)", icon: "🧠", weight: "25%" },
                { name: "Premium Harvest", score: detail.agents.premium_harvest.score, max: 100, color: "linear-gradient(90deg, #f59e0b, #fbbf24)", icon: "💰", weight: "20%" },
                { name: "Smart Money", score: detail.agents.smart_money.score, max: 100, color: "linear-gradient(90deg, #14b8a6, #2dd4bf)", icon: "💼", weight: "10%" },
                { name: "Event Risk Penalty", score: detail.agents.event_risk.penalty ?? 0, max: 100, color: "linear-gradient(90deg, #ef4444, #f87171)", icon: "⚡", weight: "5%", isPenalty: true }
              ].map((item) => (
                <div key={item.name} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", fontWeight: "700" }}>
                    <span style={{ color: "var(--color-text-primary)" }}>
                      {item.icon} {item.name} <span style={{ color: "var(--color-text-muted)", fontSize: "9px" }}>({item.weight})</span>
                    </span>
                    <span style={{ color: item.isPenalty ? (item.score > 0 ? "#ef4444" : "var(--color-text-muted)") : "var(--color-text-secondary)" }}>
                      {item.isPenalty ? (item.score > 0 ? `-${item.score} Penalty` : "0 Penalty") : `${item.score}/100`}
                    </span>
                  </div>
                  <div style={{ height: "10px", width: "100%", background: "rgba(0,0,0,0.05)", borderRadius: "5px", overflow: "hidden", position: "relative" }}>
                    <div 
                      style={{ 
                        height: "100%", 
                        width: `${item.score}%`, 
                        background: item.color, 
                        borderRadius: "5px",
                        transition: "width 0.4s ease-out" 
                      }} 
                    />
                  </div>
                </div>
              ))}
              
              {/* Special row for Bidirectional Candlestick Adjustment */}
              {detail.agents.deep_candlestick && (() => {
                const adj = detail.agents.deep_candlestick.adjustment ?? 0;
                let leftWidth = 0;
                let rightWidth = 0;
                if (adj < 0) {
                  leftWidth = Math.min(50, (Math.abs(adj) / 35) * 50);
                } else if (adj > 0) {
                  rightWidth = Math.min(50, (adj / 25) * 50);
                }
                
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", fontWeight: "700" }}>
                      <span style={{ color: "var(--color-text-primary)" }}>
                        🕯️ Last Day Candle & Crossover <span style={{ color: "var(--color-text-muted)", fontSize: "9px" }}>(Adjustment)</span>
                      </span>
                      <span style={{ color: adj > 0 ? "#10b981" : adj < 0 ? "#ef4444" : "var(--color-text-muted)" }}>
                        {adj > 0 ? `+${adj} Boost` : adj < 0 ? `${adj} Penalty` : "0 Adjustment"}
                      </span>
                    </div>
                    
                    <div style={{ height: "10px", width: "100%", background: "rgba(0,0,0,0.05)", borderRadius: "5px", position: "relative", display: "flex", overflow: "hidden" }}>
                      {/* Left half */}
                      <div style={{ width: "50%", height: "100%", display: "flex", justifyContent: "flex-end" }}>
                        {leftWidth > 0 && (
                          <div 
                            style={{ 
                              height: "100%", 
                              width: `${leftWidth}%`, 
                              background: "linear-gradient(90deg, #f43f5e, #fda4af)"
                            }} 
                          />
                        )}
                      </div>
                      
                      {/* Center Divider Line */}
                      <div style={{ position: "absolute", left: "50%", top: 0, width: "1.5px", height: "100%", background: "var(--border-subtle)", zIndex: 2 }} />
                      
                      {/* Right half */}
                      <div style={{ width: "50%", height: "100%", display: "flex", justifyContent: "flex-start" }}>
                        {rightWidth > 0 && (
                          <div 
                            style={{ 
                              height: "100%", 
                              width: `${rightWidth}%`, 
                              background: "linear-gradient(90deg, #10b981, #6ee7b7)"
                            }} 
                          />
                        )}
                      </div>
                    </div>
                    
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8px", color: "var(--color-text-muted)", marginTop: "1px", padding: "0 2px" }}>
                      <span>Max Penalty (-35)</span>
                      <span>Neutral (0)</span>
                      <span>Max Boost (+25)</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

        </div>

      </div>

      {/* New Lower Grid for Sector Sentiment, Advanced Technicals, Smart Money & Analyst Consensus */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        
        {/* Panel A: Advanced Technical Indicators & Structural Zones */}
        <div className="glass-panel" style={{ padding: "16px" }}>
          <h3 style={{ margin: "0 0 14px 0", fontSize: "12px", fontWeight: "800", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
            📊 Advanced Technicals & Market Structure
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            
            {/* Technical Sub-Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div style={{ background: "rgba(0,0,0,0.015)", padding: "10px", borderRadius: "6px" }}>
                <span style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "800" }}>RSI (14) MOMENTUM</span>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "2px" }}>
                  <div style={{ fontSize: "18px", fontWeight: "900", color: rsiVal >= 70 ? "#ef4444" : rsiVal <= 30 ? "#10b981" : "#3b82f6" }}>
                    {rsiVal.toFixed(1)}
                  </div>
                  <span style={{ fontSize: "9px", fontWeight: "700", color: "var(--color-text-secondary)" }}>
                    {rsiVal >= 70 ? "OVERBOUGHT" : rsiVal <= 30 ? "OVERSOLD" : "EXPANSION"}
                  </span>
                </div>
                {/* Micro RSI Bar */}
                <div style={{ height: "4px", background: "rgba(0,0,0,0.05)", borderRadius: "2px", overflow: "hidden", marginTop: "6px" }}>
                  <div style={{ height: "100%", width: `${rsiVal}%`, background: rsiVal >= 70 ? "#ef4444" : rsiVal <= 30 ? "#10b981" : "#3b82f6" }} />
                </div>
              </div>

              <div style={{ background: "rgba(0,0,0,0.015)", padding: "10px", borderRadius: "6px" }}>
                <span style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "800" }}>ADX TREND STRENGTH</span>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "2px" }}>
                  <div style={{ fontSize: "18px", fontWeight: "900", color: adxVal >= 25 ? "#10b981" : "var(--color-text-muted)" }}>
                    {adxVal.toFixed(1)}
                  </div>
                  <span style={{ fontSize: "9px", fontWeight: "700", color: "var(--color-text-secondary)" }}>
                    {adxVal >= 25 ? "STRONG TREND" : "CONSOLIDATION"}
                  </span>
                </div>
                {/* Micro ADX Bar */}
                <div style={{ height: "4px", background: "rgba(0,0,0,0.05)", borderRadius: "2px", overflow: "hidden", marginTop: "6px" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, adxVal * 2.0)}%`, background: adxVal >= 25 ? "#10b981" : "var(--color-text-muted)" }} />
                </div>
              </div>
            </div>

            {/* MACD Crossover */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.015)", padding: "10px", borderRadius: "6px" }}>
              <div>
                <span style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "800" }}>MACD CROSSOVER</span>
                <div style={{ fontSize: "11px", fontWeight: "700", marginTop: "2px" }}>
                  Line: <span style={{ color: "#3b82f6" }}>{macdVal.toFixed(2)}</span> / Signal: <span style={{ color: "#f59e0b" }}>{macdSig.toFixed(2)}</span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "14px", fontWeight: "900", color: macdHist >= 0 ? "#10b981" : "#ef4444" }}>
                  {macdHist >= 0 ? "▲ BULLISH" : "▼ BEARISH"}
                </span>
                <div style={{ fontSize: "8px", color: "var(--color-text-muted)" }}>Hist: {macdHist.toFixed(2)}</div>
              </div>
            </div>

            {/* Timeframe Alignment Grid */}
            <div>
              <span style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "800" }}>MULTITIMEFRAME ALIGNMENT</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "4px" }}>
                {[
                  { label: "Daily EMA50", val: dailyTrend },
                  { label: "Weekly Structure", val: weeklyTrend },
                  { label: "Monthly Structure", val: monthlyTrend }
                ].map((tf, i) => (
                  <div key={i} style={{ background: "rgba(0,0,0,0.01)", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "6px", textAlign: "center" }}>
                    <div style={{ fontSize: "8px", color: "var(--color-text-muted)", fontWeight: "700" }}>{tf.label}</div>
                    <div style={{ fontSize: "11px", fontWeight: "900", color: tf.val === "Bullish" ? "#10b981" : tf.val === "Bearish" ? "#ef4444" : "var(--color-text-secondary)" }}>
                      {tf.val.toUpperCase()}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Support & Resistance supply/demand zones */}
            <div style={{ background: "rgba(0,0,0,0.015)", padding: "10px", borderRadius: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "800" }}>SUPPLY & DEMAND STRUCTURAL ZONES</span>
                <span style={{ fontSize: "9px", fontWeight: "800", color: zoneSignal === "NEAR_DEMAND_ZONE" ? "#10b981" : zoneSignal === "NEAR_SUPPLY_ZONE" ? "#ef4444" : "#3b82f6" }}>
                  {zoneSignal.replace("_", " ")}
                </span>
              </div>
              
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", fontWeight: "700", color: "var(--color-text-secondary)" }}>
                <span>Demand: ₹{supportZone.toLocaleString("en-IN")}</span>
                <span>Supply: ₹{resistanceZone.toLocaleString("en-IN")}</span>
              </div>
              
              {/* Range representation bar */}
              <div style={{ position: "relative", height: "8px", background: "rgba(0,0,0,0.05)", borderRadius: "4px", margin: "8px 0 4px 0" }}>
                {/* Current price marker */}
                {(() => {
                  const range = resistanceZone - supportZone || 1;
                  const pct = Math.min(100, Math.max(0, ((detail.spot_price - supportZone) / range) * 100));
                  return (
                    <div 
                      style={{ 
                        position: "absolute", 
                        left: `${pct}%`, 
                        top: "-3px", 
                        width: "14px", 
                        height: "14px", 
                        borderRadius: "50%", 
                        background: "#3b82f6", 
                        border: "2px solid #ffffff",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
                        transform: "translateX(-50%)" 
                      }} 
                    />
                  );
                })()}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                <span>+{pctFromSupport.toFixed(1)}% above demand floor</span>
                <span>-{pctFromResistance.toFixed(1)}% to supply roof</span>
              </div>

              <div style={{ fontSize: "9px", borderTop: "1px solid rgba(0,0,0,0.04)", paddingTop: "6px", marginTop: "6px", color: "var(--color-text-secondary)" }}>
                📍 Volume Node Accumulation Hub: <strong>₹{volumeNode.toLocaleString("en-IN")}</strong>
              </div>
            </div>

          </div>
        </div>

        {/* Panel B: Sector Sentiment & Institutional flows */}
        <div className="glass-panel" style={{ padding: "16px" }}>
          <h3 style={{ margin: "0 0 14px 0", fontSize: "12px", fontWeight: "800", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
            💼 Sector Sentiment & Smart Money flows
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            
            {/* Sector Sentiment & Alpha */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div style={{ background: "rgba(0,0,0,0.015)", padding: "10px", borderRadius: "6px" }}>
                <span style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "800" }}>SECTOR: {sectorName.toUpperCase()}</span>
                <div style={{ fontSize: "18px", fontWeight: "900", color: sectorScore >= 75 ? "#10b981" : sectorScore >= 45 ? "#3b82f6" : "#ef4444", marginTop: "2px" }}>
                  {sectorScore}/100
                </div>
                <div style={{ fontSize: "8px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                  Alpha: <span style={{ color: sectorAlpha >= 0 ? "#10b981" : "#ef4444", fontWeight: "700" }}>
                    {sectorAlpha >= 0 ? "+" : ""}{sectorAlpha.toFixed(1)}% vs Nifty (20d)
                  </span>
                </div>
              </div>

              <div style={{ background: "rgba(0,0,0,0.015)", padding: "10px", borderRadius: "6px" }}>
                <span style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "800" }}>NIFTY 50 BREADTH</span>
                <div style={{ fontSize: "18px", fontWeight: "900", color: breadthScore >= 60 ? "#10b981" : breadthScore >= 40 ? "#f59e0b" : "#ef4444", marginTop: "2px" }}>
                  {breadthScore}/100
                </div>
                <div style={{ fontSize: "8px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                  Adv/Dec Ratio: <strong>{((advances)/(declines || 1)).toFixed(2)}x</strong> ({advances} Up / {declines} Down)
                </div>
              </div>
            </div>

            {/* Smart Money Metrics */}
            <div style={{ background: "rgba(0,0,0,0.015)", padding: "10px", borderRadius: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "800" }}>SMART MONEY SCORE</span>
                <span style={{ fontSize: "11px", fontWeight: "800", color: "#3b82f6" }}>{smScore}/100</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "10px" }}>
                <div>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "9px" }}>MF Accumulation (1m):</span>
                  <div style={{ fontWeight: "700", color: smMfChange >= 0 ? "#10b981" : "#ef4444" }}>
                    {smMfChange >= 0 ? "+" : ""}{(smMfChange * 100).toFixed(2)}%
                  </div>
                </div>
                <div>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "9px" }}>Insider Net Events:</span>
                  <div style={{ fontWeight: "700", color: smInsiderNet >= 0 ? "#10b981" : "#ef4444" }}>
                    {smInsiderNet >= 0 ? "+" : ""}{smInsiderNet} Events
                  </div>
                </div>
                <div>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "9px" }}>Promoter Pledging:</span>
                  <div style={{ fontWeight: "700" }}>
                    {smPledging.toFixed(1)}% <span style={{ fontSize: "8px", color: smPledgingChange <= 0 ? "#10b981" : "#ef4444" }}>
                      ({smPledgingChange <= 0 ? "" : "+"}{smPledgingChange.toFixed(1)}% MoM)
                    </span>
                  </div>
                </div>
                <div>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "9px" }}>Block Deals Volume (5d):</span>
                  <div style={{ fontWeight: "700" }}>{smBlocks.toFixed(1)}M Units</div>
                </div>
              </div>

              {/* Signals list */}
              {smSignals.length > 0 && (
                <div style={{ marginTop: "8px", borderTop: "1px solid rgba(0,0,0,0.04)", paddingTop: "6px" }}>
                  <div style={{ fontSize: "8px", color: "var(--color-text-muted)", fontWeight: "800", textTransform: "uppercase" }}>Flow Alarms</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "2px" }}>
                    {smSignals.slice(0, 2).map((sig: string, i: number) => (
                      <div key={i} style={{ fontSize: "9px", color: "var(--color-text-secondary)" }}>
                        ⚡ {sig}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Analyst Consensus Rating */}
            <div style={{ background: "rgba(0,0,0,0.015)", padding: "10px", borderRadius: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
                <span style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: "800" }}>ANALYST CONSENSUS</span>
                <span style={{ fontSize: "11px", fontWeight: "900", color: analystConsensus === "BULLISH" ? "#10b981" : analystConsensus === "BEARISH" ? "#ef4444" : "#f59e0b" }}>
                  {analystConsensus} ({analystScore.toFixed(1)}/100)
                </span>
              </div>

              {/* Stacked Consensus Bar */}
              <div style={{ display: "flex", height: "8px", borderRadius: "4px", overflow: "hidden", margin: "6px 0" }}>
                <div style={{ width: `${analystBuyPct}%`, background: "#10b981" }} title={`Buy: ${analystBuyPct}%`} />
                <div style={{ width: `${analystHoldPct}%`, background: "#f59e0b" }} title={`Hold: ${analystHoldPct}%`} />
                <div style={{ width: `${analystSellPct}%`, background: "#ef4444" }} title={`Sell: ${analystSellPct}%`} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8px", color: "var(--color-text-muted)" }}>
                <span>Buy: {analystBuyPct}%</span>
                <span>Hold: {analystHoldPct}%</span>
                <span>Sell: {analystSellPct}%</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(0,0,0,0.04)", paddingTop: "6px", marginTop: "6px", fontSize: "9px" }}>
                <div>
                  Target Price Trend: <strong style={{ color: analystTpTrend === "RISING" ? "#10b981" : "#ef4444" }}>{analystTpTrend}</strong>
                </div>
                <div>
                  Earnings Estimate Trend: <strong style={{ color: analystEstTrend === "RISING" ? "#10b981" : "#ef4444" }}>{analystEstTrend}</strong>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>

      <style>{`
        .strike-row:hover {
          background: rgba(0,0,0,0.015) !important;
        }
      `}</style>

    </div>
  );
}
