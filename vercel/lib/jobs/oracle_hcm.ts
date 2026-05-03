// Oracle HCM Recruiting Cloud — facets-only summary fetch.
// One request returns all aggregated counts (deps / countries / titles / posting-date buckets).
// No need to paginate through individual job postings.

export type JobSummary = {
  symbol: string;
  total: number;
  posted_7d: number;
  posted_30d: number;
  by_dept: Record<string, number>;
  by_country: Record<string, number>;
  by_title: Record<string, number>;
  /** Optional: hits of tracked product keywords in job titles (e.g. {"Neutron": 14, "Electron": 8}) */
  by_keyword?: Record<string, number>;
  /** Public-facing careers page URL (deep link to ATS for users to browse jobs) */
  careers_url?: string;
};

export type OracleHcmConfig = {
  host: string;
  siteNumber: string;
  publicDomain: string;
  langPath?: string;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function fetchOracleHcmSummary(
  symbol: string,
  cfg: OracleHcmConfig
): Promise<JobSummary | null> {
  const url =
    `https://${cfg.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
    `?onlyData=true` +
    `&finder=findReqs;siteNumber=${encodeURIComponent(cfg.siteNumber)}` +
    `,facetsList=LOCATIONS%3BTITLES%3BCATEGORIES%3BORGANIZATIONS%3BPOSTING_DATES`;

  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const meta = json?.items?.[0];
  if (!meta) return null;

  const total = Number(meta.TotalJobsCount ?? 0);
  if (!total) return null;

  // postingDatesFacet: 7-day / 30-day / >30 buckets
  const postingDates: any[] = meta.postingDatesFacet ?? [];
  let posted7 = 0, posted30 = 0;
  for (const b of postingDates) {
    const id = Number(b.Id);
    const cnt = Number(b.TotalCount ?? 0);
    if (id === 7) posted7 = cnt;
    else if (id === 30) posted30 = cnt;
  }

  const facetToMap = (arr: any[] | undefined): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const b of arr ?? []) {
      const name = String(b.Name ?? "");
      const cnt = Number(b.TotalCount ?? 0);
      if (name && cnt) out[name] = cnt;
    }
    return out;
  };

  const lang = cfg.langPath ?? "en";
  return {
    symbol,
    total,
    posted_7d: posted7,
    posted_30d: posted30,
    by_dept: facetToMap(meta.categoriesFacet),
    by_country: facetToMap(meta.locationsFacet),
    by_title: facetToMap(meta.titlesFacet),
    careers_url: `https://${cfg.publicDomain}/${lang}/sites/${cfg.siteNumber}/jobs`,
  };
}
