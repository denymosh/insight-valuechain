import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const results: any = {};

  // Test 1: quote
  try {
    const q = await yahooFinance.quote("NVDA");
    results.quote = { ok: true, price: (q as any).regularMarketPrice };
  } catch (e: any) {
    results.quote = { ok: false, error: String(e?.message || e) };
  }

  // Test 2: chart daily
  try {
    const period1 = new Date(Date.now() - 30 * 86400 * 1000);
    const r = await yahooFinance.chart("NVDA", { period1, interval: "1d" });
    const quotes = (r as any)?.quotes ?? (r as any)?.indicators?.quote?.[0] ?? r;
    results.chart = {
      ok: true,
      keys: Object.keys(r as any),
      quotesLen: Array.isArray(quotes) ? quotes.length : "not array",
      firstQuote: Array.isArray(quotes) ? quotes[0] : quotes,
    };
  } catch (e: any) {
    results.chart = { ok: false, error: String(e?.message || e) };
  }

  // Test 3: quoteSummary
  try {
    const s = await yahooFinance.quoteSummary("NVDA", { modules: ["price"] });
    results.quoteSummary = { ok: true, marketCap: (s as any)?.price?.marketCap };
  } catch (e: any) {
    results.quoteSummary = { ok: false, error: String(e?.message || e) };
  }

  return NextResponse.json(results);
}
