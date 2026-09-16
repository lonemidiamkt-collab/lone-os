"use client";

// Cockpit diário do SDR (Roberto, 16/09): status → KPIs do dia → conversão → precisa de você →
// funil por macroestágio (clicável) → conversas → SLA → velocity → gargalos → distribuição → aging
// → fila do dia → reuniões → últimas mensagens. Cada número que abre uma lista chama `abrirLista`.

import { useEffect, useState } from "react";
import { Activity, MessageSquare, CalendarCheck, Wallet, AlertCircle, RefreshCw, Power, Wifi, WifiOff, Users, MapPin, Gauge, Timer, ListOrdered, Bot } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { Button } from "@/components/ui/button";
import { Kpi, Secao, Vazio, Erro, ChipEstagio, ChipClasse, fmtDataHora, fmtExtenso, haQuanto, usd } from "./ui";

export interface FiltroLista { alcancou?: string; aguardando?: string; aging?: string; sla?: string; estagio?: string; humano?: boolean; rotulo: string }

interface PassoFunil { chave: string; rotulo: string; n: number; pct_anterior: number | null; tem: boolean }
interface Transicao { chave: string; rotulo: string; media_s: number | null; n: number }
export interface Dash {
  agente: {
    ligado: boolean; rodando: boolean; campanha: { id: string; nome: string; status: string; limite_dia: number; termina_em: string | null } | null;
    dia_piloto: { dia: number; total: number } | null; teto: { usado: number; limite: number };
    pode_abordar: { ok: boolean; motivo?: string }; pode_responder: { ok: boolean; motivo?: string };
    whatsapp: { connected: boolean; state: string; instance: string | null; error?: string };
    google: { configurado: boolean; conectado: boolean; email?: string | null; planilha: string | null }; handoff_numero: string;
    custo_usd: number; custo_hoje_usd: number; proximo_envio: string;
  };
  hoje: { abordagens: number; respostas: number; reunioes: number; reunioes_online: number; visitas: number; followups: number };
  funil: PassoFunil[];
  conversas: { abordagens: number; responderam: number; nao_responderam: number; taxa_resposta: number | null; responderam_hoje: number; abertas: number; aguardando_lone: number; aguardando_prospect: number };
  sla: { meta_min: number; media_s: number | null; mediana_s: number | null; pct_dentro: number | null; fora: number; maior_s: number | null; amostra: number; aguardando_agora: number; maior_espera_agora_s: number | null; semaforo: string; ids_fora_agora: string[] };
  tempos: Transicao[];
  gargalos: { tipo: string; texto: string; ids?: string[] }[];
  distribuicao: { estagio: string; rotulo: string; macro: string; macro_rotulo: string; n: number }[];
  aging: { chave: string; rotulo: string; n: number; tem: boolean }[];
  fila: { selecionados: number; abordados: number; aguardando: number; score_medio: number | null; classe_a: number; classe_b: number; melhor: { id: string; nome: string; score: number | null } | null; proximo_envio_texto: string };
  fila_lista: { id: string; nome: string; cidade: string | null; segmento: string | null; score: number | null; classe: string | null; ranking_pos: number | null; decisor_nome: string | null; estagio: string }[];
  eficiencia: { abordagens_por_dia: number | null; taxa_resposta: number | null; taxa_decisor: number | null; taxa_interesse: number | null; taxa_reuniao: number | null; sla_pct: number | null; acoes_no_prazo: number | null; erros_operacionais: number; handoffs_humanos: number; autonomia: number | null; conversas: number };
  precisa_humano: { id: string; nome: string; cidade: string | null; estagio: string; motivo_humano: string | null; updated_at: string; score: number | null; classe: string | null }[];
  recentes: { id: string; prospect_id: string; direcao: string; autor: string; texto: string; created_at: string; prospect: { nome: string; estagio: string } | null }[];
  reunioes: { id: string; nome: string; cidade: string | null; reuniao_em: string; reuniao_tipo: string; meet_url: string | null; decisor_nome: string | null; estagio: string }[];
}

