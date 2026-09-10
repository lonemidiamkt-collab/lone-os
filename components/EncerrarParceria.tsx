"use client";

// O FLUXO DE ENCERRAMENTO, na ficha do cliente.
//
// Roberto (09/09): "o cancelamento precisa virar um evento formal do ciclo de vida do cliente,
// preservando todo o histórico daquela conta."
//
// A tela existe para não deixar sair nada pela metade. Ela mostra o que falta o tempo todo, e o
// botão de concluir só fica verde quando o processo está completo — mas NÃO bloqueia: às vezes o
// cliente some e não há termo assinado nenhum, e travar o sistema por isso deixaria o cadastro
// mentindo que ele ainda é cliente.

import { useEffect, useState, useCallback } from "react";
import { X, Check, Loader2, AlertTriangle, FileText, Send, Undo2 } from "lucide-react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { MOTIVOS_LISTA } from "@/lib/clients/churn";
import { INICIATIVAS, avaliar, ESTADOS, type Offboarding, type Iniciativa } from "@/lib/clients/offboarding";

interface Linha extends Record<string, unknown> {
  id: string; client_id: string; iniciativa: string; motivo: string; motivo_detalhe: string | null;
  solicitado_em: string; encerra_em: string;
  financeiro_ok: boolean | null; financeiro_nota: string | null;
  entregas_ok: boolean | null; entregas_nota: string | null;
  servicos: string[] | null; entregas_extra: string[] | null;
  estado: string; termo_path: string | null; enviado_em: string | null; confirmado_em: string | null;
}

const paraRegra = (l: Linha): Offboarding => ({
  id: l.id, clientId: l.client_id, iniciativa: l.iniciativa as Iniciativa,
  motivo: l.motivo, motivoDetalhe: l.motivo_detalhe,
  solicitadoEm: l.solicitado_em, encerraEm: l.encerra_em,
  financeiroOk: l.financeiro_ok, financeiroNota: l.financeiro_nota,
  entregasOk: l.entregas_ok, entregasNota: l.entregas_nota,
  estado: l.estado as Offboarding["estado"],
  termoPath: l.termo_path, enviadoEm: l.enviado_em, confirmadoEm: l.confirmado_em,
});

const hojeISO = () => new Date().toISOString().slice(0, 10);

