import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
// Service-role key bypasses RLS — only used in server-side route handlers.
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !serviceKey) {
  // Defer the throw until first use so build-time analysis doesn't fail.
  console.warn("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
}

export const sb = createClient(url || "http://placeholder", serviceKey || "placeholder", {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------- types ----------
export type Sector = {
  id: number;
  name: string;
  sort_order: number;
  description: string;
};

export type Category = {
  id: number;
  sector_id: number;
  name: string;
  sort_order: number;
  description: string;
};

export type Ticker = {
  id: number;
  symbol: string;
  exchange: string;
  currency: string;
  sec_type: string;
  category_id: number | null;
  sort_order: number;
  display_name: string;
  industry: string;
  moat: string;
  risk: string;
  notes: string;
  tags: string;
  position_status: string;
  sa_rating: string;
  created_at?: string;
  updated_at?: string;
};

export type Quote = {
  symbol: string;
  source: string;
  last: number | null;
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
  intraday_15m: { t: number; c: number; s: "pre" | "reg" | "post" }[] | null;
  next_earnings: { date: string; time: "bmo" | "amc" | "unknown"; days: number } | null;
  updated_at?: string;
};
