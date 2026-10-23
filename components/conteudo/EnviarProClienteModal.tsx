"use client";

// components/conteudo/EnviarProClienteModal.tsx — "Enviar pro cliente" com PRÉVIA (21/10/2026,
// auditoria de erro recuperável, 2.2).
//
// Antes era um window.confirm com o nome do cliente: ninguém via quais artes iam, o texto nem o
// grupo; clicar de novo duplicava no grupo do cliente; e se a rota caía no meio a tela dizia "não
// deu" com parte já enviada. Agora a tela mostra exatamente o que o servidor vai mandar (miniaturas,
// texto, grupo, o que fica de fora), avisa se já foi enviado e só repete com escolha explícita. A
// resposta diz o que saiu arte a arte; se a resposta não chega, a tela relê o registro do envio em
// vez de chutar "falhou". Regra em lib/cs/envio-aprovacao.ts; servidor em /api/cs/enviar-aprovacao.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, Loader, RefreshCw, Send, Users, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import SignedImage from "@/components/shared/SignedImage";
import { chamar } from "@/lib/api/chamar";
import { trilha } from "@/lib/obs/trilha";
import { useContentStore, marcarMutacao } from "@/stores/useContentStore";
import type { ArteDoEnvio, ModoEnvio, ResultadoArte, SituacaoEnvio, StatusEnvio } from "@/lib/cs/envio-aprovacao";
import type { ContentCard } from "@/lib/types";

interface RegistroDeEnvio {
  id: string;
  tentativa: number;
  situacao: SituacaoEnvio;
  enviadas: number;
  total: number;
  quando: string;
  por: string | null;
  resultado: ResultadoArte[];
  resumo: string | null;
}

interface OpcaoDeEnvio { modo: ModoEnvio; artes: ArteDoEnvio[]; texto: string | null; previa: string }

interface Previa {
  cliente: string;
  grupo: { nome: string; jid: string } | null;
  bloqueio: string | null;
  artes: ArteDoEnvio[];
  texto: string;
  fora: string[];
  envios: RegistroDeEnvio[];
  outroConjunto: RegistroDeEnvio | null;
  opcoes: OpcaoDeEnvio[];
}

interface RespostaDoEnvio {
  ok: boolean;
  status: StatusEnvio;
  enviadas: number;
  total: number;
  resumo: string;
  resultado: ResultadoArte[];
  aviso: string | null;
  card: { status: string; social_confirmed_at: string | null } | null;
}

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
}).replace(",", " às");

const ROTULO_OPCAO: Record<ModoEnvio, string> = {
  primeiro: "Enviar ao grupo",
  faltantes: "Mandar só as que faltaram",
  todas: "Reenviar todas",
};

