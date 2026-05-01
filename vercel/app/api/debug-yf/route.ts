import { NextResponse } from "next/server";
import { fetchDaily, fetchLiveQuote, fetchFundamentals } from "@/lib/yfinance";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const results: any = {};

  try {
    const q = await fetchLiveQuote("NVDA");
    results.quote = { ok: q.last != null, last: q.last, prev_close: q.prev_close };
  } catch (e: any) {
    results.quote = { ok: false, error: String(e?.message || e) };
  }

  try {
    const bars = await fetchDaily("NVDA");
    results.chart = { ok: bars.length > 0, bars: bars.length, last: bars.at(-1) };
  } catch (e: any) {
    results.chart = { ok: false, error: String(e?.message || e) };
  }

  try {
    const f = await fetchFundamentals("NVDA");
    results.fundamentals = { ok: f.market_cap != null, market_cap: f.market_cap, pe_fwd: f.pe_fwd };
  } catch (e: any) {
    results.fundamentals = { ok: false, error: String(e?.message || e) };
  }

  return NextResponse.json(results);
}
