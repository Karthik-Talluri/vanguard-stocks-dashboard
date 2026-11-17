"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  StockOverview,
  getLocalWatchlistTickers,
  saveLocalWatchlistTickers,
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
  RELIANCE: "Reliance Industries Ltd",
  TCS: "Tata Consultancy Services Ltd",
  INFYS: "Infosys Ltd",
  INFY: "Infosys Ltd",
  HDFCBANK: "HDFC Bank Ltd",
  ICICIBANK: "ICICI Bank Ltd",
  SBIN: "State Bank of India",
  ITC: "ITC Ltd",
  HINDUNILVR: "Hindustan Unilever Ltd",
  TATAMOTORS: "Tata Motors Ltd",
  MARUTI: "Maruti Suzuki India Ltd",
  SUNPHARMA: "Sun Pharmaceutical Industries Ltd",
  CIPLA: "Cipla Ltd",
  TATASTEEL: "Tata Steel Ltd",
  JSWSTEEL: "JSW Steel Ltd",
  LT: "Larsen & Toubro Ltd",
  AXISBANK: "Axis Bank Ltd",
  KOTAKBANK: "Kotak Mahindra Bank Ltd",
  BHARTIARTL: "Bharti Airtel Ltd",
  WIPRO: "Wipro Ltd",
  HCLTECH: "HCL Technologies Ltd",
  TECHM: "Tech Mahindra Ltd",
  LTIM: "LTIMindtree Ltd",
  TITAN: "Titan Company Ltd",
  BAJFINANCE: "Bajaj Finance Ltd",
  BAJAJFINSV: "Bajaj Finserv Ltd",
  BAJAJ_AUTO: "Bajaj Auto Ltd",
  "BAJAJ-AUTO": "Bajaj Auto Ltd",
  HEROMOTOCO: "Hero MotoCorp Ltd",
  MM: "Mahindra & Mahindra Ltd",
  "M&M": "Mahindra & Mahindra Ltd",
  EICHERMOT: "Eicher Motors Ltd",
  ADANIENT: "Adani Enterprises Ltd",
  ADANIPORTS: "Adani Ports & Special Economic Zone",
  POWERGRID: "Power Grid Corp of India Ltd",
  NTPC: "NTPC Ltd",
  ONGC: "Oil & Natural Gas Corp Ltd",
  BPCL: "Bharat Petroleum Corp Ltd",
  IOC: "Indian Oil Corp Ltd",
  COALINDIA: "Coal India Ltd",
  ASIANPAINT: "Asian Paints Ltd",
  BRITANNIA: "Britannia Industries Ltd",
  TATACONSUM: "Tata Consumer Products Ltd",
  NESTLEIND: "Nestle India Ltd",
  APOLLOHOSP: "Apollo Hospitals Enterprise Ltd",
  DIVISLAB: "Divi's Laboratories Ltd",
  DRREDDY: "Dr. Reddy's Laboratories Ltd",
  HINDALCO: "Hindalco Industries Ltd",
  INDUSINDBK: "IndusInd Bank Ltd",
  GRASIM: "Grasim Industries Ltd",
  ULTRACEMCO: "UltraTech Cement Ltd",
  SBILIFE: "SBI Life Insurance Co Ltd",
  SHRIRAMFIN: "Shriram Finance Ltd",
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

export interface WatchlistDefinition {
  id: string; // "nifty50" | "watchlist1" | "wl_..."
  name: string;
  tickers: string[];
  isCustom?: boolean;
}

const WATCHLISTS_STORAGE_KEY_PREFIX = "vanguard_user_watchlists_v4_";

