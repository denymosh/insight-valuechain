// Daily cron: pull current open jobs from each supported ATS and upsert into job_postings.
// Auth: Bearer CRON_SECRET (or x-cron-key, or ?key=).

import { NextResponse } from "next/server";
import { sb } from "@/lib/supabase";
import { ATS_MAP } from "@/lib/jobs/ats_map";
import { fetchOracleHcmJobs, type JobPosting } from "@/lib/jobs/oracle_hcm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function fetchJobsFor(symbol: string): Promise<JobPosting[]> {
  const entry = ATS_MAP[symbol.toUpperCase()];
  if (!entry) return [];
  if (entry.provider === "oracle_hcm") {
    return fetchOracleHcmJobs(symbol.toUpperCase(), entry.config);
  }
  return [];
}

export async function GET(req: Request) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get("authorization") || "";
    const xKey = req.headers.get("x-cron-key");
    const url = new URL(req.url);
    const qKey = url.searchParams.get("key");
    const ok =
      auth === `Bearer ${process.env.CRON_SECRET}` ||
      xKey === process.env.CRON_SECRET ||
      qKey === process.env.CRON_SECRET;
    if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const symbols = Object.keys(ATS_MAP);
  const summary: any[] = [];
  let totalUpserted = 0;

  for (const sym of symbols) {
    try {
      const jobs = await fetchJobsFor(sym);
      if (jobs.length > 0) {
        // Supabase free tier prefers smaller batches
        const BATCH = 500;
        for (let i = 0; i < jobs.length; i += BATCH) {
          const slice = jobs.slice(i, i + BATCH);
          const { error } = await sb
            .from("job_postings")
            .upsert(slice, { onConflict: "symbol,req_id" });
          if (error) throw new Error(error.message);
        }
        totalUpserted += jobs.length;
      }
      summary.push({ symbol: sym, count: jobs.length, ok: true });
    } catch (e: any) {
      summary.push({ symbol: sym, count: 0, ok: false, error: String(e?.message || e) });
    }
  }

  return NextResponse.json({ ok: true, total: totalUpserted, by_symbol: summary });
}

export const POST = GET;
