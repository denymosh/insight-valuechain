"use client";
import { useState } from "react";
import CategoryGrid from "./CategoryGrid";
import DetailPanel from "./DetailPanel";

export default function CategoryPanel({
  category,
  rows,
  onAddTicker,
  onPatch,
  onSelect,
  onDeleteTicker,
  onRefreshTicker,
  onDeleteCategory,
  onRenameCategory,
  onReorderTickers,
  dragHandleProps,
  selected,
}: {
  category: { id: number | null; name: string; description?: string };
  rows: any[];
  onAddTicker: (symbol: string, categoryId: number | null, displayName?: string) => void;
  onPatch: (id: number, patch: any) => void;
  onSelect: (row: any | null) => void;
  onDeleteTicker: (id: number) => void;
  onRefreshTicker: (symbol: string) => void;
  onDeleteCategory?: () => void;
  onRenameCategory?: () => void;
  onReorderTickers?: (orderedIds: number[]) => void;
  dragHandleProps?: any;
  selected?: any | null;
}) {
  const [sym, setSym] = useState("");
  const [name, setName] = useState("");
  const submit = () => {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    onAddTicker(s, category.id, name.trim() || undefined);
    setSym("");
    setName("");
  };

  return (
    <div className="cat-panel">
      <div className="cat-head">
        {dragHandleProps && (
          <span {...dragHandleProps} title="拖动排序" style={{ cursor: "grab", color: "#475569", fontSize: 14, padding: "0 4px", userSelect: "none" }}>⋮⋮</span>
        )}
        <span className="name">{category.name}</span>
        <span className="badge">{rows.length}</span>
        {category.description && <span className="desc">{category.description}</span>}
        <span className="spacer" />
        <input
          placeholder="+ 标的"
          value={sym}
          onChange={(e) => setSym(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          style={{ width: 110 }}
        />
        <input
          placeholder="显示名称 (可选)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          style={{ width: 150 }}
        />
        <button onClick={submit}>添加</button>
        {category.id != null && onRenameCategory && (
          <button className="ghost" onClick={onRenameCategory}>✎</button>
        )}
        {category.id != null && onDeleteCategory && (
          <button className="ghost" onClick={onDeleteCategory} title="删除分类">✕</button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="empty">暂无标的，输入 symbol 回车添加</div>
      ) : (() => {
        const selIdx = selected ? rows.findIndex((r) => r.id === selected.id) : -1;
        if (selIdx < 0) {
          return (
            <CategoryGrid
              rows={rows}
              onPatch={onPatch}
              onSelect={onSelect}
              onDelete={onDeleteTicker}
              onRefresh={onRefreshTicker}
              onReorder={onReorderTickers}
              selected={selected}
            />
          );
        }
        const top = rows.slice(0, selIdx + 1);
        const bot = rows.slice(selIdx + 1);
        const reorderTopBot = (orderedIds: number[]) => {
          if (!onReorderTickers) return;
          const merged = orderedIds.concat(bot.map((r) => r.id));
          onReorderTickers(merged);
        };
        const reorderBotTop = (orderedIds: number[]) => {
          if (!onReorderTickers) return;
          const merged = top.map((r) => r.id).concat(orderedIds);
          onReorderTickers(merged);
        };
        return (
          <>
            <CategoryGrid
              rows={top}
              onPatch={onPatch}
              onSelect={onSelect}
              onDelete={onDeleteTicker}
              onRefresh={onRefreshTicker}
              onReorder={reorderTopBot}
              selected={selected}
            />
            <div className="inline-detail-wrapper">
              <div className="inline-detail-box">
                <DetailPanel ticker={selected} onPatch={onPatch} inline />
              </div>
            </div>
            {bot.length > 0 && (
              <CategoryGrid
                rows={bot}
                onPatch={onPatch}
                onSelect={onSelect}
                onDelete={onDeleteTicker}
                onRefresh={onRefreshTicker}
                onReorder={reorderBotTop}
                selected={selected}
                hideHeader
              />
            )}
          </>
        );
      })()}
    </div>
  );
}
