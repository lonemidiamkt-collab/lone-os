"use client";

// components/client/ficha/CrmDoCliente.tsx — o CRM do cliente na ficha (aba Integrações): o acesso dele ao Âncora
// CRM e o CRM que alimenta o relatório semanal, o mensal e a aba "Atendimento e vendas" do portal.
//
// Três jeitos (lib/crm-externo, docs/CRM_INTEGRACOES.md):
//   Âncora     — gera o link de cadastro aqui; quando o cliente termina, a conexão nasce sozinha.
//   Kommo      — subdomínio + token de longa duração (testado antes de gravar; guardado cifrado).
//   API aberta — qualquer outro CRM (ou n8n/Make) manda eventos com o token gerado aqui. O token aparece UMA vez.
//
// FALHA ≠ "SEM CRM": se a leitura falhar, a tela diz que falhou (e o motivo); nunca mostra "sem conexão".

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Anchor, Check, Copy, Eye, KeyRound, Link2, Loader2, Pause, Play, Plug, RefreshCw, Unplug, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { resumoDoEstado, type EstadoDoCliente } from "@/lib/integracoes/ancora";
import { GerarLinkAncora, TOM_ANCORA, assinaturaAncora, diaAncora } from "@/components/ancora/AcessoAncora";
import { ROTULO_PROVEDOR, type ProvedorCrm } from "@/lib/crm-externo/metricas";
import { formatarCrm, type RelatorioCrm } from "@/lib/crm-externo/relatorio";
import type { KommoFunil } from "@/lib/crm-externo/kommo";

interface Conexao {
  id: string;
  provedor: ProvedorCrm;
  ativa: boolean;
  config: { subdominio?: string; funil_id?: number | null; etapa_orcamento_id?: number | null };
  tokenPrefixo: string | null;
  origem: "manual" | "automatica";
  criadoEm: string;
  criadoPor: string | null;
  ultimaLeituraEm: string | null;
  ultimoErro: string | null;
}
interface Resposta { conexao: Conexao | null; ancora: { ligada: boolean; estado: EstadoDoCliente | null; erro: string | null }; podeAlterar: boolean }
interface Previa { relatorio: RelatorioCrm | null; avisos: string[]; indisponivel: boolean }

const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const ENDPOINT = "/api/crm-externo/eventos";

async function copiar(texto: string) {
  try { await navigator.clipboard.writeText(texto); toast.success("Copiado."); }
  catch { toast.error("Não consegui copiar. Selecione e copie à mão."); }
}

// ── Âncora: o acesso do cliente ──────────────────────────────────────────────

