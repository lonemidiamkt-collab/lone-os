"use client";

// A FICHA DA REUNIÃO — o registro inteiro, num lugar.
//
// Roberto (09/09): "toda reunião realizada é parte da memória operacional do cliente […] deve
// preservar quem participou, quando aconteceu, o que foi discutido, o que foi decidido, o que
// ficou pendente e quais materiais estavam envolvidos."
//
// Abre do calendário e da ficha do cliente, sobre o mesmo registro. Duas portas, um objeto.
//
// O que se escreve aqui é do HUMANO (briefing, decisões, próximos passos) e fica separado do que
// a IA extrai da transcrição (resumo, análise): são coisas diferentes, e uma não substitui a
// outra. Misturar faria a pessoa desconfiar das duas.

import { useEffect, useState, useCallback } from "react";
import { X, Check, Loader2, Paperclip, Trash2, Download, Clock, User, AlertTriangle } from "lucide-react";
import { authedFetch } from "@/lib/supabase/authed-fetch";

export interface ReuniaoResumida {
  id: string;
  cliente: string;
  clientId: string;
  quando: string;
  estado: string;
  responsavel: string | null;
}

interface Detalhe {
  id: string; start_at: string; end_at: string | null; estado: string;
  responsavel: string | null; duration_minutes: number | null;
  briefing: string | null; decisoes: string | null; proximos_passos: string | null;
  briefing_em: string | null; briefing_por: string | null;
  resumo: string | null; realizada_em: string | null; created_by: string | null;
  created_at: string; meeting_source: string | null;
  anexos: { id: string; nome: string; tamanho: number | null; url: string | null; enviadoPor: string | null; em: string }[];
}

const ROTULO: Record<string, { txt: string; cor: string }> = {
  agendada:  { txt: "🕐 Agendada",             cor: "text-primary" },
  realizada: { txt: "✅ Realizada",             cor: "text-lone-success" },
  no_show:   { txt: "⚠️ Cliente não compareceu", cor: "text-lone-warning" },
  cancelada: { txt: "❌ Cancelada",             cor: "text-muted-foreground" },
};

