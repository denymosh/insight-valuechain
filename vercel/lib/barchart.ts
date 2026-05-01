// Fetch IV Rank + IV Percentile from Barchart.
// Uses /proxies/core-api/v1/options/get endpoint (the one Barchart's options page actually uses).

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type BarchartIV = {
  iv: number | null;       // 30-day historical volatility (%)
  iv_rank: number | null;  // IV Rank 52-week (0–100)
  iv_pct: number | null;   // IV Percentile 52-week (0–100)
  status: string;          // debug — what happened
};

export async function fetchBarchartIV(symbol: string): Promise<BarchartIV> {
  const out: BarchartIV = { iv: null, iv_rank: null, iv_pct: null, status: "init" };
  try {
    // Step 1: get session cookie + XSRF token from options page
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
    if (!pageRes.ok) {
      out.status = `page status ${pageRes.status}`;
      return out;
    }

    // Extract all Set-Cookie headers
    const rawCookies: string[] = (pageRes.headers as any).getSetCookie?.() ?? [];
    const cookieStr = rawCookies.map((c) => c.split(";")[0]).join("; ");
    const xsrfRaw = rawCookies.find((c) => c.startsWith("XSRF-TOKEN="));
    const xsrfTokenEncoded = xsrfRaw ? xsrfRaw.split(";")[0].replace("XSRF-TOKEN=", "") : "";
    // Cookie value is URL-encoded; X-XSRF-TOKEN header needs the decoded value
    const xsrfToken = xsrfTokenEncoded ? decodeURIComponent(xsrfTokenEncoded) : "";

    if (!xsrfToken) {
      out.status = "no XSRF token";
      return out;
    }

    // Step 2: call /options/get with cookies + XSRF
    const apiUrl =
      `https://www.barchart.com/proxies/core-api/v1/options/get` +
      `?baseSymbol=${encodeURIComponent(symbol)}` +
      `&fields=averageVolatility,historicVolatility30d,impliedVolatilityRank1y,impliedVolatilityPercentile1y` +
      `&groupBy=optionType&expirationDate=nearest&meta=field.shortName&raw=1`;

    const apiRes = await fetch(apiUrl, {
      headers: {
        "User-Agent": UA,
        "Referer": `https://www.barchart.com/stocks/quotes/${encodeURIComponent(symbol)}/options`,
        "Accept": "application/json",
        "Cookie": cookieStr,
        "X-XSRF-TOKEN": xsrfToken,
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://www.barchart.com",
      },
    });
    if (!apiRes.ok) {
      const body = await apiRes.text();
      out.status = `api status ${apiRes.status} body: ${body.slice(0, 200)}`;
      return out;
    }

    const json = await apiRes.json();
    const data = json?.data;
    let raw: any = {};
    if (data && typeof data === "object" && !Array.isArray(data)) {
      // groupBy=optionType → {"": [...]} or {"Call": [...], "Put": [...]}
      const firstGroup = (Object.values(data)[0] as any[]) ?? [];
      const first = firstGroup[0] ?? {};
      raw = first.raw ?? first;
    } else if (Array.isArray(data) && data.length > 0) {
      raw = data[0]?.raw ?? data[0];
    }

    const toNum = (v: any): number | null => {
      const n = Number(v);
      return v != null && isFinite(n) ? n : null;
    };
    const hv30 = toNum(raw.historicVolatility30d);
    const ivPct = toNum(raw.impliedVolatilityPercentile1y);
    out.iv      = hv30 != null ? +(hv30 * 100).toFixed(2) : null;
    out.iv_rank = toNum(raw.impliedVolatilityRank1y);
    out.iv_pct  = ivPct != null ? +(ivPct * 100).toFixed(2) : null;
    out.status  = "ok";
  } catch (e: any) {
    out.status = `error: ${String(e?.message || e)}`;
  }
  return out;
}
