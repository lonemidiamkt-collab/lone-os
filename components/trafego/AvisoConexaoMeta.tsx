"use client";

// Aviso único de "a Meta caiu" para as telas do Tráfego. Quando o token vence (ou a Meta o recusa),
// nada que depende dela atualiza — e o pior que a tela pode fazer é continuar mostrando número como
// se fosse de hoje. Este aviso diz o que aconteceu e onde resolver; os números que ficarem na tela
// são a última leitura boa, com a hora dela.

import Link from "next/link";
import { AlertTriangle, PlugZap, ChevronRight } from "lucide-react";
import { mensagemConexao, ROTA_CONEXAO_META, type EstadoConexao } from "@/lib/trafego/anuncios";

export default function AvisoConexaoMeta({ estado, detalhe }: { estado: EstadoConexao; detalhe?: string }) {
  const msg = mensagemConexao(estado);
  if (!msg) return null;
  const expirada = estado === "expirada";
  const Icone = expirada ? AlertTriangle : PlugZap;
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${expirada ? "border-lone-warning-border bg-lone-warning-bg" : "border-border bg-muted"}`}
    >
      <Icone size={16} className={`mt-0.5 shrink-0 ${expirada ? "text-lone-warning" : "text-muted-foreground"}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${expirada ? "text-lone-warning" : "text-foreground"}`}>{msg}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {detalhe ?? "Enquanto isso, nada da Meta atualiza. O que aparece abaixo é a última leitura, com a hora dela."}
        </p>
      </div>
      <Link
        href={ROTA_CONEXAO_META}
        className="inline-flex shrink-0 items-center gap-1 self-center text-xs font-medium text-primary hover:underline"
      >
        Abrir Conexão Meta <ChevronRight size={13} />
      </Link>
    </div>
  );
}
