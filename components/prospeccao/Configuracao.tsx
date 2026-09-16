"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Play, Pause, RotateCcw, Save, Link2, Unlink, FileSpreadsheet, Upload, Search, MessageSquareText } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { Button } from "@/components/ui/button";
import { Secao, Campo, inputCls, Erro, fmtData, ROTULO_ESTAGIO } from "./ui";

interface Campanha { id: string; nome: string; status: string; iniciado_em: string | null; termina_em: string | null; duracao_dias: number; limite_dia: number; auto_stop: boolean; janela_abordagem: { ini: string; fim: string }; janela_resposta: { ini: string; fim: string }; finalizado_motivo: string | null; reativado_por: string | null }
interface Config {
  ligado: boolean; base: { nome: string; cidade: string; uf: string; lat: number; lng: number }; raio_visita_km: number; uf_permitidas: string[];
  segmentos: { nome: string; termos: string[]; cnaes: string[] }[]; cidades: string[]; excluidos: string[]; queries_por_dia: number; providers: { web_search: boolean; driva: boolean };
  score: { pesos: Record<string, number>; minimo: number }; identidade: { apresentacao: string; quem_faz_reuniao: string; empresas_atendidas: string };
  handoff_numero: string; gift_available: boolean; intervalo_min_s: number; intervalo_max_s: number; envios_por_tick: number; duracao_reuniao_min: number; templates: Record<string, string>;
}
interface Google { configurado: boolean; conectado: boolean; email?: string | null; planilha_id: string | null; planilha_url: string | null; calendario_id: string; redirect_uri: string }

const TEMPLATE_ROTULOS: Record<string, string> = {
  abordagem_com_decisor: "Abordagem (com decisor)", abordagem_sem_decisor: "Abordagem (sem decisor)", recepcao_sobre_o_que: "Recepção: 'sobre o que seria?'",
  followup_1: "Follow-up 1 (dia 2)", followup_2: "Follow-up 2 (dia 5)", followup_3: "Último follow-up (dia 12)", decisor_contexto: "Ao chegar no decisor ({gancho})",
  visita: "Convite: visita (≤ 80 km)", visita_presente: "Convite: visita com presente (só se reservado)", online: "Convite: Google Meet", oferta_horarios: "Oferta de horários ({opcoes})",
  confirmacao_online: "Confirmação online ({link})", confirmacao_online_sem_link: "Confirmação online sem Google", confirmacao_visita: "Confirmação de visita", e_robo: "'É robô?'", preco: "Pediu preço",
  nao_perturbe: "Opt-out", sem_interesse: "Sem interesse", retornar_depois: "Retornar depois ({quando})", lembrete_24h: "Lembrete 24h", lembrete_1h: "Lembrete 1h ({link})",
};

