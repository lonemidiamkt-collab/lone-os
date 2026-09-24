"use client";

// components/client/ficha/CicloDeVida.tsx — pausar, retomar e encerrar a parceria, na ficha.
// Pausado continua na carteira do time mas não recebe nada (lib/clients/pausa.ts); encerrar arquiva
// com o motivo obrigatório (EncerrarParceria → /api/clients/[id]/lifecycle). Só gestão.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import EncerrarParceria from "@/components/EncerrarParceria";
import { chamar } from "@/lib/api/chamar";
import { estaPausado, rotuloPausa } from "@/lib/clients/pausa";
import { useClientsStore } from "@/stores/useClientsStore";
import type { Client } from "@/lib/types";

export default function CicloDeVida({ client: c }: { client: Client }) {
  const router = useRouter();
  const patchClientLocal = useClientsStore((s) => s.patchClientLocal);
  const [pausando, setPausando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ate, setAte] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const pausado = estaPausado({ paused_at: c.pausedAt, paused_until: c.pausedUntil });
  const rotulo = rotuloPausa({ paused_at: c.pausedAt, paused_until: c.pausedUntil, paused_reason: c.pausedReason });

  const pausar = async () => {
    if (motivo.trim().length < 3) return;
    setOcupado(true);
    const r = await chamar(`/api/clients/${c.id}/lifecycle`, { action: "pause", reason: motivo.trim(), until: ate || undefined });
    setOcupado(false);
    if (!r.ok) { toast.error(r.erro ?? "Não consegui pausar."); return; }
    patchClientLocal(c.id, { pausedAt: new Date().toISOString(), pausedReason: motivo.trim(), pausedUntil: ate || null });
    setPausando(false); setMotivo(""); setAte("");
    toast.success("Cliente pausado.");
  };

  const retomar = async () => {
    setOcupado(true);
    const r = await chamar(`/api/clients/${c.id}/lifecycle`, { action: "resume" });
    setOcupado(false);
    if (!r.ok) { toast.error(r.erro ?? "Não consegui retomar."); return; }
    patchClientLocal(c.id, { pausedAt: null, pausedReason: null, pausedUntil: null });
    toast.success("Cliente retomado.");
  };

  const campo = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring";
  return (
    <div className="space-y-4">
      <p className="text-lone-body text-muted-foreground">
        {c.active === false ? "Parceria encerrada — o cliente está nos Arquivados."
          : pausado ? `${rotulo}. Sem relatório, mensagem no grupo, alerta de verba e portal até retomar.`
          : "Ativo: recebe tudo (relatórios, mensagens no grupo, alertas e portal)."}
      </p>

      {c.active !== false && (
        <div className="flex flex-wrap gap-2">
          {pausado ? (
            <button onClick={retomar} disabled={ocupado}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50">
              <Play size={15} aria-hidden="true" /> Retomar cliente
            </button>
          ) : (
            <button onClick={() => setPausando((v) => !v)} disabled={ocupado}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50">
              <Pause size={15} aria-hidden="true" /> Pausar temporariamente
            </button>
          )}
          <button onClick={() => setEncerrando(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:border-lone-warning-border hover:text-lone-warning">
            <Archive size={15} aria-hidden="true" /> Encerrar parceria
          </button>
        </div>
      )}

      {pausando && !pausado && (
        <div className="max-w-md space-y-3 rounded-xl border border-border bg-background p-4">
          <label className="block space-y-1">
            <span className="text-lone-caption text-muted-foreground">Motivo (o time lê isto)</span>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus className={campo}
              placeholder="ex.: férias do cliente · pagamento em atraso · campanha suspensa" />
          </label>
          <label className="block space-y-1">
            <span className="text-lone-caption text-muted-foreground">Retomar em (opcional — volta sozinho)</span>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={campo} />
          </label>
          <div className="flex gap-2">
            <button onClick={pausar} disabled={ocupado || motivo.trim().length < 3}
              className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
              {ocupado ? "Pausando..." : "Pausar"}
            </button>
            <button onClick={() => setPausando(false)} className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
          </div>
        </div>
      )}

      {encerrando && (
        <EncerrarParceria clientId={c.id} clientName={c.nomeFantasia || c.name}
          aoFechar={() => setEncerrando(false)}
          // Concluído, o cliente saiu da lista de ativos: voltar para /clients evita a ficha mostrar
          // um cliente que o store já não tem.
          aoConcluir={() => router.push("/clients")} />
      )}
    </div>
  );
}
