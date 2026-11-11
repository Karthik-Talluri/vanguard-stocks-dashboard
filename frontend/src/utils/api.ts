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
  futures_price?: number;
  exchange?: string;
  expiry_date?: string;
  expiry_formatted?: string;
  lot_size?: number;
  margin_per_lot?: number;
  future_contract: string;
  option_contract: string;
  expected_return: number;
  strategy_type?: string;
}

export interface FuturesExpiryOption {
  series: string;
  expiry_date: string;
  expiry_formatted: string;
  month_label: string;
  year_short: string;
  days_to_expiry: number;
  contract_symbol: string;
  short_contract: string;
  futures_price: number;
  margin_per_lot: number;
}

export interface FuturesContractSpec {
  ticker: string;
  display_symbol: string;
  sector?: string;
  exchange: string;
  instrument: string;
  spot_price: number;
  futures_price: number;
  basis: number;
  basis_pct: number;
  contract_symbol: string;
  short_contract: string;
  expiry_date: string;
  expiry_formatted: string;
  month_label: string;
  days_to_expiry: number;
  lot_size: number;
  lots: number;
  total_quantity: number;
  margin_pct: number;
  margin_pct_display: number;
  margin_per_lot: number;
  value_per_lot: number;
  required_margin: number;
  estimated_trade_value: number;
  tick_size: number;
  available_expiries: FuturesExpiryOption[];
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
  futures_price?: number;
  exchange?: string;
  lot_size: number;
  futures_expiry?: string;
  futures_expiry_formatted?: string;
  futures_contract?: string;
  futures_required_margin?: number;
  futures_trade_value?: number;
  futures_contract_spec?: FuturesContractSpec;
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

export async function fetchFuturesContracts(): Promise<{
  exchange: string;
  default_margin_pct: number;
  expiries: FuturesExpiryOption[];
  contracts: FuturesContractSpec[];
}> {
  const res = await fetch(`${getApiBase()}/api/futures/contracts`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
  });
  if (!res.ok) throw new Error("Failed to fetch Futures contracts");
  return res.json();
}

export async function fetchFuturesContract(
  ticker: string,
  lots = 1,
  expiryDate?: string
): Promise<FuturesContractSpec> {
  let url = `${getApiBase()}/api/futures/contract/${encodeURIComponent(ticker.toUpperCase())}?lots=${Math.max(1, lots)}`;
  if (expiryDate) {
    url += `&expiry_date=${encodeURIComponent(expiryDate)}`;
  }
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
  });
  if (!res.ok) throw new Error(`Failed to fetch Futures contract for ${ticker}`);
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

