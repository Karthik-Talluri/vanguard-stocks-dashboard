const PRODUCTION_API_URL = "https://vanguard-stocks-backend.vercel.app";
const PRODUCTION_WS_URL = "wss://vanguard-stocks-backend.vercel.app";

export function getApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      return PRODUCTION_API_URL;
    }
  }
  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_API_URL;
  }
  return "http://localhost:8000";
}

export function getWsBase(): string {
  if (process.env.NEXT_PUBLIC_WS_BASE) {
    return process.env.NEXT_PUBLIC_WS_BASE.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      return PRODUCTION_WS_URL;
    }
  }
  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_WS_URL;
  }
  return "ws://localhost:8000";
}

export const API_BASE = getApiBase();
export const WS_BASE = getWsBase();

export interface StockOverview {
  ticker: string;
  sector: string;
  price: number;
  change_pct: number;
  master_score: number;
  recommendation: string;
  prob_up?: number;
  prob_down?: number;
  prob_flat?: number;
  prob_up_1w?: number;
  prob_down_1w?: number;
  prob_flat_1w?: number;
  weight?: number;
  prev_close?: number;
  day_high?: number;
  day_low?: number;
  day_open?: number;
  last_updated?: string;
  source?: string;
  is_market_open?: boolean;
}

export interface MarketStatus {
  regime: string;
  vix: number;
  nifty_close: number;
  nifty_change: number;
  nifty_prev_close?: number;
  nifty_change_abs?: number;
  nifty_open?: number;
  nifty_high?: number;
  nifty_low?: number;
  bank_nifty_close?: number;
  bank_nifty_prev_close?: number;
  bank_nifty_change_abs?: number;
  bank_nifty_change?: number;
  bank_nifty_open?: number;
  bank_nifty_high?: number;
  bank_nifty_low?: number;
  vix_prev_close?: number;
  vix_change?: number;
  sp500: number;
  nasdaq: number;
  dxy: number;
  us10y: number;
  last_updated?: string;
  last_updated_formatted?: string;
  last_trading_session?: string;
  is_market_open?: boolean;
  market_status?: "OPEN" | "CLOSED" | "PRE_MARKET";
  session_type?: string;
  market_session_message?: string;
  is_stale?: boolean;
  warning?: string;
  source?: string;
  reasoning: string[];
  last_synced?: number;
}

export interface NewsArticle {
  date: string;
  headline: string;
  sentiment: number;
  url?: string;
}

export interface AgentResult {
  score: number;
  confidence: number;
  reasoning: string[];
  metrics: Record<string, any>;
}

export interface StockDetail {
  ticker: string;
  master_score: number;
  recommendation: string;
  market_regime: string;
  vix: number;
  regime_details: Record<string, any>;
  weights_applied: Record<string, number>;
  consensus_summary: string[];
  agents: Record<string, AgentResult>;
  fundamentals_meta: Record<string, any>;
  // Expanded Multi-Factor Fields
  stock?: string;
  signal?: string;
  confidence?: number;
  technical_score?: number;
  sector_score?: number;
  fundamental_score?: number;
  sentiment_score?: number;
  global_score?: number;
  risk_score?: number;
  target?: number;
  stop_loss?: number;
  suggested_position_size?: number;
  risk_level?: string;
  explainable_reasons?: string[];
  portfolio_intelligence?: Record<string, any>;
  advanced_features?: Record<string, any>;
}

export interface ChartDataPoint {
  FormattedDate: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  EMA_20: number;
  EMA_50: number;
  EMA_200: number;
  BB_Upper: number;
  BB_Lower: number;
  FuturesOI?: number;
  DeliveryPct?: number;
  OptionsPCR?: number;
}

export async function fetchMarketStatus(): Promise<MarketStatus> {
  const res = await fetch(`${getApiBase()}/api/market-status`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch market status (${res.status})`);
  }
  return res.json();
}

export async function fetchStocks(): Promise<StockOverview[]> {
  const res = await fetch(`${getApiBase()}/api/stocks`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch stocks (${res.status})`);
  }
  return res.json();
}

export async function fetchStockDetail(ticker: string): Promise<StockDetail> {
  const res = await fetch(`${getApiBase()}/api/stocks/${ticker}`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    }
  });
  return res.json();
}

