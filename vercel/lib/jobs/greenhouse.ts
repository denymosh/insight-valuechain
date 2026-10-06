// Greenhouse Job Boards public REST API.
// GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true
// Returns full job list (no pagination).
// v3: tracks per-tenant product keywords (e.g. RKLB Neutron/Electron) via cfg.keywords.

import type { JobSummary } from "./oracle_hcm";

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC","D.C.",
]);

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
      // RKLB 用 "Job Discipline"，SpaceX 用 "Discipline"
      if (/discipline|department|job\s*family|category/i.test(name)) {
        const arr = Array.isArray(val) ? val : (val != null ? [val] : []);
        for (const v of arr) {
          const s = String(v ?? "").trim();
          if (s) deptFromMeta.push(s);
        }
      }
      // SpaceX 的 "Program" 字段（Starlink / Starship / Falcon ...）计入关键项目
      if (/^program$/i.test(name.trim())) {
        const arr = Array.isArray(val) ? val : (val != null ? [val] : []);
        for (const v of arr) {
          const s = String(v ?? "").trim();
          if (s) by_keyword[s] = (by_keyword[s] ?? 0) + 1;
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
      // "Remote - TX" → "TX"
      const tail = (parts[parts.length - 1] || locName).replace(/^remote\s*-\s*/i, "");
      // 美国州名（50 州 + DC）归到 USA
      const country = US_STATES.has(tail.toUpperCase()) || /^(US|USA|United States)$/i.test(tail)
        ? "USA"
        : tail;
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
    // 优先 first_published：SpaceX 等会批量刷新 updated_at，导致全部岗位看起来都是新发布
    const upd = j.first_published ?? j.updated_at ?? null;
    if (upd) {
      const t = new Date(upd).getTime();
      if (Number.isFinite(t)) {
        const diff = now - t;
        if (diff <= 7 * day) posted_7d++;
        if (diff <= 30 * day) posted_30d++;
      }
    }
  }

  // Fallback: 如果 jobs[].metadata/departments 都没有部门数据，
  // 调用 /departments 端点（少数 Greenhouse tenant 像 Planet Labs 用这个）
  if (Object.keys(by_dept).length === 0) {
    try {
      const deptUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(cfg.boardToken)}/departments`;
      const dr = await fetch(deptUrl, { headers: { Accept: "application/json" } });
      if (dr.ok) {
        const dj = await dr.json();
        const depts: any[] = dj?.departments ?? [];
        for (const d of depts) {
          const name = String(d?.name ?? "").trim();
          const count = Array.isArray(d?.jobs) ? d.jobs.length : Number(d?.job_count ?? 0);
          if (name && count) by_dept[name] = (by_dept[name] ?? 0) + count;
        }
      }
    } catch { /* ignore */ }
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
    careers_url: `https://job-boards.greenhouse.io/${encodeURIComponent(cfg.boardToken)}`,
  };
}
