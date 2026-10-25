"use client";

// Sistema › Conexão Meta — a única integração que existe de verdade (Leva 4; antes /integrations,
// que tinha mais 10 cartões simulados). O token é da AGÊNCIA: alimenta saldos, alertas de verba,
// Defesa Ativa, relatórios, portal e a aba Anúncios Meta.
//
// O estado mostrado vem do servidor (/api/trafego/conexao-meta) para todo papel do tráfego. Reconectar
// e desconectar gravam o token, e isso só o admin faz. O login da Meta volta para /traffic, que repassa
// para cá (components/trafego/RetornoConexaoMeta.tsx).
//
// 25/10/2026 (auditoria 9.5): o token novo não é mais gravado no retorno do login. Esta tela confere
// antes (POST /api/meta/reconectar sem confirmar): de quem é o perfil, que permissões faltam e "de N
// para M contas da carteira" — e só troca quando o admin confirma. Erro do Facebook e falha ao gravar
// ou desconectar aparecem aqui (antes iam só para o console).

import { useCallback, useEffect, useState } from "react";
import {
  Plug, CheckCircle, XCircle, AlertTriangle, Facebook, RefreshCw, Clock, Loader2, Trash2, Lock,
} from "lucide-react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { useMetaConnection } from "@/lib/meta/useMetaAds";
import { useRole } from "@/lib/context/RoleContext";
import { chamar } from "@/lib/api/chamar";
import type { EstadoConexao } from "@/lib/trafego/anuncios";
import type { PreviaTroca } from "@/lib/meta/troca-token";

interface StatusServidor { estado: EstadoConexao; expiraEm: number | null; tipo: "short" | "long" | null }
interface RespostaTroca {
  ok: boolean;
  gravado: boolean;
  tipo?: "long" | "short";
  precisaDecidir?: "curto";
  erro?: string;
  previa: PreviaTroca;
  avisos: string[];
  arriscada: boolean;
  temTokenAtual: boolean;
}

function formatExpira(ms: number): string {
  const d = new Date(ms);
  const dias = Math.ceil((ms - Date.now()) / 86_400_000);
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });
  return dias <= 0 ? `hoje (${data})` : `${data} · em ${dias} dia${dias === 1 ? "" : "s"}`;
}

