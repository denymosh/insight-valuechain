"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import CategoryPanel from "@/components/CategoryPanel";
import RecentJobsCard from "@/components/RecentJobsCard";
import WatchHeatmap from "@/components/WatchHeatmap";
import { jget, jpost, jpatch, jdel } from "@/lib/api";
import type { Quote } from "@/lib/quote";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, useSortable,
  horizontalListSortingStrategy, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableTab({ id, children }: { id: number; children: any }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        display: "inline-flex",
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

function SortableCat({ id, children }: { id: number | string; children: any }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {children({ attributes, listeners })}
    </div>
  );
}

type Sector = { id: number; name: string; sort_order: number; description?: string };
type Category = { id: number; sector_id: number; name: string; sort_order: number; description?: string };
type Ticker = any;

type Snapshot = { sectors: Sector[]; categories: Category[]; tickers: Ticker[] };

const ALL_KEY = -1;
const UNCAT_KEY = -1;
const POLL_MS = 30_000;

export default function Page() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [selected, setSelected] = useState<Ticker | null>(null);
  const [activeSector, setActiveSector] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const isInputFocused = useRef(false);

  // Track whether user is typing — skip state updates while focused to avoid losing input
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        isInputFocused.current = true;
      }
    };
    const onFocusOut = () => { isInputFocused.current = false; };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  const fetchSnapshot = async (force = false) => {
    try {
      const data = await jget<Snapshot>("/api/snapshot");
      // Don't disrupt the user while they're typing — defer until they stop
      if (!force && isInputFocused.current) return;
      setSectors(data.sectors);
      setCategories(data.categories);
      setTickers(data.tickers);
      setLastUpdated(new Date());
      // pick first sector ONLY on initial mount (functional update avoids stale-closure bug
      // where 30s polling kept resetting activeSector to first sector)
      if (data.sectors.length > 0) {
        setActiveSector((cur) => cur ?? data.sectors[0].id);
      }
    } catch (e) {
      // swallow — next poll will retry
    }
  };

  useEffect(() => {
    fetchSnapshot(true);
    const id = setInterval(() => fetchSnapshot(), POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, []);

  // click outside to dismiss selection
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t) return;
      if (t.closest(".ag-row") || t.closest(".inline-detail") || t.closest(".ag-popup")) return;
      const ae = document.activeElement as HTMLElement | null;
      if (ae && ae.closest(".inline-detail")) ae.blur();
      setSelected(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const enrichedTickers = useMemo(() => {
    const catById = new Map(categories.map((c) => [c.id, c]));
    const secById = new Map(sectors.map((s) => [s.id, s]));
    const tagsBySymbol = new Map<string, string[]>();
    for (const t of tickers) {
      const cat = t.category_id != null ? catById.get(t.category_id) : null;
      const sec = cat ? secById.get(cat.sector_id) : null;
      const set = tagsBySymbol.get(t.symbol) || [];
      if (sec && !set.includes(sec.name)) set.push(sec.name);
      if (cat && !set.includes(cat.name)) set.push(cat.name);
      tagsBySymbol.set(t.symbol, set);
    }
    return tickers.map((t) => ({
      ...t,
      auto_tags: tagsBySymbol.get(t.symbol) || [],
    }));
  }, [tickers, categories, sectors]);

  const tabs = useMemo(() => {
    const list: { id: number; name: string; count: number }[] = sectors.map((s) => ({
      id: s.id,
      name: s.name,
      count: enrichedTickers.filter((t) => {
        const cat = categories.find((c) => c.id === t.category_id);
        return cat?.sector_id === s.id;
      }).length,
    }));
    const uncatCount = enrichedTickers.filter(
      (t) => !t.category_id || !categories.find((c) => c.id === t.category_id)
    ).length;
    if (uncatCount > 0) list.push({ id: ALL_KEY, name: "未分类", count: uncatCount });
    return list;
  }, [sectors, categories, enrichedTickers]);

  const sectorCategories = useMemo(() => {
    if (activeSector === ALL_KEY) {
      return [{ id: UNCAT_KEY, sector_id: ALL_KEY, name: "未分类", sort_order: 0 } as Category];
    }
    return categories.filter((c) => c.sector_id === activeSector).sort((a, b) => a.sort_order - b.sort_order);
  }, [categories, activeSector]);

  const rowsByCategory = (catId: number | null) => {
    const list = activeSector === ALL_KEY
      ? enrichedTickers.filter((t) => !t.category_id || !categories.find((c) => c.id === t.category_id))
      : enrichedTickers.filter((t) => t.category_id === catId);
    return [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  };

  // ----- mutations -----
  const patchTicker = async (id: number, patch: any) => {
    const updated = await jpatch<Ticker>(`/api/tickers/${id}`, patch);
    setTickers((prev) => prev.map((x) => (x.id === id ? { ...x, ...updated } : x)));
    if (selected?.id === id) setSelected({ ...selected, ...updated });
  };

  const addTicker = async (symbol: string, categoryId: number | null, displayName?: string) => {
    const cid = categoryId === UNCAT_KEY ? null : categoryId;
    try {
      const body: any = { symbol, category_id: cid };
      if (displayName) body.display_name = displayName;
      await jpost("/api/tickers", body);
      await fetchSnapshot();
    } catch (e: any) {
      alert("添加失败: " + e.message);
    }
  };

  const deleteTicker = async (id: number) => {
    try {
      await jdel(`/api/tickers/${id}`);
      setTickers((prev) => prev.filter((x) => x.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (e: any) {
      alert("删除失败: " + (e?.message || e));
    }
  };

  const refreshTicker = async (symbol: string) => {
    try {
      const r = await jpost<{ ok: boolean; quote?: Quote; error?: string }>(`/api/refresh_indicators/${encodeURIComponent(symbol)}`);
      if (r.ok && r.quote) {
        // patch the relevant ticker's quote in local state
        setTickers((prev) => prev.map((t) =>
          t.symbol === symbol ? { ...t, quote: r.quote } : t
        ));
      } else if (!r.ok) {
        alert(`刷新 ${symbol} 失败: ${r.error || "unknown"}`);
      }
    } catch (e: any) {
      alert(`刷新 ${symbol} 失败: ${e.message}`);
    }
  };

  const addSector = async () => {
    const name = prompt("一级赛道名称?");
    if (!name) return;
    const created = await jpost<Sector>("/api/sectors", { name });
    await fetchSnapshot();
    setActiveSector(created.id);
  };

  const renameSector = async () => {
    if (activeSector == null || activeSector === ALL_KEY) return;
    const cur = sectors.find((s) => s.id === activeSector);
    if (!cur) return;
    const name = prompt("新名称?", cur.name);
    if (!name) return;
    await jpatch(`/api/sectors/${cur.id}`, { name, sort_order: cur.sort_order, description: cur.description || "" });
    await fetchSnapshot();
  };

  const deleteSector = async () => {
    if (activeSector == null || activeSector === ALL_KEY) return;
    const cur = sectors.find((s) => s.id === activeSector);
    if (!cur) return;
    if (!confirm(`删除赛道 "${cur.name}"? 该赛道下的子类也会被删除`)) return;
    const cats = categories.filter((c) => c.sector_id === cur.id);
    for (const c of cats) await jdel(`/api/categories/${c.id}`);
    await jdel(`/api/sectors/${cur.id}`);
    setActiveSector(null);
    await fetchSnapshot();
  };

  const addCategory = async () => {
    if (activeSector == null || activeSector === ALL_KEY) {
      return alert("请先选择一个一级赛道");
    }
    const name = prompt("二级分类名称?");
    if (!name) return;
    await jpost("/api/categories", { name, sector_id: activeSector });
    await fetchSnapshot();
  };

  const renameCategory = async (cat: Category) => {
    const name = prompt("新名称?", cat.name);
    if (!name) return;
    await jpatch(`/api/categories/${cat.id}`, { name, sector_id: cat.sector_id, sort_order: cat.sort_order, description: cat.description || "" });
    await fetchSnapshot();
  };

  const deleteCategory = async (cat: Category) => {
    const inCat = enrichedTickers.filter((t) => t.category_id === cat.id);
    if (inCat.length > 0 && !confirm(`分类 "${cat.name}" 下还有 ${inCat.length} 个标的，删除后它们将变为未分类。继续?`)) return;
    for (const t of inCat) await jpatch(`/api/tickers/${t.id}`, { category_id: null });
    await jdel(`/api/categories/${cat.id}`);
    await fetchSnapshot();
  };

  const activeSectorObj = sectors.find((s) => s.id === activeSector);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onSectorDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = sectors.findIndex((s) => s.id === active.id);
    const newIdx = sectors.findIndex((s) => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(sectors, oldIdx, newIdx);
    setSectors(reordered);
    await jpost("/api/sectors/reorder", { ids: reordered.map((x) => x.id) });
  };

  const onCategoryDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id || activeSector == null || activeSector === ALL_KEY) return;
    const inSector = categories.filter((c) => c.sector_id === activeSector).sort((a, b) => a.sort_order - b.sort_order);
    const oldIdx = inSector.findIndex((c) => c.id === active.id);
    const newIdx = inSector.findIndex((c) => c.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(inSector, oldIdx, newIdx);
    const updatedIds = reordered.map((x) => x.id);
    setCategories((prev) => prev.map((c) => {
      const idx = updatedIds.indexOf(c.id);
      return idx >= 0 ? { ...c, sort_order: idx } : c;
    }));
    await jpost("/api/categories/reorder", { ids: updatedIds });
  };

  const onTickersReorder = async (catId: number | null, orderedIds: number[]) => {
    setTickers((prev) => prev.map((t) => {
      const idx = orderedIds.indexOf(t.id);
      return idx >= 0 ? { ...t, sort_order: idx } : t;
    }));
    await jpost("/api/tickers/reorder", { ids: orderedIds });
  };

  return (
    <div className="app">
      <div className="main">
        <div className="header">
          <div className="header-row">
            <h1>📊 Insight ValueChain</h1>
            <span style={{
              marginLeft: 16, fontSize: 12, padding: "4px 10px",
              border: "1px solid rgba(251,191,36,0.45)",
              borderRadius: 6,
              color: "#fde68a",
              background: "rgba(250,204,21,0.10)",
              display: "inline-flex", alignItems: "center", gap: 4,
              fontWeight: 600,
            }} title="所有标的均使用 yfinance（约 15 分钟延迟）">
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: "#fbbf24",
              }} />
              Yahoo 延迟
            </span>
            {lastUpdated && (
              <span style={{ marginLeft: 12, fontSize: 11, color: "#64748b" }}>
                更新于 {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="tabs-row">
            <div className="tabs">
              {tabs.length === 0 && <span style={{ color: "#475569", padding: "9px 0" }}>还没有赛道，点右侧 "+ 一级赛道" 创建第一个</span>}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSectorDragEnd}>
                <SortableContext items={sectors.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
                  {tabs.filter((t) => t.id !== ALL_KEY).map((t) => (
                    <SortableTab key={t.id} id={t.id}>
                      <button
                        className={`tab ${activeSector === t.id ? "active" : ""}`}
                        onClick={() => setActiveSector(t.id)}
                      >
                        {t.name}<span className="count">{t.count}</span>
                      </button>
                    </SortableTab>
                  ))}
                </SortableContext>
              </DndContext>
              {tabs.filter((t) => t.id === ALL_KEY).map((t) => (
                <button
                  key={t.id}
                  className={`tab ${activeSector === t.id ? "active" : ""}`}
                  onClick={() => setActiveSector(t.id)}
                >
                  {t.name}<span className="count">{t.count}</span>
                </button>
              ))}
            </div>
            <div className="header-tools header-tools-right">
              <button className="btn" onClick={addSector}>+ 一级赛道</button>
              {activeSector != null && activeSector !== ALL_KEY && (
                <>
                  <button className="btn" onClick={addCategory}>+ 二级分类</button>
                  <button className="btn ghost" onClick={renameSector}>重命名</button>
                  <button className="btn ghost" onClick={deleteSector}>删除赛道</button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="content">
          <div className="content-inner">
            {activeSectorObj && (
              <div className="sector-head">
                <h2>{activeSectorObj.name}</h2>
                {activeSectorObj.description && <span className="desc">{activeSectorObj.description}</span>}
              </div>
            )}
            {activeSector != null && activeSector !== ALL_KEY && (() => {
              // 当前赛道内、7 天内出财报的标的（去重 by symbol）
              const seen = new Set<string>();
              const upcoming = enrichedTickers
                .filter((t) => {
                  const cat = categories.find((c) => c.id === t.category_id);
                  if (cat?.sector_id !== activeSector) return false;
                  const er = (t as any).quote?.next_earnings;
                  if (!er || er.days == null || er.days < 0 || er.days > 7) return false;
                  if (seen.has(t.symbol)) return false;
                  seen.add(t.symbol);
                  return true;
                })
                .sort((a, b) => ((a as any).quote.next_earnings.days - (b as any).quote.next_earnings.days));
              if (upcoming.length === 0) return null;
              const timeLabel = (t: string) => t === "bmo" ? "盘前" : t === "amc" ? "盘后" : "";
              const fmtDate = (d: string) => {
                const parts = d.split("-");
                return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`;
              };
              return (
                <div style={{
                  marginBottom: 12,
                  padding: "10px 14px",
                  background: "rgba(251,146,60,0.08)",
                  border: "1px solid rgba(251,146,60,0.35)",
                  borderRadius: 8,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 10,
                }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: "#fdba74",
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}>
                    📅 7 天内财报
                    <span style={{ color: "#94a3b8", fontWeight: 500 }}>· {upcoming.length} 个</span>
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {upcoming.map((t) => {
                      const er = (t as any).quote.next_earnings;
                      const days = er.days;
                      const dayBucket = days <= 1 ? "imminent" : days <= 3 ? "soon" : "week";
                      const color = dayBucket === "imminent"
                        ? { fg: "#fca5a5", bg: "rgba(239,68,68,0.15)", bd: "rgba(239,68,68,0.50)" }
                        : dayBucket === "soon"
                        ? { fg: "#fdba74", bg: "rgba(251,146,60,0.14)", bd: "rgba(251,146,60,0.45)" }
                        : { fg: "#93c5fd", bg: "rgba(96,165,250,0.12)", bd: "rgba(96,165,250,0.40)" };
                      const dayText = days === 0 ? "今天" : days === 1 ? "明天" : `${days}天后`;
                      return (
                        <span
                          key={t.symbol}
                          title={`${t.symbol} · ${er.date}${er.time !== "unknown" ? " (" + timeLabel(er.time) + ")" : ""}`}
                          style={{
                            display: "inline-flex", alignItems: "baseline", gap: 5,
                            fontSize: 12, fontWeight: 600,
                            color: color.fg, background: color.bg,
                            border: `1px solid ${color.bd}`,
                            padding: "3px 9px", borderRadius: 5,
                            letterSpacing: "0.01em",
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>{t.symbol}</span>
                          <span style={{ opacity: 0.75 }}>{fmtDate(er.date)}</span>
                          {er.time !== "unknown" && (
                            <span style={{ fontSize: 10, opacity: 0.7 }}>{timeLabel(er.time)}</span>
                          )}
                          <span style={{ fontSize: 10, opacity: 0.85, marginLeft: 2 }}>{dayText}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            {activeSector === ALL_KEY && (
              <div className="sector-head"><h2>未分类</h2><span className="desc">尚未归入任何赛道的标的</span></div>
            )}

            {activeSector != null && sectorCategories.length === 0 && activeSector !== ALL_KEY && (
              <div className="empty">该赛道下还没有二级分类，点上方 "+ 二级分类" 创建</div>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onCategoryDragEnd}>
              <SortableContext
                items={sectorCategories.map((c) => c.id ?? "uncat")}
                strategy={verticalListSortingStrategy}
              >
                {sectorCategories.map((cat) => (
                  <SortableCat key={cat.id ?? "uncat"} id={cat.id ?? "uncat"}>
                    {({ attributes, listeners }: any) => (
                      <CategoryPanel
                        category={cat}
                        rows={rowsByCategory(cat.id)}
                        onAddTicker={addTicker}
                        onPatch={patchTicker}
                        onSelect={setSelected}
                        onDeleteTicker={deleteTicker}
                        onRefreshTicker={refreshTicker}
                        onDeleteCategory={cat.id !== UNCAT_KEY ? () => deleteCategory(cat) : undefined}
                        onRenameCategory={cat.id !== UNCAT_KEY ? () => renameCategory(cat) : undefined}
                        onReorderTickers={(ids) => onTickersReorder(cat.id, ids)}
                        dragHandleProps={cat.id !== UNCAT_KEY ? { ...attributes, ...listeners } : undefined}
                        selected={selected}
                      />
                    )}
                  </SortableCat>
                ))}
              </SortableContext>
            </DndContext>

            {tabs.length === 0 && (
              <div className="empty" style={{ marginTop: 60 }}>
                👋 开始：点右上角 "+ 一级赛道" → 创建赛道 → 在赛道下创建二级分类 → 在分类面板中添加标的
              </div>
            )}

            {/* 当前赛道观察标的热力图 */}
            {activeSector != null && activeSector !== ALL_KEY && (() => {
              const seen = new Set<string>();
              const sectorTickers = enrichedTickers
                .filter((t) => {
                  const cat = categories.find((c) => c.id === t.category_id);
                  if (cat?.sector_id !== activeSector) return false;
                  if (seen.has(t.symbol)) return false;
                  seen.add(t.symbol);
                  return true;
                })
                .map((t) => ({
                  symbol: t.symbol,
                  display_name: (t as any).display_name,
                  market_cap: (t as any).quote?.market_cap ?? null,
                  change_pct: (t as any).quote?.change_pct ?? null,
                }));
              const title = activeSectorObj ? `📊 ${activeSectorObj.name} · 观察热力图` : "📊 观察热力图";
              return <WatchHeatmap tickers={sectorTickers} title={title} />;
            })()}

            {/* 主表格下方的招聘动态卡片 */}
            <RecentJobsCard activeSector={activeSector === ALL_KEY ? null : activeSector} />
          </div>
        </div>
      </div>
    </div>
  );
}
