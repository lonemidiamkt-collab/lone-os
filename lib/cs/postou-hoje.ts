// lib/cs/postou-hoje.ts — quem postou de verdade hoje, direto do Instagram.
//
// PRA QUE (Roberto, 10/08): saber, em seg/qua/sex, se os social media postaram. Não pelo quadro —
// pelo que está PUBLICADO no perfil do cliente.
//
// POR QUE ISSO IMPORTA MAIS QUE O QUADRO. Em 09/08 eu descobri, olhando a API, que a carteira
// inteira de um social não tinha postado no Dia dos Pais enquanto a do outro tinha postado nos 13.
// O quadro não mostrava isso: card marcado como pronto não é post no ar, e foi assim que o Bazar
// Ribeiro ficou 34 dias sem publicar sem ninguém notar.
//
// CUIDADO COM A COTA. O teto da Meta é ~200 chamadas por hora e o relatório semanal já consome
// centenas. Aqui é UMA chamada por cliente, com `limit=1` — o suficiente pra saber a data do
// último post. Cliente sem Instagram vinculado é reportado como ponto cego, não como falta.

import { supabaseAdmin } from "@/lib/supabase/server";
import { spNow, ymd } from "@/lib/cs/vigilancia";

const GRAPH = "https://graph.facebook.com/v21.0";

export interface StatusPostagem {
  cliente: string;
  social: string | null;
  postouHoje: boolean;
  ultimoPost: string | null;   // YYYY-MM-DD
  diasParado: number | null;
  erro?: string;
}

export interface ResumoPostagem {
  dia: string;
  postaram: StatusPostagem[];
  faltaram: StatusPostagem[];
  semInstagram: StatusPostagem[];
  comErro: StatusPostagem[];
}

async function token(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("agency_settings").select("key, value")
    .in("key", ["meta_token", "meta_token_expires_at"]);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  const t = map.get("meta_token");
  const exp = map.get("meta_token_expires_at") ? parseInt(map.get("meta_token_expires_at")!, 10) : null;
  if (!t || (exp && exp < Date.now())) return null;
  return t;
}

/** Data (BRT) do post mais recente da conta. `null` = nunca postou. */
/** Conta da agência (@lonemidia) usada para ler perfis públicos via business_discovery. */
const AGENCY_IG_ID = process.env.META_AGENCY_IG_ID || "17841413649646681";

/**
 * Códigos que significam "o identificador está MORTO", não "falta permissão".
 *   110 (Invalid user id) → o @ não existe mais: mudou de nome ou a conta foi apagada.
 *   100/803 (does not exist) → o mesmo, pelo ID.
 * A diferença muda a ação: um pede atualizar o cadastro, o outro é lido por outro caminho.
 */
const CODIGOS_CADASTRO_MORTO = new Set([110, 100, 803]);

/** Último post pelo caminho público. Não exige acesso à Página — só que o perfil seja comercial. */
async function ultimoPostPublico(handle: string, t: string): Promise<{ data: string | null; erro?: string }> {
  const campos = `business_discovery.username(${encodeURIComponent(handle)})%7Bmedia.limit(1)%7Btimestamp%7D%7D`;
  const r = await fetch(`${GRAPH}/${AGENCY_IG_ID}?fields=${campos}&access_token=${encodeURIComponent(t)}`,
    { signal: AbortSignal.timeout(25_000) }).catch(() => null);
  if (!r) return { data: null, erro: "sem resposta da Meta" };
  const j = await r.json().catch(() => ({}));
  if (j?.error) {
    const cod = Number(j.error.code ?? 0);
    return {
      data: null,
      erro: CODIGOS_CADASTRO_MORTO.has(cod)
        ? `o @${handle} não existe mais — atualize o Instagram no cadastro`
        : (j.error.message?.slice(0, 60) ?? "erro"),
    };
  }
  const ts = j?.business_discovery?.media?.data?.[0]?.timestamp as string | undefined;
  return ts ? { data: ymd(spNow(new Date(ts))) } : { data: null };
}

/**
 * Último post de um cliente.
 *
 * Tenta `/media` (conta no nosso Business, dado completo) e, quando a Meta recusa por PERMISSÃO,
 * cai no caminho público.
 *
 * Por que isso importa (03/09): cinco contas apareciam todo dia na mensagem do time como "a Meta
 * recusou" — Bazar Ribeiro Saquarema, Bruno Tintas Araruama, Varejão, UNAFER e Dr. Junior Vargas.
 * O business_discovery lia as três últimas sem problema (138, 124 e 530 posts), mas esta função
 * nunca tentava: batia no `/media`, tomava o erro #10 e desistia. O time recebia erro cru da Graph
 * API — com link para a documentação do Facebook — sobre clientes que estavam postando normalmente.
 */
