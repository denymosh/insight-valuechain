"use client";
import { useEffect, useMemo, useState } from "react";

type Job = {
  symbol: string;
  req_id: string;
  title: string;
  location: string | null;
  country: string | null;
  dept: string | null;
  posted_date: string;  // YYYY-MM-DD
  url: string;
};

const PAGE_SIZE = 50;

function daysAgo(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z").getTime();
  const today = Date.now();
  const diff = Math.max(0, Math.floor((today - d) / 86400000));
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  if (diff < 7) return `${diff}天前`;
  if (diff < 14) return "1周前";
  if (diff < 30) return `${Math.floor(diff / 7)}周前`;
  return `${diff}天前`;
}

function deptColor(dept: string | null): { fg: string; bg: string } {
  if (!dept) return { fg: "#94a3b8", bg: "rgba(148,163,184,0.10)" };
  const d = dept.toLowerCase();
  if (d.includes("r&d") || d.includes("research") || d.includes("engineering"))
    return { fg: "#86efac", bg: "rgba(34,197,94,0.12)" };
  if (d.includes("sales") || d.includes("marketing"))
    return { fg: "#fdba74", bg: "rgba(251,146,60,0.12)" };
  if (d.includes("finance") || d.includes("hr") || d.includes("corporate"))
    return { fg: "#93c5fd", bg: "rgba(96,165,250,0.12)" };
  if (d.includes("customer") || d.includes("support") || d.includes("services"))
    return { fg: "#c4b5fd", bg: "rgba(167,139,250,0.12)" };
  return { fg: "#cbd5e1", bg: "rgba(148,163,184,0.10)" };
}

export default function RecentJobsCard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [filterSym, setFilterSym] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/jobs?days=30&limit=500")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setJobs(d.jobs ?? []);
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const symbols = useMemo(() => {
    const s = new Set(jobs.map((j) => j.symbol));
    return Array.from(s).sort();
  }, [jobs]);

  const filtered = useMemo(
    () => (filterSym ? jobs.filter((j) => j.symbol === filterSym) : jobs),
    [jobs, filterSym]
  );

  const visible = filtered.slice(0, shown);

  return (
    <div style={{
      marginTop: 24, marginBottom: 32,
      background: "rgba(15,23,42,0.4)",
      border: "1px solid rgba(51,65,85,0.5)",
      borderRadius: 10,
      padding: "16px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>
            📋 最近招聘动态
          </h3>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            近 30 天 · 按发布日期排序
          </span>
        </div>
        {symbols.length > 1 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              onClick={() => { setFilterSym(null); setShown(PAGE_SIZE); }}
              style={chipStyle(filterSym === null)}
            >全部</button>
            {symbols.map((s) => (
              <button
                key={s}
                onClick={() => { setFilterSym(s); setShown(PAGE_SIZE); }}
                style={chipStyle(filterSym === s)}
              >{s}</button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ color: "#64748b", fontSize: 12, padding: "20px 0" }}>加载中…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "#64748b", fontSize: 12, padding: "20px 0" }}>
          暂无数据。请确认 cron 已运行（/api/cron/refresh-jobs）。
        </div>
      ) : (
        <>
          <div style={{ overflow: "hidden" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "60px 70px 1fr 180px 120px 24px",
              gap: 10,
              padding: "6px 0",
              fontSize: 10, color: "#64748b",
              borderBottom: "1px solid rgba(51,65,85,0.4)",
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              <div>标的</div>
              <div>发布</div>
              <div>职位</div>
              <div>地点</div>
              <div>部门</div>
              <div></div>
            </div>
            {visible.map((j) => {
              const dc = deptColor(j.dept);
              return (
                <a
                  key={`${j.symbol}-${j.req_id}`}
                  href={j.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "60px 70px 1fr 180px 120px 24px",
                    gap: 10, alignItems: "center",
                    padding: "8px 0",
                    fontSize: 12,
                    color: "#cbd5e1",
                    textDecoration: "none",
                    borderBottom: "1px solid rgba(51,65,85,0.2)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(51,65,85,0.20)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{
                    fontWeight: 700, fontSize: 11,
                    color: "#93c5fd",
                    background: "rgba(96,165,250,0.14)",
                    padding: "2px 6px", borderRadius: 4,
                    textAlign: "center",
                  }}>{j.symbol}</span>
                  <span style={{ color: "#94a3b8", fontSize: 11 }}>
                    {daysAgo(j.posted_date)}
                  </span>
                  <span style={{
                    fontWeight: 500,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }} title={j.title}>{j.title}</span>
                  <span style={{
                    color: "#94a3b8", fontSize: 11,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }} title={j.location ?? ""}>
                    {j.location ?? "—"}
                  </span>
                  <span>
                    {j.dept ? (
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        color: dc.fg, background: dc.bg,
                        padding: "2px 7px", borderRadius: 4,
                        whiteSpace: "nowrap",
                      }}>{j.dept}</span>
                    ) : null}
                  </span>
                  <span style={{ color: "#475569", fontSize: 14, textAlign: "right" }}>→</span>
                </a>
              );
            })}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: "#64748b", textAlign: "center" }}>
            显示 {visible.length} / {filtered.length} 条
            {visible.length < filtered.length && (
              <button
                onClick={() => setShown(shown + PAGE_SIZE)}
                style={{
                  marginLeft: 12,
                  background: "transparent",
                  border: "1px solid rgba(96,165,250,0.4)",
                  color: "#93c5fd",
                  padding: "3px 12px",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >加载更多</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 600,
    padding: "3px 9px",
    borderRadius: 4,
    border: `1px solid ${active ? "rgba(96,165,250,0.55)" : "rgba(51,65,85,0.5)"}`,
    background: active ? "rgba(96,165,250,0.18)" : "transparent",
    color: active ? "#93c5fd" : "#94a3b8",
    cursor: "pointer",
  };
}
