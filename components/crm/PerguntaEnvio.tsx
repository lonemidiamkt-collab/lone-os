"use client";

// "Enviou?" na volta do WhatsApp (24/10/2026, auditoria 4.5). Abrir a conversa não conta mais como contato: a barra
// fica esperando a resposta (ela já está aqui quando a pessoa volta da aba do WhatsApp) e só o "Sim, enviei" registra.
// A regra (um pendente por lead, os textos) mora em lib/crm/enviou.ts.

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import type { EnvioPendente } from "@/lib/crm/enviou";

interface LeadDaPergunta { id: string; empresa: string | null; contatoNome: string }

export default function PerguntaEnvio<L extends LeadDaPergunta>({ pendentes, onSim, onNao }: {
  pendentes: EnvioPendente<L>[];
  onSim: (p: EnvioPendente<L>) => Promise<void>;
  onNao: (p: EnvioPendente<L>) => void;
}) {
  const [gravando, setGravando] = useState(false);
  const atual = pendentes[0];
  if (!atual) return null;
  const nome = atual.lead.empresa || atual.lead.contatoNome;
  return (
    <div role="region" aria-live="polite" aria-label="Confirmar envio no WhatsApp"
      className="fixed inset-x-4 bottom-4 z-[70] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-card px-4 py-3 shadow-xl sm:inset-x-0">
      <MessageCircle size={16} className="shrink-0 text-lone-success" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-lone-body text-foreground">
        Enviou a mensagem para <strong className="font-medium">{nome}</strong> no WhatsApp?
        {pendentes.length > 1 && <span className="block text-lone-caption text-muted-foreground">Depois desta, mais {pendentes.length - 1} para confirmar.</span>}
        <span className="block text-lone-caption text-muted-foreground">Só conta como contato (e a régua anda) se você enviou.</span>
      </p>
      <div className="flex shrink-0 gap-2">
        <button type="button" disabled={gravando} onClick={() => onNao(atual)}
          className="h-8 rounded-lg border border-border px-3 text-[13px] text-foreground hover:bg-accent disabled:opacity-50">Não enviei</button>
        <button type="button" disabled={gravando} onClick={async () => { setGravando(true); await onSim(atual); setGravando(false); }}
          className="h-8 rounded-lg bg-lone-success px-3 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-50">{gravando ? "Registrando…" : "Sim, enviei"}</button>
      </div>
    </div>
  );
}
