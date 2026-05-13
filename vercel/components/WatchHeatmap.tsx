"use client";
import { useMemo, useRef, useState, useEffect } from "react";

type Ticker = {
  symbol: string;
  display_name?: string;
  market_cap?: number | null;
  change_pct?: number | null;
};

type Rect = { x: number; y: number; w: number; h: number };
type Item = { t: Ticker; value: number; area?: number };

/** Color by % change (matching common treemap conventions) */
function colorForPct(pct: number | null | undefined): string {
  if (pct == null) return "#475569";
  if (pct <= -5)   return "#7f1d1d";
  if (pct <= -2)   return "#b91c1c";
  if (pct <= -0.5) return "#dc2626";
  if (pct <  0)    return "#ef4444";
  if (pct <  0.5)  return "#475569";  // ~flat = gray
  if (pct <  2)    return "#16a34a";
  if (pct <  5)    return "#22c55e";
  return "#15803d";
}

/** Squarified treemap algorithm (simplified). Returns Map<item index, rect>. */
function squarify(items: Item[], outerW: number, outerH: number): Rect[] {
  if (items.length === 0) return [];
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return items.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  const area = outerW * outerH;
  const scaled = items.map((i) => ({ ...i, area: (i.value / total) * area }));
  const out: Rect[] = items.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));

  function worst(row: number[], rowSum: number, shortLen: number): number {
    let maxR = 0;
    for (const a of row) {
      const r = Math.max((shortLen * shortLen * a) / (rowSum * rowSum), (rowSum * rowSum) / (shortLen * shortLen * a));
      if (r > maxR) maxR = r;
    }
    return maxR;
  }

  function layout(indices: number[], rect: Rect) {
    if (indices.length === 0) return;
    if (indices.length === 1) { out[indices[0]] = rect; return; }
    const shortLen = Math.min(rect.w, rect.h);
    const isWide = rect.w >= rect.h;
    // Greedy: keep adding until worst-aspect-ratio gets worse
    let bestCount = 1;
    let row = [scaled[indices[0]].area];
    let rowSum = row[0];
    let curWorst = worst(row, rowSum, shortLen);
    for (let i = 1; i < indices.length; i++) {
      const a = scaled[indices[i]].area;
      const newRow = [...row, a];
      const newSum = rowSum + a;
      const newWorst = worst(newRow, newSum, shortLen);
      if (newWorst <= curWorst) {
        row = newRow; rowSum = newSum; curWorst = newWorst; bestCount = i + 1;
      } else break;
    }
    // Lay out [0..bestCount) along the short side
    const longLen = rowSum / shortLen;
    let off = 0;
    for (let i = 0; i < bestCount; i++) {
      const a = scaled[indices[i]].area;
      const seg = a / longLen;
      if (isWide) {
        out[indices[i]] = { x: rect.x, y: rect.y + off, w: longLen, h: seg };
        off += seg;
      } else {
        out[indices[i]] = { x: rect.x + off, y: rect.y, w: seg, h: longLen };
        off += seg;
      }
    }
    // Recurse on remainder
    const restRect: Rect = isWide
      ? { x: rect.x + longLen, y: rect.y, w: rect.w - longLen, h: rect.h }
      : { x: rect.x, y: rect.y + longLen, w: rect.w, h: rect.h - longLen };
    layout(indices.slice(bestCount), restRect);
  }

  // Sort items by value desc, but keep track of original order
  const order = items.map((_, i) => i).sort((a, b) => scaled[b].area - scaled[a].area);
  layout(order, { x: 0, y: 0, w: outerW, h: outerH });
  return out;
}

