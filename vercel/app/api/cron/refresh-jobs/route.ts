// Daily cron: pull aggregated hiring summary per ticker and upsert into job_summaries.
// Auth: Bearer CRON_SECRET (or x-cron-key, or ?key=).

import { NextResponse } from "next/server";
import { sb } from "@/lib/supabase";
import { ATS_MAP } from "@/lib/jobs/ats_map";
import { fetchOracleHcmSummary } from "@/lib/jobs/oracle_hcm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function fetchSummaryFor(symbol: string) {
  const entry = ATS_MAP[symbol.toUpperCase()];
  if (!entry) return null;
  if (entry.provider === "oracle_hcm") {
    return fetchOracleHcmSummary(symbol.toUpperCase(), entry.config);
  }
  return null;
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

  for (const sym of symbols) {
    try {
      const s = await fetchSummaryFor(sym);
      if (s) {
        const { error } = await sb.from("job_summaries").upsert(
          {
            symbol: s.symbol,
            total: s.total,
            posted_7d: s.posted_7d,
            posted_30d: s.posted_30d,
            by_dept: s.by_dept,
            by_country: s.by_country,
            by_title: s.by_title,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "symbol" }
        );
        if (error) throw new Error(error.message);
        summary.push({ symbol: sym, total: s.total, ok: true });
      } else {
        summary.push({ symbol: sym, total: 0, ok: false, error: "no data" });
      }
    } catch (e: any) {
      summary.push({ symbol: sym, ok: false, error: String(e?.message || e) });
    }
  }

  return NextResponse.json({ ok: true, by_symbol: summary });
}

export const POST = GET;
