// Daily cron: pull aggregated hiring summary per ticker and upsert into job_summaries.
// Auth: Bearer CRON_SECRET (or x-cron-key, or ?key=).

import { NextResponse } from "next/server";
import { sb } from "@/lib/supabase";
import { ATS_MAP } from "@/lib/jobs/ats_map";
import { fetchOracleHcmSummary } from "@/lib/jobs/oracle_hcm";
import { fetchWorkdaySummary, fetchMultiWorkdaySummary } from "@/lib/jobs/workday";
import { fetchGreenhouseSummary } from "@/lib/jobs/greenhouse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function fetchSummaryFor(symbol: string) {
  const entry = ATS_MAP[symbol.toUpperCase()];
  if (!entry) return null;
  switch (entry.provider) {
    case "oracle_hcm":
      return fetchOracleHcmSummary(symbol.toUpperCase(), entry.config);
    case "workday":
      return fetchWorkdaySummary(symbol.toUpperCase(), entry.config);
    case "workday_multi":
      return fetchMultiWorkdaySummary(symbol.toUpperCase(), entry.configs);
    case "greenhouse":
      return fetchGreenhouseSummary(symbol.toUpperCase(), entry.config);
  }
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

  // 并行抓取所有标的
  const results = await Promise.allSettled(symbols.map(async (sym) => {
    const s = await fetchSummaryFor(sym);
    if (!s) return { symbol: sym, total: 0, ok: false, error: "no data" };
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
    return { symbol: sym, total: s.total, ok: true };
  }));

  const summary = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { symbol: symbols[i], ok: false, error: String(r.reason?.message || r.reason) }
  );

  return NextResponse.json({ ok: true, by_symbol: summary });
}

export const POST = GET;
