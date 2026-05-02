// Workday CXS (Candidate Experience) public REST API.
// Pattern: POST https://{tenant}.{wd}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
// Body: { appliedFacets: {...}, limit, offset, searchText }
//
// 1 request returns total + facets (job_family / locations / etc.) — no pagination needed for our summary.

import type { JobSummary } from "./oracle_hcm";

export type WorkdayConfig = {
  /** e.g. "micron" / "intel" / "lumentum" */
  tenant: string;
  /** e.g. "wd1" / "wd5" — varies per tenant, take from URL */
  pod: string;
  /** site path, e.g. "External" / "MarvellCareers" / "LITE" / "BlackBerry" */
  site: string;
  /** display URL for building per-job links, e.g. "https://intel.wd1.myworkdayjobs.com/External" */
  publicBase: string;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function workdayJobsCall(
  cfg: WorkdayConfig,
  body: any
): Promise<any | null> {
  const url = `https://${cfg.tenant}.${cfg.pod}.myworkdayjobs.com/wday/cxs/${cfg.tenant}/${cfg.site}/jobs`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: `https://${cfg.tenant}.${cfg.pod}.myworkdayjobs.com`,
      Referer: cfg.publicBase,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return res.json();
}

/** Convert Workday facet array → name→count map */
function facetToMap(facetValues: any[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of facetValues ?? []) {
    const name = String(v?.descriptor ?? "");
    const cnt = Number(v?.count ?? 0);
    if (name && cnt) out[name] = cnt;
  }
  return out;
}

/** Merge multiple JobSummary results (same symbol, different ATS sites). */
export async function fetchMultiWorkdaySummary(
  symbol: string,
  configs: WorkdayConfig[]
): Promise<JobSummary | null> {
  const results = await Promise.all(configs.map((c) => fetchWorkdaySummary(symbol, c)));
  const valid = results.filter((r): r is JobSummary => r !== null);
  if (valid.length === 0) return null;

  let total = 0, posted_7d = 0, posted_30d = 0;
  const by_dept:    Record<string, number> = {};
  const by_country: Record<string, number> = {};
  const by_title:   Record<string, number> = {};
  const addAll = (dst: Record<string, number>, src: Record<string, number>) => {
    for (const [k, v] of Object.entries(src)) dst[k] = (dst[k] ?? 0) + v;
  };
  for (const r of valid) {
    total      += r.total;
    posted_7d  += r.posted_7d;
    posted_30d += r.posted_30d;
    addAll(by_dept,    r.by_dept);
    addAll(by_country, r.by_country);
    addAll(by_title,   r.by_title);
  }
  return { symbol, total, posted_7d, posted_30d, by_dept, by_country, by_title };
}

export async function fetchWorkdaySummary(
  symbol: string,
  cfg: WorkdayConfig
): Promise<JobSummary | null> {
  // Step 1: unfiltered → total + facets
  const main = await workdayJobsCall(cfg, {
    appliedFacets: {},
    limit: 1,
    offset: 0,
    searchText: "",
  });
  if (!main) return null;
  const total = Number(main.total ?? 0);
  if (!total) return null;

  // Workday facets: array of {facetParameter, values: [{descriptor, count, ...}]}
  const facets: any[] = main.facets ?? [];
  let by_dept: Record<string, number> = {};
  let by_country: Record<string, number> = {};
  let by_title: Record<string, number> = {};
  for (const f of facets) {
    const param = String(f.facetParameter ?? "");
    // 部门/职能分类：jobFamilyGroup (大类) > jobFamily (细类) > Functional_Area (BB)
    if (/jobFamilyGroup|Functional_?Area|category/i.test(param)) {
      by_dept = { ...by_dept, ...facetToMap(f.values) };
    } else if (/jobFamily/i.test(param) && Object.keys(by_dept).length === 0) {
      // 仅当没有 jobFamilyGroup 时用 jobFamily（LITE 这种）
      by_dept = facetToMap(f.values);
    } else if (/^Country$/i.test(param)) {
      by_country = facetToMap(f.values);
    } else if (/locationCountry/i.test(param) && Object.keys(by_country).length === 0) {
      by_country = facetToMap(f.values);
    } else if (/^Location$/i.test(param) && Object.keys(by_country).length === 0) {
      by_country = facetToMap(f.values);
    } else if (/timeType|workerSubType/i.test(param)) {
      // 这两个聚合到 by_title (workerSubType 提供 Regular/Intern/Contractor 信息)
      by_title = { ...by_title, ...facetToMap(f.values) };
    }
  }

  // Step 2: 7-day count (best-effort — some tenants expose Last_7_Days facet, otherwise 0)
  let posted_7d = 0;
  let posted_30d = 0;
  try {
    const r7 = await workdayJobsCall(cfg, {
      appliedFacets: { postingDate: ["Last_7_Days"] },
      limit: 1,
      offset: 0,
      searchText: "",
    });
    if (r7?.total != null) posted_7d = Number(r7.total);
  } catch { /* ignore */ }

  try {
    const r30 = await workdayJobsCall(cfg, {
      appliedFacets: { postingDate: ["Last_30_Days"] },
      limit: 1,
      offset: 0,
      searchText: "",
    });
    if (r30?.total != null) posted_30d = Number(r30.total);
  } catch { /* ignore */ }

  return {
    symbol,
    total,
    posted_7d,
    posted_30d,
    by_dept,
    by_country,
    by_title,
  };
}
