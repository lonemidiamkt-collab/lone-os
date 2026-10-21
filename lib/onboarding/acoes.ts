// lib/onboarding/acoes.ts — ações do POST /api/onboarding que o CLIENTE (sem login) pode chamar.
// Todas se autenticam pelo token do cadastro dentro da própria ação; o resto exige login.
//
// remover_doc entrou em 21/10/2026 e ficou de fora desta lista no primeiro deploy: o botão
// "Remover" funcionava para quem testava logado e devolvia 401 para o cliente (a auditoria de erro
// recuperável achou). Ação nova do formulário público entra AQUI — o teste confere.
export const ACOES_PUBLICAS_DO_CADASTRO = new Set(["auto_save", "submit", "remover_doc"]);