export interface FuturesPosition {
  id: string;
  user_id: string;
  ticker: string;
  sector?: string;
  contract_symbol: string;
  expiry_date: string;
  expiry_formatted: string;
  exchange: string;
  side: "BUY" | "SELL";
  order_mode: "MARKET" | "LIMIT";
  lot_size: number;
  lots: number;
  total_quantity: number;
  entry_price: number;
  current_spot_price: number;
  current_futures_price: number;
  trade_value: number;
  margin_blocked: number;
  margin_pct: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  realized_pnl: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PendingFuturesOrder {
  id: string;
  ticker: string;
  contract_symbol: string;
  expiry_date: string;
  expiry_formatted: string;
  exchange: string;
  side: "BUY" | "SELL";
  order_mode: string;
  lot_size: number;
  lots: number;
  total_quantity: number;
  limit_price: number;
  current_futures_price: number;
  margin_blocked: number;
  status: string;
  created_at: string;
}

export interface ClosedFuturesPosition {
  id: string;
  ticker: string;
  contract_symbol: string;
  expiry_date: string;
  expiry_formatted: string;
  exchange: string;
  side: "BUY" | "SELL";
  lot_size: number;
  lots: number;
  total_quantity: number;
  entry_price: number;
  exit_price: number;
  margin_blocked: number;
  realized_pnl: number;
  status: string;
  created_at: string;
  closed_at: string;
}

export interface PaperAccount {
  user_id: string;
  user_name?: string;
  initial_capital: number;
  available_cash: number;
  equity_invested?: number;
  total_invested: number;
  portfolio_market_value: number;
  total_portfolio_value: number;
  realized_pnl: number;
  unrealized_pnl: number;
  equity_unrealized_pnl?: number;
  futures_margin_blocked?: number;
  futures_unrealized_pnl?: number;
  total_pnl: number;
  total_pnl_pct: number;
  holdings: PaperHolding[];
  holdings_count: number;
  futures_positions?: FuturesPosition[];
  futures_count?: number;
  pending_futures_orders?: PendingFuturesOrder[];
  closed_futures_positions?: ClosedFuturesPosition[];
  is_simulated: boolean;
  state_updated_at?: string;
  last_updated: string;
  last_updated_formatted: string;
  market_session: string;
  is_market_open: boolean;
}

export interface PaperTransaction {
  id: string;
  user_id: string;
  ticker: string;
  order_type: "BUY" | "SELL" | "RESET" | "FUTURES_BUY" | "FUTURES_SELL" | "FUTURES_CLOSE" | string;
  instrument_type?: "EQUITY" | "FUTURES" | "SYSTEM" | string;
  side?: "BUY" | "SELL" | string;
  quantity: number;
  lots?: number;
  lot_size?: number;
  expiry_date?: string;
  contract_symbol?: string;
  execution_price: number;
  total_amount: number;
  margin_used?: number;
  realized_pnl: number;
  timestamp: string;
  formatted_time: string;
  status: string;
  order_mode?: string;
  position_id?: string;
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
  const mappedId = userId === "usr_ravindra" ? "usr_rahul" : userId;
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

function getClientSnapshotForMutation(uid: string): {
  client_account?: PaperAccount;
  client_transactions?: PaperTransaction[];
} {
  const localAcc = getLocalPaperAccount(uid);
  if (!localAcc || (localAcc.user_id && localAcc.user_id !== uid)) {
    return {};
  }
  const localTxs = getLocalPaperTransactions(uid);
  return {
    client_account: localAcc,
    client_transactions: Array.isArray(localTxs) ? localTxs.slice(0, 100) : [],
  };
}

export async function syncPaperAccountWithBackend(
  userId: string,
  account: PaperAccount,
  transactions?: PaperTransaction[],
  force = false
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
      transactions: transactions || [],
      force
    })
  });
  if (!res.ok) {
    return account;
  }
  const data = await res.json();
  if (data?.account) {
    const latestLocal = getLocalPaperAccount(uid);
    const latestTs = latestLocal?.state_updated_at || "";
    const serverTs = data.account?.state_updated_at || "";
    if (!force && latestLocal && latestTs && serverTs && latestTs > serverTs) {
      return latestLocal;
    }
    saveLocalPaperAccount(uid, data.account);
    if (Array.isArray(data?.transactions)) {
      saveLocalPaperTransactions(uid, data.transactions);
    }
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
    const localAcc = getLocalPaperAccount(uid);
    const localTs = localAcc?.state_updated_at || "";
    const serverTs = serverAcc?.state_updated_at || "";

    // If serverless container was cold, recycled, or behind client's latest mutation,
    // restore/reconcile from local persisted snapshot cleanly.
    const serverEmpty =
      (!serverAcc.holdings || serverAcc.holdings.length === 0) &&
      (!serverAcc.futures_positions || serverAcc.futures_positions.length === 0) &&
      (!serverAcc.pending_futures_orders || serverAcc.pending_futures_orders.length === 0) &&
      (!serverAcc.closed_futures_positions || serverAcc.closed_futures_positions.length === 0) &&
      serverAcc.realized_pnl === 0 &&
      Math.abs(serverAcc.available_cash - serverAcc.initial_capital) < 0.01;

    const localHasData = Boolean(
      localAcc &&
      (
        (localAcc.holdings && localAcc.holdings.length > 0) ||
        (localAcc.futures_positions && localAcc.futures_positions.length > 0) ||
        (localAcc.pending_futures_orders && localAcc.pending_futures_orders.length > 0) ||
        (localAcc.closed_futures_positions && localAcc.closed_futures_positions.length > 0) ||
        (localAcc.realized_pnl !== 0)
      )
    );

    const clientIsNewer = Boolean(localAcc && localTs && (!serverTs || localTs > serverTs));
    const legacyColdRestore = Boolean(serverEmpty && serverTs === "" && localAcc && localHasData);

    if (clientIsNewer || legacyColdRestore) {
      const localTxs = getLocalPaperTransactions(uid);
      const syncedAcc = await syncPaperAccountWithBackend(uid, localAcc!, localTxs, clientIsNewer);
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
  quantity: number,
  idempotencyKey?: string
): Promise<{ success: boolean; order: any; account: PaperAccount }> {
  const uid = userId || getPaperUserId();
  const snap = getClientSnapshotForMutation(uid);
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
      quantity,
      idempotency_key: idempotencyKey,
      ...snap
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.message || "Failed to execute paper trade");
  }
  if (data?.account) {
    saveLocalPaperAccount(uid, data.account);
  }
  if (Array.isArray(data?.transactions)) {
    saveLocalPaperTransactions(uid, data.transactions);
  }
  return data;
}