export default function EnviarProClienteModal({ card, onClose }: { card: ContentCard; onClose: () => void }) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [modo, setModo] = useState<ModoEnvio | null>(null);
  const [confirmaReenvio, setConfirmaReenvio] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resposta, setResposta] = useState<RespostaDoEnvio | null>(null);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroPrevia(null);
    const r = await chamar<Previa>(`/api/cs/enviar-aprovacao?cardId=${encodeURIComponent(card.id)}`);
    setCarregando(false);
    if (!r.ok || !r.data) { setErroPrevia(r.erro ?? "Não consegui montar a prévia."); return; }
    setPrevia(r.data);
    // Primeiro envio já vem escolhido; reenvio exige escolher a opção (e confirmar).
    setModo(r.data.opcoes.length === 1 && r.data.opcoes[0].modo === "primeiro" ? "primeiro" : null);
    setConfirmaReenvio(false);
  }, [card.id]);

  useEffect(() => { void carregar(); }, [carregar]);

  const opcao = previa?.opcoes.find((o) => o.modo === modo) ?? null;
  const ultimo = previa?.envios[0] ?? null;
  const emAndamento = !!ultimo && ultimo.situacao === "enviando";
  // Reenvio que pode repetir algo no grupo do cliente pede um "entendi" explícito (inclusive envio
  // interrompido no meio, que pode ter mandado antes de gravar o progresso).
  const podeRepetir = modo === "todas" && !!previa?.envios.some((e) => e.situacao === "interrompido" || e.resultado.some((x) => x.ok || x.incerto));
  const pronto = !!opcao && !enviando && (!podeRepetir || confirmaReenvio);
  // Bloqueado (arte não entregue, alteração pedida, sem grupo): não mostra artes como se fossem sair.
  const artesMostradas = previa?.bloqueio ? [] : opcao?.artes ?? previa?.artes ?? [];
  const textoMostrado = opcao ? opcao.texto : previa?.texto ?? null;

  const enviar = async () => {
    if (!opcao || !pronto) return;
    setEnviando(true);
    setErroEnvio(null);
    trilha("enviar-cliente:clique", { card: card.id, modo: opcao.modo, artes: opcao.artes.length });
    const r = await chamar<RespostaDoEnvio>("/api/cs/enviar-aprovacao", { cardId: card.id, modo: opcao.modo, previa: opcao.previa });
    setEnviando(false);
    if (r.ok && r.data) {
      setResposta(r.data);
      trilha("enviar-cliente:fim", { card: card.id, status: r.data.status, enviadas: r.data.enviadas, total: r.data.total });
      if (r.data.card) {
        const c = r.data.card;
        marcarMutacao();
        useContentStore.setState((s) => ({
          contentCards: s.contentCards.map((x) => x.id === card.id
            ? { ...x, status: c.status as ContentCard["status"], socialConfirmedAt: c.social_confirmed_at ?? x.socialConfirmedAt, statusChangedAt: new Date().toISOString() }
            : x),
        }));
      }
    } else {
      // Sem resposta (rede, painel reiniciando) NÃO é "não saiu": o servidor pode ter mandado tudo
      // ou parte. A verdade está no registro do envio — relê e mostra.
      const semResposta = r.status === 0 || r.status === 502 || r.status === 503 || r.status === 504;
      setErroEnvio(semResposta
        ? `${r.erro} Não recebi a confirmação: as artes podem ter saído, todas ou em parte. Veja abaixo a situação registrada antes de tentar de novo.`
        : r.erro ?? "Não consegui enviar.");
      trilha("enviar-cliente:erro", { card: card.id, status: r.status });
    }
    await carregar();
  };

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto && !enviando) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        <div className="p-5 pr-12 border-b border-border">
          <DialogTitle className="text-lone-h2 text-foreground flex items-center gap-2">
            <Send size={15} className="text-lone-success" aria-hidden="true" /> Enviar pro cliente
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1 truncate">{card.title} · {card.clientName}</DialogDescription>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Resultado do envio: exatamente o que saiu. */}
          {resposta && (
            <div className={`rounded-lg border p-3 text-xs space-y-1.5 ${
              resposta.status === "enviado" ? "border-lone-success-border bg-lone-success-bg text-lone-success"
                : "border-lone-warning-border bg-lone-warning-bg text-lone-warning"}`} role="status">
              <p className="font-semibold flex items-center gap-1.5">
                {resposta.status === "enviado" ? <CheckCircle size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
                {resposta.status === "enviado" ? "Enviado" : resposta.status === "parcial" ? "Enviado em parte" : "Não confirmado"}
              </p>
              <p className="text-foreground leading-relaxed">{resposta.resumo}</p>
              {resposta.aviso && <p className="text-foreground leading-relaxed">{resposta.aviso}</p>}
            </div>
          )}
          {erroPrevia && previa && (
            <p className="text-[11px] text-destructive">
              Não consegui atualizar a situação do envio: {erroPrevia}{" "}
              <button type="button" onClick={() => void carregar()} className="underline">Tentar de novo</button>
            </p>
          )}
          {erroEnvio && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex gap-2" role="alert">
              <XCircle size={13} className="shrink-0 mt-0.5" aria-hidden="true" /><span>{erroEnvio}</span>
            </div>
          )}

          {carregando && !previa ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader size={14} className="animate-spin" aria-hidden="true" /> Montando a prévia…
            </div>
          ) : erroPrevia && !previa ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive space-y-2">
              <p>Não consegui montar a prévia: {erroPrevia}</p>
              <button type="button" onClick={() => void carregar()} className="underline">Tentar de novo</button>
            </div>
          ) : previa ? (
            <>
              {previa.bloqueio && (
                <div className="rounded-lg border border-lone-warning-border bg-lone-warning-bg p-3 text-xs text-foreground flex gap-2">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5 text-lone-warning" aria-hidden="true" />
                  <span>{previa.bloqueio}</span>
                </div>
              )}

              {/* Para onde vai */}
              <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs">
                <Users size={13} className="shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-muted-foreground">Vai para o grupo do WhatsApp</p>
                  <p className="font-medium text-foreground truncate">{previa.grupo?.nome ?? "— sem grupo mapeado —"}</p>
                  <p className="text-[11px] text-muted-foreground">Cliente: {previa.cliente} · sai pelo número do CS</p>
                </div>
              </div>

              {/* As artes, como vão */}
              {artesMostradas.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-lone-eyebrow uppercase text-muted-foreground">
                    {artesMostradas.length === 1 ? "A arte que vai" : `As ${artesMostradas.length} artes que vão, nesta ordem`}
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {artesMostradas.map((a, i) => (
                      <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer" title="Abrir a arte"
                        className="relative block aspect-[4/5] rounded-lg overflow-hidden border border-border bg-muted hover:border-primary/40">
                        <SignedImage src={a.url} alt={`Arte ${i + 1}`} className="w-full h-full object-cover" />
                        <span className="absolute top-1 left-1 text-[10px] px-1.5 rounded bg-overlay text-overlay-foreground tabular-nums">{i + 1}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* O texto exato */}
              {artesMostradas.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-lone-eyebrow uppercase text-muted-foreground">Texto</p>
                  {textoMostrado ? (
                    <blockquote className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground leading-relaxed">{textoMostrado}</blockquote>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sem texto: ele já foi com uma arte do envio anterior.</p>
                  )}
                  {textoMostrado && <p className="text-[11px] text-muted-foreground">Vai como legenda da primeira arte. Sem arte, o texto não sai.</p>}
                </div>
              )}

              {!previa.bloqueio && previa.fora.length > 0 && (
                <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                  {previa.fora.map((f) => <li key={f}>{f}</li>)}
                </ul>
              )}

              {previa.outroConjunto && (
                <p className="text-[11px] text-muted-foreground">
                  Outro conjunto de artes deste card (ex.: a versão anterior) foi enviado em {quando(previa.outroConjunto.quando)}
                  {previa.outroConjunto.por ? ` por ${previa.outroConjunto.por}` : ""} ({previa.outroConjunto.enviadas} de {previa.outroConjunto.total}).
                </p>
              )}

              {/* Já foi enviado? */}
              {ultimo && (
                <div className="rounded-lg border border-lone-warning-border bg-lone-warning-bg p-3 text-xs space-y-1.5">
                  <p className="font-semibold text-lone-warning flex items-center gap-1.5">
                    <AlertTriangle size={13} aria-hidden="true" />
                    {emAndamento ? "Estas artes estão sendo enviadas agora" : "Estas artes já foram enviadas"}
                  </p>
                  <ul className="space-y-1 text-foreground">
                    {previa.envios.slice(0, 3).map((e) => (
                      <li key={e.id}>
                        {quando(e.quando)}{e.por ? ` · ${e.por}` : ""} — {e.situacao === "enviando" ? "em andamento…"
                          : e.situacao === "interrompido" ? `interrompido no meio (${e.enviadas} de ${e.total} confirmadas) — confira no grupo`
                          : e.resumo ?? `${e.enviadas} de ${e.total}`}
                      </li>
                    ))}
                  </ul>
                  {emAndamento && (
                    <button type="button" onClick={() => void carregar()} disabled={carregando}
                      className="inline-flex items-center gap-1 text-[11px] underline disabled:opacity-50">
                      <RefreshCw size={11} aria-hidden="true" /> Atualizar
                    </button>
                  )}
                </div>
              )}

              {/* Reenvio: escolha explícita */}
              {!previa.bloqueio && previa.opcoes.some((o) => o.modo !== "primeiro") && (
                <fieldset className="space-y-1.5">
                  <legend className="text-lone-eyebrow uppercase text-muted-foreground mb-1">Mandar de novo?</legend>
                  {previa.opcoes.map((o) => (
                    <label key={o.modo} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer ${modo === o.modo ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                      <input type="radio" name="modo-envio" checked={modo === o.modo} onChange={() => { setModo(o.modo); setConfirmaReenvio(false); }} className="mt-0.5 accent-primary" />
                      <span>
                        <span className="font-medium text-foreground">{ROTULO_OPCAO[o.modo]} ({o.artes.length})</span>
                        <span className="block text-muted-foreground">
                          {o.modo === "faltantes"
                            ? `Só as que não chegaram${o.texto ? ", com o texto" : ", sem repetir o texto"}. Se uma arte ficou "incerta" e não está no grupo, use "Reenviar todas".`
                            : "O grupo recebe todas de novo, com o texto."}
                        </span>
                      </span>
                    </label>
                  ))}
                  {podeRepetir && (
                    <label className="flex items-start gap-2 pt-1 text-xs text-foreground cursor-pointer">
                      <input type="checkbox" checked={confirmaReenvio} onChange={(e) => setConfirmaReenvio(e.target.checked)} className="mt-0.5 w-4 h-4 accent-primary" />
                      <span>Entendi: o grupo do cliente vai receber de novo artes que já chegaram.</span>
                    </label>
                  )}
                </fieldset>
              )}
            </>
          ) : null}
        </div>

        <div className="p-5 border-t border-border flex gap-2">
          <button type="button" onClick={onClose} disabled={enviando}
            className="flex-1 h-9 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50">
            {resposta ? "Fechar" : "Cancelar"}
          </button>
          {previa && !previa.bloqueio && previa.opcoes.length > 0 && resposta?.status !== "enviado" && (
            <button type="button" onClick={() => void enviar()} disabled={!pronto}
              title={!opcao ? "Escolha uma opção acima" : podeRepetir && !confirmaReenvio ? "Confirme que entendeu que vai repetir no grupo" : undefined}
              className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
              {enviando ? <Loader size={14} className="animate-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
              {enviando ? "Enviando…" : opcao ? `${ROTULO_OPCAO[opcao.modo]} (${opcao.artes.length})` : "Escolha uma opção"}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
