"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  StockOverview,
  getLocalWatchlistTickers,
  fetchWatchlist,
  addToWatchlist,
  removeFromWatchlist,
} from "../utils/api";

interface WatchlistViewProps {
  stocks: StockOverview[];
  userId: string;
  userName: string;
  onSelectStock: (ticker: string) => void;
}

// -------------------------------------------------------------
// NSE Official Sector Classification Mapping (All 50 NIFTY Stocks)
// -------------------------------------------------------------
const NSE_SECTOR_MAP: Record<string, string> = {
  // Automobile and Auto Components
  TATAMOTORS: "Automobile and Auto Components",
  MARUTI: "Automobile and Auto Components",
  BAJAJ_AUTO: "Automobile and Auto Components",
  "BAJAJ-AUTO": "Automobile and Auto Components",
  HEROMOTOCO: "Automobile and Auto Components",
  MM: "Automobile and Auto Components",
  "M&M": "Automobile and Auto Components",
  EICHERMOT: "Automobile and Auto Components",

  // Capital Goods
  ADANIENT: "Capital Goods",
  BEL: "Capital Goods",
  SIEMENS: "Capital Goods",
  ABB: "Capital Goods",
  HAL: "Capital Goods",
  BHEL: "Capital Goods",

  // Construction
  LT: "Construction",

  // Construction Materials
  ULTRACEMCO: "Construction Materials",
  GRASIM: "Construction Materials",

  // Consumer Durables
  TITAN: "Consumer Durables",
  ASIANPAINT: "Consumer Durables",
  HAVELLS: "Consumer Durables",

  // Financial Services
  HDFCBANK: "Financial Services",
  ICICIBANK: "Financial Services",
  SBIN: "Financial Services",
  AXISBANK: "Financial Services",
  KOTAKBANK: "Financial Services",
  BAJFINANCE: "Financial Services",
  BAJAJFINSV: "Financial Services",
  INDUSINDBK: "Financial Services",
  SBILIFE: "Financial Services",
  SHRIRAMFIN: "Financial Services",

  // Fast Moving Consumer Goods
  ITC: "Fast Moving Consumer Goods",
  HINDUNILVR: "Fast Moving Consumer Goods",
  BRITANNIA: "Fast Moving Consumer Goods",
  TATACONSUM: "Fast Moving Consumer Goods",
  NESTLEIND: "Fast Moving Consumer Goods",

  // Healthcare
  SUNPHARMA: "Healthcare",
  CIPLA: "Healthcare",
  APOLLOHOSP: "Healthcare",
  DIVISLAB: "Healthcare",
  DRREDDY: "Healthcare",

  // Information Technology
  TCS: "Information Technology",
  INFYS: "Information Technology",
  INFY: "Information Technology",
  WIPRO: "Information Technology",
  HCLTECH: "Information Technology",
  TECHM: "Information Technology",
  LTIM: "Information Technology",

  // Metals & Mining
  TATASTEEL: "Metals & Mining",
  JSWSTEEL: "Metals & Mining",
  HINDALCO: "Metals & Mining",
  COALINDIA: "Metals & Mining",

  // Oil Gas & Consumable Fuels
  RELIANCE: "Oil Gas & Consumable Fuels",
  ONGC: "Oil Gas & Consumable Fuels",
  BPCL: "Oil Gas & Consumable Fuels",
  IOC: "Oil Gas & Consumable Fuels",

  // Power
  POWERGRID: "Power",
  NTPC: "Power",

  // Services
  ADANIPORTS: "Services",

  // Telecommunication
  BHARTIARTL: "Telecommunication",
};

