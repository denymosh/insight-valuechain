// Refresh tasks called from cron endpoints.

import { sb } from "./supabase";
import { computeSnapshot } from "./indicators";
import {
  fetchDaily,
  fetchWeekly,
  fetchMonthly,
  fetchIntraday15m,
  fetchLiveQuote,
  fetchFundamentals,
  fetchIV,
} from "./yfinance";

async function listSymbols(): Promise<string[]> {
  const { data, error } = await sb.from("tickers").select("symbol");
  if (error) throw error;
  const set = new Set<string>();
  for (const r of data ?? []) set.add(String(r.symbol).toUpperCase());
  return Array.from(set);
}

/** Hot loop: latest price + 15m intraday. Run every ~5 min.
 *  Processes symbols in batches of 5 in parallel → fits inside 30s cron timeout. */
export async function refreshPricesAll(): Promise<{ ok: number; fail: number }> {
  const syms = await listSymbols();
  let ok = 0, fail = 0;
  const BATCH = 5;
  for (let i = 0; i < syms.length; i += BATCH) {
    const batch = syms.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (symbol) => {
        const [live, intraday] = await Promise.all([
          fetchLiveQuote(symbol),
          fetchIntraday15m(symbol),
        ]);
        const patch: any = { symbol, source: "yfinance", updated_at: new Date().toISOString() };
        // Use last intraday bar as price (covers pre/post-market); fall back to regularMarketPrice
        const lastBar = intraday.length > 0 ? intraday[intraday.length - 1] : null;
        const last = lastBar?.c ?? live.last;
        if (last != null) patch.last = last;
        if (live.prev_close != null) patch.prev_close = live.prev_close;
        if (last != null && live.prev_close != null && live.prev_close !== 0) {
          patch.change = last - live.prev_close;
          patch.change_pct = (patch.change / live.prev_close) * 100;
        }
        if (intraday.length) patch.intraday_15m = intraday;
        await sb.from("quotes").upsert(patch, { onConflict: "symbol" });
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled") ok++;
      else { fail++; console.warn("refreshPrices batch error", r.reason); }
    }
    if (i + BATCH < syms.length) await sleep(300); // short pause between batches
  }
  return { ok, fail };
}

/** Single-symbol price refresh (used by manual ↻ button). */
export async function refreshPriceOne(symbol: string): Promise<void> {
  symbol = symbol.toUpperCase();
  const [live, intraday] = await Promise.all([
    fetchLiveQuote(symbol),
    fetchIntraday15m(symbol),
  ]);
  const patch: any = { symbol, source: "yfinance", updated_at: new Date().toISOString() };
  const lastBar = intraday.length > 0 ? intraday[intraday.length - 1] : null;
  const last = lastBar?.c ?? live.last;
  if (last != null) patch.last = last;
  if (live.prev_close != null) patch.prev_close = live.prev_close;
  if (last != null && live.prev_close != null && live.prev_close !== 0) {
    patch.change = last - live.prev_close;
    patch.change_pct = (patch.change / live.prev_close) * 100;
  }
  if (intraday.length) patch.intraday_15m = intraday;
  await sb.from("quotes").upsert(patch, { onConflict: "symbol" });
}

/** Daily / slow loop: full bars → indicators, fundamentals, earnings. Run once/day. */
/** Daily full refresh: bars + indicators + fundamentals + earnings.
 *  Runs in batches of 3 in parallel to fit inside 60s cron timeout. */
export async function refreshDailyAll(): Promise<{ ok: number; fail: number }> {
  const syms = await listSymbols();
  let ok = 0, fail = 0;
  const BATCH = 3;
  for (let i = 0; i < syms.length; i += BATCH) {
    const batch = syms.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(refreshDailyOne));
    for (const r of results) {
      if (r.status === "fulfilled") ok++;
      else { fail++; console.warn("refreshDaily batch error", r.reason); }
    }
    if (i + BATCH < syms.length) await sleep(500);
  }
  return { ok, fail };
}

export async function refreshDailyOne(symbol: string): Promise<void> {
  symbol = symbol.toUpperCase();
  const [daily, weekly, monthly, fund, rawIV] = await Promise.all([
    fetchDaily(symbol),
    fetchWeekly(symbol),
    fetchMonthly(symbol),
    fetchFundamentals(symbol),  // includes next_earnings via calendarEvents
    fetchIV(symbol),
  ]);
  const snap = computeSnapshot(daily, weekly, monthly);
  // Remove session_close — not a DB column, causes silent upsert failure in PostgREST
  const { session_close, ...snapFields } = snap as any;
  const { next_earnings, ...fundFields } = fund;
  const patch: any = {
    symbol,
    source: "yfinance",
    updated_at: new Date().toISOString(),
    ...snapFields,
    ...fundFields,
    next_earnings,
  };
  // Map session_close -> last and compute change
  if (session_close != null && snap.prev_close != null && snap.prev_close !== 0) {
    patch.last = session_close;
    patch.change = session_close - snap.prev_close;
    patch.change_pct = (patch.change / snap.prev_close) * 100;
  }

  // ── IV: store today's reading and compute 1-year percentile ──
  if (rawIV != null && rawIV > 0) {
    const ivPct = rawIV * 100; // convert fraction → percentage, e.g. 0.45 → 45
    const today = new Date().toISOString().slice(0, 10);
    // Upsert today's IV into history table
    await sb.from("iv_history").upsert({ symbol, date: today, iv: rawIV }, { onConflict: "symbol,date" });
    // Fetch last 252 trading days of history for this symbol
    const { data: hist } = await sb.from("iv_history")
      .select("iv")
      .eq("symbol", symbol)
      .order("date", { ascending: false })
      .limit(252);
    patch.iv = ivPct;
    if (hist && hist.length >= 5) {
      const sorted = hist.map((r: any) => r.iv as number).sort((a, b) => a - b);
      const rank = sorted.filter((v) => v <= rawIV).length;
      patch.iv_pct = Math.round((rank / sorted.length) * 100);
    }
  }

  const { error } = await sb.from("quotes").upsert(patch, { onConflict: "symbol" });
  if (error) throw new Error(error.message);
}

/** IV-only refresh: fetch ATM IV for all symbols, store in iv_history, compute percentile.
 *  Much faster than refreshDailyAll — only one API call per symbol.
 *  Runs in batches of 8 in parallel to fit inside 60s timeout. */
export async function refreshIVAll(): Promise<{ ok: number; fail: number }> {
  const syms = await listSymbols();
  let ok = 0, fail = 0;
  const BATCH = 8;
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < syms.length; i += BATCH) {
    const batch = syms.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (symbol) => {
        const rawIV = await fetchIV(symbol);
        if (rawIV == null || rawIV <= 0) return;
        const ivPct = rawIV * 100;
        await sb.from("iv_history").upsert({ symbol, date: today, iv: rawIV }, { onConflict: "symbol,date" });
        const { data: hist } = await sb.from("iv_history")
          .select("iv")
          .eq("symbol", symbol)
          .order("date", { ascending: false })
          .limit(252);
        const patch: any = { symbol, iv: ivPct };
        if (hist && hist.length >= 1) {
          const sorted = hist.map((r: any) => r.iv as number).sort((a, b) => a - b);
          const rank = sorted.filter((v) => v <= rawIV).length;
          patch.iv_pct = Math.round((rank / sorted.length) * 100);
        }
        await sb.from("quotes").upsert(patch, { onConflict: "symbol" });
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled") ok++;
      else { fail++; console.warn("refreshIV batch error", r.reason); }
    }
    if (i + BATCH < syms.length) await sleep(200);
  }
  return { ok, fail };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