function AcessoAncora({ clientId, a, podeAlterar, onMudou }: { clientId: string; a: Resposta["ancora"]; podeAlterar: boolean; onMudou: () => void }) {
  const [gerando, setGerando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  if (!a.ligada) {
    return <p className="text-lone-caption text-muted-foreground">A integração com o Âncora está desligada neste servidor (falta o <span className="font-mono">ANCORA_PARCEIRO_SECRET</span>).</p>;
  }
  if (a.erro) {
    return <p className="rounded-lg border border-lone-warning-border bg-lone-warning-bg p-2.5 text-lone-caption text-lone-warning">Não consegui perguntar ao Âncora agora ({a.erro}). Isso não quer dizer que o cliente está sem acesso.</p>;
  }
  const e = a.estado;
  const r = resumoDoEstado(e);
  const podeGerar = !e || e.estado === "sem_convite" || e.estado === "vencido";
  const cancelar = async () => {
    setCancelando(true);
    const res = await chamar("/api/ancora/link", { clientId }, { method: "DELETE" });
    setCancelando(false);
    if (!res.ok) { toast.error(res.erro ?? "Não consegui cancelar o link."); return; }
    toast.success("Link cancelado. Ele não abre mais.");
    onMudou();
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-lone-caption font-medium", TOM_ANCORA[r.tom])}>{r.rotulo}</span>
        <span className="text-lone-caption text-muted-foreground">
          {e?.estado === "cadastrou"
            ? [`Cadastrou em ${diaAncora(e.cadastrou_em)}`, assinaturaAncora(e), e.empresa?.acesso_da_agencia ? "autorizou nosso acesso" : "não autorizou nosso acesso"].filter(Boolean).join(" · ")
            : e?.estado === "link_gerado" ? `Gerado em ${diaAncora(e.gerado_em)} · plano ${e.plano ?? "—"}${e.parceria ? " · parceria" : ""}`
            : e?.estado === "vencido" ? `O link de ${diaAncora(e.gerado_em)} venceu sem cadastro` : "Ainda não tem acesso ao Âncora"}
        </span>
      </div>
      {e?.estado === "link_gerado" && e.link && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 select-all break-all rounded-md bg-muted px-2 py-1.5 font-mono text-lone-caption text-muted-foreground">{e.link}</p>
          <Button size="sm" onClick={() => void copiar(e.link!)}><Copy /> Copiar link</Button>
          {podeAlterar && <Button size="sm" variant="ghost" onClick={() => void cancelar()} disabled={cancelando}><X /> {cancelando ? "Cancelando…" : "Cancelar link"}</Button>}
        </div>
      )}
      {podeGerar && podeAlterar && !gerando && (
        <Button size="sm" variant="outline" onClick={() => setGerando(true)}><Link2 /> {e?.estado === "vencido" ? "Gerar novo link de cadastro" : "Liberar Âncora (gerar link de cadastro)"}</Button>
      )}
      {gerando && <GerarLinkAncora clientId={clientId} onFechar={() => setGerando(false)} onGerado={() => { setGerando(false); onMudou(); }} />}
    </div>
  );
}

// ── Kommo: funil e etapa de orçamento ────────────────────────────────────────

const TODOS = "todos", NENHUMA = "nenhuma";

function ConfigKommo({ clientId, c, onSalvo }: { clientId: string; c: Conexao; onSalvo: (c: Conexao) => void }) {
  const [funis, setFunis] = useState<KommoFunil[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [funil, setFunil] = useState<string>(c.config.funil_id != null ? String(c.config.funil_id) : TODOS);
  const [etapa, setEtapa] = useState<string>(c.config.etapa_orcamento_id != null ? String(c.config.etapa_orcamento_id) : NENHUMA);
  const [salvando, setSalvando] = useState(false);

  const abrir = async () => {
    setErro(null);
    const r = await chamar<{ funis: KommoFunil[] }>(`/api/clients/${clientId}/crm`, { acao: "kommo_funis" });
    if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui ler os funis do Kommo."); return; }
    setFunis(r.data.funis);
  };
  const salvar = async () => {
    setSalvando(true);
    const r = await chamar<{ conexao: Conexao }>(`/api/clients/${clientId}/crm`, {
      acao: "kommo_config", funilId: funil === TODOS ? null : Number(funil), etapaOrcamentoId: etapa === NENHUMA ? null : Number(etapa),
    });
    setSalvando(false);
    if (!r.ok || !r.data?.conexao) { toast.error(r.erro ?? "Não consegui salvar."); return; }
    toast.success("Configuração do Kommo salva.");
    onSalvo(r.data.conexao);
  };

  if (!funis) {
    return (
      <div className="space-y-1">
        <p className="text-lone-caption text-muted-foreground">
          Funil: {c.config.funil_id != null ? `#${c.config.funil_id}` : "todos"} · Etapa de orçamento: {c.config.etapa_orcamento_id != null ? `#${c.config.etapa_orcamento_id}` : "não escolhida (o relatório sai sem orçamentos)"}
        </p>
        <Button size="sm" variant="outline" onClick={() => void abrir()}>Escolher funil e etapa de orçamento</Button>
        {erro && <p className="text-lone-caption text-lone-danger">{erro}</p>}
      </div>
    );
  }
  const etapas = funis.filter((f) => funil === TODOS || String(f.id) === funil)
    .flatMap((f) => f.etapas.filter((e) => !e.fechada).map((e) => ({ id: e.id, nome: funis.length > 1 ? `${f.nome} · ${e.nome}` : e.nome })));
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-lone-caption text-muted-foreground">
          Funil que entra no relatório
          <Select value={funil} onValueChange={(v) => { setFunil(v); setEtapa(NENHUMA); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os funis</SelectItem>
              {funis.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.nome}{f.principal ? " (principal)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-lone-caption text-muted-foreground">
          Etapa que conta como orçamento
          <Select value={etapa} onValueChange={setEtapa}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NENHUMA}>Nenhuma (sem orçamentos no relatório)</SelectItem>
              {etapas.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
      </div>
      <p className="text-lone-caption text-muted-foreground">Orçamentos = negócios que ENTRARAM nessa etapa no período. Tempo de resposta o Kommo não informa pela API.</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
        <Button size="sm" variant="ghost" onClick={() => setFunis(null)} disabled={salvando}>Fechar</Button>
      </div>
    </div>
  );
}

// ── Prévia: o bloco que vai no relatório ─────────────────────────────────────

function PreviaCrm({ p }: { p: Previa }) {
  if (p.indisponivel || !p.relatorio) {
    return <p className="rounded-lg border border-lone-warning-border bg-lone-warning-bg p-2.5 text-lone-caption text-lone-warning">{p.avisos[0] ?? "O CRM não respondeu."}</p>;
  }
  const r = p.relatorio;
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-lone-body text-foreground">{r.frase}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {r.kpis.map((k) => (
          <div key={k.chave} className="flex items-baseline justify-between gap-2 border-t border-border py-1">
            <dt className="text-lone-caption text-muted-foreground">{k.rotulo}</dt>
            <dd className="text-lone-caption font-medium tabular-nums text-foreground">{formatarCrm(k.valor, k.formato)}</dd>
          </div>
        ))}
      </dl>
      {r.funil?.length ? <p className="text-lone-caption text-muted-foreground">Funil agora: {r.funil.map((e) => `${e.etapa} ${e.negocios}`).join(" · ")}</p> : null}
      {p.avisos.map((a) => <p key={a} className="text-lone-caption text-lone-warning">{a}</p>)}
    </div>
  );
}

