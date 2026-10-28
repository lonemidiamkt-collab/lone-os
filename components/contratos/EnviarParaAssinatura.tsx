"use client";

// components/contratos/EnviarParaAssinatura.tsx — "Cliente concordou → enviar para assinatura" (28/10/2026).
// Botão no contrato da ficha. Abre a prévia (quem assina, e-mail, cofre) e só envia na confirmação; falha no meio
// vira "Continuar envio" com o mesmo documento. lib/contracts/enviar-d4sign.ts.

import { useState } from "react";
import { Loader2, Send, X, AlertTriangle } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { toast } from "sonner";
import type { Previa } from "@/lib/contracts/enviar-d4sign";

export interface EstadoEnvio {
  id: string;
  signedAt?: string | null;
  d4signAssinadoEm?: string | null;
  archivedAt?: string | null;
  pdfUrl?: string | null;
  d4signDocumentUuid?: string | null;
  d4signEnvioEtapa?: "subido" | "signatarios" | "enviado" | null;
  d4signEnviadoEm?: string | null;
  d4signEnvioErro?: string | null;
}

export default function EnviarParaAssinatura({ contrato, onEnviado }: { contrato: EstadoEnvio; onEnviado: () => void }) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [cofre, setCofre] = useState("");

  if (contrato.signedAt || contrato.d4signAssinadoEm || contrato.archivedAt || !contrato.pdfUrl) return null;
  if (contrato.d4signEnvioEtapa === "enviado") {
    const quando = contrato.d4signEnviadoEm ? new Date(contrato.d4signEnviadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";
    return <span className="flex items-center gap-1 text-[10px] text-primary"><Send size={11} /> Enviado para assinatura{quando ? ` em ${quando}` : ""}</span>;
  }
  // Ligado a um documento que veio do painel da D4Sign: o envio é lá.
  if (contrato.d4signDocumentUuid && !contrato.d4signEnvioEtapa) return null;
  const continuar = !!contrato.d4signEnvioEtapa;

  const abrir = async () => {
    setAbrindo(true); setErro(null);
    const r = await chamar<{ previa: Previa }>("/api/contracts/d4sign/enviar", { contractId: contrato.id, acao: "prever" });
    setAbrindo(false);
    if (!r.ok || !r.data) { toast.error(r.erro ?? "Não consegui preparar o envio."); return; }
    setPrevia(r.data.previa);
    setEmail(r.data.previa.emailsCliente[0] ?? "");
    setCofre(r.data.previa.cofres.find((c) => c.sugerido)?.uuid ?? r.data.previa.cofres[0]?.uuid ?? "");
  };

  const enviar = async () => {
    setEnviando(true); setErro(null);
    const r = await chamar<{ avisos?: string[] }>("/api/contracts/d4sign/enviar", { contractId: contrato.id, acao: "enviar", cofre, email });
    setEnviando(false);
    if (!r.ok) { setErro(r.erro ?? "O envio não terminou."); onEnviado(); return; }
    toast.success("Enviado: a D4Sign mandou o link para o e-mail do cliente e da Lone.");
    if (r.data?.avisos?.length) toast.warning(r.data.avisos.join(" · "));
    setPrevia(null);
    onEnviado();
  };

  return (
    <>
      <button onClick={() => void abrir()} disabled={abrindo}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50"
        title={continuar ? `O envio parou no meio${contrato.d4signEnvioErro ? `: ${contrato.d4signEnvioErro}` : ""}. Continua com o mesmo documento.` : "Quando o cliente concordar: manda o contrato para o e-mail dele assinar pela D4Sign."}>
        {abrindo ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
        {continuar ? "Continuar envio" : "Cliente concordou — enviar para assinatura"}
      </button>

      {previa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Enviar para assinatura">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Enviar para assinatura na D4Sign</h3>
                <p className="text-[11px] text-muted-foreground">{previa.cliente} · {previa.servico}{previa.versao ? ` · V${previa.versao}` : ""}</p>
              </div>
              <button onClick={() => setPrevia(null)} className="text-muted-foreground hover:text-foreground" aria-label="Fechar"><X size={16} /></button>
            </div>

            <label className="block text-[11px] text-muted-foreground">E-mail do cliente (o do cadastro)
              <select value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground">
                {previa.emailsCliente.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
            <div className="text-[11px] text-muted-foreground">Assina pela Lone: <span className="text-foreground">{previa.emailsLone.join(", ")}</span></div>
            <label className="block text-[11px] text-muted-foreground">Cofre na D4Sign
              <select value={cofre} onChange={(e) => setCofre(e.target.value)} className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground">
                {previa.cofres.map((c) => <option key={c.uuid} value={c.uuid}>{c.nome}{c.sugerido ? " (sugerido)" : ""}</option>)}
              </select>
            </label>
            <p className="text-[11px] text-muted-foreground">Arquivo: <span className="text-foreground">{previa.arquivo}</span></p>

            <p className="flex items-start gap-1.5 rounded-lg border border-lone-warning-border bg-lone-warning-bg px-3 py-2 text-[11px] text-lone-warning">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              Vai agora para o e-mail do cliente e da Lone, com o link da D4Sign. Usa 1 dos envios do mês do plano e 3 das 10 chamadas da hora.
              {previa.continuaDe !== "subir" ? " O arquivo já está lá: continua de onde parou, sem subir de novo." : ""}
            </p>
            {erro && <p className="text-[11px] text-lone-danger">{erro}</p>}

            <div className="flex justify-end gap-2">
              <button onClick={() => setPrevia(null)} className="h-9 rounded-md border border-border px-3 text-sm text-foreground hover:bg-accent">Cancelar</button>
              <button onClick={() => void enviar()} disabled={enviando || !email || !cofre}
                className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar agora
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
