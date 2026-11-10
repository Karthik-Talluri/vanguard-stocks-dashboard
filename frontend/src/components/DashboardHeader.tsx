import React, { useState } from "react";
import { MarketStatus, applyOverride, resetOverride, syncLiveData } from "../utils/api";

interface DashboardHeaderProps {
  status: MarketStatus | null;
  onRefresh: () => void;
  error?: string | null;
  onOpenProfile?: () => void;
  activeUserName?: string;
}

export default function DashboardHeader({
  status,
  onRefresh,
  error,
  onOpenProfile,
  activeUserName
}: DashboardHeaderProps) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  if (error && !status) {
    return (
      <header className="glass-panel dashboard-header-container" style={{ marginBottom: "10px" }}>
        <div className="header-top-row">
          <h1 className="header-brand-title">Personalised Recommendations</h1>
          <div style={{ color: "var(--color-sell)", fontSize: "12px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", maxWidth: "100%" }}>
            <span style={{ overflowWrap: "anywhere" }}>⚠️ {error}</span>
            <button onClick={onRefresh} style={{ background: "none", border: "1px solid var(--border-subtle)", padding: "5px 10px", borderRadius: "6px", color: "var(--color-text-primary)", cursor: "pointer", fontSize: "12px" }}>Retry</button>
          </div>
        </div>
      </header>
    );
  }

  if (!status) {
    return (
      <header className="glass-panel dashboard-header-container" style={{ marginBottom: "10px" }}>
        <div className="header-top-row">
          <h1 className="header-brand-title">Personalised Recommendations</h1>
          <div style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>Loading real-time market feed...</div>
        </div>
      </header>
    );
  }

  const handleSyncLive = async () => {
    setSyncing(true);
    try {
      await syncLiveData();
      onRefresh();
    } catch (e) {
      console.error("Error triggering live sync:", e);
    } finally {
      setSyncing(false);
    }
  };

  const handleSimulate = async (regimeType: string) => {
    setLoading(true);
    try {
      if (regimeType === "BEAR") {
        await applyOverride(24.5, -0.05); // high VIX, Nasdaq crash
      } else if (regimeType === "HIGH_VOLATILITY") {
        await applyOverride(28.0, 0.005);  // extreme VIX, flat Nasdaq
      } else {
        await resetOverride();
      }
      onRefresh();
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // Regime styling
  let regimeClass = "glow-hold";
  let regimeColor = "var(--color-hold)";
  if (status.regime === "BULL") {
    regimeClass = "glow-buy";
    regimeColor = "var(--color-buy)";
  } else if (status.regime === "BEAR") {
    regimeClass = "glow-sell";
    regimeColor = "var(--color-sell)";
  } else if (status.regime === "HIGH_VOLATILITY") {
    regimeClass = "glow-sell";
    regimeColor = "var(--color-sell)";
  }

  const formatLastSync = (ts?: number) => {
    if (!ts || ts === 0) return "Active";
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const niftyIsPositive = status.nifty_change >= 0;
  const bankNiftyIsPositive = (status.bank_nifty_change ?? 0) >= 0;

  return (
    <header className="glass-panel dashboard-header-container" style={{ marginBottom: "6px" }}>
      {/* Top Bar: Brand, Status Badge, Regime Badge, Sync Button, User Profile & Override */}
      <div className="header-top-row">
        {/* Brand logo & Tagline */}
        <div className="header-brand-wrap">
          <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "var(--accent-ml)", boxShadow: "0 0 10px var(--accent-ml)", flexShrink: 0 }}></div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <h1 className="header-brand-title">
                Personalised Recommendations
              </h1>
              <span
                className="sm-up-inline-block"
                style={{
                  fontSize: "9px",
                  fontWeight: "800",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  background: "rgba(79, 70, 229, 0.1)",
                  color: "var(--accent-ml)",
                  border: "1px solid rgba(79, 70, 229, 0.25)"
                }}
              >
                PRO
              </span>
            </div>
            <div className="header-brand-subtitle">
              Hedge-Fund Scoring Consensus • <span style={{ color: "var(--color-buy)", fontWeight: "700" }}>● Live Auto-Sync</span>
            </div>
          </div>
        </div>

        {/* Action Controls & Badges */}
        <div className="header-controls-row">
          {/* Market Status Pill */}
          <div
            style={{
              padding: "5px 10px",
              borderRadius: "20px",
              background: status.is_market_open ? "rgba(5, 150, 105, 0.1)" : "rgba(100, 116, 139, 0.1)",
              border: `1px solid ${status.is_market_open ? "rgba(5, 150, 105, 0.25)" : "rgba(100, 116, 139, 0.2)"}`,
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "11px",
              fontWeight: "800",
              color: status.is_market_open ? "var(--color-buy)" : "var(--color-text-muted)",
              maxWidth: "100%"
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: status.is_market_open ? "var(--color-buy)" : "#94a3b8", flexShrink: 0 }}></span>
            <span>{status.is_market_open ? "NSE LIVE" : "CLOSED"}</span>
          </div>

          {/* Regime Badge */}
          <div
            className={regimeClass}
            style={{
              padding: "5px 10px",
              borderRadius: "20px",
              background: "rgba(0,0,0,0.02)",
              border: "1px solid var(--border-subtle)",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              fontWeight: "800",
              color: regimeColor,
              maxWidth: "100%"
            }}
          >
            <span style={{ fontSize: "9px", color: "var(--color-text-muted)" }}>REGIME:</span>
            <span>{status.regime}</span>
          </div>

          {/* Sync Live Button */}
          <button
            onClick={handleSyncLive}
            disabled={syncing}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "11px",
              fontWeight: "700",
              padding: "6px 10px",
              background: syncing ? "rgba(5, 150, 105, 0.18)" : "rgba(5, 150, 105, 0.08)",
              color: "var(--color-buy)",
              border: "1px solid rgba(5, 150, 105, 0.3)",
              borderRadius: "8px",
              cursor: syncing ? "wait" : "pointer",
              transition: "all 0.15s ease"
            }}
            title="Fetch real-time live quotes immediately"
          >
            <span style={{ display: "inline-block", transform: syncing ? "rotate(180deg)" : "none", transition: "transform 0.5s ease" }}>🔄</span>
            <span className="xs-up-inline">{syncing ? "Syncing..." : "Sync Live"}</span>
          </button>

          {/* User Profile Pill */}
          {activeUserName && onOpenProfile && (
            <button
              onClick={onOpenProfile}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "5px 10px",
                borderRadius: "20px",
                background: "rgba(79, 70, 229, 0.1)",
                border: "1px solid rgba(79, 70, 229, 0.3)",
                color: "var(--accent-ml)",
                fontSize: "11px",
                fontWeight: "800",
                cursor: "pointer",
                outline: "none"
              }}
              title="Open Trader Profile & User Switcher"
            >
              <span>👤</span>
              <span>{activeUserName}</span>
            </button>
          )}

          {/* Regime Simulation Selector */}
          <select
            onChange={(e) => handleSimulate(e.target.value)}
            disabled={loading}
            defaultValue=""
            style={{
              fontSize: "11px",
              padding: "5px 8px",
              background: "var(--bg-card)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "6px",
              cursor: "pointer",
              outline: "none",
              maxWidth: "100%",
              minWidth: 0
            }}
          >
            <option value="" disabled style={{ color: "var(--color-text-muted)" }}>🔧 Regime Simulation</option>
            <option value="NORMAL">🟢 Standard Sideways/Bull</option>
            <option value="BEAR">🔴 Bear Crash</option>
            <option value="HIGH_VOLATILITY">⚠️ High Volatility (VIX &gt; 28)</option>
          </select>
        </div>
      </div>

      {/* Responsive Market Statistics: Desktop Inline Strip (>= 768px) -> 2-Column Mobile Grid (< 600px) with Full-Width DAY RANGE Row */}
      <div className="market-stats-grid">
        {/* NIFTY 50 */}
        <div className="market-stat-cell market-stat-primary">
          <span className="market-stat-label">
            NIFTY 50<span className="market-stat-colon">:</span>
          </span>
          <div className="market-stat-value-row">
            <span className="market-stat-main-num" style={{ fontWeight: "700" }}>
              {status.nifty_close.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span
              className="market-stat-delta"
              style={{ color: niftyIsPositive ? "var(--color-buy)" : "var(--color-sell)", fontWeight: "600" }}
            >
              {status.nifty_change_abs !== undefined ? `${status.nifty_change_abs >= 0 ? "+" : ""}${status.nifty_change_abs.toFixed(1)} ` : ""}
              ({niftyIsPositive ? "+" : ""}{status.nifty_change.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* BANK NIFTY */}
        {status.bank_nifty_close !== undefined && (
          <div className="market-stat-cell market-stat-primary">
            <span className="market-stat-label">
              BANK NIFTY<span className="market-stat-colon">:</span>
            </span>
            <div className="market-stat-value-row">
              <span className="market-stat-main-num" style={{ fontWeight: "700" }}>
                {status.bank_nifty_close.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
              <span
                className="market-stat-delta"
                style={{ color: bankNiftyIsPositive ? "var(--color-buy)" : "var(--color-sell)", fontWeight: "600" }}
              >
                {status.bank_nifty_change_abs !== undefined ? `${status.bank_nifty_change_abs >= 0 ? "+" : ""}${status.bank_nifty_change_abs.toFixed(1)} ` : ""}
                ({bankNiftyIsPositive ? "+" : ""}{(status.bank_nifty_change ?? 0).toFixed(2)}%)
              </span>
            </div>
          </div>
        )}

        {/* DAY RANGE (Own Full-Width Row Below 768px / 600px) */}
        {status.nifty_open !== undefined && status.nifty_high !== undefined && status.nifty_low !== undefined && (
          <div className="market-stat-cell market-stat-dayrange">
            <span className="market-stat-label">
              DAY RANGE<span className="market-stat-colon">:</span>
            </span>
            <div className="market-stat-dayrange-values">
              <span><strong>O:</strong> {status.nifty_open.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
              <span><strong>H:</strong> {status.nifty_high.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
              <span><strong>L:</strong> {status.nifty_low.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
            </div>
          </div>
        )}

        {/* PREVIOUS CLOSE */}
        {status.nifty_prev_close !== undefined && (
          <div className="market-stat-cell">
            <span className="market-stat-label">
              PREVIOUS CLOSE<span className="market-stat-colon">:</span>
            </span>
            <div className="market-stat-value-row">
              <span className="market-stat-main-num">
                {status.nifty_prev_close.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
            </div>
          </div>
        )}

        {/* INDIA VIX */}
        <div className="market-stat-cell">
          <span className="market-stat-label">
            INDIA VIX<span className="market-stat-colon">:</span>
          </span>
          <div className="market-stat-value-row">
            <span
              className="market-stat-main-num"
              style={{ color: status.vix > 20 ? "var(--color-sell)" : "var(--color-buy)", fontWeight: "700" }}
            >
              {status.vix.toFixed(2)}
            </span>
          </div>
        </div>

        {/* NASDAQ */}
        <div className="market-stat-cell">
          <span className="market-stat-label">
            NASDAQ<span className="market-stat-colon">:</span>
          </span>
          <div className="market-stat-value-row">
            <span className="market-stat-main-num">
              {status.nasdaq.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        {/* S&P 500 */}
        <div className="market-stat-cell">
          <span className="market-stat-label">
            S&amp;P 500<span className="market-stat-colon">:</span>
          </span>
          <div className="market-stat-value-row">
            <span className="market-stat-main-num">
              {status.sp500.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        {/* DXY */}
        <div className="market-stat-cell">
          <span className="market-stat-label">
            DXY<span className="market-stat-colon">:</span>
          </span>
          <div className="market-stat-value-row">
            <span className="market-stat-main-num">{status.dxy.toFixed(2)}</span>
          </div>
        </div>

        {/* US 10Y */}
        <div className="market-stat-cell">
          <span className="market-stat-label">
            US 10Y<span className="market-stat-colon">:</span>
          </span>
          <div className="market-stat-value-row">
            <span className="market-stat-main-num">{status.us10y.toFixed(2)}%</span>
          </div>
        </div>

        {/* Timestamp / Source Metadata */}
        <div className="market-stat-meta">
          {(status.last_updated_formatted || status.last_updated) && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <span>🕒 Updated: {status.last_updated_formatted || status.last_updated}</span>
              {status.source && (
                <span style={{ textTransform: "uppercase", fontSize: "9.5px", padding: "1px 5px", borderRadius: "3px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                  {status.source === "nse_live" ? "NSE Real-Time" : "NSE Official"}
                </span>
              )}
              {status.is_stale && (
                <span style={{ color: "var(--color-sell)", fontWeight: "600" }}>(Cached Session)</span>
              )}
            </div>
          )}
          {typeof status.last_synced === "number" && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span>Synced:</span>
              <span style={{ color: "var(--color-text-primary)", fontWeight: "600" }}>{formatLastSync(status.last_synced)}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
