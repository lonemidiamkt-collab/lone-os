"use client";

import { useEffect, useState } from "react";
import { Activity, Users, MessageSquare, UserCheck, CalendarCheck, MapPin, Wallet, AlertCircle, RefreshCw, Power, Wifi, WifiOff } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { Button } from "@/components/ui/button";
import { Kpi, Secao, Vazio, Erro, ChipEstagio, ChipClasse, fmtDataHora, fmtExtenso, haQuanto, usd } from "./ui";

interface Metricas {
  abordados: number; respostas: number; decisores: number; interessados: number; reunioes_online: number; visitas: number; realizadas: number;
  propostas: number; vendas: number; followups: number; opt_outs: number; custo_usd: number; encontrados: number; icp_aprovados: number;
  conversao: Record<string, string>; melhor_lead: { id: string; nome: string; score: number | null } | null;
}
export interface Dash {
  agente: {
    ligado: boolean; rodando: boolean; campanha: { id: string; nome: string; status: string; limite_dia: number; termina_em: string | null } | null;
    dia_piloto: { dia: number; total: number } | null; teto: { usado: number; limite: number };
    pode_abordar: { ok: boolean; motivo?: string }; pode_responder: { ok: boolean; motivo?: string };
    whatsapp: { connected: boolean; state: string; instance: string | null; error?: string };
    google: { configurado: boolean; conectado: boolean; email?: string | null; planilha: string | null }; handoff_numero: string; custo_usd: number;
  };
  metricas: { hoje: Metricas; semana: Metricas; piloto: Metricas | null };
  funil: { estagio: string; rotulo: string; etapa: string; n: number }[];
  precisa_humano: { id: string; nome: string; cidade: string | null; estagio: string; motivo_humano: string | null; updated_at: string; score: number | null; classe: string | null }[];
  fila_do_dia: { id: string; nome: string; cidade: string | null; segmento: string | null; score: number | null; classe: string | null; ranking_pos: number | null; decisor_nome: string | null; estagio: string }[];
  recentes: { id: string; prospect_id: string; direcao: string; autor: string; texto: string; created_at: string; prospect: { nome: string; estagio: string } | null }[];
  reunioes: { id: string; nome: string; cidade: string | null; reuniao_em: string; reuniao_tipo: string; meet_url: string | null; decisor_nome: string | null; estagio: string }[];
}