export async function fetchStockChart(ticker: string, interval: string): Promise<ChartDataPoint[]> {
  const res = await fetch(`${getApiBase()}/api/stocks/${ticker}/chart?interval=${interval}`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    }
  });
  return res.json();
}

export async function applyOverride(vix: number | null, nasdaqRet: number | null) {
  const body: Record<string, any> = {};
  if (vix !== null) body.vix = vix;
  if (nasdaqRet !== null) body.nasdaq_ret = nasdaqRet;
  const res = await fetch(`${getApiBase()}/api/admin/override`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

export async function resetOverride() {
  const res = await fetch(`${getApiBase()}/api/admin/reset-override`, {
    method: "POST"
  });
  return res.json();
}

export async function injectNews(ticker: string, headline: string, sentiment: number) {
  const res = await fetch(`${getApiBase()}/api/admin/inject-news`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker, headline, sentiment })
  });
  return res.json();
}

export interface BTSTMetric {
  ticker: string;
  sector: string;
  price: number;
  btst_score: number;
  btst_conviction: number;
  prob_gap_up: number;
  prob_positive_close: number;
  expected_move: string;
  risk: string;
  recommendation: string;
  oi_type: string;
  oi_change_pct: number;
  delivery_pct: number;
  vol_shock: number;
  pcr: number;
  is_20d_high: boolean;
  is_50d_high: boolean;
  factor_breakdown: {
    price_action: number;
    volume: number;
    oi: number;
    smart_money: number;
    relative_strength: number;
    sector_momentum: number;
    market_mood: number;
    global_setup: number;
  };
  explanations: string[];
  pattern_matches: number;
}

export interface RiskEvent {
  ticker: string;
  sector: string;
  score: number;
  events: string[];
}

export interface BTSTData {
  all: BTSTMetric[];
  top_picks: BTSTMetric[];
  long_buildup: BTSTMetric[];
  breakouts: BTSTMetric[];
  high_delivery: BTSTMetric[];
  gap_up_probs: BTSTMetric[];
  pattern_matches: BTSTMetric[];
  risk_events: RiskEvent[];
}

export async function fetchBTSTData(): Promise<BTSTData> {
  const res = await fetch(`${getApiBase()}/api/btst`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
  });
  if (!res.ok) throw new Error("Failed to fetch BTST data");
  return res.json();
}

export interface FuturesOpportunity {
  ticker: string;
  sector: string;
  strategy_score: number;
  pop: number;
  expected_yield: number;
  price: number;
  future_contract: string;
  option_contract: string;
  expected_return: number;
  strategy_type?: string;
}

export interface FuturesAgentDetail {
  score: number;
  regime?: string;
  vix?: number;
  breadth_pct?: number;
  trend_alignment?: string;
  buildup?: string;
  pcr?: number;
  iv?: number;
  iv_rank_pct?: number;
  delivery_pct?: number;
  penalty?: number;
  events?: string[];
  adjustment?: number;
  pattern?: string;
  details: string;
}

export interface FuturesOptionCandidate {
  strike: number;
  option_symbol: string;
  premium: number;
  pop: number;
  yield: number;
  upside_remaining: number;
  expected_return: number;
  best_case: number;
  worst_case: number;
}

export interface BacktestTrade {
  trade_id: number;
  entry_date: string;
  exit_date: string;
  type: string;
  entry_price: number;
  strike: number;
  premium: number;
  exit_price: number;
  pnl_pct: number;
  pnl_amount: number;
  status: "PROFIT" | "LOSS";
  signals: string[];
  running_pnl_pct: number;
}

export interface FuturesBacktestDetail {
  total_trades: number;
  successful_trades: number;
  accuracy: number;
  annualized_5yr: number;
  annualized_3yr: number;
  annualized_1yr: number;
  max_drawdown: number;
  profit_factor: number;
  trades?: BacktestTrade[];
}

