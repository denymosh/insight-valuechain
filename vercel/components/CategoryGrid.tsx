"use client";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, CellValueChangedEvent, RowSelectedEvent, RowDragEndEvent } from "ag-grid-community";
import { useMemo, CSSProperties } from "react";

// ---------- helpers ----------
const num = (v: any, d = 2) => (v == null || isNaN(v) ? "—" : Number(v).toFixed(d));
const fmtMcap = (v: any) => {
  if (v == null) return "—";
  const n = Number(v);
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  return n.toFixed(0);
};

const rsiColor = (v: number | null | undefined) => {
  if (v == null) return "#94a3b8";
  if (v >= 80) return "#ef4444";
  if (v >= 70) return "#fb923c";
  if (v <= 20) return "#2563eb";
  if (v <= 30) return "#60a5fa";
  return "#cbd5e1";
};
const rsiBg = (v: number | null | undefined) => {
  if (v == null) return undefined;
  if (v >= 80 || v <= 20) return "rgba(239, 68, 68, 0.12)";
  if (v >= 70 || v <= 30) return "rgba(251, 146, 60, 0.10)";
  return undefined;
};
const emaNear = (price: number | null | undefined, ema: number | null | undefined) =>
  !!(price && ema) && Math.abs(price - ema) / price <= 0.015;
const upDown = (v: number | null | undefined) =>
  v == null ? "#94a3b8" : v >= 0 ? "#22c55e" : "#ef4444";
const wsColor = (v: number | null | undefined) => {
  if (v == null) return "#94a3b8";
  if (v <= 1.5) return "#22c55e";
  if (v <= 2.5) return "#86efac";
  if (v <= 3.5) return "#fbbf24";
  if (v <= 4.5) return "#fb923c";
  return "#ef4444";
};

// shared cell wrapper
const cellBase: CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: "100%",
  fontVariantNumeric: "tabular-nums",
};
const cellRight: CSSProperties = { ...cellBase, justifyContent: "flex-end", paddingRight: 8 };
const cellCenter: CSSProperties = { ...cellBase, justifyContent: "center" };
const cellLeft: CSSProperties = { ...cellBase, justifyContent: "flex-start", paddingLeft: 4 };

// ---------- renderers ----------
const earningsTimeLabel = (t: string) => t === "bmo" ? "盘前" : t === "amc" ? "盘后" : "";
const earningsBadgeColor = (days: number) =>
  days <= 3  ? { fg: "#fca5a5", bg: "rgba(239,68,68,0.15)", bd: "rgba(239,68,68,0.50)" } :
  days <= 14 ? { fg: "#fdba74", bg: "rgba(251,146,60,0.13)", bd: "rgba(251,146,60,0.45)" } :
               { fg: "#93c5fd", bg: "rgba(96,165,250,0.12)", bd: "rgba(96,165,250,0.40)" };

