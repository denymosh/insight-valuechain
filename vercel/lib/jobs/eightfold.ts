// Eightfold AI Career Hub public API.
// GET https://{tenant}.eightfold.ai/api/apply/v2/jobs?query=&start=0&num=1
// Returns: { count, positions, facets } — facets are { name: count } maps.

import type { JobSummary } from "./oracle_hcm";

export type EightfoldConfig = {
  /** subdomain prefix, e.g. "stmicroelectronics" → stmicroelectronics.eightfold.ai */
  tenant: string;
  /** optional domain param Eightfold sometimes wants */
  domain?: string;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function fetchEightfoldSummary(
  symbol: string,
  cfg: EightfoldConfig
): Promise<JobSummary | null> {
  const params = new URLSearchParams({
    query: "",
    start: "0",
    num: "1", // we only need facets
    ...(cfg.domain ? { domain: cfg.domain } : {}),
  });
  const url = `https://${cfg.tenant}.eightfold.ai/api/apply/v2/jobs?${params.toString()}`;

  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const json = await res.json();

  const total = Number(json?.count ?? 0);
  if (!total) return null;

  const facets = json?.facets ?? {};
  const toMap = (raw: any): Record<string, number> => {
    const out: Record<string, number> = {};
    if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw)) {
        const cnt = Number(v);
        if (k && Number.isFinite(cnt) && cnt > 0 && cnt < 100000) out[k] = cnt;
      }
    }
    return out;
  };

  // by_dept: 优先 job_family（更宽泛）；如果没有就用 job_function
  const by_dept = Object.keys(facets.job_family ?? {}).length > 0
    ? toMap(facets.job_family)
    : toMap(facets.job_function);

  // by_country: region_country
  const by_country = toMap(facets.region_country);

  // by_title: 雇佣类型 / recruiting_type
  const by_title: Record<string, number> = { ...toMap(facets.worker_type), ...toMap(facets.recruiting_type) };

  return {
    symbol,
    total,
    posted_7d: 0,    // Eightfold 不暴露 posted-date facet
    posted_30d: 0,
    by_dept,
    by_country,
    by_title,
  };
}