export interface FuturesDetail {
  ticker: string;
  strategy_score: number;
  spot_price: number;
  lot_size: number;
  margin_blocked: number;
  agents: {
    market_regime: FuturesAgentDetail;
    futures_strength: FuturesAgentDetail;
    oi_intelligence: FuturesAgentDetail;
    premium_harvest: FuturesAgentDetail;
    smart_money: FuturesAgentDetail;
    event_risk: FuturesAgentDetail;
    deep_candlestick?: FuturesAgentDetail;
  };
  recommendation: {
    future_contract: string;
    option_contract: string;
    strike: number;
    premium: number;
    pop: number;
    expected_yield: number;
    expected_return: number;
    best_case: number;
    worst_case: number;
    strategy_type?: string;
  };
  btst_recommendation?: {
    ticker: string;
    sector: string;
    price: number;
    btst_score: number;
    btst_conviction: number;
    prob_gap_up: number;
    prob_positive_close: number;
    expected_move: string;
    risk: string;
    recommendation: string;
    oi_type: string;
    oi_change_pct: number;
    delivery_pct: number;
    vol_shock: number;
    pcr: number;
    is_20d_high: boolean;
    is_50d_high: boolean;
    explanations: string[];
    pattern_matches: number;
  };
  candidates: FuturesOptionCandidate[];
  backtest: FuturesBacktestDetail;
}

export async function fetchFuturesOpportunities(): Promise<FuturesOpportunity[]> {
  const res = await fetch(`${getApiBase()}/api/futures-income/opportunities`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
  });
  if (!res.ok) throw new Error("Failed to fetch futures opportunities");
  return res.json();
}

export async function fetchFuturesDetail(ticker: string): Promise<FuturesDetail> {
  const res = await fetch(`${getApiBase()}/api/futures-income/detail/${ticker}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
  });
  if (!res.ok) throw new Error("Failed to fetch futures detail");
  return res.json();
}

export interface ShortTermPick {
  ticker: string;
  sector: string;
  price: number;
  change_pct: number;
  btst_score: number;
  master_score: number;
  short_term_score: number;
  prob_up_1w: number;
  prob_positive_close: number;
  prob_gap_up: number;
  expected_move: string;
  recommendation: string;
  stop_loss: number;
  target: number;
  risk_level: string;
  explanations: string[];
  technical_score: number;
  fundamental_score: number;
  sentiment_score: number;
}

export interface ShortTermPicksResponse {
  large_cap: ShortTermPick[];
  mid_cap: ShortTermPick[];
  small_cap: ShortTermPick[];
}

export async function fetchShortTermPicks(): Promise<ShortTermPicksResponse> {
  const res = await fetch(`${getApiBase()}/api/short-term-picks`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
  });
  if (!res.ok) throw new Error("Failed to fetch short term picks");
  return res.json();
}

export interface MultiBaggerPick {
  ticker: string;
  sector: string;
  market_cap: string;
  price: number;
  change_pct: number;
  beta: number;
  multibagger_score: number;
  opportunity_score: number;
  catalyst_score: number;
  catalyst_text: string;
  expected_3m_return: number;
  target_3m: number;
  stop_loss: number;
  delivery_pct: number;
  rsi: number;
  growth_sum: number;
  roe_roce: number;
  debt_equity: number;
  score_breakdown: {
    Growth: number;
    Capital_Allocation: number;
    Moat: number;
    Tailwind: number;
    Management: number;
    Smart_Money: number;
    Innovation: number;
    Technical: number;
    Valuation: number;
  };
  probabilities: {
    prob_2x: number;
    prob_3x: number;
    prob_5x: number;
    prob_10x: number;
  };
  hidden_multibagger_checklist: {
    future_eps_growth_25: boolean;
    revenue_acceleration_20: boolean;
    roic_improving: boolean;
    free_cash_flow_positive: boolean;
    debt_declining: boolean;
    promoter_holding_stable: boolean;
    institutional_buying: boolean;
    sector_in_uptrend: boolean;
    technical_breakout: boolean;
    reasonable_valuation: boolean;
    strong_upcoming_catalyst: boolean;
  };
}

export interface MultiBaggerResponse {
  all: MultiBaggerPick[];
  large_cap: MultiBaggerPick[];
  mid_cap: MultiBaggerPick[];
  small_cap: MultiBaggerPick[];
}

export async function fetchMultiBaggerPicks(): Promise<MultiBaggerResponse> {
  const res = await fetch(`${getApiBase()}/api/multibagger-picks`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
  });
  if (!res.ok) throw new Error("Failed to fetch multi-bagger picks");
  return res.json();
}

export interface PortfolioItem {
  rank: number;
  ticker: string;
  sector: string;
  weight: number;
  price: number;
  amount: number;
  shares: number;
  conviction: number;
}

export interface PortfolioSummary {
  total_invested: number;
  cash: number;
  style: string;
  investment_amount: number;
}

export interface RebalanceAction {
  action: "Buy" | "Sell" | "Reduce" | "Increase" | "Keep";
  ticker: string;
  amount: number;
  reason: string;
}

export interface WeeklyReportChange {
  type: "Added" | "Removed" | "Increased" | "Reduced" | "No Change";
  ticker: string;
}

export interface WeeklyReport {
  value: number;
  weekly_return: number;
  benchmark_return: number;
  outperformance: number;
  changes: WeeklyReportChange[];
}

export interface PortfolioResponse {
  portfolio: PortfolioItem[];
  summary: PortfolioSummary;
  rebalance_actions: RebalanceAction[];
  weekly_report: WeeklyReport;
}

export async function fetchGeneratedPortfolio(amount: number, style: string): Promise<PortfolioResponse> {
  const res = await fetch(`${getApiBase()}/api/portfolio/generate?amount=${amount}&style=${style}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
  });
  if (!res.ok) throw new Error("Failed to fetch optimized portfolio");
  return res.json();
}