const SymbolCell = (p: any) => {
  const d = p.data;
  const er = d.quote?.next_earnings;
  const erColor = er ? earningsBadgeColor(er.days) : null;
  // format "M/D" from "YYYY-MM-DD"
  const erShort = er ? (() => {
    const parts = er.date.split("-");
    return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`;
  })() : "";
  return (
    <div style={{ ...cellLeft, paddingLeft: 16 }}>
      <div style={{ lineHeight: 1.25 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>{d.symbol}</div>
        {d.display_name && (
          <a
            href={`https://finance.yahoo.com/quote/${encodeURIComponent(d.symbol)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 11, color: "#64748b", marginTop: 4, display: "inline-block", textDecoration: "none" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#60a5fa"; (e.currentTarget as HTMLAnchorElement).style.textDecoration = "underline"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#64748b"; (e.currentTarget as HTMLAnchorElement).style.textDecoration = "none"; }}
          >
            {d.display_name}
          </a>
        )}
        {er && erColor && (
          <div style={{ marginTop: 4 }}>
            <span
              title={`下次财报: ${er.date}${er.time !== "unknown" ? " (" + earningsTimeLabel(er.time) + ")" : ""} · ${er.days} 天后`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontSize: 10, fontWeight: 600,
                color: erColor.fg, background: erColor.bg,
                border: `1px solid ${erColor.bd}`,
                padding: "1px 6px", borderRadius: 4,
                letterSpacing: "0.02em",
              }}>
              <span style={{ fontSize: 9 }}>📅</span>
              <span>财报 {erShort}</span>
              {er.time !== "unknown" && (
                <span style={{ opacity: 0.75 }}>{earningsTimeLabel(er.time)}</span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

const PriceCell = (p: any) => {
  const q = p.data?.quote;
  const last = q?.last ?? q?.prev_close;
  const color = upDown(q?.change_pct);
  return (
    <div style={cellCenter}>
      <span style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: "-0.02em" }}>
        {last != null ? `$${num(last)}` : "—"}
      </span>
    </div>
  );
};

const PctCell = (p: any) => {
  const v = p.value;
  return (
    <div style={cellCenter}>
      <span style={{ fontSize: 14, fontWeight: 600, color: upDown(v) }}>
        {v == null ? "—" : `${v >= 0 ? "+" : ""}${num(v)}%`}
      </span>
    </div>
  );
};

// Sparkline of today's 15-minute closes across pre / reg / post.
// Pre & post are drawn at reduced opacity with a subtle background tint;
// reg is full opacity. Color follows day's overall direction.
const SparklineCell = (p: any) => {
  const q = p.data?.quote;
  const bars: { t: number; c: number; s: "pre" | "reg" | "post" }[] = q?.intraday_15m || [];
  const W = 92, H = 32, pad = 2;
  if (!bars || bars.length < 2) {
    return <div style={cellCenter}><span style={{ fontSize: 10, color: "#475569" }}>—</span></div>;
  }
  const closes = bars.map(b => b.c);
  const min = Math.min(...closes), max = Math.max(...closes);
  const range = max - min || 1;
  const xStep = (W - pad * 2) / (bars.length - 1);
  const yOf = (c: number) => pad + (H - pad * 2) * (1 - (c - min) / range);
  const xOf = (i: number) => pad + i * xStep;
  // Direction color from first to last
  const positive = closes[closes.length - 1] >= closes[0];
  const lineColor = positive ? "#22c55e" : "#ef4444";
  // Draw three poly-segments (one per session) so opacity differs.
  type Seg = { s: "pre" | "reg" | "post"; pts: string[]; xStart: number; xEnd: number };
  const segs: Seg[] = [];
  let cur: Seg | null = null;
  bars.forEach((b, i) => {
    const x = xOf(i), y = yOf(b.c);
    if (!cur || cur.s !== b.s) {
      // start a new segment but include the previous point so segments connect
      if (cur && i > 0) {
        const prev = bars[i - 1];
        cur.pts.push(`${xOf(i - 1).toFixed(1)},${yOf(prev.c).toFixed(1)}`);
        cur.xEnd = xOf(i - 1);
      }
      cur = { s: b.s, pts: [], xStart: x, xEnd: x };
      segs.push(cur);
    }
    cur.pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    cur.xEnd = x;
  });
  // Pre/post drawn at lower opacity, with light background bands.
  const opa = (s: string) => (s === "reg" ? 1 : 0.45);
  const bandFill = (s: string) =>
    s === "pre" ? "rgba(148,163,184,0.07)" :
    s === "post" ? "rgba(148,163,184,0.07)" :
    "transparent";
  return (
    <div style={cellCenter}>
      <svg width={W} height={H} style={{ display: "block" }}>
        {/* session background bands */}
        {segs.map((sg, i) => (
          <rect key={"bg" + i}
            x={sg.xStart - xStep / 2}
            y={0}
            width={Math.max(0, sg.xEnd - sg.xStart + xStep)}
            height={H}
            fill={bandFill(sg.s)}
          />
        ))}
        {/* polylines */}
        {segs.map((sg, i) => (
          <polyline key={"ln" + i}
            points={sg.pts.join(" ")}
            fill="none"
            stroke={lineColor}
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={opa(sg.s)}
          />
        ))}
      </svg>
    </div>
  );
};

// IV percentile badge — blue (low) → green → yellow → orange → red (high)
// IV / Rank cell — top: IV Rank badge (大), bottom: IV value (小)
const IvPctCell = (p: any) => {
  const rank = p.value;                  // iv_rank (0–100), 主显示
  const iv   = p.data?.quote?.iv;        // 当前 IV (%)
  const pct  = p.data?.quote?.iv_pct;    // IV Percentile (tooltip 用)
  if (rank == null && iv == null) return <div style={cellCenter}><span style={{ color: "#475569" }}>—</span></div>;
  // 没 rank 但有 iv — 只显示 iv
  if (rank == null) {
    return (
      <div style={cellCenter}>
        <div style={{ textAlign: "center", lineHeight: 1.2 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>—</div>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>IV {num(iv, 1)}%</div>
        </div>
      </div>
    );
  }
  // 颜色按 IV Rank 分级（蓝→绿→黄→橙→红）
  let fg = "#93c5fd", bg = "rgba(96,165,250,0.12)", bd = "rgba(96,165,250,0.38)";
  if      (rank >= 80) { fg = "#fca5a5"; bg = "rgba(239,68,68,0.16)";  bd = "rgba(239,68,68,0.45)"; }
  else if (rank >= 60) { fg = "#fdba74"; bg = "rgba(251,146,60,0.14)"; bd = "rgba(251,146,60,0.40)"; }
  else if (rank >= 40) { fg = "#fde68a"; bg = "rgba(250,204,21,0.12)"; bd = "rgba(250,204,21,0.38)"; }
  else if (rank >= 20) { fg = "#86efac"; bg = "rgba(34,197,94,0.10)";  bd = "rgba(34,197,94,0.30)"; }
  const tip = `IV Rank: ${num(rank, 0)}（52 周内当前 IV 排名）` +
              (pct != null ? `\nIV Percentile: ${num(pct, 0)}%` : "") +
              (iv  != null ? `\n当前 IV: ${num(iv, 1)}%` : "");
  return (
    <div style={cellCenter}>
      <div style={{ textAlign: "center", lineHeight: 1.2 }}>
        <span
          style={{
            display: "inline-block",
            fontSize: 16, fontWeight: 800, color: fg,
            background: bg, border: `1px solid ${bd}`,
            padding: "3px 10px", borderRadius: 6,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.01em",
          }}
          title={tip}
        >
          {num(rank, 0)}
        </span>
        {iv != null && (
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 3 }}>
            IV {num(iv, 1)}%
          </div>
        )}
      </div>
    </div>
  );
};

// stacked: top "+$change", bottom "+chg%"
const ChangeStackedCell = (p: any) => {
  const q = p.data?.quote;
  const chg = q?.change;
  const pct = q?.change_pct;
  const color = upDown(pct);
  return (
    <div style={cellCenter}>
      <div style={{ textAlign: "center", lineHeight: 1.2 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color }}>
          {pct == null ? "—" : `${pct >= 0 ? "+" : ""}${num(pct)}%`}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color, opacity: 0.75, marginTop: 2 }}>
          {chg == null ? "" : `${chg >= 0 ? "+" : "-"}$${num(Math.abs(chg))}`}
        </div>
      </div>
    </div>
  );
};

