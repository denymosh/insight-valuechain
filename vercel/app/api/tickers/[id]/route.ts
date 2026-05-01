import { NextResponse } from "next/server";
import { sb } from "@/lib/supabase";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const id = params.id;
  // load current row to detect changes
  const { data: cur, error: ge } = await sb.from("tickers").select("*").eq("id", id).single();
  if (ge || !cur) return NextResponse.json({ error: "not found" }, { status: 404 });

  const patch: any = {};
  const editable = [
    "symbol", "category_id", "display_name", "industry", "moat", "risk",
    "notes", "tags", "position_status", "sa_rating", "sort_order",
  ];
  for (const k of editable) if (k in body) patch[k] = body[k];
  if (typeof patch.symbol === "string") patch.symbol = patch.symbol.trim().toUpperCase();

  // dup check if symbol or category change
  const newSym = patch.symbol ?? cur.symbol;
  const newCat = "category_id" in patch ? patch.category_id : cur.category_id;
  if (newCat != null && (newSym !== cur.symbol || newCat !== cur.category_id)) {
    const { data: dup } = await sb
      .from("tickers")
      .select("id")
      .eq("symbol", newSym)
      .eq("category_id", newCat)
      .neq("id", id)
      .maybeSingle();
    if (dup) return NextResponse.json({ error: "该分类下已存在此标的" }, { status: 400 });
  }

  patch.updated_at = new Date().toISOString();
  const { data, error } = await sb.from("tickers").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await sb.from("tickers").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
