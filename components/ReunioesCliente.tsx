"use client";

// REUNIÕES DO CLIENTE — agendar, preparar, anexar, registrar e consultar. Tudo num lugar.
//
// PRA QUE (Roberto, 04/09, depois de olhar a tela com o time): "o social media não está tendo um
// lugar pra eles fazerem o cadastro das reuniões, agendar reunião, colocar o briefing da reunião,
// anexar o briefing da reunião."
//
// A aba tinha DOIS blocos — "Reunioes / + Agendar" e "Reuniões cadastradas / + Registrar" — que
// eram partes do mesmo trabalho, e quem chegava não sabia em qual clicar. Este componente é os
// dois, na ordem em que o trabalho acontece:
//
//   PRÓXIMAS   → o que vem aí, com a pauta e os anexos de cada uma
//   REALIZADAS → o histórico, com transcrição, análise e busca
//
// A pauta pode ser escrita à mão ou gerada do estado do cliente (risco, pendências, entregas
// atrasadas). O preparo automático já existia desde julho e só era alcançável por um comando no
// WhatsApp — aqui virou botão.

import { useEffect, useState, useCallback, useRef } from "react";
import {
  CalendarClock, Search, Plus, X, Loader2, AlertTriangle, Download, ChevronDown,
  ChevronRight, Sparkles, Paperclip, Check, Trash2, FileText, Clock,
} from "lucide-react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { generateGoogleCalendarUrl, generateICS, downloadICS } from "@/lib/calendar/icsGenerator";

interface Anexo { path: string; nome: string; tamanho: number; tipo?: string; url?: string | null }

interface Reuniao {
  id: string; quando: string; fim: string | null; responsavel: string | null;
  estado: string; tipo: string; titulo: string | null; local: string | null;
  descricao: string | null; resumo: string | null;
  pauta: string | null; pautaOrigem: string | null;
  anexos: Anexo[];
  palavras: number; temTranscricao: boolean; temPdf: boolean;
  pontosAtencao: string[]; clima: string | null;
  contagens: { decisoes: number; acoes: number; pendencias: number; sugestoes: number };
}

interface Detalhe {
  id: string; start_at: string; responsavel: string | null; resumo: string | null;
  transcricao: string | null; transcricao_palavras: number | null;
  pauta: string | null; pauta_origem: string | null; pauta_por: string | null;
  anexos: Anexo[]; pdfUrl: string | null; location: string | null; description: string | null;
  analise: {
    decisoes?: string[];
    proximas_acoes?: { acao: string; responsavel: string | null; prazo: string | null }[];
    pendencias_cliente?: { item: string; impacto: string | null }[];
    sugestoes_briefing?: { regra: string; motivo: string }[];
  } | null;
}

const TIPOS = [
  { v: "alinhamento", l: "Alinhamento" },
  { v: "mensal", l: "Mensal (acompanhamento)" },
  { v: "kickoff", l: "Kickoff" },
  { v: "resultado", l: "Resultado" },
  { v: "estrategia", l: "Estratégia" },
];

const CLIMA_COR: Record<string, string> = {
  positivo: "text-lone-success", neutro: "text-muted-foreground",
  preocupado: "text-lone-warning", insatisfeito: "text-destructive",
};

const dataBR = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });
const horaBR = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

/** Converte o horário local do input datetime-local em ISO, sem escorregar de fuso. */
function paraIso(data: string, hora: string): string {
  return new Date(`${data}T${hora}:00-03:00`).toISOString();
}

