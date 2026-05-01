// Type re-export for components copied from the local-TWS frontend
// (which import from "@/lib/ws"). Keeping the same shape so component code
// doesn't need to change.
export type Quote = {
  symbol: string;
  last: number | null;
  bid: number | null;
  ask: number | null;
  prev_close: number | null;
  change: number | null;
  change_pct: number | null;
  return_5d: number | null;
  return_20d: number | null;
  return_ytd: number | null;
  market_cap: number | null;
  pe_ttm: number | null;
  pe_fwd: number | null;
  ps_ttm: number | null;
  growth_yoy: number | null;
  growth_fwd: number | null;
  gross_margin: number | null;
  ebitda_margin: number | null;
  ws_rating: number | null;
  ws_rating_label: string | null;
  target_price: number | null;
  sa_rating: string | null;
  high_52w: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi6: number | null;
  rsi14: number | null;
  rsi_d: number | null;
  rsi_w: number | null;
  rsi_m: number | null;
  m_state: boolean | null;
  w_state: boolean | null;
  d_state: boolean | null;
  ema10_m: number | null;
  ema20_m: number | null;
  ema10_w: number | null;
  ema20_w: number | null;
  ema20_d: number | null;
  macd_w: number | null;
  signal_w: number | null;
  source: string | null;
  intraday_15m: { t: number; c: number; s: "pre" | "reg" | "post" }[] | null;
  next_earnings: { date: string; time: "bmo" | "amc" | "unknown"; days: number } | null;
};
