"use client";

// components/integracoes/ConexaoGoogle.tsx — os botões da conexão do Google da Lone (Agenda + Drive), dentro do
// cartão do Google em Sistema › Integrações. Saiu do Comercial em 09/11/2026 ("isso deveria estar no Lone OS").
// O ESTADO (ok / falta o Drive / API desligada) quem mostra é o cartão (lib/integracoes/catalogo.ts); aqui ficam
// as ações, só para admin:
//   1) a credencial do app do Google (Client ID + segredo) — colada aqui, conferida com o Google, cifrada no servidor;
//   2) Conectar / Reconectar — consentimento com a conta Google da Lone; o Google devolve para /integracoes;
//   3) Desconectar.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Link2Off, RefreshCw } from "lucide-react";
import { chamar } from "@/lib/api/chamar";

interface Estado {
  configurado: boolean; conectado: boolean; email: string | null; drive: boolean | null;
  origem: "ambiente" | "tela" | null; redirect_uri: string; podeAlterar: boolean;
}

const campo = "h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none";

export default function ConexaoGoogle({ onMudou }: { onMudou?: () => void }) {
  const [e, setE] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [ocupado, setOcupado] = useState(false);
  // Credencial guardada mas sem conexão: deixa trocar (18/10/2026 — o Client ID foi colado no lugar do segredo
  // e o formulário sumia, sem caminho para corrigir).
  const [trocando, setTrocando] = useState(false);
  const carregar = () => chamar<Estado>("/api/integracoes/google").then((r) => {
    if (r.ok && r.data) { setE(r.data); setErro(null); } else setErro(r.erro ?? "Não consegui ler a conexão do Google.");
  });
  useEffect(() => { void carregar(); }, []);

  async function salvarCredenciais() {
    setOcupado(true);
    const r = await chamar("/api/integracoes/google", { acao: "credenciais", id, secret });
    setOcupado(false);
    if (!r.ok) { toast.error(r.erro ?? "Não consegui guardar."); return; }
    setId(""); setSecret(""); setTrocando(false);
    toast.success("Credencial conferida com o Google e guardada. Agora clique em Conectar Google.");
    void carregar(); onMudou?.();
  }
  async function conectar() {
    setOcupado(true);
    const r = await chamar<{ url: string }>("/api/integracoes/google", { acao: "conectar" });
    setOcupado(false);
    if (!r.ok || !r.data?.url) { toast.error(r.erro ?? "Não consegui abrir o Google."); return; }
    window.location.href = r.data.url;
  }
  async function desconectar() {
    if (!window.confirm("Desconectar o Google da Lone? As reuniões novas do Comercial ficam sem Meet e a pasta do cliente deixa de ser criada até conectar de novo.")) return;
    const r = await chamar("/api/integracoes/google", undefined, { method: "DELETE" });
    if (!r.ok) { toast.error(r.erro ?? "Não consegui desconectar."); return; }
    toast.success("Google desconectado.");
    void carregar(); onMudou?.();
  }

  if (erro) return <p className="text-lone-caption text-lone-danger">{erro} <button onClick={() => void carregar()} className="underline">Tentar de novo</button></p>;
  if (!e) return null;
  if (!e.podeAlterar) return <p className="text-lone-caption text-muted-foreground">Conectar e desconectar o Google é com um sócio (admin).</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {e.configurado && !trocando && (
          <button disabled={ocupado} onClick={() => void conectar()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <RefreshCw size={14} aria-hidden="true" /> {ocupado ? "Abrindo o Google…" : e.conectado ? "Reconectar Google" : "Conectar Google"}
          </button>
        )}
        {e.conectado && (
          <button onClick={() => void desconectar()} className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm text-muted-foreground hover:text-lone-danger">
            <Link2Off size={14} aria-hidden="true" /> Desconectar
          </button>
        )}
        {e.configurado && !e.conectado && e.origem === "tela" && !trocando && (
          <button onClick={() => setTrocando(true)} className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground">
            <KeyRound size={14} aria-hidden="true" /> Trocar credencial
          </button>
        )}
      </div>
      {e.conectado && (
        <p className="text-lone-caption text-muted-foreground">
          Reconectar pede de novo a permissão da Agenda e do Drive. O Lone OS só enxerga as pastas que ele mesmo cria no Drive, nunca o resto.
        </p>
      )}
      {(!e.configurado || trocando) && (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input className={campo} placeholder="Client ID (…apps.googleusercontent.com)" value={id} onChange={(ev) => setId(ev.target.value)} aria-label="Client ID do Google" />
          <input type="password" autoComplete="off" className={campo} placeholder="Chave secreta do cliente (GOCSPX-…)" value={secret} onChange={(ev) => setSecret(ev.target.value)} aria-label="Segredo do cliente do Google" />
          <button disabled={ocupado || !id || !secret} onClick={() => void salvarCredenciais()} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-4 text-sm text-foreground hover:bg-accent disabled:opacity-50">
            <KeyRound size={14} aria-hidden="true" /> {ocupado ? "Conferindo…" : "Guardar"}
          </button>
          <p className="text-lone-caption text-muted-foreground sm:col-span-3">
            O Lone OS confere com o Google antes de guardar, e fica cifrado no servidor. Endereço de volta para cadastrar no Google Cloud: <span className="font-mono text-foreground">{e.redirect_uri}</span>
            {trocando && <button onClick={() => { setTrocando(false); setId(""); setSecret(""); }} className="ml-2 underline hover:text-foreground">cancelar</button>}
          </p>
        </div>
      )}
    </div>
  );
}
