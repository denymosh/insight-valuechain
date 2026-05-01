"use client";
import { useEffect, useState } from "react";

type JobSummary = {
  symbol: string;
  total: number;
  posted_7d: number;
  posted_30d: number;
  by_dept: Record<string, number>;
  by_country: Record<string, number>;
  by_title: Record<string, number>;
  fetched_at: string;
};

// 低成本研发地区（用于"注意"信号）
const LOW_COST_COUNTRIES = ["India", "Poland", "Portugal", "Romania", "Hungary", "Mexico", "Vietnam", "Philippines"];

function topN(map: Record<string, number>, n = 5): [string, number][] {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

/** Generates positive signals + cautions based on hiring data. */
function analyze(s: JobSummary): { positive: string[]; caution: string[] } {
  const positive: string[] = [];
  const caution: string[] = [];

  const rdCount  = s.by_dept["Applied R&D"] ?? s.by_dept["R&D"] ?? 0;
  const rdPct    = pct(rdCount, s.total);
  const swCount  = s.by_title["Software"] ?? 0;
  const hwCount  = s.by_title["Digital Hardware"] ?? s.by_title["Hardware"] ?? 0;
  const techCount = swCount + hwCount;
  const traineeCount = s.by_title["Trainee"] ?? 0;
  const traineePct = pct(traineeCount, s.total);

  // Low-cost region concentration
  let lowCostCount = 0;
  for (const c of LOW_COST_COUNTRIES) lowCostCount += s.by_country[c] ?? 0;
  const lowCostPct = pct(lowCostCount, s.total);
  const lowCostNames = LOW_COST_COUNTRIES
    .filter((c) => (s.by_country[c] ?? 0) > 0)
    .slice(0, 3);

  const post7Pct = pct(s.posted_7d, s.total);
  const post30Pct = pct(s.posted_30d, s.total);

  // ── Positive signals ─────
  if (rdPct >= 30) {
    positive.push(`R&D 投入大 (${rdCount} 个 / ${rdPct}%)`);
  }
  if (techCount >= 100) {
    positive.push(`技术核心岗 ${techCount} 个 (软件 ${swCount} + 硬件 ${hwCount})`);
  }
  if (post7Pct >= 15) {
    positive.push(`7 天新增 ${s.posted_7d} 个 (${post7Pct}% — 招聘加速)`);
  }
  if (post30Pct >= 40) {
    positive.push(`30 天新增 ${s.posted_30d} 个 (${post30Pct}% — 持续扩张)`);
  }

  // ── Caution signals ──────
  if (traineePct >= 15) {
    caution.push(`Trainee ${traineeCount} 个 (${traineePct}% — 大量低薪新人)`);
  }
  if (lowCostPct >= 35) {
    const places = lowCostNames.length ? `${lowCostNames.join(" + ")}` : "低成本地区";
    caution.push(`${places} ${lowCostCount} 个 (${lowCostPct}% — 成本优化导向)`);
  }
  if (post7Pct < 5 && s.total > 100) {
    caution.push(`7 天仅新增 ${s.posted_7d} 个 (${post7Pct}% — 招聘放缓)`);
  }

  return { positive, caution };
}

function SummaryCard({ s }: { s: JobSummary }) {
  const { positive, caution } = analyze(s);
  const topDepts = topN(s.by_dept, 3);
  const topCountries = topN(s.by_country, 3);
  const topTitles = topN(s.by_title, 3);
  const rdCount  = s.by_dept["Applied R&D"] ?? s.by_dept["R&D"] ?? 0;
  const rdPct    = pct(rdCount, s.total);

  const overviewLines = [
    `${s.total} 个开放职位`,
    `7 天新增 ${s.posted_7d} (${pct(s.posted_7d, s.total)}%) · 30 天新增 ${s.posted_30d} (${pct(s.posted_30d, s.total)}%)`,
    `R&D ${rdCount} (${rdPct}%) · 部门: ${topDepts.map(([n, c]) => `${n} ${c}`).join(" · ")}`,
    `地点: ${topCountries.map(([n, c]) => `${n} ${c}`).join(" · ")}`,
    `职位类型: ${topTitles.map(([n, c]) => `${n} ${c}`).join(" · ")}`,
  ];

  return (
    <div style={{
      background: "rgba(15,23,42,0.5)",
      border: "1px solid rgba(51,65,85,0.5)",
      borderRadius: 8,
      padding: "14px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{
            fontWeight: 700, fontSize: 13, color: "#93c5fd",
            background: "rgba(96,165,250,0.16)",
            padding: "3px 10px", borderRadius: 5,
          }}>{s.symbol}</span>
          <span style={{ fontSize: 13, color: "#cbd5e1", fontWeight: 600 }}>
            {s.total} jobs · 7d +{s.posted_7d} · 30d +{s.posted_30d}
          </span>
        </div>
        <span style={{ fontSize: 10, color: "#64748b" }}>
          更新于 {timeAgo(s.fetched_at)}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <Section title="📊 总体概况" color="#cbd5e1" lines={overviewLines} />
        <Section title="✅ 正面信号" color="#86efac"
                 lines={positive.length ? positive : ["—"]} />
        <Section title="⚠️ 需要注意" color="#fdba74"
                 lines={caution.length ? caution : ["—"]} />
      </div>
    </div>
  );
}

function Section({ title, color, lines }: { title: string; color: string; lines: string[] }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 6 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 14, color: "#cbd5e1", fontSize: 11.5, lineHeight: 1.65 }}>
        {lines.map((line, i) => <li key={i}>{line}</li>)}
      </ul>
    </div>
  );
}

export default function RecentJobsCard() {
  const [summaries, setSummaries] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSym, setActiveSym] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        // 只保留 30 天内有新招聘的标的
        const active: JobSummary[] = (d.summaries ?? []).filter(
          (s: JobSummary) => (s.posted_30d ?? 0) > 0
        );
        setSummaries(active);
        if (active.length > 0) setActiveSym(active[0].symbol);
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const current = summaries.find((s) => s.symbol === activeSym) ?? null;

  return (
    <div style={{
      marginTop: 24, marginBottom: 32,
      padding: "14px 18px",
      background: "rgba(15,23,42,0.3)",
      border: "1px solid rgba(51,65,85,0.4)",
      borderRadius: 10,
      maxWidth: 1100,             // ← 收窄
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, marginBottom: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>
            📋 招聘动态分析
          </h3>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            近 30 天内有招聘活动的标的
          </span>
        </div>
        {summaries.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {summaries.map((s) => {
              const active = s.symbol === activeSym;
              return (
                <button
                  key={s.symbol}
                  onClick={() => setActiveSym(s.symbol)}
                  style={{
                    fontSize: 11, fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: 5,
                    border: `1px solid ${active ? "rgba(96,165,250,0.55)" : "rgba(51,65,85,0.55)"}`,
                    background: active ? "rgba(96,165,250,0.18)" : "transparent",
                    color: active ? "#93c5fd" : "#94a3b8",
                    cursor: "pointer",
                  }}
                >
                  {s.symbol} <span style={{ opacity: 0.65, fontWeight: 500 }}>+{s.posted_30d}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ color: "#64748b", fontSize: 12, padding: "20px 0" }}>加载中…</div>
      ) : summaries.length === 0 ? (
        <div style={{ color: "#64748b", fontSize: 12, padding: "20px 0" }}>
          暂无数据，请运行 /api/cron/refresh-jobs 触发首次抓取。
        </div>
      ) : current ? (
        <SummaryCard s={current} />
      ) : null}
    </div>
  );
}
