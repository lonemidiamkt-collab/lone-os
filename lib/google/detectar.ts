// lib/google/detectar.ts — VÍNCULO AUTOMÁTICO do Google com o cliente (Roberto, 18/11/2026: "tem que ter uma detecção
// automática, até se a gente colocar o cliente pós o cadastro dele").
//
// Só aparece aqui o que a LONE gerencia: a lista vem da conexão de marketing (lib/google/marketing-auth.ts), e o
// Google só devolve as contas de anúncio e os perfis a que a conta da Lone tem acesso. Cliente que não deu acesso
// não aparece — e passa a aparecer no dia em que der (a rotina das 7h procura de novo todo dia).
//
// Vincula sozinho só quando a certeza é alta e a escolha é única:
//   · nome da conta/perfil IGUAL ao nome do cliente (fantasia, nome ou razão social, sem acento, "ltda", "me"...);
//   · Perfil: o telefone do perfil é o telefone do cliente.
// e a conta/perfil não está em outro cliente, e só UM cliente casa com ela. O resto vira SUGESTÃO na ficha
// ("parece ser deste cliente") — quem confirma é a pessoa. Errar o vínculo manda o número de um cliente para o
// relatório de outro; por isso o automático é conservador.
//
// Módulo PURO (testado); a leitura do Google e a gravação ficam em sincronizar.ts.

export interface ClienteParaCasar {
  id: string;
  name: string | null;
  nome_fantasia: string | null;
  razao_social: string | null;
  phone: string | null;
  contact_phone: string | null;
  google_ads_customer_id: string | null;
  google_perfil_local: string | null;
}

export interface Candidato { chave: string; nome: string; telefone?: string | null }

const RUIDO = new Set(["ltda", "me", "mei", "epp", "eireli", "sa", "s/a", "cia", "comercio", "comercial", "de", "da", "do", "das", "dos", "e", "&", "the", "loja", "empresa", "servicos", "industria"]);

/** "Serraria Sao Joao LTDA - ME" → "serraria sao joao". Pura. */
export function nomeNormalizado(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/['’`´]/g, "").replace(/[^a-z0-9]+/g, " ")
    .split(" ").filter((t) => t && !RUIDO.has(t)).join(" ");
}

/** Os últimos 10 dígitos (DDD + número), sem o 9 extra de celular: "+55 (19) 99876-5432" → "1998765432". */
export function telefoneNormalizado(s: string | null | undefined): string | null {
  let d = String(s ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  return d.length === 10 ? d : null;
}

const nomesDo = (c: ClienteParaCasar) => [c.nome_fantasia, c.name, c.razao_social].map(nomeNormalizado).filter((n) => n.length >= 3);
const telefonesDo = (c: ClienteParaCasar) => [c.phone, c.contact_phone].map(telefoneNormalizado).filter((t): t is string => !!t);

export type Forca = "forte" | "fraca";

/** Quanto o candidato parece ser deste cliente. null = nada a ver. Pura. */
export function forcaDoCasamento(c: ClienteParaCasar, k: Candidato): { forca: Forca; motivo: string } | null {
  const nomeK = nomeNormalizado(k.nome);
  const nomes = nomesDo(c);
  const tel = telefoneNormalizado(k.telefone);
  if (tel && telefonesDo(c).includes(tel)) return { forca: "forte", motivo: "mesmo telefone" };
  if (nomeK.length >= 3 && nomes.includes(nomeK)) return { forca: "forte", motivo: "mesmo nome" };
  // Fraca: um nome contém o outro (com pelo menos 2 palavras ou 6 letras do lado menor) — "Ferragem Central" ×
  // "Ferragem Central Campinas". Só sugere: pode ser outra loja da mesma rede.
  for (const n of nomes) {
    const [menor, maior] = n.length <= nomeK.length ? [n, nomeK] : [nomeK, n];
    if (menor.length >= 6 && (` ${maior} `).includes(` ${menor} `)) return { forca: "fraca", motivo: "nome parecido" };
  }
  return null;
}

export interface Casamento { clientId: string; chave: string; nome: string; forca: Forca; motivo: string }

/**
 * Para cada cliente SEM vínculo daquele tipo: o que vincular sozinho (`automaticos`) e o que sugerir (`sugestoes`).
 * `jaUsadas`: chaves já vinculadas a algum cliente (não são oferecidas de novo). Pura (testada).
 */
export function casar(
  clientes: readonly ClienteParaCasar[],
  candidatos: readonly Candidato[],
  tipo: "ads" | "perfil",
): { automaticos: Casamento[]; sugestoes: Casamento[] } {
  const coluna = tipo === "ads" ? "google_ads_customer_id" : "google_perfil_local";
  const jaUsadas = new Set(clientes.map((c) => c[coluna]).filter((x): x is string => !!x));
  const livres = candidatos.filter((k) => !jaUsadas.has(k.chave));
  const semVinculo = clientes.filter((c) => !c[coluna]);

  const todos: Casamento[] = [];
  for (const c of semVinculo) {
    for (const k of livres) {
      const f = forcaDoCasamento(c, k);
      if (f) todos.push({ clientId: c.id, chave: k.chave, nome: k.nome, ...f });
    }
  }
  const automaticos: Casamento[] = [];
  const sugestoes: Casamento[] = [];
  for (const m of todos) {
    const fortesDoCliente = todos.filter((x) => x.clientId === m.clientId && x.forca === "forte");
    const fortesDaChave = todos.filter((x) => x.chave === m.chave && x.forca === "forte");
    if (m.forca === "forte" && fortesDoCliente.length === 1 && fortesDaChave.length === 1) automaticos.push(m);
    else sugestoes.push(m);
  }
  return { automaticos, sugestoes };
}
