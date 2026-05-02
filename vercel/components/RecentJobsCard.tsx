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
  by_keyword?: Record<string, number> | null;
  fetched_at: string;
};

// 低成本研发地区（用于"注意"信号）
const LOW_COST_COUNTRIES = ["India", "Poland", "Portugal", "Romania", "Hungary", "Mexico", "Vietnam", "Philippines"];

function topN(map: Record<string, number>, n = 5): [string, number][] {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n);
}

type DeptBucket = "rd" | "manuf" | "tech" | "sales" | "support";

/** Categorize a department / category name into one of 5 buckets. Order matters. */
function bucketDept(name: string): DeptBucket {
  const n = name.toLowerCase();
  // Technician 必须优先（避免 "Technician - ..." 被工程类抢走）
  if (/^technician|^operator|^assembly\b|cnc|machinist|welder|fabrication/.test(n)) return "tech";
  // 工程/研发（最宽泛的桶）
  if (/engineer|software|hardware|firmware|design|silicon|verification|r&?d|research|product develop|systems|gnc|architect|electronic|mechanical|structural|thermal|propulsion|optical|payload|spacecraft|launch|recovery|analysis|simulation|test\b/.test(n)) return "rd";
  // 制造/工艺（非工程类）
  if (/manufactur|production|process|equipment|maintenance/.test(n)) return "manuf";
  // 销售/市场
  if (/sales|marketing|business develop|commercial|pre-?sales/.test(n)) return "sales";
  // 默认 → 后台
  return "support";
}

const BUCKET_LABELS: Record<DeptBucket, string> = {
  rd:      "🔬 工程 / 研发",
  manuf:   "🏭 制造 / 工艺",
  tech:    "🔧 技师 / 操作",
  sales:   "💼 销售 / 市场",
  support: "📊 后台 / 支持",
};