export async function executeFuturesOrder(
  userId: string,
  ticker: string,
  side: "BUY" | "SELL",
  lots: number,
  orderType: "MARKET" | "LIMIT" = "MARKET",
  limitPrice?: number,
  expiryDate?: string,
  idempotencyKey?: string
): Promise<{ success: boolean; order: any; account: PaperAccount }> {
  const uid = userId || getPaperUserId();
  const snap = getClientSnapshotForMutation(uid);
  const res = await fetch(`${getApiBase()}/api/paper-trading/futures/order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache"
    },
    body: JSON.stringify({
      user_id: uid,
      ticker: ticker.toUpperCase(),
      side: side.toUpperCase(),
      lots,
      order_type: orderType.toUpperCase(),
      limit_price: orderType === "LIMIT" ? limitPrice : undefined,
      expiry_date: expiryDate,
      idempotency_key: idempotencyKey,
      ...snap
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.message || "Failed to execute Futures paper order");
  }
  if (data?.account) {
    saveLocalPaperAccount(uid, data.account);
  }
  if (Array.isArray(data?.transactions)) {
    saveLocalPaperTransactions(uid, data.transactions);
  }
  return data;
}

export async function closeFuturesPosition(
  userId: string,
  positionId: string,
  idempotencyKey?: string
): Promise<{ success: boolean; order: any; account: PaperAccount }> {
  const uid = userId || getPaperUserId();
  const snap = getClientSnapshotForMutation(uid);
  const res = await fetch(`${getApiBase()}/api/paper-trading/futures/close`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache"
    },
    body: JSON.stringify({
      user_id: uid,
      position_id: positionId,
      idempotency_key: idempotencyKey,
      ...snap
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.message || "Failed to close Futures position");
  }
  if (data?.account) {
    saveLocalPaperAccount(uid, data.account);
  }
  if (Array.isArray(data?.transactions)) {
    saveLocalPaperTransactions(uid, data.transactions);
  }
  return data;
}

export async function cancelFuturesOrder(
  userId: string,
  positionId: string
): Promise<{ success: boolean; cancel: any; account: PaperAccount }> {
  const uid = userId || getPaperUserId();
  const snap = getClientSnapshotForMutation(uid);
  const res = await fetch(`${getApiBase()}/api/paper-trading/futures/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache"
    },
    body: JSON.stringify({
      user_id: uid,
      position_id: positionId,
      ...snap
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.message || "Failed to cancel pending Futures order");
  }
  if (data?.account) {
    saveLocalPaperAccount(uid, data.account);
  }
  if (Array.isArray(data?.transactions)) {
    saveLocalPaperTransactions(uid, data.transactions);
  }
  return data;
}

function filterLocalTransactions(cached: PaperTransaction[], orderType?: "BUY" | "SELL" | "FUTURES"): PaperTransaction[] {
  if (orderType === "FUTURES") {
    return cached.filter(t => t.instrument_type === "FUTURES" || (t.order_type || "").startsWith("FUTURES"));
  }
  if (orderType) {
    return cached.filter(t => t.order_type === orderType || t.order_type === `FUTURES_${orderType}`);
  }
  return cached;
}

