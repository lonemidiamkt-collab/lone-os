"use client";

// components/client/ficha/ContaMetaAds.tsx — vincular/desvincular a conta de anúncio do cliente.
// Estava nos "Dados Cadastrais" da Visão Geral. Sem a Meta conectada nesta sessão, a lista vem vazia
// e a tela DIZ isso (antes caía numa lista fictícia — mockAdAccounts, sempre vazia — e abria muda).

import { useEffect, useState } from "react";
import { Check, Facebook, Link2, Loader2, Settings, Unlink } from "lucide-react";
import { toast } from "sonner";
import { chamar } from "@/lib/api/chamar";
import { useMetaConnection, fetchAdAccounts } from "@/lib/meta/useMetaAds";
import type { ClientPatch } from "@/stores/useClientsStore";
import type { Client } from "@/lib/types";

interface Conta { id: string; name?: string; account_id?: string; currency?: string }

export default function ContaMetaAds({ client, updateClientData }: {
  client: Client;
  updateClientData: (id: string, data: ClientPatch) => Promise<void>;
}) {
  const meta = useMetaConnection();
  const [contas, setContas] = useState<Conta[]>([]);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [vinculando, setVinculando] = useState(false);

  useEffect(() => {
    if (!meta.connected || !meta.token) { setContas([]); return; }
    fetchAdAccounts(meta.token)
      .then((a: Conta[]) => setContas(a ?? []))
      .catch(() => setContas([]));
  }, [meta.connected, meta.token]);

  const filtradas = busca
    ? contas.filter((a) => a.name?.toLowerCase().includes(busca.toLowerCase()) || a.account_id?.includes(busca))
    : contas;

  const fechar = () => { setAberto(false); setBusca(""); };

  const desvincular = async () => {
    fechar();
    // null apaga; undefined sumia no JSON e o "Desvincular" não fazia nada.
    try {
      await updateClientData(client.id, { metaAdAccountId: null, metaAdAccountName: null });
      toast.success("Conta de anúncio desvinculada.");
    } catch (e) {
      toast.error(`Não consegui desvincular: ${e instanceof Error ? e.message : "erro"}`);
    }
  };

  const vincular = async (conta: Conta) => {
    fechar();
    setVinculando(true);
    try {
      // 1. clients (o gatilho espelha em ad_accounts)
      try {
        await updateClientData(client.id, { metaAdAccountId: conta.id, metaAdAccountName: conta.name ?? null });
      } catch (e) {
        toast.error(`Não consegui vincular a conta: ${e instanceof Error ? e.message : "erro"}`);
        return;
      }
      // 2. carteira de tráfego + saldo. 409 = já cadastrada, segue pro sync.
      const reg = await chamar("/api/traffic/ad-accounts", { clientId: client.id, metaAccountId: conta.id, accountName: conta.name });
      if (!reg.ok && reg.status !== 409) {
        toast.error(`Conta vinculada, mas não entrou na carteira de tráfego: ${reg.erro}`);
        return;
      }
      const sync = await chamar("/api/traffic/sync-balances", { accountIds: [conta.id] });
      if (sync.ok) toast.success(`${conta.name ?? conta.id} vinculada e sincronizada.`);
      else toast.error(`Conta vinculada, mas o saldo não sincronizou: ${sync.erro}`);
    } finally { setVinculando(false); }
  };

  return (
    <div className="relative flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-lone-body text-muted-foreground">
        {/* Cor da marca Facebook: exceção do design system (logo de terceiro). */}
        <Facebook size={13} className="text-[#1877F2]" aria-hidden="true" /> Conta Meta Ads
      </span>
      <span className="flex min-w-0 items-center gap-2">
        {/* Cai no ID quando não há nome: a conta pode ter sido vinculada por fora da UI. */}
        {client.metaAdAccountName || client.metaAdAccountId ? (
          <span className="flex min-w-0 items-center gap-1.5 text-lone-body text-foreground">
            {vinculando ? <Loader2 size={12} className="shrink-0 animate-spin" aria-hidden="true" /> : <Link2 size={12} className="shrink-0 text-primary" aria-hidden="true" />}
            <span className="truncate" title={client.metaAdAccountName || client.metaAdAccountId}>{client.metaAdAccountName || client.metaAdAccountId}</span>
          </span>
        ) : (
          <span className="text-lone-body italic text-muted-foreground">Nenhuma vinculada</span>
        )}
        <button onClick={() => setAberto((v) => !v)} title="Alterar conta de anúncio" aria-label="Alterar conta de anúncio"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Settings size={14} aria-hidden="true" />
        </button>
      </span>

      {aberto && (
        <>
          <div className="fixed inset-0 z-40" onClick={fechar} />
          <div className="absolute right-0 top-full z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover shadow-sm animate-fade-in">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <span className="text-xs font-medium text-popover-foreground">Vincular conta de anúncio</span>
              {client.metaAdAccountId && (
                <button onClick={desvincular} className="flex items-center gap-1 text-[10px] text-destructive">
                  <Unlink size={10} aria-hidden="true" /> Desvincular
                </button>
              )}
            </div>
            {contas.length > 4 && (
              <div className="border-b border-border p-2">
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conta..." autoFocus aria-label="Buscar conta"
                  className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring" />
              </div>
            )}
            <div className="max-h-48 overflow-y-auto py-1">
              {filtradas.length === 0 && (
                <div className="px-3 py-4 text-center">
                  <p className="text-xs text-muted-foreground">{busca ? "Nenhuma conta com esse nome." : "Nenhuma conta de anúncio disponível."}</p>
                  {!busca && (
                    <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                      Conecte a Meta em <span className="text-primary">Configurações → Integrações</span> para listar as contas do Gerenciador aqui.
                    </p>
                  )}
                </div>
              )}
              {filtradas.map((a) => {
                const sel = client.metaAdAccountId === a.id;
                return (
                  <button key={a.id} disabled={vinculando} onClick={() => vincular(a)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent disabled:opacity-50 ${sel ? "bg-primary/10" : ""}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-popover-foreground">{a.name}</span>
                      <span className="block text-[10px] text-muted-foreground">{a.account_id}{a.currency ? ` · ${a.currency}` : ""}</span>
                    </span>
                    {sel && <Check size={13} className="shrink-0 text-primary" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