export default function WatchHeatmap({ tickers, title = "📊 观察标的热力图" }: {
  tickers: Ticker[];
  title?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1100);
  const HEIGHT = 460;

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setWidth(Math.max(300, e.contentRect.width));
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const valid = useMemo(() => tickers.filter((t) => t.market_cap && t.market_cap > 0), [tickers]);

  const stats = useMemo(() => {
    let up = 0, dn = 0;
    let maxAbs = { sym: "", pct: 0 };
    for (const t of tickers) {
      const p = t.change_pct;
      if (p == null) continue;
      if (p > 0) up++;
      else if (p < 0) dn++;
      if (Math.abs(p) > Math.abs(maxAbs.pct)) maxAbs = { sym: t.symbol, pct: p };
    }
    return { up, dn, maxAbs };
  }, [tickers]);

  const rects = useMemo(() => {
    if (valid.length === 0) return [];
    const items: Item[] = valid.map((t) => ({ t, value: t.market_cap! }));
    return squarify(items, width, HEIGHT);
  }, [valid, width]);

  return (
    <div style={{
      marginTop: 24, marginBottom: 24,
      padding: "12px 14px",
      background: "rgba(15,23,42,0.4)",
      border: "1px solid rgba(51,65,85,0.5)",
      borderRadius: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{title}</h3>
        <div style={{ display: "flex", gap: 12, fontSize: 11, alignItems: "center" }}>
          <span style={{ color: "#86efac", border: "1px solid rgba(34,197,94,0.5)", padding: "2px 8px", borderRadius: 4 }}>
            上涨 {stats.up}
          </span>
          <span style={{ color: "#fca5a5", border: "1px solid rgba(239,68,68,0.5)", padding: "2px 8px", borderRadius: 4 }}>
            下跌 {stats.dn}
          </span>
          {stats.maxAbs.sym && (
            <span style={{ color: "#94a3b8" }}>
              波动最大 <span style={{ color: stats.maxAbs.pct >= 0 ? "#86efac" : "#fca5a5", fontWeight: 700 }}>
                {stats.maxAbs.sym} {stats.maxAbs.pct >= 0 ? "+" : ""}{stats.maxAbs.pct.toFixed(2)}%
              </span>
            </span>
          )}
          <span style={{ color: "#64748b" }}>面积按市值</span>
        </div>
      </div>
      <div
        ref={containerRef}
        style={{ position: "relative", width: "100%", height: HEIGHT, overflow: "hidden", borderRadius: 6 }}
      >
        {valid.length === 0 && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "#64748b", fontSize: 12,
          }}>
            当前赛道暂无市值数据
          </div>
        )}
        {valid.map((t, i) => {
          const r = rects[i];
          if (!r || r.w < 8 || r.h < 8) return null;
          const pct = t.change_pct;
          const color = colorForPct(pct);
          const fontSize = Math.max(10, Math.min(28, Math.sqrt(r.w * r.h) / 9));
          const pctFontSize = Math.max(9, Math.min(16, fontSize * 0.55));
          const showText = r.w >= 35 && r.h >= 30;
          return (
            <div
              key={t.symbol}
              title={`${t.symbol}${t.display_name ? " · " + t.display_name : ""}\n市值: ${formatMcap(t.market_cap!)}\n涨跌: ${pct == null ? "—" : (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%"}`}
              style={{
                position: "absolute",
                left: r.x, top: r.y, width: r.w, height: r.h,
                background: color,
                border: "1px solid rgba(15,23,42,0.7)",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                color: "#fff",
                overflow: "hidden",
                fontWeight: 700,
                textShadow: "0 1px 2px rgba(0,0,0,0.4)",
                lineHeight: 1.1,
              }}
            >
              {showText && (
                <>
                  <div style={{ fontSize, letterSpacing: "-0.02em" }}>{t.symbol}</div>
                  {pct != null && (
                    <div style={{ fontSize: pctFontSize, fontWeight: 600, opacity: 0.95, marginTop: 2 }}>
                      {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatMcap(v: number): string {
  if (v >= 1e12) return (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9)  return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6)  return (v / 1e6).toFixed(0) + "M";
  return v.toFixed(0);
}
