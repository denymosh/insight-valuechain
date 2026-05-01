import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Fetch IV Rank + IV Percentile from Barchart by first getting a session cookie + XSRF token. */
export async function fetchBarchartIV(symbol: string): Promise<{
  iv: number | null;
  iv_rank: number | null;
  iv_pct: number | null;
}> {
  const out = { iv: null as number | null, iv_rank: null as number | null, iv_pct: null as number | null };

  // Step 1: get session cookie + XSRF-TOKEN from the options page
  const pageRes = await fetch(`https://www.barchart.com/stocks/quotes/${encodeURIComponent(symbol)}/options`, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!pageRes.ok) return out;

  // Extract all Set-Cookie headers
  const rawCookies = pageRes.headers.getSetCookie?.() ?? [];
  const cookieStr = rawCookies.map((c) => c.split(";")[0]).join("; ");
  // Extract XSRF-TOKEN value
  const xsrfMatch = rawCookies.find((c) => c.startsWith("XSRF-TOKEN="));
  const xsrfToken = xsrfMatch ? decodeURIComponent(xsrfMatch.split(";")[0].replace("XSRF-TOKEN=", "")) : "";

  // Step 2: call the core-api with cookies + XSRF token
  const apiUrl = `https://www.barchart.com/proxies/core-api/v1/quotes/get?symbols=${encodeURIComponent(symbol)}&fields=impliedVolatility,ivPercentile,ivRank,historicalVolatility&raw=1`;
  const apiRes = await fetch(apiUrl, {
    headers: {
      "User-Agent": UA,
      "Referer": `https://www.barchart.com/stocks/quotes/${encodeURIComponent(symbol)}/options`,
      "Accept": "application/json",
      "Cookie": cookieStr,
      ...(xsrfToken ? { "X-XSRF-TOKEN": xsrfToken } : {}),
    },
  });
  if (!apiRes.ok) return out;

  const json = await apiRes.json();
  const d = json?.data?.[0]?.raw ?? json?.data?.[0] ?? {};
  const toNum = (v: any) => (v != null && isFinite(Number(v)) ? Number(v) : null);
  out.iv      = toNum(d.impliedVolatility);
  out.iv_rank = toNum(d.ivRank);
  out.iv_pct  = toNum(d.ivPercentile);
  return out;
}

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol") || "NVDA";
  try {
    const result = await fetchBarchartIV(symbol);
    return NextResponse.json({ ok: result.iv != null, symbol, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) });
  }
}
