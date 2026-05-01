import { NextResponse } from "next/server";
import { sb } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await sb.from("sectors").select("*").order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { data, error } = await sb
    .from("sectors")
    .insert({
      name: body.name,
      sort_order: body.sort_order ?? 0,
      description: body.description ?? "",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