function loadUserWatchlistsFromStorage(userId: string, defaultTickers: string[]): WatchlistDefinition[] {
  if (typeof window === "undefined") {
    return [{ id: "watchlist1", name: "Watchlist 1", tickers: defaultTickers, isCustom: false }];
  }
  try {
    const raw = window.localStorage.getItem(`${WATCHLISTS_STORAGE_KEY_PREFIX}${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure default Watchlist 1 always exists
        const hasWl1 = parsed.some((w) => w.id === "watchlist1");
        if (!hasWl1) {
          parsed.unshift({ id: "watchlist1", name: "Watchlist 1", tickers: defaultTickers, isCustom: false });
        }
        return parsed;
      }
    }
  } catch (err) {
    console.error("Failed to load user watchlists from localStorage:", err);
  }
  return [{ id: "watchlist1", name: "Watchlist 1", tickers: defaultTickers, isCustom: false }];
}

function saveUserWatchlistsToStorage(userId: string, watchlists: WatchlistDefinition[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${WATCHLISTS_STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(watchlists));
  } catch (err) {
    console.error("Failed to save user watchlists to localStorage:", err);
  }
}

export default function WatchlistView({
  stocks,
  userId,
  userName,
  onSelectStock,
}: WatchlistViewProps) {
  // Lookup map of all stocks by ticker
  const stocksByTicker = useMemo(() => {
    const map = new Map<string, StockOverview>();
    for (const s of stocks) {
      map.set(s.ticker.toUpperCase().trim(), s);
    }
    return map;
  }, [stocks]);

  // Active tab: "nifty50" or personal watchlist ID (e.g. "watchlist1", "wl_123...")
  const [activeTab, setActiveTab] = useState<string>("nifty50");

  // User's personal watchlists (scoped to userId)
  const [watchlists, setWatchlists] = useState<WatchlistDefinition[]>(() =>
    loadUserWatchlistsFromStorage(userId, getLocalWatchlistTickers(userId))
  );

  // Syncing state with backend
  const [syncing, setSyncing] = useState<boolean>(false);
  const [mutating, setMutating] = useState<boolean>(false);
  const [wlError, setWlError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const opSeqRef = useRef<number>(0);

  // Search & Filter controls
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>("ALL");
  const [selectedMovementFilter, setSelectedMovementFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("default");

  // Sector expand/collapse state (keyed by sector name)
  const [collapsedSectors, setCollapsedSectors] = useState<Record<string, boolean>>({});

  // Modals
  const [createListModalOpen, setCreateListModalOpen] = useState<boolean>(false);
  const [newListName, setNewListName] = useState<string>("");

  const [addStockModalOpen, setAddStockModalOpen] = useState<boolean>(false);
  const [addStockSearchQuery, setAddStockSearchQuery] = useState<string>("");

  const [customizeModalOpen, setCustomizeModalOpen] = useState<boolean>(false);
  const [renameValue, setRenameValue] = useState<string>("");

  // Confirmation dialog for stock removal
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<{
    ticker: string;
    watchlistId: string;
    watchlistName: string;
  } | null>(null);

  // Quick action modal for adding a stock to a chosen watchlist from Nifty 50
  const [quickAddStockTicker, setQuickAddStockTicker] = useState<string | null>(null);

  // Show transient toast
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3000);
  }, []);

  // Sync default watchlist1 with backend on mount or user switch
  useEffect(() => {
    let cancelled = false;
    const startSeq = opSeqRef.current;
    setSyncing(true);
    setWlError(null);

    const initialLocal = getLocalWatchlistTickers(userId);
    const initialLists = loadUserWatchlistsFromStorage(userId, initialLocal);
    setWatchlists(initialLists);

    fetchWatchlist(userId)
      .then((tickers) => {
        if (!cancelled && opSeqRef.current === startSeq) {
          setWatchlists((prevLists) => {
            const next = prevLists.map((wl) =>
              wl.id === "watchlist1" ? { ...wl, tickers } : wl
            );
            saveUserWatchlistsToStorage(userId, next);
            return next;
          });
        }
      })
      .catch((err) => {
        if (!cancelled) setWlError(err?.message || "Failed to sync watchlist with server");
      })
      .finally(() => {
        if (!cancelled) setSyncing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Current active watchlist object (null if activeTab === "nifty50")
  const currentActiveList = useMemo(() => {
    if (activeTab === "nifty50") return null;
    return watchlists.find((w) => w.id === activeTab) || watchlists[0] || null;
  }, [activeTab, watchlists]);

  // Stocks belonging to current active tab
  const activeTabStocks = useMemo(() => {
    if (activeTab === "nifty50") {
      return stocks;
    }
    if (!currentActiveList) return [];
    return currentActiveList.tickers
      .map((t) => stocksByTicker.get(t.toUpperCase().trim()))
      .filter((s): s is StockOverview => Boolean(s));
  }, [activeTab, currentActiveList, stocks, stocksByTicker]);

  // Filtered & Sorted Stocks for display
  const processedStocks = useMemo(() => {
    let list = [...activeTabStocks];

    // Search query filter
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

    // Movement filter (Gainers vs Losers)
    if (selectedMovementFilter === "gainers") {
      list = list.filter((s) => (s.change_pct ?? 0) > 0);
    } else if (selectedMovementFilter === "losers") {
      list = list.filter((s) => (s.change_pct ?? 0) < 0);
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
    } else if (sortBy === "score_desc") {
      list.sort((a, b) => (b.master_score || 0) - (a.master_score || 0));
    } else {
      // Default: Alphabetical by ticker
      list.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }

    return list;
  }, [activeTabStocks, searchQuery, selectedSectorFilter, selectedMovementFilter, sortBy]);

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
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [processedStocks]);

  // Unique sector names across all stocks for sector filter dropdown
  const allAvailableSectors = useMemo(() => {
    const set = new Set<string>();
    for (const s of stocks) {
      set.add(getStockSector(s));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [stocks]);

  // Toggle sector accordion collapse
  const toggleSectorCollapse = (sectorName: string) => {
    setCollapsedSectors((prev) => ({
      ...prev,
      [sectorName]: !prev[sectorName],
    }));
  };

  const collapseAllSectors = () => {
    const next: Record<string, boolean> = {};
    for (const [sec] of groupedBySector) {
      next[sec] = true;
    }
    setCollapsedSectors(next);
  };

  const expandAllSectors = () => {
    setCollapsedSectors({});
  };

  // Add a ticker to a specific watchlist
  const handleAddStockToList = async (watchlistId: string, tickerToAdd: string) => {
    const target = tickerToAdd.trim().toUpperCase();
    if (!target) return;

    const targetList = watchlists.find((w) => w.id === watchlistId);
    if (!targetList || targetList.tickers.includes(target)) return;

    const nextTickers = [...targetList.tickers, target];
    const nextWatchlists = watchlists.map((w) =>
      w.id === watchlistId ? { ...w, tickers: nextTickers } : w
    );

    setWatchlists(nextWatchlists);
    saveUserWatchlistsToStorage(userId, nextWatchlists);

    // If updating watchlist1, sync with backend
    if (watchlistId === "watchlist1") {
      saveLocalWatchlistTickers(userId, nextTickers, true);
      setMutating(true);
      try {
        await addToWatchlist(userId, target);
      } catch (err: unknown) {
        console.error("Backend add failed:", err);
      } finally {
        setMutating(false);
      }
    }

    showToast(`Added ${target} to ${targetList.name}`);
  };

  // Confirm stock removal from active watchlist
  const handleConfirmRemoveStock = async () => {
    if (!confirmRemoveItem) return;
    const { ticker, watchlistId, watchlistName } = confirmRemoveItem;
    setConfirmRemoveItem(null);

    const targetList = watchlists.find((w) => w.id === watchlistId);
    if (!targetList) return;

    const nextTickers = targetList.tickers.filter((t) => t.toUpperCase() !== ticker.toUpperCase());
    const nextWatchlists = watchlists.map((w) =>
      w.id === watchlistId ? { ...w, tickers: nextTickers } : w
    );

    setWatchlists(nextWatchlists);
    saveUserWatchlistsToStorage(userId, nextWatchlists);

    // If updating watchlist1, sync with backend
    if (watchlistId === "watchlist1") {
      saveLocalWatchlistTickers(userId, nextTickers, true);
      setMutating(true);
      try {
        await removeFromWatchlist(userId, ticker);
      } catch (err: unknown) {
        console.error("Backend remove failed:", err);
      } finally {
        setMutating(false);
      }
    }

    showToast(`Removed ${ticker} from ${watchlistName}`);
  };

  // Create a new named personal watchlist
  const handleCreateWatchlist = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newListName.trim();
    if (!name) return;

    const newId = `wl_${Date.now()}`;
    const newList: WatchlistDefinition = {
      id: newId,
      name,
      tickers: [],
      isCustom: true,
    };

    const nextWatchlists = [...watchlists, newList];
    setWatchlists(nextWatchlists);
    saveUserWatchlistsToStorage(userId, nextWatchlists);
    setActiveTab(newId);
    setNewListName("");
    setCreateListModalOpen(false);
    showToast(`Created watchlist "${name}"`);
  };

  // Rename current custom watchlist
  const handleRenameWatchlist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentActiveList || !currentActiveList.isCustom) return;
    const name = renameValue.trim();
    if (!name) return;

    const nextWatchlists = watchlists.map((w) =>
      w.id === currentActiveList.id ? { ...w, name } : w
    );
    setWatchlists(nextWatchlists);
    saveUserWatchlistsToStorage(userId, nextWatchlists);
    setCustomizeModalOpen(false);
    showToast(`Watchlist renamed to "${name}"`);
  };

  // Delete current custom watchlist
  const handleDeleteCurrentWatchlist = () => {
    if (!currentActiveList || !currentActiveList.isCustom) return;
    const listName = currentActiveList.name;
    const nextWatchlists = watchlists.filter((w) => w.id !== currentActiveList.id);
    setWatchlists(nextWatchlists);
    saveUserWatchlistsToStorage(userId, nextWatchlists);
    setActiveTab("watchlist1");
    setCustomizeModalOpen(false);
    showToast(`Deleted watchlist "${listName}"`);
  };

  // Signal color helper for recommendations
  const getSignalColor = (rec?: string) => {
    const upper = (rec || "").toUpperCase();
    if (upper.includes("BUY")) return "var(--color-buy)";
    if (upper.includes("SELL")) return "var(--color-sell)";
    return "var(--color-hold)";
  };

  return (
    <div
      data-testid="watchlist-view"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        width: "100%",
        paddingBottom: "96px",
      }}
      className="animate-fade-in"
    >
      {/* ------------------------------------------------------------- */}
      {/* 1. VANGUARD DASHBOARD HEADER (Existing Theme & Colors)        */}
      {/* ------------------------------------------------------------- */}
      <div
        className="glass-panel"
        style={{
          padding: "clamp(12px, 3vw, 18px)",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flexWrap: "wrap" }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="var(--accent-ml)"
              stroke="var(--accent-ml)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <h2
              style={{
                fontSize: "clamp(16px, 4.5vw, 19px)",
                fontWeight: "900",
                color: "var(--color-text-primary)",
                margin: 0,
              }}
            >
              Watchlist
            </h2>
            <span
              style={{
                fontSize: "11px",
                fontWeight: "700",
                padding: "2px 8px",
                borderRadius: "12px",
                background: "rgba(79, 70, 229, 0.1)",
                color: "var(--accent-ml)",
                border: "1px solid rgba(79, 70, 229, 0.25)",
              }}
            >
              {activeTab === "nifty50" ? `${stocks.length} NSE Stocks` : `${activeTabStocks.length} Stocks Saved`}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            {syncing && (
              <span style={{ fontSize: "11px", color: "var(--accent-ml)", display: "flex", alignItems: "center", gap: "4px" }}>
                <span className="animate-spin">⟳</span> Syncing...
              </span>
            )}
            <span
              style={{
                fontSize: "11px",
                fontWeight: "700",
                padding: "3px 8px",
                borderRadius: "12px",
                background: "var(--bg-button-unselected)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              User: <strong>{userName}</strong>
            </span>
          </div>
        </div>

        <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: 0, lineHeight: 1.4 }}>
          Track live NSE quotes, sector breakdowns, AI consensus ratings, and execute paper trades or futures with one tap.
        </p>

        {/* ------------------------------------------------------------- */}
        {/* 2. WATCHLIST TABS (NIFTY 50, Watchlist 1, Custom Lists, + New) */}
        {/* ------------------------------------------------------------- */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            overflowX: "auto",
            paddingBottom: "4px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          {/* Tab: NIFTY 50 */}
          <button
            type="button"
            onClick={() => setActiveTab("nifty50")}
            style={{
              padding: "7px 14px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer",
              border: "1px solid",
              borderColor: activeTab === "nifty50" ? "var(--accent-ml)" : "var(--border-subtle)",
              background: activeTab === "nifty50" ? "var(--accent-ml)" : "var(--bg-card)",
              color: activeTab === "nifty50" ? "#ffffff" : "var(--color-text-secondary)",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
          >
            <span>NIFTY 50</span>
            <span
              style={{
                fontSize: "10px",
                padding: "1px 5px",
                borderRadius: "10px",
                background: activeTab === "nifty50" ? "rgba(255,255,255,0.25)" : "var(--border-subtle)",
                color: activeTab === "nifty50" ? "#ffffff" : "var(--color-text-muted)",
              }}
            >
              {stocks.length}
            </span>
          </button>

          {/* User's Personal Watchlist Tabs */}
          {watchlists.map((wl) => {
            const isActive = activeTab === wl.id;
            return (
              <button
                key={wl.id}
                type="button"
                onClick={() => setActiveTab(wl.id)}
                style={{
                  padding: "7px 14px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: isActive ? "var(--accent-ml)" : "var(--border-subtle)",
                  background: isActive ? "var(--accent-ml)" : "var(--bg-card)",
                  color: isActive ? "#ffffff" : "var(--color-text-secondary)",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                <span>{wl.name}</span>
                <span
                  style={{
                    fontSize: "10px",
                    padding: "1px 5px",
                    borderRadius: "10px",
                    background: isActive ? "rgba(255,255,255,0.25)" : "var(--border-subtle)",
                    color: isActive ? "#ffffff" : "var(--color-text-muted)",
                  }}
                >
                  {wl.tickers.length}
                </span>
              </button>
            );
          })}

          {/* Create New Watchlist Button */}
          <button
            type="button"
            onClick={() => {
              setNewListName("");
              setCreateListModalOpen(true);
            }}
            title="Create a new personal watchlist"
            style={{
              padding: "7px 12px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer",
              border: "1px dashed var(--accent-ml)",
              background: "rgba(79, 70, 229, 0.05)",
              color: "var(--accent-ml)",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>+</span> New List
          </button>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* 3. FUNCTIONAL SEARCH BAR & QUICK ACTION BUTTONS               */}
        {/* ------------------------------------------------------------- */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            width: "100%",
          }}
        >
          {/* Functional Search Input */}
          <div
            style={{
              flex: "1 1 240px",
              display: "flex",
              alignItems: "center",
              background: "var(--bg-main)",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
              padding: "0 10px",
              minHeight: "38px",
              gap: "8px",
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-text-muted)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by symbol, company, or sector..."
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--color-text-primary)",
                fontSize: "12px",
                fontWeight: "500",
                minWidth: 0,
                padding: "8px 0",
              }}
            />

            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                  padding: "2px",
                  fontSize: "12px",
                }}
              >
                ✕
              </button>
            )}

            <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontVariantNumeric: "tabular-nums" }}>
              {processedStocks.length}/{activeTabStocks.length}
            </span>
          </div>

          {/* Add Stock to Watchlist Button (when on a personal watchlist) */}
          {currentActiveList && (
            <button
              type="button"
              onClick={() => {
                setAddStockSearchQuery("");
                setAddStockModalOpen(true);
              }}
              style={{
                padding: "9px 14px",
                borderRadius: "8px",
                background: "var(--accent-ml)",
                color: "#ffffff",
                border: "none",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                whiteSpace: "nowrap",
                minHeight: "38px",
              }}
            >
              <span>+</span> Add Stock
            </button>
          )}

          {/* Customize Watchlist Button (when on custom watchlist) */}
          {currentActiveList && currentActiveList.isCustom && (
            <button
              type="button"
              onClick={() => {
                setRenameValue(currentActiveList.name);
                setCustomizeModalOpen(true);
              }}
              style={{
                padding: "9px 12px",
                borderRadius: "8px",
                background: "var(--bg-card)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--border-subtle)",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
                whiteSpace: "nowrap",
                minHeight: "38px",
              }}
            >
              ⚙ Customize
            </button>
          )}
        </div>

        {/* ------------------------------------------------------------- */}
        {/* 4. FILTER CONTROLS (Sector, Price Movement, Sort, Expand)     */}
        {/* ------------------------------------------------------------- */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            background: "rgba(0, 0, 0, 0.02)",
            padding: "8px 10px",
            borderRadius: "8px",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {/* Sector Filter Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0 }}>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-muted)" }}>Sector:</span>
            <select
              value={selectedSectorFilter}
              onChange={(e) => setSelectedSectorFilter(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: "6px",
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                color: "var(--color-text-primary)",
                fontSize: "11px",
                fontWeight: "600",
                cursor: "pointer",
                outline: "none",
                maxWidth: "180px",
              }}
            >
              <option value="ALL">All Sectors</option>
              {allAvailableSectors.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
          </div>

          {/* Movement Filter Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-muted)" }}>Move:</span>
            <select
              value={selectedMovementFilter}
              onChange={(e) => setSelectedMovementFilter(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: "6px",
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                color: "var(--color-text-primary)",
                fontSize: "11px",
                fontWeight: "600",
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="ALL">All Stocks</option>
              <option value="gainers">Gainers (+)</option>
              <option value="losers">Losers (-)</option>
            </select>
          </div>

          {/* Sort By Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-muted)" }}>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: "6px",
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                color: "var(--color-text-primary)",
                fontSize: "11px",
                fontWeight: "600",
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="default">Alphabetical (A-Z)</option>
              <option value="gainers">Top Gainers (%)</option>
              <option value="losers">Top Losers (%)</option>
              <option value="price_desc">Price (High to Low)</option>
              <option value="price_asc">Price (Low to High)</option>
              <option value="score_desc">AI Score (High to Low)</option>
            </select>
          </div>

          {/* Expand / Collapse All Toggle */}
          <div style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
            <button
              type="button"
              onClick={expandAllSectors}
              style={{
                padding: "4px 8px",
                borderRadius: "6px",
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                fontSize: "11px",
                fontWeight: "600",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
              }}
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAllSectors}
              style={{
                padding: "4px 8px",
                borderRadius: "6px",
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                fontSize: "11px",
                fontWeight: "600",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
              }}
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Transient Toast Notification */}
        {toastMessage && (
          <div
            style={{
              padding: "6px 12px",
              background: "rgba(16, 185, 129, 0.12)",
              color: "var(--color-buy)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: "700",
            }}
          >
            ✓ {toastMessage}
          </div>
        )}

        {wlError && (
          <div
            style={{
              padding: "6px 12px",
              background: "rgba(220, 38, 38, 0.08)",
              color: "var(--color-sell)",
              border: "1px solid rgba(220, 38, 38, 0.25)",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: "600",
            }}
          >
            ⚠️ {wlError}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 5. EMPTY WATCHLIST STATE (With Helpful Add Prompts)            */}
      {/* ------------------------------------------------------------- */}
      {activeTabStocks.length === 0 && currentActiveList && (
        <div
          className="glass-panel"
          style={{
            padding: "40px 20px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div style={{ fontSize: "28px" }}>🔖</div>
          <div style={{ fontSize: "16px", fontWeight: "800", color: "var(--color-text-primary)" }}>
            No Stocks in &ldquo;{currentActiveList.name}&rdquo;
          </div>
          <p style={{ fontSize: "12px", color: "var(--color-text-muted)", maxWidth: "380px", margin: 0 }}>
            Click <strong>+ Add Stock</strong> above or choose from popular NSE stocks below to start tracking live prices and AI signals.
          </p>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center", marginTop: "4px" }}>
            {["RELIANCE", "TCS", "HDFCBANK", "INFYS", "TATAMOTORS", "ICICIBANK"].map((quickTicker) => (
              <button
                key={quickTicker}
                type="button"
                onClick={() => handleAddStockToList(currentActiveList.id, quickTicker)}
                disabled={mutating}
                style={{
                  padding: "6px 12px",
                  borderRadius: "20px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--accent-ml)",
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
      {/* 6. GROUPED BY SECTOR LIST (Expandable/Collapsible Sections)    */}
      {/* ------------------------------------------------------------- */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {groupedBySector.map(([sectorName, sectorStocks]) => {
          const isCollapsed = Boolean(collapsedSectors[sectorName]);

          return (
            <div
              key={sectorName}
              className="glass-panel"
              style={{
                overflow: "hidden",
                padding: 0,
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
                  padding: "12px 16px",
                  background: isCollapsed ? "var(--bg-card)" : "rgba(0, 0, 0, 0.02)",
                  border: "none",
                  borderBottom: isCollapsed ? "none" : "1px solid var(--border-subtle)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: "800",
                      color: "var(--color-text-primary)",
                      letterSpacing: "0.2px",
                    }}
                  >
                    {sectorName}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: "700",
                      color: "var(--color-text-muted)",
                      background: "var(--bg-card)",
                      padding: "2px 7px",
                      borderRadius: "10px",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    {sectorStocks.length} {sectorStocks.length === 1 ? "stock" : "stocks"}
                  </span>
                </div>

                {/* Animated Chevron Indicator */}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-text-muted)"
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

              {/* Stocks Cards inside Sector */}
              {!isCollapsed && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {sectorStocks.map((stock, idx) => {
                    const price = typeof stock.price === "number" ? stock.price : 0;
                    const changePct = typeof stock.change_pct === "number" ? stock.change_pct : 0;
                    const prevClose = typeof stock.prev_close === "number" ? stock.prev_close : null;
                    const priceChange = prevClose !== null ? price - prevClose : (price * changePct) / 100;
                    const isPositive = changePct >= 0;
                    const sign = isPositive ? "+" : "";
                    const companyName = COMPANY_NAMES[stock.ticker] || stock.sector;
                    const isLast = idx === sectorStocks.length - 1;

                    return (
                      <div
                        key={stock.ticker}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          padding: "12px 16px",
                          borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
                          transition: "background 0.15s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-card-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        {/* Top Line: Symbol, Exchange, Company, Live Price & Change */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            flexWrap: "wrap",
                            gap: "8px",
                          }}
                        >
                          {/* Left: Ticker & Details */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                              <span
                                onClick={() => onSelectStock(stock.ticker)}
                                style={{
                                  fontSize: "14px",
                                  fontWeight: "800",
                                  color: "var(--color-text-primary)",
                                  cursor: "pointer",
                                }}
                                title="Click to view full AI research report"
                              >
                                {stock.ticker}
                              </span>
                              <span
                                style={{
                                  fontSize: "10px",
                                  fontWeight: "700",
                                  color: "var(--color-text-muted)",
                                  background: "rgba(0, 0, 0, 0.04)",
                                  padding: "1px 5px",
                                  borderRadius: "4px",
                                  border: "1px solid var(--border-subtle)",
                                }}
                              >
                                NSE
                              </span>
                              <span
                                style={{
                                  fontSize: "10px",
                                  fontWeight: "700",
                                  color: getSignalColor(stock.recommendation),
                                  background: "rgba(0, 0, 0, 0.02)",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                }}
                              >
                                {stock.recommendation || "HOLD"} ({stock.master_score}/100)
                              </span>
                            </div>

                            {companyName && (
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "var(--color-text-muted)",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  maxWidth: "280px",
                                }}
                              >
                                {companyName}
                              </div>
                            )}
                          </div>

                          {/* Right: Live Price & Price Change */}
                          <div style={{ textAlign: "right" }}>
                            <div
                              style={{
                                fontSize: "14px",
                                fontWeight: "800",
                                color: "var(--color-text-primary)",
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
                                fontWeight: "700",
                                color: isPositive ? "var(--color-buy)" : "var(--color-sell)",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {sign}
                              {priceChange.toFixed(2)} ({sign}
                              {changePct.toFixed(2)}%)
                            </div>
                          </div>
                        </div>

                        {/* Bottom Row: Functional Action Buttons */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "6px",
                            paddingTop: "4px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            {/* Stock Selection / Research Button */}
                            <button
                              type="button"
                              onClick={() => onSelectStock(stock.ticker)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: "6px",
                                background: "transparent",
                                border: "1px solid var(--border-subtle)",
                                color: "var(--accent-ml)",
                                fontSize: "11px",
                                fontWeight: "700",
                                cursor: "pointer",
                              }}
                            >
                              🔬 Research
                            </button>

                            {/* Paper Trading Buy Button */}
                            <button
                              type="button"
                              onClick={() => {
                                if (typeof window !== "undefined") {
                                  window.dispatchEvent(
                                    new CustomEvent("open-paper-trade", { detail: { ticker: stock.ticker, type: "BUY" } })
                                  );
                                }
                              }}
                              style={{
                                padding: "4px 10px",
                                borderRadius: "6px",
                                background: "rgba(5, 150, 105, 0.1)",
                                color: "var(--color-buy)",
                                border: "1px solid var(--color-buy)",
                                fontSize: "11px",
                                fontWeight: "800",
                                cursor: "pointer",
                              }}
                            >
                              + BUY
                            </button>

                            {/* Futures Trading Button */}
                            <button
                              type="button"
                              onClick={() => {
                                if (typeof window !== "undefined") {
                                  window.dispatchEvent(
                                    new CustomEvent("open-futures-trade", { detail: { ticker: stock.ticker, side: "BUY", lots: 1 } })
                                  );
                                }
                              }}
                              style={{
                                padding: "4px 10px",
                                borderRadius: "6px",
                                background: "rgba(79, 70, 229, 0.08)",
                                color: "var(--accent-ml)",
                                border: "1px solid rgba(79, 70, 229, 0.35)",
                                fontSize: "11px",
                                fontWeight: "800",
                                cursor: "pointer",
                              }}
                            >
                              ⚡ Futures
                            </button>
                          </div>

                          {/* Right action: Remove button (for personal watchlist) or Add to List (for NIFTY 50) */}
                          {currentActiveList ? (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmRemoveItem({
                                  ticker: stock.ticker,
                                  watchlistId: currentActiveList.id,
                                  watchlistName: currentActiveList.name,
                                })
                              }
                              style={{
                                padding: "4px 8px",
                                borderRadius: "6px",
                                background: "rgba(220, 38, 38, 0.06)",
                                color: "var(--color-sell)",
                                border: "1px solid rgba(220, 38, 38, 0.25)",
                                fontSize: "11px",
                                fontWeight: "700",
                                cursor: "pointer",
                              }}
                            >
                              Remove
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setQuickAddStockTicker(stock.ticker)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: "6px",
                                background: "rgba(79, 70, 229, 0.06)",
                                color: "var(--accent-ml)",
                                border: "1px solid rgba(79, 70, 229, 0.25)",
                                fontSize: "11px",
                                fontWeight: "700",
                                cursor: "pointer",
                              }}
                            >
                              + Add to List
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* If filter/search produced 0 results */}
        {groupedBySector.length === 0 && activeTabStocks.length > 0 && (
          <div
            className="glass-panel"
            style={{
              padding: "32px 16px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <div style={{ fontSize: "20px" }}>🔍</div>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--color-text-primary)" }}>
              No stocks found matching your filters
            </div>
            <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
              Try clearing the search query or adjusting sector/movement filters.
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedSectorFilter("ALL");
                setSelectedMovementFilter("ALL");
              }}
              style={{
                marginTop: "4px",
                padding: "6px 12px",
                borderRadius: "6px",
                background: "var(--accent-ml)",
                color: "#ffffff",
                border: "none",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 7. CONFIRMATION DIALOG FOR STOCK REMOVAL                      */}
      {/* ------------------------------------------------------------- */}
      {confirmRemoveItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm Remove Stock"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setConfirmRemoveItem(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-panel"
            style={{
              maxWidth: "400px",
              width: "100%",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "20px" }}>⚠️</span>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "var(--color-text-primary)" }}>
                Remove Stock?
              </h3>
            </div>

            <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5 }}>
              Are you sure you want to remove <strong>{confirmRemoveItem.ticker}</strong> from &ldquo;{confirmRemoveItem.watchlistName}&rdquo;?
            </p>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
              <button
                type="button"
                onClick={() => setConfirmRemoveItem(null)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveStock}
                disabled={mutating}
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  background: "var(--color-sell)",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: "700",
                  color: "#ffffff",
                  cursor: "pointer",
                }}
              >
                {mutating ? "Removing..." : "Remove Stock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 8. CREATE NEW WATCHLIST MODAL                                 */}
      {/* ------------------------------------------------------------- */}
      {createListModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create Watchlist"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setCreateListModalOpen(false)}
        >
          <form
            onSubmit={handleCreateWatchlist}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel"
            style={{
              maxWidth: "400px",
              width: "100%",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "var(--color-text-primary)" }}>
                Create New Watchlist
              </h3>
              <button
                type="button"
                onClick={() => setCreateListModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-text-muted)",
                  fontSize: "16px",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: 0 }}>
              Give your new watchlist a name (e.g. &ldquo;Tech & Growth&rdquo;, &ldquo;Dividend Picks&rdquo;).
            </p>

            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="Watchlist Name..."
              autoFocus
              required
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "8px",
                background: "var(--bg-main)",
                border: "1px solid var(--border-subtle)",
                color: "var(--color-text-primary)",
                fontSize: "13px",
                fontWeight: "600",
                outline: "none",
              }}
            />

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setCreateListModalOpen(false)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newListName.trim()}
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  background: "var(--accent-ml)",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: "700",
                  color: "#ffffff",
                  cursor: newListName.trim() ? "pointer" : "not-allowed",
                  opacity: newListName.trim() ? 1 : 0.6,
                }}
              >
                Create Watchlist
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 9. ADD STOCKS MODAL (Search & Add NSE Stocks to Active List)   */}
      {/* ------------------------------------------------------------- */}
      {addStockModalOpen && currentActiveList && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add Stocks"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setAddStockModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-panel"
            style={{
              maxWidth: "520px",
              width: "100%",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              padding: "18px",
              gap: "12px",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "var(--color-text-primary)" }}>
                Add to &ldquo;{currentActiveList.name}&rdquo;
              </h3>
              <button
                type="button"
                onClick={() => setAddStockModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-text-muted)",
                  fontSize: "16px",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Search Bar */}
            <input
              type="text"
              value={addStockSearchQuery}
              onChange={(e) => setAddStockSearchQuery(e.target.value)}
              placeholder="Search 50 NSE stocks by symbol or company..."
              autoFocus
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "8px",
                background: "var(--bg-main)",
                border: "1px solid var(--border-subtle)",
                color: "var(--color-text-primary)",
                fontSize: "12px",
                fontWeight: "500",
                outline: "none",
              }}
            />

            {/* Scrollable Stocks List */}
            <div
              style={{
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                maxHeight: "360px",
                paddingRight: "4px",
              }}
            >
              {stocks
                .filter((s) => {
                  const q = addStockSearchQuery.trim().toUpperCase();
                  if (!q) return true;
                  const t = s.ticker.toUpperCase();
                  const c = (COMPANY_NAMES[s.ticker] || "").toUpperCase();
                  const sec = getStockSector(s).toUpperCase();
                  return t.includes(q) || c.includes(q) || sec.includes(q);
                })
                .map((s) => {
                  const isAlreadyAdded = currentActiveList.tickers.includes(s.ticker.toUpperCase());
                  const companyName = COMPANY_NAMES[s.ticker] || s.sector;

                  return (
                    <div
                      key={s.ticker}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 10px",
                        background: "rgba(0, 0, 0, 0.02)",
                        borderRadius: "8px",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "13px", fontWeight: "800", color: "var(--color-text-primary)" }}>
                            {s.ticker}
                          </span>
                          <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
                            ₹{s.price.toFixed(2)}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: "10px",
                            color: "var(--color-text-muted)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: "240px",
                          }}
                        >
                          {companyName}
                        </span>
                      </div>

                      {isAlreadyAdded ? (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            color: "var(--color-buy)",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            background: "rgba(5, 150, 105, 0.1)",
                          }}
                        >
                          ✓ Added
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddStockToList(currentActiveList.id, s.ticker)}
                          disabled={mutating}
                          style={{
                            padding: "5px 12px",
                            borderRadius: "6px",
                            background: "var(--accent-ml)",
                            color: "#ffffff",
                            border: "none",
                            fontSize: "11px",
                            fontWeight: "700",
                            cursor: "pointer",
                          }}
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setAddStockModalOpen(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "12px",
                  fontWeight: "700",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 10. QUICK ADD TO WATCHLIST PICKER (From NIFTY 50 View)        */}
      {/* ------------------------------------------------------------- */}
      {quickAddStockTicker && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add to Personal Watchlist"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setQuickAddStockTicker(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-panel"
            style={{
              maxWidth: "380px",
              width: "100%",
              padding: "18px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "800", color: "var(--color-text-primary)" }}>
                Add {quickAddStockTicker} to Watchlist
              </h3>
              <button
                type="button"
                onClick={() => setQuickAddStockTicker(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-text-muted)",
                  fontSize: "16px",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: 0 }}>
              Select a personal watchlist to track <strong>{quickAddStockTicker}</strong>:
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {watchlists.map((wl) => {
                const isAdded = wl.tickers.includes(quickAddStockTicker.toUpperCase());

                return (
                  <button
                    key={wl.id}
                    type="button"
                    onClick={() => {
                      if (!isAdded) {
                        handleAddStockToList(wl.id, quickAddStockTicker);
                        setQuickAddStockTicker(null);
                      }
                    }}
                    disabled={isAdded}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: isAdded ? "rgba(0, 0, 0, 0.02)" : "var(--bg-card)",
                      border: "1px solid var(--border-subtle)",
                      cursor: isAdded ? "default" : "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div>
                      <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--color-text-primary)" }}>
                        {wl.name}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--color-text-muted)", marginLeft: "6px" }}>
                        ({wl.tickers.length} stocks)
                      </span>
                    </div>

                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "700",
                        color: isAdded ? "var(--color-buy)" : "var(--accent-ml)",
                      }}
                    >
                      {isAdded ? "✓ Added" : "+ Add"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 11. CUSTOMIZE WATCHLIST MODAL (Rename / Delete)               */}
      {/* ------------------------------------------------------------- */}
      {customizeModalOpen && currentActiveList && currentActiveList.isCustom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Customize Watchlist"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setCustomizeModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-panel"
            style={{
              maxWidth: "400px",
              width: "100%",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "var(--color-text-primary)" }}>
                Customize &ldquo;{currentActiveList.name}&rdquo;
              </h3>
              <button
                type="button"
                onClick={() => setCustomizeModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-text-muted)",
                  fontSize: "16px",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* Rename form */}
            <form onSubmit={handleRenameWatchlist} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                Rename Watchlist:
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "6px",
                    background: "var(--bg-main)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--color-text-primary)",
                    fontSize: "12px",
                    fontWeight: "600",
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  disabled={!renameValue.trim() || renameValue.trim() === currentActiveList.name}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "6px",
                    background: "var(--accent-ml)",
                    color: "#ffffff",
                    border: "none",
                    fontSize: "12px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  Save
                </button>
              </div>
            </form>

            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
              <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-sell)", textTransform: "uppercase" }}>
                Danger Zone:
              </label>
              <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: "4px 0 10px 0" }}>
                Permanently delete this personal watchlist and its saved stocks.
              </p>
              <button
                type="button"
                onClick={handleDeleteCurrentWatchlist}
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  background: "rgba(220, 38, 38, 0.1)",
                  color: "var(--color-sell)",
                  border: "1px solid var(--color-sell)",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                Delete This Watchlist
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
