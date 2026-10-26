"use client";

// components/contratos/DocumentosD4Sign.tsx — quem assinou e quem falta na D4Sign.
//   · <DocumentosD4Sign clientId>  na aba Contratos da ficha: os documentos daquele cliente
//   · <DocumentosD4Sign />          na tela de Contratos: a carteira (esperando assinatura + assinados há até 30 dias)
// Cada documento: "assinado por X em dd/mm · falta Y" (lib/contracts/d4sign-resumo.ts — o mesmo texto do grupo).

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle, Clock, FileSignature, XCircle } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { ddmmD4Sign, resumoAssinaturas } from "@/lib/contracts/d4sign-resumo";
import type { DocumentoNaTela } from "@/app/api/contracts/d4sign/route";

const diasDesde = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : null);

function Situacao({ d }: { d: DocumentoNaTela }) {
  if (d.situacao === "assinado") {
    return <span className="text-lone-success flex items-center gap-1"><CheckCircle size={11} /> Assinado{d.assinadoEm ? ` em ${ddmmD4Sign(d.assinadoEm)}` : ""}</span>;
  }
  if (d.situacao === "pendente") {
    const dias = diasDesde(d.enviadoEm);
    return (
      <span className={`flex items-center gap-1 ${dias !== null && dias >= 3 ? "text-lone-danger" : "text-lone-warning"}`}>
        <Clock size={11} /> Esperando assinatura{dias !== null ? ` há ${dias} dia${dias === 1 ? "" : "s"}` : ""}
      </span>
    );
  }
  if (d.situacao === "cancelado") return <span className="text-muted-foreground flex items-center gap-1"><XCircle size={11} /> Cancelado</span>;
  return <span className="text-muted-foreground">Em preparo na D4Sign</span>;
}

export default function DocumentosD4Sign({ clientId, recarregarEm = 0 }: { clientId?: string; recarregarEm?: number }) {
  const [docs, setDocs] = useState<DocumentoNaTela[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const url = clientId ? `/api/contracts/d4sign?clientId=${encodeURIComponent(clientId)}` : "/api/contracts/d4sign";
    void chamar<{ documentos: DocumentoNaTela[] }>(url).then((r) => {
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
  const ordem = [...docs].sort((a, b) => (a.situacao === "pendente" ? 0 : 1) - (b.situacao === "pendente" ? 0 : 1));

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
        <FileSignature size={13} className="text-primary" /> {clientId ? "Na D4Sign" : "Assinaturas na D4Sign"}
      </p>
      {ordem.map((d) => (
        <div key={d.documento} className="space-y-1 border-t border-border pt-2 first:border-t-0 first:pt-0">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            {clientId || !d.clienteId ? (
              <span className="text-foreground truncate max-w-[60%]" title={d.nome ?? undefined}>{clientId ? d.nome || d.documento : d.cliente}</span>
            ) : (
              <Link href={`/clients/${d.clienteId}`} className="text-foreground font-medium hover:text-primary truncate max-w-[60%]" title={d.nome ?? undefined}>
                {d.cliente}
              </Link>
            )}
            <span className="text-[10px]"><Situacao d={d} /></span>
          </div>
          {d.signatarios.length > 0 && d.situacao !== "cancelado" && (
            <p className="text-[10px] text-muted-foreground">{resumoAssinaturas(d.signatarios)}</p>
          )}
        </div>
      ))}
    </div>
  );
}
