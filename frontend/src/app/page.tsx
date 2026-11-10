"use client";

import React, { useEffect, useState, useRef } from "react";
import { 
  fetchMarketStatus, 
  fetchStocks, 
  fetchStockDetail, 
  fetchStockChart,
  injectNews,
  StockOverview, 
  MarketStatus, 
  StockDetail, 
  ChartDataPoint,
  WS_BASE,
  getWsBase
} from "../utils/api";

import DashboardHeader from "../components/DashboardHeader";
import StockSelector from "../components/StockSelector";
import AgentTerminal from "../components/AgentTerminal";
import OpportunitiesDashboard from "../components/OpportunitiesDashboard";
import FuturesResearch from "../components/FuturesResearch";
import FuturesScanners from "../components/FuturesScanners";
import ProbabilityHeatmap from "../components/ProbabilityHeatmap";
import ShortTermPicks from "../components/ShortTermPicks";
import MultiBaggerPicks from "../components/MultiBaggerPicks";
import PaperTradingDashboard from "../components/PaperTradingDashboard";
import TradeModal from "../components/TradeModal";
import MobileBottomNav, { MobileTab } from "../components/MobileBottomNav";
import UserProfileView from "../components/UserProfileView";
import { fetchPaperAccount, PaperAccount, TradingUser, getActiveTradingUser } from "../utils/api";

