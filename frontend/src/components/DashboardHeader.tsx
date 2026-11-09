import React, { useState } from "react";
import { MarketStatus, applyOverride, resetOverride, syncLiveData } from "../utils/api";

interface DashboardHeaderProps {
  status: MarketStatus | null;
  onRefresh: () => void;
  error?: string | null;
}

export default function DashboardHeader({ status, onRefresh, error }: DashboardHeaderProps) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  if (error && !status) {
    return (
      <header className="glass-panel" style={{ padding: "16px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: "24px", color: "var(--color-text-primary)", fontWeight: "800" }}>Personalised Recommendations</h1>
        <div style={{ color: "var(--color-sell)", fontSize: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span>⚠️ {error}</span>
          <button onClick={onRefresh} style={{ background: "none", border: "1px solid var(--border-subtle)", padding: "4px 8px", borderRadius: "4px", color: "var(--color-text-primary)", cursor: "pointer" }}>Retry</button>
        </div>
      </header>
    );
  }

  if (!status) {
    return (
      <header className="glass-panel" style={{ padding: "16px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: "24px", color: "var(--color-text-primary)", fontWeight: "800" }}>Personalised Recommendations</h1>
        <div style={{ color: "var(--color-text-muted)" }}>Loading market feed...</div>
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

  return (
    <header className="glass-panel dashboard-header-container" style={{ marginBottom: "20px" }}>
      <div className="header-top-row">
        {/* Brand logo */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "var(--accent-ml)", boxShadow: "0 0 10px var(--accent-ml)" }}></div>
            <h1 style={{ fontSize: "22px", letterSpacing: "1px", fontFamily: "var(--font-display)", fontWeight: "800", background: "linear-gradient(90deg, var(--color-text-primary), var(--accent-ml))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Personalised Recommendations</h1>
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px", textTransform: "uppercase", letterSpacing: "2px" }}>
            Hedge-Fund Scoring Consensus • <span style={{ color: "var(--color-buy)" }}>● Live Auto-Sync (1h / 30s ticks)</span>
          </div>
        </div>

        {/* Regime Status and Simulation Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {/* Market Session Status Badge */}
          <div className="glass-panel" style={{ padding: "6px 12px", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ fontSize: "9px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Market Status</div>
            <div style={{ fontSize: "12px", fontWeight: "800", color: status.is_market_open ? "var(--color-buy)" : "var(--color-text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: status.is_market_open ? "var(--color-buy)" : "#94a3b8" }}></span>
              {status.market_session_message || (status.is_market_open ? "LIVE MARKET" : "MARKET CLOSED")}
            </div>
          </div>
          {/* Regime indicator badge */}
          <div className={`glass-panel ${regimeClass}`} style={{ padding: "6px 12px", border: "1px solid transparent", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ fontSize: "9px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Market Regime</div>
            <div style={{ fontSize: "14px", fontWeight: "800", color: regimeColor }}>{status.regime}</div>
          </div>

          {/* Sync Live Button */}
          <button
            onClick={handleSyncLive}
            disabled={syncing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              fontWeight: "600",
              padding: "7px 12px",
              background: syncing ? "rgba(0, 230, 118, 0.2)" : "rgba(0, 230, 118, 0.1)",
              color: "var(--color-buy)",
              border: "1px solid rgba(0, 230, 118, 0.3)",
              borderRadius: "6px",
              cursor: syncing ? "wait" : "pointer",
              transition: "all 0.2s ease"
            }}
            title="Fetch real-time live quotes from Yahoo Finance immediately"
          >
            <span style={{ display: "inline-block" }}>🔄</span>
            {syncing ? "Syncing..." : "Sync Live Data"}
          </button>

          {/* Override controls */}
          <div style={{ display: "flex", gap: "8px" }}>
            <select 
              onChange={(e) => handleSimulate(e.target.value)}
              disabled={loading}
              defaultValue=""
              style={{ 
                fontSize: "12px", 
                padding: "6px 10px", 
                background: "var(--bg-card)", 
                color: "var(--color-text-primary)",
                border: "1px solid var(--border-subtle)", 
                borderRadius: "6px",
                cursor: "pointer",
                outline: "none"
              }}
            >
              <option value="" disabled style={{ color: "var(--color-text-muted)" }}>🔧 Select Regime Simulation</option>
              <option value="NORMAL" style={{ color: "var(--color-text-primary)" }}>🟢 Standard Sideways/Bull</option>
              <option value="BEAR" style={{ color: "var(--color-text-primary)" }}>🔴 Bear Market Crash (High VIX / NASDAQ drop)</option>
              <option value="HIGH_VOLATILITY" style={{ color: "var(--color-text-primary)" }}>⚠️ High Volatility Spike (VIX &gt; 28)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Ticker stream */}
      <div className="header-ticker-bar hide-scrollbar">
        <div>
          <span style={{ color: "var(--color-text-secondary)" }}>NIFTY 50: </span>
          <span style={{ fontWeight: "700" }}>{status.nifty_close.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
          <span style={{ color: status.nifty_change >= 0 ? "var(--color-buy)" : "var(--color-sell)", marginLeft: "6px", fontWeight: "600" }}>
            {status.nifty_change_abs !== undefined ? `${status.nifty_change_abs >= 0 ? "+" : ""}${status.nifty_change_abs.toFixed(1)} ` : ""}
            ({status.nifty_change >= 0 ? "+" : ""}{status.nifty_change.toFixed(2)}%)
          </span>
        </div>
        {status.bank_nifty_close !== undefined && (
          <div>
            <span style={{ color: "var(--color-text-secondary)" }}>BANK NIFTY: </span>
            <span style={{ fontWeight: "700" }}>{status.bank_nifty_close.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
            <span style={{ color: (status.bank_nifty_change ?? 0) >= 0 ? "var(--color-buy)" : "var(--color-sell)", marginLeft: "6px", fontWeight: "600" }}>
              {status.bank_nifty_change_abs !== undefined ? `${status.bank_nifty_change_abs >= 0 ? "+" : ""}${status.bank_nifty_change_abs.toFixed(1)} ` : ""}
              ({(status.bank_nifty_change ?? 0) >= 0 ? "+" : ""}{(status.bank_nifty_change ?? 0).toFixed(2)}%)
            </span>
          </div>
        )}
        {status.nifty_open !== undefined && status.nifty_high !== undefined && status.nifty_low !== undefined && (
          <div>
            <span style={{ color: "var(--color-text-secondary)" }}>DAY RANGE: </span>
            <span style={{ fontSize: "12px", color: "var(--color-text-primary)" }}>
              O: {status.nifty_open.toLocaleString(undefined, { maximumFractionDigits: 1 })} | H: {status.nifty_high.toLocaleString(undefined, { maximumFractionDigits: 1 })} | L: {status.nifty_low.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </span>
          </div>
        )}
        {status.nifty_prev_close !== undefined && (
          <div>
            <span style={{ color: "var(--color-text-secondary)" }}>PREV CLOSE: </span>
            <span>{status.nifty_prev_close.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
          </div>
        )}
        <div>
          <span style={{ color: "var(--color-text-secondary)" }}>INDIA VIX: </span>
          <span style={{ color: status.vix > 20 ? "var(--color-sell)" : "var(--color-buy)", fontWeight: "600" }}>{status.vix.toFixed(2)}</span>
        </div>
        <div>
          <span style={{ color: "var(--color-text-secondary)" }}>NASDAQ: </span>
          <span>{status.nasdaq.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
        <div>
          <span style={{ color: "var(--color-text-secondary)" }}>S&P 500: </span>
          <span>{status.sp500.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
        <div>
          <span style={{ color: "var(--color-text-secondary)" }}>DXY: </span>
          <span>{status.dxy.toFixed(2)}</span>
        </div>
        <div>
          <span style={{ color: "var(--color-text-secondary)" }}>US 10Y: </span>
          <span>{status.us10y.toFixed(2)}%</span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px", fontSize: "11px", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
          {(status.last_updated_formatted || status.last_updated) && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span>🕒 Updated: {status.last_updated_formatted || status.last_updated}</span>
              {status.source && (
                <span style={{ textTransform: "uppercase", fontSize: "10px", padding: "1px 5px", borderRadius: "3px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                  {status.source === "nse_live" ? "NSE Real-Time" : "NSE Official"}
                </span>
              )}
              {status.is_stale && (
                <span style={{ color: "var(--color-sell)", fontWeight: "600" }}>(Cached Session)</span>
              )}
            </div>
          )}
          {status.last_synced && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span>Synced: </span>
              <span style={{ color: "var(--color-text-primary)" }}>{formatLastSync(status.last_synced)}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
