// Daily cron (runs after refresh-jobs): regenerate AI insight for symbols whose insight is > 6 days old.
// Auth: Bearer CRON_SECRET (or x-cron-key, or ?key=). ?force=1 regenerates everything.

import { NextResponse } from "next/server";
import { sb } from "@/lib/supabase";
import { ATS_MAP } from "@/lib/jobs/ats_map";
import { generateJobsInsight, JOBS_AI_MODEL } from "@/lib/jobs/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_MS = 6 * 86400000;
const CONCURRENCY = 8;

export async function GET(req: Request) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get("authorization") || "";
    const url = new URL(req.url);
    const ok =
      auth === `Bearer ${process.env.CRON_SECRET}` ||
      req.headers.get("x-cron-key") === process.env.CRON_SECRET ||
      url.searchParams.get("key") === process.env.CRON_SECRET;
    if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }
  const force = new URL(req.url).searchParams.get("force") === "1";

  const { data: existing } = await sb.from("job_insights").select("symbol, insight, generated_at");
  const last = new Map((existing ?? []).map((r: any) => [r.symbol, r.insight && r.generated_at ? new Date(r.generated_at).getTime() : 0]));
  const todo = Object.keys(ATS_MAP).filter((s) => force || Date.now() - (last.get(s) ?? 0) > STALE_MS);

  const out: any[] = [];
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const chunk = todo.slice(i, i + CONCURRENCY);
    const rs = await Promise.allSettled(chunk.map(async (sym) => {
      const text = await generateJobsInsight(sym);
      if (!text) return { symbol: sym, ok: false, error: "no data" };
      const { error } = await sb.from("job_insights").upsert(
        { symbol: sym, insight: text, model: JOBS_AI_MODEL, generated_at: new Date().toISOString() },
        { onConflict: "symbol" }
      );
      if (error) throw new Error(error.message);
      return { symbol: sym, ok: true };
    }));
    rs.forEach((r, j) =>
      out.push(r.status === "fulfilled" ? r.value : { symbol: chunk[j], ok: false, error: String(r.reason?.message || r.reason) })
    );
  }
  return NextResponse.json({ ok: true, processed: out.length, results: out });
}

export const POST = GET;
