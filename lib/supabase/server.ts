import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy server-side Supabase admin client (bypasses RLS).
// Must be lazy because env vars aren't available at Docker build time — only at runtime.
// Evaluating createClient at module import fails the Next.js "collect page data" step.

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder";
  _client = createClient(url, key);
  return _client;
}

// Proxy preserves the existing `import { supabaseAdmin } from "@/lib/supabase/server"`
// call sites without requiring any change — method access goes through getClient() on demand.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});