export default function Home() {
  const [stocks, setStocks] = useState<StockOverview[]>([]);
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [selectedTicker, setSelectedTicker] = useState("RELIANCE");
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [chartInterval, setChartInterval] = useState("1d");

  // Desktop active tab
  const [activeTab, setActiveTab] = useState<
    "opportunities" | "shortterm" | "multibagger" | "papertrading" | "research" | "heatmap" | "stream" | "scanners" | "profile"
  >("opportunities");

  // Mobile bottom navigation tab state
  const [mobileTab, setMobileTab] = useState<MobileTab>("home");

  // Mobile sub-pill filters
  const [mobileOppSubTab, setMobileOppSubTab] = useState<"futures" | "shortterm" | "multibagger" | "scanners">("futures");
  const [mobileResearchSubTab, setMobileResearchSubTab] = useState<"deepdive" | "heatmap" | "stream">("deepdive");

  // Global Paper Trading Modal states
  const [activePaperUser, setActivePaperUser] = useState<TradingUser>(getActiveTradingUser());
  const [globalTradeModalOpen, setGlobalTradeModalOpen] = useState(false);
  const [modalTradeTicker, setModalTradeTicker] = useState("RELIANCE");
  const [modalTradeType, setModalTradeType] = useState<"BUY" | "SELL">("BUY");
  const [paperAccount, setPaperAccount] = useState<PaperAccount | null>(null);

  // WebSocket / streaming states
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Initial load
  const loadMarketAndStocks = async () => {
    try {
      const statusRes = await fetchMarketStatus();
      setMarketStatus(statusRes);
      setMarketError(null);
      
      const stocksRes = await fetchStocks();
      setStocks(stocksRes);
    } catch (e: any) {
      console.error("Error fetching initial load:", e);
      setMarketError(e?.message || "Failed to load live market feed.");
    }
  };

  useEffect(() => {
    loadMarketAndStocks();
    const pollInterval = marketStatus?.is_market_open ? 10000 : 30000;
    const interval = setInterval(loadMarketAndStocks, pollInterval);
    return () => clearInterval(interval);
  }, [marketStatus?.is_market_open]);

  // On ticker change, load full detail & chart
  const loadTickerDetails = async (ticker: string) => {
    try {
      const detailRes = await fetchStockDetail(ticker);
      setDetail(detailRes);
      
      const chartRes = await fetchStockChart(ticker, chartInterval);
      setChartData(chartRes);
    } catch (e) {
      console.error(`Error loading details for ${ticker}:`, e);
    }
  };

  useEffect(() => {
    loadTickerDetails(selectedTicker);
  }, [selectedTicker, chartInterval]);

  // Connect to WebSocket streaming
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      const wsUrl = getWsBase();
      ws = new WebSocket(`${wsUrl}/ws/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws?.send(JSON.stringify({ subscribe: selectedTicker }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.ticker === selectedTicker) {
            setStocks((prev) => 
              prev.map((s) => 
                s.ticker === data.ticker 
                  ? { ...s, price: data.price || data.simulated_price, change_pct: data.pct_change !== undefined ? data.pct_change : s.change_pct } 
                  : s
              )
            );

            if (detail && detail.ticker === data.ticker) {
              setDetail((prev) => prev ? { ...prev, master_score: data.master_score, recommendation: data.recommendation } : null);
            }

            setTerminalLogs((prev) => {
              const combined = [...prev, ...data.agent_logs];
              return combined.slice(-60);
            });
          }
        } catch (err) {
          console.error("Error processing WebSocket message:", err);
        }
      };

      ws.onerror = (e) => {
        console.warn("WebSocket disconnected or unsupported:", e);
      };
    } catch (err) {
      console.warn("WebSocket connection could not be established:", err);
    }

    return () => {
      if (ws) ws.close();
    };
  }, [selectedTicker]);

  // Handle stock select
  const handleSelectStock = (ticker: string) => {
    setSelectedTicker(ticker);
    setTerminalLogs([]);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ subscribe: ticker }));
    }
  };

  // Switch to research view and select stock
  const handleInspectStockInResearch = (ticker: string) => {
    handleSelectStock(ticker);
    setActiveTab("research");
    setMobileTab("research");
    setMobileResearchSubTab("deepdive");
  };

  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail) {
        handleInspectStockInResearch(e.detail);
      }
    };
    window.addEventListener("select-stock", handler);

    // Initial load of paper trading account for current active user
    const currentUid = activePaperUser?.id || getActiveTradingUser().id;
    fetchPaperAccount(currentUid).then(setPaperAccount).catch(console.error);

    // Listen for paper trading triggers from any stock card or table
    const tradeHandler = (e: any) => {
      if (e.detail?.ticker) {
        setModalTradeTicker(e.detail.ticker);
        setModalTradeType(e.detail.type || "BUY");
        setGlobalTradeModalOpen(true);
      }
    };
    window.addEventListener("open-paper-trade", tradeHandler);

    // Listen for user switches across the dashboard
    const userChangeHandler = (e: any) => {
      if (e.detail) {
        setActivePaperUser(e.detail);
        fetchPaperAccount(e.detail.id).then(setPaperAccount).catch(console.error);
      }
    };
    window.addEventListener("paper-user-changed", userChangeHandler);

    // Listen for paper trading order execution across the dashboard
    const accountUpdateHandler = (e: any) => {
      if (e.detail?.account) {
        setPaperAccount(e.detail.account);
      }
    };
    window.addEventListener("paper-account-updated", accountUpdateHandler);

    return () => {
      window.removeEventListener("select-stock", handler);
      window.removeEventListener("open-paper-trade", tradeHandler);
      window.removeEventListener("paper-user-changed", userChangeHandler);
      window.removeEventListener("paper-account-updated", accountUpdateHandler);
    };
  }, [selectedTicker, activePaperUser?.id]);

  // Map mobile tab change to active views
  const handleMobileTabChange = (tab: MobileTab) => {
    setMobileTab(tab);
    if (tab === "home") {
      setActiveTab("opportunities");
      setMobileOppSubTab("futures");
    } else if (tab === "opportunities") {
      setActiveTab(
        mobileOppSubTab === "futures" ? "opportunities" :
        mobileOppSubTab === "shortterm" ? "shortterm" :
        mobileOppSubTab === "multibagger" ? "multibagger" : "scanners"
      );
    } else if (tab === "papertrading") {
      setActiveTab("papertrading");
    } else if (tab === "research") {
      setActiveTab(
        mobileResearchSubTab === "deepdive" ? "research" :
        mobileResearchSubTab === "heatmap" ? "heatmap" : "stream"
      );
    } else if (tab === "profile") {
      setActiveTab("profile");
    }
  };

  return (
    <div className="page-main-container">
      {/* Top Header */}
      <DashboardHeader 
        status={marketStatus} 
        onRefresh={loadMarketAndStocks} 
        error={marketError} 
        onOpenProfile={() => {
          setActiveTab("profile");
          setMobileTab("profile");
        }}
        activeUserName={activePaperUser.name}
      />

      {/* Desktop Tab Switcher (Visible >= 768px via CSS) */}
      <div className="desktop-tab-container tab-container">
        {[
          { id: "opportunities", label: "🏠 Opportunities" },
          { id: "shortterm", label: "⚡ Short-Term Alpha" },
          { id: "multibagger", label: "🚀 Multi-Bagger Picks" },
          { id: "papertrading", label: "📈 Paper Trading" },
          { id: "research", label: "🔬 AI Research" },
          { id: "heatmap", label: "🔮 Probability Treemap" },
          { id: "stream", label: "📡 Live Console" },
          { id: "scanners", label: "🔍 Income Scanners" }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as any);
              if (tab.id === "opportunities") {
                setMobileTab("home");
                setMobileOppSubTab("futures");
              } else if (tab.id === "shortterm" || tab.id === "multibagger" || tab.id === "scanners") {
                setMobileTab("opportunities");
                setMobileOppSubTab(tab.id as any);
              } else if (tab.id === "papertrading") {
                setMobileTab("papertrading");
              } else if (tab.id === "research" || tab.id === "heatmap" || tab.id === "stream") {
                setMobileTab("research");
                setMobileResearchSubTab(tab.id === "research" ? "deepdive" : (tab.id as any));
              }
            }}
            style={{
              fontSize: "12.5px",
              padding: "7px 12px",
              border: "1px solid " + (activeTab === tab.id ? "var(--accent-ml)" : "var(--border-subtle)"),
              borderRadius: "8px",
              background: activeTab === tab.id ? "var(--accent-ml)" : "var(--bg-card)",
              color: activeTab === tab.id ? "#ffffff" : "var(--color-text-secondary)",
              fontWeight: "700",
              cursor: "pointer",
              transition: "all 0.15s ease",
              boxShadow: activeTab === tab.id ? "0 4px 12px rgba(79, 70, 229, 0.25)" : "none"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mobile Sub-Tab Pills for Home & Opportunities (< 768px only via CSS) */}
      {(mobileTab === "opportunities" || mobileTab === "home") && (
        <div className="mobile-only-flex hide-scrollbar mobile-subtabs-bar">
          {[
            { id: "futures", label: "⚡ Futures Income", target: "opportunities" },
            { id: "shortterm", label: "⚡ Short-Term Alpha", target: "shortterm" },
            { id: "multibagger", label: "🚀 Multi-Baggers", target: "multibagger" },
            { id: "scanners", label: "🔍 Income Scanners", target: "scanners" }
          ].map((sub) => {
            const isSubActive = activeTab === sub.target;
            return (
              <button
                key={sub.id}
                onClick={() => {
                  setMobileTab(sub.id === "futures" && mobileTab === "home" ? "home" : "opportunities");
                  setMobileOppSubTab(sub.id as any);
                  setActiveTab(sub.target as any);
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: "800",
                  whiteSpace: "nowrap",
                  background: isSubActive ? "var(--accent-ml)" : "var(--bg-card)",
                  color: isSubActive ? "#ffffff" : "var(--color-text-secondary)",
                  border: isSubActive ? "1px solid var(--accent-ml)" : "1px solid var(--border-subtle)",
                  cursor: "pointer",
                  boxShadow: isSubActive ? "0 2px 8px rgba(79, 70, 229, 0.25)" : "none"
                }}
              >
                {sub.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Mobile Sub-Tab Pills for AI Research (< 768px only via CSS) */}
      {mobileTab === "research" && (
        <div className="mobile-only-flex hide-scrollbar mobile-subtabs-bar">
          {[
            { id: "deepdive", label: "🔬 Deep Dive & Chart", target: "research" },
            { id: "heatmap", label: "🔮 Probability Treemap", target: "heatmap" },
            { id: "stream", label: "📡 Live Console", target: "stream" }
          ].map((sub) => {
            const isSubActive = mobileResearchSubTab === sub.id;
            return (
              <button
                key={sub.id}
                onClick={() => {
                  setMobileResearchSubTab(sub.id as any);
                  setActiveTab(sub.target as any);
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: "800",
                  whiteSpace: "nowrap",
                  background: isSubActive ? "var(--accent-ml)" : "var(--bg-card)",
                  color: isSubActive ? "#ffffff" : "var(--color-text-secondary)",
                  border: isSubActive ? "1px solid var(--accent-ml)" : "1px solid var(--border-subtle)",
                  cursor: "pointer",
                  boxShadow: isSubActive ? "0 2px 8px rgba(79, 70, 229, 0.25)" : "none"
                }}
              >
                {sub.label}
              </button>
            );
          })}
        </div>
      )}

      {/* View 1: Opportunities / Home */}
      {activeTab === "opportunities" && (
        <div className="animate-fade-in">
          <OpportunitiesDashboard 
            onSelectStock={handleInspectStockInResearch} 
            onNavigateToTab={(tab) => {
              if (tab === "dashboard") {
                setActiveTab("opportunities");
                setMobileTab("home");
                setMobileOppSubTab("futures");
              } else if (tab === "research") {
                setActiveTab("research");
                setMobileTab("research");
                setMobileResearchSubTab("deepdive");
              } else if (tab === "scanners") {
                setActiveTab("scanners");
                setMobileTab("opportunities");
                setMobileOppSubTab("scanners");
              } else if (tab === "stream") {
                setActiveTab("stream");
                setMobileTab("research");
                setMobileResearchSubTab("stream");
              }
            }} 
          />
        </div>
      )}

      {/* View 2: Short Term Picks */}
      {activeTab === "shortterm" && (
        <div className="animate-fade-in">
          <ShortTermPicks onSelectStock={handleInspectStockInResearch} />
        </div>
      )}

      {/* View 3: Research Workspace */}
      {activeTab === "research" && (
        <div className="animate-fade-in research-layout-grid" style={{ alignItems: "start" }}>
          <StockSelector 
            stocks={stocks} 
            selectedTicker={selectedTicker} 
            onSelect={handleSelectStock} 
          />
          <FuturesResearch
            selectedTicker={selectedTicker}
            chartData={chartData}
            chartInterval={chartInterval}
            onIntervalChange={setChartInterval}
          />
        </div>
      )}

      {/* View 4: Probability Heatmap */}
      {activeTab === "heatmap" && (
        <div className="animate-fade-in">
          <ProbabilityHeatmap 
            stocks={stocks} 
            onSelectStock={handleInspectStockInResearch}
            onSwitchTab={(tab) => {
              const target = tab === "terminal" ? "research" : tab;
              setActiveTab(target as any);
              if (target === "research") {
                setMobileTab("research");
                setMobileResearchSubTab("deepdive");
              }
            }}
          />
        </div>
      )}

      {/* View 5: Live Streaming Console */}
      {activeTab === "stream" && (
        <div className="glass-panel animate-fade-in" style={{ padding: "clamp(12px, 3.5vw, 18px)", display: "flex", flexDirection: "column", gap: "12px" }}>
          <h3 style={{ fontSize: "clamp(13px, 3.5vw, 14px)", fontWeight: "800", color: "var(--color-text-primary)", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "6px" }}>
            📡 Real-Time Agent Logs & Consensus Stream (WebSocket Ticks)
          </h3>
          <AgentTerminal logs={terminalLogs} />
        </div>
      )}

      {/* View 6: Futures Scanners */}
      {activeTab === "scanners" && (
        <div className="animate-fade-in">
          <FuturesScanners />
        </div>
      )}

      {/* View 7: Multi-Bagger Picks */}
      {activeTab === "multibagger" && (
        <div className="animate-fade-in">
          <MultiBaggerPicks onSelectStock={handleInspectStockInResearch} />
        </div>
      )}

      {/* View 8: Paper Trading */}
      {activeTab === "papertrading" && (
        <div className="animate-fade-in">
          <PaperTradingDashboard 
            stocks={stocks} 
            initialAccount={paperAccount}
            onAccountUpdated={setPaperAccount}
            onSelectStock={handleInspectStockInResearch} 
          />
        </div>
      )}

      {/* View 9: Mobile Profile & 10 User Switcher */}
      {activeTab === "profile" && (
        <div className="animate-fade-in">
          <UserProfileView
            activeUser={activePaperUser}
            account={paperAccount}
            onUserChanged={(u) => setActivePaperUser(u)}
            onAccountUpdated={(acc) => setPaperAccount(acc)}
            onNavigateTab={(tab) => {
              setActiveTab(tab as any);
              if (tab === "papertrading") setMobileTab("papertrading");
              else if (tab === "opportunities") setMobileTab("home");
              else if (tab === "research") setMobileTab("research");
            }}
          />
        </div>
      )}

      {/* Global Trade Execution Modal (Mobile Bottom-Sheet) */}
      {(() => {
        const modalStock = stocks.find((s) => s.ticker === modalTradeTicker);
        const modalHolding = paperAccount?.holdings.find((h) => h.ticker === modalTradeTicker);
        const modalPrice = modalStock?.price || modalHolding?.current_price || 1000.0;
        const modalOwnedQty = modalHolding?.quantity || 0;
        return (
          <TradeModal
            isOpen={globalTradeModalOpen}
            onClose={() => setGlobalTradeModalOpen(false)}
            ticker={modalTradeTicker}
            initialOrderType={modalTradeType}
            currentPrice={modalPrice}
            availableCash={paperAccount?.available_cash ?? 100000.0}
            ownedQuantity={modalOwnedQty}
            userId={activePaperUser.id}
            onTradeExecuted={(updated) => {
              setPaperAccount(updated);
            }}
          />
        );
      })()}

      {/* Mobile Fixed Bottom Navigation Bar (Active on mobile screens < 768px) */}
      <MobileBottomNav
        activeTab={mobileTab}
        onChangeTab={handleMobileTabChange}
        holdingsCount={paperAccount?.holdings.length ?? 0}
        userName={activePaperUser.name}
      />
    </div>
  );
}
