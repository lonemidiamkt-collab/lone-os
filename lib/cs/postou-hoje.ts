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
async function ultimoPost(igId: string, t: string): Promise<{ data: string | null; erro?: string }> {
  const url = `${GRAPH}/${igId}/media?fields=timestamp&limit=1&access_token=${encodeURIComponent(t)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(25_000) }).catch(() => null);
  if (!r) return { data: null, erro: "sem resposta da Meta" };
  const j = await r.json().catch(() => ({}));
  if (j?.error) return { data: null, erro: j.error.message?.slice(0, 60) ?? "erro" };
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
export async function conferirPostagem(apenasSocial?: string): Promise<ResumoPostagem | { erro: string }> {
  const t = await token();
  if (!t) return { erro: "token da Meta ausente ou vencido" };

  let q = supabaseAdmin.from("clients")
    .select("name, nome_fantasia, ig_business_account_id, assigned_social")
    .or("active.is.null,active.eq.true");
  if (apenasSocial) q = q.eq("assigned_social", apenasSocial);
  const { data: clientes } = await q;

  const hoje = ymd(spNow());
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

    const { data: ultimo, erro } = await ultimoPost(igId, t);
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
    linhas.push(`\n_${r.comErro.length} conta(s) a Meta recusou: ${r.comErro.map((s) => s.cliente).join(", ")}_`);
  }
  return linhas.join("\n");
}
