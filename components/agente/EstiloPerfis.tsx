"use client";

// Revisão dos PERFIS DE ESTILO aprendidos (passo 2) — antes de ligar no agente (passo 3). Admin edita
// o perfil de cada cliente e do time; gera agora (roda o cs-estilo); testa em dry.

import { useState, useEffect } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { Loader2, Wand2, Save, Check } from "lucide-react";

interface ClientProfile { clientId: string; name: string; estilo: string }

function ProfileCard({ label, keyName, value, onSaved }: { label: string; keyName: string; value: string; onSaved: (v: string) => void }) {
  const [txt, setTxt] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => setTxt(value), [value]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await authedFetch("/api/cs/estilo-perfis", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", key: keyName, value: txt }),
      });
      if (r.ok) { onSaved(txt); setSaved(true); setTimeout(() => setSaved(false), 1500); }
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <button onClick={save} disabled={saving || txt === value} className="flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-40 disabled:no-underline">
          {saving ? <Loader2 size={11} className="animate-spin" /> : saved ? <Check size={11} className="text-lone-success" /> : <Save size={11} />}
          {saved ? "Salvo" : "Salvar"}
        </button>
      </div>
      <textarea
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        rows={3}
        className="w-full bg-muted rounded-md px-2.5 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary resize-y"
        placeholder="(sem perfil gerado ainda)"
      />
    </div>
  );
}

export default function EstiloPerfis() {
  const [team, setTeam] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    authedFetch("/api/cs/estilo-perfis")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setTeam(d.team ?? null); setClients(d.clients ?? []); } })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const gerar = async (dry: boolean) => {
    setGerando(true); setFlash(null);
    try {
      const r = await authedFetch("/api/cs/estilo-perfis", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", dry }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setFlash(`${dry ? "Teste: " : ""}${d.perfis_gerados ?? 0} perfil(is) ${dry ? "seriam gerados" : "gerados"}${d.detalhe?.length ? ` (${d.detalhe.join(", ")})` : " — corpus ainda sem material suficiente"}`); if (!dry) load(); }
      else setFlash(d.error || "Falha ao gerar.");
    } catch { setFlash("Falha de conexão."); }
    setGerando(false);
  };

  const total = (team ? 1 : 0) + clients.length;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-foreground">🎨 Estilo de comunicação aprendido</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => gerar(true)} disabled={gerando} className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40">Testar</button>
          <button onClick={() => gerar(false)} disabled={gerando} className="flex items-center gap-1 rounded-lg bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 text-[11px] font-medium hover:bg-primary/15 disabled:opacity-40">
            {gerando ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />} Gerar agora
          </button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        A IA resume o jeito de falar de cada cliente e do time (das conversas dos grupos). <strong className="text-foreground">Revise/edite aqui</strong> antes de ligar no agente. Ainda NÃO afeta as respostas do agente.
      </p>

      {flash && <p className="text-[11px] text-muted-foreground mb-3 rounded-lg bg-muted/50 px-3 py-2">{flash}</p>}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-primary" /></div>
      ) : total === 0 ? (
        <p className="text-xs text-muted-foreground/70 py-4 text-center">
          Nenhum perfil ainda. O corpus de conversas precisa acumular (uns dias). Clique em <strong>Gerar agora</strong> quando houver material — ou deixe o cron diário fazer.
        </p>
      ) : (
        <div className="space-y-2.5">
          <ProfileCard label="🏢 Time da Lone" keyName="cs_style:team" value={team ?? ""} onSaved={(v) => setTeam(v || null)} />
          {clients.map((c) => (
            <ProfileCard key={c.clientId} label={c.name} keyName={`cs_style:${c.clientId}`} value={c.estilo}
              onSaved={(v) => setClients((prev) => prev.map((x) => x.clientId === c.clientId ? { ...x, estilo: v } : x))} />
          ))}
        </div>
      )}
    </section>
  );
}
