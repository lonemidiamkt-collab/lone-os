// Passar as artes abertas de um cliente para o designer da ficha — a chamada, o quadro e a oferta depois de salvar.

import { toast } from "sonner";
import { chamar } from "@/lib/api/chamar";
import { comQuem, type ArteComOutro } from "@/lib/design/carteira";
import { mesmaPessoa } from "@/lib/equipe/pessoa";

const ROTA = "/api/design-requests/passar";
interface Passadas { passadas: string[]; jaEstavam: string[]; para: string; operacao: string | null; aviso?: string }

async function mostrarNoQuadro(donos: Map<string, string>) {
  if (!donos.size) return;
  const { useContentStore, marcarMutacao } = await import("@/stores/useContentStore");
  marcarMutacao();
  useContentStore.setState((s) => ({ designRequests: s.designRequests.map((p) => (donos.has(p.id) ? { ...p, assignedDesigner: donos.get(p.id) } : p)) }));
}

const artes = (n: number, um: string, varios: string) => (n === 1 ? `1 arte ${um}` : `${n} artes ${varios}`);

async function desfazer(operacao: string): Promise<void> {
  const r = await chamar<{ voltaram: { id: string; para: string }[]; aviso?: string }>(ROTA, { desfazer: operacao });
  if (!r.ok || !r.data) {
    toast.error(`Não desfiz: ${r.erro ?? "o servidor não respondeu."}`, { duration: Infinity, ...(r.status === 410 ? {} : { action: { label: "Tentar de novo", onClick: () => { void desfazer(operacao); } } }) });
    return;
  }
  await mostrarNoQuadro(new Map(r.data.voltaram.map((v) => [v.id, v.para])));
  if (r.data.voltaram.length) toast.success(`${artes(r.data.voltaram.length, "voltou", "voltaram")} para quem estava.`);
  if (r.data.aviso) toast.warning(r.data.aviso, { duration: 12_000 });
}

/** Passa e conta o que houve. `para` = quem a tela disse; se a ficha mudou no meio, o servidor recusa. */
export async function passarArtes(clientId: string, ids: string[], para: string): Promise<boolean> {
  const r = await chamar<Passadas>(ROTA, { clientId, ids, para });
  if (!r.ok || !r.data) {
    toast.error(`Não passei as artes: ${r.erro ?? "o servidor não respondeu."}`, {
      id: `passar-${clientId}`, duration: Infinity, ...(r.status === 409 || r.status === 403 ? {} : { action: { label: "Tentar de novo", onClick: () => { void passarArtes(clientId, ids, para); } } }),
    });
    return false;
  }
  const { passadas, jaEstavam, operacao, aviso } = r.data;
  await mostrarNoQuadro(new Map([...passadas, ...jaEstavam].map((id) => [id, r.data!.para])));
  if (passadas.length) {
    toast.success(`${artes(passadas.length, "passou", "passaram")} para ${r.data.para}.`, {
      id: `passar-${clientId}`, duration: 15_000, ...(operacao ? { action: { label: "Desfazer", onClick: () => { void desfazer(operacao); } } } : {}),
    });
  } else if (jaEstavam.length) toast.info(`${artes(jaEstavam.length, "já estava", "já estavam")} com ${r.data.para}.`, { id: `passar-${clientId}` });
  if (aviso) toast.warning(aviso, { duration: 12_000 });
  return passadas.length > 0;
}

/** Salvou um designer novo no cliente: as artes que já estavam abertas continuam com quem estavam até alguém passar. */
export async function oferecerPassarArtes(clientId: string, de: string | null | undefined, para: string | null | undefined): Promise<void> {
  if (!(para ?? "").trim() || mesmaPessoa(de, para)) return;
  const r = await chamar<{ para: string | null; artes: ArteComOutro[] }>(`${ROTA}?clientId=${encodeURIComponent(clientId)}`);
  if (r.status === 403 || r.status === 401) return; // não é gestão: não oferece
  if (!r.ok || !r.data) { toast.warning("O designer mudou, mas não consegui ver se há artes abertas com outra pessoa. Confira no Designer.", { duration: 12_000 }); return; }
  const { artes: lista, para: destino } = r.data;
  if (!lista.length || !destino) { toast.dismiss(`passar-${clientId}`); return; }
  const n = lista.length, fazendo = lista.filter((a) => a.fazendo).length;
  toast.info(`${n === 1 ? "1 arte aberta" : `${n} artes abertas`} deste cliente ${n === 1 ? "continua" : "continuam"} com outra pessoa: ${comQuem(lista)}${fazendo ? ` (${fazendo} já ${fazendo === 1 ? "começada" : "começadas"})` : ""}.`, {
    // Um aviso por cliente: trocar de novo substitui o anterior.
    id: `passar-${clientId}`, duration: Infinity,
    action: { label: `Passar para ${destino}`, onClick: () => { void passarArtes(clientId, lista.map((a) => a.pedidoId), destino); } },
    cancel: { label: "Deixar assim", onClick: () => {} },
  });
}
