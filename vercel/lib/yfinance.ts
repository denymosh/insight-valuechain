// Wrapper around Yahoo Finance APIs with cookie+crumb auth to avoid 429 on cloud IPs.

import type { Bar } from "./indicators";

export type IntradayBar = { t: number; c: number; s: "pre" | "reg" | "post" };

const DAY = 86400 * 1000;
const YEAR = 365 * DAY;

// ─── Cookie + Crumb cache (with mutex to prevent parallel fetches) ───────────
let _cookie = "";
let _crumb = "";
let _cookieExpiry = 0;
let _crumbInflight: Promise<{ cookie: string; crumb: string }> | null = null;

async function ensureCrumb(): Promise<{ cookie: string; crumb: string }> {
  if (_crumb && Date.now() < _cookieExpiry) return { cookie: _cookie, crumb: _crumb };
  // If another call is already fetching the crumb, wait for it instead of firing a parallel request
  if (_crumbInflight) return _crumbInflight;
  _crumbInflight = _fetchCrumb().finally(() => { _crumbInflight = null; });
  return _crumbInflight;
}

async function _fetchCrumb(): Promise<{ cookie: string; crumb: string }> {
  // Step 1: get cookie
  const cookieRes = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": UA },
    redirect: "follow",
  });
  const setCookie = cookieRes.headers.get("set-cookie") ?? "";
  _cookie = setCookie.split(";")[0];
  // Step 2: get crumb
  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { ...BASE_HEADERS, Cookie: _cookie },
  });
  _crumb = (await crumbRes.text()).trim();
  _cookieExpiry = Date.now() + 55 * 60 * 1000;
  return { cookie: _cookie, crumb: _crumb };
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BASE_HEADERS = {
  "User-Agent": UA,
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

// ─── Low-level fetch with retry ─────────────────────────────────────────────
async function yfFetch(url: string, retries = 3): Promise<any> {
  const { cookie, crumb } = await ensureCrumb();
  const sep = url.includes("?") ? "&" : "?";
  const fullUrl = `${url}${sep}crumb=${encodeURIComponent(crumb)}`;

  for (let i = 0; i < retries; i++) {
    const res = await fetch(fullUrl, {
      headers: { ...BASE_HEADERS, Cookie: cookie },
    });
    if (res.status === 429) {
      // rate-limited: reset crumb and wait
      _crumb = "";
      await sleep(2000 * (i + 1));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }
  throw new Error(`Rate limited after ${retries} retries: ${url}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Chart (bars) ────────────────────────────────────────────────────────────
async function fetchChart(
  symbol: string,
  interval: string,
  period1: Date
): Promise<Bar[]> {
  const p1 = Math.floor(period1.getTime() / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  const url =
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${interval}&period1=${p1}&period2=${p2}&includePrePost=false`;
  try {
    const json = await yfFetch(url);
    const result = json?.chart?.result?.[0];
    if (!result) return [];
    const timestamps: number[] = result.timestamp ?? [];
    const ohlcv = result.indicators?.quote?.[0] ?? {};
    return timestamps
      .map((t, i) => ({
        date: new Date(t * 1000),
        open: Number(ohlcv.open?.[i]),
        high: Number(ohlcv.high?.[i]),
        low: Number(ohlcv.low?.[i]),
        close: Number(ohlcv.close?.[i]),
        volume: Number(ohlcv.volume?.[i] ?? 0),
      }))
      .filter((b) => Number.isFinite(b.close) && b.close > 0);
  } catch {
    return [];
  }
}

export async function fetchDaily(symbol: string): Promise<Bar[]> {
  return fetchChart(symbol, "1d", new Date(Date.now() - 2 * YEAR));
}

export async function fetchWeekly(symbol: string): Promise<Bar[]> {
  return fetchChart(symbol, "1wk", new Date(Date.now() - 5 * YEAR));
}

export async function fetchMonthly(symbol: string): Promise<Bar[]> {
  return fetchChart(symbol, "1mo", new Date(Date.now() - 15 * YEAR));
}

// ─── Intraday 15m ────────────────────────────────────────────────────────────
export async function fetchIntraday15m(symbol: string): Promise<IntradayBar[]> {
  try {
    const p1 = Math.floor((Date.now() - DAY) / 1000);
    const p2 = Math.floor(Date.now() / 1000);
    const url =
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?interval=15m&period1=${p1}&period2=${p2}&includePrePost=true`;
    const json = await yfFetch(url);
    const result = json?.chart?.result?.[0];
    if (!result) return [];
    const timestamps: number[] = result.timestamp ?? [];
    const ohlcv = result.indicators?.quote?.[0] ?? {};
    const out: IntradayBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = Number(ohlcv.close?.[i]);
      if (!Number.isFinite(c)) continue;
      const d = new Date(timestamps[i] * 1000);
      const etHour = etHourOf(d);
      const etMin = etMinuteOf(d);
      const totalMin = etHour * 60 + etMin;
      let s: "pre" | "reg" | "post" | null = null;
      if (totalMin >= 240 && totalMin < 570) s = "pre";
      else if (totalMin >= 570 && totalMin < 960) s = "reg";
      else if (totalMin >= 960 && totalMin < 1200) s = "post";
      if (s) out.push({ t: d.getTime(), c, s });
    }
    return out;
  } catch {
    return [];
  }
}

// ─── Live quote ──────────────────────────────────────────────────────────────
export async function fetchLiveQuote(
  symbol: string
): Promise<{ last: number | null; prev_close: number | null }> {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const json = await yfFetch(url);
    const meta = json?.chart?.result?.[0]?.meta ?? {};
    return {
      last: numOrNull(meta.regularMarketPrice ?? meta.chartPreviousClose),
      prev_close: numOrNull(meta.previousClose ?? meta.chartPreviousClose),
    };
  } catch {
    return { last: null, prev_close: null };
  }
}

// ─── Fundamentals ────────────────────────────────────────────────────────────
export type Fundamentals = {
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
};

const WS_LABELS: Record<number, string> = {
  1: "Strong Buy", 2: "Buy", 3: "Hold", 4: "Sell", 5: "Strong Sell",
};

export async function fetchFundamentals(symbol: string): Promise<Fundamentals> {
  const out: Fundamentals = {
    market_cap: null, pe_ttm: null, pe_fwd: null, ps_ttm: null,
    growth_yoy: null, growth_fwd: null, gross_margin: null,
    ebitda_margin: null, ws_rating: null, ws_rating_label: null, target_price: null,
  };
  try {
    // Fetch fresh cookie/crumb independently (v7 quote uses a different cookie scope)
    const cookieRes = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "follow" });
    const freshCookie = (cookieRes.headers.get("set-cookie") ?? "").split(";")[0];
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { ...BASE_HEADERS, Cookie: freshCookie },
    });
    const freshCrumb = (await crumbRes.text()).trim();

    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&fields=marketCap,trailingPE,forwardPE,priceToSalesTrailing12Months,revenueGrowth,grossMargins,ebitdaMargins,recommendationMean,targetMeanPrice,trailingEps,forwardEps&crumb=${encodeURIComponent(freshCrumb)}`;
    const res = await fetch(url, { headers: { ...BASE_HEADERS, Cookie: freshCookie } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const q = json?.quoteResponse?.result?.[0] ?? {};
    out.market_cap = numOrNull(q.marketCap);
    out.pe_ttm = numOrNull(q.trailingPE);
    out.pe_fwd = numOrNull(q.forwardPE);
    out.ps_ttm = numOrNull(q.priceToSalesTrailing12Months);
    const rg = numOrNull(q.revenueGrowth);
    if (rg !== null) out.growth_yoy = rg * 100;
    const trlEps = numOrNull(q.trailingEps);
    const fwdEps = numOrNull(q.forwardEps);
    if (trlEps != null && fwdEps != null && trlEps !== 0)
      out.growth_fwd = ((fwdEps - trlEps) / Math.abs(trlEps)) * 100;
    const gm = numOrNull(q.grossMargins);
    if (gm !== null) out.gross_margin = gm * 100;
    const em = numOrNull(q.ebitdaMargins);
    if (em !== null) out.ebitda_margin = em * 100;
    const rm = numOrNull(q.recommendationMean);
    if (rm !== null) { out.ws_rating = rm; out.ws_rating_label = WS_LABELS[Math.round(rm)] ?? null; }
    out.target_price = numOrNull(q.targetMeanPrice);
  } catch { /* leave defaults */ }
  return out;
}

// ─── Next earnings ───────────────────────────────────────────────────────────
export async function fetchNextEarnings(
  symbol: string
): Promise<{ date: string; time: "bmo" | "amc" | "unknown"; days: number } | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents`;
    const json = await yfFetch(url);
    const ce = json?.quoteSummary?.result?.[0]?.calendarEvents ?? {};
    const dates: any[] = ce.earnings?.earningsDate ?? [];
    if (!dates.length) return null;
    const now = new Date();
    const cutoff = new Date(Date.now() + 45 * DAY);
    let next: Date | null = null;
    for (const d of dates) {
      const dt = new Date(typeof d === "object" && "raw" in d ? d.raw * 1000 : d);
      if (dt > now && dt <= cutoff) { if (!next || dt < next) next = dt; }
    }
    if (!next) return null;
    const days = Math.round((next.getTime() - now.getTime()) / DAY);
    const etHour = etHourOf(next);
    const time: "bmo" | "amc" | "unknown" =
      etHour >= 5 && etHour < 9 ? "bmo" : etHour >= 16 ? "amc" : "unknown";
    return { date: next.toISOString().slice(0, 10), time, days };
  } catch { return null; }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function numOrNull(v: any): number | null {
  if (v == null) return null;
  const raw = typeof v === "object" && "raw" in v ? v.raw : v;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function etHourOf(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(d)
  );
}
function etMinuteOf(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", minute: "2-digit" }).format(d)
  );
}
