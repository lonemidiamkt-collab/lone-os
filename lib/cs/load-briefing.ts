// lib/cs/load-briefing.ts — carrega o briefing atual de um cliente e mapeia pro formato do
// Agente Criativo (BriefingCliente). Compartilhado entre o inbound (on-demand) e as rotas.

import { supabaseAdmin } from "@/lib/supabase/server";
import type { BriefingCliente } from "@/lib/cs/criativo";

export const BRIEFING_COLS =
  "resumo_estrategico, contato, produtos, publico_alvo, posicionamento, dores, ganchos, ctas, tom_voz, produtos_destaque_atual, palavras_proibidas, concorrentes_evitar_mencionar";

// Preferências de estilo de roteiro aprendidas do cliente (loop de feedback): regras 'roteiro' +
// as 'sempre' (do's & don'ts gerais valem p/ o roteiro também).
export async function loadRoteiroPrefs(clientId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("cs_client_rules").select("texto")
    .eq("client_id", clientId).eq("ativo", true).in("escopo", ["roteiro", "sempre"])
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`); // ignora regras expiradas (KB: validade)
  return (data ?? []).map((r) => r.texto as string).filter(Boolean);
}

// Regras de CONTEÚDO que o motor de calendário obedece (feedback do time → o motor respeita):
// escopo 'social' (conteúdo/social), 'promocao' (promoções ativas) e 'sempre' (do's & don'ts gerais).
export async function loadContentRules(clientId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("cs_client_rules").select("texto")
    .eq("client_id", clientId).eq("ativo", true).in("escopo", ["sempre", "social", "promocao"])
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  return (data ?? []).map((r) => r.texto as string).filter(Boolean);
}

/** Briefing estruturado como TEXTO compacto pros prompts (A1/A3/pauta). Na base real os campos
 *  de texto livre clients.fixed/campaign_briefing estão VAZIOS — o briefing vivo mora em
 *  client_briefings (onboarding/ficha). Sem este loader, A3 e pauta rodavam sem contexto. */
export async function loadBriefingTexto(clientId: string): Promise<string | undefined> {
  const [{ data: b }, { data: cadastro }] = await Promise.all([
    supabaseAdmin.from("client_briefings").select(BRIEFING_COLS)
      .eq("client_id", clientId).eq("is_current", true).maybeSingle(),
    // Endereço e telefone vêm do CADASTRO quando o briefing não os tem.
    //
    // A regra nº1 do guia de legendas é "toda legenda fecha com contato", e o campo estava vazio em
    // 22 dos 23 briefings: o agente escrevia o fecho sem ter o dado. Preenchi os briefings, mas ler
    // do cadastro também é o que mantém isso vivo — briefing novo nasce sem contato, e endereço que
    // muda é atualizado na ficha do cliente, não numa versão de briefing.
    supabaseAdmin.from("clients").select("endereco, phone").eq("id", clientId).maybeSingle(),
  ]);

  const contatoDoCadastro = [
    (cadastro?.endereco as string) || "",
    (cadastro?.phone as string) ? `Tel: ${cadastro?.phone}` : "",
  ].filter(Boolean).join(" · ");

  // Sem briefing, o contato sozinho já vale a viagem: é o que fecha a legenda.
  if (!b) {
    return contatoDoCadastro
      ? `Contato (fechar a legenda com isto — endereço/telefone): ${contatoDoCadastro}`
      : undefined;
  }
  const j = (a: unknown) => (Array.isArray(a) && a.length ? (a as string[]).join(", ") : null);
  const linhas = [
    b.resumo_estrategico && `Resumo: ${b.resumo_estrategico}`,
    (b.contato || contatoDoCadastro) &&
      `Contato (fechar a legenda com isto — endereço/telefone/horário): ${b.contato || contatoDoCadastro}`,
    b.posicionamento && `Posicionamento: ${b.posicionamento}`,
    j(b.produtos) && `Produtos: ${j(b.produtos)}`,
    j(b.produtos_destaque_atual) && `Destaques do momento: ${j(b.produtos_destaque_atual)}`,
    j(b.publico_alvo) && `Público: ${j(b.publico_alvo)}`,
    j(b.dores) && `Dores do público: ${j(b.dores)}`,
    b.tom_voz && `Tom de voz: ${b.tom_voz}`,
    j(b.ganchos) && `Ganchos que funcionam: ${j(b.ganchos)}`,
    j(b.ctas) && `CTAs: ${j(b.ctas)}`,
    j(b.palavras_proibidas) && `NUNCA usar: ${j(b.palavras_proibidas)}`,
    j(b.concorrentes_evitar_mencionar) && `Concorrentes a NÃO mencionar: ${j(b.concorrentes_evitar_mencionar)}`,
  ].filter(Boolean) as string[];
  return linhas.length ? linhas.join("\n").slice(0, 2000) : undefined;
}

/**
 * O QUE FOI DITO NAS REUNIÕES — a memória mais fresca que existe do cliente.
 *
 * Roberto (09/09): "quero que o Loninho abra esses briefings que a gente está fazendo, e tenha
 * mais conclusões e mais anotações de regra sobre aquele cliente."
 *
 * O briefing estruturado envelhece: foi escrito no onboarding e quase nunca é revisto. A reunião
 * do mês passado sabe coisas que ele não sabe — que o cliente quer empurrar cimento, que a
 * campanha de telha traz lead de fora da região, que ele pediu para não falar de preço. Sem isto,
 * o agente escrevia legenda com a foto de um ano atrás.
 *
 * Ordem importa: as DECISÕES vêm primeiro, porque são a instrução mais próxima de uma regra —
 * "pausar a campanha antiga" é ordem, "o cliente comentou que anda devagar" é contexto.
 */
export async function loadRegistrosReuniao(clientId: string, quantas = 4): Promise<string | undefined> {
  const { data } = await supabaseAdmin
    .from("meetings")
    .select("start_at, realizada_em, responsavel, briefing, decisoes, proximos_passos, resumo")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    // Só reunião que ACONTECEU: o que se planejou discutir numa reunião futura não é memória.
    .eq("estado", "realizada")
    .order("realizada_em", { ascending: false, nullsFirst: false })
    .limit(quantas);

  const blocos = (data ?? [])
    .map((m) => {
      const quando = new Date((m.realizada_em as string) || (m.start_at as string))
        .toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo" });
      const partes = [
        m.decisoes && `decidido: ${m.decisoes}`,
        m.proximos_passos && `ficou de: ${m.proximos_passos}`,
        m.briefing && `discutido: ${m.briefing}`,
        // O resumo da IA entra só quando a pessoa não escreveu nada — é a segunda fonte, não a
        // primeira: quem estava na sala sabe mais que quem leu a transcrição.
        !m.briefing && !m.decisoes && m.resumo && `resumo: ${m.resumo}`,
      ].filter(Boolean) as string[];
      if (!partes.length) return null;
      return `[${quando}${m.responsavel ? ` · ${m.responsavel}` : ""}] ${partes.join(" | ")}`;
    })
    .filter(Boolean) as string[];

  if (!blocos.length) return undefined;
  // Teto de caracteres: memória de reunião não pode empurrar o briefing para fora do prompt.
  return `O QUE SAIU DAS ÚLTIMAS REUNIÕES (mais recente primeiro — vale mais que o briefing antigo quando conflitar):\n${blocos.join("\n")}`.slice(0, 1800);
}

/** Junta o texto livre (fixed/campaign) COM o estruturado (client_briefings). Antes o código usava
 *  um OU outro (fixed sobrescrevia o estruturado) — então um contato/nota no fixed apagava o
 *  briefing do onboarding. Agora SOMA os dois. `fixoInline` = o fixed/campaign já lido do cliente. */
export async function loadBriefingCombinado(clientId: string, fixoInline?: string | null): Promise<string | undefined> {
  // As reuniões entram por AQUI, e não dentro de `loadBriefingTexto`, porque este é o ponto que
  // TODOS os prompts usam — A1, A3, pauta, roteiro. Somar num só lugar é o que garante que o
  // agente não saiba de uma reunião numa tela e ignore na outra.
  const [estruturado, reunioes] = await Promise.all([
    loadBriefingTexto(clientId),
    loadRegistrosReuniao(clientId),
  ]);
  return [fixoInline?.trim() || null, estruturado, reunioes].filter(Boolean).join("\n\n") || undefined;
}

export async function loadBriefingForClient(opts: {
  clientId: string; nome: string; nicho?: string;
}): Promise<{ briefing: BriefingCliente; temBriefing: boolean }> {
  const { data: b } = await supabaseAdmin
    .from("client_briefings").select(BRIEFING_COLS)
    .eq("client_id", opts.clientId).eq("is_current", true).maybeSingle();
  return {
    temBriefing: !!b,
    briefing: {
      nome: opts.nome,
      nicho: opts.nicho,
      resumoEstrategico: (b?.resumo_estrategico as string) || undefined,
      produtos: (b?.produtos as string[]) || undefined,
      publicoAlvo: (b?.publico_alvo as string[]) || undefined,
      posicionamento: (b?.posicionamento as string) || undefined,
      dores: (b?.dores as string[]) || undefined,
      ganchos: (b?.ganchos as string[]) || undefined,
      ctas: (b?.ctas as string[]) || undefined,
      tomVoz: (b?.tom_voz as string) || undefined,
      produtosDestaque: (b?.produtos_destaque_atual as string[]) || undefined,
      palavrasProibidas: (b?.palavras_proibidas as string[]) || undefined,
      concorrentesEvitar: (b?.concorrentes_evitar_mencionar as string[]) || undefined,
    },
  };
}