// ── Token da API aberta (aparece uma vez) ────────────────────────────────────

function TokenNovo({ token, onFechar }: { token: string; onFechar: () => void }) {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const exemplo = `curl -X POST ${base}${ENDPOINT} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"eventos":[{"id":"evt-1","tipo":"lead","quando":"2026-11-18T10:00:00-03:00","negocio":"123"}]}'`;
  return (
    <div className="space-y-2 rounded-lg border border-lone-warning-border bg-lone-warning-bg p-3">
      <p className="text-lone-caption font-medium text-lone-warning">Guarde este token agora: ele não aparece de novo. Gerar outro desliga este.</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 select-all break-all rounded-md bg-card px-2 py-1.5 font-mono text-lone-caption text-foreground">{token}</code>
        <Button size="sm" onClick={() => void copiar(token)}><Copy /> Copiar token</Button>
      </div>
      <p className="text-lone-caption text-foreground">Endereço: <span className="font-mono">{base}{ENDPOINT}</span> · tipos: lead, resposta, orcamento, venda, perda, etapa. O guia completo está em docs/CRM_INTEGRACOES.md.</p>
      <pre className="overflow-x-auto rounded-md bg-card p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">{exemplo}</pre>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => void copiar(exemplo)}><Copy /> Copiar exemplo</Button>
        <Button size="sm" variant="ghost" onClick={onFechar}><Check /> Já guardei</Button>
      </div>
    </div>
  );
}

// ── O todo ───────────────────────────────────────────────────────────────────