// ==========================================
// PAPER TRADING SYSTEM INTERFACES & METHODS
// ==========================================

export interface PaperHolding {
  ticker: string;
  sector: string;
  market_cap: string;
  quantity: number;
  avg_buy_price: number;
  current_price: number;
  total_invested: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  day_change_pct: number;
}

export interface PaperAccount {
  user_id: string;
  user_name?: string;
  initial_capital: number;
  available_cash: number;
  total_invested: number;
  portfolio_market_value: number;
  total_portfolio_value: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  total_pnl_pct: number;
  holdings: PaperHolding[];
  holdings_count: number;
  is_simulated: boolean;
  last_updated: string;
  last_updated_formatted: string;
  market_session: string;
  is_market_open: boolean;
}

export interface PaperTransaction {
  id: string;
  user_id: string;
  ticker: string;
  order_type: "BUY" | "SELL" | "RESET";
  quantity: number;
  execution_price: number;
  total_amount: number;
  realized_pnl: number;
  timestamp: string;
  formatted_time: string;
  status: string;
  notes?: string;
}

export interface TradingUser {
  id: string;
  name: string;
}

export const PAPER_TRADING_USERS: TradingUser[] = [
  { id: "usr_karthik", name: "Karthik" },
  { id: "usr_rahul", name: "Rahul" },
  { id: "usr_priya", name: "Priya" },
  { id: "usr_arun", name: "Arun" },
  { id: "usr_sneha", name: "Sneha" },
  { id: "usr_vamsi", name: "Vamsi" },
  { id: "usr_harsha", name: "Harsha" },
  { id: "usr_pooja", name: "Pooja" },
  { id: "usr_sai", name: "Sai" },
  { id: "usr_divya", name: "Divya" },
];

export const DEFAULT_PAPER_USER_ID = "usr_karthik";

export function getActiveTradingUser(): TradingUser {
  if (typeof window === "undefined") return PAPER_TRADING_USERS[0];
  try {
    let savedId = localStorage.getItem("vanguard_active_paper_user_id");
    if (savedId === "usr_ravindra") savedId = "usr_rahul";
    const found = PAPER_TRADING_USERS.find(u => u.id === savedId);
    if (found) return found;
    localStorage.setItem("vanguard_active_paper_user_id", DEFAULT_PAPER_USER_ID);
    return PAPER_TRADING_USERS[0];
  } catch {
    return PAPER_TRADING_USERS[0];
  }
}

export function setActiveTradingUserId(userId: string): TradingUser {
  let mappedId = userId === "usr_ravindra" ? "usr_rahul" : userId;
  const found = PAPER_TRADING_USERS.find(u => u.id === mappedId) || PAPER_TRADING_USERS[0];
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("vanguard_active_paper_user_id", found.id);
      window.dispatchEvent(new CustomEvent("paper-user-changed", { detail: found }));
    } catch (e) {
      console.error("Failed to save active paper user:", e);
    }
  }
  return found;
}

export function getPaperUserId(): string {
  return getActiveTradingUser().id;
}

const STORAGE_PREFIX = "vanguard_paper_v2_";

export function getLocalPaperAccount(userId: string): PaperAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}acc_${userId}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to read local paper account:", e);
  }
  return null;
}

