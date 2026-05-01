// Wrapper around the yahoo-finance2 npm package, exposing the same shapes
// our indicators / cron tasks expect.

import yahooFinance from "yahoo-finance2";
import type { Bar } from "./indicators";

// quiet the historical() deprecation banner — we still use it intentionally
yahooFinance.suppressNotices(["yahooSurvey", "ripHistorical"]);

export type IntradayBar = { t: number; c: number; s: "pre" | "reg" | "post" };

const SECOND = 1000;
const DAY = 86400 * SECOND;
const YEAR = 365 * DAY;

function toBars(rows: any[]): Bar[] {
  return (rows || [])
    .filter((r) => r && r.close != null && !Number.isNaN(r.close))
    .map((r) => ({
      date: new Date(r.date),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: Number(r.volume ?? 0),
    }));
}

/** ~2 years of daily bars. */
export async function fetchDaily(symbol: string): Promise<Bar[]> {
  const period1 = new Date(Date.now() - 2 * YEAR);
  try {
    const rows = await yahooFinance.chart(symbol, {
      period1,
      interval: "1d",
    });
    return toBars(rows.quotes);
  } catch {
    return [];
  }
}

/** ~5 years of weekly bars. */
export async function fetchWeekly(symbol: string): Promise<Bar[]> {
  const period1 = new Date(Date.now() - 5 * YEAR);
  try {
    const rows = await yahooFinance.chart(symbol, {
      period1,
      interval: "1wk",
    });
    return toBars(rows.quotes);
  } catch {
    return [];
  }
}

/** ~15 years of monthly bars. */
export async function fetchMonthly(symbol: string): Promise<Bar[]> {
  const period1 = new Date(Date.now() - 15 * YEAR);
  try {
    const rows = await yahooFinance.chart(symbol, {
      period1,
      interval: "1mo",
    });
    return toBars(rows.quotes);
  } catch {
    return [];
  }
}

/** Today's 15-minute bars across pre / regular / after-hours. */
export async function fetchIntraday15m(symbol: string): Promise<IntradayBar[]> {
  try {
    const period1 = new Date(Date.now() - 1 * DAY);
    const rows = await yahooFinance.chart(symbol, {
      period1,
      interval: "15m",
      includePrePost: true,
    });
    const bars = rows?.quotes ?? [];
    const out: IntradayBar[] = [];
    for (const r of bars) {
      const c = Number(r.close);
      if (!Number.isFinite(c)) continue;
      const d = new Date(r.date);
      // Convert UTC to ET to classify session
      const etHour = etHourOf(d);
      const etMin = etMinuteOf(d);
      const totalMin = etHour * 60 + etMin;
      let s: "pre" | "reg" | "post" | null = null;
      if (totalMin >= 4 * 60 && totalMin < 9 * 60 + 30) s = "pre";
      else if (totalMin >= 9 * 60 + 30 && totalMin < 16 * 60) s = "reg";
      else if (totalMin >= 16 * 60 && totalMin < 20 * 60) s = "post";
      if (!s) continue;
      out.push({ t: d.getTime(), c, s });
    }
    return out;
  } catch {
    return [];
  }
}

/** Latest live-ish quote (delayed ~15min on Yahoo's free feed). */
export async function fetchLiveQuote(
  symbol: string
): Promise<{ last: number | null; prev_close: number | null }> {
  try {
    const q = await yahooFinance.quote(symbol);
    return {
      last: numOrNull(q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice),
      prev_close: numOrNull(q.regularMarketPreviousClose),
    };
  } catch {
    return { last: null, prev_close: null };
  }
}

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
  1: "Strong Buy",
  2: "Buy",
  3: "Hold",
  4: "Sell",
  5: "Strong Sell",
};

export async function fetchFundamentals(symbol: string): Promise<Fundamentals> {
  const out: Fundamentals = {
    market_cap: null,
    pe_ttm: null,
    pe_fwd: null,
    ps_ttm: null,
    growth_yoy: null,
    growth_fwd: null,
    gross_margin: null,
    ebitda_margin: null,
    ws_rating: null,
    ws_rating_label: null,
    target_price: null,
  };
  try {
    const sum = await yahooFinance.quoteSummary(symbol, {
      modules: [
        "summaryDetail",
        "defaultKeyStatistics",
        "financialData",
        "price",
      ],
    });
    const sd = (sum as any).summaryDetail || {};
    const ks = (sum as any).defaultKeyStatistics || {};
    const fd = (sum as any).financialData || {};
    const pr = (sum as any).price || {};
    out.market_cap = numOrNull(pr.marketCap ?? sd.marketCap);
    out.pe_ttm = numOrNull(sd.trailingPE);
    out.pe_fwd = numOrNull(sd.forwardPE ?? ks.forwardPE);
    out.ps_ttm = numOrNull(sd.priceToSalesTrailing12Months);
    const rg = numOrNull(fd.revenueGrowth);
    if (rg !== null) out.growth_yoy = rg * 100;
    const trlEps = numOrNull(ks.trailingEps);
    const fwdEps = numOrNull(ks.forwardEps);
    if (trlEps != null && fwdEps != null && trlEps !== 0) {
      out.growth_fwd = ((fwdEps - trlEps) / Math.abs(trlEps)) * 100;
    }
    const gm = numOrNull(fd.grossMargins);
    if (gm !== null) out.gross_margin = gm * 100;
    const em = numOrNull(fd.ebitdaMargins);
    if (em !== null) out.ebitda_margin = em * 100;
    const rm = numOrNull(fd.recommendationMean);
    if (rm !== null) {
      out.ws_rating = rm;
      out.ws_rating_label = WS_LABELS[Math.round(rm)] ?? null;
    }
    out.target_price = numOrNull(fd.targetMeanPrice);
  } catch {
    /* leave defaults */
  }
  return out;
}

/** Next earnings within 45 days, else null. */
export async function fetchNextEarnings(
  symbol: string
): Promise<{ date: string; time: "bmo" | "amc" | "unknown"; days: number } | null> {
  try {
    const sum = await yahooFinance.quoteSummary(symbol, {
      modules: ["calendarEvents", "earnings"],
    });
    const ce = (sum as any).calendarEvents || {};
    const dates: any[] = ce.earnings?.earningsDate ?? [];
    if (!dates.length) return null;
    const now = new Date();
    const cutoff = new Date(Date.now() + 45 * DAY);
    let next: Date | null = null;
    for (const d of dates) {
      const dt = d instanceof Date ? d : new Date(d);
      if (dt > now && dt <= cutoff) {
        if (!next || dt < next) next = dt;
      }
    }
    if (!next) return null;
    const days = Math.round((next.getTime() - now.getTime()) / DAY);
    const etHour = etHourOf(next);
    let time: "bmo" | "amc" | "unknown" = "unknown";
    if (etHour >= 5 && etHour < 9) time = "bmo";
    else if (etHour >= 16) time = "amc";
    return {
      date: next.toISOString().slice(0, 10),
      time,
      days,
    };
  } catch {
    return null;
  }
}

function numOrNull(v: any): number | null {
  if (v == null) return null;
  // Handle Yahoo's {raw, fmt} wrapping
  const raw = typeof v === "object" && "raw" in v ? v.raw : v;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ---------- ET helpers (no external timezone library) ----------
// US/Eastern timezone offset is UTC-5 or UTC-4 depending on DST.
// Using Intl.DateTimeFormat for accuracy.
function etHourOf(d: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  });
  return Number(fmt.format(d));
}
function etMinuteOf(d: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    minute: "2-digit",
  });
  return Number(fmt.format(d));
}
