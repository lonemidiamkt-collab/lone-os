"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { MessageCircle, Copy, Check, Plus, X, Loader2 } from "lucide-react";
import type { Client } from "@/lib/types";

interface Template {
  id: string; name: string; category: string; body: string;
}

interface Props {
  client?: Client;
}

export default function WhatsAppTemplates({ client }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", category: "geral", body: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.from("whatsapp_templates").select("*").order("category").then(({ data, error }) => {
      if (!mounted) return;
      if (!error && data) setTemplates(data.map((r) => ({ id: r.id, name: r.name, category: r.category, body: r.body })));
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const fillTemplate = (body: string): string => {
    if (!client) return body;
    return body
      .replace(/\{\{nome\}\}/g, client.contactName || client.name || "")
      .replace(/\{\{empresa\}\}/g, client.nomeFantasia || client.name || "")
      .replace(/\{\{mes\}\}/g, new Date().toLocaleString("pt-BR", { month: "long" }));
  };

  const handleCopy = (id: string, body: string) => {
    const filled = fillTemplate(body);
    navigator.clipboard.writeText(filled).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);

    if (client) {
      supabase.from("communication_logs").insert({
        client_id: client.id, channel: "whatsapp", direction: "outgoing",
        summary: `Template copiado: ${filled.slice(0, 80)}...`, logged_by: "Sistema",
      }).then(() => {});
    }
  };

  const handleAdd = async () => {
    if (!newForm.name || !newForm.body) return;
    setSaving(true);
    await supabase.from("whatsapp_templates").insert({
      name: newForm.name, category: newForm.category, body: newForm.body, created_by: "Admin",
    });
    setNewForm({ name: "", category: "geral", body: "" });
    setShowAdd(false);
    setSaving(false);
    const { data } = await supabase.from("whatsapp_templates").select("*").order("category");
    if (data) setTemplates(data.map((r) => ({ id: r.id, name: r.name, category: r.category, body: r.body })));
  };

  const categories = [...new Set(templates.map((t) => t.category))];

  if (loading) return <div className="flex justify-center py-4"><Loader2 size={16} className="text-primary animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
          <MessageCircle size={14} className="text-emerald-500" /> Templates WhatsApp
        </h3>
        <button onClick={() => setShowAdd(!showAdd)}
          className="btn-ghost text-xs flex items-center gap-1 border border-border hover:border-emerald-500/30 hover:text-emerald-400">
          <Plus size={10} /> Novo Template
        </button>
      </div>

      {showAdd && (
        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <input value={newForm.name} onChange={(e) => setNewForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Nome do template" className="w-full bg-card border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none" />
          <select value={newForm.category} onChange={(e) => setNewForm((p) => ({ ...p, category: e.target.value }))}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none">
            <option value="onboarding">Onboarding</option>
            <option value="relacionamento">Relacionamento</option>
            <option value="financeiro">Financeiro</option>
            <option value="operacional">Operacional</option>
            <option value="resultados">Resultados</option>
            <option value="geral">Geral</option>
          </select>
          <textarea value={newForm.body} onChange={(e) => setNewForm((p) => ({ ...p, body: e.target.value }))}
            rows={3} placeholder="Texto da mensagem... Use {{nome}}, {{empresa}}, {{mes}}"
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none resize-none" />
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)} className="btn-ghost flex-1 text-xs border border-border">Cancelar</button>
            <button onClick={handleAdd} disabled={saving || !newForm.name || !newForm.body}
              className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs border border-emerald-500/20 disabled:opacity-50">
              {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Salvar
            </button>
          </div>
        </div>
      )}

      {categories.map((cat) => (
        <div key={cat} className="space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{cat}</p>
          {templates.filter((t) => t.category === cat).map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-surface p-3 flex items-start gap-3 group hover:border-emerald-500/20 transition-all">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground mb-1">{t.name}</p>
                <p className="text-[11px] text-zinc-400 line-clamp-2">{client ? fillTemplate(t.body) : t.body}</p>
              </div>
              <button onClick={() => handleCopy(t.id, t.body)}
                className={`shrink-0 p-2 rounded-lg border transition-all ${
                  copied === t.id ? "bg-emerald-500/15 border-emerald-500/20 text-emerald-400" : "border-border text-zinc-600 hover:text-emerald-400 hover:border-emerald-500/20"
                }`}>
                {copied === t.id ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
          ))}
        </div>
      ))}

      {client?.phone && (
        <a href={`https://wa.me/55${client.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 text-xs font-medium border border-emerald-500/20 hover:bg-emerald-500/25 transition-colors">
          <MessageCircle size={13} /> Abrir WhatsApp de {client.contactName || client.name}
        </a>
      )}
    </div>
  );
}
