import { NextResponse } from "next/server";
import { sb } from "@/lib/supabase";
import { refreshDailyOne, refreshPriceOne } from "@/lib/refresh";

export async function GET() {
  const { data: tickers, error: e1 } = await sb.from("tickers").select("*").order("sort_order");
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  const { data: quotes, error: e2 } = await sb.from("quotes").select("*");
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  const qBySym = new Map<string, any>();
  for (const q of quotes ?? []) qBySym.set(q.symbol, q);
  const out = (tickers ?? []).map((t) => ({ ...t, quote: qBySym.get(t.symbol) || null }));
  return NextResponse.json(out);
}

export async function POST(req: Request) {
  const body = await req.json();
  const symbol = String(body.symbol || "").trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  const category_id = body.category_id ?? null;

  // dup check inside same category
  if (category_id != null) {
    const { data: dup } = await sb
      .from("tickers")
      .select("id")
      .eq("symbol", symbol)
      .eq("category_id", category_id)
      .maybeSingle();
    if (dup) return NextResponse.json({ error: "该分类下已存在此标的" }, { status: 400 });
  }

  // append to end of category
  const { data: maxRow } = await sb
    .from("tickers")
    .select("sort_order")
    .eq("category_id", category_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = maxRow ? (maxRow.sort_order ?? 0) + 1 : 0;

  const insert = {
    symbol,
    category_id,
    exchange: body.exchange ?? "SMART",
    currency: body.currency ?? "USD",
    sec_type: body.sec_type ?? "STK",
    display_name: body.display_name ?? "",
    industry: body.industry ?? "",
    moat: body.moat ?? "",
    risk: body.risk ?? "",
    notes: body.notes ?? "",
    tags: body.tags ?? "",
    position_status: body.position_status ?? "watch",
    sort_order,
  };
  const { data, error } = await sb.from("tickers").insert(insert).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Kick off async refresh — don't block the create response.
  refreshDailyOne(symbol).catch(() => {});
  refreshPriceOne(symbol).catch(() => {});

  return NextResponse.json(data);
}
