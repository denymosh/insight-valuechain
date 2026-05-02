// Direct test of Greenhouse adapter — show exactly what fetchGreenhouseSummary returns + try Supabase write.
import { NextResponse } from "next/server";
import { sb } from "@/lib/supabase";
import { fetchGreenhouseSummary } from "@/lib/jobs/greenhouse";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const result: any = { codeVersion: "v3-metadata" };

  try {
    const s = await fetchGreenhouseSummary("RKLB", { boardToken: "rocketlab" });
    result.fetched = s ? {
      total: s.total,
      posted_7d: s.posted_7d,
      posted_30d: s.posted_30d,
      by_dept_keys: Object.keys(s.by_dept).slice(0, 8),
      by_dept_sample: s.by_dept,
      by_country: s.by_country,
      by_title: s.by_title,
    } : null;
  } catch (e: any) {
    result.fetched_error = String(e?.message || e);
  }

  if (result.fetched) {
    try {
      const upsertRes = await sb.from("job_summaries").upsert(
        {
          symbol: "RKLB",
          total: result.fetched.total,
          posted_7d: result.fetched.posted_7d,
          posted_30d: result.fetched.posted_30d,
          by_dept: result.fetched.by_dept_sample,
          by_country: result.fetched.by_country,
          by_title: result.fetched.by_title,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "symbol" }
      );
      result.upsert = { ok: !upsertRes.error, error: upsertRes.error?.message ?? null };
    } catch (e: any) {
      result.upsert = { ok: false, error: String(e?.message || e) };
    }
  }

  return NextResponse.json(result);
}
