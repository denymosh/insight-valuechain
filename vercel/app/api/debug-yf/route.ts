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
    results.chart = { ok: bars.length > 0, bars: bars.length };
  } catch (e: any) {
    results.chart = { ok: false, error: String(e?.message || e) };
  }

  // Test v7 quote API directly
  try {
    const cookieRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    const cookie = (cookieRes.headers.get("set-cookie") ?? "").split(";")[0];
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": "Mozilla/5.0", Cookie: cookie },
    });
    const crumb = (await crumbRes.text()).trim();
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=NVDA&fields=marketCap,trailingPE,forwardPE,revenueGrowth,recommendationMean,targetMeanPrice&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Cookie: cookie } });
    const text = await res.text();
    results.v7_raw = { status: res.status, body: text.slice(0, 600) };
  } catch (e: any) {
    results.v7_raw = { error: String(e?.message || e) };
  }

  try {
    const f = await fetchFundamentals("NVDA");
    results.fundamentals = { ok: f.market_cap != null, market_cap: f.market_cap, pe_fwd: f.pe_fwd, ws_rating: f.ws_rating };
  } catch (e: any) {
    results.fundamentals = { ok: false, error: String(e?.message || e) };
  }

  return NextResponse.json(results);
}