export default function ConexaoMetaPage() {
  const { role } = useRole();
  // Gravar o token é só do admin (/api/meta/token confere no servidor).
  const podeGravar = role === "admin";
  // O hook também processa o retorno do login (#access_token) e troca pelo token longo.
  const meta = useMetaConnection();
  const [status, setStatus] = useState<StatusServidor | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarDesconexao, setConfirmarDesconexao] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  // Troca de token conferida antes de gravar.
  const [conferindo, setConferindo] = useState(false);
  const [troca, setTroca] = useState<RespostaTroca | null>(null);
  const [erroTroca, setErroTroca] = useState<string | null>(null);
  const [aceitarRisco, setAceitarRisco] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await chamar<StatusServidor>("/api/trafego/conexao-meta");
    if (!r.ok || !r.data) { setErro(r.erro); return; }
    setErro(null);
    setStatus(r.data);
  }, []);

  // Relê quando o hook termina (login novo, troca por token longo, desconexão).
  useEffect(() => { if (!meta.loading) carregar(); }, [meta.loading, meta.connected, meta.tokenType, carregar]);

  // Voltou do Facebook com um token: confere (sem gravar) e mostra o que muda.
  const pendente = meta.pendente;
  useEffect(() => {
    if (!pendente || !podeGravar) return;
    let vivo = true;
    setConferindo(true);
    setErroTroca(null);
    setTroca(null);
    setAceitarRisco(false);
    chamar<RespostaTroca>("/api/meta/reconectar", { token: pendente.token, expiresIn: pendente.expiresIn }).then((r) => {
      if (!vivo) return;
      setConferindo(false);
      if (!r.ok || !r.data) { setErroTroca(r.erro ?? "Não consegui conferir o token novo. Nada mudou."); return; }
      setTroca(r.data);
    });
    return () => { vivo = false; };
  }, [pendente, podeGravar]);

  const descartarTroca = () => {
    meta.descartarPendente();
    setTroca(null);
    setErroTroca(null);
    setAviso("Troca cancelada. O token anterior continua valendo.");
  };

  const confirmarTroca = async (aceitarCurto = false) => {
    if (!pendente) return;
    setGravando(true);
    setErroTroca(null);
    const r = await chamar<RespostaTroca>("/api/meta/reconectar", {
      token: pendente.token, expiresIn: pendente.expiresIn, confirmar: true, aceitarRisco, aceitarCurto,
    });
    setGravando(false);
    if (!r.ok || !r.data) { setErroTroca(r.erro ?? "Não consegui gravar o token novo. O atual continua."); return; }
    if (!r.data.gravado) { setTroca(r.data); setErroTroca(r.data.erro ?? "O token não foi gravado."); return; }
    meta.descartarPendente();
    setTroca(null);
    setAviso(r.data.tipo === "short"
      ? "Token trocado — mas é o curto, que dura cerca de 1 hora. Confira o META_APP_SECRET e reconecte."
      : `Token trocado${r.data.previa.perfil ? ` (perfil ${r.data.previa.perfil})` : ""}. Saldos, alertas, portal e relatórios já usam o novo.`);
    await meta.recarregar();
    carregar();
  };

  const desconectar = async () => {
    setDesconectando(true);
    const r = await meta.disconnect();
    setDesconectando(false);
    setConfirmarDesconexao(false);
    if (!r.ok) { setErro(`Não consegui desconectar (${r.erro ?? "erro"}). A conexão continua como estava.`); return; }
    carregar();
  };

  const estado = !status ? "loading" : status.estado === "ok" ? "connected" : status.estado === "expirada" ? "expired" : "disconnected";
  const STATUS = {
    loading:      { label: "Verificando…",   cls: "text-muted-foreground bg-muted border-border", icon: Loader2 },
    connected:    { label: "Conectada",      cls: "text-lone-success bg-lone-success-bg border-lone-success-border", icon: CheckCircle },
    disconnected: { label: "Desconectada",   cls: "text-muted-foreground bg-muted border-border", icon: XCircle },
    expired:      { label: "Token expirado", cls: "text-lone-warning bg-lone-warning-bg border-lone-warning-border", icon: AlertTriangle },
  }[estado];
  const StatusIcon = STATUS.icon;
  // Aviso antes de vencer: sem token, todo sync/alerta de verba para em silêncio.
  const venceEmBreve = estado === "connected" && status?.expiraEm != null && status.expiraEm - Date.now() < 7 * 86_400_000;

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <Header title="Conexão Meta" subtitle="Sistema" />
      <div className="animate-fade-in space-y-6 p-6">
        <div className="max-w-2xl">
          <h1 className="flex items-center gap-2 text-lone-h1 tracking-tight text-foreground">
            <Plug size={20} className="text-primary" /> Conexão Meta
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            O painel só lê dados de anúncios; nada é alterado nas campanhas. Esta conexão alimenta saldos, alertas de verba,
            Defesa Ativa, relatórios, o portal do cliente e a aba Anúncios Meta.
          </p>
        </div>

        {erro && (
          <div className="max-w-2xl rounded-xl border border-lone-danger-border bg-lone-danger-bg px-4 py-3 text-xs text-lone-danger">{erro}</div>
        )}

        {meta.erroLogin && (
          <div role="alert" className="max-w-2xl flex items-start gap-3 rounded-xl border border-lone-warning-border bg-lone-warning-bg px-4 py-3 text-xs text-foreground">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-lone-warning" />
            <p className="flex-1">{meta.erroLogin}</p>
            <button type="button" onClick={meta.limparErroLogin} className="text-muted-foreground hover:text-foreground" aria-label="Fechar aviso"><XCircle size={14} /></button>
          </div>
        )}

        {aviso && (
          <div role="status" className="max-w-2xl flex items-start gap-3 rounded-xl border border-lone-info-border bg-lone-info-bg px-4 py-3 text-xs text-foreground">
            <p className="flex-1">{aviso}</p>
            <button type="button" onClick={() => setAviso(null)} className="text-muted-foreground hover:text-foreground" aria-label="Fechar aviso"><XCircle size={14} /></button>
          </div>
        )}

        {pendente && podeGravar && (
          <div className="card max-w-2xl space-y-3 border-lone-warning-border">
            <div>
              <h2 className="text-lone-h2 text-foreground">Conferir antes de trocar o token</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">O login voltou do Facebook. Nada foi gravado ainda — o token atual continua valendo até você confirmar.</p>
            </div>
            {conferindo && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" /> Conferindo perfil, permissões e contas…</p>}
            {troca && (
              <>
                <dl className="grid gap-1 text-xs">
                  <div className="flex gap-2"><dt className="text-muted-foreground">Perfil:</dt><dd className="font-medium text-foreground">{troca.previa.perfil ?? "—"}</dd></div>
                </dl>
                <ul className="space-y-1">
                  {troca.avisos.map((a, i) => (
                    <li key={i} className={`text-xs ${i > 0 ? "text-lone-danger" : "text-foreground"}`}>• {a}</li>
                  ))}
                </ul>
                {troca.arriscada && (
                  <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
                    <input type="checkbox" className="mt-0.5" checked={aceitarRisco} onChange={(e) => setAceitarRisco(e.target.checked)} />
                    <span>Entendi o que para de funcionar e quero trocar mesmo assim.</span>
                  </label>
                )}
              </>
            )}
            {erroTroca && <p role="alert" className="text-xs text-lone-danger">{erroTroca}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={descartarTroca} disabled={gravando}>Cancelar — manter o atual</Button>
              {troca?.precisaDecidir === "curto" ? (
                <Button size="sm" onClick={() => void confirmarTroca(true)} disabled={gravando}>
                  {gravando ? <Loader2 className="animate-spin" /> : <Clock />} Salvar o token curto (~1h)
                </Button>
              ) : (
                <Button size="sm" onClick={() => void confirmarTroca(false)} disabled={gravando || conferindo || !troca || (troca.arriscada && !aceitarRisco)}>
                  {gravando ? <Loader2 className="animate-spin" /> : <CheckCircle />} {troca?.temTokenAtual ? "Trocar o token" : "Salvar o token"}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className={`card max-w-2xl ${estado === "connected" ? "border-primary/20" : ""}`}>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
              <Facebook size={22} className="text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex flex-wrap items-center gap-2">
                <h3 className="text-lone-h2 text-foreground">Meta Ads (Facebook/Instagram)</h3>
                <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS.cls}`}>
                  <StatusIcon size={9} className={estado === "loading" ? "animate-spin" : ""} /> {STATUS.label}
                </span>
                {status?.tipo === "short" && estado === "connected" && (
                  <span className="rounded-full border border-lone-warning-border bg-lone-warning-bg px-2 py-0.5 text-[10px] font-medium text-lone-warning">token curto (~1h)</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Campanhas, métricas, saldos e criativos das contas de anúncio.</p>

              {estado === "connected" && (
                <p className={`mt-2 flex items-center gap-1 text-[11px] ${venceEmBreve ? "text-lone-warning" : "text-muted-foreground"}`}>
                  <Clock size={10} />
                  {status?.expiraEm != null
                    ? <>Token vence {formatExpira(status.expiraEm)}{venceEmBreve ? " — reconecte para não parar o sync" : ""}</>
                    : "Token sem data de vencimento informada"}
                </p>
              )}
              {estado === "expired" && (
                <p className="mt-2 text-[11px] text-lone-warning">
                  O token venceu: saldos, alertas de verba, anúncios e relatórios param de atualizar até reconectar.
                </p>
              )}

              {podeGravar ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {estado !== "connected" && estado !== "loading" && (
                    <Button size="sm" onClick={() => meta.connect()}>
                      {estado === "expired" ? <RefreshCw /> : <Facebook />}
                      {estado === "expired" ? "Reconectar" : "Conectar ao Facebook"}
                    </Button>
                  )}
                  {estado === "connected" && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => meta.connect()} title="Refaz o login pedindo as permissões atuais (Instagram etc.)">
                        <RefreshCw /> Reconectar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setConfirmarDesconexao(true)}>
                        <XCircle /> Desconectar
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                estado !== "loading" && (
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Lock size={11} /> Só um admin conecta ou reconecta a Meta{estado !== "connected" ? " — avise a gestão" : ""}.
                  </p>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmarDesconexao && (
        <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-overlay backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm animate-slide-up space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lone-danger-bg">
                <AlertTriangle size={20} className="text-lone-danger" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Desconectar a Meta?</h3>
                <p className="text-[10px] text-muted-foreground">Meta Ads (Facebook/Instagram)</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Saldos, alertas de verba, Defesa Ativa, anúncios e relatórios param de atualizar até alguém reconectar.
            </p>
            <div className="flex items-center gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmarDesconexao(false)}>Cancelar</Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => void desconectar()}
                disabled={desconectando}
              >
                {desconectando ? <Loader2 className="animate-spin" /> : <Trash2 />} Desconectar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
