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

  // Debug: raw meta fields from Yahoo
  try {
    const { default: _unused } = await import("@/lib/yfinance") as any;
    const UA2 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const cookieRes = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA2 }, redirect: "follow" });
    const cookie = (cookieRes.headers.get("set-cookie") ?? "").split(";")[0];
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA2, Cookie: cookie } });
    const crumb = (await crumbRes.text()).trim();
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/NVDA?interval=1d&range=5d&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA2, Cookie: cookie } });
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta ?? {};
    results.meta_raw = {
      marketState: meta.marketState,
      regularMarketPrice: meta.regularMarketPrice,
      postMarketPrice: meta.postMarketPrice,
      preMarketPrice: meta.preMarketPrice,
      previousClose: meta.previousClose,
      chartPreviousClose: meta.chartPreviousClose,
    };
  } catch (e: any) {
    results.meta_raw = { error: String(e?.message || e) };
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
      pe_ttm: f.pe_ttm,
      ps_ttm: f.ps_ttm,
      ws_rating: f.ws_rating,
      ws_rating_label: f.ws_rating_label,
      target_price: f.target_price,
      gross_margin: f.gross_margin,
      ebitda_margin: f.ebitda_margin,
      growth_yoy: f.growth_yoy,
      growth_fwd: f.growth_fwd,
      next_earnings: f.next_earnings,
    };
  } catch (e: any) {
    results.fundamentals = { ok: false, error: String(e?.message || e) };
  }

  return NextResponse.json(results);
}
