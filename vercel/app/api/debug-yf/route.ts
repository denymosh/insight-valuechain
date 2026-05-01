import { NextResponse } from "next/server";
import { fetchDaily, fetchLiveQuote, fetchFundamentals, getFundDebug } from "@/lib/yfinance";

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

  // Test fetchFundamentals by calling yfFetch directly with same URL
  try {
    const { default: yf } = await import("@/lib/yfinance") as any;
    // Use internal yfFetch via a workaround — call fundamentals and check raw json
    const cookieRes2 = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": "Mozilla/5.0" } });
    const cookie2 = (cookieRes2.headers.get("set-cookie") ?? "").split(";")[0];
    const crumbRes2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": "Mozilla/5.0", Cookie: cookie2 }
    });
    const crumb2 = (await crumbRes2.text()).trim();
    const fundUrl = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=NVDA&fields=marketCap,trailingPE,forwardPE,revenueGrowth,recommendationMean,targetMeanPrice,trailingEps,forwardEps&crumb=${encodeURIComponent(crumb2)}`;
    const fundRes = await fetch(fundUrl, { headers: { "User-Agent": "Mozilla/5.0", Cookie: cookie2 } });
    const fundJson = await fundRes.json();
    const q2 = fundJson?.quoteResponse?.result?.[0] ?? {};
    results.fundamentals_parsed = {
      marketCap: q2.marketCap, forwardPE: q2.forwardPE, trailingPE: q2.trailingPE,
      recommendationMean: q2.recommendationMean, targetMeanPrice: q2.targetMeanPrice,
      revenueGrowth: q2.revenueGrowth, keys: Object.keys(q2).slice(0, 20)
    };
  } catch (e: any) {
    results.fundamentals_parsed = { error: String(e?.message || e) };
  }

  // Call fetchFundamentals directly
  try {
    const f = await fetchFundamentals("NVDA");
    results.fetchFundamentals = {
      ok: f.market_cap != null,
      market_cap: f.market_cap,
      pe_fwd: f.pe_fwd,
      pe_ttm: f.pe_ttm,
      ws_rating: f.ws_rating,
      ws_rating_label: f.ws_rating_label,
      target_price: f.target_price,
      gross_margin: f.gross_margin,
      _debug: getFundDebug(),
    };
  } catch (e: any) {
    results.fetchFundamentals = { ok: false, error: String(e?.message || e), _debug: getFundDebug() };
  }

  // Directly replicate fetchFundamentals logic with full error exposure
  try {
    const UA2 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const cookieRes3 = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA2 }, redirect: "follow" });
    const cookie3 = (cookieRes3.headers.get("set-cookie") ?? "").split(";")[0];
    const crumbRes3 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA2, Cookie: cookie3 }
    });
    const crumb3 = (await crumbRes3.text()).trim();
    const url3 = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=NVDA&fields=marketCap,trailingPE,forwardPE&crumb=${encodeURIComponent(crumb3)}`;
    const res3 = await fetch(url3, { headers: { "User-Agent": UA2, Cookie: cookie3 } });
    const body3 = await res3.text();
    let q3: any = {};
    try { q3 = JSON.parse(body3)?.quoteResponse?.result?.[0] ?? {}; } catch {}
    results.fundamentals = {
      ok: q3.marketCap != null,
      http_status: res3.status,
      cookie_len: cookie3.length,
      crumb_len: crumb3.length,
      market_cap: q3.marketCap,
      pe_fwd: q3.forwardPE,
      raw_snippet: body3.slice(0, 200),
    };
  } catch (e: any) {
    results.fundamentals = { ok: false, error: String(e?.message || e) };
  }

  return NextResponse.json(results);
}
