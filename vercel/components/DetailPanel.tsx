"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { memo, useEffect, useRef } from "react";

function RichField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const composingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef("");

  const flush = () => {
    if (composingRef.current) return;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    onChange(latestRef.current);
  };

  const editor = useEditor({
    extensions: [StarterKit],
    content: value || "",
    onUpdate: ({ editor }) => {
      latestRef.current = editor.getHTML();
      if (composingRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, 500);
    },
    editorProps: {
      attributes: { class: "editor" },
      handleDOMEvents: {
        compositionstart: () => { composingRef.current = true; return false; },
        compositionend: () => { composingRef.current = false; flush(); return false; },
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  useEffect(() => {
    if (editor && value !== editor.getHTML() && !composingRef.current) {
      editor.commands.setContent(value || "", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <EditorContent editor={editor} />;
}

function DetailPanelImpl({
  ticker,
  onPatch,
  inline,
}: {
  ticker: any | null;
  onPatch: (id: number, patch: any) => void;
  inline?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  // when inline detail opens for a new ticker, scroll the panel fully into view
  // so it's not clipped at the bottom of the scroll container
  useEffect(() => {
    if (!inline || !ticker || !rootRef.current) return;
    const id = window.setTimeout(() => {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 50);
    return () => window.clearTimeout(id);
  }, [inline, ticker?.id]);

  if (!ticker) {
    if (inline) return null;
    return <div className="detail"><p style={{ color: "#6b7280" }}>选中一行查看详情</p></div>;
  }
  const set = (k: string, v: any) => onPatch(ticker.id, { [k]: v });
  return (
    <div ref={rootRef} className={inline ? "detail inline inline-detail" : "detail"} key={ticker.id}>
      <h2>{ticker.symbol} <span style={{ color: "#6b7280", fontSize: 13 }}>{ticker.display_name}</span></h2>

      <h3>显示名</h3>
      <input
        defaultValue={ticker.display_name}
        onBlur={(e) => set("display_name", e.target.value)}
        style={{ width: "100%", background: "#0f172a", color: "#e6edf3", border: "1px solid #1f2937", padding: 6, borderRadius: 4 }}
      />

      <h3>仓位状态</h3>
      <select
        defaultValue={ticker.position_status}
        onChange={(e) => set("position_status", e.target.value)}
        style={{ background: "#0f172a", color: "#e6edf3", border: "1px solid #1f2937", padding: 6, borderRadius: 4 }}
      >
        <option value="watch">观察</option>
        <option value="target">目标</option>
        <option value="holding">持有</option>
        <option value="sold">已出</option>
      </select>

      <h3>标签 (逗号分隔)</h3>
      <input
        defaultValue={ticker.tags}
        onBlur={(e) => set("tags", e.target.value)}
        style={{ width: "100%", background: "#0f172a", color: "#e6edf3", border: "1px solid #1f2937", padding: 6, borderRadius: 4 }}
      />

      <h3>护城河</h3>
      <RichField value={ticker.moat || ""} onChange={(v) => set("moat", v)} />

      <h3>风险</h3>
      <RichField value={ticker.risk || ""} onChange={(v) => set("risk", v)} />

      <h3>备注</h3>
      <RichField value={ticker.notes || ""} onChange={(v) => set("notes", v)} />
    </div>
  );
}

// Skip re-render when only quote/auto_tags change (WS ticks).
// Re-render only when an editable field or the ticker identity changes.
// Without this, every WS tick re-renders DetailPanel; combined with AG Grid
// full-width row reconciliation, the TipTap editor inside RichField churns
// and the panel briefly shows blank.
// Skip re-render when only quote/auto_tags/onPatch identity change.
// Re-render only when an editable field or the ticker identity changes.
// onPatch is intentionally not compared (parent recreates it each render);
// callers pass the latest patch via the closure invoked at edit time.
const DetailPanel = memo(DetailPanelImpl, (prev, next) => {
  const a = prev.ticker, b = next.ticker;
  if (a === b) return true;
  if (!a || !b) return a === b;
  if (prev.inline !== next.inline) return false;
  return (
    a.id === b.id &&
    a.symbol === b.symbol &&
    a.display_name === b.display_name &&
    a.position_status === b.position_status &&
    a.tags === b.tags &&
    a.moat === b.moat &&
    a.risk === b.risk &&
    a.notes === b.notes
  );
});

export default DetailPanel;
