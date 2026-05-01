// Manual single-symbol refresh — wired to the ↻ button in the UI.
import { NextResponse } from "next/server";
import { sb } from "@/lib/supabase";
import { refreshDailyOne, refreshPriceOne } from "@/lib/refresh";

export const maxDuration = 30;

export async function POST(_req: Request, { params }: { params: { symbol: string } }) {
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  try {
    await Promise.all([refreshDailyOne(symbol), refreshPriceOne(symbol)]);
    const { data } = await sb.from("quotes").select("*").eq("symbol", symbol).maybeSingle();
    return NextResponse.json({ ok: true, quote: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) });
  }
}