/** Group dept map by bucket, return entries + subtotal per bucket. */
function groupDepts(by_dept: Record<string, number>):
  { bucket: DeptBucket; total: number; entries: [string, number][] }[] {
  const groups: Record<DeptBucket, [string, number][]> = {
    rd: [], manuf: [], tech: [], sales: [], support: [],
  };
  for (const [name, cnt] of Object.entries(by_dept)) {
    groups[bucketDept(name)].push([name, cnt]);
  }
  const order: DeptBucket[] = ["rd", "manuf", "tech", "sales", "support"];
  return order
    .map((b) => ({
      bucket: b,
      total: groups[b].reduce((s, [, c]) => s + c, 0),
      entries: groups[b].sort((a, b) => b[1] - a[1]),
    }))
    .filter((g) => g.entries.length > 0);
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

/** Sum counts in a name→count map whose name matches the regex. */
function aggMatch(map: Record<string, number>, regex: RegExp): number {
  let total = 0;
  for (const [name, cnt] of Object.entries(map)) {
    if (regex.test(name)) total += cnt;
  }
  return total;
}

/** Generates positive signals + cautions based on hiring data. */
function analyze(s: JobSummary): { positive: string[]; caution: string[] } {
  const positive: string[] = [];
  const caution: string[] = [];

  // ── 招聘类型分析 (workerSubType) ──
  // 雇佣类型分为三类：正式 / 实习 / 合同
  const regularCount  = aggMatch(s.by_title, /^regular$/i);
  const internCount   = aggMatch(s.by_title, /intern|trainee|student|co-op/i);
  const contractCount = aggMatch(s.by_title, /contract|contingent|fixed[\s-]?term/i);
  const regularPct    = pct(regularCount,  s.total);
  const internPct     = pct(internCount,   s.total);
  const contractPct   = pct(contractCount, s.total);

  // ── 部门聚合：研发 / 制造 / 销售 ──
  const rdCount  = aggMatch(s.by_dept, /r&?d|research|engineer|design|hardware|software|silicon|verification|test|product develop/i);
  const mfgCount = aggMatch(s.by_dept, /manufactur|production|prodrelated|process develop|equipment|maintenance|fab/i);
  const salesCount = aggMatch(s.by_dept, /sales|marketing|business develop|commercial/i);
  const rdPct    = pct(rdCount,    s.total);
  const mfgPct   = pct(mfgCount,   s.total);
  const salesPct = pct(salesCount, s.total);

  // ── 低成本地区集中度 ──
  let lowCostCount = 0;
  for (const c of LOW_COST_COUNTRIES) lowCostCount += s.by_country[c] ?? 0;
  const lowCostPct = pct(lowCostCount, s.total);
  const lowCostNames = LOW_COST_COUNTRIES
    .filter((c) => (s.by_country[c] ?? 0) > 0)
    .slice(0, 3);

  const post7Pct  = pct(s.posted_7d,  s.total);
  const post30Pct = pct(s.posted_30d, s.total);

  // ── 正面信号 ──
  if (rdPct >= 40) {
    positive.push(`R&D / 工程岗 ${rdCount} 个 (${rdPct}% — 强研发投入)`);
  }
  if (mfgPct >= 30) {
    positive.push(`制造 / 工艺岗 ${mfgCount} 个 (${mfgPct}% — 产能扩张)`);
  }
  if (regularPct >= 90 && s.total >= 100) {
    positive.push(`正式岗占比 ${regularPct}% — 雇佣结构稳健`);
  }
  if (internPct >= 5 && internPct < 15 && s.total >= 100) {
    positive.push(`实习生 ${internCount} 个 (${internPct}% — 健康培养梯队)`);
  }
  if (post7Pct >= 15) {
    positive.push(`7 天新增 ${s.posted_7d} 个 (${post7Pct}% — 招聘加速)`);
  }
  if (post30Pct >= 40) {
    positive.push(`30 天新增 ${s.posted_30d} 个 (${post30Pct}% — 持续扩张)`);
  }

  // ── 需要注意 ──
  if (internPct >= 20) {
    caution.push(`实习生 ${internCount} 个 (${internPct}% — 偏成本控制)`);
  }
  if (contractPct >= 10) {
    caution.push(`合同工/外包 ${contractCount} 个 (${contractPct}% — 用工弹性化)`);
  }
  if (lowCostPct >= 35) {
    const places = lowCostNames.length ? lowCostNames.join(" + ") : "低成本地区";
    caution.push(`${places} ${lowCostCount} 个 (${lowCostPct}% — 成本导向)`);
  }
  if (s.total >= 200 && salesPct > 0 && salesPct < 3) {
    caution.push(`销售/营销岗仅 ${salesPct}% — 商业化拓展可能放缓`);
  }
  if (post7Pct < 3 && post30Pct < 10 && s.total >= 100 && (s.posted_7d > 0 || s.posted_30d > 0)) {
    caution.push(`30 天新增 ${s.posted_30d} 个 (${post30Pct}% — 招聘放缓)`);
  }
  if (s.total < 50 && s.total > 0) {
    caution.push(`总职位仅 ${s.total} 个 — 业务体量收缩信号`);
  }

  return { positive, caution };
}

function SummaryCard({ s }: { s: JobSummary }) {
  const { positive, caution } = analyze(s);
  const topDepts = topN(s.by_dept, 3);
  const topCountries = topN(s.by_country, 3);
  const topTitles = topN(s.by_title, 3);
  // 用 regex 算 R&D（兼容所有 ATS 不同的命名）
  const rdCount = aggMatch(s.by_dept, /r&?d|research|engineer|design|hardware|software|silicon|verification|test|product develop/i);
  const rdPct   = pct(rdCount, s.total);

  const overviewLines = [
    `${s.total} 个开放职位`,
    `7 天新增 ${s.posted_7d} (${pct(s.posted_7d, s.total)}%) · 30 天新增 ${s.posted_30d} (${pct(s.posted_30d, s.total)}%)`,
    `R&D ${rdCount} (${rdPct}%) · 部门: ${topDepts.map(([n, c]) => `${n} ${c}`).join(" · ")}`,
    `地点: ${topCountries.map(([n, c]) => `${n} ${c}`).join(" · ")}`,
    `职位类型: ${topTitles.map(([n, c]) => `${n} ${c}`).join(" · ")}`,
  ];

  // 关键产品/项目维度（如 RKLB 跟踪 Neutron / Electron / Archimedes）
  if (s.by_keyword && Object.keys(s.by_keyword).length > 0) {
    const kwLine = Object.entries(s.by_keyword)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(" · ");
    overviewLines.push(`关键项目: ${kwLine}`);
  }

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

      <DeptBreakdown s={s} />
    </div>
  );
}

