// Fetch ATM IV for all tickers, store in iv_history, compute 1-year percentile.
// Much faster than refresh-daily — can be called manually to seed IV data.
import { NextResponse } from "next/server";
import { refreshIVAll } from "@/lib/refresh";

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
  const result = await refreshIVAll();
  return NextResponse.json({ ok: true, processed: result.ok, failed: result.fail });
}

export const POST = GET;
