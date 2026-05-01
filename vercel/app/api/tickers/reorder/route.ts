import { NextResponse } from "next/server";
import { sb } from "@/lib/supabase";

export async function POST(req: Request) {
  const body = await req.json();
  const ids: number[] = body.ids || [];
  for (let i = 0; i < ids.length; i++) {
    await sb.from("tickers").update({ sort_order: i }).eq("id", ids[i]);
  }
  return NextResponse.json({ ok: true });
}
