"use client";

// components/planejamento/MixDeConteudo.tsx — MIX DE CONTEÚDO do cliente (Leva 7B, N15): formato e
// tema dos últimos 30 dias, o que foi ao ar no Instagram contra o que foi planejado no quadro. Fica
// no Planejamento, antes do calendário: é o insumo da decisão "o que falta nesse feed".

import { useEffect, useState } from "react";
import { PieChart, Loader } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { ROTULO_FORMATO } from "@/lib/conteudo/no-ar";
import {
  FORMATOS_DO_MIX, ROTULO_TEMA, TEMAS, leituraDoMix, pct, type LadoDoMix, type MixCliente,
} from "@/lib/conteudo/mix";

/** Barra empilhada de um lado do mix, com a legenda embaixo. Cores de categoria = chart-1..5. */
const COR = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5", "bg-muted-foreground", "bg-border"];

function Barra({ partes, total, rotulo }: { partes: { id: string; rotulo: string; n: number }[]; total: number; rotulo: string }) {
  const visiveis = partes.filter((p) => p.n > 0);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{rotulo}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">{total} post{total === 1 ? "" : "s"}</span>
      </div>
      {total === 0 ? (
        <div className="h-2.5 rounded-full bg-muted" />
      ) : (
        <div className="flex h-2.5 rounded-full overflow-hidden bg-muted" role="img"
          aria-label={visiveis.map((p) => `${p.rotulo} ${pct(p.n, total)}%`).join(", ")}>
          {partes.map((p, i) => p.n > 0 && (
            <div key={p.id} className={cn("h-full", COR[i % COR.length])} style={{ width: `${pct(p.n, total)}%` }} title={`${p.rotulo}: ${p.n} (${pct(p.n, total)}%)`} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {partes.map((p, i) => p.n > 0 && (
          <span key={p.id} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className={cn("w-2 h-2 rounded-sm", COR[i % COR.length])} aria-hidden="true" />
            {p.rotulo} <span className="tabular-nums text-foreground">{pct(p.n, total)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const formatos = (l: LadoDoMix) => FORMATOS_DO_MIX.map((f) => ({ id: f, rotulo: ROTULO_FORMATO[f], n: l.formatos[f] }));
const temas = (l: LadoDoMix) => TEMAS.map((t) => ({ id: t, rotulo: ROTULO_TEMA[t], n: l.temas[t] }));

export default function MixDeConteudo({ clientId }: { clientId: string }) {
  const [mix, setMix] = useState<MixCliente | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true); setErro(null); setMix(null);
    chamar<{ clientes: MixCliente[] }>(`/api/conteudo/mix?clientId=${clientId}`).then((r) => {
      if (!vivo) return;
      setCarregando(false);
      if (!r.ok) { setErro(r.erro); return; }
      setMix(r.data?.clientes?.[0] ?? null);
    });
    return () => { vivo = false; };
  }, [clientId]);

  const leitura = mix ? leituraDoMix(mix) : null;
  const temaReal = mix ? mix.real.total - mix.real.semCard : 0;

  return (
    <section aria-label="Mix de conteúdo" className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <PieChart size={15} className="text-primary" aria-hidden="true" />
        <h2 className="text-lone-h2 text-foreground">Mix de conteúdo</h2>
        <span className="text-xs text-muted-foreground">últimos 30 dias · no ar × planejado</span>
      </header>

      {carregando && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader size={14} className="animate-spin" aria-hidden="true" /> Contando os posts…</div>}
      {erro && <p className="text-sm text-destructive">Não consegui montar o mix: {erro}</p>}
      {!carregando && !erro && !mix && <p className="text-sm text-muted-foreground">Sem dados deste cliente.</p>}

      {mix && (
        <>
          {leitura && <p className="text-sm text-foreground rounded-lg border border-lone-warning-border bg-lone-warning-bg px-3 py-2">{leitura}</p>}
          {!mix.temInstagram && (
            <p className="text-xs text-muted-foreground">Instagram não vinculado — o lado “no ar” fica vazio até o perfil ser conectado.</p>
          )}
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              <p className="text-lone-eyebrow uppercase text-muted-foreground">Formato</p>
              <Barra rotulo="No ar (Instagram)" total={mix.real.total} partes={formatos(mix.real)} />
              <Barra rotulo="Planejado (quadro)" total={mix.planejado.total} partes={formatos(mix.planejado)} />
            </div>
            <div className="space-y-3">
              <p className="text-lone-eyebrow uppercase text-muted-foreground">Tema</p>
              <Barra rotulo="No ar (pelo card do post)" total={temaReal} partes={temas(mix.real)} />
              <Barra rotulo="Planejado (quadro)" total={mix.planejado.total} partes={temas(mix.planejado)} />
            </div>
          </div>
          {mix.real.semCard > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {mix.real.semCard > 1 ? `${mix.real.semCard} posts foram` : "1 post foi"} ao ar sem card no quadro — o tema não é conhecido e fica fora da conta de tema.
            </p>
          )}
        </>
      )}
    </section>
  );
}
