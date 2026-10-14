// Returns aggregated hiring summaries per ticker.
import { NextResponse } from "next/server";
import { sb } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { data, error } = await sb
    .from("job_summaries")
    .select("*")
    .order("total", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // weekly AI insights (table may not exist yet -> ignore errors)
  const { data: ins } = await sb.from("job_insights").select("symbol, insight, model, generated_at");
  const insights: Record<string, unknown> = {};
  for (const r of ins ?? []) if ((r as any).insight) insights[(r as any).symbol] = r;
  return NextResponse.json({ summaries: data ?? [], insights });
}
