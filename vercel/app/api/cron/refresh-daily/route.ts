// Triggered once per day by Vercel Cron (configured in vercel.json).
// Refreshes daily-bar indicators + fundamentals + earnings for all tickers.
//
// Vercel Cron auto-injects a `Authorization: Bearer <CRON_SECRET>` header
// when you set CRON_SECRET as a project env var; we accept that or x-cron-key.
import { NextResponse } from "next/server";
import { refreshDailyAll } from "@/lib/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const result = await refreshDailyAll();
  return NextResponse.json({ ok: true, processed: result.ok, failed: result.fail });
}

export const POST = GET;
