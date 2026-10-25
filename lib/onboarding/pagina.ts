// lib/onboarding/pagina.ts — o que a página pública do cadastro decide quando algo falha.
//
// Auditoria de erro recuperável, itens 1.9, 1.10 e 1.14 (24/10/2026):
//   1.9  abrir o link: rede, deploy ou erro de banco viravam "Link inválido" e o cliente desistia de
//        um link bom. Só o 404 é link inválido; o resto é "não consegui abrir agora" + tentar de novo.
//   1.10 erro no envio: o aviso ia para o topo, longe do botão, com o texto cru do Postgres. Agora a
//        frase é humana e fica junto do botão; o detalhe técnico vai para o log.
//   1.14 rascunho: a falha só tentava de novo quando a pessoa digitava, e fechar a aba nos 3 s do
//        salvamento perdia o que foi digitado. Agora tenta sozinho (com espera crescente) e salva ao sair.
//
// Puro. Testado em tests/onboarding-pagina.test.ts.

export type FalhaDeAbertura = "invalido" | "indisponivel";

/** O GET do cadastro falhou: link que não existe (404/400) ou sistema fora do ar (o resto). */
export function falhaDeAbertura(status: number): FalhaDeAbertura {
  return status === 404 || status === 400 ? "invalido" : "indisponivel";
}

/**
 * Frase do erro do "Finalizar", para ficar junto do botão. 4xx traz frase escrita para o cliente
 * (campos que faltam, link vencido); falha de rede ou do servidor ganha frase própria — nunca o
 * texto técnico que veio de dentro.
 */
export function fraseDoErroDoEnvio(status: number, doServidor?: string | null): string {
  const guardado = " Seus dados continuam aqui.";
  if (status === 0) return `Sem conexão agora.${guardado} Confira a internet e toque em Finalizar de novo.`;
  if (status === 502 || status === 503 || status === 504) return `O sistema está reiniciando.${guardado} Tente de novo em alguns segundos.`;
  if (status === 429) return `Muitas tentativas seguidas.${guardado} Espere um minuto e tente de novo.`;
  if (status >= 400 && status < 500 && doServidor?.trim()) return doServidor.trim();
  return `Não consegui enviar agora.${guardado} Tente de novo em instantes — se continuar, avise a equipe da Lone Mídia.`;
}

const ESPERAS_RASCUNHO_MS = [5_000, 15_000, 30_000, 60_000];

/** Espera antes de tentar salvar o rascunho de novo, depois de `falhas` falhas seguidas. */
export function esperaDoRascunho(falhas: number): number {
  if (falhas <= 0) return 3_000;
  return ESPERAS_RASCUNHO_MS[Math.min(falhas, ESPERAS_RASCUNHO_MS.length) - 1];
}

/** Ao sair da página: só manda se há algo digitado que o servidor ainda não tem. */
export function deveSalvarAoSair(atual: string, ultimoSalvo: string | null): boolean {
  return ultimoSalvo !== null && atual !== ultimoSalvo;
}
