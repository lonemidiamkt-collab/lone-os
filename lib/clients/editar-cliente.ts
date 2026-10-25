// lib/clients/editar-cliente.ts — o "Editar cliente" (components/EditClientModal.tsx) só grava o que
// a pessoa mudou.
//
// 24/10/2026 (auditoria de erro recuperável, 3.1): o modal abria antes de os dados completos chegarem
// (CPF, endereço e logins vêm depois, por /api/clients/[id]) e o "Salvar" mandava o formulário
// INTEIRO — o vazio de um campo que ainda não tinha carregado virava null e apagava o dado no banco.
// A ficha agora trava o "Editar" até carregar; e, mesmo assim, o salvar manda só a diferença entre o
// formulário que abriu e o que a pessoa deixou: campo que ninguém tocou nunca vira instrução de apagar.

import type { Client } from "@/lib/types";
import type { ClientPatch } from "@/stores/useClientsStore";
import { temSocial as contratouSocial } from "@/lib/clients/servico";

export interface FormEdicao {
  contactName: string; cpfCnpj: string; idade: string; phone: string; email: string;
  nomeFantasia: string; razaoSocial: string; cnpj: string; endereco: string; emailCorporativo: string;
  industry: string; leadSource: string; notes: string;
  serviceType: string; paymentMethod: string;
  assignedTraffic: string; assignedSocial: string; assignedDesigner: string;
  metaAdAccountId: string;
  facebookLogin: string; facebookPassword: string;
  googleAdsLogin: string; googleAdsPassword: string;
  instagramLogin: string; instagramPassword: string;
  instagramUser: string; toneOfVoice: string; driveLink: string; postsGoal: string;
  contractEnd: string; campaignBriefing: string; fixedBriefing: string;
}

/** O formulário como ele abre, a partir do cliente que a ficha mostra. */
export function formDoCliente(client: Client): FormEdicao {
  return {
    contactName: client.contactName ?? "",
    cpfCnpj: client.cpfCnpj ?? "",
    idade: client.idade ?? "",
    phone: client.phone ?? "",
    email: client.email ?? "",
    nomeFantasia: client.nomeFantasia ?? client.name ?? "",
    razaoSocial: client.razaoSocial ?? "",
    cnpj: client.cnpj ?? "",
    endereco: client.endereco ?? "",
    emailCorporativo: client.emailCorporativo ?? "",
    industry: client.industry ?? "Outro",
    leadSource: client.leadSource ?? "indicacao",
    notes: client.notes ?? "",
    serviceType: client.serviceType ?? "lone_growth",
    paymentMethod: client.paymentMethod ?? "pix",
    assignedTraffic: client.assignedTraffic ?? "",
    assignedSocial: client.assignedSocial ?? "",
    assignedDesigner: client.assignedDesigner ?? "",
    metaAdAccountId: client.metaAdAccountId ?? "",
    facebookLogin: client.facebookLogin ?? "",
    facebookPassword: client.facebookPassword ?? "",
    googleAdsLogin: client.googleAdsLogin ?? "",
    googleAdsPassword: client.googleAdsPassword ?? "",
    instagramLogin: client.instagramLogin ?? "",
    instagramPassword: client.instagramPassword ?? "",
    instagramUser: client.instagramUser ?? "",
    toneOfVoice: client.toneOfVoice ?? "",
    driveLink: client.driveLink ?? "",
    postsGoal: String(client.postsGoal ?? 12),
    contractEnd: client.contractEnd ?? "",
    campaignBriefing: client.campaignBriefing ?? "",
    fixedBriefing: client.fixedBriefing ?? "",
  };
}

/** Quem aparece na equipe responsável — a mesma regra que a tela usa para mostrar cada campo. */
export function camposDaEquipe(serviceType: string, client: Client) {
  const temTraffic = !!client.assignedTraffic;
  const temSocial = !!client.assignedSocial;
  const temDesigner = !!client.assignedDesigner;
  return {
    temSocial,
    needsTraffic: serviceType === "lone_growth" || serviceType === "assessoria_trafego" || temTraffic,
    // Social segue o contrato, não quem já estava gravado (30/09) — ver o comentário no modal.
    needsSocial: contratouSocial({ service_type: serviceType }),
    needsDesigner: serviceType === "lone_growth" || serviceType === "assessoria_design"
      || serviceType === "assessoria_social"   // social sem designer não produz arte
      || temDesigner,
  };
}

