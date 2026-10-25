"use client";

// O interruptor geral do Loninho, no topo da Central de Agentes. Desligar passa por confirmação na
// própria linha (com "por quanto tempo"); religar é um clique — é o desfazer.

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Pause, Play, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { dataHora } from "@/lib/automacoes/formato";
import type { InterruptorLoninho as Estado } from "@/lib/agentes/loninho-server";

type Duracao = "religar" | "1h" | "4h" | "amanha";

const DURACOES: { chave: Duracao; rotulo: string }[] = [
  { chave: "religar", rotulo: "até alguém religar" },
  { chave: "1h", rotulo: "por 1 hora" },
  { chave: "4h", rotulo: "por 4 horas" },
  { chave: "amanha", rotulo: "até amanhã, 8h" },
];

/** Fim da pausa em ISO, ou null para "até alguém religar". */
function fimDaPausa(d: Duracao, agora = new Date()): string | null {
  if (d === "religar") return null;
  if (d === "1h") return new Date(agora.getTime() + 3600_000).toISOString();
  if (d === "4h") return new Date(agora.getTime() + 4 * 3600_000).toISOString();
  // Amanhã às 8h de São Paulo (UTC−3, sem horário de verão desde 2019) = 11h UTC.
  const sp = new Date(agora.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate() + 1, 11, 0)).toISOString();
}

export default function InterruptorLoninho({ estado, onMudou }: { estado: Estado | null; onMudou: () => void }) {
  const [confirmar, setConfirmar] = useState(false);
  const [duracao, setDuracao] = useState<Duracao>("religar");
  const [salvando, setSalvando] = useState(false);

  const salvar = async (ligado: boolean) => {
    setSalvando(true);
    const ate = ligado ? null : fimDaPausa(duracao);
    const r = await chamar<{ aviso?: { enviado: boolean; erro?: string } }>("/api/system/agentes/loninho", { ligado, ...(ate ? { ate } : {}) });
    setSalvando(false);
    if (!r.ok) { toast.error(r.erro ?? "Não consegui salvar."); return; }
    setConfirmar(false);
    toast.success(ligado ? "Loninho religado." : ate ? `Loninho pausado até ${dataHora(ate)}.` : "Loninho desligado.");
    const aviso = r.data?.aviso;
    if (aviso && !aviso.enviado && aviso.erro) toast.warning(`O aviso no grupo do time não saiu (${aviso.erro}). Avise o time por lá.`, { duration: 10000 });
    onMudou();
  };

  const ligado = estado?.ligado ?? null;
  const quem = estado?.alteradoPor ? ` por ${estado.alteradoPor}${estado.alteradoEm ? ` em ${dataHora(estado.alteradoEm)}` : ""}` : "";
  const titulo = ligado === null ? "Não consegui ler o interruptor do Loninho"
    : ligado ? "O Loninho está ligado"
      : estado?.pausadoAte ? `O Loninho está pausado até ${dataHora(estado.pausadoAte)}` : "O Loninho está desligado";

  return (
    <section
      aria-labelledby="loninho-titulo"
      className={cn(
        "rounded-xl border p-4",
        ligado === false ? "border-lone-warning-border bg-lone-warning-bg" : "border-border bg-card",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span
          aria-hidden
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            ligado ? "border border-lone-success-border bg-lone-success-bg text-lone-success"
              : ligado === false ? "border border-lone-warning-border bg-background text-lone-warning" : "bg-muted text-muted-foreground",
          )}
        >
          {ligado === false ? <Pause size={16} /> : <Power size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="loninho-titulo" className="text-sm font-semibold text-foreground">{titulo}</h2>
          <p className="text-lone-caption text-muted-foreground">
            {ligado === false && quem ? `Alterado${quem}. ` : ligado && estado?.alteradoPor ? `Religado${quem}. ` : ""}
            Este interruptor desliga a leitura dos grupos pelo WhatsApp: clientes, time e vendas. As rotinas agendadas têm o interruptor delas na Central de Automações.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {ligado === false ? (
            <Button size="sm" onClick={() => void salvar(true)} disabled={salvando}>
              {salvando ? <Loader2 className="animate-spin" /> : <Play />}
              Religar o Loninho
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirmar(true)} disabled={salvando || ligado === null || confirmar}>
              <Pause />
              Desligar o Loninho
            </Button>
          )}
        </div>
      </div>

      {confirmar && ligado !== false && (
        <div role="alert" className="mt-3 flex flex-col gap-3 rounded-lg border border-lone-warning-border bg-lone-warning-bg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-lone-warning" />
            <p className="text-xs text-foreground">
              Desligado, o Loninho <strong>não lê nenhuma mensagem</strong> dos grupos: não sugere pedido, não transcreve áudio, não responde o time.
              O que chegar nesse intervalo <strong>não é lido depois</strong>. O grupo do time recebe um aviso.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="loninho-duracao" className="text-xs text-muted-foreground">Desligar</label>
            <select
              id="loninho-duracao" value={duracao} onChange={(e) => setDuracao(e.target.value as Duracao)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {DURACOES.map((d) => <option key={d.chave} value={d.chave}>{d.rotulo}</option>)}
            </select>
            <div className="flex gap-2 sm:ml-auto">
              <Button variant="ghost" size="sm" onClick={() => setConfirmar(false)} disabled={salvando}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={() => void salvar(false)} disabled={salvando}>
                {salvando && <Loader2 className="animate-spin" />}
                Desligar
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
