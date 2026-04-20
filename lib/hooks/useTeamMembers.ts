"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string; // admin | manager | traffic | social | designer
  initials: string;
}

let cachedMembers: TeamMember[] | null = null;

export function useTeamMembers() {
  const [members, setMembers] = useState<TeamMember[]>(cachedMembers ?? []);
  const [loading, setLoading] = useState(!cachedMembers);

  useEffect(() => {
    if (cachedMembers) return;

    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from("team_members")
        .select("id, name, email, role, initials")
        .eq("is_active", true)
        .order("name");

      if (!cancelled && !error && data) {
        const mapped = data as TeamMember[];
        cachedMembers = mapped;
        setMembers(mapped);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const byRole = (role: string) => members.filter((m) => m.role === role);

  return {
    members,
    loading,
    traffic: byRole("traffic"),
    social: byRole("social"),
    designer: byRole("designer"),
    manager: byRole("manager"),
    admin: byRole("admin"),
    /** Get members for a specific assignment field */
    forField: (field: "assignedTraffic" | "assignedSocial" | "assignedDesigner") => {
      if (field === "assignedTraffic") return [...byRole("traffic"), ...byRole("manager")];
      if (field === "assignedSocial") return byRole("social");
      if (field === "assignedDesigner") return byRole("designer");
      return members;
    },
  };
}
