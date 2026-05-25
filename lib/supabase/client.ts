import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// In production, use /supabase proxy (same domain, no CORS)
// In dev, use direct Supabase URL
const supabaseUrl = typeof window !== "undefined"
  ? `${window.location.origin}/supabase`
  : (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321");
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder";

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
