import React, { useState, useMemo, useRef, useEffect } from "react";
import { StockOverview } from "../utils/api";

interface ProbabilityHeatmapProps {
  stocks: StockOverview[];
  onSelectStock: (ticker: string) => void;
  onSwitchTab?: (tab?: string) => void;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TreemapItem<T> {
  id: string;
  weight: number;
  data: T;
}

interface LayoutNode<T> {
  id: string;
  rect: Rect;
  data: T;
}

// Squarified Treemap Layout Algorithm (Bruls, Huizing, van Wijk)
function squarify<T>(items: TreemapItem<T>[], rect: Rect): LayoutNode<T>[] {
  if (items.length === 0) return [];
  const validItems = items.filter((item) => item.weight > 0);
  if (validItems.length === 0) return [];

  const sorted = [...validItems].sort((a, b) => b.weight - a.weight);
  const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);
  const totalArea = rect.w * rect.h;
  const scale = totalArea / (totalWeight || 1);
  const areas = sorted.map((item) => ({ ...item, area: item.weight * scale }));

  const layout: LayoutNode<T>[] = [];
  let currentRect = { ...rect };
  let currentIndex = 0;

  while (currentIndex < areas.length) {
    const remaining = areas.slice(currentIndex);
    const side = Math.min(currentRect.w, currentRect.h);

    let bestRow = [remaining[0]];
    let bestWorstRatio = getWorstRatio(bestRow, side);
    let i = 1;

    for (; i < remaining.length; i++) {
      const candidateRow = [...bestRow, remaining[i]];
      const candidateRatio = getWorstRatio(candidateRow, side);
      if (candidateRatio <= bestWorstRatio) {
        bestRow = candidateRow;
        bestWorstRatio = candidateRatio;
      } else {
        break;
      }
    }

    const rowArea = bestRow.reduce((sum, item) => sum + item.area, 0);
    const isVertical = currentRect.w > currentRect.h;
    const dx = isVertical ? rowArea / side : currentRect.w;
    const dy = isVertical ? currentRect.h : rowArea / side;

    let currentOffset = isVertical ? currentRect.y : currentRect.x;

    for (const item of bestRow) {
      const nodeLength = item.area / (isVertical ? dx : dy);
      const nodeRect: Rect = isVertical
        ? { x: currentRect.x, y: currentOffset, w: dx, h: nodeLength }
        : { x: currentOffset, y: currentRect.y, w: nodeLength, h: dy };

      layout.push({
        id: item.id,
        rect: nodeRect,
        data: item.data
      });

      currentOffset += nodeLength;
    }

    if (isVertical) {
      currentRect = {
        x: currentRect.x + dx,
        y: currentRect.y,
        w: Math.max(0, currentRect.w - dx),
        h: currentRect.h
      };
    } else {
      currentRect = {
        x: currentRect.x,
        y: currentRect.y + dy,
        w: currentRect.w,
        h: Math.max(0, currentRect.h - dy)
      };
    }

    currentIndex += bestRow.length;
  }

  return layout;
}

function getWorstRatio(row: { area: number }[], side: number): number {
  if (row.length === 0) return Infinity;
  const rowArea = row.reduce((sum, item) => sum + item.area, 0);
  const minArea = Math.min(...row.map((item) => item.area));
  const maxArea = Math.max(...row.map((item) => item.area));
  const sideSq = side * side;
  const rowAreaSq = rowArea * rowArea;

  return Math.max(
    (sideSq * maxArea) / rowAreaSq,
    rowAreaSq / (sideSq * minArea)
  );
}

