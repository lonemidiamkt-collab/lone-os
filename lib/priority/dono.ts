// lib/priority/dono.ts — o DONO da recomendação é uma pessoa da equipe, com o nome do cadastro.
//
// As fontes escrevem o responsável de jeitos diferentes: clients.assigned_social diz "Carlos", o
// snapshot diz "Carlos Augusto", tasks.assigned_to pode dizer "social" ou "time", a escalada diz
// "Julio e Roberto". No primeiro feed real (14/09) o Carlos apareceu como duas pessoas (71 + 30
// itens) e a lista pessoal dele acharia metade. Aqui tudo vira o nome de team_members — ou um papel,
// quando o texto é um papel.

import type { PapelDono } from "./tipos";

export interface MembroRef { nome: string; papel: PapelDono }

const sem = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const PAPEL_POR_PALAVRA: Record<string, PapelDono> = {
  social: "social", "social media": "social", designer: "designer", design: "designer", trafego: "traffic", traffic: "traffic",
  gestor: "manager", gerente: "manager", manager: "manager", admin: "admin", comercial: "comercial", sdr: "comercial",
  time: "manager", equipe: "manager", gestao: "manager",
};

export function normalizarDono(raw: string | null | undefined, papelPadrao: PapelDono, equipe: MembroRef[]): { owner: string | null; ownerRole: PapelDono } {
  const t = sem(raw ?? "");
  if (!t) return { owner: null, ownerRole: papelPadrao };
  if (PAPEL_POR_PALAVRA[t]) return { owner: null, ownerRole: PAPEL_POR_PALAVRA[t] };
  // "Julio e Roberto" → o primeiro nome é quem age; o resto é cópia.
  const primeiro = t.split(/\s+e\s+|\s*[,/&]\s*/)[0].trim();
  const exato = equipe.find((m) => sem(m.nome) === primeiro);
  if (exato) return { owner: exato.nome, ownerRole: exato.papel };
  const porPrimeiroNome = equipe.filter((m) => sem(m.nome).split(/\s+/)[0] === primeiro.split(/\s+/)[0]);
  if (porPrimeiroNome.length === 1) return { owner: porPrimeiroNome[0].nome, ownerRole: porPrimeiroNome[0].papel };
  // Nome que não é da equipe (ex-funcionário, apelido): fica como veio, com o papel da fonte.
  return { owner: raw!.trim(), ownerRole: papelPadrao };
}