// Full Company Names for polished NSE look
const COMPANY_NAMES: Record<string, string> = {
  RELIANCE: "Reliance Industries",
  TCS: "Tata Consultancy Services",
  INFYS: "Infosys Ltd",
  INFY: "Infosys Ltd",
  HDFCBANK: "HDFC Bank",
  ICICIBANK: "ICICI Bank",
  SBIN: "State Bank of India",
  ITC: "ITC Ltd",
  HINDUNILVR: "Hindustan Unilever",
  TATAMOTORS: "Tata Motors",
  MARUTI: "Maruti Suzuki",
  SUNPHARMA: "Sun Pharma",
  CIPLA: "Cipla Ltd",
  TATASTEEL: "Tata Steel",
  JSWSTEEL: "JSW Steel",
  LT: "Larsen & Toubro",
  AXISBANK: "Axis Bank",
  KOTAKBANK: "Kotak Mahindra Bank",
  BHARTIARTL: "Bharti Airtel",
  WIPRO: "Wipro Ltd",
  HCLTECH: "HCL Technologies",
  TECHM: "Tech Mahindra",
  LTIM: "LTIMindtree",
  TITAN: "Titan Company",
  BAJFINANCE: "Bajaj Finance",
  BAJAJFINSV: "Bajaj Finserv",
  BAJAJ_AUTO: "Bajaj Auto",
  "BAJAJ-AUTO": "Bajaj Auto",
  HEROMOTOCO: "Hero MotoCorp",
  MM: "Mahindra & Mahindra",
  "M&M": "Mahindra & Mahindra",
  EICHERMOT: "Eicher Motors",
  ADANIENT: "Adani Enterprises",
  ADANIPORTS: "Adani Ports & SEZ",
  POWERGRID: "Power Grid Corp",
  NTPC: "NTPC Ltd",
  ONGC: "Oil & Natural Gas Corp",
  BPCL: "Bharat Petroleum",
  IOC: "Indian Oil Corp",
  COALINDIA: "Coal India",
  ASIANPAINT: "Asian Paints",
  BRITANNIA: "Britannia Industries",
  TATACONSUM: "Tata Consumer Products",
  NESTLEIND: "Nestle India",
  APOLLOHOSP: "Apollo Hospitals",
  DIVISLAB: "Divi's Laboratories",
  DRREDDY: "Dr. Reddy's Laboratories",
  HINDALCO: "Hindalco Industries",
  INDUSINDBK: "IndusInd Bank",
  GRASIM: "Grasim Industries",
  ULTRACEMCO: "UltraTech Cement",
  SBILIFE: "SBI Life Insurance",
  SHRIRAMFIN: "Shriram Finance",
};

export function getStockSector(stock: StockOverview): string {
  const ticker = stock.ticker?.toUpperCase().trim();
  if (NSE_SECTOR_MAP[ticker]) return NSE_SECTOR_MAP[ticker];
  const sec = stock.sector || "";
  const secLower = sec.toLowerCase();
  if (secLower.includes("auto")) return "Automobile and Auto Components";
  if (secLower.includes("bank") || secLower.includes("financ")) return "Financial Services";
  if (secLower.includes("it") || secLower.includes("tech")) return "Information Technology";
  if (secLower.includes("pharma") || secLower.includes("health")) return "Healthcare";
  if (secLower.includes("metal") || secLower.includes("min")) return "Metals & Mining";
  if (secLower.includes("cement") || secLower.includes("material")) return "Construction Materials";
  if (secLower.includes("construct") || secLower.includes("realt")) return "Construction";
  if (secLower.includes("durable") || secLower.includes("paint")) return "Consumer Durables";
  if (secLower.includes("fmcg") || secLower.includes("consumer")) return "Fast Moving Consumer Goods";
  if (secLower.includes("power") || secLower.includes("utilit")) return "Power";
  if (secLower.includes("energy") || secLower.includes("oil") || secLower.includes("gas") || secLower.includes("fuel")) {
    return "Oil Gas & Consumable Fuels";
  }
  if (secLower.includes("capital") || secLower.includes("industr")) return "Capital Goods";
  if (secLower.includes("telecom")) return "Telecommunication";
  if (secLower.includes("service") || secLower.includes("port")) return "Services";
  return sec || "Other Sectors";
}

type WatchlistTab = "nifty50" | "watchlist1";
type SortOption = "default" | "price_desc" | "price_asc" | "gainers" | "losers";

