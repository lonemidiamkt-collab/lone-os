"use client";

// components/client/ficha/PortalDoCliente.tsx — o botão "Portal" do topo da ficha e o painel dele.
//
// Tudo do portal do cliente mora aqui, num lugar só (antes era um card no fim da aba Resultados):
// o estado do link, abrir, copiar, mandar ao cliente (rascunho no WhatsApp — nada sai sozinho),
// gerar, trocar e desativar (só admin; as rotas conferem), o que o cliente vai ver ao abrir, quando os
// números foram montados e os ajustes (telefone do time e boas-vindas).
//
// O link nasce sozinho quando o cliente vira cliente (lib/portal/link-automatico.ts); aqui é onde o
// time o usa.

import { useCallback, useEffect, useState } from "react";
import {
  Ban, Check, ChevronDown, CircleAlert, Copy, ExternalLink, Globe, Link2, Loader2, MessageCircle, RotateCcw, Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import {
  estadoDoPortal, mensagemParaCliente, numeroWhatsapp, rascunhoWhatsapp, urlDoPortal, type EstadoPortal,
} from "@/lib/portal/link";
import { estaPausado } from "@/lib/clients/pausa";
import type { Client } from "@/lib/types";

interface Prontidao {
  pronto: boolean;
  status: string;
  socialOnly?: boolean;
  snapshotEm?: string | null;
  itens: { chave: string; ok: boolean; texto: string }[];
}
interface Acessos { total_accesses: number; last_accessed_at: string | null }

const ROTULO_ESTADO: Record<EstadoPortal, string> = { ativo: "Ativo", desativado: "Desativado", sem_link: "Sem link" };
const PONTO_ESTADO: Record<EstadoPortal, string> = {
  ativo: "bg-lone-success",
  desativado: "bg-lone-danger",
  sem_link: "bg-muted-foreground/50",
};
const SELO_ESTADO: Record<EstadoPortal, string> = {
  ativo: "border-lone-success-border bg-lone-success-bg text-lone-success",
  desativado: "border-lone-danger-border bg-lone-danger-bg text-lone-danger",
  sem_link: "border-border bg-muted text-muted-foreground",
};

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
}).replace(",", " às");
const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

const botao = "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm transition-colors disabled:opacity-50";
const botaoSutil = cn(botao, "border border-border bg-card text-foreground hover:bg-accent");
const botaoPrimario = cn(botao, "bg-primary font-medium text-primary-foreground hover:opacity-90");

/** O botão do topo, com o ponto de estado (só depois que o link chegou — antes ele diria "sem link"). */
export function BotaoPortal({ client, carregado, onClick }: { client: Client; carregado: boolean; onClick: () => void }) {
  const estado = estadoDoPortal(client);
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog"
      aria-label={carregado ? `Portal do cliente — ${ROTULO_ESTADO[estado].toLowerCase()}` : "Portal do cliente"}
      title="Portal do cliente: link, envio e o que ele vê"
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-accent">
      <Globe size={15} aria-hidden="true" /> Portal
      {carregado && <span className={cn("ml-0.5 h-2 w-2 rounded-full", PONTO_ESTADO[estado])} aria-hidden="true" />}
    </button>
  );
}

