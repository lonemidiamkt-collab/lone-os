import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// In production, use /supabase proxy (same domain, no CORS)
// In dev, use direct Supabase URL
const supabaseUrl = typeof window !== "undefined"
  ? `${window.location.origin}/supabase`
  : (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321");
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder";

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// O container `supabase-realtime` está DESLIGADO em produção pra economizar RAM no VPS
// (ver docs/lone-os-system-doc.md). Sem este guard, cada subscribeRealtime() abre um
// WebSocket que sempre falha (502) e o cliente reconecta pra sempre, poluindo o console
// com dezenas de "WebSocket connection failed". Default = off; só ligar (build arg
// NEXT_PUBLIC_REALTIME_ENABLED=true) se o container do realtime for reativado.
export const REALTIME_ENABLED = process.env.NEXT_PUBLIC_REALTIME_ENABLED === "true";
