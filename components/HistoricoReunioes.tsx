"use client";

// HISTÓRICO DE REUNIÕES DO CLIENTE.
//
// PRA QUE (Roberto, 04/09): "o social media ou eu vou na aba do cliente, 'reuniões cadastradas', e
// consigo ter esse histórico de reunião — até pra gente ir buscar alguma informação, e eu consigo
// abrir esse histórico."
//
// Três coisas na mesma tela, porque são os três usos reais:
//   • REGISTRAR a reunião que acabou de acontecer (colar a transcrição);
//   • BUSCAR no que já foi dito ("o que ele falou sobre o prazo?");
//   • ABRIR uma reunião inteira, com transcrição e o que a IA extraiu.
//
// Os PONTOS DE ATENÇÃO ficam no topo, acumulados de todas as reuniões: é a memória viva do cliente
// e o que muda o cuidado de quem vai atender hoje.

import { useEffect, useState, useCallback } from "react";
import {
  CalendarClock, Search, FileText, Plus, X, Loader2, AlertTriangle,
  Download, ChevronDown, ChevronRight,
} from "lucide-react";
import { authedFetch } from "@/lib/supabase/authed-fetch";

interface ReuniaoLista {
  id: string; quando: string; responsavel: string | null; estado: string;
  tipo: string; resumo: string | null; palavras: number;
  temTranscricao: boolean; temPdf: boolean;
  pontosAtencao: string[]; clima: string | null;
  contagens: { decisoes: number; acoes: number; pendencias: number; sugestoes: number };
}

interface Detalhe {
  id: string; start_at: string; responsavel: string | null; resumo: string | null;
  transcricao: string | null; transcricao_palavras: number | null;
  transcricao_origem: string | null; transcricao_por: string | null;
  pontos_atencao: string[] | null; pdfUrl: string | null;
  analise: {
    decisoes?: string[];
    proximas_acoes?: { acao: string; responsavel: string | null; prazo: string | null }[];
    pendencias_cliente?: { item: string; impacto: string | null }[];
    sugestoes_briefing?: { regra: string; motivo: string }[];
    clima?: string;
  } | null;
}

const CLIMA_COR: Record<string, string> = {
  positivo: "text-lone-success", neutro: "text-muted-foreground",
  preocupado: "text-lone-warning", insatisfeito: "text-destructive",
};

const dataBR = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });

