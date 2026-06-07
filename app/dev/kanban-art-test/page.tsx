import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";
import KanbanArtTestContent from "./_content";

const ADMIN_EMAILS = new Set([
  "lonemidiamkt@gmail.com",
  "lucas@lonemidia.com",
  "julio@lonemidia.com",
]);

async function resolveAdminFromCookies(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const tokenChunks = allCookies
      .filter((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => c.value);
    if (tokenChunks.length === 0) return false;
    const raw = tokenChunks.join("");
    const cleaned = raw.startsWith("base64-")
      ? Buffer.from(raw.slice(7), "base64").toString("utf8")
      : raw;
    const parsed = JSON.parse(cleaned);
    const accessToken: string | undefined = parsed?.access_token;
    if (!accessToken) return false;
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (error || !data.user?.email) return false;
    return ADMIN_EMAILS.has(data.user.email.toLowerCase());
  } catch {
    return false;
  }
}

export default async function KanbanArtTestPage() {
  if (process.env.NODE_ENV === "production") {
    const isAdmin = await resolveAdminFromCookies();
    if (!isAdmin) redirect("/");
  }

  return <KanbanArtTestContent />;
}
