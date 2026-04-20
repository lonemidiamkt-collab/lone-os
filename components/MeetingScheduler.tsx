"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { generateGoogleCalendarUrl, generateICS, downloadICS } from "@/lib/calendar/icsGenerator";
import type { Client } from "@/lib/types";
import {
  Calendar, Plus, X, Check, Loader2, Clock,
  Video, MapPin, ExternalLink, Download, Users,
} from "lucide-react";

interface Meeting {
  id: string;
  clientId: string;
  title: string;
  description: string;
  meetingType: string;
  startAt: string;
  endAt: string;
  location: string;
  status: string;
  createdBy: string;
  googleCalendarUrl: string;
}

interface Props {
  client: Client;
  currentUser: string;
}

const MEETING_TYPES = [
  { value: "alinhamento", label: "Alinhamento", icon: "📋" },
  { value: "kickoff", label: "Kickoff", icon: "🚀" },
  { value: "resultado", label: "Resultado", icon: "📊" },
  { value: "estrategia", label: "Estrategia", icon: "🎯" },
];

export default function MeetingScheduler({ client, currentUser }: Props) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: "",
    type: "alinhamento",
    date: new Date().toISOString().slice(0, 10),
    startTime: "10:00",
    endTime: "11:00",
    location: "Google Meet",
    description: "",
  });

  useEffect(() => {
    let mounted = true;
    supabase
      .from("meetings")
      .select("*")
      .eq("client_id", client.id)
      .order("start_at", { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (!mounted || error) return;
        setMeetings(
          (data || []).map((r) => ({
            id: r.id,
            clientId: r.client_id,
            title: r.title,
            description: r.description || "",
            meetingType: r.meeting_type,
            startAt: r.start_at,
            endAt: r.end_at,
            location: r.location || "",
            status: r.status,
            createdBy: r.created_by,
            googleCalendarUrl: r.google_calendar_url || "",
          }))
        );
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [client.id]);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.date) return;
    setSaving(true);

    const startAt = `${form.date}T${form.startTime}:00-03:00`;
    const endAt = `${form.date}T${form.endTime}:00-03:00`;
    const companyName = client.nomeFantasia || client.name;
    const title = form.title || `${MEETING_TYPES.find((t) => t.value === form.type)?.label} — ${companyName}`;
    const description = form.description || `Reuniao de ${form.type} com ${companyName}`;

    const googleUrl = generateGoogleCalendarUrl({ title, description, startAt, endAt, location: form.location });

    const { error } = await supabase.from("meetings").insert({
      client_id: client.id,
      title,
      description,
      meeting_type: form.type,
      start_at: startAt,
      end_at: endAt,
      location: form.location,
      google_calendar_url: googleUrl,
      status: "scheduled",
      created_by: currentUser,
    });

    if (!error) {
      await supabase.from("timeline_entries").insert({
        client_id: client.id,
        type: "meeting",
        actor: currentUser,
        description: `Reuniao agendada: ${title} — ${form.date} ${form.startTime}`,
        timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      });

      await supabase.from("communication_logs").insert({
        client_id: client.id,
        channel: "reuniao",
        direction: "outgoing",
        summary: `${title} em ${form.date} ${form.startTime}-${form.endTime}`,
        logged_by: currentUser,
      });
    }

    setForm({ title: "", type: "alinhamento", date: new Date().toISOString().slice(0, 10), startTime: "10:00", endTime: "11:00", location: "Google Meet", description: "" });
    setShowForm(false);
    setSaving(false);

    const { data } = await supabase.from("meetings").select("*").eq("client_id", client.id).order("start_at", { ascending: false }).limit(10);
    if (data) setMeetings(data.map((r) => ({ id: r.id, clientId: r.client_id, title: r.title, description: r.description || "", meetingType: r.meeting_type, startAt: r.start_at, endAt: r.end_at, location: r.location || "", status: r.status, createdBy: r.created_by, googleCalendarUrl: r.google_calendar_url || "" })));
  };

  const handleDownloadICS = (meeting: Meeting) => {
    const ics = generateICS({
      title: meeting.title,
      description: meeting.description,
      startAt: meeting.startAt,
      endAt: meeting.endAt,
      location: meeting.location,
    });
    downloadICS(meeting.title.replace(/\s+/g, "-").toLowerCase(), ics);
  };

  const upcoming = meetings.filter((m) => new Date(m.startAt) >= new Date() && m.status === "scheduled");
  const past = meetings.filter((m) => new Date(m.startAt) < new Date() || m.status !== "scheduled");

  if (loading) return <div className="flex justify-center py-4"><Loader2 size={16} className="text-primary animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
          <Calendar size={14} className="text-primary" /> Reunioes
        </h3>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 border border-primary/20">
          <Plus size={10} /> Agendar
        </button>
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Proximas</p>
          {upcoming.map((m) => {
            const d = new Date(m.startAt);
            const typeInfo = MEETING_TYPES.find((t) => t.value === m.meetingType);
            return (
              <div key={m.id} className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <span>{typeInfo?.icon}</span> {m.title}
                  </p>
                  <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                    {d.toLocaleDateString("pt-BR")} {d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {m.location && (
                  <p className="text-[10px] text-zinc-400 flex items-center gap-1"><MapPin size={8} /> {m.location}</p>
                )}
                <div className="flex items-center gap-2">
                  {m.googleCalendarUrl && (
                    <a href={m.googleCalendarUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] bg-surface border border-border text-zinc-400 hover:text-primary hover:border-primary/20 transition-colors">
                      <ExternalLink size={8} /> Google Calendar
                    </a>
                  )}
                  <button onClick={() => handleDownloadICS(m)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] bg-surface border border-border text-zinc-400 hover:text-primary hover:border-primary/20 transition-colors">
                    <Download size={8} /> Apple / Outlook
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Anteriores</p>
          {past.slice(0, 5).map((m) => {
            const d = new Date(m.startAt);
            return (
              <div key={m.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/30 transition-colors text-xs">
                <span className="text-zinc-600 w-20 shrink-0 font-mono">{d.toLocaleDateString("pt-BR")}</span>
                <span className="text-foreground flex-1 truncate">{m.title}</span>
                <span className="text-zinc-600 shrink-0">{m.createdBy}</span>
              </div>
            );
          })}
        </div>
      )}

      {meetings.length === 0 && !showForm && (
        <p className="text-xs text-zinc-600 text-center py-6">Nenhuma reuniao agendada</p>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-border rounded-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground text-sm">Agendar Reuniao</h3>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">Tipo</label>
                <div className="grid grid-cols-4 gap-2">
                  {MEETING_TYPES.map((t) => (
                    <button key={t.value} onClick={() => {
                      setForm((p) => ({
                        ...p,
                        type: t.value,
                        title: `${t.label} — ${client.nomeFantasia || client.name}`,
                      }));
                    }}
                      className={`p-2 rounded-lg border text-center text-xs transition-all ${
                        form.type === t.value ? "border-primary/50 bg-primary/10 text-white" : "border-border text-zinc-500"
                      }`}>{t.icon}<br />{t.label}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">Titulo</label>
                <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder={`${MEETING_TYPES.find((t) => t.value === form.type)?.label} — ${client.nomeFantasia || client.name}`}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">Data</label>
                  <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">Inicio</label>
                  <input type="time" value={form.startTime} onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">Fim</label>
                  <input type="time" value={form.endTime} onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">Local / Link</label>
                <input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                  placeholder="Google Meet, Zoom, Escritorio..."
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">Observacoes</label>
                <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2} placeholder="Pauta, topicos, preparacao..."
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 resize-none" />
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-2">
              <button onClick={() => setShowForm(false)} className="btn-ghost flex-1 text-sm border border-border">Cancelar</button>
              <button onClick={handleCreate} disabled={saving || !form.date}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/80 text-white text-sm font-medium disabled:opacity-50">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Agendar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
