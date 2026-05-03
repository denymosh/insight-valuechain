// Lever public Job Postings API.
// GET https://api.lever.co/v0/postings/{company}?mode=json
// Returns array of jobs; each has categories.team / location / commitment, createdAt (ms).

import type { JobSummary } from "./oracle_hcm";

export type LeverConfig = {
  /** company slug, e.g. "palantir" */
  company: string;
  /** Optional: translate codename teams to descriptive labels.
   *  e.g. { "Delta": "Forward Deployed Engineer", "Echo": "Forward Deployed Strategist" } */
  teamLabels?: Record<string, string>;
  /** Optional: count product/program keywords found in job titles.
   *  e.g. ["Gotham", "Foundry", "AIP", "Apollo", "US Government"] */
  keywords?: string[];
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function fetchLeverSummary(
  symbol: string,
  cfg: LeverConfig
): Promise<JobSummary | null> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(cfg.company)}?mode=json`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const jobs: any[] = await res.json();
  if (!Array.isArray(jobs) || jobs.length === 0) return null;

  const total = jobs.length;
  const now = Date.now();
  const day = 86400000;

  const by_dept: Record<string, number> = {};
  const by_country: Record<string, number> = {};
  const by_title: Record<string, number> = {};
  const by_keyword: Record<string, number> = {};

  let posted_7d = 0;
  let posted_30d = 0;

  const keywords = cfg.keywords ?? [];
  const teamLabels = cfg.teamLabels ?? {};

  for (const j of jobs) {
    const team = String(j?.categories?.team ?? "").trim();
    const dept = String(j?.categories?.department ?? "").trim();
    const loc  = String(j?.categories?.location ?? "").trim();
    const country = String(j?.country ?? "").trim();
    const commitment = String(j?.categories?.commitment ?? "").trim();
    const title = String(j?.text ?? "");  // Lever uses 'text' for the job title

    // Department: prefer team (with label translation), fall back to department
    const rawDept = team || dept;
    const deptName = teamLabels[rawDept] ?? rawDept;
    if (deptName) by_dept[deptName] = (by_dept[deptName] ?? 0) + 1;

    // Product/program keywords scanned in title
    for (const kw of keywords) {
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(title)) by_keyword[kw] = (by_keyword[kw] ?? 0) + 1;
    }

    // Country: prefer ISO country code, fall back to last comma part of location
    if (country) {
      const c = country === "US" ? "USA" : country;
      by_country[c] = (by_country[c] ?? 0) + 1;
    } else if (loc) {
      const parts = loc.split(",").map((s) => s.trim()).filter(Boolean);
      const tail = parts[parts.length - 1] || loc;
      by_country[tail] = (by_country[tail] ?? 0) + 1;
    }

    // Employment commitment
    if (commitment) by_title[commitment] = (by_title[commitment] ?? 0) + 1;

    // Posted recency from createdAt (ms timestamp)
    const t = Number(j?.createdAt);
    if (Number.isFinite(t)) {
      const diff = now - t;
      if (diff <= 7 * day) posted_7d++;
      if (diff <= 30 * day) posted_30d++;
    }
  }

  return {
    symbol,
    total,
    posted_7d,
    posted_30d,
    by_dept,
    by_country,
    by_title,
    by_keyword: Object.keys(by_keyword).length > 0 ? by_keyword : undefined,
    careers_url: `https://jobs.lever.co/${encodeURIComponent(cfg.company)}`,
  };
}