export default function EncerrarParceria({ clientId, clientName, aoFechar, aoConcluir }: {
  clientId: string; clientName: string; aoFechar: () => void; aoConcluir?: () => void;
}) {
  const [off, setOff] = useState<Linha | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Rascunho local do formulário de abertura.
  const [novo, setNovo] = useState({
    iniciativa: "cliente" as Iniciativa,
    motivo: "", motivoDetalhe: "",
    solicitadoEm: hojeISO(), encerraEm: hojeISO(),
  });

  const carregar = useCallback(async () => {
    try {
      const r = await authedFetch("/api/clients/offboarding/lista");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      const meu = [...(j.encerrando ?? []), ...(j.desativados ?? [])]
        .find((l: { clientId: string }) => l.clientId === clientId);
      if (meu?.offboardingId) {
        const r2 = await authedFetch(`/api/clients/offboarding/detalhe?id=${meu.offboardingId}`);
        const j2 = await r2.json();
        if (r2.ok) setOff(j2.offboarding as Linha);
      } else setOff(null);
      setErro(null);
    } catch (e) { setErro((e as Error).message); }
    finally { setCarregando(false); }
  }, [clientId]);
  useEffect(() => { carregar(); }, [carregar]);

  const chamar = async (corpo: Record<string, unknown>, tag: string) => {
    setOcupado(tag); setAviso(null);
    try {
      const r = await authedFetch("/api/clients/offboarding", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
      });
      const bruto = await r.text();
      let j: Record<string, unknown> = {};
      try { j = JSON.parse(bruto); } catch { /* corpo não-JSON vira mensagem crua */ }
      if (!r.ok) {
        setAviso(String(j.aviso ?? j.error ?? bruto.slice(0, 140)));
        return j;
      }
      await carregar();
      return j;
    } catch (e) {
      // Sem catch, a falha vira silêncio e a pessoa acha que deu certo.
      setAviso(`Não consegui: ${(e as Error).message}`);
      return null;
    } finally { setOcupado(null); }
  };

  const gerarTermo = async () => {
    if (!off) return;
    setOcupado("termo"); setAviso(null);
    try {
      const r = await authedFetch("/api/clients/offboarding/termo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: off.id }),
      });
      const j = await r.json();
      if (!r.ok) { setAviso(j?.error ?? "não consegui gerar"); return; }
      await carregar();
      if (j.url) window.open(j.url as string, "_blank", "noopener");
    } catch (e) { setAviso((e as Error).message); }
    finally { setOcupado(null); }
  };

  const abrirTermo = async () => {
    if (!off) return;
    const r = await authedFetch(`/api/clients/offboarding/termo?id=${off.id}`);
    const j = await r.json();
    if (j?.url) window.open(j.url as string, "_blank", "noopener");
    else setAviso(j?.error ?? "termo indisponível");
  };

  const situacao = off ? avaliar(paraRegra(off)) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/60 backdrop-blur-sm" onClick={aoFechar}>
      <div onClick={(e) => e.stopPropagation()}
           className="w-full max-w-lg h-full bg-card border-l border-border overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border p-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">Encerrar parceria</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">{clientName}</p>
          </div>
          <button onClick={aoFechar} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        {carregando && (
          <p className="p-4 text-[12px] text-muted-foreground flex items-center gap-2">
            <Loader2 size={13} className="animate-spin" /> Abrindo…
          </p>
        )}

        {erro && (
          <div className="m-4 p-2.5 rounded-lg bg-lone-danger-bg border border-lone-danger-border">
            <p className="text-[11.5px] text-lone-danger">{erro}</p>
          </div>
        )}

        {/* ── AINDA NÃO COMEÇOU ────────────────────────────────────────── */}
        {!carregando && !off && (
          <div className="p-4 space-y-3">
            <p className="text-[11.5px] text-muted-foreground">
              O cliente não é apagado. Ele passa a <strong>encerrando</strong> agora e só vira
              inativo na data efetiva — até lá a Lone ainda responde pela operação.
            </p>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Quem pediu</label>
              <div className="flex gap-1.5 mt-1">
                {(Object.entries(INICIATIVAS) as [Iniciativa, string][]).map(([k, r]) => (
                  <button key={k} type="button" onClick={() => setNovo({ ...novo, iniciativa: k })}
                    className={`flex-1 text-[11px] px-2 py-1.5 rounded-lg border transition-colors ${
                      novo.iniciativa === k ? "bg-primary/15 border-primary/50 text-primary"
                        : "bg-surface border-border text-muted-foreground hover:text-foreground"}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Motivo</label>
              <select value={novo.motivo} onChange={(e) => setNovo({ ...novo, motivo: e.target.value })}
                className="mt-1 w-full p-2 rounded-lg bg-surface border border-border text-[12.5px] text-foreground">
                <option value="">Escolha o motivo</option>
                {MOTIVOS_LISTA.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
              </select>
            </div>

            <textarea value={novo.motivoDetalhe} onChange={(e) => setNovo({ ...novo, motivoDetalhe: e.target.value })}
              placeholder="Ex.: precisa reduzir despesas nos próximos meses"
              className="w-full h-16 p-2 rounded-lg bg-surface border border-border text-[12.5px] text-foreground placeholder:text-muted-foreground/35 placeholder:italic resize-y" />

            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] text-muted-foreground">Solicitado em
                <input type="date" value={novo.solicitadoEm} max={hojeISO()}
                  onChange={(e) => setNovo({ ...novo, solicitadoEm: e.target.value })}
                  className="mt-1 w-full p-1.5 rounded-lg bg-surface border border-border text-[12px] text-foreground" />
              </label>
              <label className="text-[10px] text-muted-foreground">Encerra em
                <input type="date" value={novo.encerraEm} min={novo.solicitadoEm}
                  onChange={(e) => setNovo({ ...novo, encerraEm: e.target.value })}
                  className="mt-1 w-full p-1.5 rounded-lg bg-surface border border-border text-[12px] text-foreground" />
              </label>
            </div>

            {aviso && <p className="text-[11px] text-lone-danger">{aviso}</p>}
            <button
              onClick={() => chamar({ acao: "iniciar", clientId, ...novo }, "iniciar")}
              disabled={!novo.motivo || ocupado === "iniciar"}
              className="w-full text-[12px] px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium flex items-center justify-center gap-1.5 disabled:opacity-40">
              {ocupado === "iniciar" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Iniciar encerramento
            </button>
          </div>
        )}

        {/* ── EM ANDAMENTO ─────────────────────────────────────────────── */}
        {off && situacao && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-foreground">
                {ESTADOS[off.estado as Offboarding["estado"]] ?? off.estado}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {situacao.percentual}% · encerra em {off.encerra_em.split("-").reverse().join("/")}
              </span>
            </div>

            {situacao.alertas.map((a) => (
              <div key={a} className="p-2.5 rounded-lg bg-lone-warning-bg border border-lone-warning-border">
                <p className="text-[11.5px] text-lone-warning flex items-start gap-1.5">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {a}
                </p>
              </div>
            ))}

            {/* ── CONFERÊNCIAS ─────────────────────────────────────────── */}
            {([
              ["financeiro", "Existem pendências financeiras?", off.financeiro_ok, off.financeiro_nota],
              ["entregas", "Todas as entregas foram concluídas?", off.entregas_ok, off.entregas_nota],
            ] as const).map(([campo, pergunta, valor, nota]) => {
              // A pergunta do financeiro é invertida: "sim, há pendência" = financeiro_ok false.
              const sim = campo === "financeiro" ? false : true;
              return (
                <div key={campo} className="p-3 rounded-xl bg-surface border border-border space-y-2">
                  <p className="text-[12px] text-foreground">{pergunta}</p>
                  <div className="flex gap-1.5">
                    {[["Sim", sim], ["Não", !sim]].map(([rot, v]) => (
                      <button key={String(rot)} type="button"
                        onClick={() => chamar({
                          acao: "atualizar", id: off.id,
                          [campo === "financeiro" ? "financeiroOk" : "entregasOk"]: v,
                        }, campo)}
                        className={`flex-1 text-[11px] px-2 py-1.5 rounded-lg border transition-colors ${
                          valor === v ? "bg-primary/15 border-primary/50 text-primary"
                            : "bg-card border-border text-muted-foreground hover:text-foreground"}`}>
                        {String(rot)}
                      </button>
                    ))}
                  </div>
                  {valor == null && (
                    <p className="text-[10px] text-lone-warning">
                      Enquanto ninguém responder, o termo vai dizer que não foi conferido — e não
                      que está tudo certo.
                    </p>
                  )}
                  {valor === (campo === "financeiro" ? false : true) && (
                    <input defaultValue={nota ?? ""}
                      onBlur={(e) => chamar({
                        acao: "atualizar", id: off.id,
                        [campo === "financeiro" ? "financeiroNota" : "entregasNota"]: e.target.value.trim() || null,
                      }, `${campo}-nota`)}
                      placeholder={campo === "financeiro" ? "Ex.: setembro em aberto" : "Ex.: relatório final"}
                      className="w-full p-1.5 rounded-lg bg-card border border-border text-[12px] text-foreground placeholder:text-muted-foreground/35 placeholder:italic" />
                  )}
                </div>
              );
            })}

            {/* ── CHECKLIST ────────────────────────────────────────────── */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Checklist do encerramento
              </p>
              <div className="space-y-1">
                {situacao.itens.map((i) => (
                  <div key={i.chave} className="flex items-center gap-2 text-[12px]">
                    <span className={i.feito ? "text-lone-success" : i.essencial ? "text-lone-warning" : "text-muted-foreground"}>
                      {i.feito ? "✓" : "○"}
                    </span>
                    <span className={i.feito ? "text-muted-foreground line-through" : "text-foreground"}>
                      {i.rotulo}
                    </span>
                    {!i.essencial && !i.feito && (
                      <span className="text-[9.5px] text-muted-foreground">(não trava)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {aviso && <p className="text-[11px] text-lone-danger">{aviso}</p>}

            <div className="grid grid-cols-2 gap-2">
              <button onClick={gerarTermo} disabled={ocupado === "termo"}
                className="text-[12px] px-3 py-2 rounded-lg bg-surface border border-border text-foreground hover:border-primary flex items-center justify-center gap-1.5 disabled:opacity-50">
                {ocupado === "termo" ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                {off.termo_path ? "Regerar termo" : "Gerar termo"}
              </button>
              {off.termo_path && (
                <button onClick={abrirTermo}
                  className="text-[12px] px-3 py-2 rounded-lg bg-surface border border-border text-foreground hover:border-primary">
                  Abrir termo
                </button>
              )}
              {off.termo_path && !off.enviado_em && (
                <button onClick={() => chamar({ acao: "marcar_enviado", id: off.id, canal: "manual" }, "enviar")}
                  disabled={ocupado === "enviar"}
                  className="text-[12px] px-3 py-2 rounded-lg bg-surface border border-border text-foreground hover:border-primary flex items-center justify-center gap-1.5">
                  <Send size={13} /> Marquei como enviado
                </button>
              )}
              {off.enviado_em && !off.confirmado_em && (
                <button onClick={() => chamar({ acao: "marcar_confirmado", id: off.id, origem: "manual" }, "confirmar")}
                  disabled={ocupado === "confirmar"}
                  className="text-[12px] px-3 py-2 rounded-lg bg-surface border border-border text-foreground hover:border-primary">
                  Cliente confirmou
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button onClick={() => chamar({ acao: "desistir", id: off.id }, "desistir")}
                disabled={ocupado === "desistir"}
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                <Undo2 size={11} /> Desistir do encerramento
              </button>
              <button
                onClick={async () => {
                  const j = await chamar({ acao: "concluir", id: off.id }, "concluir");
                  if (j?.error === "faltam_itens") {
                    // Aviso forte, não bloqueio: cliente que some não deixa termo assinado, e travar
                    // aqui manteria o cadastro dizendo que ele ainda é cliente.
                    const falta = (j.faltando as string[])?.join(", ") ?? "";
                    if (confirm(`Faltam: ${falta}.\n\nConcluir assim deixa o registro incompleto. Confirma?`)) {
                      const ok = await chamar({ acao: "concluir", id: off.id, mesmoAssim: true }, "concluir");
                      if (ok?.ok) { aoConcluir?.(); aoFechar(); }
                    }
                  } else if (j?.ok) { aoConcluir?.(); aoFechar(); }
                }}
                disabled={ocupado === "concluir"}
                className={`text-[12px] px-4 py-2 rounded-lg font-medium flex items-center gap-1.5 ${
                  situacao.completo ? "bg-lone-success-bg text-lone-success border border-lone-success-border"
                    : "bg-surface border border-border text-foreground"}`}>
                {ocupado === "concluir" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Concluir encerramento
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
