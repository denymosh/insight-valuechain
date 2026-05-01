// Same-origin fetch helpers. In Vercel, frontend and API share the same host.
export async function jget<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function jsend<T>(path: string, method: string, body?: any): Promise<T> {
  const r = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export const jpost = <T,>(p: string, b?: any) => jsend<T>(p, "POST", b);
export const jpatch = <T,>(p: string, b?: any) => jsend<T>(p, "PATCH", b);
export const jdel = <T,>(p: string) => jsend<T>(p, "DELETE");
