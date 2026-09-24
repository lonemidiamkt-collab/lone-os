"use client";

// components/agente/GavetaMensagens.tsx — as últimas mensagens do cliente no grupo, numa gaveta ao
// lado do feed (Leva 7C, N26). Decidir "o que responder" sem abrir o WhatsApp nem a ficha.
// Fonte: GET /api/cs/mensagens (cs_message_corpus). Esc fecha.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, MessageCircle, X } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { dataHoraCurta } from "@/components/client/ficha/rotulos";

interface Mensagem { em: string; autor: string | null; texto: string; doTime: boolean }
interface Resposta { cliente: string | null; grupo: string | null; ultimaDoClienteEm: string | null; mensagens: Mensagem[] }

export default function GavetaMensagens({ clientId, titulo, aoFechar }: { clientId: string; titulo: string; aoFechar: () => void }) {
  const [comTime, setComTime] = useState(false);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const fechar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let vivo = true;
    setDados(null); setErro(null);
    chamar<Resposta>(`/api/cs/mensagens?clientId=${clientId}&n=${comTime ? 10 : 5}${comTime ? "&comTime=1" : ""}`).then((r) => {
      if (!vivo) return;
      if (!r.ok || !r.data) setErro(r.erro ?? "Não consegui ler as mensagens.");
      else setDados(r.data);
    });
    return () => { vivo = false; };
  }, [clientId, comTime]);

  useEffect(() => {
    fechar.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); aoFechar(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aoFechar]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-overlay" onClick={aoFechar} aria-hidden="true" />
      <aside role="dialog" aria-modal="true" aria-labelledby="gaveta-mensagens-titulo"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-sm">
        <header className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <p className="text-lone-eyebrow uppercase text-muted-foreground">Últimas mensagens</p>
            <h2 id="gaveta-mensagens-titulo" className="truncate text-lone-h2 text-foreground">{dados?.cliente ?? titulo}</h2>
            {dados?.grupo && <p className="truncate text-lone-caption text-muted-foreground">{dados.grupo}</p>}
          </div>
          <button ref={fechar} onClick={aoFechar} aria-label="Fechar"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={comTime} onChange={(e) => setComTime(e.target.checked)} className="accent-primary" />
            Mostrar também as respostas do time
          </label>
          {dados?.ultimaDoClienteEm && <span className="text-[11px] text-muted-foreground">cliente: {dataHoraCurta(dados.ultimaDoClienteEm)}</span>}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          {!dados && !erro && [1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}
          {dados && dados.mensagens.length === 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <MessageCircle size={15} aria-hidden="true" /> Nenhuma mensagem do cliente registrada no grupo.
            </p>
          )}
          {dados?.mensagens.map((m, i) => (
            <div key={`${m.em}-${i}`} className={m.doTime ? "ml-8 rounded-lg bg-primary/10 p-3" : "mr-8 rounded-lg bg-muted p-3"}>
              <p className="text-[11px] text-muted-foreground">{m.autor ?? (m.doTime ? "Time" : "Cliente")} · {dataHoraCurta(m.em)}</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground [overflow-wrap:anywhere]">{m.texto}</p>
            </div>
          ))}
        </div>

        <footer className="border-t border-border p-4">
          <Link href={`/clients/${clientId}?tab=relacionamento`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Linha do tempo do cliente <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </footer>
      </aside>
    </>
  );
}
