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

/** Hot loop: latest price + 15m intraday. Run every ~5 min. */
export async function refreshPricesAll(): Promise<{ ok: number; fail: number }> {
  const syms = await listSymbols();
  let ok = 0, fail = 0;
  // Process serially with small spacing to respect Yahoo throttling.
  for (const symbol of syms) {
    try {
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
      ok++;
    } catch (e) {
      console.warn("refreshPrices", symbol, e);
      fail++;
    }
    // tiny delay to avoid bursting yahoo in a tight loop
    await sleep(150);
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
export async function refreshDailyAll(): Promise<{ ok: number; fail: number }> {
  const syms = await listSymbols();
  let ok = 0, fail = 0;
  for (const symbol of syms) {
    try {
      await refreshDailyOne(symbol);
      ok++;
    } catch (e) {
      console.warn("refreshDaily", symbol, e);
      fail++;
    }
    await sleep(250);
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
  const patch: any = {
    symbol,
    source: "yfinance",
    updated_at: new Date().toISOString(),
    ...snap,
    ...fund,
    next_earnings: earn,
  };
  // also recompute change if we got prev_close fresh from snap
  if (snap.session_close != null && snap.prev_close != null && snap.prev_close !== 0) {
    patch.last = snap.session_close;
    patch.change = snap.session_close - snap.prev_close;
    patch.change_pct = (patch.change / snap.prev_close) * 100;
  }
  await sb.from("quotes").upsert(patch, { onConflict: "symbol" });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
