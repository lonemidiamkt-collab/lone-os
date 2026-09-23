"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { chamar } from "@/lib/api/chamar";

// INTELIGÊNCIA CRIATIVA no quadro principal do gestor (pedido do Roberto, 14/09): o resumo do dia
// (vencedores, críticos, testes rodando) com atalho para Saúde dos Criativos. Só lê; a ação fica lá.
interface Resposta { dia: string | null; itens: { estado: string; vencedor: boolean; cliente: string; ad_name: string | null }[]; testes?: { etapa: string; cliente: string; variavel: string }[]; precisao: { concordo: number; total: number; taxa: number } | null }

export default function AtalhoCriativos() {
  const [d, setD] = useState<Resposta | null>(null);
  useEffect(() => { void chamar<Resposta>("/api/traffic/criativos").then((r) => { if (r.ok && r.data) setD(r.data); }); }, []);
  if (!d?.dia) return null;
  const vencedores = d.itens.filter((i) => i.vencedor);
  const criticos = d.itens.filter((i) => !i.vencedor && i.estado === "CRITICAL");
  const fadiga = d.itens.filter((i) => i.estado.startsWith("FATIGUE"));
  const testes = (d.testes ?? []).filter((t) => t.etapa !== "concluido");
  const nomes = (l: { cliente: string }[]) => [...new Set(l.map((x) => x.cliente))].slice(0, 3).join(", ");
  return (
    <Link href="/traffic/criativos" className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 text-xs transition hover:border-primary/40">
      <span className="inline-flex items-center gap-1.5 font-semibold text-foreground"><HeartPulse size={14} className="text-primary" /> Inteligência Criativa <span className="font-normal text-muted-foreground">· {d.dia.split("-").reverse().join("/")}</span></span>
      <span className="text-foreground"><b className="text-lone-success">{vencedores.length}</b> vencedor{vencedores.length === 1 ? "" : "es"}{vencedores.length ? <span className="text-muted-foreground"> — {nomes(vencedores)}</span> : null}</span>
      <span className="text-foreground"><b className="text-destructive">{criticos.length}</b> crítico{criticos.length === 1 ? "" : "s"}{criticos.length ? <span className="text-muted-foreground"> — {nomes(criticos)}</span> : null}</span>
      {fadiga.length > 0 && <span className="text-foreground"><b className="text-lone-warning">{fadiga.length}</b> com fadiga</span>}
      <span className="text-foreground"><b>{testes.length}</b> teste{testes.length === 1 ? "" : "s"} de variação no ar</span>
      {d.precisao && <span className="text-muted-foreground">rótulos do Julio: {d.precisao.concordo}/{d.precisao.total} ({d.precisao.taxa}%)</span>}
      <span className="ml-auto text-primary">Abrir Saúde dos Criativos →</span>
    </Link>
  );
}
