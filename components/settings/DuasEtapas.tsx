"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { estadoDuasEtapas, iniciarInscricao, confirmarInscricao, removerDuasEtapas, type EstadoDuasEtapas } from "@/lib/auth/duas-etapas";

// Painel "Verificação em duas etapas" em /settings › Segurança. Fluxo: Ativar → QR (ou segredo
// digitado) → primeiro código → ativo. Desligar pede a sessão em aal2 (o GoTrue recusa em aal1).

type Passo = "carregando" | "desligado" | "qr" | "ligado";

export default function DuasEtapas({ obrigatorio }: { obrigatorio: boolean }) {
  const [estado, setEstado] = useState<EstadoDuasEtapas | null>(null);
  const [passo, setPasso] = useState<Passo>("carregando");
  const [qr, setQr] = useState<{ fatorId: string; qr: string; segredo: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mostrarSegredo, setMostrarSegredo] = useState(false);

  const carregar = useCallback(async () => {
    const e = await estadoDuasEtapas();
    setEstado(e);
    setPasso(e.inscrito ? "ligado" : "desligado");
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const ativar = async () => {
    setOcupado(true); setErro("");
    const r = await iniciarInscricao();
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    setQr({ fatorId: r.fatorId, qr: r.qr, segredo: r.segredo });
    setCodigo("");
    setPasso("qr");
  };

  const confirmar = async () => {
    if (!qr || codigo.length !== 6 || ocupado) return;
    setOcupado(true); setErro("");
    const r = await confirmarInscricao(qr.fatorId, codigo);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro ?? "Código inválido."); setCodigo(""); return; }
    setQr(null);
    await carregar();
  };

  const desligar = async () => {
    if (!estado?.fatorId || ocupado) return;
    if (!window.confirm("Desligar a verificação em duas etapas? A senha sozinha volta a abrir esta conta.")) return;
    setOcupado(true); setErro("");
    const r = await removerDuasEtapas(estado.fatorId);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro ?? "Não consegui desligar."); return; }
    await carregar();
  };

  return (
    <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
      <div className="flex items-center gap-3">
        {passo === "ligado" ? <ShieldCheck size={16} className="text-lone-success" /> : <ShieldOff size={16} className="text-muted-foreground" />}
        <p className="text-sm font-medium text-foreground">Verificação em duas etapas</p>
        {passo === "ligado" && <span className="ml-auto rounded-full bg-lone-success-bg px-2 py-0.5 text-[10px] font-medium text-lone-success">Ativa</span>}
        {passo === "desligado" && obrigatorio && <span className="ml-auto rounded-full bg-lone-warning-bg px-2 py-0.5 text-[10px] font-medium text-lone-warning">Obrigatória para admin</span>}
      </div>

      {passo === "carregando" && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Consultando…</p>}

      {passo === "desligado" && (
        <>
          <p className="text-xs text-muted-foreground">
            Além da senha, um código de 6 dígitos gerado no seu celular (Google Authenticator, 1Password, Authy…).
            Quem pegar a sua senha continua sem entrar.
          </p>
          <button onClick={ativar} disabled={ocupado}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {ocupado ? <Loader2 size={12} className="animate-spin" /> : <Smartphone size={12} />} Ativar
          </button>
        </>
      )}

      {passo === "qr" && qr && (
        <div className="space-y-3">
          <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-1">
            <li>Abra o aplicativo autenticador no celular e escolha “adicionar conta”.</li>
            <li>Aponte a câmera para o código abaixo (ou digite o segredo).</li>
            <li>Digite aqui o código de 6 dígitos que o app mostrar.</li>
          </ol>
          <div className="flex flex-wrap items-start gap-4">
            {/* O GoTrue devolve o QR como SVG em data: URI */}
            {/* fundo branco fixo: leitor de QR precisa de contraste nos dois temas */}
            <img src={qr.qr} alt="QR code do autenticador" width={168} height={168} className="rounded-lg border border-border bg-white p-2" />
            <div className="flex-1 min-w-[200px] space-y-2">
              <button type="button" onClick={() => setMostrarSegredo((v) => !v)} className="text-[11px] text-primary hover:underline">
                {mostrarSegredo ? "Esconder segredo" : "Não consegue ler o QR? Mostrar segredo"}
              </button>
              {mostrarSegredo && <code className="block break-all rounded-md bg-secondary px-2 py-1 text-[11px] text-foreground">{qr.segredo}</code>}
              <input
                id="codigo-inscricao-duas-etapas"
                inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000"
                value={codigo}
                onChange={(e) => { setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6)); setErro(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") void confirmar(); }}
                className={`h-11 w-full rounded-lg border bg-secondary px-3 text-center font-mono text-lg tracking-[0.4em] text-foreground outline-none ${erro ? "border-destructive/60" : "border-input focus:border-primary"}`}
              />
              <div className="flex gap-2">
                <button onClick={confirmar} disabled={codigo.length !== 6 || ocupado}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {ocupado ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Confirmar
                </button>
                <button onClick={() => { setQr(null); setPasso("desligado"); setErro(""); }} disabled={ocupado}
                  className="px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {passo === "ligado" && (
        <>
          <p className="text-xs text-muted-foreground">
            Toda entrada nesta conta pede o código do autenticador. Sessão atual: <span className="font-mono text-foreground">{estado?.nivel ?? "?"}</span>.
          </p>
          <button onClick={desligar} disabled={ocupado}
            className="px-3 py-2 rounded-lg text-xs text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50">
            Desligar
          </button>
        </>
      )}

      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
