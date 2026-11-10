import React, { useRef, useEffect, useState } from "react";
import { ChartDataPoint } from "../utils/api";

interface StockChartProps {
  ticker: string;
  chartData: ChartDataPoint[];
  interval: string;
  onIntervalChange: (interval: string) => void;
}

export default function StockChart({ ticker, chartData, interval, onIntervalChange }: StockChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Handle resizing with ResizeObserver on canvas wrapper for exact pixel fit
  const [dimensions, setDimensions] = useState({ width: 320, height: 280 });

  useEffect(() => {
    const target = canvasWrapperRef.current || containerRef.current;
    if (!target) return;

    const updateSize = (measuredWidth?: number) => {
      const fallbackWidth = target.clientWidth || 320;
      const w = Math.max(200, Math.floor(measuredWidth ?? fallbackWidth));
      const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
      setDimensions({
        width: w,
        height: isMobile ? 280 : 420
      });
    };

    updateSize();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        if (entries[0]) {
          updateSize(entries[0].contentRect.width);
        }
      });
      observer.observe(target);
      window.addEventListener("resize", () => updateSize());
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", () => updateSize());
      };
    } else {
      const onWinResize = () => updateSize();
      window.addEventListener("resize", onWinResize);
      return () => window.removeEventListener("resize", onWinResize);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chartData || chartData.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // High DPI support
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    const width = dimensions.width;
    const height = dimensions.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Resolve CSS variables for canvas drawing
    const computedStyles = typeof window !== "undefined" ? window.getComputedStyle(document.documentElement) : null;
    const colorTextMuted = computedStyles ? computedStyles.getPropertyValue("--color-text-muted").trim() : "#64748b";
    const gridColor = computedStyles ? computedStyles.getPropertyValue("--border-subtle").trim() : "rgba(0, 0, 0, 0.08)";

    // Layout parameters
    const paddingLeft = width < 400 ? 8 : 15;
    const paddingRight = width < 400 ? 52 : 65;
    const paddingTop = 20;
    
    // Calculate heights relative to the dynamic height
    const usableHeight = height - paddingTop - 50;
    const priceChartHeight = Math.max(100, usableHeight * 0.65);
    const priceChartBottom = paddingTop + priceChartHeight;
    
    const derivChartTop = priceChartBottom + 20;
    const derivChartHeight = Math.max(50, usableHeight * 0.25);
    const derivChartBottom = derivChartTop + derivChartHeight;
    
    const chartWidth = width - paddingLeft - paddingRight;

    // Slice data to render (show last 65 candles)
    const viewCount = 65;
    const visibleData = chartData.slice(-viewCount);
    const n = visibleData.length;

    // --- Find price min/max in visible data to scale Y axis ---
    let maxPrice = -Infinity;
    let minPrice = Infinity;
    let maxVol = 0;

    // --- Find OI min/max in visible data to scale OI axis ---
    let minOI = Infinity;
    let maxOI = -Infinity;

    visibleData.forEach(d => {
      const priceVals = [d.High, d.Low, d.EMA_20, d.EMA_50, d.EMA_200, d.BB_Upper, d.BB_Lower].filter(v => v !== null && v !== undefined && !isNaN(v));
      maxPrice = Math.max(maxPrice, ...priceVals);
      minPrice = Math.min(minPrice, ...priceVals);
      maxVol = Math.max(maxVol, d.Volume);

      if (d.FuturesOI !== undefined && d.FuturesOI !== null) {
        minOI = Math.min(minOI, d.FuturesOI);
        maxOI = Math.max(maxOI, d.FuturesOI);
      }
    });

    // Add some padding to price scales
    const priceDiff = maxPrice - minPrice;
    maxPrice += priceDiff * 0.08;
    minPrice -= priceDiff * 0.08;

    // Add padding to OI scales
    if (minOI === Infinity) {
      minOI = 1000000;
      maxOI = 2000000;
    }
    const oiDiff = maxOI - minOI || 1;
    minOI -= oiDiff * 0.05;
    maxOI += oiDiff * 0.05;

    // Helper functions for coordinates mapping
    const getX = (idx: number) => paddingLeft + (idx / (n - 1)) * chartWidth;
    const getY = (price: number) => priceChartBottom - ((price - minPrice) / (maxPrice - minPrice)) * priceChartHeight;
    const getVolY = (vol: number) => priceChartBottom - (vol / maxVol) * (priceChartHeight * 0.15); // volume max 15% height
    
    const getOIY = (oi: number) => derivChartBottom - ((oi - minOI) / (maxOI - minOI)) * derivChartHeight;
    const getPCRY = (pcr: number) => derivChartBottom - ((pcr - 0.4) / (2.0 - 0.4)) * derivChartHeight; // PCR scaled 0.4 to 2.0

    // --- 1. Draw grid lines for Price Chart ---
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    
    const priceLines = 5;
    for (let i = 0; i < priceLines; i++) {
      const p = minPrice + (i / (priceLines - 1)) * (maxPrice - minPrice);
      const y = getY(p);
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();

      // Draw price label text
      ctx.fillStyle = colorTextMuted;
      ctx.font = "10px var(--font-main)";
      ctx.fillText(p.toLocaleString(undefined, { maximumFractionDigits: 1 }), width - paddingRight + 8, y + 3);
    }

    // --- 2. Draw Bollinger Bands Area ---
    ctx.fillStyle = "rgba(124, 77, 255, 0.025)";
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = getX(i);
      const y = getY(visibleData[i].BB_Upper);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = n - 1; i >= 0; i--) {
      const x = getX(i);
      const y = getY(visibleData[i].BB_Lower);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Draw Bollinger Bands boundaries
    ctx.strokeStyle = "rgba(124, 77, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = getX(i);
      const y = getY(visibleData[i].BB_Upper);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = getX(i);
      const y = getY(visibleData[i].BB_Lower);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // --- 3. Draw EMAs ---
    const drawEMA = (key: "EMA_20" | "EMA_50" | "EMA_200", color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let active = false;
      for (let i = 0; i < n; i++) {
        const val = visibleData[i][key];
        if (val) {
          const x = getX(i);
          const y = getY(val);
          if (!active) {
            ctx.moveTo(x, y);
            active = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();
    };

    drawEMA("EMA_20", "rgba(255, 128, 0, 0.5)"); // Orange
    drawEMA("EMA_50", "rgba(0, 229, 255, 0.5)");  // Cyan
    drawEMA("EMA_200", "rgba(162, 89, 255, 0.5)"); // Purple

    // --- 4. Draw Volume bars ---
    visibleData.forEach((d, i) => {
      const x = getX(i);
      const volY = getVolY(d.Volume);
      const bottomY = priceChartBottom;
      const isUp = d.Close >= d.Open;
      
      ctx.fillStyle = isUp ? "rgba(0, 230, 118, 0.12)" : "rgba(255, 23, 68, 0.12)";
      const barWidth = Math.max(2, (chartWidth / n) * 0.6);
      ctx.fillRect(x - barWidth / 2, volY, barWidth, bottomY - volY);
    });

    // --- 5. Draw Candlesticks ---
    visibleData.forEach((d, i) => {
      const x = getX(i);
      const yOpen = getY(d.Open);
      const yClose = getY(d.Close);
      const yHigh = getY(d.High);
      const yLow = getY(d.Low);
      
      const isUp = d.Close >= d.Open;
      const color = isUp ? "var(--color-buy)" : "var(--color-sell)";
      
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.5;

      // Wick
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      // Body
      const bodyWidth = Math.max(4, (chartWidth / n) * 0.75);
      const bodyHeight = Math.abs(yClose - yOpen) || 1.5; // at least 1.5px
      ctx.fillRect(x - bodyWidth / 2, Math.min(yOpen, yClose), bodyWidth, bodyHeight);
    });

    // --- 6. Draw Grid & Lines for Derivatives Subchart ---
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, derivChartTop);
    ctx.lineTo(width - paddingRight, derivChartTop);
    ctx.moveTo(paddingLeft, derivChartTop + derivChartHeight / 2);
    ctx.lineTo(width - paddingRight, derivChartTop + derivChartHeight / 2);
    ctx.moveTo(paddingLeft, derivChartBottom);
    ctx.lineTo(width - paddingRight, derivChartBottom);
    ctx.stroke();

    // Draw OI Labels on Left
    ctx.fillStyle = "rgba(179, 136, 255, 0.7)";
    ctx.font = "9px var(--font-main)";
    ctx.fillText((maxOI / 1000000).toFixed(2) + "M", paddingLeft + 2, derivChartTop - 4);
    ctx.fillText((minOI / 1000000).toFixed(2) + "M", paddingLeft + 2, derivChartBottom + 10);

    // Draw PCR Labels on Right
    ctx.fillStyle = "rgba(255, 215, 0, 0.7)";
    ctx.fillText("PCR 2.0", width - paddingRight + 8, derivChartTop + 3);
    ctx.fillText("PCR 1.2", width - paddingRight + 8, derivChartTop + derivChartHeight * 0.5 + 3);
    ctx.fillText("PCR 0.4", width - paddingRight + 8, derivChartBottom + 3);

    // --- 7. Draw Open Interest (OI) Line ---
    ctx.strokeStyle = "rgba(179, 136, 255, 0.85)"; // Purple
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    let activeOI = false;
    for (let i = 0; i < n; i++) {
      const val = visibleData[i].FuturesOI;
      if (val !== undefined && val !== null) {
        const x = getX(i);
        const y = getOIY(val);
        if (!activeOI) {
          ctx.moveTo(x, y);
          activeOI = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    }
    ctx.stroke();

    // --- 8. Draw Options Put-Call Ratio (PCR) Line ---
    ctx.strokeStyle = "rgba(255, 215, 0, 0.85)"; // Gold
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let activePCR = false;
    for (let i = 0; i < n; i++) {
      const val = visibleData[i].OptionsPCR;
      if (val !== undefined && val !== null) {
        const x = getX(i);
        const y = getPCRY(val);
        if (!activePCR) {
          ctx.moveTo(x, y);
          activePCR = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    }
    ctx.stroke();

    // --- 9. Draw Dates on X Axis (below derivatives) ---
    const dateMarkings = 4;
    ctx.fillStyle = colorTextMuted;
    ctx.font = "9px var(--font-main)";
    for (let i = 0; i < dateMarkings; i++) {
      const idx = Math.floor((i / (dateMarkings - 1)) * (n - 1));
      if (idx >= 0 && idx < n) {
        const d = visibleData[idx];
        const x = getX(idx);
        
        let displayDate = "";
        try {
          const dateObj = new Date(d.FormattedDate);
          displayDate = dateObj.toLocaleDateString(undefined, { day: "numeric", month: "short" });
          if (interval !== "1d") {
            displayDate += ` ${dateObj.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}`;
          }
        } catch {
          displayDate = d.FormattedDate;
        }
        
        ctx.fillText(displayDate, x - 25, derivChartBottom + 18);
      }
    }

    // --- 10. Draw synchronized hover crosshairs ---
    if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < n) {
      const x = getX(hoverIndex);
      const d = visibleData[hoverIndex];
      const yPrice = getY(d.Close);

      // Vertical crosshair extending across both charts
      ctx.strokeStyle = colorTextMuted;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.moveTo(x, paddingTop);
      ctx.lineTo(x, derivChartBottom);
      ctx.stroke();

      // Horizontal crosshair to price Y
      ctx.beginPath();
      ctx.moveTo(paddingLeft, yPrice);
      ctx.lineTo(width - paddingRight, yPrice);
      ctx.stroke();
      ctx.setLineDash([]); // Reset line dash

      // Glowing close dot on price chart
      ctx.fillStyle = d.Close >= d.Open ? "var(--color-buy)" : "var(--color-sell)";
      ctx.beginPath();
      ctx.arc(x, yPrice, 4, 0, 2 * Math.PI);
      ctx.fill();

      // Small dots on OI/PCR lines
      if (d.FuturesOI !== undefined) {
        ctx.fillStyle = "rgba(179, 136, 255, 1)";
        ctx.beginPath();
        ctx.arc(x, getOIY(d.FuturesOI), 3, 0, 2 * Math.PI);
        ctx.fill();
      }
      if (d.OptionsPCR !== undefined) {
        ctx.fillStyle = "rgba(255, 215, 0, 1)";
        ctx.beginPath();
        ctx.arc(x, getPCRY(d.OptionsPCR), 3, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }, [chartData, dimensions, hoverIndex, interval]);

  const computeHoverIndex = (x: number) => {
    const viewCount = 65;
    const paddingLeft = dimensions.width < 400 ? 8 : 15;
    const paddingRight = dimensions.width < 400 ? 52 : 65;
    const chartWidth = Math.max(1, dimensions.width - paddingLeft - paddingRight);
    const visibleData = chartData ? chartData.slice(-viewCount) : [];
    const n = visibleData.length;
    if (n <= 1) return 0;
    const pct = (x - paddingLeft) / chartWidth;
    return Math.max(0, Math.min(n - 1, Math.round(pct * (n - 1))));
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !chartData || chartData.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMousePos({ x, y });
    setHoverIndex(computeHoverIndex(x));
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !chartData || chartData.length === 0 || !e.touches[0]) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const y = e.touches[0].clientY - rect.top;

    setMousePos({ x, y });
    setHoverIndex(computeHoverIndex(x));
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const getHoverItem = () => {
    if (hoverIndex === null || !chartData) return null;
    const viewCount = 65;
    const visibleData = chartData.slice(-viewCount);
    return visibleData[hoverIndex];
  };

  const hoveredData = getHoverItem();

  return (
    <div className="glass-panel" ref={containerRef} style={{ padding: "clamp(10px, 3vw, 16px)", display: "flex", flexDirection: "column", gap: "10px", position: "relative" }}>
      {/* Chart Top Menu */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "4px 10px", flexWrap: "wrap", minWidth: 0 }}>
          <h2 style={{ fontSize: "clamp(14px, 4vw, 16px)", fontWeight: "700", margin: 0 }}>{ticker} Scorecard Chart</h2>
          <span style={{ fontSize: "10.5px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Overlays: Price EMAs, BB, Volume & Futures OI / PCR</span>
        </div>

        {/* Interval Selector */}
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {[
            { id: "1d", label: "Daily" },
            { id: "1h", label: "1 Hour" },
            { id: "15m", label: "15 Min" }
          ].map((int) => (
            <button
              key={int.id}
              onClick={() => onIntervalChange(int.id)}
              style={{
                fontSize: "11px",
                padding: "4px 10px",
                borderRadius: "4px",
                background: interval === int.id ? "var(--accent-ml)" : "transparent",
                borderColor: interval === int.id ? "var(--accent-ml)" : "var(--border-subtle)",
                color: interval === int.id ? "#ffffff" : "var(--color-text-secondary)",
                fontWeight: "700"
              }}
            >
              {int.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Canvas */}
      <div ref={canvasWrapperRef} style={{ position: "relative", width: "100%", minWidth: 0, height: `${dimensions.height}px` }}>
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchMove}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleMouseLeave}
          style={{ width: "100%", height: `${dimensions.height}px`, display: "block", cursor: "crosshair", touchAction: "none" }}
        />

        {/* Hover Price & Derivatives Overlay (Tooltip) */}
        {hoveredData && (
          <div style={{
            position: "absolute",
            top: "8px",
            left: "8px",
            right: "8px",
            maxWidth: "calc(100% - 16px)",
            width: "fit-content",
            background: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "6px",
            padding: "8px 10px",
            fontSize: "10.5px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))",
            columnGap: "12px",
            rowGap: "3px",
            pointerEvents: "none",
            boxShadow: "0 4px 20px rgba(0,0,0,0.08)"
          }}>
            <div>
              <span style={{ color: "var(--color-text-muted)" }}>Date: </span>
              <span style={{ color: "var(--color-text-primary)", fontWeight: "600" }}>{hoveredData.FormattedDate}</span>
            </div>
            <div>
              <span style={{ color: "var(--color-text-muted)" }}>Open: </span>
              <span style={{ color: "var(--color-text-primary)" }}>₹{hoveredData.Open.toFixed(1)}</span>
            </div>
            <div>
              <span style={{ color: "var(--color-text-muted)" }}>High: </span>
              <span style={{ color: "var(--color-text-primary)" }}>₹{hoveredData.High.toFixed(1)}</span>
            </div>
            <div>
              <span style={{ color: "var(--color-text-muted)" }}>Low: </span>
              <span style={{ color: "var(--color-text-primary)" }}>₹{hoveredData.Low.toFixed(1)}</span>
            </div>
            <div>
              <span style={{ color: "var(--color-text-muted)" }}>Close: </span>
              <span style={{ color: hoveredData.Close >= hoveredData.Open ? "var(--color-buy)" : "var(--color-sell)", fontWeight: "600" }}>
                ₹{hoveredData.Close.toFixed(1)}
              </span>
            </div>
            <div>
              <span style={{ color: "var(--color-text-muted)" }}>Vol: </span>
              <span style={{ color: "var(--color-text-primary)" }}>{hoveredData.Volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div>
              <span style={{ color: "rgba(255, 128, 0, 0.85)" }}>EMA20: </span>
              <span style={{ color: "var(--color-text-primary)" }}>₹{hoveredData.EMA_20.toFixed(1)}</span>
            </div>
            <div>
              <span style={{ color: "rgba(0, 229, 255, 0.85)" }}>EMA50: </span>
              <span style={{ color: "var(--color-text-primary)" }}>₹{hoveredData.EMA_50.toFixed(1)}</span>
            </div>

            {/* Derivatives Tooltip Data */}
            {hoveredData.FuturesOI !== undefined && (
              <div>
                <span style={{ color: "rgba(179, 136, 255, 0.95)", fontWeight: "600" }}>OI: </span>
                <span style={{ color: "var(--color-text-primary)", fontWeight: "600" }}>{(hoveredData.FuturesOI / 1000000).toFixed(2)}M</span>
              </div>
            )}
            {hoveredData.OptionsPCR !== undefined && (
              <div>
                <span style={{ color: "rgba(255, 215, 0, 0.95)", fontWeight: "600" }}>PCR: </span>
                <span style={{ color: "var(--color-text-primary)", fontWeight: "600" }}>{hoveredData.OptionsPCR.toFixed(2)}</span>
              </div>
            )}
            {hoveredData.DeliveryPct !== undefined && (
              <div style={{ gridColumn: "span 2" }}>
                <span style={{ color: "var(--color-text-muted)" }}>Delivery %: </span>
                <span style={{ color: "var(--color-text-primary)" }}>{hoveredData.DeliveryPct.toFixed(1)}%</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
