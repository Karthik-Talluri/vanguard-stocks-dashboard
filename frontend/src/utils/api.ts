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