export default function ProbabilityHeatmap({
  stocks,
  onSelectStock,
  onSwitchTab
}: ProbabilityHeatmapProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSector, setSelectedSector] = useState("All");
  const [sizeByWeight, setSizeByWeight] = useState(true);
  const [isDarkTheme, setIsDarkTheme] = useState(true); // Default to dark theme for that Finviz pop!
  const [hoveredStock, setHoveredStock] = useState<StockOverview | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1000, height: 600 });

  // Handle ResizeObserver to make treemap dynamic and responsive
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({
        width: width || 1000,
        height: height || 600
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // List of unique sectors
  const sectors = useMemo(() => {
    const s = new Set(stocks.map((x) => x.sector));
    return ["All", ...Array.from(s)].filter(Boolean);
  }, [stocks]);

  // Filtered stocks based on sector
  const filteredStocks = useMemo(() => {
    return stocks.filter((stock) => {
      const matchesSector = selectedSector === "All" || stock.sector === selectedSector;
      return matchesSector;
    });
  }, [stocks, selectedSector]);

  // Group stocks by sector and calculate total weight
  const sectorsData = useMemo(() => {
    const activeSectors = selectedSector === "All"
      ? Array.from(new Set(stocks.map((s) => s.sector)))
      : [selectedSector];

    return activeSectors
      .map((sector) => {
        const sectorStocks = filteredStocks.filter((s) => s.sector === sector);
        const totalWeight = sectorStocks.reduce(
          (sum, s) => sum + (sizeByWeight ? (s.weight || 1.0) : 1.0),
          0
        );
        return { sector, stocks: sectorStocks, totalWeight };
      })
      .filter((sd) => sd.stocks.length > 0)
      .sort((a, b) => b.totalWeight - a.totalWeight);
  }, [filteredStocks, stocks, selectedSector, sizeByWeight]);

  // Hierarchical Layout Calculation
  const treemapLayout = useMemo(() => {
    if (dimensions.width <= 0 || dimensions.height <= 0) return [];

    const sectorItems = sectorsData.map((sd) => ({
      id: sd.sector,
      weight: sd.totalWeight,
      data: sd
    }));

    // Layout the sectors
    const sectorLayout = squarify(sectorItems, {
      x: 0,
      y: 0,
      w: dimensions.width,
      h: dimensions.height
    });

    const gap = 4; // gap between sector cards

    return sectorLayout.map((sectorNode) => {
      const r = sectorNode.rect;
      // Subtract gaps
      const sectorX = r.x + gap / 2;
      const sectorY = r.y + gap / 2;
      const sectorW = Math.max(0, r.w - gap);
      const sectorH = Math.max(0, r.h - gap);

      const titleHeight = 22;

      // Sector content area relative to the sector itself
      const contentX = 2;
      const contentY = titleHeight;
      const contentW = Math.max(0, sectorW - 4);
      const contentH = Math.max(0, sectorH - titleHeight - 2);

      let stocksLayout: LayoutNode<StockOverview>[] = [];
      if (contentW > 5 && contentH > 5) {
        const stockItems = sectorNode.data.stocks.map((s) => ({
          id: s.ticker,
          weight: sizeByWeight ? (s.weight || 1.0) : 1.0,
          data: s
        }));
        // Layout the stocks inside the sector content box
        stocksLayout = squarify(stockItems, {
          x: contentX,
          y: contentY,
          w: contentW,
          h: contentH
        });
      }

      return {
        sector: sectorNode.id,
        rect: { x: sectorX, y: sectorY, w: sectorW, h: sectorH },
        stocksLayout
      };
    });
  }, [sectorsData, dimensions, sizeByWeight]);

  // Handle cell mouse movement for tooltips
  const handleMouseMove = (e: React.MouseEvent) => {
    setTooltipPos({
      x: e.clientX + 15,
      y: e.clientY + 15
    });
  };

  // Color helper based on 1-week probability to go up (centred around 33.3%)
  const getCellBackgroundAndBorder = (probUp: number, isHighlighted: boolean) => {
    let background = "linear-gradient(135deg, #1f2937 0%, #111827 100%)"; // neutral fallback
    let borderColor = isDarkTheme ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)";
    let shadow = "none";
    let textColor = "#ffffff";

    if (probUp >= 45) {
      background = "linear-gradient(135deg, #059669 0%, #10b981 100%)"; // Bright Emerald Green
    } else if (probUp >= 38) {
      background = "linear-gradient(135deg, #047857 0%, #065f46 100%)"; // Forest Green
    } else if (probUp >= 34) {
      background = "linear-gradient(135deg, #064e3b 0%, #093c2c 100%)"; // Darker Forest Green
    } else if (probUp >= 31) {
      background = isDarkTheme
        ? "linear-gradient(135deg, #2d3748 0%, #1a202c 100%)"
        : "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)"; // Neutral Slate Gray
      textColor = isDarkTheme ? "#e2e8f0" : "var(--color-text-primary)";
    } else if (probUp >= 28) {
      background = "linear-gradient(135deg, #451a03 0%, #311104 100%)"; // Dark Burgundy Red
    } else if (probUp >= 22) {
      background = "linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%)"; // Medium Crimson Red
    } else {
      background = "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)"; // Deep Bright Red
    }

    if (isHighlighted) {
      borderColor = "#818cf8"; // Bright indigo indicator
      shadow = "0 0 10px rgba(129, 140, 248, 0.6)";
    }

    return { background, borderColor, shadow, textColor };
  };

  const handleCellClick = (ticker: string) => {
    onSelectStock(ticker);
    if (onSwitchTab) {
      onSwitchTab("research"); // Switches to AI Research page
    }
  };

  const themeStyles = {
    bg: isDarkTheme ? "#0a0f1d" : "#f1f5f9",
    border: isDarkTheme ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)",
    textColor: isDarkTheme ? "#e2e8f0" : "var(--color-text-primary)",
    headerBg: isDarkTheme ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
    sectorText: isDarkTheme ? "#94a3b8" : "var(--color-text-secondary)"
  };

  const isSearchActive = searchTerm.trim().length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%", minWidth: 0, animation: "fadeIn 0.3s ease-out" }}>
      
      {/* Treemap Toolbar Controls */}
      <div className="glass-panel" style={{ padding: "clamp(10px, 3.5vw, 16px)", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
        
        {/* Left Side Controls */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", width: "100%", minWidth: 0 }}>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Sector Filter</span>
            <select 
              value={selectedSector} 
              onChange={(e) => setSelectedSector(e.target.value)}
              style={{ fontSize: "13px", padding: "6px 12px", background: "var(--bg-card)", borderRadius: "6px", maxWidth: "100%" }}
            >
              {sectors.map((sec) => (
                <option key={sec} value={sec}>{sec}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Weight Sizing</span>
            <div style={{ display: "flex", background: "var(--bg-button-unselected)", padding: "3px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
              <button 
                onClick={() => setSizeByWeight(true)}
                style={{
                  fontSize: "12px",
                  padding: "4px 10px",
                  border: "none",
                  borderRadius: "5px",
                  background: sizeByWeight ? "var(--bg-card)" : "transparent",
                  color: sizeByWeight ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  boxShadow: sizeByWeight ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  cursor: "pointer"
                }}
              >
                Index Weight
              </button>
              <button 
                onClick={() => setSizeByWeight(false)}
                style={{
                  fontSize: "12px",
                  padding: "4px 10px",
                  border: "none",
                  borderRadius: "5px",
                  background: !sizeByWeight ? "var(--bg-card)" : "transparent",
                  color: !sizeByWeight ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  boxShadow: !sizeByWeight ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  cursor: "pointer"
                }}
              >
                Equal Size
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 130px", minWidth: 0 }}>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Search Stocks</span>
            <input 
              type="text" 
              placeholder="e.g. RELIANCE, TCS..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ fontSize: "13px", padding: "6px 12px", width: "100%", maxWidth: "170px", minWidth: 0 }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Theme</span>
            <button
              onClick={() => setIsDarkTheme(!isDarkTheme)}
              style={{
                fontSize: "12px",
                padding: "6px 12px",
                borderRadius: "6px",
                background: "var(--bg-card)",
                cursor: "pointer",
                fontWeight: "600",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              {isDarkTheme ? "🌙 Dark Mode" : "☀️ Light Mode"}
            </button>
          </div>

        </div>

        {/* Right Side Colors Legend */}
        <div className="heatmap-legend">
          <span style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>1-Week Prob to Go Up</span>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "10px", color: "var(--color-sell)", fontWeight: "700" }}>Low (&lt;22%)</span>
            <div style={{ display: "flex", height: "12px", width: "clamp(90px, 28vw, 160px)", borderRadius: "3px", background: "linear-gradient(90deg, #dc2626 0%, #991b1b 20%, #2d3748 50%, #047857 80%, #10b981 100%)", border: "1px solid var(--border-subtle)" }}></div>
            <span style={{ fontSize: "10px", color: "var(--color-buy)", fontWeight: "700" }}>High (&gt;45%)</span>
          </div>
        </div>

      </div>

      {/* Main Treemap Canvas */}
      <div 
        ref={containerRef}
        className="treemap-canvas-container"
        style={{
          background: themeStyles.bg,
          border: `1px solid ${themeStyles.border}`,
          boxShadow: isDarkTheme ? "0 8px 32px rgba(0,0,0,0.3)" : "0 4px 20px rgba(0,0,0,0.04)"
        }}
      >
        {treemapLayout.length === 0 ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", height: "100%", color: themeStyles.textColor, fontSize: "14px" }}>
            Computing dynamic market hierarchy weights...
          </div>
        ) : (
          treemapLayout.map((sectorNode) => (
            <div
              key={sectorNode.sector}
              style={{
                position: "absolute",
                left: `${sectorNode.rect.x}px`,
                top: `${sectorNode.rect.y}px`,
                width: `${sectorNode.rect.w}px`,
                height: `${sectorNode.rect.h}px`,
                border: `1px solid ${themeStyles.border}`,
                backgroundColor: themeStyles.headerBg,
                boxSizing: "border-box",
                overflow: "hidden"
              }}
            >
              {/* Sector Title Header */}
              <div
                style={{
                  position: "absolute",
                  left: "6px",
                  top: "3px",
                  height: "18px",
                  width: `calc(100% - 12px)`,
                  fontSize: "10px",
                  fontWeight: "800",
                  color: themeStyles.sectorText,
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px"
                }}
              >
                {sectorNode.sector} &gt;
              </div>

              {/* Render Stocks inside this Sector */}
              {sectorNode.stocksLayout.map((stockNode) => {
                const stock = stockNode.data;
                const probUp = stock.prob_up_1w !== undefined ? stock.prob_up_1w : 50.0;
                
                // Search Highlight Logic
                const matchesSearch = stock.ticker.toLowerCase().includes(searchTerm.toLowerCase());
                const opacity = isSearchActive ? (matchesSearch ? 1.0 : 0.15) : 1.0;
                const isHighlighted = isSearchActive && matchesSearch;

                const { background, borderColor, shadow, textColor } = getCellBackgroundAndBorder(probUp, isHighlighted);

                // Gap and size offset
                const borderGap = 1;
                const x = stockNode.rect.x + borderGap;
                const y = stockNode.rect.y + borderGap;
                const w = Math.max(0, stockNode.rect.w - borderGap * 2);
                const h = Math.max(0, stockNode.rect.h - borderGap * 2);

                // Font scaling based on tile size
                const showDetail = w > 55 && h > 40;
                const showMinimal = w > 35 && h > 20;
                
                const fontSizeTicker = w > 90 ? "18px" : w > 65 ? "14px" : w > 45 ? "11px" : "9px";
                const fontSizeProb = w > 90 ? "12px" : w > 65 ? "10px" : "8px";

                return (
                  <div
                    key={stock.ticker}
                    onClick={() => handleCellClick(stock.ticker)}
                    onMouseEnter={() => setHoveredStock(stock)}
                    onMouseLeave={() => setHoveredStock(null)}
                    onMouseMove={handleMouseMove}
                    style={{
                      position: "absolute",
                      left: `${x}px`,
                      top: `${y}px`,
                      width: `${w}px`,
                      height: `${h}px`,
                      background,
                      border: `1.5px solid ${borderColor}`,
                      boxShadow: shadow,
                      borderRadius: "6px",
                      opacity,
                      transition: "transform 0.15s, opacity 0.2s, box-shadow 0.15s, border-color 0.15s",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      color: textColor,
                      overflow: "hidden",
                      userSelect: "none"
                    }}
                    className="heatmap-cell"
                  >
                    {showMinimal && (
                      <span 
                        style={{ 
                          fontSize: fontSizeTicker, 
                          fontWeight: "900", 
                          letterSpacing: "0.2px",
                          lineHeight: "1.1",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                          overflow: "hidden",
                          width: "90%",
                          textAlign: "center"
                        }}
                      >
                        {stock.ticker}
                      </span>
                    )}
                    {showDetail && (
                      <span 
                        style={{ 
                          fontSize: fontSizeProb, 
                          fontWeight: "700", 
                          opacity: 0.9, 
                          marginTop: "3px",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {probUp.toFixed(1)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Floating Detailed Hover Tooltip */}
      {hoveredStock && (
        <div
          style={{
            position: "fixed",
            left: `${Math.max(12, Math.min(tooltipPos.x, (typeof window !== "undefined" ? window.innerWidth : 1000) - 252))}px`,
            top: `${tooltipPos.y}px`,
            background: isDarkTheme ? "rgba(10, 15, 30, 0.95)" : "rgba(255, 255, 255, 0.96)",
            backdropFilter: "blur(12px)",
            border: "1.5px solid #818cf8",
            borderRadius: "10px",
            padding: "14px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
            zIndex: 9999,
            width: "240px",
            maxWidth: "calc(100vw - 24px)",
            pointerEvents: "none",
            animation: "fadeIn 0.1s ease-out",
            color: isDarkTheme ? "#ffffff" : "var(--color-text-primary)"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
            <div>
              <div style={{ fontSize: "15px", fontWeight: "900" }}>{hoveredStock.ticker}</div>
              <div style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>{hoveredStock.sector}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "14px", fontWeight: "700" }}>₹{hoveredStock.price.toLocaleString("en-IN")}</div>
              <div style={{ fontSize: "11px", fontWeight: "600", color: hoveredStock.change_pct >= 0 ? "var(--color-buy)" : "var(--color-sell)" }}>
                {hoveredStock.change_pct >= 0 ? "+" : ""}{hoveredStock.change_pct.toFixed(2)}%
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", borderTop: `1px solid ${isDarkTheme ? "rgba(255,255,255,0.1)" : "var(--border-subtle)"}`, paddingTop: "8px", fontSize: "11px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>1-Week Prob to Go Up:</span>
              <span style={{ fontWeight: "700", color: "var(--color-buy)" }}>{hoveredStock.prob_up_1w?.toFixed(1)}%</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>1-Week Prob to Go Down:</span>
              <span style={{ fontWeight: "700", color: "var(--color-sell)" }}>{hoveredStock.prob_down_1w?.toFixed(1)}%</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>1-Week Consolidation (Flat):</span>
              <span style={{ fontWeight: "700", color: "var(--color-text-muted)" }}>{hoveredStock.prob_flat_1w?.toFixed(1)}%</span>
            </div>
            
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px dashed ${isDarkTheme ? "rgba(255,255,255,0.1)" : "var(--border-subtle)"}`, paddingTop: "6px", marginTop: "4px" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Master Score:</span>
              <span style={{ fontWeight: "800", color: "#818cf8" }}>{hoveredStock.master_score} / 100</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Consensus:</span>
              <span style={{ 
                fontWeight: "700", 
                color: hoveredStock.recommendation.includes("Buy") 
                  ? "var(--color-buy)" 
                  : hoveredStock.recommendation.includes("Sell") 
                    ? "var(--color-sell)" 
                    : "var(--color-hold)" 
              }}>
                {hoveredStock.recommendation}
              </span>
            </div>
          </div>

          <div style={{ fontSize: "9px", color: "#818cf8", fontWeight: "700", marginTop: "8px", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            ⚡ Click to open AI Research Scorecard
          </div>
        </div>
      )}

    </div>
  );
}