/** O formulário inteiro traduzido para o patch do cliente (`null` apaga, `undefined` não mexe). */
export function patchDoFormulario(form: FormEdicao, client: Client): ClientPatch {
  const { temSocial, needsTraffic, needsSocial, needsDesigner } = camposDaEquipe(form.serviceType, client);
  // Vazio vira null (apaga). `|| undefined` impedia limpar um dado errado.
  const v = (x: string) => (x.trim() ? x.trim() : null);
  return {
    name: form.nomeFantasia.trim() || form.razaoSocial.trim() || client.name,
    nomeFantasia: v(form.nomeFantasia),
    razaoSocial: v(form.razaoSocial),
    cnpj: v(form.cnpj),
    endereco: v(form.endereco),
    emailCorporativo: v(form.emailCorporativo),
    contactName: v(form.contactName),
    cpfCnpj: v(form.cpfCnpj),
    idade: v(form.idade),
    phone: v(form.phone),
    email: v(form.email),
    industry: form.industry,
    serviceType: form.serviceType as Client["serviceType"],
    paymentMethod: form.paymentMethod as Client["paymentMethod"],
    leadSource: form.leadSource as Client["leadSource"],
    // Campo escondido não pode virar instrução de apagar. Para tirar alguém da carteira, existe a
    // opção vazia no próprio select.
    assignedTraffic: needsTraffic ? form.assignedTraffic : undefined,
    // Sem social no contrato, grava vazio: aqui não é "campo escondido", é o serviço decidindo.
    assignedSocial: needsSocial ? form.assignedSocial : (temSocial ? "" : undefined),
    assignedDesigner: needsDesigner ? form.assignedDesigner : undefined,
    metaAdAccountId: form.metaAdAccountId
      ? (form.metaAdAccountId.startsWith("act_") ? form.metaAdAccountId : `act_${form.metaAdAccountId}`)
      : (client.metaAdAccountId ? null : undefined),
    facebookLogin: v(form.facebookLogin),
    googleAdsLogin: v(form.googleAdsLogin),
    instagramLogin: v(form.instagramLogin),
    instagramUser: v(form.instagramUser),
    toneOfVoice: (form.toneOfVoice as Client["toneOfVoice"]) || null,
    driveLink: v(form.driveLink),
    postsGoal: parseInt(form.postsGoal) || 12,
    contractEnd: v(form.contractEnd),
    campaignBriefing: v(form.campaignBriefing),
    fixedBriefing: v(form.fixedBriefing),
    notes: v(form.notes),
  };
}

/**
 * Só o que mudou entre o formulário que abriu (`inicial`) e o que a pessoa deixou (`atual`).
 * Compara o patch de um com o do outro — assim as regras derivadas (nome, conta `act_`, equipe que
 * depende do serviço) valem igual dos dois lados, e espaço sobrando não conta como mudança.
 */
export function soOQueMudou(inicial: FormEdicao, atual: FormEdicao, client: Client): ClientPatch {
  const antes = patchDoFormulario(inicial, client) as Record<string, unknown>;
  const depois = patchDoFormulario(atual, client) as Record<string, unknown>;
  const mudou: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(depois)) {
    if (v === undefined) continue;          // "não mexe" nunca vira gravação
    if (antes[k] === v) continue;
    mudou[k] = v;
  }
  return mudou as ClientPatch;
}

/** As senhas digitadas (vão cifradas pelo cofre, nunca pela rota de update). Vazio = manter a atual. */
export function senhasDigitadas(form: FormEdicao): [string, string][] {
  return ([
    ["facebook_password", form.facebookPassword],
    ["google_ads_password", form.googleAdsPassword],
    ["instagram_password", form.instagramPassword],
  ] as [string, string][]).filter(([, valor]) => !!valor);
}