const PlainCell = (formatter: (v: any) => string, opts?: { color?: string; bold?: boolean }) =>
  (p: any) => (
    <div style={cellCenter}>
      <span style={{ fontSize: 14, fontWeight: opts?.bold ? 600 : 500, color: opts?.color || "#cbd5e1" }}>
        {formatter(p.value)}
      </span>
    </div>
  );

// 3 tiers shown: 小 < $2B | 中 $2B–$10B | 大 $10B–$200B
// 巨型 (≥ $200B) is omitted from the bar by design.
const MCAP_LABELS = ["小", "中", "大"];
const MCAP_SHADES = [
  "rgba(56,189,248,0.35)",
  "rgba(56,189,248,0.65)",
  "rgba(56,189,248,1.00)",
];

const mcapTierIdx = (v: number | null | undefined): number => {
  if (v == null) return -1;
  if (v >= 2e11) return -1;  // 巨型: no bar
  if (v >= 1e10) return 2;
  if (v >= 2e9)  return 1;
  return 0;
};

// Combined PE: ttm / fwd (similar to EMA 50/200 layout)
const PeCombinedCell = (p: any) => {
  const q = p.data?.quote;
  const ttm = q?.pe_ttm;
  const fwd = q?.pe_fwd;
  const fmt = (v: any) => {
    if (v == null || v <= 0) return "—";
    return v >= 100 ? Number(v).toFixed(0) : Number(v).toFixed(2);
  };
  return (
    <div style={cellCenter}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>
        <span style={{ color: "#cbd5e1" }}>{fmt(ttm)}</span>
        <span style={{ color: "#475569", margin: "0 5px" }}>/</span>
        <span style={{ color: "#94a3b8" }}>{fmt(fwd)}</span>
      </div>
    </div>
  );
};

