// Greenhouse Job Boards public REST API.
// GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true
// Returns full job list (no pagination).

import type { JobSummary } from "./oracle_hcm";

export type GreenhouseConfig = {
  /** board token, e.g. "rocketlab" */
  boardToken: string;
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

  let posted_7d = 0;
  let posted_30d = 0;

  for (const j of jobs) {
    // Department
    const depts: any[] = j.departments ?? [];
    for (const d of depts) {
      const n = String(d?.name ?? "").trim();
      if (n) by_dept[n] = (by_dept[n] ?? 0) + 1;
    }

    // Location → extract country (last comma part) + full as title fallback
    const locName: string = String(j.location?.name ?? "").trim();
    if (locName) {
      const parts = locName.split(",").map((s) => s.trim()).filter(Boolean);
      const country = parts[parts.length - 1] || locName;
      by_country[country] = (by_country[country] ?? 0) + 1;
    }

    // Title — group by first word as a coarse "category"
    const title: string = String(j.title ?? "").trim();
    if (title) {
      const firstWord = title.split(/\s+/)[0];
      by_title[firstWord] = (by_title[firstWord] ?? 0) + 1;
    }

    // Posted recency — Greenhouse exposes updated_at (closest proxy for posting)
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
  };
}
