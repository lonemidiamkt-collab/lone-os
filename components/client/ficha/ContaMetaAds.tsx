"use client";

// components/client/ficha/ContaMetaAds.tsx — vincular/desvincular a conta de anúncio do cliente.
// Estava nos "Dados Cadastrais" da Visão Geral. Sem a Meta conectada nesta sessão, a lista vem vazia
// e a tela DIZ isso (antes caía numa lista fictícia — mockAdAccounts, sempre vazia — e abria muda).
//
// 21/10/2026 (auditoria de erro recuperável, 3.3): a lista mostrava todas as contas do Gerenciador
// iguais e vinculava num clique — a conta de OUTRO cliente vinha para cá em silêncio (alerta de
// verba, digest e portal leem ad_accounts: os números de um iam para o outro). Agora cada conta diz
// de quem é; conta de outro cliente pede confirmação ("transferir para cá") e o servidor recusa sem
// ela (409). Falha da Meta ao listar aparece como erro com "Tentar de novo", não como "conecte a Meta".

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Check, Facebook, Link2, Loader2, RefreshCw, Settings, Unlink } from "lucide-react";
import { toast } from "sonner";
import { chamar } from "@/lib/api/chamar";
import { useMetaConnection, fetchAdAccounts, TokenExpiredError } from "@/lib/meta/useMetaAds";
import { consequenciaDaTransferencia, descreverDono, normalizarContaMeta } from "@/lib/clients/conta-meta";
import { useClientsStore, type ClientPatch } from "@/stores/useClientsStore";
import type { Client } from "@/lib/types";

interface Conta { id: string; name?: string; account_id?: string; currency?: string }
interface Dono { clientId: string; nome: string; ativo: boolean; naFicha: boolean; noEspelho: boolean }
type Lista =
  | { estado: "carregando" }
  | { estado: "sem_meta"; vencida: boolean }
  | { estado: "erro"; erro: string }
  | { estado: "ok"; contas: Conta[] };

