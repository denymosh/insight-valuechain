// Returns recent job postings, newest first.
// Query params: ?days=30&limit=200

import { NextResponse } from "next/server";
import { sb } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "30", 10), 1), 365);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "200", 10), 1), 1000);

  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const { data, error } = await sb
    .from("job_postings")
    .select("symbol,req_id,title,location,country,dept,posted_date,url")
    .gte("posted_date", cutoff)
    .order("posted_date", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ jobs: data ?? [], days, count: data?.length ?? 0 });
}