export default function PainelPortal({ client: c, aberto, aoFechar, podeGerir, dados, onMudou }: {
  client: Client;
  aberto: boolean;
  aoFechar: () => void;
  /** Gestão: gera, troca, desativa e ajusta. As rotas exigem admin e respondem "sem permissão" se não for. */
  podeGerir: boolean;
  /** Os campos sensíveis (o token) de /api/clients/[id]: ainda chegando, ok, ou falhou. */
  dados: "carregando" | "ok" | "erro";
  onMudou: (patch: Partial<Client>) => void;
}) {
  const carregado = dados === "ok";
  const estado = estadoDoPortal(c);
  const token = c.publicReportToken ?? null;
  const url = token && estado === "ativo" ? urlDoPortal(token) : null;
  const bloqueio = c.active === false || c.churnedAt
    ? "Cliente arquivado: o link não abre enquanto ele estiver fora da carteira."
    : estaPausado({ paused_at: c.pausedAt, paused_until: c.pausedUntil })
      ? "Cliente pausado: o link não abre até a retomada."
      : null;

  const [prontidao, setProntidao] = useState<Prontidao | null>(null);
  const [acessos, setAcessos] = useState<Acessos | null>(null);
  const [ocupado, setOcupado] = useState<null | "gerar" | "trocar" | "desativar" | "ajustes">(null);
  const [confirmar, setConfirmar] = useState<null | "trocar" | "desativar">(null);
  const [copiado, setCopiado] = useState(false);
  const [ajustesAbertos, setAjustesAbertos] = useState(false);
  const [telefoneTime, setTelefoneTime] = useState(c.whatsappTeamPhone ?? "");
  const [boasVindas, setBoasVindas] = useState(c.portalWelcomeMessage ?? "");

  // Ao abrir: o que o cliente vai ver (e quando os números foram montados) e os acessos.
  const carregar = useCallback(() => {
    let vivo = true;
    setProntidao(null);
    setAcessos(null);
    chamar<Prontidao>(`/api/clients/${c.id}/portal-prontidao`).then((r) => { if (vivo && r.ok && r.data) setProntidao(r.data); });
    chamar<Acessos>(`/api/clients/${c.id}/portal/stats`).then((r) => { if (vivo && r.ok && r.data) setAcessos(r.data); });
    return () => { vivo = false; };
  }, [c.id]);
  useEffect(() => {
    if (!aberto || estado !== "ativo") return;
    return carregar();
  }, [aberto, estado, token, carregar]);

  useEffect(() => {
    if (!aberto) { setConfirmar(null); setCopiado(false); return; }
    setTelefoneTime(c.whatsappTeamPhone ?? "");
    setBoasVindas(c.portalWelcomeMessage ?? "");
  }, [aberto, c.whatsappTeamPhone, c.portalWelcomeMessage]);

  async function novoLink(acao: "gerar" | "trocar") {
    setOcupado(acao);
    const r = await chamar<{ token?: string }>(`/api/clients/${c.id}/portal/${acao === "gerar" ? "generate-token" : "rotate"}`, {});
    setOcupado(null);
    setConfirmar(null);
    if (!r.ok || !r.data?.token) { toast.error(r.erro ?? "Não consegui gerar o link."); return; }
    onMudou({
      publicReportToken: r.data.token,
      publicReportTokenCreatedAt: new Date().toISOString(),
      publicReportTokenRevokedAt: undefined,
      publicReportEnabled: true,
    });
    toast.success(acao === "gerar" ? "Link do portal gerado." : "Link trocado. O endereço antigo não abre mais.");
  }

  async function desativar() {
    setOcupado("desativar");
    const r = await chamar(`/api/clients/${c.id}/portal/revoke`, {});
    setOcupado(null);
    setConfirmar(null);
    if (!r.ok) { toast.error(r.erro ?? "Não consegui desativar."); return; }
    onMudou({ publicReportTokenRevokedAt: new Date().toISOString(), publicReportEnabled: false });
    toast.success("Portal desativado. O link não abre mais.");
  }

  async function salvarAjustes() {
    setOcupado("ajustes");
    const r = await chamar(`/api/clients/${c.id}/portal/settings`,
      { whatsapp_team_phone: telefoneTime, portal_welcome_message: boasVindas }, { method: "PATCH" });
    setOcupado(null);
    if (!r.ok) { toast.error(r.erro ?? "Não consegui salvar os ajustes."); return; }
    onMudou({ whatsappTeamPhone: telefoneTime.trim() || undefined, portalWelcomeMessage: boasVindas.trim() || undefined });
    toast.success("Ajustes do portal salvos.");
  }

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não consegui copiar. Selecione o link e copie à mão.");
    }
  }

  // Rascunho no WhatsApp do contato do cliente: abre a conversa com o texto pronto; quem clicou envia.
  const telefoneCliente = c.phone || c.contactPhone || null;
  const numero = numeroWhatsapp(telefoneCliente);
  function enviar() {
    if (!url) return;
    if (prontidao && !prontidao.pronto
      && !window.confirm("O portal deste cliente ainda vai abrir quase vazio (sem anúncios, sem Instagram e sem artes). Abrir a mensagem mesmo assim?")) return;
    const texto = mensagemParaCliente({ url, contato: c.contactName, boasVindas: c.portalWelcomeMessage });
    window.open(rascunhoWhatsapp(numero, texto), "_blank", "noopener,noreferrer");
  }

  const ajustesMudaram = telefoneTime !== (c.whatsappTeamPhone ?? "") || boasVindas !== (c.portalWelcomeMessage ?? "");
  const campo = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring";

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md gap-0 overflow-y-auto rounded-xl p-0">
        <div className="space-y-1.5 border-b border-border p-5 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-lone-h2 tracking-tight text-foreground">Portal do cliente</DialogTitle>
            {carregado && (
              <span className={cn("rounded-full border px-2 py-0.5 text-lone-caption font-medium", SELO_ESTADO[estado])}>
                {ROTULO_ESTADO[estado]}
              </span>
            )}
          </div>
          <DialogDescription className="text-lone-caption text-muted-foreground">
            A página de resultados que o cliente abre pelo link, sem login.
          </DialogDescription>
        </div>

        <div className="space-y-5 p-5">
          {bloqueio && (
            <p className="flex items-start gap-2 rounded-lg border border-lone-warning-border bg-lone-warning-bg px-3 py-2 text-lone-caption text-lone-warning">
              <CircleAlert size={14} className="mt-px shrink-0" aria-hidden="true" /> {bloqueio}
            </p>
          )}

          {dados === "carregando" ? (
            <p className="flex items-center gap-2 text-lone-body text-muted-foreground" role="status">
              <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Carregando o link…
            </p>
          ) : dados === "erro" ? (
            <p className="text-lone-body text-muted-foreground" role="alert">
              Não consegui carregar o link deste cliente agora. Recarregue a página para tentar de novo.
            </p>
          ) : estado === "sem_link" ? (
            <div className="space-y-3">
              <p className="text-lone-body text-muted-foreground">
                Este cliente ainda não tem link. Cliente novo ganha o link sozinho ao entrar na carteira — este ficou de fora.
              </p>
              {podeGerir ? (
                <button type="button" onClick={() => novoLink("gerar")} disabled={!!ocupado} className={botaoPrimario}>
                  {ocupado === "gerar" ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />}
                  Gerar link
                </button>
              ) : (
                <p className="text-lone-caption text-muted-foreground">Peça à gestão para gerar o link.</p>
              )}
            </div>
          ) : estado === "desativado" ? (
            <div className="space-y-3">
              <p className="text-lone-body text-muted-foreground">
                Portal desativado{c.publicReportTokenRevokedAt ? ` em ${data(c.publicReportTokenRevokedAt)}` : ""}. O link antigo não abre mais.
              </p>
              {podeGerir && (
                <button type="button" onClick={() => novoLink("gerar")} disabled={!!ocupado} className={botaoPrimario}>
                  {ocupado === "gerar" ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />}
                  Reativar com um link novo
                </button>
              )}
            </div>
          ) : url && (
            <>
              {/* O link e as três ações do dia a dia. */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <label htmlFor={`portal-link-${c.id}`} className="sr-only">Link do portal</label>
                  <input id={`portal-link-${c.id}`} readOnly value={url} onFocus={(e) => e.currentTarget.select()}
                    className="h-9 min-w-0 flex-1 truncate rounded-lg border border-input bg-muted px-3 font-mono text-xs text-muted-foreground outline-none focus:ring-1 focus:ring-ring" />
                  <button type="button" onClick={copiar} className={cn(botaoSutil, "shrink-0 px-2.5")} aria-label="Copiar link">
                    {copiado ? <Check size={15} className="text-lone-success" aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                    <span className="hidden sm:inline">{copiado ? "Copiado" : "Copiar"}</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <a href={url} target="_blank" rel="noopener noreferrer" className={botaoSutil}>
                    <ExternalLink size={15} aria-hidden="true" /> Abrir
                  </a>
                  <button type="button" onClick={enviar} className={botaoPrimario}>
                    <MessageCircle size={15} aria-hidden="true" /> Enviar ao cliente
                  </button>
                </div>
                <p className="text-lone-caption text-muted-foreground">
                  {numero
                    ? <>O WhatsApp abre na conversa com {c.contactName ? `${c.contactName} (${telefoneCliente})` : telefoneCliente}, com a mensagem pronta. Você revisa e envia.</>
                    : <>Sem WhatsApp do contato no cadastro: o WhatsApp abre para você escolher a conversa, com a mensagem pronta.</>}
                </p>
              </div>

              {/* O que o cliente vê ao abrir — antes de mandar (JP Barbearia abriu vazio em 15/09). */}
              <section aria-labelledby="portal-prontidao" className="space-y-2 border-t border-border pt-4">
                <h3 id="portal-prontidao" className="text-lone-eyebrow uppercase text-muted-foreground">O que o cliente vê ao abrir</h3>
                {!prontidao ? (
                  <p className="flex items-center gap-2 text-lone-caption text-muted-foreground"><Loader2 size={13} className="animate-spin" aria-hidden="true" /> Conferindo…</p>
                ) : (
                  <>
                    {!prontidao.pronto && (
                      <p className="text-lone-caption font-medium text-lone-warning">O portal ainda abre quase vazio — melhor esperar para mandar.</p>
                    )}
                    <ul className="space-y-1">
                      {prontidao.itens.map((i) => (
                        <li key={i.chave} className="flex items-start gap-2 text-lone-caption text-muted-foreground">
                          {i.ok
                            ? <Check size={13} className="mt-px shrink-0 text-lone-success" aria-hidden="true" />
                            : <CircleAlert size={13} className="mt-px shrink-0 text-lone-warning" aria-hidden="true" />}
                          <span><span className="sr-only">{i.ok ? "Pronto: " : "Falta: "}</span>{i.texto}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              <dl className="grid gap-x-4 gap-y-2 border-t border-border pt-4 text-lone-caption sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Números atualizados</dt>
                  <dd className="text-foreground">
                    {!prontidao ? "…" : prontidao.socialOnly ? "Pacote sem anúncios"
                      : prontidao.snapshotEm ? dataHora(prontidao.snapshotEm) : "Ainda não montados"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Acessos do cliente</dt>
                  <dd className="text-foreground">
                    {!acessos ? "…" : acessos.total_accesses === 0 ? "Nenhum ainda"
                      : `${acessos.total_accesses.toLocaleString("pt-BR")} · último em ${acessos.last_accessed_at ? dataHora(acessos.last_accessed_at) : "—"}`}
                  </dd>
                </div>
                {c.publicReportTokenCreatedAt && (
                  <div>
                    <dt className="text-muted-foreground">Link criado em</dt>
                    <dd className="text-foreground">{data(c.publicReportTokenCreatedAt)}</dd>
                  </div>
                )}
              </dl>

              {podeGerir && (
                <div className="space-y-2 border-t border-border pt-4">
                  {confirmar ? (
                    <div className="space-y-2 rounded-lg border border-border bg-muted p-3">
                      <p className="text-lone-caption text-foreground">
                        {confirmar === "trocar"
                          ? "O link atual para de abrir na hora e nasce um novo — quem tem o antigo precisa receber o novo."
                          : "O portal fica fora do ar para o cliente até alguém gerar um link novo."}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={!!ocupado}
                          onClick={() => (confirmar === "trocar" ? novoLink("trocar") : desativar())}
                          className={cn(botao, "h-8 text-xs font-medium", confirmar === "trocar"
                            ? "bg-primary text-primary-foreground hover:opacity-90"
                            : "border border-lone-danger-border bg-lone-danger-bg text-lone-danger hover:opacity-90")}>
                          {ocupado && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
                          {confirmar === "trocar" ? "Trocar o link" : "Desativar o portal"}
                        </button>
                        <button type="button" onClick={() => setConfirmar(null)} disabled={!!ocupado}
                          className={cn(botao, "h-8 text-xs text-muted-foreground hover:text-foreground")}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setConfirmar("trocar")} className={cn(botaoSutil, "h-8 text-xs")}>
                        <RotateCcw size={13} aria-hidden="true" /> Trocar link
                      </button>
                      <button type="button" onClick={() => setConfirmar("desativar")}
                        className={cn(botao, "h-8 border border-border bg-card text-xs text-lone-danger hover:bg-lone-danger-bg")}>
                        <Ban size={13} aria-hidden="true" /> Desativar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Ajustes: o número do time no botão "Falar com a equipe" e a mensagem de boas-vindas. */}
          {podeGerir && carregado && estado !== "sem_link" && (
            <div className="border-t border-border pt-4">
              <button type="button" onClick={() => setAjustesAbertos((v) => !v)} aria-expanded={ajustesAbertos}
                className="flex w-full items-center justify-between gap-2 text-left text-lone-caption font-medium text-muted-foreground hover:text-foreground">
                <span className="inline-flex items-center gap-1.5"><Settings2 size={13} aria-hidden="true" /> Ajustes do portal</span>
                <ChevronDown size={14} className={cn("transition-transform", ajustesAbertos && "rotate-180")} aria-hidden="true" />
              </button>
              {ajustesAbertos && (
                <div className="mt-3 space-y-3">
                  <div className="space-y-1">
                    <label htmlFor={`portal-tel-${c.id}`} className="text-lone-caption text-muted-foreground">WhatsApp do time (botão “Falar com a equipe”)</label>
                    <input id={`portal-tel-${c.id}`} type="tel" inputMode="tel" placeholder="5522999999999" value={telefoneTime}
                      onChange={(e) => setTelefoneTime(e.target.value)} className={campo} />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={`portal-bv-${c.id}`} className="flex items-center justify-between text-lone-caption text-muted-foreground">
                      <span>Mensagem de boas-vindas</span>
                      <span className={cn("tabular-nums", boasVindas.length > 250 && "text-lone-warning")}>{boasVindas.length}/280</span>
                    </label>
                    <textarea id={`portal-bv-${c.id}`} rows={3} maxLength={280} value={boasVindas} onChange={(e) => setBoasVindas(e.target.value)}
                      placeholder="Aparece no topo do portal e abre a mensagem de envio do link."
                      className={cn(campo, "resize-none")} />
                  </div>
                  <button type="button" onClick={salvarAjustes} disabled={!ajustesMudaram || !!ocupado} className={cn(botaoPrimario, "h-8 text-xs")}>
                    {ocupado === "ajustes" && <Loader2 size={13} className="animate-spin" aria-hidden="true" />} Salvar ajustes
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