const dur = (s: number | null | undefined) => {
  if (s === null || s === undefined) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) { const m = Math.floor(s / 60), r = Math.round(s % 60); return r ? `${m}m ${r}s` : `${m} min`; }
  if (s < 86_400) { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`; }
  const d = s / 86_400; return d < 10 ? `${(Math.round(d * 10) / 10).toString().replace(".", ",")} dias` : `${Math.round(d)} dias`;
};
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v.toString().replace(".", ",")}%`);
const TOM_SEMAFORO: Record<string, string> = { verde: "text-lone-success", amarelo: "text-lone-warning", vermelho: "text-lone-danger", sem_dados: "text-muted-foreground" };
const TOM_GARGALO: Record<string, string> = { perda: "bg-lone-danger", demora: "bg-lone-warning", atencao: "bg-lone-warning", positivo: "bg-lone-success", info: "bg-muted-foreground" };

function Linha2({ rotulo, valor, onClick, tom }: { rotulo: string; valor: string | number; onClick?: () => void; tom?: string }) {
  const cls = `flex items-center justify-between border-b border-border py-1 text-lone-body last:border-0 ${onClick ? "cursor-pointer hover:bg-accent/50" : ""}`;
  return <div className={cls} onClick={onClick}><span className="text-muted-foreground">{rotulo}</span><span className={`tabular-nums ${tom ?? "text-foreground"}`}>{valor}</span></div>;
}

