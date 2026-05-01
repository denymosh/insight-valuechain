import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function GET() {
  const symbol = "NVDA";
  try {
    const url = `https://www.barchart.com/proxies/core-api/v1/quotes/get?symbols=${symbol}&fields=impliedVolatility,ivPercentile,ivRank,historicalVolatility&raw=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Referer": `https://www.barchart.com/stocks/quotes/${symbol}/options`,
        "Accept": "application/json",
      },
    });
    const status = res.status;
    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({ ok: false, status, body: body.slice(0, 500) });
    }
    const json = await res.json();
    const d = json?.data?.[0]?.raw ?? json?.data?.[0] ?? {};
    return NextResponse.json({
      ok: true,
      status,
      impliedVolatility: d.impliedVolatility,
      ivPercentile: d.ivPercentile,
      ivRank: d.ivRank,
      historicalVolatility: d.historicalVolatility,
      raw: json?.data?.[0],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) });
  }
}
