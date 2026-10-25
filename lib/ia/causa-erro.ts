// lib/ia/causa-erro.ts — ERRO CONHECIDO VIRA FRASE, NÃO JSON.
//
// 30/09/2026: seis automações acusaram "falhou" no grupo administrativo, cada uma com um pedaço de
// JSON cortado no meio ({"ok":false,"pendentes":566,"gerados":0,"erros":["1202480…). Todas tinham a
// MESMA causa — o saldo pré-pago da OpenAI acabou em 25/09 às 7h30 — e nenhum aviso dizia isso.
// Quem lê o grupo vê seis defeitos; era um boleto.
//
// Este arquivo reconhece as causas que já conhecemos e devolve o que fazer, em português. O que
// não reconhece devolve null, e o aviso segue mostrando o erro como ele veio (melhor cru que
// inventado).

import { agenteDaOrigem } from "@/lib/agentes/catalogo";

export type ChaveCausa = "openai-sem-credito" | "openai-chave-invalida" | "meta-token-vencido";

export interface CausaConhecida {
  chave: ChaveCausa;
  /** Título curto, vai em negrito no aviso. */
  titulo: string;
  /** Por que isso não é defeito do sistema (ou é) — uma linha. */
  explicacao: string;
  /** O que fazer. Com link quando existe. */
  acao: string;
}

const CAUSAS: ReadonlyArray<{ padrao: RegExp; causa: CausaConhecida }> = [
  {
    // A mensagem da OpenAI mudou de texto ao longo do tempo; as três formas aparecem no nosso
    // histórico. "429" sozinho NÃO entra: é também o limite de velocidade, que passa sozinho.
    padrao: /no credits remaining|insufficient_quota|exceeded your current quota/i,
    causa: {
      chave: "openai-sem-credito",
      titulo: "OpenAI sem crédito",
      explicacao: "O saldo pré-pago da OpenAI acabou. Não é defeito do sistema: tudo volta sozinho quando recarregar.",
      acao: "Recarregar em https://platform.openai.com/settings/organization/billing — e ligar a recarga automática pra não repetir.",
    },
  },
  {
    padrao: /incorrect api key|invalid_api_key/i,
    causa: {
      chave: "openai-chave-invalida",
      titulo: "Chave da OpenAI recusada",
      explicacao: "A OpenAI não reconhece a chave que o sistema usa (foi apagada ou trocada).",
      acao: "Gerar uma chave nova em https://platform.openai.com/api-keys e trocar OPENAI_API_KEY no servidor.",
    },
  },
  {
    padrao: /error validating access token|session has expired|access token has expired|"code"\s*:\s*190\b/i,
    causa: {
      chave: "meta-token-vencido",
      titulo: "Token da Meta vencido",
      explicacao: "A Meta recusou o token de acesso — sem ele param saldo, métricas e portais.",
      acao: "Gerar um token novo no Business Manager da Lone e atualizar no sistema.",
    },
  },
];

/** A causa conhecida por trás de um texto de erro, ou null. */
export function causaDoErro(texto: string | null | undefined): CausaConhecida | null {
  if (!texto) return null;
  return CAUSAS.find((c) => c.padrao.test(texto))?.causa ?? null;
}

/**
 * O erro legível de um resumo de automação. O corpo das rotas é JSON ({"ok":false,"erros":[...]});
 * o aviso mostrava os primeiros 110 caracteres, que quase sempre eram contadores, não o erro.
 * Aqui pega a primeira mensagem de erro que existir. Funciona com JSON cortado (é o que o banco
 * guarda), por isso é regex e não JSON.parse.
 */
export function erroDoResumo(resumo: string | null | undefined): string | null {
  if (!resumo) return null;
  // A linha que o registrar acrescenta com o erro inteiro (o resumo em si é cortado em 300).
  const anexado = resumo.match(/⟶ erro: (.+)$/m)?.[1]?.trim();
  if (anexado) return anexado;
  const doArray = resumo.match(/"erros?"\s*:\s*\[\s*"((?:[^"\\]|\\.)*)/);
  const doCampo = resumo.match(/"(?:error|erro|message)"\s*:\s*"((?:[^"\\]|\\.)*)/);
  const bruto = doArray?.[1] ?? doCampo?.[1];
  if (bruto) return bruto.replace(/\\"/g, '"').replace(/\\n/g, " ").trim() || null;
  // Não é JSON com erro: devolve o texto como veio (ex.: "pulado: desligado na Central").
  return resumo.trim().startsWith("{") ? null : resumo.trim();
}

/**
 * Nome que o time entende para cada origem de chamada de IA (llm_calls.origem): o nome do agente no
 * catálogo (lib/agentes/catalogo.ts). "inbound" é o Loninho inteiro (a execução do webhook); nome de
 * arquivo ("app/.next/server/…", "lib/cs/…") é chamada de antes da etiqueta obrigatória (25/10/2026).
 */
export function rotuloDaOrigem(origem: string | null | undefined): string {
  const o = (origem ?? "").trim();
  const agente = agenteDaOrigem(o);
  if (agente) return agente.nome;
  const lc = o.toLowerCase();
  if (lc === "inbound" || lc.includes("/cs/inbound")) return "Loninho lendo as mensagens dos grupos dos clientes";
  if (!o || lc === "sem-etiqueta" || /^(app|lib|components|stores)\//.test(lc)) return "chamadas sem etiqueta";
  return o;
}