export function saveLocalPaperAccount(userId: string, account: PaperAccount): void {
  if (typeof window === "undefined" || !account) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}acc_${userId}`, JSON.stringify(account));
  } catch (e) {
    console.error("Failed to save local paper account:", e);
  }
}

export function getLocalPaperTransactions(userId: string): PaperTransaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}txs_${userId}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to read local paper transactions:", e);
  }
  return [];
}

export function saveLocalPaperTransactions(userId: string, txs: PaperTransaction[]): void {
  if (typeof window === "undefined" || !txs) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}txs_${userId}`, JSON.stringify(txs));
  } catch (e) {
    console.error("Failed to save local paper transactions:", e);
  }
}

export async function syncPaperAccountWithBackend(
  userId: string,
  account: PaperAccount,
  transactions?: PaperTransaction[]
): Promise<PaperAccount> {
  const uid = userId || getPaperUserId();
  const res = await fetch(`${getApiBase()}/api/paper-trading/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache"
    },
    body: JSON.stringify({
      user_id: uid,
      account,
      transactions: transactions || []
    })
  });
  if (!res.ok) {
    return account;
  }
  const data = await res.json();
  if (data?.account) {
    saveLocalPaperAccount(uid, data.account);
    return data.account;
  }
  return account;
}

export async function fetchPaperAccount(userId?: string): Promise<PaperAccount> {
  const uid = userId || getPaperUserId();
  try {
    const res = await fetch(`${getApiBase()}/api/paper-trading/account?user_id=${encodeURIComponent(uid)}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch paper trading account (${res.status})`);
    }
    const serverAcc: PaperAccount = await res.json();

    // If serverless container was recycled and returned empty holdings,
    // restore from local persisted snapshot if available
    const localAcc = getLocalPaperAccount(uid);
    if ((!serverAcc.holdings || serverAcc.holdings.length === 0) && localAcc && localAcc.holdings && localAcc.holdings.length > 0) {
      const localTxs = getLocalPaperTransactions(uid);
      const syncedAcc = await syncPaperAccountWithBackend(uid, localAcc, localTxs);
      saveLocalPaperAccount(uid, syncedAcc);
      return syncedAcc;
    }

    saveLocalPaperAccount(uid, serverAcc);
    return serverAcc;
  } catch (err) {
    const cached = getLocalPaperAccount(uid);
    if (cached) return cached;
    throw err;
  }
}

export async function executePaperOrder(
  userId: string,
  ticker: string,
  orderType: "BUY" | "SELL",
  quantity: number
): Promise<{ success: boolean; order: any; account: PaperAccount }> {
  const uid = userId || getPaperUserId();
  const res = await fetch(`${getApiBase()}/api/paper-trading/order`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Cache-Control": "no-cache"
    },
    body: JSON.stringify({
      user_id: uid,
      ticker: ticker.toUpperCase(),
      order_type: orderType.toUpperCase(),
      quantity
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.message || "Failed to execute paper trade");
  }
  if (data?.account) {
    saveLocalPaperAccount(uid, data.account);
  }
  return data;
}

export async function fetchPaperTransactions(
  userId?: string,
  orderType?: "BUY" | "SELL"
): Promise<PaperTransaction[]> {
  const uid = userId || getPaperUserId();
  let url = `${getApiBase()}/api/paper-trading/transactions?user_id=${encodeURIComponent(uid)}`;
  if (orderType) {
    url += `&order_type=${encodeURIComponent(orderType)}`;
  }
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch transaction history (${res.status})`);
    }
    const data: PaperTransaction[] = await res.json();
    if (!orderType) {
      saveLocalPaperTransactions(uid, data);
    }
    return data;
  } catch (err) {
    const cached = getLocalPaperTransactions(uid);
    if (orderType) {
      return cached.filter(t => t.order_type === orderType);
    }
    return cached;
  }
}

export async function resetPaperAccount(userId?: string): Promise<{ success: boolean; message: string; account: PaperAccount }> {
  const uid = userId || getPaperUserId();
  const res = await fetch(`${getApiBase()}/api/paper-trading/reset`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Cache-Control": "no-cache"
    },
    body: JSON.stringify({ user_id: uid })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.message || "Failed to reset paper account");
  }
  if (data?.account) {
    saveLocalPaperAccount(uid, data.account);
    saveLocalPaperTransactions(uid, []);
  }
  return data;
}

export async function syncLiveData(): Promise<{ status: string; message: string; synced_stocks: number; timestamp: number }> {
  const res = await fetch(`${getApiBase()}/api/market/sync-live`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to trigger live sync");
  return res.json();
}

