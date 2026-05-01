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
  return NextResponse.json({ summaries: data ?? [] });
}
