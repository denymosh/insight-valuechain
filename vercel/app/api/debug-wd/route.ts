// Dump raw Workday facets so we can see what categories are exposed.
import { NextResponse } from "next/server";
import { ATS_MAP } from "@/lib/jobs/ats_map";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function GET(req: Request) {
  const symbol = (new URL(req.url).searchParams.get("symbol") || "MU").toUpperCase();
  const entry = ATS_MAP[symbol];
  if (!entry || entry.provider !== "workday") {
    return NextResponse.json({ error: `${symbol} is not a Workday tenant` }, { status: 400 });
  }
  const cfg = entry.config;
  const url = `https://${cfg.tenant}.${cfg.pod}.myworkdayjobs.com/wday/cxs/${cfg.tenant}/${cfg.site}/jobs`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json",
      },
      body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: "" }),
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status, body: (await res.text()).slice(0, 500) });
    }
    const json = await res.json();
    const facets: any[] = json.facets ?? [];
    const summary = facets.map((f) => ({
      facetParameter: f.facetParameter,
      descriptor: f.descriptor,
      valueCount: (f.values ?? []).length,
      sample: (f.values ?? []).slice(0, 5).map((v: any) => ({
        descriptor: v.descriptor, count: v.count, id: v.id,
      })),
    }));
    return NextResponse.json({ ok: true, symbol, total: json.total, facetCount: facets.length, facets: summary });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) });
  }
}
