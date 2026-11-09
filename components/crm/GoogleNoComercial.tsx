"use client";

// components/crm/GoogleNoComercial.tsx — o estado do Google Agenda na Agenda do Comercial. Desde 09/11/2026 a
// conexão (credencial, conectar, reconectar, desconectar) mora no Lone OS, em Sistema › Integrações: "isso
// deveria estar no Lone OS, não no Lone Comercial". Aqui fica só o que o Comercial precisa saber e o caminho.

import { CalendarCheck, CalendarX } from "lucide-react";

/** O Comercial roda em comercial.lonemidia.com; a tela de Integrações é do painel. */
const INTEGRACOES = "https://painel.lonemidia.com/integracoes";

export default function GoogleNoComercial({ conectado, email }: { conectado: boolean; email?: string | null }) {
  if (conectado) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-lone-caption text-muted-foreground">
        <CalendarCheck size={14} className="text-lone-success" aria-hidden="true" /> Google Agenda conectado{email ? ` (${email})` : ""}
        <a href={INTEGRACOES} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">· gerenciar no Lone OS</a>
      </p>
    );
  }
  return (
    <section className="rounded-2xl border border-lone-warning-border bg-lone-warning-bg p-4">
      <p className="flex items-center gap-1.5 text-lone-body font-medium text-foreground"><CalendarX size={15} className="text-lone-warning" aria-hidden="true" /> Google Agenda desconectado</p>
      <p className="mt-1 text-lone-caption text-muted-foreground">
        Sem ele, a reunião marcada aqui fica só no Lone OS, sem link do Meet e sem convite por e-mail. A conexão do Google
        fica no Lone OS, em{" "}
        <a href={INTEGRACOES} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">Sistema › Integrações</a>.
      </p>
    </section>
  );
}
