// Greenhouse Job Boards public REST API.
// GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true
// Returns full job list (no pagination).
// v2: reads metadata "Job Discipline" + "Employment Type" instead of first-word title.

import type { JobSummary } from "./oracle_hcm";

export type GreenhouseConfig = {
  /** board token, e.g. "rocketlab" */
  boardToken: string;
  /** Product/program keywords to count in job titles, e.g. ["Neutron","Electron","Archimedes"] */
  keywords?: string[];
};

export async function fetchGreenhouseSummary(
  symbol: string,
  cfg: GreenhouseConfig
): Promise<JobSummary | null> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(cfg.boardToken)}/jobs?content=false`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const jobs: any[] = json?.jobs ?? [];
  const total = jobs.length;
  if (!total) return null;

  const now = Date.now();
  const day = 86400000;

  const by_dept: Record<string, number> = {};
  const by_country: Record<string, number> = {};
  const by_title: Record<string, number> = {};
  const by_keyword: Record<string, number> = {};

  let posted_7d = 0;
  let posted_30d = 0;

  const keywords = cfg.keywords ?? [];

  for (const j of jobs) {
    // ── Department: prefer metadata "Job Discipline" / "Department" / "Job Family",
    //    fall back to departments[] array ──
    const meta: any[] = j.metadata ?? [];
    let deptFromMeta: string[] = [];
    let employmentType: string | null = null;
    for (const m of meta) {
      const name = String(m?.name ?? "");
      const val = m?.value;
      if (/job\s*discipline|department|job\s*family|category/i.test(name)) {
        const arr = Array.isArray(val) ? val : (val != null ? [val] : []);
        for (const v of arr) {
          const s = String(v ?? "").trim();
          if (s) deptFromMeta.push(s);
        }
      }
      if (/employment\s*type/i.test(name) && val != null) {
        employmentType = String(Array.isArray(val) ? val[0] : val).trim();
      }
    }
    if (deptFromMeta.length > 0) {
      for (const d of deptFromMeta) by_dept[d] = (by_dept[d] ?? 0) + 1;
    } else {
      const depts: any[] = j.departments ?? [];
      for (const d of depts) {
        const n = String(d?.name ?? "").trim();
        if (n) by_dept[n] = (by_dept[n] ?? 0) + 1;
      }
    }

    // ── Country: extract last comma part of location name ──
    const locName: string = String(j.location?.name ?? "").trim();
    if (locName) {
      const parts = locName.split(",").map((s) => s.trim()).filter(Boolean);
      const tail = parts[parts.length - 1] || locName;
      // 美国州名归到 USA
      const country = /^(CA|MD|VA|TX|FL|NY|CO|WA|OR|MA|NJ|GA|AZ|NC|PA|IL|OH|MI|MN|IN)$/i.test(tail)
        ? "USA"
        : (/^US$/i.test(tail) ? "USA" : tail);
      by_country[country] = (by_country[country] ?? 0) + 1;
    }

    // ── Employment type (for Regular/Intern/Contractor analysis) ──
    if (employmentType) {
      by_title[employmentType] = (by_title[employmentType] ?? 0) + 1;
    }

    // ── Product keywords in title ──
    const title: string = String(j.title ?? "");
    for (const kw of keywords) {
      const re = new RegExp(`\\b${kw}\\b`, "i");
      if (re.test(title)) by_keyword[kw] = (by_keyword[kw] ?? 0) + 1;
    }

    // ── Posted recency ──
    const upd = j.updated_at ?? j.first_published ?? null;
    if (upd) {
      const t = new Date(upd).getTime();
      if (Number.isFinite(t)) {
        const diff = now - t;
        if (diff <= 7 * day) posted_7d++;
        if (diff <= 30 * day) posted_30d++;
      }
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
  };
}