async function ultimoPost(igId: string, t: string, handle?: string | null): Promise<{ data: string | null; erro?: string }> {
  // Sem ID mas com @: vai direto pelo público.
  if (!igId && handle) return ultimoPostPublico(handle, t);

  const url = `${GRAPH}/${igId}/media?fields=timestamp&limit=1&access_token=${encodeURIComponent(t)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(25_000) }).catch(() => null);
  if (!r) return { data: null, erro: "sem resposta da Meta" };
  const j = await r.json().catch(() => ({}));

  if (j?.error) {
    const cod = Number(j.error.code ?? 0);
    // Falta de permissão: o @ resolve. Pega o username da própria conta, que responde mesmo sem
    // acesso à Página — foi assim que as três contas voltaram a ser lidas.
    if (cod === 10 || cod === 200) {
      let nome = handle;
      if (!nome) {
        const rc = await fetch(`${GRAPH}/${igId}?fields=username&access_token=${encodeURIComponent(t)}`,
          { signal: AbortSignal.timeout(15_000) }).catch(() => null);
        const jc = rc ? await rc.json().catch(() => ({})) : {};
        nome = (jc?.username as string) || null;
      }
      if (nome) return ultimoPostPublico(nome, t);
      return { data: null, erro: "sem acesso à Página e sem @ no cadastro" };
    }
    // Identificador morto: nenhum caminho resolve — é cadastro para corrigir.
    if (CODIGOS_CADASTRO_MORTO.has(cod)) {
      return handle
        ? ultimoPostPublico(handle, t)
        : { data: null, erro: "o Instagram do cadastro não existe mais — atualize o @ ou o ID" };
    }
    return { data: null, erro: j.error.message?.slice(0, 60) ?? "erro" };
  }

  const ts = j?.data?.[0]?.timestamp as string | undefined;
  if (!ts) return { data: null };
  // A Meta devolve em UTC com deslocamento; converter pra BRT antes de comparar com "hoje" evita
  // marcar como "ontem" um post das 21h.
  return { data: ymd(spNow(new Date(ts))) };
}

/**
 * Confere a carteira inteira.
 *
 * @param apenasSocial limita a um social media (o nome como está em `assigned_social`).
 */
export async function conferirPostagem(
  apenasSocial?: string,
  diaAlvo?: string,
): Promise<ResumoPostagem | { erro: string }> {
  const t = await token();
  if (!t) return { erro: "token da Meta ausente ou vencido" };

  // SÓ QUEM TEM POSTAGEM CONTRATADA. Cliente de tráfego puro não tem social no contrato — cobrar
  // post dele é cobrar por algo que ninguém vendeu, e o resumo perde a autoridade: quem lê aprende
  // que metade da lista é ruído. O Roberto pegou isso no primeiro teste (6 dos 9 "faltando" eram
  // só tráfego).
  //
  // A exceção existe de propósito: cliente de tráfego COM social atribuído à mão significa que
  // alguém decidiu que ele tem postagem. O `assigned_social` preenchido manda mais que o
  // service_type.
  let q = supabaseAdmin.from("clients")
    .select("name, nome_fantasia, ig_business_account_id, ig_public_username, assigned_social, service_type")
    .or("active.is.null,active.eq.true")
    .or("service_type.in.(lone_growth,assessoria_social),assigned_social.not.is.null");
  if (apenasSocial) q = q.eq("assigned_social", apenasSocial);
  const { data: clientes } = await q;

  // `diaAlvo` serve pra conferir um dia passado (teste, ou rodar de novo depois de uma falha). Sem
  // ele, é hoje. Uma chamada por cliente de qualquer jeito — a API devolve o último post, e a
  // comparação é de data.
  const hoje = diaAlvo || ymd(spNow());
  const resumo: ResumoPostagem = { dia: hoje, postaram: [], faltaram: [], semInstagram: [], comErro: [] };

  for (const c of clientes ?? []) {
    const nome = (c.nome_fantasia as string) || (c.name as string);
    const social = (c.assigned_social as string) || null;
    const igId = c.ig_business_account_id as string | null;

    if (!igId) {
      // PONTO CEGO, NÃO FALTA. Acusar de não ter postado quem o sistema não consegue ver seria
      // cobrar a pessoa errada — e ensina o time a ignorar o aviso.
      resumo.semInstagram.push({ cliente: nome, social, postouHoje: false, ultimoPost: null, diasParado: null });
      continue;
    }

    const { data: ultimo, erro } = await ultimoPost(igId, t, (c.ig_public_username as string) || null);
    if (erro) {
      resumo.comErro.push({ cliente: nome, social, postouHoje: false, ultimoPost: null, diasParado: null, erro });
      continue;
    }

    const dias = ultimo
      ? Math.round((new Date(`${hoje}T00:00:00`).getTime() - new Date(`${ultimo}T00:00:00`).getTime()) / 86_400_000)
      : null;
    const st: StatusPostagem = { cliente: nome, social, postouHoje: ultimo === hoje, ultimoPost: ultimo, diasParado: dias };
    (st.postouHoje ? resumo.postaram : resumo.faltaram).push(st);
  }

  // Quem está parado há mais tempo primeiro: é quem precisa de ação hoje.
  resumo.faltaram.sort((a, b) => (b.diasParado ?? 999) - (a.diasParado ?? 999));
  return resumo;
}

/**
 * O texto que vai pro grupo.
 *
 * Quando está tudo certo, diz isso em UMA linha. Relatório longo pra dizer "está tudo bem" é o que
 * faz o time parar de ler o grupo — e aí o aviso que importa passa junto.
 */
export function textoResumo(r: ResumoPostagem): string {
  const total = r.postaram.length + r.faltaram.length;
  const [d, m] = [r.dia.slice(8, 10), r.dia.slice(5, 7)];

  if (!total) return `Não consegui conferir as postagens de ${d}/${m} — nenhum cliente com Instagram vinculado.`;

  if (!r.faltaram.length) {
    const extra = r.semInstagram.length ? ` (${r.semInstagram.length} sem Instagram vinculado, não dá pra ver)` : "";
    return `✅ *Postagem de ${d}/${m}* — todos os ${total} clientes postaram hoje.${extra}`;
  }

  const linhas = [`📌 *Postagem de ${d}/${m}* — ${r.postaram.length} de ${total} postaram.`, ""];
  linhas.push(`*Sem post hoje (${r.faltaram.length}):*`);

  // Agrupa por social: cobrança sem dono não é cobrança, vira aviso que todo mundo lê e ninguém age.
  const porDono = new Map<string, StatusPostagem[]>();
  for (const f of r.faltaram) {
    const k = f.social || "sem social definido";
    if (!porDono.has(k)) porDono.set(k, []);
    porDono.get(k)!.push(f);
  }
  for (const [dono, itens] of porDono) {
    linhas.push(`\n*${dono}*`);
    for (const i of itens) {
      const quando = i.ultimoPost
        ? (i.diasParado! >= 7 ? `🔴 ${i.diasParado} dias sem postar` : `último há ${i.diasParado}d`)
        : "🔴 nunca postou";
      linhas.push(`• ${i.cliente} — ${quando}`);
    }
  }

  if (r.semInstagram.length) {
    linhas.push(`\n_${r.semInstagram.length} cliente(s) sem Instagram vinculado — não consigo conferir: ${r.semInstagram.map((s) => s.cliente).join(", ")}_`);
  }
  if (r.comErro.length) {
    // ERRO CRU DA GRAPH API NÃO É AVISO. A versão anterior despejava no grupo coisas como
    // "Unsupported get request. Object with ID '178414…' does not exist… Please read the Graph API
    // documentation at https://developers.facebook.com/docs/graph-api" — ninguém do time tem o que
    // fazer com isso. O que resolve é saber que o cadastro precisa ser atualizado.
    const cadastro = r.comErro.filter((x) => /não existe mais|atualize/i.test(x.erro ?? ""));
    const outros = r.comErro.filter((x) => !cadastro.includes(x));
    if (cadastro.length) {
      linhas.push(`\n📎 *${cadastro.length} cliente(s) com o Instagram trocado no cadastro* — o @ mudou ou a conta saiu do ar:`);
      linhas.push(cadastro.map((x) => `• ${x.cliente}`).join("\n"));
      linhas.push(`_Me manda o @ certo que eu atualizo._`);
    }
    if (outros.length) {
      linhas.push(`\n_${outros.length} conta(s) que a Meta não deixou eu ler agora: ${outros.map((x) => x.cliente).join(", ")}_`);
    }
  }
  return linhas.join("\n");
}
