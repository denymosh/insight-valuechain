// AI analysis of hiring data. Model is configurable via JOBS_AI_MODEL.
import Anthropic from "@anthropic-ai/sdk";
import { sb } from "@/lib/supabase";

export const JOBS_AI_MODEL = process.env.JOBS_AI_MODEL || "claude-sonnet-5-5";

let _client: Anthropic | null = null;
export function anthropic(): Anthropic {
  return (_client ??= new Anthropic()); // reads ANTHROPIC_API_KEY
}

const SYSTEM = `你是一名买方研究分析师，专门从公司招聘数据中解读业务信号。
只依据给定数据下结论，不要编造数据中没有的事实；数据不足时明确说“数据不足”。
输出中文，使用以下 markdown 结构，且总字数不超过 350 字：
**一句话结论**：…
**主要变化**：（2-4 条要点，引用具体数字与变化方向）
**业务信号**：（对产品/研发/扩张/成本的含义）
**风险与注意**：（1-2 条）
注意：招聘数据只是先行指标之一，不构成投资建议。`;

export { SYSTEM as JOBS_AI_SYSTEM };

type Row = Record<string, any>;

const top = (m: Record<string, number> | null | undefined, n = 8) =>
  Object.entries(m ?? {}).sort((a, b) => b[1] - a[1]).slice(0, n);

/** Build the user prompt from the latest summary and history snapshots. */
export async function buildJobsPrompt(symbol: string): Promise<{ prompt: string; snapDate: string } | null> {
  const [cur, hist] = await Promise.all([
    sb.from("job_summaries").select("*").eq("symbol", symbol).maybeSingle(),
    sb.from("job_snapshots").select("*").eq("symbol", symbol).order("snap_date", { ascending: false }).limit(60),
  ]);
  const s: Row | null = cur.data;
  if (!s) return null;
  const h: Row[] = hist.data ?? [];

  // pick snapshots closest to 7 / 30 days ago for comparison
  const nearest = (days: number) => {
    const target = Date.now() - days * 86400000;
    let best: Row | null = null;
    for (const r of h) {
      const d = Math.abs(new Date(r.snap_date).getTime() - target);
      if (d <= 3 * 86400000 && (!best || d < Math.abs(new Date(best.snap_date).getTime() - target))) best = r;
    }
    return best;
  };
  const fmt = (r: Row) => ({
    date: r.snap_date ?? String(r.fetched_at).slice(0, 10),
    total: r.total, posted_7d: r.posted_7d, posted_30d: r.posted_30d,
    top_dept: top(r.by_dept), top_country: top(r.by_country, 5), top_title: top(r.by_title, 10),
    keywords: r.by_keyword ?? undefined,
  });
  const payload = {
    symbol,
    current: fmt(s),
    about_7_days_ago: nearest(7) ? fmt(nearest(7)!) : "无历史快照",
    about_30_days_ago: nearest(30) ? fmt(nearest(30)!) : "无历史快照",
    history_totals: h.slice(0, 30).map((r) => [r.snap_date, r.total]),
  };
  return {
    prompt: `请分析 ${symbol} 的招聘数据：\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``,
    snapDate: String(payload.current.date),
  };
}

export async function generateJobsInsight(symbol: string): Promise<string | null> {
  const built = await buildJobsPrompt(symbol);
  if (!built) return null;
  const msg = await anthropic().messages.create({
    model: JOBS_AI_MODEL,
    max_tokens: 1200,
    system: SYSTEM,
    messages: [{ role: "user", content: built.prompt }],
  });
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  return text || null;
}
