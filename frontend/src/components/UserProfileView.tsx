"use client";

import React, { useState } from "react";
import { 
  PaperAccount, 
  TradingUser, 
  PAPER_TRADING_USERS, 
  setActiveTradingUserId, 
  resetPaperAccount,
  fetchPaperAccount
} from "../utils/api";

interface UserProfileViewProps {
  activeUser: TradingUser;
  account: PaperAccount | null;
  onUserChanged: (user: TradingUser) => void;
  onAccountUpdated: (account: PaperAccount) => void;
  onNavigateTab: (tabId: string) => void;
}

export default function UserProfileView({
  activeUser,
  account,
  onUserChanged,
  onAccountUpdated,
  onNavigateTab
}: UserProfileViewProps) {
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const handleSelectUser = async (u: TradingUser) => {
    const updated = setActiveTradingUserId(u.id);
    onUserChanged(updated);
    try {
      const acc = await fetchPaperAccount(updated.id);
      onAccountUpdated(acc);
    } catch (e) {
      console.error("Error loading account for switched user:", e);
    }
  };

  const handleResetFunds = async () => {
    setResetting(true);
    setResetMessage(null);
    try {
      const res = await resetPaperAccount(activeUser.id);
      onAccountUpdated(res.account);
      setResetMessage(`Successfully reset ${activeUser.name}'s portfolio back to ₹1,00,000.00 virtual cash!`);
      setConfirmReset(false);
    } catch (err: any) {
      setResetMessage(`Failed to reset: ${err?.message || "Unknown error"}`);
    } finally {
      setResetting(false);
    }
  };

  const isProfit = (account?.total_pnl ?? 0) >= 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", paddingBottom: "24px" }} className="animate-fade-in">
      {/* User Hero Card */}
      <div 
        className="glass-panel"
        style={{
          padding: "clamp(14px, 4vw, 20px)",
          background: "linear-gradient(135deg, rgba(79, 70, 229, 0.12) 0%, rgba(15, 23, 42, 0.04) 100%)",
          border: "1px solid rgba(79, 70, 229, 0.25)",
          borderRadius: "14px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          minWidth: 0
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, width: "100%" }}>
            <div 
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, var(--accent-ml), #3b82f6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                fontSize: "18px",
                fontWeight: "900",
                boxShadow: "0 4px 14px rgba(79, 70, 229, 0.35)",
                flexShrink: 0
              }}
            >
              {activeUser.name.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <h2 style={{ fontSize: "clamp(16px, 4.5vw, 18px)", fontWeight: "900", color: "var(--color-text-primary)", margin: 0 }}>
                  {activeUser.name}
                </h2>
                <span 
                  style={{
                    fontSize: "10px",
                    fontWeight: "800",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background: "rgba(16, 185, 129, 0.12)",
                    color: "var(--color-buy)",
                    border: "1px solid rgba(16, 185, 129, 0.25)"
                  }}
                >
                  ACTIVE TRADER
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px", overflowWrap: "anywhere" }}>
                ID: {activeUser.id} • Simulated Paper Account
              </div>
            </div>
          </div>
        </div>

        {/* Portfolio Quick Numbers */}
        <div 
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "10px",
            background: "rgba(0, 0, 0, 0.02)",
            padding: "10px",
            borderRadius: "10px",
            border: "1px solid var(--border-subtle)"
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "10px", color: "var(--color-text-muted)", fontWeight: "700", textTransform: "uppercase" }}>
              Portfolio Value
            </div>
            <div style={{ fontSize: "clamp(14px, 4.2vw, 18px)", fontWeight: "900", color: "var(--color-text-primary)", marginTop: "2px", overflowWrap: "anywhere" }}>
              ₹{(account?.total_portfolio_value ?? 100000).toLocaleString("en-IN", { maximumFractionDigits: 1 })}
            </div>
            <div style={{ fontSize: "10px", fontWeight: "700", color: isProfit ? "var(--color-buy)" : "var(--color-sell)", marginTop: "1px", overflowWrap: "anywhere" }}>
              {isProfit ? "▲ +" : "▼ "}₹{Math.abs(account?.total_pnl ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })} ({account?.total_pnl_pct.toFixed(2)}%)
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "10px", color: "var(--color-text-muted)", fontWeight: "700", textTransform: "uppercase" }}>
              Available Cash
            </div>
            <div style={{ fontSize: "clamp(14px, 4.2vw, 18px)", fontWeight: "900", color: "#38bdf8", marginTop: "2px", overflowWrap: "anywhere" }}>
              ₹{(account?.available_cash ?? 100000).toLocaleString("en-IN", { maximumFractionDigits: 1 })}
            </div>
            <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginTop: "1px" }}>
              {account?.holdings.length ?? 0} eq • {account?.futures_positions?.length ?? 0} fut active
            </div>
          </div>
        </div>

        {/* Action Button: Jump to Paper Trading */}
        <button
          onClick={() => onNavigateTab("papertrading")}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: "8px",
            background: "var(--accent-ml)",
            color: "#ffffff",
            fontWeight: "800",
            fontSize: "13px",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(79, 70, 229, 0.25)"
          }}
        >
          View Full Paper Trading Portfolio →
        </button>
      </div>

      {/* Ten Named Traders Grid */}
      <div className="glass-panel" style={{ padding: "clamp(14px, 4vw, 18px)", display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>
        <div>
          <h3 style={{ fontSize: "15px", fontWeight: "800", color: "var(--color-text-primary)", margin: 0 }}>
            👥 Select Trading User (10 Profiles)
          </h3>
          <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", margin: "4px 0 0 0" }}>
            Tap any user to instantly switch to their independent ₹1,00,000 simulated account. No password or login required.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
          {PAPER_TRADING_USERS.map((user) => {
            const isSelected = user.id === activeUser.id;
            return (
              <button
                key={user.id}
                onClick={() => handleSelectUser(user)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 8px",
                  borderRadius: "10px",
                  border: isSelected ? "2px solid var(--accent-ml)" : "1px solid var(--border-subtle)",
                  background: isSelected ? "rgba(79, 70, 229, 0.08)" : "var(--bg-card)",
                  color: isSelected ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                  outline: "none",
                  minWidth: 0,
                  width: "100%"
                }}
              >
                <div 
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "50%",
                    background: isSelected ? "var(--accent-ml)" : "rgba(0, 0, 0, 0.06)",
                    color: isSelected ? "#ffffff" : "var(--color-text-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "800",
                    fontSize: "11px",
                    flexShrink: 0
                  }}
                >
                  {user.name.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ overflow: "hidden", minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: isSelected ? "900" : "700", fontSize: "13px", color: isSelected ? "var(--accent-ml)" : "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user.name}
                  </div>
                  <div style={{ fontSize: "9px", color: "var(--color-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {isSelected ? "Active Account" : "Tap to Switch"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Account Settings & Reset Virtual Funds */}
      <div className="glass-panel" style={{ padding: "clamp(14px, 4vw, 18px)", display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>
        <h3 style={{ fontSize: "14px", fontWeight: "800", color: "var(--color-text-primary)", margin: 0 }}>
          ⚙️ Account Actions
        </h3>

        {resetMessage && (
          <div 
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              background: resetMessage.includes("Success") ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
              border: `1px solid ${resetMessage.includes("Success") ? "var(--color-buy)" : "var(--color-sell)"}`,
              fontSize: "12px",
              color: resetMessage.includes("Success") ? "var(--color-buy)" : "var(--color-sell)"
            }}
          >
            {resetMessage}
          </div>
        )}

        {confirmReset ? (
          <div 
            style={{
              padding: "14px",
              borderRadius: "10px",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid var(--color-sell)",
              display: "flex",
              flexDirection: "column",
              gap: "10px"
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--color-text-primary)", fontWeight: "600" }}>
              Are you sure you want to reset <strong>{activeUser.name}</strong>&apos;s virtual account? This restores available cash to ₹1,00,000.00 and clears their simulated Equity holdings and Futures positions. Other users will not be affected.
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                onClick={() => setConfirmReset(false)}
                disabled={resetting}
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "6px",
                  background: "transparent",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleResetFunds}
                disabled={resetting}
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "6px",
                  background: "var(--color-sell)",
                  color: "#ffffff",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: "800",
                  cursor: "pointer"
                }}
              >
                {resetting ? "Resetting..." : `Confirm Reset`}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              width: "100%",
              whiteSpace: "normal",
              textAlign: "center",
              padding: "10px 16px",
              borderRadius: "8px",
              background: "rgba(239, 68, 68, 0.06)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              color: "var(--color-sell)",
              fontWeight: "700",
              fontSize: "13px",
              cursor: "pointer"
            }}
          >
            <span>🔄</span>
            <span>Reset {activeUser.name}&apos;s Funds to ₹1,00,000</span>
          </button>
        )}
      </div>

      {/* App & System Information */}
      <div className="glass-panel" style={{ padding: "clamp(12px, 3.5vw, 16px)", fontSize: "11px", color: "var(--color-text-muted)", display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
        <div><strong>Vanguard Stocks Dashboard</strong> v2.1 Mobile-First Edition</div>
        <div>NSE Live Market Feeds • 6-Agent Consensus Engine • Zero Brokerage Paper Trading</div>
        <div>Optimized for Android, iPhone, iPad, and Modern Web Browsers</div>
      </div>
    </div>
  );
}