export async function fetchPaperTransactions(
  userId?: string,
  orderType?: "BUY" | "SELL" | "FUTURES"
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
    const localTxs = getLocalPaperTransactions(uid);
    const localAcc = getLocalPaperAccount(uid);
    const serverMax = data.reduce((m, t) => ((t.timestamp || "") > m ? (t.timestamp || "") : m), "");
    const localMax = localTxs.reduce((m, t) => ((t.timestamp || "") > m ? (t.timestamp || "") : m), "");
    const localStateTs = localAcc?.state_updated_at || "";

    // If serverless GET hit a stale container missing client's newer local transactions
    // (or returning pre-reset transactions older than localAcc.state_updated_at), preserve local.
    const filteredLocal = filterLocalTransactions(localTxs, orderType);
    const serverBeforeReset = Boolean(
      localStateTs &&
      data.length > filteredLocal.length &&
      (!serverMax || serverMax < localStateTs)
    );
    if (
      serverBeforeReset ||
      (
        localTxs.length > 0 &&
        localMax &&
        (!localStateTs || localStateTs >= localMax) &&
        (data.length < filteredLocal.length || !serverMax || localMax > serverMax)
      )
    ) {
      return filteredLocal;
    }

    if (!orderType) {
      saveLocalPaperTransactions(uid, data);
    }
    return data;
  } catch {
    return filterLocalTransactions(getLocalPaperTransactions(uid), orderType);
  }
}

// ==========================================
// PER-USER WATCHLIST API (DB + LOCAL CACHE)
// ==========================================

const WATCHLIST_STORAGE_PREFIX = "vanguard_watchlist_v1_";
const WATCHLIST_CUSTOM_PREFIX = "vanguard_wl_customized_v2_";
const WATCHLIST_UPDATED_PREFIX = "vanguard_wl_updated_v2_";
const DEFAULT_WATCHLIST_TICKERS = ["RELIANCE", "TCS", "HDFCBANK", "INFYS", "TATAMOTORS"];

export function getLocalWatchlistTickers(userId: string): string[] {
  if (typeof window === "undefined") return DEFAULT_WATCHLIST_TICKERS;
  const uid = userId || DEFAULT_PAPER_USER_ID;
  try {
    const raw = window.localStorage.getItem(`${WATCHLIST_STORAGE_PREFIX}${uid}`);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((t): t is string => typeof t === "string" && t.length > 0);
      }
    }
  } catch (err) {
    console.error("Failed to read watchlist from localStorage:", err);
  }
  return DEFAULT_WATCHLIST_TICKERS;
}

export function getLocalWatchlistUpdatedAt(userId: string): string {
  if (typeof window === "undefined") return "";
  const uid = userId || DEFAULT_PAPER_USER_ID;
  try {
    return window.localStorage.getItem(`${WATCHLIST_UPDATED_PREFIX}${uid}`) || "";
  } catch {
    return "";
  }
}

export function saveLocalWatchlistTickers(
  userId: string,
  tickers: string[],
  markCustomized = false,
  updatedAt?: string
): void {
  if (typeof window === "undefined") return;
  const uid = userId || DEFAULT_PAPER_USER_ID;
  try {
    window.localStorage.setItem(`${WATCHLIST_STORAGE_PREFIX}${uid}`, JSON.stringify(tickers));
    if (markCustomized) {
      window.localStorage.setItem(`${WATCHLIST_CUSTOM_PREFIX}${uid}`, "1");
    }
    if (updatedAt !== undefined) {
      window.localStorage.setItem(`${WATCHLIST_UPDATED_PREFIX}${uid}`, updatedAt);
    }
  } catch (err) {
    console.error("Failed to save watchlist to localStorage:", err);
  }
}

