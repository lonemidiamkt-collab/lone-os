"use client";

// components/contratos/DocumentosD4Sign.tsx — os documentos da D4Sign de um cliente na aba Contratos da ficha:
// situação, quem já assinou e quem falta, e o PDF assinado (que a D4Sign manda sozinha quando todos assinam).
// Vale também para cliente que não tem contrato registrado no Lone OS — o PDF entra aqui do mesmo jeito.

import { useEffect, useState } from "react";
import { CheckCircle, Clock, FileCheck2, FileSignature, XCircle } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import type { DocumentoNaTela } from "@/app/api/contracts/d4sign/route";

const dia = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");
const PAPEL: Record<string, string> = { cliente: "cliente", lone: "Lone", testemunha: "testemunha" };

export function SignatariosD4Sign({ lista }: { lista: DocumentoNaTela["signatarios"] }) {
  if (!lista.length) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
      {lista.map((s, i) => (
        <span key={i} className={`flex items-center gap-1 ${s.assinou ? "text-lone-success" : "text-lone-warning"}`} title={s.email ?? undefined}>
          {s.assinou ? <CheckCircle size={10} /> : <Clock size={10} />}
          {s.nome || s.email || "signatário"} <span className="text-muted-foreground">({PAPEL[s.papel] ?? s.papel}{s.assinou && s.assinadoEm ? `, ${dia(s.assinadoEm)}` : ""})</span>
        </span>
      ))}
    </div>
  );
}

export default function DocumentosD4Sign({ clientId, abrirPdf, recarregarEm = 0 }: {
  clientId: string;
  /** O mesmo "Ver assinado" da ficha (caminho legal://…). */
  abrirPdf: (caminho: string) => void;
  recarregarEm?: number;
}) {
  const [docs, setDocs] = useState<DocumentoNaTela[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void chamar<{ documentos: DocumentoNaTela[] }>(`/api/contracts/d4sign?clientId=${encodeURIComponent(clientId)}`).then((r) => {
      if (!vivo) return;
      if (r.status === 403) { setDocs([]); return; } // não é admin: o bloco simplesmente não aparece
      if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui ler os documentos da D4Sign."); return; }
      setErro(null);
      setDocs(r.data.documentos);
    });
    return () => { vivo = false; };
  }, [clientId, recarregarEm]);

  if (erro) return <p className="text-[11px] text-muted-foreground">D4Sign: {erro}</p>;
  if (!docs?.length) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
        <FileSignature size={13} className="text-primary" /> Na D4Sign
      </p>
      {docs.map((d) => (
        <div key={d.documento} className="space-y-1.5 border-t border-border pt-2 first:border-t-0 first:pt-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-foreground truncate max-w-[60%]" title={d.nome ?? undefined}>{d.nome || d.documento}</span>
            <span className="flex items-center gap-2 text-[10px]">
              {d.situacao === "assinado" ? (
                <span className="text-lone-success flex items-center gap-1"><CheckCircle size={11} /> Assinado {dia(d.assinadoEm)}</span>
              ) : d.situacao === "pendente" ? (
                <span className="text-lone-warning flex items-center gap-1"><Clock size={11} /> Esperando assinatura{d.enviadoEm ? ` desde ${dia(d.enviadoEm)}` : ""}</span>
              ) : d.situacao === "cancelado" ? (
                <span className="text-muted-foreground flex items-center gap-1"><XCircle size={11} /> Cancelado</span>
              ) : (
                <span className="text-muted-foreground">{d.etapaDoEnvio && d.etapaDoEnvio !== "enviado" ? "Envio incompleto" : "Em preparo na D4Sign"}</span>
              )}
              {d.pdf && (
                <button onClick={() => abrirPdf(d.pdf!)} className="flex items-center gap-1 text-primary hover:underline">
                  <FileCheck2 size={11} /> Ver PDF assinado
                </button>
              )}
            </span>
          </div>
          <SignatariosD4Sign lista={d.signatarios} />
          {d.situacao === "assinado" && !d.pdf && d.pdfErro && (
            <p className="text-[10px] text-lone-warning">O PDF assinado ainda não veio da D4Sign ({d.pdfErro}). O sistema tenta de novo sozinho.</p>
          )}
        </div>
      ))}
    </div>
  );
}
