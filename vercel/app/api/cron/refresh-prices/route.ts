// Triggered every ~5min by an external pinger (cron-job.org or similar).
// Refreshes price + 15m intraday for all tickers.
//
// Auth: pass header "x-cron-key: <CRON_SECRET>" or query ?key=<CRON_SECRET>.
import { NextResponse } from "next/server";
import { refreshPricesAll } from "@/lib/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds — Vercel function timeout

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = req.headers.get("x-cron-key") || url.searchParams.get("key");
  if (process.env.CRON_SECRET && key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await refreshPricesAll();
  return NextResponse.json({ ok: true, processed: result.ok, failed: result.fail });
}

export const POST = GET;
