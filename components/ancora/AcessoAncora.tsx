"use client";

// components/ancora/AcessoAncora.tsx — os pedaços do acesso ao Âncora CRM usados na aba Âncora (app/ancora) e na
// ficha do cliente (aba Integrações): o formulário de gerar o link de cadastro, a cor de cada estado e a frase da
// assinatura. Um lugar só: os dois lados geram o link do mesmo jeito (POST /api/ancora/link).
//
// O sistema NÃO envia o link: mostra para copiar, e quem manda ao cliente é a pessoa.

import { useState } from "react";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { PLANOS_ANCORA, type EstadoDoCliente, type PlanoAncora } from "@/lib/integracoes/ancora";

export const TOM_ANCORA: Record<"neutro" | "andamento" | "ok" | "atencao", string> = {
  neutro: "border-border bg-muted text-muted-foreground",
  andamento: "border-border bg-card text-foreground",
  ok: "border-lone-success-border bg-lone-success-bg text-lone-success",
  atencao: "border-lone-warning-border bg-lone-warning-bg text-lone-warning",
};

export const diaAncora = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

export function assinaturaAncora(e: EstadoDoCliente): string | null {
  const a = e.empresa?.assinatura;
  if (!a) return null;
  if (a.sem_prazo) return "Parceria · sem prazo";
  if (a.status === "trial") return `Em teste até ${diaAncora(a.teste_ate)}`;
  if (a.status === "ativa") return "Assinatura ativa";
  if (a.status === "inadimplente") return "Pagamento pendente";
  if (a.status === "suspensa") return "Suspensa";
  if (a.status === "cancelada") return "Cancelada";
  return a.status;
}

/** O formulário de gerar o link, aberto na própria linha. */
export function GerarLinkAncora({ clientId, onFechar, onGerado }: { clientId: string; onFechar: () => void; onGerado: () => void }) {
  const [plano, setPlano] = useState<PlanoAncora>("base");
  const [dias, setDias] = useState(14);
  const [parceria, setParceria] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gerar = async () => {
    setEnviando(true); setErro(null);
    const r = await chamar<{ link: string }>("/api/ancora/link", { clientId, plano, diasDeTeste: dias, parceria });
    setEnviando(false);
    if (!r.ok) { setErro(r.erro ?? "Não consegui gerar o link."); return; }
    toast.success("Link gerado. Copie e envie ao cliente.");
    onGerado();
  };

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-lone-caption text-muted-foreground">
          Plano
          <span className="inline-flex rounded-lg border border-border bg-card p-0.5" role="radiogroup" aria-label="Plano">
            {PLANOS_ANCORA.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={plano === p.id} onClick={() => setPlano(p.id)}
                className={cn("rounded-md px-3 py-1.5 text-lone-caption font-medium transition-colors",
                  plano === p.id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted")}>
                {p.rotulo}
              </button>
            ))}
          </span>
        </label>
        <label className="flex flex-col gap-1 text-lone-caption text-muted-foreground">
          Dias de teste
          <input type="number" min={1} max={90} value={dias} disabled={parceria}
            onChange={(e) => setDias(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
            className="h-9 w-24 rounded-lg border border-border bg-card px-3 text-lone-body text-foreground disabled:opacity-50" />
        </label>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-lone-body text-foreground">
          <input type="checkbox" checked={parceria} onChange={(e) => setParceria(e.target.checked)} className="h-4 w-4" />
          Parceria (liberado sem prazo)
        </label>
      </div>
      <p className="text-lone-caption text-muted-foreground">
        {parceria
          ? "O cliente entra sem data final de teste e sem cartão. O prazo, quando existir, é definido depois no Âncora, e ele é avisado."
          : `O cliente entra com ${dias} dia${dias === 1 ? "" : "s"} de teste, sem cartão.`}{" "}
        O cadastro dele já vem preenchido com o que está na ficha; ele confere e cria a própria senha.
      </p>
      {erro && <p className="text-lone-caption font-medium text-lone-danger">{erro}</p>}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void gerar()} disabled={enviando}>
          <Link2 /> {enviando ? "Gerando…" : "Gerar link"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onFechar} disabled={enviando}>Cancelar</Button>
      </div>
    </div>
  );
}
