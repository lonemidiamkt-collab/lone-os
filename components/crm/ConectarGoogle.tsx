"use client";

// Conexão do GOOGLE AGENDA da Lone no Comercial (out/2026). Dois passos, uma vez só:
//   1) a credencial do app do Google (Client ID + segredo) — o Roberto cola aqui; fica cifrada no servidor;
//   2) "Conectar" — consentimento com a conta Google da Lone; o Google devolve para a Agenda do Comercial.
// Conectado: mostra a conta e permite desconectar.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, KeyRound, Link2Off } from "lucide-react";
import { chamar } from "@/lib/api/chamar";

interface Estado { configurado: boolean; conectado: boolean; email: string | null; origem: "ambiente" | "tela" | null; redirect_uri: string }

export default function ConectarGoogle({ compacto = false, onMudou }: { compacto?: boolean; onMudou?: () => void }) {
  const [e, setE] = useState<Estado | null>(null);
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [ocupado, setOcupado] = useState(false);
  // Credencial guardada mas sem conexão: deixa trocar (18/10/2026 — o Client ID foi colado no lugar do segredo
  // e o formulário sumia, sem caminho para corrigir).
  const [trocando, setTrocando] = useState(false);
  const carregar = () => chamar<Estado>("/api/crm/google").then((r) => { if (r.ok && r.data) setE(r.data); });
  useEffect(() => { carregar(); }, []);

  async function salvarCredenciais() {
    setOcupado(true);
    const r = await chamar("/api/crm/google", { acao: "credenciais", id, secret });
    setOcupado(false);
    if (!r.ok) { toast.error(r.erro ?? "Não consegui guardar."); return; }
    setId(""); setSecret(""); setTrocando(false);
    toast.success("Credencial conferida com o Google e guardada. Agora clique em Conectar Google Agenda.");
    carregar();
  }
  async function conectar() {
    setOcupado(true);
    const r = await chamar<{ url: string }>("/api/crm/google", { acao: "conectar" });
    setOcupado(false);
    if (!r.ok || !r.data?.url) { toast.error(r.erro ?? "Não consegui iniciar."); return; }
    window.location.href = r.data.url;
  }
  async function desconectar() {
    if (!window.confirm("Desconectar o Google Agenda? As reuniões novas ficam sem Meet até conectar de novo.")) return;
    const r = await chamar("/api/crm/google", undefined, { method: "DELETE" });
    if (!r.ok) { toast.error(r.erro ?? "Não consegui desconectar."); return; }
    toast.success("Google Agenda desconectado.");
    carregar(); onMudou?.();
  }

  if (!e) return null;
  if (e.conectado) {
    return compacto ? null : (
      <div className="flex flex-wrap items-center gap-2 text-lone-caption text-muted-foreground">
        <CalendarCheck size={14} className="text-lone-success" aria-hidden="true" /> Google Agenda conectado{e.email ? ` (${e.email})` : ""}
        <button onClick={desconectar} className="inline-flex items-center gap-1 text-muted-foreground hover:text-lone-danger"><Link2Off size={12} /> desconectar</button>
      </div>
    );
  }
  return (
    <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="flex items-center gap-2 text-lone-h2 text-foreground"><CalendarCheck size={16} className="text-primary" aria-hidden="true" /> Conectar o Google Agenda da Lone</h2>
          <p className="mt-1 text-lone-caption text-muted-foreground">
            Com ele conectado, toda reunião marcada aqui vira evento no Google Agenda da Lone, com link do Meet, e o lead recebe o convite por e-mail.
            Sem ele, a reunião fica só no Lone OS.
          </p>
        </div>
        {e.configurado && !trocando && (
          <div className="flex flex-col items-end gap-1">
            <button disabled={ocupado} onClick={conectar} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {ocupado ? "Abrindo o Google…" : "Conectar Google Agenda"}
            </button>
            {e.origem === "tela" && (
              <button onClick={() => setTrocando(true)} className="inline-flex items-center gap-1 text-lone-caption text-muted-foreground hover:text-foreground"><KeyRound size={12} /> trocar credencial</button>
            )}
          </div>
        )}
      </div>
      {(!e.configurado || trocando) && (
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none" placeholder="Client ID (…apps.googleusercontent.com)" value={id} onChange={(ev) => setId(ev.target.value)} aria-label="Client ID do Google" />
          <input type="password" autoComplete="off" className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none" placeholder="Chave secreta do cliente (GOCSPX-…)" value={secret} onChange={(ev) => setSecret(ev.target.value)} aria-label="Segredo do cliente do Google" />
          <button disabled={ocupado || !id || !secret} onClick={salvarCredenciais} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-4 text-sm text-foreground hover:bg-accent disabled:opacity-50"><KeyRound size={14} /> {ocupado ? "Conferindo…" : "Guardar"}</button>
          <p className="text-lone-caption text-muted-foreground sm:col-span-3">
            O Lone OS confere com o Google antes de guardar, e fica cifrado no servidor. Endereço de volta para cadastrar no Google Cloud: <span className="font-mono text-foreground">{e.redirect_uri}</span>
            {trocando && <button onClick={() => { setTrocando(false); setId(""); setSecret(""); }} className="ml-2 text-muted-foreground underline hover:text-foreground">cancelar</button>}
          </p>
        </div>
      )}
    </section>
  );
}