export default function ContaMetaAds({ client, updateClientData }: {
  client: Client;
  updateClientData: (id: string, data: ClientPatch) => Promise<void>;
}) {
  const meta = useMetaConnection();
  const patchClientLocal = useClientsStore((s) => s.patchClientLocal);
  const [lista, setLista] = useState<Lista>({ estado: "carregando" });
  const [donos, setDonos] = useState<Record<string, Dono[]> | null>(null);
  const [erroDonos, setErroDonos] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [vinculando, setVinculando] = useState(false);
  // Conta de outro cliente escolhida: a confirmação aparece no lugar da lista.
  const [confirmar, setConfirmar] = useState<{ conta: Conta; texto: string } | null>(null);

  // Lista lida ao abrir (e no "Tentar de novo"): de quem é cada conta muda, e a Meta pode ter caído.
  useEffect(() => {
    if (!aberto) return;
    if (meta.loading) { setLista({ estado: "carregando" }); return; }
    if (!meta.connected || !meta.token) { setLista({ estado: "sem_meta", vencida: meta.tokenExpired }); return; }
    let vivo = true;
    setLista({ estado: "carregando" });
    fetchAdAccounts(meta.token)
      .then((a: Conta[]) => { if (vivo) setLista({ estado: "ok", contas: a ?? [] }); })
      .catch((e: unknown) => {
        if (!vivo) return;
        setLista({
          estado: "erro",
          erro: e instanceof TokenExpiredError
            ? "A conexão com a Meta venceu ou perdeu permissão. Reconecte em Configurações → Integrações."
            : `Não consegui listar as contas da Meta agora${e instanceof Error && e.message ? ` (${e.message})` : ""}.`,
        });
      });
    chamar<{ donos: Record<string, Dono[]> }>("/api/clients/contas-meta").then((r) => {
      if (!vivo) return;
      if (r.ok && r.data) { setDonos(r.data.donos); setErroDonos(null); }
      else { setDonos(null); setErroDonos(r.erro ?? "Não consegui ver de quem é cada conta."); }
    });
    return () => { vivo = false; };
  }, [aberto, meta.loading, meta.connected, meta.token, meta.tokenExpired, tentativa]);

  const contas = lista.estado === "ok" ? lista.contas : [];
  const filtradas = busca
    ? contas.filter((a) => a.name?.toLowerCase().includes(busca.toLowerCase()) || a.account_id?.includes(busca))
    : contas;
  const outrosDonos = (conta: Conta) =>
    (donos?.[normalizarContaMeta(conta.id) ?? ""] ?? []).filter((d) => d.clientId !== client.id);
  const ehDeste = (conta: Conta) => normalizarContaMeta(client.metaAdAccountId) === normalizarContaMeta(conta.id);

  const fechar = () => { setAberto(false); setBusca(""); setConfirmar(null); };

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

  const escolher = (conta: Conta) => {
    if (ehDeste(conta)) { fechar(); return; }
    const outros = outrosDonos(conta);
    if (outros.length) {
      setConfirmar({ conta, texto: `A conta ${conta.name ?? conta.id} ${outros.map((d) => descreverDono(d)).join("; ")}. ${consequenciaDaTransferencia(outros)}` });
      return;
    }
    vincular(conta, false);
  };

  const vincular = async (conta: Conta, transferir: boolean) => {
    setVinculando(true);
    try {
      // A rota grava a ficha E o espelho em ad_accounts (alerta de verba, saldo, portal) e recusa
      // conta de outro cliente sem `transferirContaMeta`. Não passa pelo store otimista: o 409 precisa
      // voltar inteiro para virar a confirmação abaixo.
      const r = await chamar<{ transferidaDe?: { clientId: string; nome: string }[] }>("/api/clients/update", {
        id: client.id, metaAdAccountId: conta.id, metaAdAccountName: conta.name ?? null,
        ...(transferir ? { transferirContaMeta: true } : {}),
      });
      if (!r.ok) {
        // O servidor sabe de um dono que a lista não mostrou (ou a lista de donos falhou): confirma.
        if (r.status === 409 && !transferir) { setAberto(true); setConfirmar({ conta, texto: r.erro ?? "Esta conta é de outro cliente." }); return; }
        toast.error(`Não consegui vincular a conta: ${r.erro}`);
        return;
      }
      fechar();
      patchClientLocal(client.id, { metaAdAccountId: conta.id, metaAdAccountName: conta.name ?? null });
      for (const d of r.data?.transferidaDe ?? []) patchClientLocal(d.clientId, { metaAdAccountId: null, metaAdAccountName: null });
      const de = r.data?.transferidaDe?.map((d) => d.nome).join(" e ");
      const sync = await chamar("/api/traffic/sync-balances", { accountIds: [conta.id] });
      const nome = conta.name ?? conta.id;
      if (sync.ok) toast.success(de ? `${nome} transferida de ${de} e sincronizada.` : `${nome} vinculada e sincronizada.`);
      else toast.error(`${de ? `Conta transferida de ${de}` : "Conta vinculada"}, mas o saldo não sincronizou: ${sync.erro}`);
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
        <button type="button" onClick={() => (aberto ? fechar() : setAberto(true))} title="Alterar conta de anúncio" aria-label="Alterar conta de anúncio" aria-expanded={aberto}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Settings size={14} aria-hidden="true" />
        </button>
      </span>

      {aberto && (
        <>
          <div className="fixed inset-0 z-40" onClick={fechar} />
          <div className="absolute right-0 top-full z-50 mt-1 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover shadow-sm animate-fade-in">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <span className="text-xs font-medium text-popover-foreground">Vincular conta de anúncio</span>
              {client.metaAdAccountId && !confirmar && (
                <button type="button" onClick={desvincular} className="flex items-center gap-1 text-[10px] text-destructive">
                  <Unlink size={10} aria-hidden="true" /> Desvincular
                </button>
              )}
            </div>

            {confirmar ? (
              <div className="space-y-3 p-3" role="alertdialog" aria-label="Transferir conta de outro cliente">
                <p className="flex gap-2 text-xs leading-relaxed text-popover-foreground">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-lone-warning" aria-hidden="true" />
                  <span>{confirmar.texto}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={vinculando} onClick={() => vincular(confirmar.conta, true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                    {vinculando ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <ArrowRightLeft size={13} aria-hidden="true" />}
                    Transferir para {client.nomeFantasia || client.name}
                  </button>
                  <button type="button" disabled={vinculando} onClick={() => setConfirmar(null)}
                    className="inline-flex h-8 items-center rounded-lg px-3 text-xs text-muted-foreground hover:text-foreground">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                {contas.length > 4 && (
                  <div className="border-b border-border p-2">
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conta..." autoFocus aria-label="Buscar conta"
                      className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring" />
                  </div>
                )}
                {lista.estado === "ok" && erroDonos && (
                  <p className="border-b border-border px-3 py-2 text-[10px] leading-relaxed text-lone-warning">
                    Não consegui ver de quem é cada conta ({erroDonos}). Se a escolhida for de outro cliente, o painel pede confirmação antes de trocar.
                  </p>
                )}
                <div className="max-h-56 overflow-y-auto py-1">
                  {lista.estado === "carregando" && (
                    <div className="flex items-center justify-center gap-2 px-3 py-4 text-xs text-muted-foreground" role="status">
                      <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Lendo as contas da Meta…
                    </div>
                  )}
                  {lista.estado === "erro" && (
                    <div className="space-y-2 px-3 py-4 text-center" role="alert">
                      <p className="text-xs text-lone-danger">{lista.erro}</p>
                      <button type="button" onClick={() => setTentativa((n) => n + 1)}
                        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] text-foreground hover:bg-accent">
                        <RefreshCw size={12} aria-hidden="true" /> Tentar de novo
                      </button>
                    </div>
                  )}
                  {lista.estado === "sem_meta" && (
                    <div className="px-3 py-4 text-center">
                      <p className="text-xs text-muted-foreground">{lista.vencida ? "A conexão com a Meta venceu." : "A Meta não está conectada."}</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                        {lista.vencida ? "Reconecte" : "Conecte"} em <span className="text-primary">Configurações → Integrações</span> para listar as contas do Gerenciador aqui.
                      </p>
                    </div>
                  )}
                  {lista.estado === "ok" && filtradas.length === 0 && (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                      {busca ? "Nenhuma conta com esse nome." : "O Gerenciador conectado não tem nenhuma conta de anúncio."}
                    </p>
                  )}
                  {lista.estado === "ok" && filtradas.map((a) => {
                    const sel = ehDeste(a);
                    const outros = outrosDonos(a);
                    return (
                      <button type="button" key={a.id} disabled={vinculando} onClick={() => escolher(a)}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent disabled:opacity-50 ${sel ? "bg-primary/10" : ""}`}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-popover-foreground">{a.name}</span>
                          <span className="block text-[10px] text-muted-foreground">{a.account_id}{a.currency ? ` · ${a.currency}` : ""}</span>
                          {outros.length > 0 && (
                            <span className="block truncate text-[10px] text-lone-warning" title={outros.map((d) => descreverDono(d)).join("; ")}>
                              {outros.map((d) => descreverDono(d)).join("; ")}
                            </span>
                          )}
                        </span>
                        {sel && <Check size={13} className="shrink-0 text-primary" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
