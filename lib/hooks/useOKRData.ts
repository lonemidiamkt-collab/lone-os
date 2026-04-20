"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";

export interface OKRRecord {
  id: string;
  title: string;
  description: string;
  team: string;
  metricKey: string;
  target: number;
  currentValue: number;
  unit: string;
  quarter: string;
  status: "on_track" | "at_risk" | "off_track";
  owner: string;
  autoCalculated: boolean;
  createdBy: string;
}

export interface OKRHistoryPoint {
  value: number;
  recordedAt: string;
}

function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}

export function useOKRData() {
  const [okrs, setOkrs] = useState<OKRRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [quarter, setQuarter] = useState(getCurrentQuarter());

  const loadOKRs = useCallback(async () => {
    const { data, error } = await supabase
      .from("okrs")
      .select("*")
      .eq("quarter", quarter)
      .order("team")
      .order("title");

    if (!error && data) {
      setOkrs(data.map((r) => ({
        id: r.id as string,
        title: r.title as string,
        description: (r.description as string) || "",
        team: r.team as string,
        metricKey: (r.metric_key as string) || "",
        target: Number(r.target),
        currentValue: Number(r.current_value),
        unit: (r.unit as string) || "%",
        quarter: r.quarter as string,
        status: r.status as OKRRecord["status"],
        owner: (r.owner as string) || "",
        autoCalculated: r.auto_calculated as boolean,
        createdBy: (r.created_by as string) || "",
      })));
    }
    setLoading(false);
  }, [quarter]);

  useEffect(() => { loadOKRs(); }, [loadOKRs]);

  const updateTarget = async (id: string, target: number) => {
    await supabase.from("okrs").update({ target, updated_at: new Date().toISOString() }).eq("id", id);
    setOkrs((prev) => prev.map((o) => o.id === id ? { ...o, target } : o));
  };

  const updateCurrentValue = async (id: string, currentValue: number) => {
    const okr = okrs.find((o) => o.id === id);
    const pct = okr ? (currentValue / okr.target) * 100 : 0;
    const status: OKRRecord["status"] = pct >= 70 ? "on_track" : pct >= 40 ? "at_risk" : "off_track";

    await supabase.from("okrs").update({
      current_value: currentValue,
      status,
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    await supabase.from("okr_history").insert({
      okr_id: id,
      value: currentValue,
    });

    setOkrs((prev) => prev.map((o) => o.id === id ? { ...o, currentValue, status } : o));
  };

  const syncAutoCalculated = async (metricKey: string, value: number) => {
    const okr = okrs.find((o) => o.metricKey === metricKey && o.autoCalculated);
    if (!okr) return;
    await updateCurrentValue(okr.id, value);
  };

  const createOKR = async (data: Omit<OKRRecord, "id" | "status" | "currentValue">) => {
    const { data: inserted } = await supabase.from("okrs").insert({
      title: data.title,
      description: data.description,
      team: data.team,
      metric_key: data.metricKey,
      target: data.target,
      unit: data.unit,
      quarter: data.quarter || quarter,
      owner: data.owner,
      auto_calculated: data.autoCalculated,
      created_by: data.createdBy,
      current_value: 0,
      status: "off_track",
    }).select("id").single();

    if (inserted) await loadOKRs();
    return inserted?.id;
  };

  const deleteOKR = async (id: string) => {
    await supabase.from("okrs").delete().eq("id", id);
    setOkrs((prev) => prev.filter((o) => o.id !== id));
  };

  const getHistory = async (id: string): Promise<OKRHistoryPoint[]> => {
    const { data } = await supabase
      .from("okr_history")
      .select("value, recorded_at")
      .eq("okr_id", id)
      .order("recorded_at", { ascending: true })
      .limit(30);

    return (data || []).map((r) => ({
      value: Number(r.value),
      recordedAt: r.recorded_at as string,
    }));
  };

  const byTeam = (team: string) => okrs.filter((o) => o.team === team);

  return {
    okrs, loading, quarter, setQuarter,
    byTeam, updateTarget, updateCurrentValue, syncAutoCalculated,
    createOKR, deleteOKR, getHistory, reload: loadOKRs,
  };
}
