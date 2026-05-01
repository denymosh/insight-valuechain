// Single endpoint the frontend polls every 30s.
// Returns sectors + categories + tickers (with quotes joined) in one shot.
import { NextResponse } from "next/server";
import { sb } from "@/lib/supabase";

export const dynamic = "force-dynamic";   // don't cache — always read fresh
export const revalidate = 0;

export async function GET() {
  const [sectorsR, categoriesR, tickersR, quotesR] = await Promise.all([
    sb.from("sectors").select("*").order("sort_order"),
    sb.from("categories").select("*").order("sort_order"),
    sb.from("tickers").select("*").order("sort_order"),
    sb.from("quotes").select("*"),
  ]);
  if (sectorsR.error || categoriesR.error || tickersR.error || quotesR.error) {
    return NextResponse.json(
      { error: sectorsR.error?.message || categoriesR.error?.message || tickersR.error?.message || quotesR.error?.message },
      { status: 500 }
    );
  }
  const qBySym = new Map<string, any>();
  for (const q of quotesR.data ?? []) qBySym.set(q.symbol, q);
  const tickers = (tickersR.data ?? []).map((t) => ({ ...t, quote: qBySym.get(t.symbol) || null }));
  return NextResponse.json({
    sectors: sectorsR.data ?? [],
    categories: categoriesR.data ?? [],
    tickers,
  });
}