export default function Configuracao({ onChange, googleStatus }: { onChange: () => void; googleStatus?: { status: string; motivo?: string; email?: string } | null }) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [camp, setCamp] = useState<Campanha | null>(null);
  const [historico, setHistorico] = useState<Campanha[]>([]);
  const [google, setGoogle] = useState<Google | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [nova, setNova] = useState({ nome: "Piloto SDR Construção RJ", duracao_dias: 30, limite_dia: 10 });
  const [csv, setCsv] = useState("");
  const [descoberta, setDescoberta] = useState({ segmento: "", cidade: "" });
  const [sim, setSim] = useState({ estagio: "abordado", mensagem: "", historico: [] as { autor: string; texto: string }[], resultado: null as null | { resposta: string | null; intent: { intent: string } | null; estagio_depois: string; motivo: string | null; precisa_humano: boolean; abordagem?: string } });

  const carregar = async () => {
    const [c, k, g] = await Promise.all([chamar<{ config: Config }>("/api/prospeccao/config"), chamar<{ campanha: Campanha | null; historico: Campanha[] }>("/api/prospeccao/campanha"), chamar<Google>("/api/prospeccao/google")]);
    if (!c.ok) { setErro(c.erro); return; }
    setErro(null); setCfg(c.data!.config);
    if (k.ok) { setCamp(k.data!.campanha); setHistorico(k.data!.historico); }
    if (g.ok) setGoogle(g.data!);
  };
  useEffect(() => { void carregar(); }, []);
  useEffect(() => {
    if (!googleStatus) return;
    if (googleStatus.status === "ok") toast.success(`Google conectado${googleStatus.email ? ` (${googleStatus.email})` : ""}`);
    else toast.error(`Google não conectou: ${googleStatus.motivo ?? "erro"}`);
    void carregar();
  }, [googleStatus]);

  const salvar = async (patch: Partial<Config>, rotulo = "Salvo") => {
    setOcupado(rotulo);
    const r = await chamar<{ config: Config }>("/api/prospeccao/config", patch, { method: "PUT" });
    setOcupado(null);
    if (!r.ok) { toast.error(r.erro ?? "Não salvei"); return; }
    setCfg(r.data!.config); toast.success(rotulo); onChange();
  };
  const campanha = async (corpo: Record<string, unknown>, rotulo: string) => {
    setOcupado(rotulo);
    const r = await chamar("/api/prospeccao/campanha", corpo);
    setOcupado(null);
    if (!r.ok) { toast.error(r.erro ?? "Não consegui"); return; }
    toast.success(rotulo); await carregar(); onChange();
  };
  const conectarGoogle = async () => {
    const r = await chamar<{ url: string }>("/api/prospeccao/google", { acao: "iniciar" });
    if (!r.ok) { toast.error(r.erro ?? "Não consegui"); return; }
    window.location.href = r.data!.url;
  };
  const rodarSistema = async (rota: string, rotulo: string) => {
    setOcupado(rotulo);
    const r = await chamar<Record<string, unknown>>(`/api/system/${rota}`, {});
    setOcupado(null);
    if (!r.ok) { toast.error(r.erro ?? "Falhou"); return; }
    const d = r.data ?? {};
    toast[d.pulado ? "warning" : "success"](d.pulado ? `${rotulo}: ${String(d.pulado)}` : `${rotulo}: ${JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k, v]) => typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && k !== "texto")))).slice(0, 200)}`);
    onChange();
  };
  const simular = async () => {
    if (!sim.mensagem.trim()) return;
    setOcupado("Simulando");
    const r = await chamar<{ resposta: string | null; intent: { intent: string } | null; estagio_depois: string; motivo: string | null; precisa_humano: boolean; abordagem?: string }>("/api/prospeccao/simular", { estagio: sim.estagio, mensagem: sim.mensagem, historico: sim.historico });
    setOcupado(null);
    if (!r.ok) { toast.error(r.erro ?? "Falhou"); return; }
    const d = r.data!;
    const hist = [...(sim.historico.length ? sim.historico : [{ autor: "agente", texto: d.abordagem ?? "" }]), { autor: "prospect", texto: sim.mensagem }, ...(d.resposta ? [{ autor: "agente", texto: d.resposta }] : [])];
    setSim({ ...sim, mensagem: "", historico: hist, estagio: d.estagio_depois, resultado: d });
  };

  if (erro && !cfg) return <Erro texto={erro} />;
  if (!cfg) return <p className="text-lone-body text-muted-foreground">Carregando…</p>;
  const rodando = camp?.status === "running" && (!camp.termina_em || new Date(camp.termina_em) > new Date());

  return (
    <div className="space-y-5">
      <Erro texto={erro} />

      <Secao titulo="Piloto">
        {!camp || camp.status === "draft" && false ? null : null}
        {camp ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-lone-body">
              <div><div className="text-lone-caption text-muted-foreground">Campanha</div><div className="text-foreground">{camp.nome}</div></div>
              <div><div className="text-lone-caption text-muted-foreground">Status</div><div className={rodando ? "text-lone-success" : camp.status === "completed" ? "text-lone-danger" : "text-lone-warning"}>{camp.status === "running" ? (rodando ? "Rodando" : "Prazo vencido") : camp.status === "paused" ? "Pausado" : camp.status === "completed" ? "Encerrado" : "Rascunho"}</div></div>
              <div><div className="text-lone-caption text-muted-foreground">Período</div><div className="text-foreground">{camp.iniciado_em ? `${fmtData(camp.iniciado_em)} → ${fmtData(camp.termina_em)}` : `${camp.duracao_dias} dias (ao iniciar)`}</div></div>
              <div><div className="text-lone-caption text-muted-foreground">Limite</div><div className="text-foreground">{camp.limite_dia} novas/dia · {camp.janela_abordagem.ini}–{camp.janela_abordagem.fim} · respostas {camp.janela_resposta.ini}–{camp.janela_resposta.fim}</div></div>
            </div>
            {camp.finalizado_motivo && <p className="text-lone-caption text-muted-foreground">{camp.finalizado_motivo}{camp.reativado_por ? ` · reativado por ${camp.reativado_por}` : ""}</p>}
            <div className="flex flex-wrap gap-2">
              {camp.status === "draft" && <Button disabled={!!ocupado} onClick={() => campanha({ acao: "iniciar", id: camp.id }, "Piloto iniciado")}><Play size={14} /> Iniciar piloto ({camp.duracao_dias} dias)</Button>}
              {camp.status === "running" && <Button variant="destructive" disabled={!!ocupado} onClick={() => { const m = prompt("Motivo da pausa:"); if (m !== null) void campanha({ acao: "pausar", id: camp.id, motivo: m }, "Piloto pausado"); }}><Pause size={14} /> Pausar piloto</Button>}
              {(camp.status === "paused" || camp.status === "completed" || (camp.status === "running" && !rodando)) && <Button disabled={!!ocupado} onClick={() => { if (confirm(`Reativar por mais ${camp.duracao_dias} dias? Fica registrado que foi você.`)) void campanha({ acao: "reativar", id: camp.id }, "Piloto reativado"); }}><RotateCcw size={14} /> Reativar (só admin)</Button>}
              <Button variant="ghost" size="sm" disabled={!!ocupado} onClick={() => { const v = prompt("Novas prospecções por dia:", String(camp.limite_dia)); if (v) void campanha({ acao: "editar", id: camp.id, limite_dia: Number(v) }, "Limite alterado"); }}>Alterar limite/dia</Button>
              <Button variant="ghost" size="sm" disabled={!!ocupado} onClick={() => { const ini = prompt("Janela de abordagem — início (HH:MM):", camp.janela_abordagem.ini); const fim = ini && prompt("Fim (HH:MM):", camp.janela_abordagem.fim); if (ini && fim) void campanha({ acao: "editar", id: camp.id, janela_abordagem: { ini, fim } }, "Janela alterada"); }}>Alterar janela</Button>
            </div>
            <label className="flex items-center gap-2 text-lone-body text-foreground"><input type="checkbox" checked={cfg.ligado} onChange={(e) => salvar({ ligado: e.target.checked }, e.target.checked ? "Agente ligado" : "Agente desligado")} /> Agente ligado (kill-switch geral)</label>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <Campo label="Nome"><input className={inputCls} value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} /></Campo>
            <Campo label="Duração (dias)"><input type="number" className={inputCls} value={nova.duracao_dias} onChange={(e) => setNova({ ...nova, duracao_dias: Number(e.target.value) })} /></Campo>
            <Campo label="Novas/dia"><input type="number" className={inputCls} value={nova.limite_dia} onChange={(e) => setNova({ ...nova, limite_dia: Number(e.target.value) })} /></Campo>
            <div className="flex items-end"><Button disabled={!!ocupado} onClick={() => campanha({ acao: "criar", ...nova }, "Piloto criado (rascunho)")}>Criar piloto</Button></div>
          </div>
        )}
        {historico.length > 1 && <p className="mt-2 text-lone-caption text-muted-foreground">Histórico: {historico.map((h) => `${h.nome} (${h.status})`).join(" · ")}</p>}
      </Secao>

      <Secao titulo="Google Calendar + Sheets">
        {!google ? null : (
          <div className="space-y-2 text-lone-body">
            {!google.configurado && <p className="rounded-lg border border-lone-warning-border bg-lone-warning-bg px-3 py-2 text-lone-warning">Faltam <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code> no servidor. Crie um cliente OAuth (Web) no Google Cloud com o redirect <code>{google.redirect_uri}</code>, ative Calendar API e Sheets API, e me passe as chaves. Sem isso: visitas funcionam normalmente; reunião online é marcada sem link e você envia o Meet.</p>}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-foreground">{google.conectado ? `Conectado como ${google.email ?? "—"}` : "Não conectado"}</span>
              {google.configurado && !google.conectado && <Button size="sm" onClick={conectarGoogle}><Link2 size={14} /> Conectar Google</Button>}
              {google.conectado && <Button size="sm" variant="ghost" onClick={async () => { if (!confirm("Desconectar o Google?")) return; await chamar("/api/prospeccao/google", undefined, { method: "DELETE" }); await carregar(); }}><Unlink size={14} /> Desconectar</Button>}
            </div>
            {google.conectado && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Calendário: {google.calendario_id}</span>
                <Button size="sm" variant="ghost" onClick={async () => { const id = prompt("ID do calendário (vazio = principal):", google.calendario_id === "primary" ? "" : google.calendario_id); if (id === null) return; await chamar("/api/prospeccao/google", { acao: "calendario", id }); await carregar(); }}>Trocar</Button>
                <span className="text-muted-foreground">· Planilha: {google.planilha_url ? <a className="text-primary hover:underline" href={google.planilha_url} target="_blank" rel="noreferrer">abrir</a> : "não criada"}</span>
                {!google.planilha_id && <Button size="sm" variant="secondary" disabled={!!ocupado} onClick={async () => { setOcupado("Planilha"); const r = await chamar<{ url: string }>("/api/prospeccao/sheets", { acao: "criar" }); setOcupado(null); if (!r.ok) { toast.error(r.erro ?? "Falhou"); return; } toast.success("Planilha criada"); await carregar(); }}><FileSpreadsheet size={14} /> Criar planilha espelho</Button>}
                {google.planilha_id && <Button size="sm" variant="ghost" disabled={!!ocupado} onClick={async () => { setOcupado("Sync"); const r = await chamar("/api/prospeccao/sheets", { acao: "sincronizar" }); setOcupado(null); toast[r.ok ? "success" : "error"](r.ok ? "Planilha sincronizada" : (r.erro ?? "Falhou")); }}>Sincronizar agora</Button>}
              </div>
            )}
          </div>
        )}
      </Secao>

      <Secao titulo="ICP e região">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Raio de visita (km)"><input type="number" className={inputCls} defaultValue={cfg.raio_visita_km} onBlur={(e) => Number(e.target.value) !== cfg.raio_visita_km && salvar({ raio_visita_km: Number(e.target.value) })} /></Campo>
          <Campo label="Score mínimo p/ prospectar"><input type="number" className={inputCls} defaultValue={cfg.score.minimo} onBlur={(e) => Number(e.target.value) !== cfg.score.minimo && salvar({ score: { ...cfg.score, minimo: Number(e.target.value) } })} /></Campo>
          <Campo label="Consultas de descoberta/dia"><input type="number" className={inputCls} defaultValue={cfg.queries_por_dia} onBlur={(e) => Number(e.target.value) !== cfg.queries_por_dia && salvar({ queries_por_dia: Number(e.target.value) })} /></Campo>
          <Campo label="Nº de handoff (DDI+DDD)"><input className={inputCls} defaultValue={cfg.handoff_numero} onBlur={(e) => e.target.value.replace(/\D/g, "") !== cfg.handoff_numero && salvar({ handoff_numero: e.target.value.replace(/\D/g, "") })} /></Campo>
        </div>
        <Campo label="Cidades (uma por linha, mais perto da base primeiro)" className="mt-3"><textarea className={`${inputCls} min-h-[120px]`} defaultValue={cfg.cidades.join("\n")} onBlur={(e) => { const v = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean); if (v.join("|") !== cfg.cidades.join("|")) void salvar({ cidades: v }); }} /></Campo>
        <Campo label="Nunca prospectar (uma empresa por linha — clientes de site, parceiros, quem já disse não fora do sistema)" className="mt-3"><textarea className={`${inputCls} min-h-[72px]`} defaultValue={(cfg.excluidos ?? []).join("\n")} onBlur={(e) => { const v = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean); if (v.join("|") !== (cfg.excluidos ?? []).join("|")) void salvar({ excluidos: v }, "Lista de exclusão salva"); }} /></Campo>
        <Campo label="Segmentos (nome | termos de busca separados por ; | CNAEs separados por ;)" className="mt-3">
          <textarea className={`${inputCls} min-h-[200px] font-mono text-xs`} defaultValue={cfg.segmentos.map((s) => `${s.nome} | ${s.termos.join("; ")} | ${s.cnaes.join("; ")}`).join("\n")} onBlur={(e) => {
            const segs = e.target.value.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((c) => c[0]).map((c) => ({ nome: c[0], termos: (c[1] ?? "").split(";").map((x) => x.trim()).filter(Boolean), cnaes: (c[2] ?? "").split(";").map((x) => x.replace(/\D/g, "")).filter(Boolean) }));
            if (JSON.stringify(segs) !== JSON.stringify(cfg.segmentos)) void salvar({ segmentos: segs });
          }} />
        </Campo>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-lone-body">
          <label className="flex items-center gap-2 text-foreground"><input type="checkbox" checked={cfg.gift_available} onChange={(e) => salvar({ gift_available: e.target.checked }, e.target.checked ? "Presente disponível" : "Presente indisponível")} /> Presente disponível (a mensagem só cita presente se ele existir E estiver reservado no prospect)</label>
          <label className="flex items-center gap-2 text-foreground"><input type="checkbox" checked={cfg.providers.web_search} onChange={(e) => salvar({ providers: { ...cfg.providers, web_search: e.target.checked } })} /> Descoberta por busca web</label>
          <label className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" checked={cfg.providers.driva} onChange={(e) => salvar({ providers: { ...cfg.providers, driva: e.target.checked } })} /> Driva (API — precisa de DRIVA_API_KEY; sem ela use o CSV abaixo)</label>
        </div>
      </Secao>

      <Secao titulo="Pesos do score (§10)">
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(cfg.score.pesos).map(([k, v]) => (
            <Campo key={k} label={k.replace(/_/g, " ")}><input type="number" className={inputCls} defaultValue={v} onBlur={(e) => Number(e.target.value) !== v && salvar({ score: { ...cfg.score, pesos: { ...cfg.score.pesos, [k]: Number(e.target.value) } } })} /></Campo>
          ))}
        </div>
        <p className="mt-2 text-lone-caption text-muted-foreground">Soma atual: {Object.values(cfg.score.pesos).reduce((a, b) => a + b, 0)}. Classes: A 80+, B 60–79, C 40–59, não prioritário abaixo de 40. Faturamento entra como SINAL (estimativa com confiança), nunca como número.</p>
      </Secao>

      <Secao titulo="Mensagens (templates)">
        <p className="mb-2 text-lone-caption text-muted-foreground">Chaves entre chaves são preenchidas pelo agente: {"{decisor} {empresa} {gancho} {opcoes} {nome} {quando} {duracao} {link} {endereco} {hora}"}. Sem emoji, sem preço, sem promessa — o validador barra.</p>
        <div className="grid gap-3 lg:grid-cols-2">
          {Object.entries(cfg.templates).map(([k, v]) => (
            <Campo key={k} label={TEMPLATE_ROTULOS[k] ?? k}><textarea className={`${inputCls} min-h-[72px]`} defaultValue={v} onBlur={(e) => e.target.value !== v && salvar({ templates: { ...cfg.templates, [k]: e.target.value } as Config["templates"], }, "Template salvo")} /></Campo>
          ))}
        </div>
      </Secao>

      <Secao titulo="Rodar agora">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={!!ocupado} onClick={() => rodarSistema("prospect-descobrir", "Descoberta")}>Descoberta do dia</Button>
          <Button size="sm" variant="secondary" disabled={!!ocupado} onClick={() => rodarSistema("prospect-enriquecer", "Enriquecimento")}>Enriquecer lote</Button>
          <Button size="sm" variant="secondary" disabled={!!ocupado} onClick={() => rodarSistema("prospect-ranking", "Ranking")}>Ranking</Button>
          <Button size="sm" variant="secondary" disabled={!!ocupado} onClick={() => rodarSistema("prospect-tick", "Tick")}>Tick (pendências/lembretes/planilha)</Button>
          <Button size="sm" variant="secondary" disabled={!!ocupado} onClick={() => rodarSistema("prospect-relatorio?dry=1", "Relatório (prévia)")}>Relatório do dia (prévia)</Button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <select className={inputCls} value={descoberta.segmento} onChange={(e) => setDescoberta({ ...descoberta, segmento: e.target.value })}><option value="">Segmento…</option>{cfg.segmentos.map((s) => <option key={s.nome} value={s.nome}>{s.nome}</option>)}</select>
          <select className={inputCls} value={descoberta.cidade} onChange={(e) => setDescoberta({ ...descoberta, cidade: e.target.value })}><option value="">Cidade…</option>{cfg.cidades.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <Button size="sm" disabled={!descoberta.segmento || !descoberta.cidade || !!ocupado} onClick={async () => { setOcupado("Descobrindo"); const r = await chamar<{ achados: number; novos: number; duplicados: number; excluidos: number; erros: string[] }>("/api/prospeccao/descobrir", descoberta); setOcupado(null); if (!r.ok) { toast.error(r.erro ?? "Falhou"); return; } const d = r.data!; toast.success(`${d.achados} achados · ${d.novos} novos · ${d.duplicados} repetidos · ${d.excluidos} excluídos${d.erros.length ? ` · erros: ${d.erros.join("; ")}` : ""}`); onChange(); }}><Search size={14} /> Descobrir esta combinação</Button>
        </div>
      </Secao>

      <Secao titulo="Importar CSV (Driva ou planilha)">
        <textarea className={`${inputCls} min-h-[100px] font-mono text-xs`} placeholder="Cole o CSV aqui (cabeçalho com nome/razão social, cnpj, telefone, cidade, instagram, site, cnae, sócio…)" value={csv} onChange={(e) => setCsv(e.target.value)} />
        <div className="mt-2 flex items-center gap-2">
          <input type="file" accept=".csv,text/csv" className="text-lone-caption text-muted-foreground" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
          <Button size="sm" disabled={!csv.trim() || !!ocupado} onClick={async () => { setOcupado("Importando"); const r = await chamar<{ total: number; reconhecidos: number; novos: number; duplicados: number; excluidos: number; colunas: Record<string, number>; motivos: string[] }>("/api/prospeccao/importar", { csv, origem: "csv" }); setOcupado(null); if (!r.ok) { toast.error(r.erro ?? "Falhou"); return; } const d = r.data!; toast.success(`${d.total} linhas · ${d.reconhecidos} reconhecidas · ${d.novos} novas · ${d.duplicados} repetidas · ${d.excluidos} excluídas (colunas: ${Object.keys(d.colunas).join(", ")})`); setCsv(""); onChange(); }}><Upload size={14} /> Importar</Button>
        </div>
      </Secao>

      <Secao titulo={<span className="inline-flex items-center gap-2"><MessageSquareText size={16} /> Simulador de conversa</span>}>
        <p className="mb-2 text-lone-caption text-muted-foreground">Você faz o papel do prospect (Casa do Piso, Cabo Frio, 45 km, decisor Marcelo). Nada é enviado nem gravado — só a decisão do agente.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <select className={inputCls} value={sim.estagio} onChange={(e) => setSim({ ...sim, estagio: e.target.value, historico: [], resultado: null })}>{["abordado", "atendente", "decisor_contatado", "interesse", "horario_proposto"].map((e) => <option key={e} value={e}>{ROTULO_ESTAGIO[e]}</option>)}</select>
          <input className={inputCls} placeholder="Mensagem do prospect" value={sim.mensagem} onChange={(e) => setSim({ ...sim, mensagem: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void simular()} />
          <div className="flex gap-1"><Button size="sm" disabled={!sim.mensagem.trim() || !!ocupado} onClick={simular}>Enviar</Button><Button size="sm" variant="ghost" onClick={() => setSim({ estagio: "abordado", mensagem: "", historico: [], resultado: null })}>Limpar</Button></div>
        </div>
        {sim.historico.length > 0 && (
          <div className="mt-3 space-y-2">
            {sim.historico.map((h, i) => (
              <div key={i} className={`flex ${h.autor === "prospect" ? "justify-start" : "justify-end"}`}><div className={`max-w-[80%] whitespace-pre-wrap rounded-xl px-3 py-2 text-lone-body ${h.autor === "prospect" ? "bg-muted text-foreground" : "bg-primary/10 text-foreground"}`}>{h.texto}</div></div>
            ))}
            {sim.resultado && <p className="text-lone-caption text-muted-foreground">Intenção: {sim.resultado.intent?.intent ?? "—"} · estágio: {ROTULO_ESTAGIO[sim.resultado.estagio_depois] ?? sim.resultado.estagio_depois}{sim.resultado.motivo ? ` · ${sim.resultado.motivo}` : ""}{sim.resultado.precisa_humano ? " · chamaria você" : ""}</p>}
          </div>
        )}
      </Secao>

      <p className="text-lone-caption text-muted-foreground"><Save size={12} className="mr-1 inline" /> Campos de texto salvam ao sair do campo.</p>
    </div>
  );
}
