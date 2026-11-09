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
import { fetchPaperAccount, PaperAccount, TradingUser, getActiveTradingUser } from "../utils/api";

export default function Home() {
  const [stocks, setStocks] = useState<StockOverview[]>([]);
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [selectedTicker, setSelectedTicker] = useState("RELIANCE");
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [chartInterval, setChartInterval] = useState("1d");
  const [activeTab, setActiveTab] = useState<"opportunities" | "shortterm" | "multibagger" | "papertrading" | "research" | "heatmap" | "stream" | "scanners">("opportunities");

  // Global Paper Trading Modal states
  const [activePaperUser, setActivePaperUser] = useState<TradingUser>(getActiveTradingUser());
  const [globalTradeModalOpen, setGlobalTradeModalOpen] = useState(false);
  const [modalTradeTicker, setModalTradeTicker] = useState("RELIANCE");
  const [modalTradeType, setModalTradeType] = useState<"BUY" | "SELL">("BUY");
  const [paperAccount, setPaperAccount] = useState<PaperAccount | null>(null);

  // WebSocket / streaming states
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // News Injector states
  const [newsHeadline, setNewsHeadline] = useState("");
  const [newsSentiment, setNewsSentiment] = useState(0.8);
  const [injecting, setInjecting] = useState(false);
  const [injectSuccess, setInjectSuccess] = useState("");

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
        console.log("WebSocket connected. Subscribing to:", selectedTicker);
        ws?.send(JSON.stringify({ subscribe: selectedTicker }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.ticker === selectedTicker) {
            // 1. Update prices in list and details dynamically
            setStocks((prev) => 
              prev.map((s) => 
                s.ticker === data.ticker 
                  ? { ...s, price: data.price || data.simulated_price, change_pct: data.pct_change !== undefined ? data.pct_change : s.change_pct } 
                  : s
              )
            );

            if (detail && detail.ticker === data.ticker) {
              // Adjust master score dynamically if ticked
              setDetail((prev) => prev ? { ...prev, master_score: data.master_score, recommendation: data.recommendation } : null);
            }

            // 2. Append new streaming log lines
            setTerminalLogs((prev) => {
              const combined = [...prev, ...data.agent_logs];
              return combined.slice(-60); // limit to last 60 entries
            });
          }
        } catch (err) {
          console.error("Error processing WebSocket message:", err);
        }
      };

      ws.onerror = (e) => {
        console.warn("WebSocket disconnected or unsupported:", e);
      };

      ws.onclose = () => {
        console.log("WebSocket connection closed.");
      };
    } catch (err) {
      console.warn("WebSocket connection could not be established:", err);
    }

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [selectedTicker]);

  // Handle stock select
  const handleSelectStock = (ticker: string) => {
    setSelectedTicker(ticker);
    setTerminalLogs([]); // clear log window for fresh streaming
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ subscribe: ticker }));
    }
  };

  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail) {
        handleSelectStock(e.detail);
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

    return () => {
      window.removeEventListener("select-stock", handler);
      window.removeEventListener("open-paper-trade", tradeHandler);
      window.removeEventListener("paper-user-changed", userChangeHandler);
    };
  }, [selectedTicker, activePaperUser?.id]);

  // Inject Custom Headline
  const handleInjectNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsHeadline) return;
    setInjecting(true);
    setInjectSuccess("");
    try {
      await injectNews(selectedTicker, newsHeadline, newsSentiment);
      setInjectSuccess("Headline injected! Scoring engine recalculating...");
      setNewsHeadline("");
      // Refresh details and stocks immediately
      await loadTickerDetails(selectedTicker);
      const stocksRes = await fetchStocks();
      setStocks(stocksRes);
    } catch (e) {
      console.error(e);
      setInjectSuccess("Failed to inject headline.");
    }
    setInjecting(false);
  };

  const currentSector = detail ? String(detail.fundamentals_meta?.sector) : "";
  const sectorsRs = detail?.agents?.["Sector Agent"]?.metrics?.all_sectors_rs || {};
  const sectorsRs5d = detail?.agents?.["Sector Agent"]?.metrics?.all_sectors_rs_5d || {};


  return (
    <div style={{ padding: "12px 16px", maxWidth: "100%", width: "100%", display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Top Header */}
      <DashboardHeader status={marketStatus} onRefresh={loadMarketAndStocks} error={marketError} />

      {/* Tab Switcher */}
      <div className="tab-container" style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "12px", marginTop: "-4px" }}>
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
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              fontSize: "13px",
              padding: "8px 16px",
              border: "1px solid " + (activeTab === tab.id ? "var(--accent-ml)" : "var(--border-subtle)"),
              borderRadius: "8px",
              background: activeTab === tab.id ? "var(--accent-ml)" : "var(--bg-card)",
              color: activeTab === tab.id ? "#ffffff" : "var(--color-text-secondary)",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: activeTab === tab.id ? "0 4px 12px rgba(79, 70, 229, 0.25)" : "none"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Rendering tab contents */}
      {activeTab === "opportunities" && (
        <div className="animate-fade-in">
          <OpportunitiesDashboard 
            onSelectStock={handleSelectStock} 
            onNavigateToTab={(tab) => {
              if (tab === "dashboard") {
                setActiveTab("opportunities");
              } else {
                setActiveTab(tab as any);
              }
            }} 
          />
        </div>
      )}

      {activeTab === "shortterm" && (
        <div className="animate-fade-in">
          <ShortTermPicks onSelectStock={handleSelectStock} />
        </div>
      )}

      {activeTab === "research" && (
        <div className="animate-fade-in research-layout-grid" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: "16px", alignItems: "start" }}>
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

      {activeTab === "heatmap" && (
        <div className="animate-fade-in">
          <ProbabilityHeatmap 
            stocks={stocks} 
            onSelectStock={handleSelectStock}
            onSwitchTab={(tab) => setActiveTab((tab === "terminal" ? "research" : tab) as any)}
          />
        </div>
      )}

      {activeTab === "stream" && (
        <div className="glass-panel animate-fade-in" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <h3 style={{ fontSize: "14px", fontWeight: "800", color: "var(--color-text-primary)", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "6px" }}>
            📡 Real-Time Agent Logs & Consensus Stream (WebSocket Ticks)
          </h3>
          <AgentTerminal logs={terminalLogs} />
        </div>
      )}

      {activeTab === "scanners" && (
        <div className="animate-fade-in">
          <FuturesScanners />
        </div>
      )}

      {activeTab === "multibagger" && (
        <div className="animate-fade-in">
          <MultiBaggerPicks onSelectStock={handleSelectStock} />
        </div>
      )}

      {activeTab === "papertrading" && (
        <div className="animate-fade-in">
          <PaperTradingDashboard 
            stocks={stocks} 
            onSelectStock={(t) => {
              handleSelectStock(t);
              setActiveTab("research");
            }} 
          />
        </div>
      )}

      {/* Global Trade Execution Modal */}
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

    </div>
  );
}
