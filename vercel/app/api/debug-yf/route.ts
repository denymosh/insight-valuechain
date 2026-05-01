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

  try {
    const f = await fetchFundamentals("NVDA");
    results.fundamentals = {
      ok: f.market_cap != null,
      market_cap: f.market_cap,
      pe_fwd: f.pe_fwd,
      ws_rating: f.ws_rating_label,
      gross_margin: f.gross_margin,
      growth_yoy: f.growth_yoy,
      next_earnings: f.next_earnings,
    };
  } catch (e: any) {
    results.fundamentals = { ok: false, error: String(e?.message || e) };
  }

  // Debug: raw calendarEvents for NVDA
  try {
    const UA2 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const cookieRes = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA2 }, redirect: "follow" });
    const cookie = (cookieRes.headers.get("set-cookie") ?? "").split(";")[0];
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA2, Cookie: cookie } });
    const crumb = (await crumbRes.text()).trim();
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/NVDA?modules=calendarEvents&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA2, Cookie: cookie } });
    const text = await res.text();
    results.calendar_raw = { status: res.status, body: text.slice(0, 600) };
  } catch (e: any) {
    results.calendar_raw = { error: String(e?.message || e) };
  }

  return NextResponse.json(results);
}
