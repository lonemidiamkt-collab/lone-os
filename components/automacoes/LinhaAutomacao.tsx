"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown, FlaskConical, Loader2, MessageCircle, Play, Users, TrendingUp, ShieldCheck, Database, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import type { LinhaPainel, Saude } from "@/lib/automacoes/saude";
import type { Destino } from "@/lib/automacoes/registro";
import { cronsDe } from "@/lib/automacoes/registro";
import { dataHora, duracaoCurta, haQuanto, horasHumanas, quandoFuturo } from "@/lib/automacoes/formato";

export const SAUDE_UI: Record<Saude, { rotulo: string; ponto: string; texto: string }> = {
  ok: { rotulo: "Funcionando", ponto: "bg-lone-success", texto: "text-lone-success" },
  falhou: { rotulo: "Falhando", ponto: "bg-lone-danger", texto: "text-lone-danger" },
  parado: { rotulo: "Parado", ponto: "bg-lone-warning", texto: "text-lone-warning" },
  desligado: { rotulo: "Desligado", ponto: "bg-muted-foreground", texto: "text-muted-foreground" },
  "sem-registro": { rotulo: "Sem registro", ponto: "border border-muted-foreground", texto: "text-muted-foreground" },
};

const DESTINO_UI: Record<Destino, { rotulo: string; icone: typeof Users }> = {
  "grupos dos clientes": { rotulo: "Grupos dos clientes", icone: MessageCircle },
  prospects: { rotulo: "Prospects", icone: MessageCircle },
  "grupo do time": { rotulo: "Grupo do time", icone: Users },
  "grupo de tráfego": { rotulo: "Grupo de tráfego", icone: TrendingUp },
  admin: { rotulo: "Admin", icone: ShieldCheck },
  sistema: { rotulo: "Sistema", icone: Database },
};

interface Execucao {
  id: string;
  finished_at: string;
  duration_ms: number | null;
  http_status: number | null;
  ok: boolean | null;
  skipped: boolean | null;
  ensaio: boolean | null;
  resumo: string | null;
}

interface Resultado {
  ensaio: boolean;
  ok: boolean;
  rodando: boolean;
  status?: number;
  duracao_ms?: number;
  resposta?: string;
  mensagem?: string;
}

function Ponto({ saude, className }: { saude: Saude; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-2 w-2 shrink-0 rounded-full", SAUDE_UI[saude].ponto, className)} />;
}

function Interruptor({ ligado, disabled, onClick, rotulo, titulo }: {
  ligado: boolean; disabled?: boolean; onClick: () => void; rotulo: string; titulo?: string;
}) {
  return (
    <button
      type="button" role="switch" aria-checked={ligado} aria-label={rotulo} title={titulo ?? rotulo}
      disabled={disabled} onClick={onClick}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
        ligado ? "border-primary bg-primary" : "border-border bg-muted",
      )}
    >
      <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform", ligado ? "translate-x-[18px]" : "translate-x-[3px]")} />
    </button>
  );
}

/** O corpo da resposta, indentado quando for JSON inteiro (truncado fica cru). */
function corpoLegivel(texto: string): string {
  try { return JSON.stringify(JSON.parse(texto), null, 2); } catch { return texto; }
}

function situacao(l: LinhaPainel, agora: number): string | null {
  switch (l.saude) {
    case "falhou": return "A última execução deu erro.";
    case "parado":
      return l.ultimoSucessoEm
        ? `Sem sucesso ${haQuanto(l.ultimoSucessoEm, agora)} — o esperado era no máximo ${horasHumanas(l.maxSilencioHoras)}.`
        : `Nenhuma execução com sucesso registrada em ${horasHumanas(l.maxSilencioHoras)}.`;
    case "desligado":
      if (l.config.pausadoAte) return `Pausado até ${dataHora(l.config.pausadoAte)}.`;
      return l.config.alteradoPor ? `Desligado por ${l.config.alteradoPor}${l.config.alteradoEm ? ` em ${dataHora(l.config.alteradoEm)}` : ""}.` : "Desligado.";
    case "sem-registro": return "Roda direto pelo crontab do servidor — não registra execução nem liga/desliga por aqui.";
    default: return null;
  }
}

