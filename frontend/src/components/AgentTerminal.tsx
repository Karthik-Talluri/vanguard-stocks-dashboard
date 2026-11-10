import React, { useEffect, useRef } from "react";

interface AgentTerminalProps {
  logs: string[];
}

export default function AgentTerminal({ logs }: AgentTerminalProps) {
  const terminalEndRef = useRef<HTMLDivElement | null>(null);



  return (
    <div className="glass-panel" style={{ background: "var(--bg-terminal)", border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "clamp(10px, 3vw, 16px)", height: "clamp(220px, 40vh, 320px)", display: "flex", flexDirection: "column", gap: "10px", overflow: "hidden" }}>
      {/* Terminal Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "8px", fontSize: "11px", fontFamily: "var(--font-mono, monospace)", color: "var(--color-text-secondary)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ff5f56", flexShrink: 0 }}></span>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ffbd2e", flexShrink: 0 }}></span>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#27c93f", flexShrink: 0 }}></span>
          <span style={{ marginLeft: "4px", color: "var(--accent-ml)", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>agent_consensus_stream.sh</span>
        </div>
        <div style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>Active: 8 Agents</div>
      </div>

      {/* Terminal logs */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px", fontFamily: "var(--font-mono, monospace)", fontSize: "12px", color: "var(--color-text-primary)" }} className="hide-scrollbar">
        {logs.length === 0 ? (
          <div style={{ color: "var(--color-text-muted)" }}>Initializing agent workspace. Awaiting WebSocket ticks...</div>
        ) : (
          logs.map((log, index) => {
            // Highlight agent names
            let lineContent = log;
            let logColor = "var(--color-text-primary)";
            
            if (log.includes("[System]")) {
              logColor = "var(--color-text-secondary)";
            } else if (log.includes("[Regime Agent]")) {
              logColor = "var(--accent-regime)";
            } else if (log.includes("[Technical Agent]")) {
              logColor = "var(--accent-tech)";
            } else if (log.includes("[News Agent]")) {
              logColor = "#d01760"; // Deep pink/red for light mode readability
            } else if (log.includes("[ML Agent]")) {
              logColor = "var(--accent-ml)";
            } else if (log.includes("[Master AI]")) {
              if (log.includes("BUY")) {
                logColor = "var(--color-buy)";
              } else if (log.includes("SELL")) {
                logColor = "var(--color-sell)";
              } else {
                logColor = "var(--color-hold)";
              }
            }

            return (
              <div key={index} style={{ color: logColor, wordBreak: "break-word", overflowWrap: "anywhere", borderLeft: "2px solid var(--border-subtle)", paddingLeft: "8px" }}>
                <span style={{ color: "var(--color-text-muted)", marginRight: "6px" }}>$</span>
                {lineContent}
              </div>
            );
          })
        )}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
}
