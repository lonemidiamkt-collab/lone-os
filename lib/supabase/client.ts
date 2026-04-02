import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder";

// Client-side Supabase client (browser)
// Uses fallback values when env vars are missing — RoleContext handles the offline case
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
