"use client";

// components/client/ficha/CreativeWallet.tsx — banco de referências visuais da marca (paleta,
// tipografia, logo, inspiração). Era a aba "Creative Wallet"; agora mora em Marca & Briefing.
// O upload vai pro storage de verdade (URL definitiva), não um blob: que só valia naquela aba.

import { Image as ImageIcon, Mic, Palette, Star, Upload, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { todaySP } from "@/lib/utils";
import type { CreativeAsset } from "@/lib/types";
import { Vazio } from "./Secao";

const TIPOS: Record<CreativeAsset["type"], { rotulo: string; plural: string; icone: LucideIcon }> = {
  reference: { rotulo: "Referência", plural: "Referências", icone: ImageIcon },
  palette: { rotulo: "Paleta", plural: "Paletas", icone: Palette },
  typography: { rotulo: "Tipografia", plural: "Tipografias", icone: Mic },
  logo: { rotulo: "Logo", plural: "Logos", icone: Star },
};
const ORDEM: CreativeAsset["type"][] = ["reference", "palette", "typography", "logo"];

export default function CreativeWallet({ clientId, currentUser }: { clientId: string; currentUser: string }) {
  const assets = useOperationalStore((s) => s.creativeAssets[clientId]) ?? [];
  const addCreativeAsset = useOperationalStore((s) => s.addCreativeAsset);

  const subir = async (e: React.ChangeEvent<HTMLInputElement>, type: CreativeAsset["type"]) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("clientId", clientId);
      fd.append("docType", "wallet");
      const res = await authedFetch("/api/onboarding/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        await addCreativeAsset({ clientId, type, url: data.url, label: file.name.replace(/\.[^.]+$/, ""), uploadedBy: currentUser, uploadedAt: todaySP() });
        toast.success("Referência salva.");
      } else {
        toast.error(data.error || "Não foi possível subir o arquivo.");
      }
    } catch {
      toast.error("Falha no upload. Verifique a conexão.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {ORDEM.map((type) => {
          const t = TIPOS[type];
          return (
            <label key={type} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground transition-colors hover:bg-accent">
              <Upload size={13} aria-hidden="true" /> {t.rotulo}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => subir(e, type)} />
            </label>
          );
        })}
      </div>

      {assets.length === 0 && <Vazio>Nenhuma referência visual ainda. Suba inspirações, paletas e tipografias pelos botões acima.</Vazio>}

      {ORDEM.map((type) => {
        const lista = assets.filter((a) => a.type === type);
        if (!lista.length) return null;
        const t = TIPOS[type];
        const Icone = t.icone;
        return (
          <div key={type}>
            <p className="mb-2 flex items-center gap-1.5 text-lone-body text-foreground">
              <Icone size={14} className="text-muted-foreground" aria-hidden="true" /> {t.plural}
              <span className="text-lone-caption text-muted-foreground">({lista.length})</span>
            </p>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {lista.map((a) => (
                <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"
                  className="group overflow-hidden rounded-xl border border-border bg-background transition-colors hover:border-primary/30">
                  <div className="aspect-video w-full overflow-hidden bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.label ?? t.rotulo} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-lone-caption font-medium text-foreground" title={a.label ?? t.rotulo}>{a.label ?? t.rotulo}</p>
                    <p className="text-lone-caption text-muted-foreground">{a.uploadedBy} · {a.uploadedAt}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
