import { NextResponse } from "next/server";
import { fetchBarchartIV } from "@/lib/barchart";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol") || "NVDA";
  try {
    const result = await fetchBarchartIV(symbol);
    return NextResponse.json({ ok: result.iv != null, symbol, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) });
  }
}
