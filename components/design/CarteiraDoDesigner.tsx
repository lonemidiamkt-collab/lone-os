"use client";

// components/design/CarteiraDoDesigner.tsx — "Seus clientes" na tela do Designer (25/11/2026).
// A fila só mostra cliente que já tem arte. Aqui a carteira aparece inteira, com o que está em outra fila e um
// botão para trazer. Regra: lib/design/carteira.ts.

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRightLeft, ChevronDown, Loader2, Users } from "lucide-react";
import { useTeamMembers } from "@/lib/hooks/useTeamMembers";
import { carteiraDoDesigner, clientesComNomeParecido, comQuem, podePassarJunto, type ClienteDaCarteira } from "@/lib/design/carteira";
import { passarArtes } from "@/lib/design/passar-artes";
import type { ItemQuadro } from "@/lib/conteudo/quadro";
import { cn } from "@/lib/utils";

const CHAVE = "design:carteira-fechada";
const lerFechada = () => { try { return localStorage.getItem(CHAVE) === "1"; } catch { return false; } };

interface Props {
  pessoa: string;
  /** É a carteira de quem está olhando. */
  minha: boolean;
  papel: string | null;
  clientes: readonly ClienteDaCarteira[];
  itens: readonly ItemQuadro[];
}

export default function CarteiraDoDesigner({ pessoa, minha, papel, clientes, itens }: Props) {
  const { members } = useTeamMembers();
  const [fechada, setFechada] = useState(lerFechada);
  const [passando, setPassando] = useState<string | null>(null);
  const linhas = useMemo(() => carteiraDoDesigner(pessoa, clientes, itens), [pessoa, clientes, itens]);
  const parecidos = useMemo(() => clientesComNomeParecido(pessoa, clientes, members), [pessoa, clientes, members]);
  const pendentes = linhas.filter((l) => l.comOutros.length > 0);
  const primeiro = pessoa.split(" ")[0];

  const alternar = () => setFechada((v) => {
    try { localStorage.setItem(CHAVE, v ? "0" : "1"); } catch { /* sem armazenamento, só não lembra */ }
    return !v;
  });
  const passar = async (clientId: string, ids: string[]) => {
    setPassando(clientId);
    try { await passarArtes(clientId, ids, pessoa); } finally { setPassando(null); }
  };

  return (
    <section aria-label={minha ? "Seus clientes" : `Clientes de ${pessoa}`} className="rounded-xl border border-border bg-card p-4 space-y-3">
      <button type="button" onClick={alternar} aria-expanded={!fechada}
        className="flex w-full items-center gap-2 text-left rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Users size={14} className="text-primary shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">{minha ? "Seus clientes" : `Clientes de ${primeiro}`}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{linhas.length}</span>
        <ChevronDown size={14} className={cn("ml-auto text-muted-foreground transition-transform motion-reduce:transition-none", !fechada && "rotate-180")} aria-hidden="true" />
      </button>

      {pendentes.length > 0 && (
        <ul className="space-y-2" aria-label="Artes com outra pessoa">
          {pendentes.map((l) => {
            const levar = l.comOutros.filter((a) => podePassarJunto(papel, a));
            const presas = l.comOutros.length - levar.length;
            const comecadas = levar.filter((a) => a.fazendo).length;
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-lone-warning-border bg-lone-warning-bg px-3 py-2">
                <span className="min-w-0 flex-1 basis-56 text-xs text-foreground">
                  <span className="font-medium">{l.nome}</span>: {l.comOutros.length === 1 ? "1 arte aberta está" : `${l.comOutros.length} artes abertas estão`} em outra fila ({comQuem(l.comOutros)}).
                  {comecadas > 0 && <span className="block text-muted-foreground">{comecadas === 1 ? "1 já começou" : `${comecadas} já começaram`}.</span>}
                  {presas > 0 && papel === "designer" && <span className="block text-muted-foreground">{presas === 1 ? "1 já começou" : `${presas} já começaram`}: para pegar, abra a arte e assuma.</span>}
                </span>
                {levar.length > 0 && (papel !== "designer" || minha) && (
                  <button type="button" disabled={passando !== null} onClick={() => void passar(l.id, levar.map((a) => a.pedidoId))}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {passando === l.id ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <ArrowRightLeft size={13} aria-hidden="true" />}
                    {passando === l.id ? "Passando…" : `Passar ${levar.length} para ${minha ? "mim" : primeiro}`}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {parecidos.length > 0 && (
        <p className="text-xs text-foreground">
          <AlertTriangle size={12} className="mr-1 inline text-lone-warning" aria-hidden="true" />
          {parecidos.map((p) => `${p.nome} (${p.gravado})`).join(", ")}: o designer gravado parece {minha ? "você" : pessoa} com outra grafia. {papel === "designer" ? "Peça à gestão para escolher seu nome na ficha do cliente." : "Escolha o nome certo na ficha do cliente."}
        </p>
      )}

      {!fechada && (linhas.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum cliente tem {minha ? <>você (<span className="text-foreground">{pessoa}</span>)</> : pessoa} no campo Designer da ficha.{minha ? " Se devia ter, peça à gestão para conferir o nome." : ""}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
          {linhas.map((l) => (
            <li key={l.id}>
              <Link href={`/clients/${l.id}`}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 text-xs text-foreground hover:border-primary/40 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {l.nome}
                <span className="text-[11px] text-muted-foreground tabular-nums">{l.abertas ? `${l.abertas} ${l.abertas === 1 ? "arte" : "artes"}` : "sem arte aberta"}</span>
              </Link>
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}
