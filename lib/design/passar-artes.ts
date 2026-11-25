// Passar as artes abertas de um cliente para o designer da ficha — a chamada, o quadro e a oferta depois de salvar.

import { toast } from "sonner";
import { chamar } from "@/lib/api/chamar";
import { comQuem, type ArteComOutro } from "@/lib/design/carteira";
import { mesmaPessoa } from "@/lib/equipe/pessoa";

const ROTA = "/api/design-requests/passar";

/** Passa e conta o que houve (toast). `true` = algo mudou. */
export async function passarArtes(clientId: string, ids: string[]): Promise<boolean> {
  const r = await chamar<{ passadas: string[]; para: string; aviso?: string }>(ROTA, { clientId, ids });
  if (!r.ok || !r.data) {
    toast.error(`Não passei as artes: ${r.erro ?? "o servidor não respondeu."}`, { duration: Infinity, action: { label: "Tentar de novo", onClick: () => { void passarArtes(clientId, ids); } } });
    return false;
  }
  const { passadas, para, aviso } = r.data;
  if (passadas.length) {
    const { useContentStore, marcarMutacao } = await import("@/stores/useContentStore");
    marcarMutacao();
    const foi = new Set(passadas);
    useContentStore.setState((s) => ({ designRequests: s.designRequests.map((p) => (foi.has(p.id) ? { ...p, assignedDesigner: para } : p)) }));
    toast.success(passadas.length === 1 ? `1 arte passou para ${para}.` : `${passadas.length} artes passaram para ${para}.`);
  }
  if (aviso) toast.warning(aviso, { duration: 12_000 });
  else if (!passadas.length) toast.info("Nenhuma arte mudou: elas já estão com quem deviam.");
  return passadas.length > 0;
}

/** Salvou um designer novo no cliente: as artes que já estavam abertas continuam com quem estavam até alguém passar. */
export async function oferecerPassarArtes(clientId: string, de: string | null | undefined, para: string | null | undefined): Promise<void> {
  if (!(para ?? "").trim() || mesmaPessoa(de, para)) return;
  const r = await chamar<{ para: string | null; artes: ArteComOutro[] }>(`${ROTA}?clientId=${encodeURIComponent(clientId)}`);
  if (r.status === 403 || r.status === 401) return; // não é gestão: não oferece
  if (!r.ok || !r.data) { toast.warning("O designer mudou, mas não consegui ver se há artes abertas com outra pessoa. Confira no Designer.", { duration: 12_000 }); return; }
  const { artes, para: destino } = r.data;
  if (!artes.length || !destino) return;
  const n = artes.length;
  toast.info(`${n === 1 ? "1 arte aberta" : `${n} artes abertas`} deste cliente ${n === 1 ? "continua" : "continuam"} com outra pessoa: ${comQuem(artes)}.`, {
    duration: Infinity, action: { label: `Passar para ${destino}`, onClick: () => { void passarArtes(clientId, artes.map((a) => a.pedidoId)); } }, cancel: { label: "Deixar assim", onClick: () => {} },
  });
}
