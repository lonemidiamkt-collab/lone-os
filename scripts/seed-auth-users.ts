/**
 * Seed script: Creates Supabase Auth users for each team member
 * and links them via the auth_id column.
 *
 * Run with: npx tsx scripts/seed-auth-users.ts
 *
 * Requires:
 *   - Supabase running locally (supabase start)
 *   - .env.local with SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY. Set it in .env.local or environment.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Team members (must match seed.sql IDs and emails)
const TEAM_MEMBERS = [
  { id: "00000000-0000-0000-0000-000000000001", email: "admin@loneos.com",   password: "1234", name: "Admin CEO" },
  { id: "00000000-0000-0000-0000-000000000002", email: "gerente@loneos.com", password: "1234", name: "Gerente Ops" },
  { id: "00000000-0000-0000-0000-000000000003", email: "ana@loneos.com",     password: "1234", name: "Ana Lima" },
  { id: "00000000-0000-0000-0000-000000000004", email: "pedro@loneos.com",   password: "1234", name: "Pedro Alves" },
  { id: "00000000-0000-0000-0000-000000000005", email: "carlos@loneos.com",  password: "1234", name: "Carlos Melo" },
  { id: "00000000-0000-0000-0000-000000000006", email: "mariana@loneos.com", password: "1234", name: "Mariana Costa" },
  { id: "00000000-0000-0000-0000-000000000007", email: "rafael@loneos.com",  password: "1234", name: "Rafael Designer" },
];

async function seed() {
  console.log("Seeding auth users...\n");

  for (const member of TEAM_MEMBERS) {
    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: member.email,
      password: member.password,
      email_confirm: true, // Auto-confirm email
    });

    if (authError) {
      if (authError.message?.includes("already been registered")) {
        console.log(`  [skip] ${member.name} (${member.email}) — already exists`);

        // Still try to link auth_id
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find((u) => u.email === member.email);
        if (existingUser) {
          await supabase
            .from("team_members")
            .update({ auth_id: existingUser.id })
            .eq("id", member.id);
          console.log(`    -> linked auth_id ${existingUser.id}`);
        }
        continue;
      }
      console.error(`  [error] ${member.name}: ${authError.message}`);
      continue;
    }

    const authUserId = authData.user?.id;
    if (!authUserId) {
      console.error(`  [error] ${member.name}: no user ID returned`);
      continue;
    }

    // 2. Link auth_id to team_members
    const { error: updateError } = await supabase
      .from("team_members")
      .update({ auth_id: authUserId })
      .eq("id", member.id);

    if (updateError) {
      console.error(`  [error] linking ${member.name}: ${updateError.message}`);
    } else {
      console.log(`  [ok] ${member.name} (${member.email}) — auth_id: ${authUserId}`);
    }
  }

  console.log("\nDone! Senha padrão para todos: 1234");
  console.log("  admin@loneos.com");
  console.log("  gerente@loneos.com");
  console.log("  ana@loneos.com");
  console.log("  pedro@loneos.com");
  console.log("  carlos@loneos.com");
  console.log("  mariana@loneos.com");
  console.log("  rafael@loneos.com");
}

seed().catch(console.error);