export default function WatchlistView({
  stocks,
  userId,
  userName,
  onSelectStock,
}: WatchlistViewProps) {
  // Watchlist tabs: NIFTY 50 and Watchlist 1
  const [activeTab, setActiveTab] = useState<WatchlistTab>("nifty50");

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterModalOpen, setFilterModalOpen] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>("ALL");

  // Collapsed sectors set (defaults to all expanded)
  const [collapsedSectors, setCollapsedSectors] = useState<Record<string, boolean>>({});

  // Active stock quick action sheet (when tapping a stock row)
  const [activeStockDetail, setActiveStockDetail] = useState<StockOverview | null>(null);

  // Saved tickers for Watchlist 1 (user's custom watchlist)
  const [savedTickers, setSavedTickers] = useState<string[]>(() => getLocalWatchlistTickers(userId));
  const [syncing, setSyncing] = useState<boolean>(false);
  const [mutating, setMutating] = useState<boolean>(false);
  const [wlError, setWlError] = useState<string | null>(null);
  const opSeqRef = useRef<number>(0);

  // Sync user watchlist on mount or user change
  useEffect(() => {
    let cancelled = false;
    const startSeq = opSeqRef.current;
    setSyncing(true);
    setWlError(null);
    setSavedTickers(getLocalWatchlistTickers(userId));
    fetchWatchlist(userId)
      .then((tickers) => {
        if (!cancelled && opSeqRef.current === startSeq) {
          setSavedTickers(tickers);
        }
      })
      .catch((err) => {
        if (!cancelled) setWlError(err?.message || "Failed to sync watchlist");
      })
      .finally(() => {
        if (!cancelled) setSyncing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Lookup map of stocks by ticker
  const stocksByTicker = useMemo(() => {
    const map = new Map<string, StockOverview>();
    for (const s of stocks) {
      map.set(s.ticker.toUpperCase().trim(), s);
    }
    return map;
  }, [stocks]);

  // Saved tickers Set for fast membership checks
  const savedSet = useMemo(() => new Set(savedTickers.map((t) => t.toUpperCase().trim())), [savedTickers]);

  // Handle adding ticker to user's Watchlist 1
  const handleAddTicker = async (tickerToAdd: string) => {
    const target = tickerToAdd.trim().toUpperCase();
    if (!target || savedSet.has(target) || mutating) return;
    const mySeq = ++opSeqRef.current;
    setMutating(true);
    setWlError(null);
    try {
      const updated = await addToWatchlist(userId, target);
      if (opSeqRef.current === mySeq) {
        setSavedTickers(updated);
      }
    } catch (err: unknown) {
      setWlError(err instanceof Error ? err.message : `Failed to add ${target} to watchlist`);
    } finally {
      setMutating(false);
    }
  };

  // Handle removing ticker from user's Watchlist 1
  const handleRemoveTicker = async (tickerToRemove: string) => {
    const target = tickerToRemove.trim().toUpperCase();
    if (mutating) return;
    const mySeq = ++opSeqRef.current;
    setMutating(true);
    setWlError(null);
    try {
      const updated = await removeFromWatchlist(userId, target);
      if (opSeqRef.current === mySeq) {
        setSavedTickers(updated);
      }
    } catch (err: unknown) {
      setWlError(err instanceof Error ? err.message : `Failed to remove ${target} from watchlist`);
    } finally {
      setMutating(false);
    }
  };

  // Toggle sector expand/collapse
  const toggleSectorCollapse = (sectorName: string) => {
    setCollapsedSectors((prev) => ({
      ...prev,
      [sectorName]: !prev[sectorName],
    }));
  };

  const collapseAllSectors = (sectorNames: string[]) => {
    const next: Record<string, boolean> = {};
    for (const name of sectorNames) {
      next[name] = true;
    }
    setCollapsedSectors(next);
  };

  const expandAllSectors = () => {
    setCollapsedSectors({});
  };

  // Base list of stocks for current tab
  const tabBaseStocks = useMemo(() => {
    if (activeTab === "nifty50") {
      return stocks;
    } else {
      // Watchlist 1: only saved tickers (preserve user's saved items)
      return savedTickers
        .map((t) => stocksByTicker.get(t.toUpperCase().trim()))
        .filter((s): s is StockOverview => Boolean(s));
    }
  }, [activeTab, stocks, savedTickers, stocksByTicker]);

  // Filtered & sorted stocks for display
  const processedStocks = useMemo(() => {
    let list = [...tabBaseStocks];

    // Search query filter (matches ticker, company name, or sector)
    const q = searchQuery.trim().toUpperCase();
    if (q) {
      list = list.filter((s) => {
        const t = s.ticker.toUpperCase();
        const c = (COMPANY_NAMES[s.ticker] || "").toUpperCase();
        const sec = getStockSector(s).toUpperCase();
        return t.includes(q) || c.includes(q) || sec.includes(q);
      });
    }

    // Sector dropdown filter
    if (selectedSectorFilter !== "ALL") {
      list = list.filter((s) => getStockSector(s) === selectedSectorFilter);
    }

    // Sort order
    if (sortBy === "price_desc") {
      list.sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (sortBy === "price_asc") {
      list.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (sortBy === "gainers") {
      list.sort((a, b) => (b.change_pct || 0) - (a.change_pct || 0));
    } else if (sortBy === "losers") {
      list.sort((a, b) => (a.change_pct || 0) - (b.change_pct || 0));
    } else {
      // Default: Alphabetical by ticker
      list.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }

    return list;
  }, [tabBaseStocks, searchQuery, selectedSectorFilter, sortBy]);

  // Group stocks by sector
  const groupedBySector = useMemo(() => {
    const groups = new Map<string, StockOverview[]>();
    for (const s of processedStocks) {
      const sec = getStockSector(s);
      if (!groups.has(sec)) {
        groups.set(sec, []);
      }
      groups.get(sec)!.push(s);
    }

    // Sort sectors alphabetically
    const sortedSectorEntries = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
    return sortedSectorEntries;
  }, [processedStocks]);

  // Available unique sectors across all stocks for filter dropdown
  const allAvailableSectors = useMemo(() => {
    const set = new Set<string>();
    for (const s of stocks) {
      set.add(getStockSector(s));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [stocks]);

  // Stocks available to add when on Watchlist 1 search mode
  const additionalSearchStocksToAdd = useMemo(() => {
    if (activeTab !== "watchlist1" || !searchQuery.trim()) return [];
    const q = searchQuery.trim().toUpperCase();
    return stocks
      .filter((s) => !savedSet.has(s.ticker.toUpperCase()))
      .filter((s) => {
        const t = s.ticker.toUpperCase();
        const c = (COMPANY_NAMES[s.ticker] || "").toUpperCase();
        const sec = getStockSector(s).toUpperCase();
        return t.includes(q) || c.includes(q) || sec.includes(q);
      })
      .slice(0, 10);
  }, [activeTab, searchQuery, stocks, savedSet]);

  // Total stock count pill (e.g. 50/50 or 14/50)
  const stockCountDisplay = useMemo(() => {
    if (activeTab === "nifty50") {
      return `${processedStocks.length}/${stocks.length || 50}`;
    } else {
      return `${savedTickers.length}/50`;
    }
  }, [activeTab, processedStocks.length, stocks.length, savedTickers.length]);

  return (
    <div
      data-testid="watchlist-view"
      style={{
        maxWidth: "840px",
        margin: "0 auto",
        width: "100%",
        paddingBottom: "100px",
        color: "#ffffff",
      }}
      className="animate-fade-in"
    >
      {/* ------------------------------------------------------------- */}
      {/* TOP WATCHLIST TABS (NIFTY 50 and Watchlist 1)                 */}
      {/* ------------------------------------------------------------- */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid #1a1e2b",
          background: "#0a0b10",
          position: "sticky",
          top: 0,
          zIndex: 30,
          padding: "4px 8px 0 8px",
          gap: "8px",
        }}
      >
        {/* Tab 1: Nifty 50 */}
        <button
          type="button"
          onClick={() => setActiveTab("nifty50")}
          style={{
            padding: "10px 16px 12px 16px",
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "nifty50" ? "2px solid #3b82f6" : "2px solid transparent",
            color: activeTab === "nifty50" ? "#ffffff" : "#8b949e",
            fontSize: "14px",
            fontWeight: activeTab === "nifty50" ? "800" : "600",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.15s ease",
          }}
        >
          <span>NIFTY 50</span>
          <span
            style={{
              fontSize: "10px",
              padding: "2px 6px",
              borderRadius: "10px",
              background: activeTab === "nifty50" ? "rgba(59, 130, 246, 0.2)" : "#161924",
              color: activeTab === "nifty50" ? "#60a5fa" : "#8b949e",
              fontWeight: "700",
            }}
          >
            {stocks.length || 50}
          </span>
        </button>

        {/* Tab 2: Watchlist 1 */}
        <button
          type="button"
          onClick={() => setActiveTab("watchlist1")}
          style={{
            padding: "10px 16px 12px 16px",
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "watchlist1" ? "2px solid #3b82f6" : "2px solid transparent",
            color: activeTab === "watchlist1" ? "#ffffff" : "#8b949e",
            fontSize: "14px",
            fontWeight: activeTab === "watchlist1" ? "800" : "600",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.15s ease",
          }}
        >
          <span>Watchlist 1</span>
          <span
            style={{
              fontSize: "10px",
              padding: "2px 6px",
              borderRadius: "10px",
              background: activeTab === "watchlist1" ? "rgba(59, 130, 246, 0.2)" : "#161924",
              color: activeTab === "watchlist1" ? "#60a5fa" : "#8b949e",
              fontWeight: "700",
            }}
          >
            {savedTickers.length}
          </span>
        </button>

        {/* Sync / User Status Indicator */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
          {syncing && (
            <span style={{ fontSize: "11px", color: "#60a5fa", display: "flex", alignItems: "center", gap: "4px" }}>
              <span className="animate-spin">⟳</span> Syncing
            </span>
          )}
          <span
            style={{
              fontSize: "11px",
              color: "#8b949e",
              background: "#121520",
              padding: "3px 8px",
              borderRadius: "12px",
              border: "1px solid #1c2130",
            }}
          >
            {userName}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SEARCH & ADD BAR (with stock count and filter icon)           */}
      {/* ------------------------------------------------------------- */}
      <div
        style={{
          padding: "12px 10px 8px 10px",
          background: "#08090d",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "#12141c",
            borderRadius: "10px",
            border: "1px solid #222533",
            padding: "0 12px",
            height: "46px",
            gap: "10px",
            transition: "border-color 0.15s ease",
          }}
        >
          {/* Magnifying Glass Search Icon */}
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8b949e"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>

          {/* Search Input */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === "watchlist1" ? "Search & add to Watchlist 1" : "Search & add"}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: "500",
              minWidth: 0,
            }}
          />

          {/* Clear button if text entered */}
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              style={{
                background: "transparent",
                border: "none",
                color: "#8b949e",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}

          {/* Divider */}
          <div style={{ width: "1px", height: "20px", background: "#222533" }} />

          {/* Stock Count (e.g. 50/50 or 14/50) */}
          <div
            style={{
              fontSize: "12px",
              fontWeight: "700",
              color: "#8b949e",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            {stockCountDisplay}
          </div>

          {/* Filter & Sort Icon Button */}
          <button
            type="button"
            onClick={() => setFilterModalOpen(true)}
            aria-label="Filter and Sort options"
            title="Filter and Sort"
            style={{
              background: filterModalOpen || sortBy !== "default" || selectedSectorFilter !== "ALL" ? "#1e2436" : "transparent",
              border: "none",
              padding: "7px",
              borderRadius: "6px",
              color: sortBy !== "default" || selectedSectorFilter !== "ALL" ? "#60a5fa" : "#8b949e",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease",
            }}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          </button>
        </div>

        {/* Active filter badges if any applied */}
        {(sortBy !== "default" || selectedSectorFilter !== "ALL") && (
          <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "#8b949e" }}>Active Filters:</span>
            {sortBy !== "default" && (
              <span
                style={{
                  fontSize: "11px",
                  background: "rgba(59, 130, 246, 0.15)",
                  color: "#60a5fa",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                }}
              >
                Sort: {sortBy}
              </span>
            )}
            {selectedSectorFilter !== "ALL" && (
              <span
                style={{
                  fontSize: "11px",
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#34d399",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                }}
              >
                Sector: {selectedSectorFilter}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setSortBy("default");
                setSelectedSectorFilter("ALL");
              }}
              style={{
                fontSize: "11px",
                background: "transparent",
                border: "none",
                color: "#ef4444",
                cursor: "pointer",
                padding: "2px 6px",
              }}
            >
              Reset
            </button>
          </div>
        )}

        {wlError && (
          <div
            style={{
              fontSize: "11px",
              color: "#f87171",
              marginTop: "6px",
              background: "rgba(239, 68, 68, 0.1)",
              padding: "4px 8px",
              borderRadius: "4px",
            }}
          >
            ⚠️ {wlError}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* QUICK ADD SECTION (When on Watchlist 1 and typing search)      */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "watchlist1" && additionalSearchStocksToAdd.length > 0 && (
        <div
          style={{
            margin: "4px 10px 12px 10px",
            background: "#10131d",
            borderRadius: "8px",
            border: "1px dashed #293042",
            padding: "10px",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              fontWeight: "700",
              color: "#60a5fa",
              marginBottom: "8px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            + Add To Watchlist 1 ({additionalSearchStocksToAdd.length} Available)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {additionalSearchStocksToAdd.map((s) => (
              <div
                key={s.ticker}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 8px",
                  background: "#161926",
                  borderRadius: "6px",
                }}
              >
                <div>
                  <span style={{ fontWeight: "700", fontSize: "13px" }}>{s.ticker}</span>
                  <span style={{ fontSize: "11px", color: "#8b949e", marginLeft: "6px" }}>
                    ₹{s.price.toFixed(2)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddTicker(s.ticker)}
                  disabled={mutating}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    background: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    fontSize: "11px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* EMPTY WATCHLIST 1 STATE                                       */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "watchlist1" && tabBaseStocks.length === 0 && (
        <div
          style={{
            padding: "48px 20px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            background: "#0c0e15",
            borderRadius: "12px",
            margin: "12px 10px",
            border: "1px solid #1c202d",
          }}
        >
          <div style={{ fontSize: "32px" }}>🔖</div>
          <div style={{ fontSize: "16px", fontWeight: "800", color: "#ffffff" }}>
            Watchlist 1 is Empty
          </div>
          <p style={{ fontSize: "13px", color: "#8b949e", margin: 0, maxWidth: "340px", lineHeight: 1.5 }}>
            Switch to the <strong>NIFTY 50</strong> tab or search any stock above and tap <strong>+ Add</strong> to start tracking it in your personal watchlist.
          </p>

          <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap", justifyContent: "center" }}>
            {["RELIANCE", "TCS", "HDFCBANK", "INFYS", "TATAMOTORS"].map((quickTicker) => (
              <button
                key={quickTicker}
                type="button"
                onClick={() => handleAddTicker(quickTicker)}
                disabled={mutating}
                style={{
                  padding: "6px 12px",
                  borderRadius: "20px",
                  background: "#161925",
                  border: "1px solid #282d3f",
                  color: "#60a5fa",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                + {quickTicker}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* GROUPED BY SECTOR LIST (Expandable & Collapsible Accordions)   */}
      {/* ------------------------------------------------------------- */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "4px 8px" }}>
        {groupedBySector.map(([sectorName, sectorStocks]) => {
          const isCollapsed = Boolean(collapsedSectors[sectorName]);

          return (
            <div
              key={sectorName}
              style={{
                background: "#0d0f17",
                borderRadius: "10px",
                border: "1px solid #1b1f2d",
                overflow: "hidden",
              }}
            >
              {/* Sector Header (Accordion Toggle) */}
              <button
                type="button"
                onClick={() => toggleSectorCollapse(sectorName)}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "13px 14px",
                  background: isCollapsed ? "#0d0f17" : "#111420",
                  border: "none",
                  borderBottom: isCollapsed ? "none" : "1px solid #1a1e2b",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: "700",
                      color: "#e2e8f0",
                      letterSpacing: "0.2px",
                    }}
                  >
                    {sectorName}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#8b949e",
                    }}
                  >
                    ({sectorStocks.length})
                  </span>
                </div>

                {/* Chevron icon indicating expanded / collapsed state */}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#8b949e"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                    flexShrink: 0,
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Stocks List inside Sector */}
              {!isCollapsed && (
                <div>
                  {sectorStocks.map((stock, idx) => {
                    const price = typeof stock.price === "number" ? stock.price : 0;
                    const changePct = typeof stock.change_pct === "number" ? stock.change_pct : 0;
                    const prevClose = typeof stock.prev_close === "number" ? stock.prev_close : null;
                    const priceChange = prevClose !== null ? price - prevClose : (price * changePct) / 100;
                    const isPositive = changePct >= 0;
                    const sign = isPositive ? "+" : "";
                    const isSaved = savedSet.has(stock.ticker.toUpperCase());
                    const companyName = COMPANY_NAMES[stock.ticker] || "";
                    const isLast = idx === sectorStocks.length - 1;

                    return (
                      <div
                        key={stock.ticker}
                        onClick={() => setActiveStockDetail(stock)}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "13px 14px",
                          borderBottom: isLast ? "none" : "1px solid #161924",
                          cursor: "pointer",
                          transition: "background 0.15s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#131724")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        {/* Left Side: Stock Symbol / Name & Exchange (NSE) */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span
                              style={{
                                fontSize: "14px",
                                fontWeight: "700",
                                color: "#ffffff",
                                letterSpacing: "0.2px",
                              }}
                            >
                              {stock.ticker}
                            </span>
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: "700",
                                color: "#94a3b8",
                                background: "#181b28",
                                padding: "1px 5px",
                                borderRadius: "3px",
                                border: "1px solid #232738",
                              }}
                            >
                              NSE
                            </span>
                          </div>

                          {companyName && (
                            <span
                              style={{
                                fontSize: "11px",
                                color: "#64748b",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: "200px",
                              }}
                            >
                              {companyName}
                            </span>
                          )}
                        </div>

                        {/* Right Side: Live Price & Price Change / % Change */}
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div style={{ textAlign: "right" }}>
                            <div
                              style={{
                                fontSize: "14px",
                                fontWeight: "700",
                                color: "#ffffff",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {price > 0
                                ? `₹${price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : "—"}
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                fontWeight: "600",
                                color: isPositive ? "#10b981" : "#ef4444",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {sign}
                              {priceChange.toFixed(2)} ({sign}
                              {changePct.toFixed(2)}%)
                            </div>
                          </div>

                          {/* Quick Watchlist Bookmark Toggle */}
                          <button
                            type="button"
                            title={isSaved ? "Remove from Watchlist 1" : "Add to Watchlist 1"}
                            aria-label={isSaved ? `Remove ${stock.ticker} from Watchlist 1` : `Add ${stock.ticker} to Watchlist 1`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isSaved) {
                                handleRemoveTicker(stock.ticker);
                              } else {
                                handleAddTicker(stock.ticker);
                              }
                            }}
                            disabled={mutating}
                            style={{
                              background: isSaved ? "rgba(59, 130, 246, 0.15)" : "transparent",
                              border: isSaved ? "1px solid rgba(59, 130, 246, 0.4)" : "1px solid #222637",
                              color: isSaved ? "#60a5fa" : "#4b5563",
                              width: "28px",
                              height: "28px",
                              borderRadius: "6px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2">
                              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* If search query produced 0 results */}
        {groupedBySector.length === 0 && tabBaseStocks.length > 0 && (
          <div
            style={{
              padding: "36px 16px",
              textAlign: "center",
              background: "#0c0e15",
              borderRadius: "10px",
              border: "1px solid #1a1e2b",
            }}
          >
            <div style={{ fontSize: "20px", marginBottom: "6px" }}>🔍</div>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "#ffffff" }}>
              No stocks found matching &ldquo;{searchQuery}&rdquo;
            </div>
            <div style={{ fontSize: "12px", color: "#8b949e", marginTop: "4px" }}>
              Try searching by ticker (e.g. RELIANCE), company name, or sector.
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* FILTER & SORT MODAL / BOTTOM SHEET                            */}
      {/* ------------------------------------------------------------- */}
      {filterModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Filter and Sort"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setFilterModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0f121b",
              borderRadius: "14px",
              border: "1px solid #23283a",
              maxWidth: "420px",
              width: "100%",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              color: "#ffffff",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "#ffffff" }}>
                Filter & Sort Watchlist
              </h3>
              <button
                type="button"
                onClick={() => setFilterModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#8b949e",
                  fontSize: "18px",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* Sort Options */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: "700", color: "#8b949e", marginBottom: "8px", textTransform: "uppercase" }}>
                Sort Stocks
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                {[
                  { id: "default", label: "Alphabetical (A-Z)" },
                  { id: "gainers", label: "Top Gainers (%)" },
                  { id: "losers", label: "Top Losers (%)" },
                  { id: "price_desc", label: "Price (High to Low)" },
                  { id: "price_asc", label: "Price (Low to High)" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSortBy(opt.id as SortOption)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: "6px",
                      background: sortBy === opt.id ? "#2563eb" : "#161925",
                      border: sortBy === opt.id ? "1px solid #3b82f6" : "1px solid #232738",
                      color: sortBy === opt.id ? "#ffffff" : "#cbd5e1",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sector Filter Dropdown */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: "700", color: "#8b949e", marginBottom: "8px", textTransform: "uppercase" }}>
                Filter by Sector
              </div>
              <select
                value={selectedSectorFilter}
                onChange={(e) => setSelectedSectorFilter(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  background: "#161925",
                  border: "1px solid #282e42",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: "600",
                  outline: "none",
                }}
              >
                <option value="ALL">All Sectors ({stocks.length} Stocks)</option>
                {allAvailableSectors.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </select>
            </div>

            {/* Expand / Collapse All Controls */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: "700", color: "#8b949e", marginBottom: "8px", textTransform: "uppercase" }}>
                Sector Accordions
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => expandAllSectors()}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: "6px",
                    background: "#161925",
                    border: "1px solid #282e42",
                    color: "#cbd5e1",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Expand All
                </button>
                <button
                  type="button"
                  onClick={() => collapseAllSectors(allAvailableSectors)}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: "6px",
                    background: "#161925",
                    border: "1px solid #282e42",
                    color: "#cbd5e1",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Collapse All
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
              <button
                type="button"
                onClick={() => {
                  setSortBy("default");
                  setSelectedSectorFilter("ALL");
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background: "#161925",
                  border: "1px solid #282e42",
                  color: "#ef4444",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setFilterModalOpen(false)}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background: "#2563eb",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STOCK ACTION SHEET (When tapping a stock row)                  */}
      {/* ------------------------------------------------------------- */}
      {activeStockDetail && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${activeStockDetail.ticker} Details`}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={() => setActiveStockDetail(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0f121b",
              borderTopLeftRadius: "16px",
              borderTopRightRadius: "16px",
              border: "1px solid #23283a",
              borderBottom: "none",
              maxWidth: "520px",
              width: "100%",
              padding: "20px 20px 32px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              color: "#ffffff",
              boxShadow: "0 -10px 30px rgba(0, 0, 0, 0.7)",
            }}
          >
            {/* Top Drag Indicator */}
            <div style={{ width: "36px", height: "4px", background: "#282e42", borderRadius: "2px", margin: "0 auto" }} />

            {/* Stock Summary Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "18px", fontWeight: "900", color: "#ffffff" }}>
                    {activeStockDetail.ticker}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: "700",
                      background: "#1a1f30",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      color: "#94a3b8",
                    }}
                  >
                    NSE
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "#8b949e", marginTop: "2px" }}>
                  {COMPANY_NAMES[activeStockDetail.ticker] || activeStockDetail.sector} • {getStockSector(activeStockDetail)}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "18px", fontWeight: "900", color: "#ffffff", fontVariantNumeric: "tabular-nums" }}>
                  ₹{activeStockDetail.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: "700",
                    color: activeStockDetail.change_pct >= 0 ? "#10b981" : "#ef4444",
                  }}
                >
                  {activeStockDetail.change_pct >= 0 ? "+" : ""}
                  {activeStockDetail.change_pct.toFixed(2)}%
                </div>
              </div>
            </div>

            {/* Key Metrics Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "8px",
                background: "#151824",
                padding: "10px",
                borderRadius: "8px",
                textAlign: "center",
              }}
            >
              <div>
                <div style={{ fontSize: "10px", color: "#8b949e", fontWeight: "700" }}>AI SCORE</div>
                <div style={{ fontSize: "14px", fontWeight: "800", color: "#60a5fa", marginTop: "2px" }}>
                  {activeStockDetail.master_score}/100
                </div>
              </div>
              <div>
                <div style={{ fontSize: "10px", color: "#8b949e", fontWeight: "700" }}>SIGNAL</div>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "800",
                    marginTop: "2px",
                    color:
                      activeStockDetail.recommendation?.toUpperCase().includes("BUY")
                        ? "#10b981"
                        : activeStockDetail.recommendation?.toUpperCase().includes("SELL")
                        ? "#ef4444"
                        : "#eab308",
                  }}
                >
                  {activeStockDetail.recommendation || "HOLD"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "10px", color: "#8b949e", fontWeight: "700" }}>DAY RANGE</div>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "#ffffff", marginTop: "2px" }}>
                  {typeof activeStockDetail.day_low === "number" && typeof activeStockDetail.day_high === "number"
                    ? `₹${activeStockDetail.day_low.toFixed(0)}–₹${activeStockDetail.day_high.toFixed(0)}`
                    : "—"}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {/* Paper Trading Buy */}
              <button
                type="button"
                onClick={() => {
                  const t = activeStockDetail.ticker;
                  setActiveStockDetail(null);
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(
                      new CustomEvent("open-paper-trade", { detail: { ticker: t, type: "BUY" } })
                    );
                  }
                }}
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#10b981",
                  color: "#ffffff",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: "800",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <span>+</span> BUY Stock
              </button>

              {/* Futures Trading */}
              <button
                type="button"
                onClick={() => {
                  const t = activeStockDetail.ticker;
                  setActiveStockDetail(null);
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(
                      new CustomEvent("open-futures-trade", { detail: { ticker: t, side: "BUY", lots: 1 } })
                    );
                  }
                }}
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#4f46e5",
                  color: "#ffffff",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: "800",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <span>⚡</span> Futures Trade
              </button>
            </div>

            {/* Secondary Actions */}
            <div style={{ display: "flex", gap: "8px" }}>
              {/* Deep Research Report */}
              <button
                type="button"
                onClick={() => {
                  const t = activeStockDetail.ticker;
                  setActiveStockDetail(null);
                  onSelectStock(t);
                }}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  background: "#181b28",
                  color: "#60a5fa",
                  border: "1px solid #282e42",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                🔬 AI Research Report
              </button>

              {/* Watchlist 1 Toggle */}
              {savedSet.has(activeStockDetail.ticker.toUpperCase()) ? (
                <button
                  type="button"
                  onClick={() => {
                    handleRemoveTicker(activeStockDetail.ticker);
                  }}
                  disabled={mutating}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "rgba(239, 68, 68, 0.12)",
                    color: "#f87171",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    fontSize: "12px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  Remove from Watchlist 1
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    handleAddTicker(activeStockDetail.ticker);
                  }}
                  disabled={mutating}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "rgba(59, 130, 246, 0.15)",
                    color: "#60a5fa",
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    fontSize: "12px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  + Add to Watchlist 1
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
