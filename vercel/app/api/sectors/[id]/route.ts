import { NextResponse } from "next/server";
import { sb } from "@/lib/supabase";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const patch: any = {};
  for (const k of ["name", "sort_order", "description"]) {
    if (k in body) patch[k] = body[k];
  }
  const { data, error } = await sb.from("sectors").update(patch).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await sb.from("sectors").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
