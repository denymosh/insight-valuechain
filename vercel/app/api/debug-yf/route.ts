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

  // Call fetchFundamentals (two-stage: v7/quote + quoteSummary/financialData)
  try {
    const f = await fetchFundamentals("NVDA");
    results.fetchFundamentals = {
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
    };
  } catch (e: any) {
    results.fetchFundamentals = { ok: false, error: String(e?.message || e) };
  }

  // Test quoteSummary/financialData directly to debug stage 2
  try {
    const UA2 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const cookieRes = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA2 }, redirect: "follow" });
    const cookie = (cookieRes.headers.get("set-cookie") ?? "").split(";")[0];
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA2, Cookie: cookie },
    });
    const crumb = (await crumbRes.text()).trim();
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/NVDA?modules=financialData&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA2, Cookie: cookie } });
    const text = await res.text();
    const json = JSON.parse(text);
    const fd = json?.quoteSummary?.result?.[0]?.financialData ?? {};
    results.quoteSummary_financialData = {
      http_status: res.status,
      gross_margins: fd.grossMargins,
      ebitda_margins: fd.ebitdaMargins,
      recommendation_mean: fd.recommendationMean,
      target_mean_price: fd.targetMeanPrice,
      revenue_growth: fd.revenueGrowth,
      fd_keys: Object.keys(fd).slice(0, 15),
      raw: text.slice(0, 400),
    };
  } catch (e: any) {
    results.quoteSummary_financialData = { error: String(e?.message || e) };
  }

  return NextResponse.json(results);
}