export default function HistoricoReunioes({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [lista, setLista] = useState<ReuniaoLista[]>([]);
  const [pontos, setPontos] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<{ id: string; start_at: string; trecho?: string; resumo: string | null }[] | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    authedFetch(`/api/reunioes/historico?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.ok) return;
        setLista(j.reunioes ?? []);
        setPontos(j.pontosAtencao ?? []);
      })
      .finally(() => setCarregando(false));
  }, [clientId]);

  useEffect(carregar, [carregar]);

  const buscar = () => {
    const q = busca.trim();
    if (!q) { setResultados(null); return; }
    authedFetch(`/api/reunioes/historico?clientId=${clientId}&q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setResultados(j?.reunioes ?? []));
  };

  const abrir = (id: string) => {
    if (aberta === id) { setAberta(null); setDetalhe(null); return; }
    setAberta(id); setDetalhe(null);
    authedFetch(`/api/reunioes/historico?id=${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDetalhe(j?.reuniao ?? null));
  };

  const registrar = async () => {
    const t = texto.trim();
    // O mesmo mínimo da rota, checado aqui para a pessoa saber ANTES de esperar a IA.
    if (t.split(/\s+/).filter(Boolean).length < 40) {
      setAviso("A transcrição precisa de pelo menos 40 palavras — abaixo disso é recado, não reunião.");
      return;
    }
    setEnviando(true); setAviso(null);
    try {
      const r = await authedFetch("/api/reunioes/transcricao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, transcricao: t, origem: "texto" }),
      });
      const j = await r.json();
      if (!r.ok) { setAviso(j?.error ?? "não consegui registrar"); return; }
      setAviso(j.analisada
        ? `Registrei. ${j.pontos_atencao?.length ?? 0} ponto(s) de atenção${j.sugestoes_briefing?.length ? ` · ${j.sugestoes_briefing.length} sugestão(ões) pro briefing` : ""}.`
        : (j.aviso ?? "Transcrição guardada."));
      setTexto(""); setRegistrando(false);
      carregar();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CalendarClock size={14} className="text-primary" /> Reuniões cadastradas
          {lista.length > 0 && <span className="text-[10px] text-muted-foreground font-normal">· {lista.length}</span>}
        </h3>
        <button
          onClick={() => { setRegistrando((v) => !v); setAviso(null); }}
          className="text-[11px] px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium flex items-center gap-1.5 hover:opacity-90"
        >
          {registrando ? <X size={12} /> : <Plus size={12} />}
          {registrando ? "Cancelar" : "Registrar reunião"}
        </button>
      </div>

      {/* MEMÓRIA VIVA — o que muda o cuidado com este cliente, de todas as reuniões */}
      {pontos.length > 0 && !registrando && (
        <div className="mb-4 p-3 rounded-xl bg-surface border border-border">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <AlertTriangle size={11} className="text-lone-warning" /> Pontos de atenção
          </p>
          <ul className="space-y-1">
            {pontos.map((p, i) => (
              <li key={i} className="text-[12px] text-foreground leading-snug">• {p}</li>
            ))}
          </ul>
        </div>
      )}

      {/* REGISTRAR */}
      {registrando && (
        <div className="mb-4 space-y-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={`Cole aqui a transcrição da reunião com a ${clientName} — do Meet, do Zoom, ou suas anotações.\n\nO sistema guarda o texto inteiro e extrai decisões, pendências do cliente, pontos de atenção e o que vale mudar no briefing.`}
            className="w-full h-44 p-3 rounded-xl bg-surface border border-border text-[12.5px] text-foreground placeholder:text-muted-foreground/60 resize-y focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              {texto.trim() ? `${texto.trim().split(/\s+/).filter(Boolean).length} palavras` : "mínimo 40 palavras"}
            </span>
            <button
              onClick={registrar}
              disabled={enviando}
              className="text-[11px] px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              {enviando ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
              {enviando ? "Analisando…" : "Guardar e analisar"}
            </button>
          </div>
        </div>
      )}

      {aviso && (
        <p className="mb-3 text-[11px] text-foreground bg-surface border border-border rounded-lg p-2.5">{aviso}</p>
      )}

      {/* BUSCAR */}
      {lista.some((r) => r.temTranscricao) && !registrando && (
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => { setBusca(e.target.value); if (!e.target.value.trim()) setResultados(null); }}
              onKeyDown={(e) => e.key === "Enter" && buscar()}
              placeholder="Buscar no que foi dito nas reuniões…"
              className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-surface border border-border text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button onClick={buscar} className="text-[11px] px-3 rounded-lg bg-surface border border-border text-foreground hover:border-primary">
            Buscar
          </button>
        </div>
      )}

      {/* RESULTADOS DA BUSCA */}
      {resultados !== null && (
        <div className="mb-4">
          <p className="text-[10px] text-muted-foreground mb-2">
            {resultados.length ? `${resultados.length} reunião(ões) citando "${busca}"` : `Nada encontrado sobre "${busca}"`}
          </p>
          <div className="space-y-2">
            {resultados.map((r) => (
              <button key={r.id} onClick={() => abrir(r.id)} className="w-full text-left p-2.5 rounded-lg bg-surface border border-border hover:border-primary">
                <p className="text-[11px] text-muted-foreground mb-1">{dataBR(r.start_at)}</p>
                {/* O trecho vem do banco com <b> marcando o termo — é o que responde na própria lista. */}
                <p className="text-[12px] text-foreground leading-snug"
                   dangerouslySetInnerHTML={{ __html: r.trecho ?? r.resumo ?? "" }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* LISTA */}
      {carregando && <p className="text-[11px] text-muted-foreground">Carregando…</p>}
      {!carregando && !lista.length && !registrando && (
        <p className="text-[11px] text-muted-foreground">
          Nenhuma reunião registrada ainda. Depois da próxima, cole a transcrição aqui — o histórico
          fica guardado e dá pra buscar nele depois.
        </p>
      )}

      <div className="space-y-2">
        {lista.map((r) => (
          <div key={r.id} className="rounded-xl bg-surface border border-border overflow-hidden">
            <button onClick={() => abrir(r.id)} className="w-full text-left p-3 flex items-start justify-between gap-3 hover:bg-card/40">
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-foreground">
                  {dataBR(r.quando)}
                  {r.responsavel && <span className="text-muted-foreground font-normal"> · {r.responsavel}</span>}
                  {r.clima && <span className={`ml-1.5 ${CLIMA_COR[r.clima] ?? "text-muted-foreground"}`}>· {r.clima}</span>}
                </p>
                {r.resumo && <p className="text-[11.5px] text-muted-foreground mt-0.5 line-clamp-2">{r.resumo}</p>}
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  {r.temTranscricao ? `${r.palavras} palavras` : "sem transcrição"}
                  {r.contagens.decisoes > 0 && ` · ${r.contagens.decisoes} decisão(ões)`}
                  {r.contagens.pendencias > 0 && ` · ${r.contagens.pendencias} pendência(s)`}
                </p>
              </div>
              {aberta === r.id ? <ChevronDown size={14} className="text-muted-foreground shrink-0 mt-1" />
                              : <ChevronRight size={14} className="text-muted-foreground shrink-0 mt-1" />}
            </button>

            {aberta === r.id && (
              <div className="px-3 pb-3 border-t border-border pt-3">
                {!detalhe && <p className="text-[11px] text-muted-foreground">Abrindo…</p>}
                {detalhe && (
                  <div className="space-y-3">
                    {detalhe.pdfUrl && (
                      <a href={detalhe.pdfUrl} target="_blank" rel="noreferrer"
                         className="inline-flex items-center gap-1.5 text-[11px] text-primary hover:underline">
                        <Download size={11} /> Abrir a ata em PDF
                      </a>
                    )}
                    <Secao titulo="Decisões" itens={detalhe.analise?.decisoes ?? []} />
                    <Secao titulo="O que a Lone vai fazer"
                           itens={(detalhe.analise?.proximas_acoes ?? []).map((a) =>
                             `${a.acao}${a.responsavel ? ` — ${a.responsavel}` : ""}${a.prazo ? ` (${a.prazo})` : ""}`)} />
                    <Secao titulo="O que o cliente ficou de fazer"
                           itens={(detalhe.analise?.pendencias_cliente ?? []).map((p) =>
                             `${p.item}${p.impacto ? ` — ${p.impacto}` : ""}`)} />
                    <Secao titulo="Sugestões pro briefing"
                           itens={(detalhe.analise?.sugestoes_briefing ?? []).map((s) => `${s.regra} — ${s.motivo}`)} />
                    {detalhe.transcricao && (
                      <details className="mt-2">
                        <summary className="text-[10px] uppercase tracking-wide text-muted-foreground cursor-pointer">
                          Transcrição completa ({detalhe.transcricao_palavras} palavras)
                        </summary>
                        <p className="mt-2 text-[11.5px] text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                          {detalhe.transcricao}
                        </p>
                      </details>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Secao({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens.length) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{titulo}</p>
      <ul className="space-y-0.5">
        {itens.map((i, k) => <li key={k} className="text-[12px] text-foreground leading-snug">• {i}</li>)}
      </ul>
    </div>
  );
}
