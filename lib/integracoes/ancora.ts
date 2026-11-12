// lib/integracoes/ancora.ts — O CONECTOR DO ÂNCORA CRM. Módulo PURO (sem rede, sem banco).
//
// Roberto (12/11/2026): "entrar no Lone OS, numa aba Âncora, e mandar só um link de cadastro para o cliente;
// os dados dele a gente já tem". O Âncora expõe uma porta entre sistemas (/api/parceiro/*) e este é o lado de
// cá: monta o pedido de link com o que o cadastro do cliente já tem e lê o estado de volta.
//
// A assinatura é a MESMA do cadastro do site e da porta do financeiro (lib/crm/site-lead.ts → `assinar`):
//   x-lone-timestamp: epoch em ms · x-lone-signature: sha256=hmac(segredo, `${timestamp}.${mensagem}`)
// `mensagem` é o corpo cru no POST e, no GET, `GET <caminho>?<query em forma canônica>`. A forma canônica
// (parâmetros em ordem, codificados por URLSearchParams) existe porque a query crua não chega igual do outro
// lado — `refs=a,b` vira `refs=a%2Cb` — e a assinatura deixava de conferir. O Âncora tem a gêmea desta função
// (lib/parceiro/assinatura.ts de lá); as duas têm de continuar idênticas.
//
// O SISTEMA NÃO ENVIA NADA AO CLIENTE. A aba mostra o link; quem manda é a pessoa.

export const PLANOS_ANCORA = [
  { id: "base", rotulo: "Base" },
  { id: "tracao", rotulo: "Tração" },
  { id: "escala", rotulo: "Escala" },
] as const;
export type PlanoAncora = (typeof PLANOS_ANCORA)[number]["id"];

export type EstadoAncora = "sem_convite" | "link_gerado" | "vencido" | "cadastrou";

/** O que a porta devolve por cliente (GET /api/parceiro/convites). */
export interface EstadoDoCliente {
  ref_externa: string;
  estado: EstadoAncora;
  link: string | null;
  expira_em: string | null;
  gerado_em: string | null;
  cadastrou_em: string | null;
  plano: string | null;
  parceria: boolean;
  empresa: null | {
    nome: string | null;
    assinatura: { status: string; teste_ate: string | null; sem_prazo: boolean } | null;
    whatsapp_conectado: boolean;
    acesso_da_agencia: boolean;
  };
}

/** Só o que o conector lê do cadastro do cliente (nomes iguais aos das colunas de `clients`). */
export interface ClienteParaAncora {
  id: string;
  name: string | null;
  nome_fantasia: string | null;
  razao_social: string | null;
  cnpj: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  contact_phone: string | null;
  instagram_user: string | null;
  endereco_cidade: string | null;
  endereco_estado: string | null;
}

export const COLUNAS_DO_CLIENTE =
  "id, name, nome_fantasia, razao_social, cnpj, contact_name, email, phone, contact_phone, instagram_user, endereco_cidade, endereco_estado";

const limpo = (s: string | null | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** O nome que o cliente reconhece: o fantasia, senão o do cadastro. */
export function nomeDoCliente(c: Pick<ClienteParaAncora, "nome_fantasia" | "name">): string {
  return limpo(c.nome_fantasia, 120) || limpo(c.name, 120);
}

export interface OpcoesDoLink {
  plano: PlanoAncora;
  /** 1 a 90; a tela já vem com 14 */
  diasDeTeste: number;
  /** liberado sem data final de teste — o prazo se define depois, no Âncora */
  parceria: boolean;
  /** quem gerou (nome ou e-mail de quem está logado) */
  emitidoPor: string;
}

export type Montagem =
  | { ok: true; corpo: Record<string, unknown> }
  | { ok: false; falta: string };

/**
 * O pedido de link, com o que o cadastro já tem. Sem e-mail não há link: o convite é amarrado ao e-mail do
 * cliente (é o que protege os dados pré-preenchidos do lado de lá) — a tela diz o que falta e onde completar.
 */
export function montarPedidoDeLink(c: ClienteParaAncora, o: OpcoesDoLink): Montagem {
  const email = limpo(c.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, falta: "o e-mail do cliente" };
  const nome = nomeDoCliente(c);
  if (nome.length < 2) return { ok: false, falta: "o nome do cliente" };
  const dias = Math.round(o.diasDeTeste);
  if (!Number.isFinite(dias) || dias < 1 || dias > 90) return { ok: false, falta: "dias de teste entre 1 e 90" };
  const emitido = limpo(o.emitidoPor, 120);
  if (emitido.length < 2) return { ok: false, falta: "quem está gerando o link" };

  const dados: Record<string, string> = {};
  const por = (k: string, v: string) => { if (v) dados[k] = v; };
  por("responsavel", limpo(c.contact_name, 120));
  por("telefone", (limpo(c.contact_phone, 40) || limpo(c.phone, 40)).replace(/\D/g, "").slice(0, 30));
  por("cidade", limpo(c.endereco_cidade, 80));
  por("uf", limpo(c.endereco_estado, 2).toUpperCase());
  por("instagram", limpo(c.instagram_user, 60).replace(/^@/, ""));
  por("razao_social", limpo(c.razao_social, 160));
  por("cnpj", limpo(c.cnpj, 20));

  return {
    ok: true,
    corpo: {
      ref_externa: c.id, email, nome_empresa: nome, plan_id: o.plano,
      trial_dias: dias, ciclo: "mensal", parceria: o.parceria, pedir_acesso_da_agencia: true,
      emitido_por: emitido, dados,
    },
  };
}

/** GÊMEA de `mensagemDoGet` do Âncora: o que se assina num GET. */
export function mensagemDoGet(caminho: string, parametros: Record<string, string>): { mensagem: string; url: string } {
  const pares = Object.entries(parametros).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = new URLSearchParams(pares).toString();
  const url = `${caminho}${query ? `?${query}` : ""}`;
  return { mensagem: `GET ${url}`, url };
}

/** A linha da aba, numa frase — o que a pessoa lê de relance. */
export function resumoDoEstado(e: EstadoDoCliente | null, agora = Date.now()): { rotulo: string; tom: "neutro" | "andamento" | "ok" | "atencao" } {
  if (!e || e.estado === "sem_convite") return { rotulo: "Sem acesso", tom: "neutro" };
  if (e.estado === "vencido") return { rotulo: "Link vencido", tom: "atencao" };
  if (e.estado === "link_gerado") {
    const dias = e.expira_em ? Math.max(0, Math.ceil((Date.parse(e.expira_em) - agora) / 86_400_000)) : null;
    return { rotulo: dias == null ? "Link gerado" : `Link gerado · vale ${dias} dia${dias === 1 ? "" : "s"}`, tom: "andamento" };
  }
  if (!e.empresa?.whatsapp_conectado) return { rotulo: "Cadastrou · WhatsApp não conectado", tom: "atencao" };
  return { rotulo: "Cadastrou · WhatsApp conectado", tom: "ok" };
}
