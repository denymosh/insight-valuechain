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

/** Extract a role keyword from a job title. Returns "Other" if no match. */
function inferRoleFromTitle(title: string): string {
  const t = title.toLowerCase();
  // 顺序很重要：更具体的优先（避免 "Software Engineer" 被先匹配到 Engineer）
  const patterns: Array<[RegExp, string]> = [
    [/\bsoftware (engineer|developer)\b/, "Software Engineer"],
    [/\b(hardware|silicon|asic|rfic|fpga) engineer\b/, "Hardware Engineer"],
    [/\bfirmware engineer\b/, "Firmware Engineer"],
    [/\bdesign engineer\b/, "Design Engineer"],
    [/\bsystems? engineer\b/, "Systems Engineer"],
    [/\b(test|verification|validation) engineer\b/, "Test/Verification Engineer"],
    [/\b(process|manufacturing|production) engineer\b/, "Process/Mfg Engineer"],
    [/\b(quality|reliability) engineer\b/, "Quality Engineer"],
    [/\b(applications?|field) engineer\b/, "Applications Engineer"],
    [/\b(mechanical|optical|thermal|structural) engineer\b/, "Mechanical/Optical Engineer"],
    [/\bengineer(ing)?\b/, "Engineering"],
    [/\b(operator|operat)\b/, "Operator"],
    [/\btechnician\b/, "Technician"],
    [/\bscientist\b/, "Scientist"],
    [/\barchitect\b/, "Architect"],
    [/\bresearcher?\b/, "Research"],
    [/\bdeveloper\b/, "Developer"],
    [/\b(designer|design)\b/, "Design"],
    [/\b(account executive|account manager|sales)\b/, "Sales"],
    [/\bmarketing\b/, "Marketing"],
    [/\b(business develop|biz dev)\b/, "Business Development"],
    [/\bproduct manager\b/, "Product Management"],
    [/\b(program|project) manager\b/, "Program/Project Mgmt"],
    [/\b(director|vp|vice president|chief|head of)\b/, "Leadership"],
    [/\bmanager\b/, "Manager"],
    [/\bspecialist\b/, "Specialist"],
    [/\banalyst\b/, "Analyst"],
    [/\b(coordinator|administrator|admin)\b/, "Admin"],
    [/\b(buyer|procurement|supply chain|planner)\b/, "Supply Chain"],
    [/\b(finance|accounting|accountant|auditor|controller)\b/, "Finance"],
    [/\b(hr|human resources|recruiter|talent)\b/, "Human Resources"],
    [/\b(legal|counsel|attorney|paralegal)\b/, "Legal"],
    [/\b(quality)\b/, "Quality"],
    [/\b(intern|co-?op|trainee|student)\b/, "Intern/Trainee"],
    [/\b(maintenance|repair|service)\b/, "Maintenance"],
    [/\b(assembly|assembler|machinist|welder|fabricator|cnc)\b/, "Assembly/Fab"],
  ];
  for (const [re, label] of patterns) if (re.test(t)) return label;
  return "Other";
}

/** Fallback: paginate all requisitions and bucket by title-inferred role.
 *  Used when categoriesFacet is empty (e.g. Coherent's Oracle tenant).
 *  Dedupes by Id to handle Oracle tenants that ignore offset (return same page each time). */
async function bucketByTitle(cfg: OracleHcmConfig, totalKnown: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const seenIds = new Set<string>();
  let offset = 0;
  const MAX_ITER = 60; // 60 * 25 = 1500 jobs max
  let lastNewIds = -1;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    // Try offset both inside finder AND as top-level (different Oracle tenants accept different formats)
    const url =
      `https://${cfg.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
      `?onlyData=true&expand=requisitionList` +
      `&finder=findReqs;siteNumber=${encodeURIComponent(cfg.siteNumber)},offset=${offset}` +
      `&offset=${offset}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) break;
    const json = await res.json();
    const items: any[] = json?.items?.[0]?.requisitionList ?? [];
    if (items.length === 0) break;

    let newCount = 0;
    for (const it of items) {
      const id = String(it.Id ?? "");
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      newCount++;
      const role = inferRoleFromTitle(String(it.Title ?? ""));
      out[role] = (out[role] ?? 0) + 1;
    }

    // Stop if no new IDs this round (offset isn't being honored — or all done)
    if (newCount === 0) break;
    if (newCount === lastNewIds && lastNewIds < items.length) break;
    lastNewIds = newCount;

    offset += items.length;
    if (seenIds.size >= totalKnown) break;
  }
  return out;
}

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

  let by_dept = facetToMap(meta.categoriesFacet);
  // Fallback: if Oracle tenant doesn't expose categoriesFacet (e.g. Coherent),
  // paginate jobs and bucket by role keyword in title.
  if (Object.keys(by_dept).length === 0 && total > 0 && total < 2000) {
    try {
      by_dept = await bucketByTitle(cfg, total);
    } catch { /* keep empty */ }
  }

  return {
    symbol,
    total,
    posted_7d: posted7,
    posted_30d: posted30,
    by_dept,
    by_country: facetToMap(meta.locationsFacet),
    by_title: facetToMap(meta.titlesFacet),
    careers_url: `https://${cfg.publicDomain}/${lang}/sites/${cfg.siteNumber}/jobs`,
  };
}
