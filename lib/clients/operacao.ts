// lib/clients/operacao.ts — "este cliente está em operação?" numa definição só.
//
// PRA QUE (Roberto, 23/08): "a contagem de clients está errada no dashboard, já temos mais cliente
// do que contabiliza". O dashboard mostrava 32 de 49. A causa não era o cálculo — era o critério:
// oito lugares diferentes decidiam "em operação" com `status !== "onboarding"`, e o status é um
// campo que alguém precisa lembrar de mudar na mão. Havia 17 clientes presos em "onboarding", o
// mais antigo com 125 dias de casa, grupo de WhatsApp, conta de anúncio, portal e cards entregues.
//
// Pior: eles sumiam das DUAS contagens — não eram "ativos" (status onboarding) e também não
// apareciam no card de Onboarding, que só mostra quem entrou nos últimos 7 dias.
//
// A regra aqui olha a REALIDADE (tem conta de anúncio? portal ligado? já postou?) em vez do campo.

import type { Client } from "@/lib/types";

/** Dias em que um cliente novo ainda é considerado "chegando". */
export const DIAS_ONBOARDING = 7;

/** Sinais de que o cliente já está sendo atendido de verdade, independentemente do status. */
export function jaOpera(c: Client): boolean {
  return !!c.metaAdAccountId || !!c.publicReportEnabled || !!c.instagramUser || !!c.lastPostDate;
}

/** Entrou nos últimos DIAS_ONBOARDING dias. Sem data de entrada = não é recente. */
export function chegouAgora(c: Client): boolean {
  return !!c.createdAt && new Date(c.createdAt).getTime() >= Date.now() - DIAS_ONBOARDING * 86_400_000;
}

/** Em setup DE VERDADE: entrou esta semana e ainda não tem nada ligado. */
export function emSetupInicial(c: Client): boolean {
  return c.status === "onboarding" && chegouAgora(c) && !jaOpera(c);
}

/** EM OPERAÇÃO: todo cliente da carteira que não está em setup inicial. Use isto em toda contagem
 *  de "meus clientes", "clientes ativos", checklists e rateios de carteira. */
export function emOperacao(c: Client): boolean {
  return !emSetupInicial(c);
}

/** Status desatualizado: marcado como onboarding, mas já opera ou já passou da primeira semana.
 *  Serve pra AVISAR o time — o cadastro precisa ser promovido. */
export function onboardingDesatualizado(c: Client): boolean {
  return c.status === "onboarding" && !emSetupInicial(c);
}
