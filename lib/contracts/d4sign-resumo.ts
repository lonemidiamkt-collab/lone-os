// lib/contracts/d4sign-resumo.ts — "assinado por X em dd/mm · falta Y". Módulo PURO, sem import nenhum: a tela
// (navegador) e as mensagens do grupo de cadastro (servidor) escrevem do mesmo jeito.

export type Papel = "cliente" | "lone" | "testemunha" | "indefinido";

export interface SignatarioResumo {
  nome: string | null;
  email: string | null;
  papel: Papel | string;
  assinou: boolean;
  assinadoEm: string | null;
}

/** dd/mm no horário de Brasília. */
export function ddmmD4Sign(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

/** "A", "A e B", "A, B e C". */
export function juntar(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

const ROTULO: Record<string, string> = { cliente: "cliente", lone: "Lone", testemunha: "testemunha" };

/** "José (cliente)". Sem nome na D4Sign, a parte antes do @. */
export function quemAssina(s: Pick<SignatarioResumo, "nome" | "email" | "papel">): string {
  const nome = s.nome?.trim() || (s.email ? s.email.split("@")[0] : "signatário");
  const papel = ROTULO[s.papel];
  return papel ? `${nome} (${papel})` : nome;
}

/** "assinado por Roberto (Lone) em 26/10 · falta José (cliente)". */
export function resumoAssinaturas(lista: SignatarioResumo[]): string {
  if (!lista.length) return "sem signatários na D4Sign ainda";
  const feitos = lista.filter((s) => s.assinou);
  const faltam = lista.filter((s) => !s.assinou);
  const parteFeita = feitos.length
    ? `assinado por ${juntar(feitos.map((s) => `${quemAssina(s)}${s.assinadoEm ? ` em ${ddmmD4Sign(s.assinadoEm)}` : ""}`))}`
    : "ninguém assinou ainda";
  const parteFalta = faltam.length ? `falta ${juntar(faltam.map(quemAssina))}` : "todos assinaram";
  return `${parteFeita} · ${parteFalta}`;
}

/** Só quem falta: "José (cliente) e Roberto (Lone)". */
export const quemFalta = (lista: SignatarioResumo[]) => juntar(lista.filter((s) => !s.assinou).map(quemAssina));