export default function VisaoGeral({ abrir, irPara }: { abrir: (id: string) => void; irPara: (tab: string) => void }) {
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
  const a = d.agente;
  const h = d.metricas.hoje, s = d.metricas.semana, pi = d.metricas.piloto;
  const reunioesHoje = h.reunioes_online + h.visitas;
  const statusTexto = !a.ligado ? "Desligado" : !a.campanha ? "Sem piloto" : a.campanha.status === "running" && a.rodando ? "Rodando" : a.campanha.status === "completed" ? "Piloto encerrado" : a.campanha.status === "paused" ? "Pausado" : a.campanha.status === "draft" ? "Rascunho" : "Vencido";
  const statusTom = a.ligado && a.rodando ? "text-lone-success" : a.ligado && a.campanha?.status === "draft" ? "text-lone-warning" : "text-lone-danger";

  return (
    <div className="space-y-5">
      <Erro texto={erro} />
      {/* Estado do agente */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-lone-eyebrow uppercase tracking-wider text-muted-foreground">Piloto SDR Lone</div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`text-lone-h1 tracking-tight ${statusTom}`}>{statusTexto}</span>
              {a.campanha && <span className="text-lone-body text-muted-foreground">· {a.campanha.nome}{a.dia_piloto ? ` · dia ${a.dia_piloto.dia} de ${a.dia_piloto.total}` : ""}</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-lone-caption text-muted-foreground">
              <span className="inline-flex items-center gap-1">{a.whatsapp.connected ? <Wifi size={12} className="text-lone-success" /> : <WifiOff size={12} className="text-lone-danger" />} WhatsApp {a.whatsapp.instance ?? "—"}: {a.whatsapp.connected ? "conectado" : a.whatsapp.state}</span>
              <span>Google: {a.google.conectado ? `conectado (${a.google.email ?? ""})` : a.google.configurado ? "não conectado" : "sem credenciais"}</span>
              <span>Handoff: +{a.handoff_numero}</span>
              <span>Abordagem agora: {a.pode_abordar.ok ? "liberada" : a.pode_abordar.motivo}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={carregar} disabled={carregando}><RefreshCw size={14} /> Atualizar</Button>
            {!a.campanha || a.campanha.status !== "running" ? (
              <Button size="sm" onClick={() => irPara("configuracao")}>Configurar piloto</Button>
            ) : null}
            <Button variant={a.ligado ? "destructive" : "default"} size="sm" onClick={killSwitch} disabled={alternando}><Power size={14} /> {a.ligado ? "Desligar agente" : "Ligar agente"}</Button>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={Activity} label="Teto do dia" value={`${a.teto.usado}/${a.teto.limite}`} sub="novas abordagens hoje" tone={a.teto.usado >= a.teto.limite ? "warn" : undefined} />
          <Kpi icon={MessageSquare} label="Respostas hoje" value={h.respostas} sub={`${h.followups} follow-ups enviados`} />
          <Kpi icon={CalendarCheck} label="Reuniões hoje" value={reunioesHoje} sub={`${h.reunioes_online} online · ${h.visitas} visitas`} tone={reunioesHoje ? "good" : undefined} />
          <Kpi icon={Wallet} label="Custo IA (piloto)" value={usd(a.custo_usd)} sub={`hoje ${usd(h.custo_usd)}`} />
        </div>
      </section>

      {/* Precisa de você */}
      <Secao titulo={<span className="inline-flex items-center gap-2"><AlertCircle size={16} className="text-lone-warning" /> Precisa de você ({d.precisa_humano.length})</span>}>
        {d.precisa_humano.length === 0 ? <Vazio texto="Nada pendente. O agente está cuidando de tudo." /> : (
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

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Métricas §34 */}
        <Secao titulo="Piloto até agora">
          {!pi ? <Vazio texto="O piloto ainda não começou." /> : (
            <div className="grid grid-cols-2 gap-3 text-lone-body">
              {[
                ["Empresas encontradas", pi.encontrados], ["ICP aprovados", pi.icp_aprovados], ["Abordadas", pi.abordados], ["Respostas", pi.respostas],
                ["Decisores", pi.decisores], ["Interessados", pi.interessados], ["Reuniões online", pi.reunioes_online], ["Visitas", pi.visitas],
                ["Realizadas", pi.realizadas], ["Propostas", pi.propostas], ["Clientes", pi.vendas], ["Opt-outs", pi.opt_outs],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between border-b border-border py-1"><span className="text-muted-foreground">{k}</span><span className="tabular-nums text-foreground">{v}</span></div>
              ))}
              <div className="col-span-2 mt-2 text-lone-caption text-muted-foreground">
                Conversão: prospect→resposta {pi.conversao.prospect_resposta} · resposta→decisor {pi.conversao.resposta_decisor} · decisor→interesse {pi.conversao.decisor_interesse} · interesse→reunião {pi.conversao.interesse_reuniao} · prospect→reunião {pi.conversao.prospect_reuniao}
              </div>
              <div className="col-span-2 text-lone-caption text-muted-foreground">Últimos 7 dias: {s.abordados} abordadas · {s.respostas} respostas · {s.reunioes_online + s.visitas} reuniões</div>
            </div>
          )}
        </Secao>

        {/* Funil */}
        <Secao titulo="Funil (pipeline 01–17)">
          {d.funil.length === 0 ? <Vazio texto="Nenhum prospect ainda. Rode a descoberta em Configuração." /> : (
            <ul className="space-y-1.5">
              {d.funil.map((f) => {
                const max = Math.max(...d.funil.map((x) => x.n));
                return (
                  <li key={f.estagio} className="flex items-center gap-3 text-lone-body">
                    <span className="w-44 shrink-0 truncate text-muted-foreground" title={f.etapa}>{f.rotulo}</span>
                    <div className="h-1.5 flex-1 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(4, (f.n / max) * 100)}%` }} /></div>
                    <span className="w-8 text-right tabular-nums text-foreground">{f.n}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Secao>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Secao titulo={<span className="inline-flex items-center gap-2"><Users size={16} /> Fila do dia</span>} acao={<Button variant="ghost" size="sm" onClick={() => irPara("fila")}>Ver tudo</Button>}>
          {d.fila_do_dia.length === 0 ? <Vazio texto="A fila é montada às 08:35 nos dias úteis (ou pela Fila do dia)." /> : (
            <ol className="divide-y divide-border">
              {d.fila_do_dia.slice(0, 10).map((p) => (
                <li key={p.id} className="flex cursor-pointer items-center gap-3 py-2 hover:bg-accent/50" onClick={() => abrir(p.id)}>
                  <span className="w-5 text-right tabular-nums text-lone-caption text-muted-foreground">{p.ranking_pos || "—"}</span>
                  <div className="min-w-0 flex-1"><div className="truncate text-lone-body text-foreground">{p.nome}</div><div className="truncate text-lone-caption text-muted-foreground">{p.cidade ?? "—"} · {p.segmento ?? "—"}{p.decisor_nome ? ` · ${p.decisor_nome}` : ""}</div></div>
                  <ChipClasse classe={p.classe} score={p.score} /><ChipEstagio estagio={p.estagio} />
                </li>
              ))}
            </ol>
          )}
        </Secao>

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
      </div>

      <Secao titulo={<span className="inline-flex items-center gap-2"><UserCheck size={16} /> Últimas mensagens</span>} acao={<Button variant="ghost" size="sm" onClick={() => irPara("conversas")}>Conversas</Button>}>
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
  );
}
