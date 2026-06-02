"use client";

import { useState } from "react";
import CardArtAttachments from "@/components/kanban/CardArtAttachments";
import type { CardAttachment } from "@/lib/types";

const CARD_A_ID = "f4287711-1d14-4334-aff5-124017876e03"; // ZZZ_TEST_FRONTEND_VAZIO_DELETAR
const CARD_B_ID = "5f6a1f3a-f39b-41a0-8508-abd630bac4df"; // ZZZ_TEST_FRONTEND_LEGADO_DELETAR
const LEGACY_URL =
  "https://painel.lonemidia.com/supabase/storage/v1/object/public/arts/4ada92dc-69d9-4fa6-8aa9-6f7a80e84b10/1777928146192.png";

export default function KanbanArtTestContent() {
  const [attsA, setAttsA] = useState<CardAttachment[]>([]);
  const [attsB, setAttsB] = useState<CardAttachment[]>([]);

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">Teste: Card Art Attachments</h1>
          <p className="text-sm text-muted-foreground">
            Página isolada para validar upload, paste, drag-and-drop e remoção de artes.
          </p>
          <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 space-y-1">
            <p><strong>Card A UUID (vazio):</strong> {CARD_A_ID}</p>
            <p><strong>Card B UUID (legado):</strong> {CARD_B_ID}</p>
            <p className="text-amber-400/70">Deletar esses cards no banco após testes finalizados.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8">
          {/* Exemplo A — Card vazio */}
          <div className="space-y-3">
            <div>
              <h2 className="font-semibold text-sm">Exemplo A — Card Vazio</h2>
              <p className="text-xs text-muted-foreground">
                Sem image_url, sem attachments. Testar: paste, drag-and-drop, file picker, limite, tipos inválidos.
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <CardArtAttachments
                cardId={CARD_A_ID}
                existingAttachments={[]}
                legacyImageUrl={null}
                onAttachmentsChange={(arts) => {
                  console.log("[Exemplo A] atts:", arts);
                  setAttsA(arts);
                }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground bg-muted/30 rounded-lg p-3">
              <strong>Estado atual ({attsA.length} artes):</strong>
              <pre className="mt-1 overflow-auto max-h-32 text-[9px]">
                {JSON.stringify(attsA, null, 2)}
              </pre>
            </div>
          </div>

          {/* Exemplo B — Card legado */}
          <div className="space-y-3">
            <div>
              <h2 className="font-semibold text-sm">Exemplo B — Card Legado</h2>
              <p className="text-xs text-muted-foreground">
                Tem image_url, sem card_attachments. Testar: renderiza capa legada, paste dispara migração silenciosa.
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <CardArtAttachments
                cardId={CARD_B_ID}
                existingAttachments={[]}
                legacyImageUrl={LEGACY_URL}
                onAttachmentsChange={(arts) => {
                  console.log("[Exemplo B] atts:", arts);
                  setAttsB(arts);
                }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground bg-muted/30 rounded-lg p-3">
              <strong>Estado atual ({attsB.length} artes):</strong>
              <pre className="mt-1 overflow-auto max-h-32 text-[9px]">
                {JSON.stringify(attsB, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        {/* Guia de testes */}
        <div className="bg-muted/20 border border-border rounded-xl p-5 space-y-2">
          <h3 className="text-sm font-semibold">Guia de testes (9 casos)</h3>
          <ol className="text-xs space-y-1 text-muted-foreground list-decimal list-inside">
            <li>Card A — Ctrl+V de imagem copiada → thumbnail aparece</li>
            <li>Card A — Drag-and-drop de imagem → thumbnail aparece</li>
            <li>Card A — Botão + → file picker → upload → thumbnail</li>
            <li>Card A — Cole 5 imagens, tente 6ª → erro "Limite de 5 artes"</li>
            <li>Card A — Arraste um PDF → erro "Tipo não suportado" (client-side)</li>
            <li>Card A — Arquivo &gt;10MB → erro "excede 10MB" (client-side)</li>
            <li>Card B — Componente renderiza image_url legada como primeira thumbnail</li>
            <li>Card B — Cole imagem → migração silenciosa → 2 attachments no banco</li>
            <li>Card A — Cole 2 artes, X em uma → confirmação → some</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