export default function LinhaAutomacao({ linha: l, agora, aberta, onAbrir, onMudou }: {
  linha: LinhaPainel;
  agora: number;
  aberta: boolean;
  /** Sem argumento alterna; `true` só abre (depois de rodar, a linha abre com o resultado). */
  onAbrir: (abrir?: boolean) => void;
  onMudou: () => void;
}) {
  const [acao, setAcao] = useState<"ensaio" | "rodar" | "alternar" | null>(null);
  const [confirmar, setConfirmar] = useState<"rodar" | "desligar" | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [execucoes, setExecucoes] = useState<Execucao[] | null>(null);
  const [erroExec, setErroExec] = useState<string | null>(null);
  const [carregandoExec, setCarregandoExec] = useState(false);

  const destino = DESTINO_UI[l.destino];
  const IconeDestino = destino.icone;
  const texto = situacao(l, agora);

  const carregarExecucoes = async () => {
    setCarregandoExec(true);
    setErroExec(null);
    const r = await chamar<{ execucoes: Execucao[] }>(`/api/system/automacoes?job=${encodeURIComponent(l.id)}`);
    setCarregandoExec(false);
    if (!r.ok) { setErroExec(r.erro); return; }
    setExecucoes(r.data?.execucoes ?? []);
  };

  const abrirOuFechar = () => {
    if (!aberta && execucoes === null) void carregarExecucoes();
    onAbrir();
  };

  const alternar = async (enabled: boolean) => {
    setConfirmar(null);
    setAcao("alternar");
    const r = await chamar("/api/system/automacoes/alternar", { job: l.id, enabled });
    setAcao(null);
    if (!r.ok) { toast.error(r.erro ?? "Não consegui salvar."); return; }
    toast.success(enabled ? `${l.nome}: ligado.` : `${l.nome}: desligado. O próximo horário vai ser pulado.`);
    onMudou();
  };

  const clicarInterruptor = () => {
    if (!l.config.ligado) { void alternar(true); return; }
    // Desligar o que fala com cliente sempre passa pela confirmação na própria linha.
    if (l.enviaParaCliente) { setConfirmar("desligar"); return; }
    void alternar(false);
  };

  const rodar = async (ensaio: boolean, confirmado = false) => {
    setConfirmar(null);
    setAcao(ensaio ? "ensaio" : "rodar");
    const r = await chamar<Resultado>("/api/system/automacoes/rodar", { job: l.id, ensaio, confirmado });
    setAcao(null);
    if (!r.ok || !r.data) { toast.error(r.erro ?? "Não consegui rodar."); return; }
    const res = { ...r.data, ensaio };
    setResultado(res);
    if (res.rodando) toast.message(res.mensagem ?? "Ainda rodando no servidor.");
    else if (res.ok) toast.success(ensaio ? `Ensaio de ${l.nome} concluído.` : `${l.nome} rodou.`);
    else toast.error(`${l.nome} respondeu com erro${res.status ? ` (HTTP ${res.status})` : ""}.`);
    onAbrir(true);
    void carregarExecucoes();
    onMudou();
  };

  const clicarRodar = () => {
    if (l.enviaParaCliente) { setConfirmar("rodar"); return; }
    void rodar(false);
  };

  return (
    <div className={cn("px-4 py-3", aberta && "bg-muted/30")}>
      <div className="grid grid-cols-2 items-start gap-x-4 gap-y-2 sm:grid-cols-3 xl:grid-cols-[minmax(0,1fr)_10rem_9.5rem_6rem_18rem] xl:items-center">
        {/* Automação */}
        <div className="col-span-2 min-w-0 sm:col-span-3 xl:col-span-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Ponto saude={l.saude} />
            <button type="button" onClick={abrirOuFechar} className="text-left text-sm font-medium text-foreground hover:text-primary">
              {l.nome}
            </button>
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-lone-caption",
              l.enviaParaCliente ? "border-lone-info-border bg-lone-info-bg text-lone-info" : "border-border text-muted-foreground",
            )}>
              <IconeDestino size={11} />
              {destino.rotulo}
            </span>
          </div>
          <p className="mt-0.5 text-lone-caption text-muted-foreground xl:line-clamp-1" title={l.descricao}>{l.descricao}</p>
          {texto && (
            <p className={cn("mt-0.5 text-lone-caption", SAUDE_UI[l.saude].texto)}>{texto}</p>
          )}
        </div>

        {/* Agenda */}
        <div className="min-w-0 text-xs">
          <p className="text-lone-eyebrow uppercase text-muted-foreground xl:hidden">Agenda</p>
          <p className="text-foreground">{l.agendaBRT}</p>
          <p className="text-muted-foreground">
            {l.saude === "desligado" ? "não vai rodar" : l.proxima ? `próxima: ${quandoFuturo(l.proxima, new Date(agora))}` : "—"}
          </p>
        </div>

        {/* Última execução */}
        <div className="min-w-0 text-xs">
          <p className="text-lone-eyebrow uppercase text-muted-foreground xl:hidden">Última execução</p>
          {l.ultima ? (
            <>
              <p className="flex items-center gap-1.5 text-foreground">
                <span aria-hidden className={cn("inline-block h-1.5 w-1.5 rounded-full",
                  l.ultima.pulado ? "bg-muted-foreground" : l.ultima.ok ? "bg-lone-success" : "bg-lone-danger")} />
                <span title={dataHora(l.ultima.em)}>{haQuanto(l.ultima.em, agora)}</span>
              </p>
              <p className="text-muted-foreground">
                {l.ultima.pulado ? "pulada (desligado)" : [l.ultima.ok ? "ok" : "erro", l.ultima.status ? `HTTP ${l.ultima.status}` : null, l.ultima.duracaoMs != null ? duracaoCurta(l.ultima.duracaoMs) : null].filter(Boolean).join(" · ")}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">{l.controlavel ? "nenhuma registrada" : "não registra"}</p>
          )}
        </div>

        {/* 7 dias */}
        <div className="text-xs">
          <p className="text-lone-eyebrow uppercase text-muted-foreground xl:hidden">7 dias</p>
          {l.semana.ok + l.semana.erro + l.semana.pulado === 0 ? (
            <p className="text-muted-foreground">—</p>
          ) : (
            <p className="flex flex-wrap gap-x-2">
              <span className="text-lone-success">{l.semana.ok} ok</span>
              {l.semana.erro > 0 && <span className="text-lone-danger">{l.semana.erro} erro{l.semana.erro > 1 ? "s" : ""}</span>}
              {l.semana.pulado > 0 && <span className="text-muted-foreground">{l.semana.pulado} pulada{l.semana.pulado > 1 ? "s" : ""}</span>}
            </p>
          )}
        </div>

        {/* Ações */}
        <div className="col-span-2 flex items-center gap-2 sm:col-span-3 xl:col-span-1">
          <Interruptor
            ligado={l.config.ligado}
            disabled={!l.controlavel || acao !== null}
            onClick={clicarInterruptor}
            rotulo={l.config.ligado ? `Desligar ${l.nome}` : `Ligar ${l.nome}`}
            titulo={!l.controlavel ? "Roda direto pelo crontab do servidor — liga/desliga só editando o crontab" : undefined}
          />
          {l.suportaEnsaio && (
            <Button variant="outline" size="sm" disabled={acao !== null} onClick={() => void rodar(true)} title="Roda sem mandar mensagem (e, na maioria dos jobs, sem gravar)">
              {acao === "ensaio" ? <Loader2 className="animate-spin" /> : <FlaskConical />}
              Ensaio
            </Button>
          )}
          {l.endpoint && (
            <Button variant="secondary" size="sm" disabled={acao !== null} onClick={clicarRodar}>
              {acao === "rodar" ? <Loader2 className="animate-spin" /> : <Play />}
              {acao === "rodar" ? "Rodando…" : "Rodar agora"}
            </Button>
          )}
          <button
            type="button" onClick={abrirOuFechar} aria-expanded={aberta} aria-label={aberta ? "Fechar detalhes" : "Ver histórico e detalhes"}
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronDown size={16} className={cn("transition-transform", aberta && "rotate-180")} />
          </button>
        </div>
      </div>

      {/* Confirmações na própria linha — nada que fala com cliente sai num clique só. */}
      {confirmar && (
        <div role="alert" className="mt-3 flex flex-col gap-3 rounded-lg border border-lone-warning-border bg-lone-warning-bg p-3 sm:flex-row sm:items-center">
          <AlertTriangle size={16} className="shrink-0 text-lone-warning" />
          <p className="flex-1 text-xs text-foreground">
            {confirmar === "rodar"
              ? <>Isto manda mensagem <strong>de verdade</strong> para {l.destino === "prospects" ? "os prospects" : "os grupos dos clientes"}, fora do horário normal.{l.suportaEnsaio ? " Se quer só conferir o conteúdo, use o Ensaio." : ""}</>
              : <>Desligar <strong>{l.nome}</strong>? {l.destino === "prospects" ? "Os prospects" : "Os clientes"} deixam de receber até alguém religar aqui.</>}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmar(null)}>Cancelar</Button>
            {confirmar === "rodar"
              ? <Button size="sm" onClick={() => void rodar(false, true)}>Sim, rodar agora</Button>
              : <Button variant="destructive" size="sm" onClick={() => void alternar(false)}>Desligar</Button>}
          </div>
        </div>
      )}

      {aberta && (
        <div className="mt-3 space-y-3">
          {resultado && (
            <div className="rounded-lg border border-border bg-card p-3">
              <p className={cn("text-xs font-medium", resultado.rodando ? "text-muted-foreground" : resultado.ok ? "text-lone-success" : "text-lone-danger")}>
                {resultado.ensaio ? "Ensaio" : "Execução manual"}
                {resultado.rodando
                  ? " · ainda rodando no servidor (o resultado entra no histórico ao terminar)"
                  : ` · ${resultado.ok ? "ok" : "erro"}${resultado.status ? ` · HTTP ${resultado.status}` : ""}${resultado.duracao_ms != null ? ` · ${duracaoCurta(resultado.duracao_ms)}` : ""}`}
              </p>
              {resultado.resposta && (
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                  {corpoLegivel(resultado.resposta)}
                </pre>
              )}
            </div>
          )}

          <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Crontab (UTC)</dt>
              <dd className="font-mono text-foreground">{cronsDe(l).join("  ·  ")}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">O que o servidor chama</dt>
              <dd className="truncate font-mono text-foreground" title={l.endpoint ? `/api/system/${l.endpoint}` : l.comando}>
                {l.endpoint ? `${l.metodo ?? "POST"} /api/system/${l.endpoint}` : l.comando}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Vira &quot;parado&quot; depois de</dt>
              <dd className="text-foreground">{horasHumanas(l.maxSilencioHoras)} sem sucesso</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ensaio</dt>
              <dd className="text-foreground">{l.ensaio ? <span className="font-mono">?{l.ensaio}</span> : "esta rota não tem modo de teste"}</dd>
            </div>
          </dl>

          <div>
            <p className="mb-1.5 text-lone-eyebrow uppercase text-muted-foreground">Últimas 10 execuções</p>
            {carregandoExec && execucoes === null ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" /> Carregando…</p>
            ) : erroExec ? (
              <p className="text-xs text-lone-danger">
                {erroExec} <button type="button" className="underline" onClick={() => void carregarExecucoes()}>Tentar de novo</button>
              </p>
            ) : !execucoes?.length ? (
              <p className="text-xs text-muted-foreground">
                {l.controlavel ? "Nenhuma execução registrada ainda." : "Este job roda direto pelo crontab e não registra execuções."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Quando</th>
                      <th className="px-3 py-1.5 font-medium">Tipo</th>
                      <th className="px-3 py-1.5 font-medium">Resultado</th>
                      <th className="px-3 py-1.5 font-medium">Duração</th>
                      <th className="px-3 py-1.5 font-medium">Resumo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {execucoes.map((e) => {
                      const tipo = e.skipped ? "pulada" : e.ensaio ? "ensaio" : e.resumo?.startsWith("[manual") ? "manual" : "cron";
                      return (
                        <tr key={e.id} className="align-top">
                          <td className="whitespace-nowrap px-3 py-1.5 text-foreground">{dataHora(e.finished_at)}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{tipo}</td>
                          <td className="whitespace-nowrap px-3 py-1.5">
                            {e.skipped ? <span className="text-muted-foreground">—</span>
                              : <span className={e.ok ? "text-lone-success" : "text-lone-danger"}>{e.ok ? "ok" : "erro"}{e.http_status ? ` · ${e.http_status}` : ""}</span>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{duracaoCurta(e.duration_ms)}</td>
                          <td className="max-w-[28rem] px-3 py-1.5">
                            <span className="line-clamp-2 break-all font-mono text-[11px] text-muted-foreground" title={e.resumo ?? ""}>{e.resumo || "—"}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