export default function CrmDoCliente({ clientId }: { clientId: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [kommo, setKommo] = useState<{ subdominio: string; token: string } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await chamar<Resposta>(`/api/clients/${clientId}/crm`);
    setCarregando(false);
    if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui ler o CRM deste cliente."); return; }
    setErro(null);
    setDados(r.data);
  }, [clientId]);
  useEffect(() => { void carregar(); }, [carregar]);

  const acao = async (nome: string, extra: Record<string, unknown> = {}) => {
    setOcupado(nome);
    const r = await chamar<{ conexao?: Conexao | null; token?: string } & Partial<Previa>>(`/api/clients/${clientId}/crm`, { acao: nome, ...extra });
    setOcupado(null);
    if (!r.ok || !r.data) { toast.error(r.erro ?? "Não deu certo."); return null; }
    if ("conexao" in r.data) setDados((d) => (d ? { ...d, conexao: r.data!.conexao ?? null } : d));
    return r.data;
  };

  if (carregando && !dados) return <p className="flex items-center gap-2 text-lone-caption text-muted-foreground"><Loader2 size={13} className="animate-spin" /> Lendo o CRM do cliente…</p>;
  if (erro && !dados) {
    return (
      <p className="rounded-lg border border-lone-danger-border bg-lone-danger-bg p-2.5 text-lone-caption text-lone-danger">
        {erro} <button className="underline" onClick={() => void carregar()}>Tentar de novo</button>
      </p>
    );
  }
  if (!dados) return null;
  const c = dados.conexao;
  const pode = dados.podeAlterar;
  const ancoraCadastrou = dados.ancora.estado?.estado === "cadastrou";

  const formKommo = kommo && (

              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                <label className="block space-y-1 text-lone-caption text-muted-foreground">
                  Endereço da conta
                  <input value={kommo.subdominio} onChange={(e) => setKommo({ ...kommo, subdominio: e.target.value })} placeholder="minhaempresa.kommo.com"
                    className="h-9 w-full rounded-lg border border-border bg-card px-3 text-lone-body text-foreground" />
                </label>
                <label className="block space-y-1 text-lone-caption text-muted-foreground">
                  Token de longa duração (Kommo › Configurações › Integrações › Criar integração › Chaves e escopos)
                  <input value={kommo.token} onChange={(e) => setKommo({ ...kommo, token: e.target.value })} type="password" autoComplete="off"
                    className="h-9 w-full rounded-lg border border-border bg-card px-3 font-mono text-lone-body text-foreground" />
                </label>
                <p className="text-lone-caption text-muted-foreground">O sistema testa o token lendo os funis antes de salvar. Ele fica guardado cifrado e não aparece de novo.</p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={!!ocupado || !kommo.subdominio.trim() || !kommo.token.trim()} onClick={async () => {
                    if (await acao("conectar_kommo", kommo)) { setKommo(null); toast.success(c ? "Token do Kommo trocado." : "Kommo conectado. Escolha o funil e a etapa de orçamento."); }
                  }}>{ocupado === "conectar_kommo" ? "Testando…" : "Testar e conectar"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setKommo(null)}>Cancelar</Button>
                </div>
              </div>
  );

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-lone-body font-medium text-foreground"><Anchor size={14} aria-hidden /> Acesso ao Âncora CRM</h3>
        <AcessoAncora clientId={clientId} a={dados.ancora} podeAlterar={pode} onMudou={() => void carregar()} />
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-lone-body font-medium text-foreground"><Plug size={14} aria-hidden /> CRM nos relatórios e no portal</h3>
          <Button size="sm" variant="ghost" onClick={() => void carregar()} disabled={carregando}><RefreshCw className={cn(carregando && "animate-spin")} /> Atualizar</Button>
        </div>

        {c ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lone-body font-medium text-foreground">{ROTULO_PROVEDOR[c.provedor]}</span>
              <span className={cn("rounded-full border px-2 py-0.5 text-lone-caption font-medium", c.ativa ? TOM_ANCORA.ok : TOM_ANCORA.neutro)}>{c.ativa ? "Entrando no relatório" : "Pausado"}</span>
              <span className="text-lone-caption text-muted-foreground">
                {c.origem === "automatica" ? "conectado sozinho (cadastro no Âncora)" : `conectado por ${c.criadoPor ?? "—"}`} · última leitura {quando(c.ultimaLeituraEm)}
              </span>
            </div>
            {c.ultimoErro && (
              <p className="flex items-start gap-1.5 rounded-lg border border-lone-warning-border bg-lone-warning-bg p-2.5 text-lone-caption text-lone-warning">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden /> Última leitura falhou: {c.ultimoErro}
              </p>
            )}
            {c.provedor === "kommo" && (
              <p className="text-lone-caption text-muted-foreground">Conta: <span className="font-mono">{c.config.subdominio}</span></p>
            )}
            {c.provedor === "kommo" && pode && <ConfigKommo clientId={clientId} c={c} onSalvo={(n) => setDados((d) => (d ? { ...d, conexao: n } : d))} />}
            {c.provedor === "kommo" && pode && !kommo && (
              <Button size="sm" variant="ghost" onClick={() => setKommo({ subdominio: c.config.subdominio ?? "", token: "" })}><KeyRound /> Trocar token do Kommo</Button>
            )}
            {c.provedor === "kommo" && formKommo}
            {c.provedor === "api_aberta" && (
              <p className="text-lone-caption text-muted-foreground">Token em uso: <span className="font-mono">{c.tokenPrefixo ?? "—"}…</span> · endereço <span className="font-mono">{ENDPOINT}</span></p>
            )}
            {token && <TokenNovo token={token} onFechar={() => setToken(null)} />}
            {previa && <PreviaCrm p={previa} />}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!!ocupado || !c.ativa} onClick={async () => {
                const r = await acao("previa");
                if (r) setPrevia({ relatorio: r.relatorio ?? null, avisos: r.avisos ?? [], indisponivel: !!r.indisponivel });
              }}>{ocupado === "previa" ? <Loader2 className="animate-spin" /> : <Eye />} Ver os últimos 30 dias</Button>
              {pode && (
                <Button size="sm" variant="ghost" disabled={!!ocupado} onClick={() => void acao(c.ativa ? "pausar" : "retomar")}>
                  {c.ativa ? <Pause /> : <Play />} {c.ativa ? "Pausar no relatório" : "Voltar a usar no relatório"}
                </Button>
              )}
              {pode && c.provedor === "api_aberta" && (
                <Button size="sm" variant="ghost" disabled={!!ocupado} onClick={async () => {
                  if (!window.confirm("Gerar um token novo? O token atual para de funcionar na hora — o CRM de lá precisa receber o novo.")) return;
                  const r = await acao("gerar_token");
                  if (r?.token) setToken(r.token);
                }}><KeyRound /> Gerar novo token</Button>
              )}
              {pode && (
                <Button size="sm" variant="ghost" disabled={!!ocupado} onClick={async () => {
                  const aviso = c.provedor === "api_aberta"
                    ? "Desconectar? Os eventos já recebidos deste cliente são apagados e o token para de funcionar."
                    : c.provedor === "ancora" && ancoraCadastrou
                      ? "Desconectar o Âncora? Como o cliente tem cadastro lá, a conexão volta sozinha na próxima detecção. Para tirar do relatório, use Pausar."
                      : "Desconectar? O próximo relatório sai sem Atendimento e vendas.";
                  if (!window.confirm(aviso)) return;
                  if (await acao("desconectar")) { setPrevia(null); toast.success("CRM desconectado."); }
                }}><Unplug /> Desconectar</Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-lone-caption text-muted-foreground">
              Nenhum CRM conectado. Conectado, o relatório semanal e o mensal ganham a folha &quot;Atendimento e vendas&quot; (leads, tempo de resposta,
              vendas, orçamentos, ciclo e funil) e o portal do cliente ganha a mesma aba.
            </p>
            {pode && (
              <div className="flex flex-wrap gap-2">
                {ancoraCadastrou && <Button size="sm" disabled={!!ocupado} onClick={() => void acao("conectar_ancora")}><Anchor /> Conectar o Âncora</Button>}
                <Button size="sm" variant="outline" disabled={!!ocupado} onClick={() => setKommo({ subdominio: "", token: "" })}><Plug /> Conectar Kommo</Button>
                <Button size="sm" variant="outline" disabled={!!ocupado} onClick={async () => {
                  const r = await acao("gerar_token");
                  if (r?.token) setToken(r.token);
                }}><KeyRound /> Outro CRM (API aberta)</Button>
              </div>
            )}
            {formKommo}
            {token && <TokenNovo token={token} onFechar={() => setToken(null)} />}
          </div>
        )}
      </div>
    </div>
  );
}
