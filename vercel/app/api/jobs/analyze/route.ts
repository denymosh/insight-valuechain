// On-demand AI analysis: POST {symbol} -> streamed plain-text markdown.
import { sb } from "@/lib/supabase";
import { ATS_MAP } from "@/lib/jobs/ats_map";
import { anthropic, buildJobsPrompt, JOBS_AI_MODEL, JOBS_AI_SYSTEM } from "@/lib/jobs/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return new Response("ANTHROPIC_API_KEY not set", { status: 500 });
  const body = await req.json().catch(() => ({}));
  const symbol = String(body?.symbol || "").toUpperCase();
  if (!ATS_MAP[symbol]) return new Response("unknown symbol", { status: 400 });

  // light abuse guard: at most one on-demand run per symbol per 20s
  const { data: lastRun } = await sb.from("job_insights").select("manual_at").eq("symbol", symbol).maybeSingle();
  if (lastRun?.manual_at && Date.now() - new Date(lastRun.manual_at).getTime() < 20000) {
    return new Response("请稍后再试", { status: 429 });
  }

  const built = await buildJobsPrompt(symbol);
  if (!built) return new Response("no data", { status: 404 });
  await sb.from("job_insights").upsert({ symbol, manual_at: new Date().toISOString() }, { onConflict: "symbol" });

  const stream = anthropic().messages.stream({
    model: JOBS_AI_MODEL,
    max_tokens: 1200,
    system: JOBS_AI_SYSTEM,
    messages: [{ role: "user", content: built.prompt }],
  });
  const enc = new TextEncoder();
  const rs = new ReadableStream({
    async start(ctrl) {
      stream.on("text", (t) => ctrl.enqueue(enc.encode(t)));
      try { await stream.finalMessage(); } catch (e: any) { ctrl.enqueue(enc.encode(`\n[错误] ${e?.message || e}`)); }
      ctrl.close();
    },
    cancel() { stream.abort(); },
  });
  return new Response(rs, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
