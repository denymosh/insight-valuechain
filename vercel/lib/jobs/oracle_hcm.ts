// Oracle HCM Recruiting Cloud — public REST API
// Used by Nokia, Cisco, Intel (some), and other large companies.
// No auth required, accessible from cloud IPs.

export type JobPosting = {
  symbol: string;
  req_id: string;
  title: string;
  location: string | null;
  country: string | null;
  dept: string | null;
  posted_date: string;     // YYYY-MM-DD
  url: string;
};

export type OracleHcmConfig = {
  /** API host, e.g. "fa-evmr-saasfaprod1.fa.ocs.oraclecloud.com" */
  host: string;
  /** Site number, typically "CX_1" */
  siteNumber: string;
  /** Public-facing careers domain for building job URLs, e.g. "jobs.nokia.com" */
  publicDomain: string;
  /** Optional language path, defaults to "en" */
  langPath?: string;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Fetch all open job requisitions for a given Oracle HCM site.
 * Iterates through pages of 200 until done.
 */
export async function fetchOracleHcmJobs(
  symbol: string,
  cfg: OracleHcmConfig
): Promise<JobPosting[]> {
  const out: JobPosting[] = [];
  const lang = cfg.langPath ?? "en";
  const PAGE = 200;
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    // expand=requisitionList 才会返回逐条 job；limit/offset 顶层；不指定 sortBy
    const url =
      `https://${cfg.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
      `?onlyData=true&expand=requisitionList.secondaryLocations` +
      `&finder=findReqs;siteNumber=${encodeURIComponent(cfg.siteNumber)}` +
      `,facetsList=LOCATIONS%3BTITLES%3BCATEGORIES%3BORGANIZATIONS%3BPOSTING_DATES` +
      `&limit=${PAGE}&offset=${offset}`;

    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) break;
    const json = await res.json();

    const items: any[] = json?.items?.[0]?.requisitionList ?? [];
    if (offset === 0) {
      total = Number(json?.items?.[0]?.TotalJobsCount ?? items.length);
    }
    if (items.length === 0) break;

    for (const it of items) {
      const reqId = String(it.Id ?? it.RequisitionId ?? "");
      if (!reqId) continue;
      const title: string = it.Title ?? "";
      const primary: string | null = it.PrimaryLocation ?? null;
      const country: string | null = it.PrimaryLocationCountry ?? null;
      const dept: string | null = it.Category ?? it.Organization ?? null;
      const posted: string | null = it.PostedDate ?? it.ExternalPostedStartDate ?? null;
      if (!title || !posted) continue;

      const jobUrl = `https://${cfg.publicDomain}/${lang}/sites/${cfg.siteNumber}/job/${reqId}`;
      out.push({
        symbol,
        req_id: reqId,
        title,
        location: primary,
        country,
        dept,
        posted_date: String(posted).slice(0, 10),
        url: jobUrl,
      });
    }

    offset += items.length;
    if (items.length < PAGE) break;
  }

  return out;
}