function Pill({ name, count }: { name: string; count: number }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "baseline", gap: 5,
      fontSize: 11,
      padding: "2px 8px",
      borderRadius: 4,
      background: "rgba(51,65,85,0.35)",
      border: "1px solid rgba(71,85,105,0.4)",
      color: "#cbd5e1",
      whiteSpace: "nowrap",
    }}>
      <span>{name}</span>
      <span style={{ color: "#94a3b8", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{count}</span>
    </span>
  );
}

function BucketRow({
  label, total, totalPct, entries,
}: {
  label: string; total: number; totalPct: number; entries: [string, number][];
}) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "180px 1fr",
      gap: 12,
      padding: "6px 0",
      alignItems: "baseline",
      borderTop: "1px solid rgba(51,65,85,0.25)",
    }}>
      <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>
        <div style={{ fontWeight: 700, color: "#cbd5e1" }}>{label}</div>
        <div style={{ color: "#64748b", marginTop: 1 }}>
          小计 <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{total}</span>
          <span style={{ marginLeft: 4 }}>({totalPct}%)</span>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {entries.map(([n, c]) => <Pill key={n} name={n} count={c} />)}
      </div>
    </div>
  );
}

function DeptBreakdown({ s }: { s: JobSummary }) {
  const groups = groupDepts(s.by_dept);
  if (groups.length === 0) return null;

  // 雇佣类型分组
  const regularCount  = aggMatch(s.by_title, /^regular$/i);
  const internCount   = aggMatch(s.by_title, /intern|trainee|student|co-op/i);
  const contractCount = aggMatch(s.by_title, /contract|contingent|fixed[\s-]?term/i);
  const fullTimeCount = aggMatch(s.by_title, /^full[\s-]?time$/i);
  const empEntries: [string, number][] = [];
  if (regularCount  > 0) empEntries.push([`正式岗 ${pct(regularCount,  s.total)}%`,  regularCount]);
  if (internCount   > 0) empEntries.push([`实习/学生 ${pct(internCount, s.total)}%`,  internCount]);
  if (contractCount > 0) empEntries.push([`合同/外包 ${pct(contractCount, s.total)}%`, contractCount]);
  if (fullTimeCount > 0 && regularCount === 0) empEntries.push([`全职`, fullTimeCount]);

  return (
    <div style={{
      marginTop: 14,
      paddingTop: 12,
      borderTop: "1px dashed rgba(51,65,85,0.5)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1", marginBottom: 4 }}>
        📋 详细职位分布
      </div>
      {groups.map((g) => (
        <BucketRow
          key={g.bucket}
          label={BUCKET_LABELS[g.bucket]}
          total={g.total}
          totalPct={pct(g.total, s.total)}
          entries={g.entries.slice(0, 12)}
        />
      ))}
      {empEntries.length > 0 && (
        <BucketRow
          label="👤 雇佣类型"
          total={empEntries.reduce((sum, [, c]) => sum + c, 0)}
          totalPct={pct(empEntries.reduce((sum, [, c]) => sum + c, 0), s.total)}
          entries={empEntries}
        />
      )}
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

// 标的 → 行业分类映射
type Category = {
  label: string;
  emoji: string;
  symbols: string[];
};

const CATEGORIES: Category[] = [
  { emoji: "🔬", label: "半导体", symbols: ["NVDA", "MU", "AVGO", "ADI", "INTC", "MRVL", "MCHP", "GFS"] },
  { emoji: "🌐", label: "网络/通信", symbols: ["NOK", "CSCO", "CIEN", "VIAV", "LITE"] },
  { emoji: "🛰️", label: "防务/航天", symbols: ["NOC", "AVAV", "TDY", "RKLB", "ACHR", "PL"] },
  { emoji: "📐", label: "测试量测", symbols: ["FORM", "ONTO", "TTMI"] },
  { emoji: "🔋", label: "能源工业", symbols: ["GEV", "BE", "TLN", "APD"] },
  { emoji: "🧪", label: "材料 / 模拟", symbols: ["HXL", "MTRN", "SMTC", "ALAB"] },
  { emoji: "💻", label: "计算/软件", symbols: ["DELL", "BB", "JBL"] },
];

function CategoryMiniCard({
  cat, summaries, activeSym, onPick,
}: {
  cat: Category;
  summaries: JobSummary[];
  activeSym: string | null;
  onPick: (sym: string) => void;
}) {
  const map = new Map(summaries.map((s) => [s.symbol, s]));
  const items = cat.symbols.map((sym) => map.get(sym)).filter((s): s is JobSummary => !!s);
  if (items.length === 0) return null;
  const total = items.reduce((sum, s) => sum + s.total, 0);

  return (
    <div style={{
      flex: "1 1 200px",
      minWidth: 180,
      maxWidth: 280,
      background: "rgba(15,23,42,0.45)",
      border: "1px solid rgba(51,65,85,0.5)",
      borderRadius: 7,
      padding: "8px 10px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1" }}>
          {cat.emoji} {cat.label}
        </span>
        <span style={{ fontSize: 10, color: "#64748b" }}>{total.toLocaleString()}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {items.map((s) => {
          const active = s.symbol === activeSym;
          return (
            <button
              key={s.symbol}
              onClick={() => onPick(s.symbol)}
              title={`${s.symbol}: ${s.total} jobs · 7d +${s.posted_7d} · 30d +${s.posted_30d}`}
              style={{
                fontSize: 10.5, fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 4,
                border: `1px solid ${active ? "rgba(96,165,250,0.55)" : "rgba(51,65,85,0.55)"}`,
                background: active ? "rgba(96,165,250,0.20)" : "rgba(51,65,85,0.20)",
                color: active ? "#93c5fd" : "#cbd5e1",
                cursor: "pointer",
                lineHeight: 1.4,
              }}
            >
              {s.symbol}
              <span style={{ opacity: 0.55, fontWeight: 500, marginLeft: 4 }}>{s.total}</span>
            </button>
          );
        })}
      </div>
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
        const active: JobSummary[] = (d.summaries ?? []).filter(
          (s: JobSummary) => (s.total ?? 0) > 0
        );
        setSummaries(active);
        if (active.length > 0) setActiveSym(active[0].symbol);
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const current = summaries.find((s) => s.symbol === activeSym) ?? null;

  // 没匹配到任何分类的标的 → 归入"其他"
  const knownSet = new Set(CATEGORIES.flatMap((c) => c.symbols));
  const others = summaries.filter((s) => !knownSet.has(s.symbol));
  const cats: Category[] = others.length
    ? [...CATEGORIES, { emoji: "📦", label: "其他", symbols: others.map((s) => s.symbol) }]
    : CATEGORIES;

  return (
    <div style={{
      marginTop: 24, marginBottom: 32,
      padding: "14px 18px",
      background: "rgba(15,23,42,0.3)",
      border: "1px solid rgba(51,65,85,0.4)",
      borderRadius: 10,
      maxWidth: 1200,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>
          📋 招聘动态分析
        </h3>
        <span style={{ fontSize: 11, color: "#64748b" }}>
          基于公开招聘数据，每日自动同步 · 共 {summaries.length} 个标的
        </span>
      </div>

      {loading ? (
        <div style={{ color: "#64748b", fontSize: 12, padding: "20px 0" }}>加载中…</div>
      ) : summaries.length === 0 ? (
        <div style={{ color: "#64748b", fontSize: 12, padding: "20px 0" }}>
          暂无数据，请运行 /api/cron/refresh-jobs 触发首次抓取。
        </div>
      ) : (
        <>
          {/* 分类小卡片，一行排开（自动换行） */}
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 8,
            marginBottom: 14,
          }}>
            {cats.map((cat) => (
              <CategoryMiniCard
                key={cat.label}
                cat={cat}
                summaries={summaries}
                activeSym={activeSym}
                onPick={setActiveSym}
              />
            ))}
          </div>

          {/* 当前选中标的的详细分析 */}
          {current && <SummaryCard s={current} />}
        </>
      )}
    </div>
  );
}