const dataBR = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
const horaBR = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const carimbo = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default function FichaReuniao({ reuniao, onFechar, onMudou }: {
  reuniao: ReuniaoResumida;
  onFechar: () => void;
  onMudou?: () => void;
}) {
  const [d, setD] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [form, setForm] = useState({ briefing: "", decisoes: "", proximos_passos: "" });

  const carregar = useCallback(() => {
    authedFetch(`/api/reunioes/ficha?id=${reuniao.id}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error); return j; })
      .then((j) => {
        setD(j.reuniao);
        setForm({
          briefing: j.reuniao.briefing ?? "",
          decisoes: j.reuniao.decisoes ?? "",
          proximos_passos: j.reuniao.proximos_passos ?? "",
        });
        setErro(null);
      })
      .catch((e: Error) => setErro(e.message));
  }, [reuniao.id]);
  useEffect(carregar, [carregar]);

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await authedFetch("/api/reunioes/gerenciar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "registro", reuniaoId: reuniao.id, ...form }),
      });
      const j = await r.json();
      if (!r.ok) { setAviso(j?.error ?? "não consegui salvar"); return; }
      setAviso("Salvo.");
      carregar();
      onMudou?.();
    } finally { setSalvando(false); }
  };

  const anexar = async (file: File) => {
    setEnviando(true);
    setAviso(null);
    try {
      const base64 = await new Promise<string>((ok, falha) => {
        const fr = new FileReader();
        fr.onload = () => ok(String(fr.result));
        fr.onerror = () => falha(new Error("não consegui ler o arquivo"));
        fr.readAsDataURL(file);
      });
      const r = await authedFetch("/api/reunioes/gerenciar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "anexar", reuniaoId: reuniao.id,
          arquivo: { nome: file.name, tipo: file.type, base64 },
        }),
      });
      const j = await r.json();
      if (!r.ok) { setAviso(j?.error ?? "não consegui anexar"); return; }
      carregar();
    } catch (e) { setAviso((e as Error).message); }
    finally { setEnviando(false); }
  };

  const rot = ROTULO[d?.estado ?? reuniao.estado] ?? ROTULO.agendada;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/60 backdrop-blur-sm" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()}
           className="w-full max-w-lg h-full bg-card border-l border-border overflow-y-auto animate-fade-in">
        <div className="sticky top-0 bg-card border-b border-border p-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-foreground truncate">Reunião — {reuniao.cliente}</h2>
            <p className={`text-[12px] mt-0.5 ${rot.cor}`}>{rot.txt}</p>
          </div>
          <button onClick={onFechar} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={16} />
          </button>
        </div>

        {erro && (
          <div className="m-4 p-2.5 rounded-lg bg-lone-danger-bg border border-lone-danger-border">
            <p className="text-[11.5px] text-lone-danger flex items-start gap-1.5">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {erro}
            </p>
          </div>
        )}

        {!d && !erro && (
          <p className="p-4 text-[12px] text-muted-foreground flex items-center gap-2">
            <Loader2 size={13} className="animate-spin" /> Abrindo…
          </p>
        )}

        {d && (
          <div className="p-4 space-y-4">
            {/* Os fatos. Data do FATO e data do REGISTRO são coisas diferentes e ficam ambas. */}
            <div className="grid grid-cols-2 gap-px bg-border border border-border rounded-xl overflow-hidden">
              {[
                { r: "Aconteceu em", v: `${dataBR(d.realizada_em ?? d.start_at)} · ${horaBR(d.realizada_em ?? d.start_at)}` },
                { r: "Responsável", v: d.responsavel ?? "—" },
                { r: "Duração", v: d.duration_minutes ? `${d.duration_minutes} min` : "—" },
                { r: "Registrada", v: `${carimbo(d.created_at)}${d.created_by ? ` · ${d.created_by}` : ""}` },
              ].map((c) => (
                <div key={c.r} className="bg-card p-2.5">
                  <p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">{c.r}</p>
                  <p className="text-[12px] text-foreground mt-0.5">{c.v}</p>
                </div>
              ))}
            </div>

            {/* ── OS CAMPOS ────────────────────────────────────────────────
                Os exemplos daqui eram realistas demais ("Cliente pediu para aumentar a campanha
                de cimento…") e, no tema escuro, placeholder e texto digitado ficam parecidos: o
                Roberto leu como se estivesse preenchido, clicou Salvar e gravou vazio. Agora o
                exemplo é curto, começa com "Ex.:" e é claramente mais apagado. */}
            {([
              ["briefing", "O que foi discutido", "Ex.: aumentar a campanha de cimento"],
              ["decisoes", "Principais decisões", "Ex.: pausar a campanha antiga"],
              ["proximos_passos", "Próximos passos", "Ex.: designer produzir criativo"],
            ] as const).map(([campo, rotulo, exemplo]) => (
              <div key={campo}>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{rotulo}</label>
                  {form[campo].trim() && (
                    <span className="text-[9.5px] text-muted-foreground">
                      {form[campo].trim().length} caracteres
                    </span>
                  )}
                </div>
                <textarea
                  value={form[campo]}
                  onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
                  placeholder={exemplo}
                  className="mt-1 w-full h-24 p-2.5 rounded-lg bg-surface border border-border text-[13px] text-foreground placeholder:text-muted-foreground/35 placeholder:italic focus:border-primary/50 outline-none resize-y transition-colors"
                />
              </div>
            ))}

            {d.briefing_em && (
              <p className="text-[10px] text-muted-foreground">
                Registro escrito em {carimbo(d.briefing_em)}{d.briefing_por ? ` por ${d.briefing_por}` : ""} —
                a data da reunião não muda por causa disso.
              </p>
            )}

            {(() => {
              const escreveu = Object.values(form).some((v) => v.trim());
              const mudou = form.briefing !== (d.briefing ?? "")
                || form.decisoes !== (d.decisoes ?? "")
                || form.proximos_passos !== (d.proximos_passos ?? "");
              return (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {aviso ?? (!escreveu ? "Nada escrito ainda" : mudou ? "Alterações não salvas" : "Salvo")}
                  </span>
                  {/* Sem texto NENHUM não há o que salvar — e era assim que um clique gravava
                      vazio e ainda carimbava "registro escrito por". */}
                  <button onClick={salvar} disabled={salvando || !mudou}
                          className="text-[12px] px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
                    {salvando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    {mudou ? "Salvar" : "Salvo"}
                  </button>
                </div>
              );
            })()}

            {/* O que a IA extraiu, quando existe. Separado do que a pessoa escreveu. */}
            {d.resumo && (
              <div className="p-3 rounded-xl bg-surface border border-border">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Resumo da transcrição (IA)
                </p>
                <p className="text-[12px] text-foreground whitespace-pre-wrap">{d.resumo}</p>
              </div>
            )}

            {/* ── DOCUMENTOS ─────────────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Documentos e arquivos {d.anexos.length > 0 && `· ${d.anexos.length}`}
                </label>
                <label className="text-[12px] px-3.5 py-2 rounded-lg bg-surface border border-border text-foreground hover:border-primary hover:bg-muted/50 cursor-pointer flex items-center gap-1.5 transition-colors font-medium">
                  {enviando ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
                  {enviando ? "Enviando…" : "Anexar arquivo"}
                  <input type="file" className="hidden" disabled={enviando}
                         onChange={(e) => { const f = e.target.files?.[0]; if (f) anexar(f); e.target.value = ""; }} />
                </label>
              </div>
              {d.anexos.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Transcrição, ata, apresentação, material do cliente — o que estava envolvido na reunião.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {d.anexos.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg bg-surface border border-border">
                      <Paperclip size={11} className="text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11.5px] text-foreground truncate">{a.nome}</p>
                        <p className="text-[9.5px] text-muted-foreground">
                          {a.tamanho ? `${Math.round(a.tamanho / 1024)} KB · ` : ""}
                          {a.enviadoPor ?? "—"} · {carimbo(a.em)}
                        </p>
                      </div>
                      {a.url && (
                        <a href={a.url} target="_blank" rel="noopener noreferrer"
                           className="shrink-0 text-muted-foreground hover:text-primary" title="Abrir">
                          <Download size={12} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
