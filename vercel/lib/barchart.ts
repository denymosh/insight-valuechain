// Fetch IV Rank + IV Percentile from Barchart.
// Simulates browser flow: get session cookie + XSRF token from options page, then call core-api.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type BarchartIV = {
  iv: number | null;       // implied volatility (%)
  iv_rank: number | null;  // IV Rank (52-week, 0-100)
  iv_pct: number | null;   // IV Percentile (0-100)
};

export async function fetchBarchartIV(symbol: string): Promise<BarchartIV> {
  const out: BarchartIV = { iv: null, iv_rank: null, iv_pct: null };
  try {
    // Step 1: get session cookie + XSRF-TOKEN from the options page
    const pageRes = await fetch(
      `https://www.barchart.com/stocks/quotes/${encodeURIComponent(symbol)}/options`,
      {
        headers: {
          "User-Agent": UA,
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
      }
    );
    if (!pageRes.ok) return out;

    // Extract cookies
    const rawCookies: string[] = pageRes.headers.getSetCookie?.() ?? [];
    const cookieStr = rawCookies.map((c) => c.split(";")[0]).join("; ");
    const xsrfRaw = rawCookies.find((c) => c.startsWith("XSRF-TOKEN="));
    const xsrfToken = xsrfRaw
      ? decodeURIComponent(xsrfRaw.split(";")[0].replace("XSRF-TOKEN=", ""))
      : "";

    // Step 2: call core-api with session cookies
    const apiUrl =
      `https://www.barchart.com/proxies/core-api/v1/quotes/get` +
      `?symbols=${encodeURIComponent(symbol)}` +
      `&fields=impliedVolatility,ivPercentile,ivRank,historicalVolatility&raw=1`;

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
    const toNum = (v: any): number | null => {
      const n = Number(v);
      return v != null && isFinite(n) ? n : null;
    };
    out.iv      = toNum(d.impliedVolatility);
    out.iv_rank = toNum(d.ivRank);
    out.iv_pct  = toNum(d.ivPercentile);
  } catch {
    // silently return nulls
  }
  return out;
}
