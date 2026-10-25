// lib/auth/admins-fixos.ts — quem é administrador no servidor. Puro (vale no servidor e na tela).
//
// 25/10/2026 (onda 6, item 8.8). Antes, admin era SÓ esta lista de e-mails, qualquer que fosse a função
// na equipe: rebaixar o Julio dizia "salvo" e ele seguia admin; promover alguém a admin não abria
// nenhuma rota que confere `isAdmin` (senha, token da Meta, mapa de grupos…). Agora quem manda é a
// função em team_members (`role = "admin"`). A lista fica como rede de segurança — os sócios nunca se
// trancam para fora por uma edição errada — e a Gestão da Equipe mostra quem está nela, para a tela
// não prometer uma mudança de acesso que não acontece.

/** Admin no servidor independentemente da função cadastrada. */
export const ADMINS_FIXOS: ReadonlySet<string> = new Set([
  "lonemidiamkt@gmail.com", // Roberto
  "lucas@lonemidia.com",    // Lucas
  "julio@lonemidia.com",    // Julio (gerente; admin no servidor desde antes da Gestão da Equipe existir)
]);

export function ehAdminFixo(email: string | null | undefined): boolean {
  return ADMINS_FIXOS.has((email ?? "").trim().toLowerCase());
}

/** Admin no servidor: lista fixa OU função "admin" na equipe (ativo — desativado nem chega aqui). */
export function ehAdmin(email: string | null | undefined, papel: string | null | undefined): boolean {
  return ehAdminFixo(email) || papel === "admin";
}