export default function VisaoGeral({ abrir, irPara, abrirLista }: { abrir: (id: string) => void; irPara: (tab: string) => void; abrirLista: (f: FiltroLista) => void }) {
  const [d, setD] = useState<Dash | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [alternando, setAlternando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    const r = await chamar<Dash>("/api/prospeccao/dashboard");
    setCarregando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setErro(null); setD(r.data);
  };
  useEffect(() => { void carregar(); }, []);

  const killSwitch = async () => {
    if (!d) return;
    const ligar = !d.agente.ligado;
    if (!ligar && !confirm("Desligar o agente? Nada sai até religar (descoberta, abordagens, follow-ups, respostas e lembretes).")) return;
    setAlternando(true);
    const r = await chamar("/api/prospeccao/config", { ligado: ligar }, { method: "PUT" });
    setAlternando(false);
    if (!r.ok) { setErro(r.erro); return; }
    await carregar();
  };

  if (erro && !d) return <Erro texto={erro} />;
  if (!d) return <p className="text-lone-body text-muted-foreground">Carregando…</p>;
  const a = d.agente, e = d.eficiencia, c = d.conversas, s = d.sla;
  const statusTexto = !a.ligado ? "Desligado" : !a.campanha ? "Sem piloto" : a.campanha.status === "running" && a.rodando ? "Rodando" : a.campanha.status === "completed" ? "Piloto encerrado" : a.campanha.status === "paused" ? "Pausado" : a.campanha.status === "draft" ? "Rascunho" : "Vencido";
  const statusTom = a.ligado && a.rodando ? "text-lone-success" : a.ligado && a.campanha?.status === "draft" ? "text-lone-warning" : "text-lone-danger";
  const maxFunil = Math.max(1, ...d.funil.map((f) => f.n));
  const maxDist = Math.max(1, ...d.distribuicao.map((x) => x.n));

  return (
    <div className="space-y-5">
      <Erro texto={erro} />

      {/* 1. Status operacional */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-lone-eyebrow uppercase tracking-wider text-muted-foreground">Piloto SDR Lone{a.dia_piloto ? ` — dia ${a.dia_piloto.dia}/${a.dia_piloto.total}` : ""}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`text-lone-h1 tracking-tight ${statusTom}`}>{statusTexto}</span>
              {a.campanha && <span className="text-lone-body text-muted-foreground">· {a.campanha.nome}{a.campanha.termina_em ? ` · encerra ${new Date(a.campanha.termina_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })}` : ""}</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-lone-caption text-muted-foreground">
              <span className="inline-flex items-center gap-1">{a.whatsapp.connected ? <Wifi size={12} className="text-lone-success" /> : <WifiOff size={12} className="text-lone-danger" />} WhatsApp {a.whatsapp.instance ?? "—"} {a.whatsapp.connected ? "conectado" : a.whatsapp.state}</span>
              <span className={a.google.conectado ? "" : "text-lone-warning"}>Google {a.google.conectado ? `conectado (${a.google.email ?? ""})` : a.google.configurado ? "não conectado" : "sem credenciais"}</span>
              <span>Handoff +{a.handoff_numero}</span>
              <span>Próximo envio: {a.proximo_envio}</span>
              {!a.pode_abordar.ok && <span>· {a.pode_abordar.motivo}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={carregar} disabled={carregando}><RefreshCw size={14} /> Atualizar</Button>
            {(!a.campanha || a.campanha.status !== "running") && <Button size="sm" onClick={() => irPara("configuracao")}>Configurar piloto</Button>}
            <Button variant={a.ligado ? "destructive" : "default"} size="sm" onClick={killSwitch} disabled={alternando}><Power size={14} /> {a.ligado ? "Desligar agente" : "Ligar agente"}</Button>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={Activity} label="Abordagens hoje" value={`${a.teto.usado}/${a.teto.limite}`} sub={`${d.hoje.followups} follow-ups`} tone={a.teto.usado >= a.teto.limite ? "warn" : undefined} />
          <Kpi icon={MessageSquare} label="Respostas hoje" value={d.hoje.respostas} sub={`${c.aguardando_lone} esperando o agente`} tone={c.aguardando_lone ? "warn" : undefined} />
          <Kpi icon={CalendarCheck} label="Reuniões hoje" value={d.hoje.reunioes} sub={`${d.hoje.reunioes_online} online · ${d.hoje.visitas} visitas`} tone={d.hoje.reunioes ? "good" : undefined} />
          <Kpi icon={Wallet} label="Custo IA hoje" value={usd(a.custo_hoje_usd)} sub={`piloto ${usd(a.custo_usd)}`} />
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Resposta" value={pct(e.taxa_resposta)} sub="dos abordados" />
          <Kpi label="Decisor" value={pct(e.taxa_decisor)} sub="dos abordados" />
          <Kpi label="Interesse" value={pct(e.taxa_interesse)} sub="dos abordados" />
          <Kpi label="Reunião" value={pct(e.taxa_reuniao)} sub="dos abordados" tone={e.taxa_reuniao ? "good" : undefined} />
        </div>
      </section>

      {/* 2. Precisa de você — a caixa de exceções */}
      <Secao titulo={<span className="inline-flex items-center gap-2"><AlertCircle size={16} className={d.precisa_humano.length ? "text-lone-warning" : "text-lone-success"} /> Precisa de você ({d.precisa_humano.length})</span>} acao={d.precisa_humano.length ? <Button variant="ghost" size="sm" onClick={() => abrirLista({ humano: true, rotulo: "Precisa de você" })}>Ver lista</Button> : undefined}>
        {d.precisa_humano.length === 0 ? <Vazio texto="Agente operando sozinho. Nenhuma exceção aberta." /> : (
          <ul className="divide-y divide-border">
            {d.precisa_humano.map((p) => (
              <li key={p.id} className="flex cursor-pointer items-center justify-between gap-3 py-2 hover:bg-accent/50" onClick={() => abrir(p.id)}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="truncate text-lone-body font-medium text-foreground">{p.nome}</span><ChipClasse classe={p.classe} score={p.score} /><ChipEstagio estagio={p.estagio} /></div>
                  <div className="truncate text-lone-caption text-muted-foreground">{p.motivo_humano}</div>
                </div>
                <span className="shrink-0 text-lone-caption text-muted-foreground">{haQuanto(p.updated_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {/* 3. Funil por macroestágio */}
      <Secao titulo="Funil de prospecção" acao={<span className="text-lone-caption text-muted-foreground">quem passou por cada etapa · % sobre a anterior · clique para ver</span>}>
        <ol className="space-y-1.5">
          {d.funil.map((f) => (
            <li key={f.chave} className={`flex items-center gap-3 text-lone-body ${f.n ? "cursor-pointer hover:bg-accent/50" : ""}`} onClick={() => f.n && abrirLista({ alcancou: f.chave, rotulo: f.rotulo })}>
              <span className="w-40 shrink-0 truncate text-muted-foreground">{f.rotulo}</span>
              <div className="h-2 flex-1 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(f.n ? 3 : 0, (f.n / maxFunil) * 100)}%` }} /></div>
              <span className="w-10 text-right tabular-nums font-medium text-foreground">{f.n}</span>
              <span className={`w-14 text-right tabular-nums text-lone-caption ${f.pct_anterior !== null && f.pct_anterior < 30 ? "text-lone-danger" : "text-muted-foreground"}`}>{f.pct_anterior === null ? "" : `${f.pct_anterior.toString().replace(".", ",")}%`}</span>
            </li>
          ))}
        </ol>
      </Secao>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 4. Conversas */}
        <Secao titulo={<span className="inline-flex items-center gap-2"><MessageSquare size={16} /> Conversas</span>}>
          <Linha2 rotulo="Abordagens enviadas" valor={c.abordagens} onClick={() => abrirLista({ alcancou: "abordados", rotulo: "Abordados" })} />
          <Linha2 rotulo="Responderam" valor={c.responderam} onClick={() => abrirLista({ alcancou: "responderam", rotulo: "Responderam" })} />
          <Linha2 rotulo="Não responderam" valor={c.nao_responderam} onClick={() => abrirLista({ aguardando: "sem_resposta", rotulo: "Sem resposta" })} />
          <Linha2 rotulo="Taxa de resposta" valor={pct(c.taxa_resposta)} />
          <Linha2 rotulo="Responderam hoje" valor={c.responderam_hoje} />
          <Linha2 rotulo="Conversas abertas" valor={c.abertas} />
          <Linha2 rotulo="Aguardando a Lone (deve a próxima mensagem)" valor={c.aguardando_lone} tom={c.aguardando_lone ? "text-lone-warning" : "text-foreground"} onClick={() => abrirLista({ aguardando: "lone", rotulo: "Aguardando a Lone" })} />
          <Linha2 rotulo="Aguardando o prospect" valor={c.aguardando_prospect} onClick={() => abrirLista({ aguardando: "prospect", rotulo: "Aguardando o prospect" })} />
        </Secao>

        {/* 5. SLA */}
        <Secao titulo={<span className="inline-flex items-center gap-2"><Gauge size={16} /> SLA de atendimento <span className={`text-lone-caption ${TOM_SEMAFORO[s.semaforo]}`}>· meta {s.meta_min} min · {s.semaforo === "sem_dados" ? "sem dados" : s.semaforo}</span></span>}>
          <Linha2 rotulo="Tempo médio de resposta" valor={dur(s.media_s)} />
          <Linha2 rotulo="Mediana" valor={dur(s.mediana_s)} />
          <Linha2 rotulo={`Dentro de ${s.meta_min} min`} valor={pct(s.pct_dentro)} tom={TOM_SEMAFORO[s.semaforo]} />
          <Linha2 rotulo={`Fora de ${s.meta_min} min`} valor={`${s.fora}${s.amostra ? ` de ${s.amostra}` : ""}`} />
          <Linha2 rotulo="Maior espera" valor={dur(s.maior_s)} />
          <Linha2 rotulo="Aguardando resposta do agente agora" valor={`${s.aguardando_agora}${s.maior_espera_agora_s ? ` (há ${dur(s.maior_espera_agora_s)})` : ""}`} tom={s.ids_fora_agora.length ? "text-lone-danger" : "text-foreground"} onClick={() => s.aguardando_agora && abrirLista({ aguardando: "lone", rotulo: "Aguardando o agente" })} />
          <Linha2 rotulo="Ações do agente no prazo" valor={pct(e.acoes_no_prazo)} />
          <p className="mt-2 text-lone-caption text-muted-foreground">Contado dentro do horário de atendimento: mensagem que chega às 22h conta a partir das 09:00.</p>
        </Secao>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 6. Velocity */}
        <Secao titulo={<span className="inline-flex items-center gap-2"><Timer size={16} /> Tempo médio no funil</span>}>
          {d.tempos.every((t) => t.n === 0) ? <Vazio texto="Aparece quando houver respostas e reuniões." /> : d.tempos.map((t) => (
            <Linha2 key={t.chave} rotulo={`${t.rotulo}${t.n ? ` (n=${t.n})` : ""}`} valor={dur(t.media_s)} />
          ))}
        </Secao>

        {/* 7. Gargalos */}
        <Secao titulo="Gargalos atuais">
          {d.gargalos.length === 0 ? <Vazio texto="Nada a apontar." /> : (
            <ul className="space-y-2">
              {d.gargalos.map((g, i) => (
                <li key={i} className={`flex items-start gap-2 text-lone-body text-foreground ${g.ids?.length ? "cursor-pointer hover:bg-accent/50" : ""}`} onClick={() => g.ids?.length && abrirLista({ ...(g.texto.includes("esperando o agente") ? { sla: "fora" } : g.texto.includes("follow-up") ? { aguardando: "sem_resposta" } : { humano: true }), rotulo: g.texto })}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TOM_GARGALO[g.tipo] ?? "bg-muted-foreground"}`} />
                  <span>{g.texto}</span>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 8. Distribuição */}
        <Secao titulo="Leads ativos por etapa">
          {d.distribuicao.length === 0 ? <Vazio texto="Nenhum lead em conversa ainda." /> : (
            <ul className="space-y-1.5">
              {d.distribuicao.map((x) => (
                <li key={x.estagio} className="flex cursor-pointer items-center gap-3 text-lone-body hover:bg-accent/50" onClick={() => abrirLista({ estagio: x.estagio, rotulo: x.rotulo })}>
                  <span className="w-40 shrink-0 truncate text-muted-foreground" title={x.macro_rotulo}>{x.rotulo}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(4, (x.n / maxDist) * 100)}%` }} /></div>
                  <span className="w-8 text-right tabular-nums text-foreground">{x.n}</span>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        {/* 9. Aging */}
        <Secao titulo="Leads parados por tempo na etapa">
          {d.aging.every((x) => !x.n) ? <Vazio texto="Nenhum lead ativo no pipeline." /> : d.aging.map((x) => (
            <Linha2 key={x.chave} rotulo={x.rotulo} valor={x.n} tom={x.chave === "15d_mais" && x.n ? "text-lone-danger" : x.chave === "8_15d" && x.n ? "text-lone-warning" : "text-foreground"} onClick={() => x.n ? abrirLista({ aging: x.chave, rotulo: `Parados ${x.rotulo}` }) : undefined} />
          ))}
        </Secao>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 10. Fila do dia */}
        <Secao titulo={<span className="inline-flex items-center gap-2"><ListOrdered size={16} /> Fila do dia</span>} acao={<Button variant="ghost" size="sm" onClick={() => irPara("fila")}>Ver fila</Button>}>
          <div className="grid grid-cols-2 gap-3">
            <Linha2 rotulo="Selecionados" valor={d.fila.selecionados} />
            <Linha2 rotulo="Abordados" valor={d.fila.abordados} />
            <Linha2 rotulo="Aguardando envio" valor={d.fila.aguardando} />
            <Linha2 rotulo="Score médio" valor={d.fila.score_medio ?? "—"} />
            <Linha2 rotulo="Classe A / B" valor={`${d.fila.classe_a} / ${d.fila.classe_b}`} />
            <Linha2 rotulo="Próximo envio" valor={d.fila.proximo_envio_texto} />
          </div>
          {d.fila.melhor && <p className="mt-2 cursor-pointer text-lone-body text-foreground hover:underline" onClick={() => abrir(d.fila.melhor!.id)}>Melhor oportunidade: {d.fila.melhor.nome} — {d.fila.melhor.score ?? "?"}/100</p>}
          {d.fila_lista.length > 0 && (
            <ol className="mt-3 divide-y divide-border">
              {d.fila_lista.slice(0, 10).map((p) => (
                <li key={p.id} className="flex cursor-pointer items-center gap-3 py-1.5 hover:bg-accent/50" onClick={() => abrir(p.id)}>
                  <span className="w-5 text-right tabular-nums text-lone-caption text-muted-foreground">{p.ranking_pos || "—"}</span>
                  <div className="min-w-0 flex-1"><div className="truncate text-lone-body text-foreground">{p.nome}</div><div className="truncate text-lone-caption text-muted-foreground">{p.cidade ?? "—"} · {p.segmento ?? "—"}{p.decisor_nome ? ` · ${p.decisor_nome}` : ""}</div></div>
                  <ChipClasse classe={p.classe} score={p.score} /><ChipEstagio estagio={p.estagio} />
                </li>
              ))}
            </ol>
          )}
        </Secao>

        {/* 11. Eficiência do agente */}
        <Secao titulo={<span className="inline-flex items-center gap-2"><Bot size={16} /> Eficiência do SDR IA</span>}>
          <Linha2 rotulo="Abordagens por dia útil" valor={e.abordagens_por_dia ?? "—"} />
          <Linha2 rotulo="Resposta" valor={pct(e.taxa_resposta)} />
          <Linha2 rotulo="Contato com decisor" valor={pct(e.taxa_decisor)} />
          <Linha2 rotulo="Interesse" valor={pct(e.taxa_interesse)} />
          <Linha2 rotulo="Reunião" valor={pct(e.taxa_reuniao)} />
          <Linha2 rotulo="SLA" valor={pct(e.sla_pct)} tom={TOM_SEMAFORO[s.semaforo]} />
          <Linha2 rotulo="Ações no prazo" valor={pct(e.acoes_no_prazo)} />
          <Linha2 rotulo="Erros operacionais (envio falhou)" valor={e.erros_operacionais} tom={e.erros_operacionais ? "text-lone-danger" : "text-foreground"} />
          <Linha2 rotulo="Conversas que precisaram de humano" valor={`${e.handoffs_humanos} de ${e.conversas}`} />
          <Linha2 rotulo="Autonomia" valor={pct(e.autonomia)} tom={e.autonomia === null ? "text-foreground" : e.autonomia >= 90 ? "text-lone-success" : e.autonomia >= 75 ? "text-lone-warning" : "text-lone-danger"} />
        </Secao>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Secao titulo={<span className="inline-flex items-center gap-2"><MapPin size={16} /> Próximas reuniões e visitas</span>} acao={<Button variant="ghost" size="sm" onClick={() => irPara("agenda")}>Agenda</Button>}>
          {d.reunioes.length === 0 ? <Vazio texto="Nenhuma reunião marcada." /> : (
            <ul className="divide-y divide-border">
              {d.reunioes.map((r) => (
                <li key={r.id} className="flex cursor-pointer items-center justify-between gap-3 py-2 hover:bg-accent/50" onClick={() => abrir(r.id)}>
                  <div className="min-w-0"><div className="truncate text-lone-body text-foreground">{r.nome}{r.decisor_nome ? ` — ${r.decisor_nome}` : ""}</div><div className="text-lone-caption text-muted-foreground">{fmtExtenso(r.reuniao_em)} · {r.reuniao_tipo === "visita" ? `visita${r.cidade ? ` em ${r.cidade}` : ""}` : "Google Meet"}</div></div>
                  <ChipEstagio estagio={r.estagio} />
                </li>
              ))}
            </ul>
          )}
        </Secao>
        <Secao titulo={<span className="inline-flex items-center gap-2"><Users size={16} /> Últimas mensagens</span>} acao={<Button variant="ghost" size="sm" onClick={() => irPara("conversas")}>Conversas</Button>}>
          {d.recentes.length === 0 ? <Vazio texto="Nenhuma mensagem trocada ainda." /> : (
            <ul className="divide-y divide-border">
              {d.recentes.map((m) => (
                <li key={m.id} className="flex cursor-pointer items-start gap-3 py-2 hover:bg-accent/50" onClick={() => abrir(m.prospect_id)}>
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${m.direcao === "in" ? "bg-lone-success" : m.autor === "humano" ? "bg-lone-warning" : "bg-primary"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-lone-caption text-muted-foreground"><span className="font-medium text-foreground">{m.prospect?.nome ?? "—"}</span><span>{m.direcao === "in" ? "prospect" : m.autor}</span><span>{fmtDataHora(m.created_at)}</span></div>
                    <div className="truncate text-lone-body text-foreground">{m.texto}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>
    </div>
  );
}
