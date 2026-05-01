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
  fetchNextEarnings,
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
        if (live.last != null) patch.last = live.last;
        if (live.prev_close != null) patch.prev_close = live.prev_close;
        if (live.last != null && live.prev_close != null && live.prev_close !== 0) {
          patch.change = live.last - live.prev_close;
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
  if (live.last != null) patch.last = live.last;
  if (live.prev_close != null) patch.prev_close = live.prev_close;
  if (live.last != null && live.prev_close != null && live.prev_close !== 0) {
    patch.change = live.last - live.prev_close;
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
  const [daily, weekly, monthly, fund, earn] = await Promise.all([
    fetchDaily(symbol),
    fetchWeekly(symbol),
    fetchMonthly(symbol),
    fetchFundamentals(symbol),
    fetchNextEarnings(symbol),
  ]);
  const snap = computeSnapshot(daily, weekly, monthly);
  // Remove session_close — not a DB column, causes silent upsert failure in PostgREST
  const { session_close, ...snapFields } = snap as any;
  const patch: any = {
    symbol,
    source: "yfinance",
    updated_at: new Date().toISOString(),
    ...snapFields,
    ...fund,
    next_earnings: earn,
  };
  // Map session_close -> last and compute change
  if (session_close != null && snap.prev_close != null && snap.prev_close !== 0) {
    patch.last = session_close;
    patch.change = session_close - snap.prev_close;
    patch.change_pct = (patch.change / snap.prev_close) * 100;
  }
  const { error } = await sb.from("quotes").upsert(patch, { onConflict: "symbol" });
  if (error) throw new Error(error.message);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