const McapCell = (p: any) => {
  const v = p.value;
  const idx = mcapTierIdx(v);
  return (
    <div style={cellCenter}>
      <div style={{ textAlign: "center", lineHeight: 1.2 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1" }}>{fmtMcap(v)}</div>
        {idx >= 0 && (
          <div style={{ display: "flex", gap: 2, marginTop: 5, justifyContent: "center" }}
               title={`${MCAP_LABELS[idx]}型`}>
            {MCAP_SHADES.map((sh, i) => (
              <span key={i} style={{
                width: 12, height: 4, borderRadius: 1,
                background: i <= idx ? sh : "#1f2937",
              }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
const PeCell = (p: any) => {
  const q = p.data?.quote;
  const ttm = q?.pe_ttm;
  const valid = ttm != null && ttm > 0;
  return (
    <div style={cellCenter}>
      <span style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1" }}>
        {valid ? num(ttm, ttm >= 100 ? 0 : 2) : "—"}
      </span>
    </div>
  );
};
const PsCell = PlainCell((v) => num(v, 2));
const PctNeutralCell = PlainCell((v) => (v == null ? "—" : `${num(v, 1)}%`));

const FromHighCell = (p: any) => {
  const q = p.data?.quote;
  const hi = q?.high_52w;
  const last = q?.last ?? q?.prev_close;
  if (hi == null || !last) return <div style={cellCenter}><span style={{ color: "#64748b" }}>—</span></div>;
  const diff = ((last - hi) / hi) * 100;
  // At or above 52w high → highlight as "new high" badge instead of confusing +0.x%
  if (diff >= -0.05) {
    return (
      <div style={cellCenter}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 12, fontWeight: 700, color: "#86efac",
          background: "rgba(34,197,94,0.18)",
          border: "1px solid rgba(34,197,94,0.55)",
          padding: "3px 9px",
          borderRadius: 6,
          letterSpacing: "0.02em",
        }} title={`52周新高 (${num(hi, 2)})`}>
          <span style={{ fontSize: 10 }}>★</span>
          新高
        </span>
      </div>
    );
  }
  // tiered palette — distinct from the change column (which uses plain red/green text)
  let fg = "#86efac", bg = "rgba(34,197,94,0.16)", bd = "rgba(34,197,94,0.45)";
  if (diff < -25)      { fg = "#fecaca"; bg = "rgba(239,68,68,0.22)";  bd = "rgba(239,68,68,0.55)"; }
  else if (diff < -10) { fg = "#fdba74"; bg = "rgba(251,146,60,0.18)"; bd = "rgba(251,146,60,0.50)"; }
  else if (diff < -2)  { fg = "#fde68a"; bg = "rgba(250,204,21,0.16)"; bd = "rgba(250,204,21,0.45)"; }
  return (
    <div style={cellCenter}>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: 13, fontWeight: 700, color: fg,
        background: bg,
        border: `1px solid ${bd}`,
        padding: "3px 9px",
        borderRadius: 6,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "-0.01em",
      }}>
        <span style={{ fontSize: 9, opacity: 0.85 }}>▼</span>
        {`${num(Math.abs(diff), 1)}%`}
      </span>
    </div>
  );
};

const TargetCell = (p: any) => {
  const q = p.data?.quote;
  const tp = q?.target_price;
  const last = q?.last ?? q?.prev_close;
  const upside = tp != null && last ? ((tp - last) / last) * 100 : null;
  const upColor = upside == null ? "#94a3b8" : upside >= 0 ? "#22c55e" : "#ef4444";
  return (
    <div style={cellCenter}>
      <div style={{ textAlign: "center", lineHeight: 1.2 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1" }}>
          {tp == null ? "—" : `$${num(tp)}`}
        </div>
        {upside != null && (
          <div style={{ fontSize: 10, fontWeight: 600, color: upColor, marginTop: 2 }}>
            {`${upside >= 0 ? "+" : ""}${num(upside, 1)}%`}
          </div>
        )}
      </div>
    </div>
  );
};

const WsCell = (p: any) => {
  const q = p.data?.quote;
  const v = q?.ws_rating;
  const label = q?.ws_rating_label;
  return (
    <div style={cellCenter}>
      <div style={{ textAlign: "center", lineHeight: 1.15 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: wsColor(v) }}>{num(v, 2)}</div>
        {label && <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{label}</div>}
      </div>
    </div>
  );
};

// EMA single-line: 50  73.50  /  200  60.78
const EmaCell = (p: any) => {
  const q = p.data?.quote;
  const price = q?.last ?? q?.prev_close;
  const e50 = q?.ema50, e200 = q?.ema200;
  const seg = (near: boolean): CSSProperties => near
    ? { background: "rgba(250, 204, 21, 0.18)", padding: "1px 4px", borderRadius: 3, color: "#facc15" }
    : { color: "#cbd5e1" };
  return (
    <div style={cellCenter}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>
        <span style={seg(emaNear(price, e50))}>{num(e50, 1)}</span>
        <span style={{ color: "#475569", margin: "0 5px" }}>/</span>
        <span style={seg(emaNear(price, e200))}>{num(e200, 1)}</span>
      </div>
    </div>
  );
};

// merged: top big "47.5 / 54.5" + sub-line "月 69 周 59 日 54"
const RsiCombinedCell = (p: any) => {
  const q = p.data?.quote;
  const r6 = q?.rsi6, r14 = q?.rsi14;
  const bg = rsiBg(r6) || rsiBg(r14);
  const sub = (label: string, v: number | null | undefined) => (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 3 }}>
      <span style={{ color: "#64748b", fontSize: 10 }}>{label}</span>
      <span style={{ color: rsiColor(v), fontWeight: 700, fontSize: 12 }}>{num(v, 0)}</span>
    </span>
  );
  return (
    <div style={cellCenter}>
      <div style={{
        background: bg, padding: "5px 10px", borderRadius: 6,
        textAlign: "center", lineHeight: 1.2,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>
          <span style={{ color: rsiColor(r6) }}>{num(r6, 1)}</span>
          <span style={{ color: "#475569", margin: "0 5px" }}>/</span>
          <span style={{ color: rsiColor(r14) }}>{num(r14, 1)}</span>
        </div>
        <div style={{ marginTop: 3, display: "flex", justifyContent: "center", gap: 9 }}>
          {sub("月", q?.rsi_m)}
          {sub("周", q?.rsi_w)}
          {sub("日", q?.rsi_d)}
        </div>
      </div>
    </div>
  );
};

const STATUS_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  watch:   { label: "观察", bg: "rgba(148,163,184,0.18)", fg: "#cbd5e1" },
  target:  { label: "目标", bg: "rgba(59,130,246,0.20)",  fg: "#93c5fd" },
  holding: { label: "持有", bg: "rgba(34,197,94,0.22)",   fg: "#86efac" },
  sold:    { label: "已出", bg: "rgba(168,85,247,0.20)",  fg: "#d8b4fe" },
};
const StatusCell = (p: any) => {
  const s = STATUS_STYLE[p.value] || STATUS_STYLE.watch;
  return (
    <div style={cellCenter}>
      <span style={{
        background: s.bg, color: s.fg,
        padding: "3px 12px", borderRadius: 999,
        fontSize: 12, fontWeight: 600,
      }}>{s.label}</span>
    </div>
  );
};

const TagsCell = (p: any) => {
  const auto: string[] = p.data?.auto_tags || [];
  const userTags = String(p.value || "").split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <div style={{ ...cellLeft, paddingLeft: 6 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "center" }}>
        {auto.map((t, i) => (
          <span key={"a" + i} style={{
            fontSize: 10, padding: "1px 6px", borderRadius: 8,
            background: "rgba(96,165,250,0.14)", color: "#93c5fd",
            fontWeight: 500, lineHeight: 1.4,
          }}>{t}</span>
        ))}
        {userTags.map((t, i) => (
          <span key={"u" + i} style={{
            fontSize: 10, padding: "1px 6px", borderRadius: 8,
            background: "rgba(148,163,184,0.12)", color: "#cbd5e1",
            lineHeight: 1.4,
          }}>{t}</span>
        ))}
      </div>
    </div>
  );
};

const TrioStateCell = (p: any) => {
  const q = p.data?.quote;
  const dot = (state: boolean | null | undefined, label: string, tip: string) => {
    const color = state == null ? "#475569" : state ? "#22c55e" : "#475569";
    const ring = state ? "0 0 0 2px rgba(34,197,94,0.18)" : "none";
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }} title={tip}>
        <span style={{
          width: 10, height: 10, borderRadius: "50%",
          background: color, boxShadow: ring, display: "inline-block",
        }} />
        <span style={{ fontSize: 9, color: state ? "#86efac" : "#64748b", fontWeight: 600 }}>{label}</span>
      </div>
    );
  };
  return (
    <div style={cellCenter}>
      <div style={{ display: "flex", gap: 10 }}>
        {dot(q?.m_state, "月", "月线格局: 价格>EMA10>EMA20")}
        {dot(q?.w_state, "周", "周线趋势: 价格>EMA10>EMA20 & MACD>信号")}
        {dot(q?.d_state, "日", "日线操作: 价格>EMA20 & RSI14∈[40,80]")}
      </div>
    </div>
  );
};

const IndustryCell = (p: any) => (
  <div style={{ ...cellLeft, paddingLeft: 18, paddingRight: 14 }}>
    <span style={{
      fontSize: 12, color: "#cbd5e1",
      lineHeight: 1.3,
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      whiteSpace: "normal",
      wordBreak: "break-word",
    }}>{p.value || ""}</span>
  </div>
);

const RowActionsCell = (onDelete: (id: number) => void, onRefresh: (symbol: string) => void) => (p: any) => {
  const q = p.data?.quote;
  const missing = !q || q.ema50 == null || q.high_52w == null || q.rsi14 == null;
  const btn: CSSProperties = {
    cursor: "pointer",
    width: 24, height: 24,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    borderRadius: 4,
    fontSize: 13,
    lineHeight: 1,
  };
  return (
    <div style={{ ...cellCenter, gap: 6 }}>
      {missing && (
        <span
          style={{
            ...btn,
            color: "#fbbf24",
            background: "rgba(251,191,36,0.10)",
            border: "1px solid rgba(251,191,36,0.35)",
          }}
          onClick={(e) => { e.stopPropagation(); onRefresh(p.data.symbol); }}
          title="重新拉取该标的指标"
        >↻</span>
      )}
      <span
        style={{
          ...btn,
          color: "#94a3b8",
          background: "rgba(148,163,184,0.08)",
          border: "1px solid rgba(148,163,184,0.25)",
        }}
        onClick={(e) => { e.stopPropagation(); if (confirm(`删除 ${p.data.symbol}?`)) onDelete(p.data.id); }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.color = "#fca5a5";
          el.style.background = "rgba(239,68,68,0.12)";
          el.style.border = "1px solid rgba(239,68,68,0.40)";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.color = "#94a3b8";
          el.style.background = "rgba(148,163,184,0.08)";
          el.style.border = "1px solid rgba(148,163,184,0.25)";
        }}
        title="删除"
      >✕</span>
    </div>
  );
};

// ---------- main component ----------
export default function CategoryGrid({
  rows,
  onPatch,
  onSelect,
  onDelete,
  onRefresh,
  onReorder,
  selected,
  hideHeader = false,
}: {
  rows: any[];
  onPatch: (id: number, patch: any) => void;
  onSelect: (row: any | null) => void;
  onDelete: (id: number) => void;
  onRefresh: (symbol: string) => void;
  onReorder?: (orderedIds: number[]) => void;
  selected?: any | null;
  hideHeader?: boolean;
}) {
  const numCmp = (a: any, b: any) => (a ?? -Infinity) - (b ?? -Infinity);

  const columnDefs: ColDef[] = useMemo(
    () => [
      { headerName: "标的", field: "symbol", pinned: "left", width: 150, cellRenderer: SymbolCell, editable: true, sortable: true, headerClass: "ag-symbol-header", rowDrag: true },
      { headerName: "产业细分", field: "industry", width: 150, cellRenderer: IndustryCell, editable: true, headerClass: "ag-center-header" },
      { headerName: "市值", colId: "mcap", width: 82, cellRenderer: McapCell,
        valueGetter: (p) => p.data?.quote?.market_cap ?? null, sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { headerName: "价格", colId: "price", width: 125, cellRenderer: PriceCell,
        valueGetter: (p) => p.data?.quote?.last ?? p.data?.quote?.prev_close ?? null, sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { headerName: "涨跌", colId: "chg", width: 98, cellRenderer: ChangeStackedCell,
        valueGetter: (p) => p.data?.quote?.change_pct ?? null, sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { headerName: "IV Rank", colId: "ivp", width: 82, cellRenderer: IvPctCell,
        valueGetter: (p) => p.data?.quote?.iv_rank ?? null, sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { headerName: "走势", colId: "spark", width: 100, cellRenderer: SparklineCell, headerClass: "ag-center-header" },
      { headerName: "5D%", colId: "ret5d", width: 75, cellRenderer: PctCell,
        valueGetter: (p) => p.data?.quote?.return_5d ?? null, sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { headerName: "20D%", colId: "ret20d", width: 80, cellRenderer: PctCell,
        valueGetter: (p) => p.data?.quote?.return_20d ?? null, sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { headerName: "YTD%", colId: "retYtd", width: 80, cellRenderer: PctCell,
        valueGetter: (p) => p.data?.quote?.return_ytd ?? null, sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { headerName: "距高点", colId: "fromHi", width: 85, cellRenderer: FromHighCell,
        valueGetter: (p) => {
          const q = p.data?.quote;
          const hi = q?.high_52w; const last = q?.last ?? q?.prev_close;
          return (hi && last) ? ((last - hi) / hi) * 100 : null;
        },
        sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { headerName: "PE TTM/前瞻", colId: "pe", width: 115, cellRenderer: PeCombinedCell,
        valueGetter: (p) => p.data?.quote?.pe_ttm ?? null, sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { headerName: "市销率", colId: "ps", width: 60, cellRenderer: PsCell,
        valueGetter: (p) => p.data?.quote?.ps_ttm ?? null, sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { headerName: "营收 YoY", colId: "yoy", width: 72, cellRenderer: PctNeutralCell,
        valueGetter: (p) => p.data?.quote?.growth_yoy ?? null, sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { headerName: "预期增长", colId: "fwd", width: 72, cellRenderer: PctNeutralCell,
        valueGetter: (p) => p.data?.quote?.growth_fwd ?? null, sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { headerName: "毛利率", colId: "gm", width: 64, cellRenderer: PctNeutralCell,
        valueGetter: (p) => p.data?.quote?.gross_margin ?? null, sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { headerName: "EBITDA率", colId: "em", width: 76, cellRenderer: PctNeutralCell,
        valueGetter: (p) => p.data?.quote?.ebitda_margin ?? null, sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { headerName: "WS 评级", colId: "ws", width: 88, cellRenderer: WsCell,
        valueGetter: (p) => p.data?.quote?.ws_rating ?? null, sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { headerName: "目标价", colId: "tp", width: 90, cellRenderer: TargetCell,
        valueGetter: (p) => p.data?.quote?.target_price ?? null, sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { headerName: "EMA 50/200", colId: "ema", width: 140, cellRenderer: EmaCell,
        valueGetter: (p) => p.data?.quote?.ema50 ?? null, sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { headerName: "RSI 6/14", colId: "rsi", width: 145, cellRenderer: RsiCombinedCell,
        valueGetter: (p) => p.data?.quote?.rsi14 ?? null, sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { headerName: "月/周/日", colId: "trio", width: 105, cellRenderer: TrioStateCell,
        valueGetter: (p) => {
          const q = p.data?.quote;
          return (q?.m_state ? 1 : 0) + (q?.w_state ? 1 : 0) + (q?.d_state ? 1 : 0);
        },
        sortable: true, comparator: numCmp, headerClass: "ag-center-header" },
      { field: "position_status", headerName: "状态", editable: true, width: 78,
        cellRenderer: StatusCell, headerClass: "ag-center-header",
        cellEditor: "agSelectCellEditor", cellEditorParams: { values: ["watch", "target", "holding", "sold"] } },
      { field: "tags", headerName: "标签", editable: true, width: 100, cellRenderer: TagsCell },
      { headerName: "", colId: "actions", width: 78, pinned: "right", cellRenderer: RowActionsCell(onDelete, onRefresh) },
    ],
    [onDelete, onRefresh]
  );

  const defaultColDef: ColDef = { sortable: false, resizable: true };

  const onCellValueChanged = (e: CellValueChangedEvent) => {
    if (!e.data?.id) return;
    const editable = ["symbol", "display_name", "position_status", "tags", "industry"];
    if (!editable.includes(e.colDef.field as string)) return;
    onPatch(e.data.id, { [e.colDef.field as string]: e.newValue });
  };

  const onRowSelected = (e: RowSelectedEvent) => {
    if (e.node.isSelected()) onSelect(e.data);
  };

  const onRowDragEnd = (e: RowDragEndEvent) => {
    if (!onReorder) return;
    const ids: number[] = [];
    e.api.forEachNode((node) => {
      if (node.data?.id != null) ids.push(node.data.id);
    });
    onReorder(ids);
  };

  const headerHeight = hideHeader ? 0 : 38;
  const rowHeight = 68;
  // explicit container height — autoHeight sometimes fails to remeasure
  // when rowData updates via WS ticks, leaving the grid stuck at header-only
  const gridHeight = headerHeight + rowHeight * Math.max(rows.length, 1) + 2;

  return (
    <div className="ag-theme-quartz-dark cat-grid" style={{ width: "100%", height: gridHeight }}>
      <AgGridReact
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        getRowId={(p) => String(p.data.id)}
        onCellValueChanged={onCellValueChanged}
        rowSelection="single"
        onRowSelected={onRowSelected}
        rowDragManaged={true}
        onRowDragEnd={onRowDragEnd}
        rowHeight={rowHeight}
        headerHeight={headerHeight}
        suppressHorizontalScroll={true}
        enableCellTextSelection={true}
        ensureDomOrder={true}
        animateRows
      />
    </div>
  );
}