function isSameList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export async function fetchWatchlist(userId: string): Promise<string[]> {
  const uid = userId || getPaperUserId();
  const startLocalUpdatedAt = getLocalWatchlistUpdatedAt(uid);
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 12000) : null;
  try {
    const res = await fetch(`${getApiBase()}/api/watchlist?user_id=${encodeURIComponent(uid)}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" },
      signal: controller?.signal,
    });
    if (!res.ok) throw new Error(`Failed to fetch watchlist (${res.status})`);
    const data = await res.json();
    const serverTickers: string[] = Array.isArray(data?.tickers) ? data.tickers : [];
    const serverUpdatedAt: string = typeof data?.updated_at === "string" ? data.updated_at : "";

    // Restore customized client watchlist if serverless container cold-started or is behind
    if (typeof window !== "undefined") {
      const isCustomized = window.localStorage.getItem(`${WATCHLIST_CUSTOM_PREFIX}${uid}`) === "1";
      const localTickers = getLocalWatchlistTickers(uid);
      const localUpdatedAt = getLocalWatchlistUpdatedAt(uid);
      const mutatedWhileFetching = Boolean(localUpdatedAt && localUpdatedAt !== startLocalUpdatedAt);
      if (mutatedWhileFetching && (!serverUpdatedAt || localUpdatedAt > serverUpdatedAt)) {
        return localTickers;
      }
      const clientIsNewer = Boolean(isCustomized && localUpdatedAt && (!serverUpdatedAt || localUpdatedAt > serverUpdatedAt));
      const legacyCold = Boolean(isCustomized && isSameList(serverTickers, DEFAULT_WATCHLIST_TICKERS) && !isSameList(localTickers, DEFAULT_WATCHLIST_TICKERS));
      if (clientIsNewer || legacyCold) {
        return await syncWatchlistWithBackend(uid, localTickers, localUpdatedAt);
      }
    }

    saveLocalWatchlistTickers(uid, serverTickers, false, serverUpdatedAt);
    return serverTickers;
  } catch {
    return getLocalWatchlistTickers(uid);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function addToWatchlist(userId: string, ticker: string): Promise<string[]> {
  const uid = userId || getPaperUserId();
  const sym = ticker.toUpperCase().trim();
  const res = await fetch(`${getApiBase()}/api/watchlist/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
    body: JSON.stringify({
      user_id: uid,
      ticker: sym,
      client_tickers: getLocalWatchlistTickers(uid),
      client_updated_at: getLocalWatchlistUpdatedAt(uid) || undefined
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Failed to add stock to watchlist");
  }
  const tickers: string[] = Array.isArray(data?.tickers) ? data.tickers : [];
  const updatedAt: string = typeof data?.updated_at === "string" ? data.updated_at : "";
  saveLocalWatchlistTickers(uid, tickers, true, updatedAt);
  return tickers;
}

export async function removeFromWatchlist(userId: string, ticker: string): Promise<string[]> {
  const uid = userId || getPaperUserId();
  const sym = ticker.toUpperCase().trim();
  const res = await fetch(`${getApiBase()}/api/watchlist/remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
    body: JSON.stringify({
      user_id: uid,
      ticker: sym,
      client_tickers: getLocalWatchlistTickers(uid),
      client_updated_at: getLocalWatchlistUpdatedAt(uid) || undefined
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Failed to remove stock from watchlist");
  }
  const tickers: string[] = Array.isArray(data?.tickers) ? data.tickers : [];
  const updatedAt: string = typeof data?.updated_at === "string" ? data.updated_at : "";
  saveLocalWatchlistTickers(uid, tickers, true, updatedAt);
  return tickers;
}

export async function syncWatchlistWithBackend(
  userId: string,
  tickers: string[],
  clientUpdatedAt?: string
): Promise<string[]> {
  const uid = userId || getPaperUserId();
  const targetUpdatedAt = clientUpdatedAt || getLocalWatchlistUpdatedAt(uid) || "";
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 12000) : null;
  try {
    const res = await fetch(`${getApiBase()}/api/watchlist/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify({
        user_id: uid,
        tickers,
        client_updated_at: targetUpdatedAt || undefined
      }),
      signal: controller?.signal,
    });
    if (!res.ok) return tickers;
    const data = await res.json();
    const synced: string[] = Array.isArray(data?.tickers) ? data.tickers : tickers;
    const updatedAt: string = typeof data?.updated_at === "string" ? data.updated_at : targetUpdatedAt;
    const latestLocalUpdatedAt = getLocalWatchlistUpdatedAt(uid);
    if (latestLocalUpdatedAt && updatedAt && latestLocalUpdatedAt > updatedAt) {
      return getLocalWatchlistTickers(uid);
    }
    saveLocalWatchlistTickers(uid, synced, true, updatedAt);
    return synced;
  } catch {
    return getLocalWatchlistTickers(uid);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function resetPaperAccount(userId?: string): Promise<{ success: boolean; message: string; account: PaperAccount; transactions?: PaperTransaction[] }> {
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
    saveLocalPaperTransactions(uid, Array.isArray(data.transactions) ? data.transactions : []);
  }
  return data;
}

export async function syncLiveData(): Promise<{ status: string; message: string; synced_stocks: number; timestamp: number }> {
  const res = await fetch(`${getApiBase()}/api/market/sync-live`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to trigger live sync");
  return res.json();
}

