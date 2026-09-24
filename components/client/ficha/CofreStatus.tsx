"use client";

// components/client/ficha/CofreStatus.tsx — o estado de cada acesso do cofre (Leva 7C, N24): ok /
// pendente / inválido, quem conferiu, o pedido por link para o cliente mandar a credencial e (gestão)
// quem revelou ou alterou senha. Mora dentro do "Cofre de Acessos" da aba Admin. A senha em si
// continua no cartão de cima, com a regra de revelar de sempre.

import { useCallback, useEffect, useState } from "react";
import { Check, History, Link as LinkIcon, Loader2, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { ROTULO_STATUS, type Plataforma, type StatusAcesso } from "@/lib/clients/cofre";
import { dataCurta, dataHoraCurta } from "./rotulos";

interface EstadoPlataforma {
  plataforma: Plataforma; rotulo: string; status: StatusAcesso; motivo: string; pedidoAberto: boolean; recebidoSemConferir: boolean;
  nota: string | null; conferidoPor: string | null; conferidoEm: string | null;
  pedido: { status: string; criadoEm: string; expiraEm: string; recebidoEm: string | null; url: string | null; por: string | null } | null;
}
interface Resposta {
  plataformas: EstadoPlataforma[];
  trilha: { quem: string; acao: string; campo: string; em: string }[] | null;
  migrationPendente: boolean;
}

const COR: Record<StatusAcesso, string> = {
  ok: "border-lone-success-border bg-lone-success-bg text-lone-success",
  pendente: "border-lone-warning-border bg-lone-warning-bg text-lone-warning",
  invalido: "border-lone-danger-border bg-lone-danger-bg text-lone-danger",
};

export default function CofreStatus({ clientId, telefone }: { clientId: string; telefone?: string | null }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [verTrilha, setVerTrilha] = useState(false);

  const carregar = useCallback(async () => {
    const r = await chamar<Resposta>(`/api/clients/${clientId}/acessos`);
    // Papel sem acesso ao cofre (designer, comercial): o bloco some, não vira erro.
    if (r.status === 403) { setDados({ plataformas: [], trilha: null, migrationPendente: false }); return; }
    if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui ler o estado dos acessos."); return; }
    setErro(null); setDados(r.data);
  }, [clientId]);
  useEffect(() => { void carregar(); }, [carregar]);

  const marcar = async (p: Plataforma, status: StatusAcesso) => {
    let nota: string | undefined;
    if (status === "invalido") nota = window.prompt("O que aconteceu? (ex.: senha trocada, pede código no celular do cliente)") ?? undefined;
    setOcupado(`${p}-${status}`);
    const r = await chamar(`/api/clients/${clientId}/acessos`, { acao: "status", plataforma: p, status, nota });
    setOcupado(null);
    if (!r.ok) { toast.error(r.erro ?? "Não consegui marcar."); return; }
    await carregar();
  };

  const pedir = async (p: Plataforma) => {
    setOcupado(`${p}-pedir`);
    const r = await chamar<{ url: string; reaproveitado: boolean; cliente: string; plataforma: string }>(`/api/clients/${clientId}/acessos`, { acao: "pedir", plataforma: p });
    setOcupado(null);
    if (!r.ok || !r.data) { toast.error(r.erro ?? "Não consegui gerar o link."); return; }
    const url = `${window.location.origin}${r.data.url}`;
    navigator.clipboard?.writeText(url).then(
      () => toast.success(r.data!.reaproveitado ? "O link aberto foi copiado de novo." : "Link copiado. Mande ao cliente."),
      () => toast.info(url),
    );
    await carregar();
  };

  const cancelar = async (p: Plataforma) => {
    setOcupado(`${p}-cancelar`);
    const r = await chamar(`/api/clients/${clientId}/acessos`, { acao: "cancelar", plataforma: p });
    setOcupado(null);
    if (!r.ok) { toast.error(r.erro ?? "Não consegui cancelar o link."); return; }
    await carregar();
  };

  if (erro) return <p className="text-xs text-muted-foreground">{erro}</p>;
  if (!dados) return <div className="h-16 animate-pulse rounded-lg bg-muted" />;
  if (!dados.plataformas.length) return null;

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">Estado dos acessos</p>
        {dados.trilha && (
          <button onClick={() => setVerTrilha((v) => !v)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <History size={12} aria-hidden="true" /> {verTrilha ? "Esconder" : "Quem revelou ou alterou"}
          </button>
        )}
      </div>
      {dados.migrationPendente && (
        <p className="text-[11px] text-lone-warning">O estado ainda não é gravado: falta aplicar a migration do cofre (20260926100000).</p>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border">
        {dados.plataformas.map((p) => {
          const linkUrl = p.pedido?.url ? `${typeof window !== "undefined" ? window.location.origin : ""}${p.pedido.url}` : null;
          const wa = linkUrl && telefone
            ? `https://wa.me/55${telefone.replace(/\D/g, "").replace(/^55/, "")}?text=${encodeURIComponent(`Olá! Para a gente cuidar do ${p.rotulo}, mande o acesso por este link seguro (vale uma vez): ${linkUrl}`)}`
            : null;
          return (
            <li key={p.plataforma} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-foreground">{p.rotulo}</span>
                <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", COR[p.status])}>{ROTULO_STATUS[p.status]}</span>
                <span className="text-[11px] text-muted-foreground">{p.motivo}</span>
              </div>
              {(p.conferidoPor || p.nota) && (
                <p className="text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
                  {p.conferidoPor ? `${p.conferidoPor} em ${dataCurta(p.conferidoEm)}` : ""}{p.nota ? `${p.conferidoPor ? " · " : ""}${p.nota}` : ""}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                {(["ok", "pendente", "invalido"] as const).map((s) => (
                  <button key={s} onClick={() => marcar(p.plataforma, s)} disabled={!!ocupado}
                    aria-pressed={p.status === s && !p.recebidoSemConferir}
                    title={p.status === s ? "Marcar de novo registra a conferência de hoje" : undefined}
                    className={cn("inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors disabled:opacity-40",
                      p.status === s && !p.recebidoSemConferir ? COR[s] : "border-border text-muted-foreground hover:bg-accent hover:text-foreground")}>
                    {ocupado === `${p.plataforma}-${s}` ? <Loader2 size={11} className="animate-spin" aria-hidden="true" />
                      : s === "ok" ? <Check size={11} aria-hidden="true" /> : s === "invalido" ? <X size={11} aria-hidden="true" /> : null}
                    {ROTULO_STATUS[s]}
                  </button>
                ))}
                <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
                <button onClick={() => pedir(p.plataforma)} disabled={!!ocupado}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-foreground transition-colors hover:bg-accent disabled:opacity-40">
                  {ocupado === `${p.plataforma}-pedir` ? <Loader2 size={11} className="animate-spin" aria-hidden="true" /> : <LinkIcon size={11} aria-hidden="true" />}
                  {p.pedidoAberto ? "Copiar link do pedido" : "Pedir ao cliente por link"}
                </button>
                {p.pedidoAberto && wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer"
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-whatsapp transition-colors hover:bg-accent">
                    <MessageCircle size={11} aria-hidden="true" /> Rascunho no WhatsApp do contato
                  </a>
                )}
                {p.pedidoAberto && (
                  <button onClick={() => cancelar(p.plataforma)} disabled={!!ocupado}
                    className="h-7 rounded-md px-2 text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-40">Cancelar link</button>
                )}
              </div>
              {p.pedido && p.pedidoAberto && (
                <p className="text-[11px] text-muted-foreground">Link aberto por {p.pedido.por ?? "—"} em {dataCurta(p.pedido.criadoEm)} · vale até {dataCurta(p.pedido.expiraEm)}</p>
              )}
            </li>
          );
        })}
      </ul>

      {verTrilha && dados.trilha && (
        <div className="rounded-lg bg-muted p-3">
          {dados.trilha.length === 0 ? <p className="text-[11px] text-muted-foreground">Ninguém revelou ou alterou senha deste cliente ainda.</p> : (
            <ul className="space-y-1">
              {dados.trilha.map((t, i) => (
                <li key={`${t.em}-${i}`} className="text-[11px] text-muted-foreground">
                  <span className="text-foreground">{t.quem}</span> {t.acao} a senha do {t.campo} · {dataHoraCurta(t.em)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
