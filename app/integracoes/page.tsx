"use client";

// Sistema › Integrações — os aplicativos que o Lone OS usa, conferidos agora (lib/integracoes/). Pedido do
// Roberto (09/11/2026): a conexão do Google estava no Comercial e "deveria estar no Lone OS… para ter controle
// lá dessas automações e aplicativos que a gente está utilizando no sistema no geral".
//
// Um cartão por aplicativo: o que depende dele, o estado (testado na hora, nunca suposto) e onde se resolve.
// O Google se conecta aqui mesmo; a Meta tem tela própria (Conexão Meta); o resto se resolve fora ou no servidor.
// Rotinas agendadas ficam na Central de Automações; os agentes de IA, na Central de Agentes.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, CircleSlash, ExternalLink, RefreshCw, XCircle } from "lucide-react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import ConexaoGoogle from "@/components/integracoes/ConexaoGoogle";
import { useRole } from "@/lib/context/RoleContext";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import type { EstadoIntegracao, SituacaoIntegracao } from "@/lib/integracoes/catalogo";

interface Resposta { integracoes: EstadoIntegracao[]; conferidoEm: string; podeConectar: boolean }

const UI: Record<SituacaoIntegracao, { rotulo: string; classe: string; Icone: typeof CheckCircle2 }> = {
  ok: { rotulo: "Funcionando", classe: "border-lone-success-border bg-lone-success-bg text-lone-success", Icone: CheckCircle2 },
  atencao: { rotulo: "Precisa de atenção", classe: "border-lone-warning-border bg-lone-warning-bg text-lone-warning", Icone: AlertTriangle },
  erro: { rotulo: "Com problema", classe: "border-lone-danger-border bg-lone-danger-bg text-lone-danger", Icone: XCircle },
  desligada: { rotulo: "Desligada", classe: "border-border bg-muted text-muted-foreground", Icone: CircleSlash },
};

const MOTIVO_GOOGLE: Record<string, string> = {
  access_denied: "o consentimento foi cancelado no Google",
  state: "o pedido expirou (mais de 10 minutos) — clique em Reconectar de novo",
};

function Cartao({ i, onMudou }: { i: EstadoIntegracao; onMudou: () => void }) {
  const ui = UI[i.situacao];
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5" aria-labelledby={`int-${i.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={`int-${i.id}`} className="text-lone-body font-medium text-foreground">{i.nome}</h3>
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-lone-caption font-medium", ui.classe)}>
          <ui.Icone size={12} aria-hidden="true" /> {ui.rotulo}
        </span>
      </div>
      <p className="text-lone-caption text-muted-foreground">{i.servePara}</p>
      <p className={cn("text-lone-body", i.situacao === "ok" ? "text-foreground" : i.situacao === "desligada" ? "text-muted-foreground" : "text-foreground font-medium")}>{i.resumo}</p>
      {i.detalhes.length > 0 && (
        <ul className="space-y-1 text-lone-caption text-muted-foreground">
          {i.detalhes.map((d, k) => <li key={k}>{d}</li>)}
        </ul>
      )}
      {i.acao && (
        i.acao.externo ? (
          <a href={i.acao.href} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-lone-caption font-medium text-primary hover:underline">
            {i.acao.rotulo} <ExternalLink size={11} aria-hidden="true" />
          </a>
        ) : (
          <Link href={i.acao.href} className="inline-flex w-fit items-center gap-1 text-lone-caption font-medium text-primary hover:underline">{i.acao.rotulo} →</Link>
        )
      )}
      {i.id === "google" && <div className="border-t border-border pt-3"><ConexaoGoogle onMudou={onMudou} /></div>}
    </section>
  );
}

export default function IntegracoesPage() {
  const { role, hydrated } = useRole();
  const gestao = role === "admin" || role === "manager";
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await chamar<Resposta>("/api/integracoes");
    setCarregando(false);
    if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui conferir as integrações."); return; }
    setErro(null); setDados(r.data);
  }, []);
  useEffect(() => { if (gestao) void carregar(); }, [gestao, carregar]);

  // Volta do consentimento do Google (/api/auth/google/callback → ?google=ok|erro). Lido do endereço e limpo,
  // para o aviso não repetir ao recarregar.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const g = q.get("google");
    if (!g) return;
    if (g === "ok") toast.success(`Google conectado${q.get("email") ? ` (${q.get("email")})` : ""}.`);
    else {
      const m = q.get("motivo") ?? "";
      toast.error(`O Google não conectou: ${MOTIVO_GOOGLE[m] ?? (m || "erro desconhecido")}.`);
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  if (!hydrated) return null;
  if (!gestao) {
    return (
      <div className="flex-1 min-w-0 overflow-auto">
        <Header title="Integrações" />
        <div className="p-6"><p className="text-lone-body text-muted-foreground">Esta área é só da gestão.</p></div>
      </div>
    );
  }

  const lista = dados?.integracoes ?? [];
  const problemas = lista.filter((i) => i.situacao === "erro" || i.situacao === "atencao").length;
  const grupos: { titulo: string; descricao: string; itens: EstadoIntegracao[] }[] = [
    { titulo: "Principais", descricao: "Quando uma destas para, parte do trabalho do time para junto.", itens: lista.filter((i) => i.grupo === "principal") },
    { titulo: "De apoio", descricao: "Serviços por trás de uma função (PDF, e-mail, sistemas da Lone).", itens: lista.filter((i) => i.grupo === "apoio") },
  ];

  return (
    <div className="flex-1 min-w-0 overflow-auto">
      <Header title="Integrações" />
      <div className="mx-auto max-w-[1200px] space-y-6 p-4 animate-fade-in sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-prose text-lone-body text-muted-foreground">
            Os aplicativos que o Lone OS usa, conferidos agora: o que depende de cada um e onde se resolve. As rotinas
            agendadas ficam na <Link href="/automations" className="text-foreground underline underline-offset-2 hover:text-primary">Central de Automações</Link>;
            os agentes de IA, na <Link href="/agentes" className="text-foreground underline underline-offset-2 hover:text-primary">Central de Agentes</Link>.
          </p>
          <div className="flex items-center gap-3">
            {dados && (
              <span className="text-lone-caption text-muted-foreground">
                {problemas ? `${problemas} precisa${problemas === 1 ? "" : "m"} de atenção · ` : "Tudo funcionando · "}
                conferido às {new Date(dados.conferidoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
              <RefreshCw className={cn(carregando && "animate-spin")} /> Conferir de novo
            </Button>
          </div>
        </div>

        {erro && (
          <p className="rounded-lg border border-lone-danger-border bg-lone-danger-bg p-3 text-lone-body text-lone-danger">
            {erro} <button onClick={() => void carregar()} className="underline">Tentar de novo</button>
          </p>
        )}
        {!dados && !erro && <p className="text-lone-body text-muted-foreground">Conferindo cada aplicativo… (leva alguns segundos)</p>}

        {dados && grupos.map((g) => (
          <div key={g.titulo} className="space-y-3">
            <div>
              <h2 className="text-lone-h2 tracking-tight text-foreground">{g.titulo}</h2>
              <p className="text-lone-caption text-muted-foreground">{g.descricao}</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {g.itens.map((i) => <Cartao key={i.id} i={i} onMudou={() => void carregar()} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