export default function ReunioesCliente({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [lista, setLista] = useState<Reuniao[]>([]);
  const [pontos, setPontos] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  const [agendando, setAgendando] = useState(false);
  const [form, setForm] = useState({
    tipo: "mensal", data: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    hora: "10:00", duracao: "60", local: "Online", titulo: "", pauta: "",
  });

  const [aberta, setAberta] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [editandoPauta, setEditandoPauta] = useState(false);
  const [pautaTexto, setPautaTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const [registrando, setRegistrando] = useState<string | null>(null);
  const [transcricao, setTranscricao] = useState("");

  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<{ id: string; start_at: string; trecho?: string; resumo: string | null }[] | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

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

  const chamar = async (body: Record<string, unknown>) => {
    setOcupado(true);
    try {
      const r = await authedFetch("/api/reunioes/gerenciar", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) { setAviso(j?.error ?? "não consegui"); return null; }
      return j;
    } finally { setOcupado(false); }
  };

  const agendar = async () => {
    const inicio = paraIso(form.data, form.hora);
    const fim = new Date(new Date(inicio).getTime() + Number(form.duracao) * 60000).toISOString();
    const j = await chamar({
      acao: "agendar", clientId, inicio, fim, tipo: form.tipo,
      local: form.local, titulo: form.titulo.trim() || undefined, pauta: form.pauta.trim() || undefined,
    });
    if (j?.ok) {
      setAviso("Reunião agendada. Vou lembrar na véspera e uma hora antes.");
      setAgendando(false);
      setForm((f) => ({ ...f, titulo: "", pauta: "" }));
      carregar();
    }
  };

  const abrir = (id: string) => {
    if (aberta === id) { setAberta(null); setDetalhe(null); setEditandoPauta(false); return; }
    setAberta(id); setDetalhe(null); setEditandoPauta(false);
    authedFetch(`/api/reunioes/historico?id=${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { setDetalhe(j?.reuniao ?? null); setPautaTexto(j?.reuniao?.pauta ?? ""); });
  };

  const gerarPauta = async (id: string) => {
    const j = await chamar({ acao: "gerar_pauta", reuniaoId: id });
    if (j?.pauta) { setPautaTexto(j.pauta); setEditandoPauta(true); setAviso("Pauta gerada do estado do cliente — revise antes da reunião."); }
  };

  const salvarPauta = async (id: string) => {
    const j = await chamar({ acao: "pauta", reuniaoId: id, pauta: pautaTexto });
    if (j?.ok) { setEditandoPauta(false); abrir(id); abrir(id); carregar(); setAviso("Pauta salva."); }
  };

  const anexar = async (id: string, file: File) => {
    const base64 = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
    const j = await chamar({ acao: "anexar", reuniaoId: id, arquivo: { nome: file.name, tipo: file.type, base64 } });
    if (j?.ok) { setAviso(`"${file.name}" anexado.`); setAberta(null); setTimeout(() => abrir(id), 50); carregar(); }
  };

  const registrar = async (id: string | null) => {
    const t = transcricao.trim();
    if (t.split(/\s+/).filter(Boolean).length < 40) {
      setAviso("A transcrição precisa de pelo menos 40 palavras — abaixo disso é recado, não reunião.");
      return;
    }
    setOcupado(true);
    try {
      const r = await authedFetch("/api/reunioes/transcricao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, reuniaoId: id ?? undefined, transcricao: t, origem: "texto" }),
      });
      const j = await r.json();
      if (!r.ok) { setAviso(j?.error ?? "não consegui registrar"); return; }
      setAviso(j.analisada
        ? `Registrado. ${j.pontos_atencao?.length ?? 0} ponto(s) de atenção${j.sugestoes_briefing?.length ? ` · ${j.sugestoes_briefing.length} sugestão(ões) pro briefing` : ""}.`
        : (j.aviso ?? "Transcrição guardada."));
      setTranscricao(""); setRegistrando(null); carregar();
    } finally { setOcupado(false); }
  };

  const buscar = () => {
    const q = busca.trim();
    if (!q) { setResultados(null); return; }
    authedFetch(`/api/reunioes/historico?clientId=${clientId}&q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setResultados(j?.reunioes ?? []));
  };

  const agora = Date.now();
  const proximas = lista.filter((r) => r.estado !== "cancelada" && r.estado !== "realizada" && new Date(r.quando).getTime() > agora - 3600_000);
  const realizadas = lista.filter((r) => !proximas.includes(r));

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CalendarClock size={14} className="text-primary" /> Reuniões
          {lista.length > 0 && <span className="text-[10px] text-muted-foreground font-normal">· {proximas.length} agendada(s) · {realizadas.length} realizada(s)</span>}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => { setRegistrando(registrando === "nova" ? null : "nova"); setAgendando(false); setAviso(null); }}
            className="text-[11px] px-2.5 py-1.5 rounded-lg bg-surface border border-border text-foreground font-medium flex items-center gap-1.5 hover:border-primary"
          >
            <FileText size={12} /> Registrar realizada
          </button>
          <button
            onClick={() => { setAgendando((v) => !v); setRegistrando(null); setAviso(null); }}
            className="text-[11px] px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium flex items-center gap-1.5 hover:opacity-90"
          >
            {agendando ? <X size={12} /> : <Plus size={12} />} {agendando ? "Cancelar" : "Agendar"}
          </button>
        </div>
      </div>

      {aviso && <p className="mb-3 text-[11px] text-foreground bg-surface border border-border rounded-lg p-2.5">{aviso}</p>}

      {/* MEMÓRIA VIVA */}
      {pontos.length > 0 && !agendando && (
        <div className="mb-4 p-3 rounded-xl bg-surface border border-border">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <AlertTriangle size={11} className="text-lone-warning" /> Pontos de atenção deste cliente
          </p>
          <ul className="space-y-1">{pontos.map((p, i) => <li key={i} className="text-[12px] text-foreground leading-snug">• {p}</li>)}</ul>
        </div>
      )}

      {/* AGENDAR */}
      {agendando && (
        <div className="mb-4 p-3 rounded-xl bg-surface border border-border space-y-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="text-[10px] text-muted-foreground">Tipo
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                      className="mt-1 w-full p-1.5 rounded-lg bg-card border border-border text-[12px] text-foreground">
                {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </label>
            <label className="text-[10px] text-muted-foreground">Data
              <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })}
                     className="mt-1 w-full p-1.5 rounded-lg bg-card border border-border text-[12px] text-foreground" />
            </label>
            <label className="text-[10px] text-muted-foreground">Hora
              <input type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })}
                     className="mt-1 w-full p-1.5 rounded-lg bg-card border border-border text-[12px] text-foreground" />
            </label>
            <label className="text-[10px] text-muted-foreground">Duração
              <select value={form.duracao} onChange={(e) => setForm({ ...form, duracao: e.target.value })}
                      className="mt-1 w-full p-1.5 rounded-lg bg-card border border-border text-[12px] text-foreground">
                <option value="30">30 min</option><option value="60">1 hora</option><option value="90">1h30</option>
              </select>
            </label>
          </div>
          <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                 placeholder={`Título (opcional) — padrão: "Reunião — ${clientName}"`}
                 className="w-full p-2 rounded-lg bg-card border border-border text-[12px] text-foreground placeholder:text-muted-foreground/60" />
          <textarea value={form.pauta} onChange={(e) => setForm({ ...form, pauta: e.target.value })}
                    placeholder="Pauta / briefing da reunião (opcional agora — dá pra escrever ou gerar depois)"
                    className="w-full h-20 p-2 rounded-lg bg-card border border-border text-[12px] text-foreground placeholder:text-muted-foreground/60 resize-y" />
          <div className="flex justify-end">
            <button onClick={agendar} disabled={ocupado}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium flex items-center gap-1.5 disabled:opacity-50">
              {ocupado ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Agendar
            </button>
          </div>
        </div>
      )}

      {/* REGISTRAR REALIZADA (sem reunião prévia) */}
      {registrando === "nova" && (
        <div className="mb-4 space-y-2">
          <textarea value={transcricao} onChange={(e) => setTranscricao(e.target.value)}
                    placeholder={`Cole a transcrição da reunião com a ${clientName} — do Meet, do Zoom, ou suas anotações.`}
                    className="w-full h-36 p-3 rounded-xl bg-surface border border-border text-[12.5px] text-foreground placeholder:text-muted-foreground/60 resize-y" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              {transcricao.trim() ? `${transcricao.trim().split(/\s+/).filter(Boolean).length} palavras` : "mínimo 40 palavras"}
            </span>
            <button onClick={() => registrar(null)} disabled={ocupado}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium flex items-center gap-1.5 disabled:opacity-50">
              {ocupado ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
              {ocupado ? "Analisando…" : "Guardar e analisar"}
            </button>
          </div>
        </div>
      )}

      {/* BUSCA */}
      {realizadas.some((r) => r.temTranscricao) && !agendando && (
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => { setBusca(e.target.value); if (!e.target.value.trim()) setResultados(null); }}
                   onKeyDown={(e) => e.key === "Enter" && buscar()}
                   placeholder="Buscar no que foi dito nas reuniões…"
                   className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-surface border border-border text-[12px] text-foreground placeholder:text-muted-foreground/60" />
          </div>
          <button onClick={buscar} className="text-[11px] px-3 rounded-lg bg-surface border border-border text-foreground hover:border-primary">Buscar</button>
        </div>
      )}

      {resultados !== null && (
        <div className="mb-4">
          <p className="text-[10px] text-muted-foreground mb-2">
            {resultados.length ? `${resultados.length} reunião(ões) citando "${busca}"` : `Nada encontrado sobre "${busca}"`}
          </p>
          <div className="space-y-2">
            {resultados.map((r) => (
              <button key={r.id} onClick={() => abrir(r.id)} className="w-full text-left p-2.5 rounded-lg bg-surface border border-border hover:border-primary">
                <p className="text-[11px] text-muted-foreground mb-1">{dataBR(r.start_at)}</p>
                <p className="text-[12px] text-foreground leading-snug" dangerouslySetInnerHTML={{ __html: r.trecho ?? r.resumo ?? "" }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {carregando && <p className="text-[11px] text-muted-foreground">Carregando…</p>}
      {!carregando && !lista.length && !agendando && registrando !== "nova" && (
        <p className="text-[11px] text-muted-foreground">
          Nenhuma reunião ainda. Use <b>Agendar</b> para a próxima (com pauta e anexos), ou{" "}
          <b>Registrar realizada</b> para guardar a transcrição de uma que já aconteceu.
        </p>
      )}

      {/* PRÓXIMAS */}
      {proximas.length > 0 && (
        <>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 mt-1">Próximas</p>
          <div className="space-y-2 mb-4">
            {proximas.map((r) => (
              <Cartao key={r.id} r={r} aberta={aberta === r.id} onAbrir={() => abrir(r.id)}
                      detalhe={detalhe} editandoPauta={editandoPauta} pautaTexto={pautaTexto}
                      setPautaTexto={setPautaTexto} setEditandoPauta={setEditandoPauta}
                      onGerarPauta={() => gerarPauta(r.id)} onSalvarPauta={() => salvarPauta(r.id)}
                      onAnexar={(f) => anexar(r.id, f)} fileRef={fileRef} ocupado={ocupado}
                      onRegistrar={() => setRegistrando(r.id)} registrando={registrando === r.id}
                      transcricao={transcricao} setTranscricao={setTranscricao}
                      onGuardar={() => registrar(r.id)} />
            ))}
          </div>
        </>
      )}

      {/* REALIZADAS */}
      {realizadas.length > 0 && (
        <>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Realizadas</p>
          <div className="space-y-2">
            {realizadas.map((r) => (
              <Cartao key={r.id} r={r} aberta={aberta === r.id} onAbrir={() => abrir(r.id)}
                      detalhe={detalhe} editandoPauta={editandoPauta} pautaTexto={pautaTexto}
                      setPautaTexto={setPautaTexto} setEditandoPauta={setEditandoPauta}
                      onGerarPauta={() => gerarPauta(r.id)} onSalvarPauta={() => salvarPauta(r.id)}
                      onAnexar={(f) => anexar(r.id, f)} fileRef={fileRef} ocupado={ocupado}
                      onRegistrar={() => setRegistrando(r.id)} registrando={registrando === r.id}
                      transcricao={transcricao} setTranscricao={setTranscricao}
                      onGuardar={() => registrar(r.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Cartao(p: {
  r: Reuniao; aberta: boolean; onAbrir: () => void; detalhe: Detalhe | null;
  editandoPauta: boolean; pautaTexto: string; setPautaTexto: (s: string) => void;
  setEditandoPauta: (b: boolean) => void; onGerarPauta: () => void; onSalvarPauta: () => void;
  onAnexar: (f: File) => void; fileRef: React.RefObject<HTMLInputElement | null>; ocupado: boolean;
  onRegistrar: () => void; registrando: boolean;
  transcricao: string; setTranscricao: (s: string) => void; onGuardar: () => void;
}) {
  const { r, detalhe } = p;
  const futura = new Date(r.quando).getTime() > Date.now();
  return (
    <div className="rounded-xl bg-surface border border-border overflow-hidden">
      <button onClick={p.onAbrir} className="w-full text-left p-3 flex items-start justify-between gap-3 hover:bg-card/40">
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-foreground">
            {dataBR(r.quando)} <span className="text-muted-foreground font-normal">às {horaBR(r.quando)}</span>
            {r.responsavel && <span className="text-muted-foreground font-normal"> · {r.responsavel}</span>}
            {r.clima && <span className={`ml-1.5 ${CLIMA_COR[r.clima] ?? "text-muted-foreground"}`}>· {r.clima}</span>}
          </p>
          {r.resumo && <p className="text-[11.5px] text-muted-foreground mt-0.5 line-clamp-2">{r.resumo}</p>}
          <p className="text-[10px] text-muted-foreground/70 mt-1 flex items-center gap-2 flex-wrap">
            {r.pauta && <span className="text-lone-success">✓ com pauta</span>}
            {r.anexos.length > 0 && <span className="flex items-center gap-0.5"><Paperclip size={9} />{r.anexos.length}</span>}
            {r.temTranscricao && <span>{r.palavras} palavras</span>}
            {!r.pauta && futura && <span className="text-lone-warning">sem pauta</span>}
            {!r.temTranscricao && !futura && <span className="text-lone-warning">sem transcrição</span>}
          </p>
        </div>
        {p.aberta ? <ChevronDown size={14} className="text-muted-foreground shrink-0 mt-1" />
                  : <ChevronRight size={14} className="text-muted-foreground shrink-0 mt-1" />}
      </button>

      {p.aberta && (
        <div className="px-3 pb-3 border-t border-border pt-3 space-y-3">
          {!detalhe && <p className="text-[11px] text-muted-foreground">Abrindo…</p>}
          {detalhe && (
            <>
              {/* PAUTA */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Pauta {detalhe.pauta_origem === "ia" && <span className="text-primary">· gerada</span>}
                  </p>
                  <div className="flex gap-1.5">
                    {!p.editandoPauta && (
                      <>
                        <button onClick={p.onGerarPauta} disabled={p.ocupado}
                                className="text-[10px] px-2 py-1 rounded-md bg-card border border-border text-foreground flex items-center gap-1 hover:border-primary disabled:opacity-50">
                          <Sparkles size={10} /> Gerar do cliente
                        </button>
                        <button onClick={() => p.setEditandoPauta(true)}
                                className="text-[10px] px-2 py-1 rounded-md bg-card border border-border text-foreground hover:border-primary">
                          {detalhe.pauta ? "Editar" : "Escrever"}
                        </button>
                      </>
                    )}
                    {p.editandoPauta && (
                      <button onClick={p.onSalvarPauta} disabled={p.ocupado}
                              className="text-[10px] px-2 py-1 rounded-md bg-primary text-primary-foreground flex items-center gap-1 disabled:opacity-50">
                        <Check size={10} /> Salvar
                      </button>
                    )}
                  </div>
                </div>
                {p.editandoPauta ? (
                  <textarea value={p.pautaTexto} onChange={(e) => p.setPautaTexto(e.target.value)}
                            className="w-full h-40 p-2.5 rounded-lg bg-card border border-border text-[12px] text-foreground resize-y" />
                ) : detalhe.pauta ? (
                  <p className="text-[12px] text-foreground whitespace-pre-wrap leading-relaxed">{detalhe.pauta}</p>
                ) : (
                  <p className="text-[11.5px] text-muted-foreground">
                    Sem pauta. <b>Gerar do cliente</b> monta uma a partir do risco, das pendências e das entregas atrasadas.
                  </p>
                )}
              </div>

              {/* ANEXOS */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Anexos</p>
                  <label className="text-[10px] px-2 py-1 rounded-md bg-card border border-border text-foreground flex items-center gap-1 cursor-pointer hover:border-primary">
                    <Paperclip size={10} /> Anexar
                    <input type="file" className="hidden"
                           onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onAnexar(f); e.target.value = ""; }} />
                  </label>
                </div>
                {detalhe.anexos?.length ? (
                  <ul className="space-y-1">
                    {detalhe.anexos.map((a) => (
                      <li key={a.path} className="flex items-center justify-between gap-2 text-[11.5px]">
                        {a.url
                          ? <a href={a.url} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate">{a.nome}</a>
                          : <span className="text-foreground truncate">{a.nome}</span>}
                        <span className="text-muted-foreground shrink-0">{kb(a.tamanho)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11.5px] text-muted-foreground">Nenhum arquivo. Briefing, apresentação, relatório — o que ajudar na reunião.</p>
                )}
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {detalhe.pdfUrl && (
                  <a href={detalhe.pdfUrl} target="_blank" rel="noreferrer"
                     className="inline-flex items-center gap-1.5 text-[11px] text-primary hover:underline">
                    <Download size={11} /> Abrir a ata em PDF
                  </a>
                )}
                {/* O compromisso vive no Lone OS e o lembrete sai pelo WhatsApp — mas quem quiser
                    ver na agenda pessoal leva num clique. É conveniência, não integração: nada
                    aqui depende do Google estar conectado. */}
                {futura && (
                  <>
                    <a href={generateGoogleCalendarUrl({
                         title: r.titulo || `Reunião — ${detalhe.responsavel ?? ""}`.trim(),
                         description: detalhe.pauta || detalhe.description || "",
                         startAt: r.quando, endAt: r.fim || r.quando,
                         location: detalhe.location || "Online",
                       })}
                       target="_blank" rel="noreferrer"
                       className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
                      <CalendarClock size={11} /> Google Agenda
                    </a>
                    <button
                      // downloadICS(filename, content) — nesta ordem, e ela mesma acrescenta a
                      // extensão. Os dois parâmetros são string, então inverter não quebra o
                      // build: sairia um arquivo com o .ics inteiro no nome.
                      onClick={() => downloadICS(`reuniao-${r.quando.slice(0, 10)}`, generateICS({
                        title: r.titulo || "Reunião",
                        description: detalhe.pauta || detalhe.description || "",
                        startAt: r.quando, endAt: r.fim || r.quando,
                        location: detalhe.location || "Online",
                      }))}
                      className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
                      <Download size={11} /> .ics
                    </button>
                  </>
                )}
              </div>

              {/* ANÁLISE */}
              <Secao titulo="Decisões" itens={detalhe.analise?.decisoes ?? []} />
              <Secao titulo="O que a Lone vai fazer"
                     itens={(detalhe.analise?.proximas_acoes ?? []).map((a) => `${a.acao}${a.responsavel ? ` — ${a.responsavel}` : ""}${a.prazo ? ` (${a.prazo})` : ""}`)} />
              <Secao titulo="O que o cliente ficou de fazer"
                     itens={(detalhe.analise?.pendencias_cliente ?? []).map((x) => `${x.item}${x.impacto ? ` — ${x.impacto}` : ""}`)} />
              <Secao titulo="Sugestões pro briefing"
                     itens={(detalhe.analise?.sugestoes_briefing ?? []).map((s) => `${s.regra} — ${s.motivo}`)} />

              {/* TRANSCRIÇÃO ou registrar */}
              {detalhe.transcricao ? (
                <details>
                  <summary className="text-[10px] uppercase tracking-wide text-muted-foreground cursor-pointer">
                    Transcrição completa ({detalhe.transcricao_palavras} palavras)
                  </summary>
                  <p className="mt-2 text-[11.5px] text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                    {detalhe.transcricao}
                  </p>
                </details>
              ) : p.registrando ? (
                <div className="space-y-2">
                  <textarea value={p.transcricao} onChange={(e) => p.setTranscricao(e.target.value)}
                            placeholder="Cole aqui a transcrição desta reunião."
                            className="w-full h-32 p-2.5 rounded-lg bg-card border border-border text-[12px] text-foreground resize-y" />
                  <button onClick={p.onGuardar} disabled={p.ocupado}
                          className="text-[10px] px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground flex items-center gap-1 disabled:opacity-50">
                    {p.ocupado ? <Loader2 size={10} className="animate-spin" /> : <FileText size={10} />} Guardar e analisar
                  </button>
                </div>
              ) : !futura ? (
                <button onClick={p.onRegistrar}
                        className="text-[10px] px-2.5 py-1.5 rounded-md bg-card border border-border text-foreground flex items-center gap-1 hover:border-primary">
                  <FileText size={10} /> Registrar a transcrição desta reunião
                </button>
              ) : (
                <p className="text-[10.5px] text-muted-foreground flex items-center gap-1.5">
                  <Clock size={10} /> Depois da reunião, volte aqui para colar a transcrição.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Secao({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens.length) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{titulo}</p>
      <ul className="space-y-0.5">{itens.map((i, k) => <li key={k} className="text-[12px] text-foreground leading-snug">• {i}</li>)}</ul>
    </div>
  );
}
