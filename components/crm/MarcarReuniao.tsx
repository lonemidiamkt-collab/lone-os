"use client";

// Janela de MARCAR REUNIÃO do Comercial (out/2026). Escolhe o lead, o dia, um horário livre (o servidor cruza o
// Google Agenda da Lone com as reuniões já marcadas), a duração, o formato (Meet, presencial, ligação), quem
// recebe o convite e a pauta. Marcou → evento no Google com Meet, aviso no grupo de vendas e a confirmação
// pronta para mandar ao lead no WhatsApp (quem manda é o comercial).

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Check, Copy, MapPin, MessageCircle, Phone, Search, Video, X } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { ehAberta } from "@/lib/crm/etapas";
import { DURACOES, diaCurto, horaCurta, inicioDe, type Formato } from "@/lib/crm/reunioes";

interface LeadOpcao { id: string; empresa: string | null; contatoNome: string; email: string | null; endereco?: string | null; cidade?: string | null; estagio: string }
interface Marcada { reuniao: { inicio: string; meetUrl: string | null; formato: Formato; local: string | null }; aviso: string | null; whatsappLead: string | null; mensagemLead: string }

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const campo = "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none";

export default function MarcarReuniao<L extends LeadOpcao>({ leads, leadInicial, diaInicial, autor, onFechar, onMarcada }: {
  leads: L[]; leadInicial?: L | null; diaInicial?: string | null; autor: string | null;
  onFechar: () => void; onMarcada: () => void;
}) {
  const [leadId, setLeadId] = useState(leadInicial?.id ?? "");
  const [busca, setBusca] = useState("");
  const [dia, setDia] = useState(diaInicial && diaInicial >= hojeSP() ? diaInicial : hojeSP());
  const [hora, setHora] = useState("");
  const [duracao, setDuracao] = useState(45);
  const [formato, setFormato] = useState<Formato>("meet");
  const [convidado, setConvidado] = useState(leadInicial?.email ?? "");
  const [local, setLocal] = useState(leadInicial?.endereco ?? "");
  const [pauta, setPauta] = useState("Raio-x do marketing da loja e próximos passos.");
  const [livres, setLivres] = useState<string[] | null>(null);
  const [google, setGoogle] = useState<string>("");
  const [enviando, setEnviando] = useState(false);
  const [marcada, setMarcada] = useState<Marcada | null>(null);

  const lead = leads.find((l) => l.id === leadId) ?? null;
  const opcoes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return leads.filter((l) => ehAberta(l.estagio) && (!q || (l.empresa ?? "").toLowerCase().includes(q) || l.contatoNome.toLowerCase().includes(q))).slice(0, 8);
  }, [leads, busca]);

  // Lead escolhido: e-mail e endereço vêm do cadastro.
  useEffect(() => {
    if (!lead) return;
    setConvidado((c) => c || lead.email || "");
    setLocal((x) => x || lead.endereco || lead.cidade || "");
  }, [lead]);

  // Horários livres do dia (Google Agenda + reuniões do Comercial).
  useEffect(() => {
    let vivo = true;
    setLivres(null);
    chamar<{ livres: string[]; google: string }>(`/api/crm/reunioes/horarios?dia=${dia}&duracao=${duracao}`).then((r) => {
      if (!vivo) return;
      setLivres(r.ok ? r.data?.livres ?? [] : []);
      setGoogle(r.ok ? r.data?.google ?? "" : "erro");
    });
    return () => { vivo = false; };
  }, [dia, duracao]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  async function marcar() {
    if (!lead) { toast.error("Escolha o lead."); return; }
    if (!/^\d{2}:\d{2}$/.test(hora)) { toast.error("Escolha o horário."); return; }
    setEnviando(true);
    const r = await chamar<Marcada>("/api/crm/reunioes", {
      leadId: lead.id, inicio: inicioDe(dia, hora), duracao, formato, autor,
      local: formato === "presencial" ? local : null, convidados: convidado.trim() ? [convidado.trim()] : [], pauta,
    });
    setEnviando(false);
    if (!r.ok || !r.data) { toast.error(r.erro ?? "Não consegui marcar."); return; }
    setMarcada(r.data);
    onMarcada();
    if (r.data.aviso) toast.warning(r.data.aviso); else toast.success("Reunião marcada e avisada no grupo de vendas.");
  }

  const formatoBtn = (f: Formato, rotulo: string, Icone: typeof Video) => (
    <button type="button" onClick={() => setFormato(f)} aria-pressed={formato === f}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] transition-colors ${formato === f ? "border-primary/40 bg-primary/10 font-semibold text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
      <Icone size={14} aria-hidden="true" /> {rotulo}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-label="Marcar reunião" onClick={(e) => e.stopPropagation()}
        className="cc-gaveta max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-lone-h2 text-foreground"><CalendarClock size={16} className="text-primary" aria-hidden="true" /> {marcada ? "Reunião marcada" : "Marcar reunião"}</h2>
          <button onClick={onFechar} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Fechar"><X size={18} /></button>
        </div>

        {marcada ? (
          <div className="space-y-4 px-5 py-5">
            <div className="rounded-xl border border-lone-success-border bg-lone-success-bg p-4">
              <p className="flex items-center gap-2 text-lone-body font-medium text-lone-success"><Check size={16} /> {lead?.empresa || lead?.contatoNome}</p>
              <p className="mt-1 text-lone-body text-foreground">{diaCurto(marcada.reuniao.inicio)} às {horaCurta(marcada.reuniao.inicio)} · {marcada.reuniao.formato === "meet" ? "Google Meet" : marcada.reuniao.formato === "presencial" ? "Presencial" : "Ligação"}</p>
              {marcada.reuniao.meetUrl && (
                <button onClick={() => { navigator.clipboard?.writeText(marcada.reuniao.meetUrl!).catch(() => {}); toast.success("Link do Meet copiado."); }}
                  className="mt-2 inline-flex items-center gap-1.5 text-lone-caption font-medium text-primary hover:underline"><Copy size={12} /> {marcada.reuniao.meetUrl}</button>
              )}
              <p className="mt-2 text-lone-caption text-muted-foreground">Avisado no grupo de vendas. Lembrete lá na véspera às 9h e 1 hora antes.</p>
            </div>
            {marcada.aviso && <p className="rounded-xl border border-lone-warning-border bg-lone-warning-bg p-3 text-lone-caption text-lone-warning">{marcada.aviso}</p>}
            <div>
              <p className="mb-1.5 text-lone-caption font-medium text-muted-foreground">Confirmação para o lead (você manda):</p>
              <p className="whitespace-pre-wrap rounded-xl border border-border bg-background px-3 py-2 text-lone-body text-foreground">{marcada.mensagemLead}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => { navigator.clipboard?.writeText(marcada.mensagemLead).catch(() => {}); toast.success("Mensagem copiada."); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-foreground hover:bg-accent"><Copy size={14} /> Copiar</button>
              {marcada.whatsappLead && (
                <a href={marcada.whatsappLead} target="_blank" rel="noopener noreferrer" onClick={onFechar}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-lone-success-bg px-3 text-sm font-medium text-lone-success hover:opacity-80"><MessageCircle size={14} /> Enviar no WhatsApp</a>
              )}
              <button onClick={onFechar} className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">Concluir</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5">
            {/* Lead */}
            <div>
              <label className="mb-1 block text-lone-caption font-medium text-muted-foreground">Com quem</label>
              {lead ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                  <span className="min-w-0 truncate text-lone-body text-foreground">{lead.empresa || lead.contatoNome}{lead.empresa && lead.contatoNome !== lead.empresa ? <span className="text-muted-foreground"> · {lead.contatoNome}</span> : null}</span>
                  {!leadInicial && <button onClick={() => setLeadId("")} className="shrink-0 text-lone-caption text-primary hover:underline">trocar</button>}
                </div>
              ) : (
                <div>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input autoFocus className={`${campo} pl-8`} placeholder="Buscar empresa ou contato…" value={busca} onChange={(e) => setBusca(e.target.value)} />
                  </div>
                  <ul className="mt-1.5 max-h-44 overflow-y-auto rounded-lg border border-border">
                    {opcoes.length === 0 ? <li className="px-3 py-2 text-lone-caption text-muted-foreground">Nenhum lead aberto com esse nome.</li> : opcoes.map((l) => (
                      <li key={l.id}><button onClick={() => setLeadId(l.id)} className="w-full px-3 py-2 text-left text-lone-body text-foreground hover:bg-accent">{l.empresa || l.contatoNome}<span className="text-lone-caption text-muted-foreground">{l.empresa && l.contatoNome !== l.empresa ? ` · ${l.contatoNome}` : ""}{l.cidade ? ` · ${l.cidade}` : ""}</span></button></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Formato */}
            <div className="flex gap-2">
              {formatoBtn("meet", "Google Meet", Video)}
              {formatoBtn("presencial", "Presencial", MapPin)}
              {formatoBtn("ligacao", "Ligação", Phone)}
            </div>

            {/* Dia + duração */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-lone-caption font-medium text-muted-foreground">Dia</label>
                <input type="date" min={hojeSP()} className={campo} value={dia} onChange={(e) => { setDia(e.target.value); setHora(""); }} />
              </div>
              <div>
                <label className="mb-1 block text-lone-caption font-medium text-muted-foreground">Duração</label>
                <div className="flex gap-1">
                  {DURACOES.map((d) => (
                    <button key={d} type="button" onClick={() => setDuracao(d)} aria-pressed={duracao === d}
                      className={`h-9 flex-1 rounded-lg border text-[13px] ${duracao === d ? "border-primary/40 bg-primary/10 font-semibold text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{d}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Horário */}
            <div>
              <label className="mb-1 block text-lone-caption font-medium text-muted-foreground">
                Horário {google === "conectado" ? "· livres no Google Agenda da Lone" : google === "desconectado" ? "· Google Agenda não conectado (não confere conflito)" : ""}
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {livres === null ? <span className="text-lone-caption text-muted-foreground">Procurando horários livres…</span>
                  : livres.length === 0 ? <span className="text-lone-caption text-muted-foreground">Nenhum horário livre entre 9h e 18h neste dia.</span>
                  : livres.map((h) => (
                    <button key={h} type="button" onClick={() => setHora(h)} aria-pressed={hora === h}
                      className={`h-8 rounded-lg border px-3 text-[13px] tabular-nums ${hora === h ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-accent"}`}>{h}</button>
                  ))}
                <input type="time" step={900} value={hora} onChange={(e) => setHora(e.target.value)} aria-label="Outro horário"
                  className="h-8 rounded-lg border border-border bg-background px-2 text-[13px] text-foreground focus:border-primary focus:outline-none" />
              </div>
            </div>

            {formato === "presencial" && (
              <div>
                <label className="mb-1 block text-lone-caption font-medium text-muted-foreground">Endereço</label>
                <input className={campo} value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Rua, número, cidade" />
              </div>
            )}
            <div>
              <label className="mb-1 block text-lone-caption font-medium text-muted-foreground">Convite por e-mail para</label>
              <input type="email" className={campo} value={convidado} onChange={(e) => setConvidado(e.target.value)} placeholder="email@daloja.com.br (opcional)" />
            </div>
            <div>
              <label className="mb-1 block text-lone-caption font-medium text-muted-foreground">Pauta</label>
              <textarea rows={2} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" value={pauta} onChange={(e) => setPauta(e.target.value)} />
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-lone-caption text-muted-foreground">{lead && hora ? `${diaCurto(inicioDe(dia, hora))} às ${horaCurta(inicioDe(dia, hora))} · ${duracao} min` : "Escolha o lead e o horário."}</p>
              <button disabled={enviando || !lead || !hora} onClick={marcar}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {enviando ? "Marcando…" : "Marcar reunião"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
