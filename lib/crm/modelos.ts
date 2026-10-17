// lib/crm/modelos.ts — MENSAGEM PRONTA de cada toque da cadência, sem IA. Módulo PURO, testado.
//
// O Hoje mostra o texto e o botão "Enviar no WhatsApp" abre o WhatsApp do Roberto com ele — quem
// envia é ele, do celular dele. Regras do texto: curto (até ~400 caracteres), sem emoji, sem preço,
// sem promessa de resultado, sem urgência falsa, o nome da pessoa e a loja para não parecer massa.
// Ligação e visita não têm mensagem: têm um roteiro de uma linha. A IA (Leva 3) só melhora este
// texto; se ela falhar, sai este.

import type { Passo } from "@/lib/crm/cadencia";

export interface LeadParaModelo {
  contatoNome: string;
  empresa: string | null;
  segmento?: string | null;
  observacoes?: string | null;
  origem?: string | null;
}

export type Saida = { tipo: "mensagem"; texto: string } | { tipo: "roteiro"; texto: string };

const REMETENTE = "Roberto";
const AGENCIA = "Lone Mídia";

/** "Paulo Lima e João Rocha" → "Paulo"; "Maria (Mari)" → "Maria"; nome = empresa → null. */
export function primeiroNome(contato: string | null | undefined, empresa?: string | null): string | null {
  const c = (contato ?? "").trim();
  if (!c) return null;
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (empresa && norm(c) === norm(empresa)) return null;
  if (/^respons[aá]vel\b/i.test(c)) return null;
  const primeiro = c.split(/\s+e\s+|,|\(|\//)[0].trim().split(/\s+/)[0];
  if (!primeiro || primeiro.length < 2) return null;
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}

/** O desafio que a pessoa escreveu no formulário do site ("Desafio: …" nas observações), curto. */
export function desafioDoSite(obs: string | null | undefined): string | null {
  const m = /Desafio:\s*(.+)/.exec(obs ?? "");
  if (!m) return null;
  const t = m[1].trim().replace(/[.!?]+$/, "");
  return t.length > 70 ? `${t.slice(0, 67).trimEnd()}…` : t;
}

function saudacao(nome: string | null): string {
  return nome ? `Oi, ${nome}!` : "Oi, tudo bem?";
}

const daLoja = (empresa: string | null) => (empresa ? `da ${empresa}` : "de vocês");
const naLoja = (empresa: string | null) => (empresa ? `na ${empresa}` : "aí na loja");

export function mensagemDoToque(passo: Passo, lead: LeadParaModelo): Saida {
  const nome = primeiroNome(lead.contatoNome, lead.empresa);
  const oi = saudacao(nome);
  const emp = lead.empresa?.trim() || null;
  const seg = lead.segmento?.trim().toLowerCase() || null;

  switch (passo.chave) {
    case "novo_primeiro": {
      const desafio = desafioDoSite(lead.observacoes);
      const veio = lead.origem === "Site" || lead.origem === "Anúncio → site" ? "Vi seu cadastro no nosso site" : "Tudo bem por aí";
      const sobre = desafio ? ` e o que você escreveu sobre "${desafio}"` : "";
      return { tipo: "mensagem", texto: `${oi} Aqui é o ${REMETENTE}, da ${AGENCIA}. ${veio}${sobre}. Posso te mostrar em 15 minutos o que dá para ajustar no Instagram ${daLoja(emp)} para trazer mais cliente? Fica melhor hoje à tarde ou amanhã de manhã?` };
    }
    case "contato_d0":
      return { tipo: "mensagem", texto: `${oi} Aqui é o ${REMETENTE}, da ${AGENCIA}. Obrigado pela conversa ${naLoja(emp)}. Posso seguir por aqui? Vou separar um raio-x do Instagram ${daLoja(emp)} e te mostro em 15 minutos o que dá para melhorar.` };
    case "contato_d2":
      return { tipo: "mensagem", texto: `${oi} Dei uma olhada no Instagram ${daLoja(emp)}: dá para transformar o que vocês já postam em mais pedido no WhatsApp, sem complicar a rotina. Quer que eu te mostre como em 15 minutos? Quinta ou sexta fica bom?` };
    case "contato_d5":
      return { tipo: "roteiro", texto: `Ligar${nome ? ` para ${nome}` : ""}: lembrar da visita ${naLoja(emp)}, perguntar como estão as vendas pelo Instagram/WhatsApp e marcar o raio-x de 15 minutos (dar duas opções de horário).` };
    case "contato_d9":
      return { tipo: "mensagem", texto: `${oi} Ajudamos uma loja${seg ? ` de ${seg}` : ""} aqui da região a organizar o Instagram e os anúncios, e o WhatsApp dela passou a receber mais pedido. Posso te mostrar o que fizemos lá e o que eu faria ${naLoja(emp)}? São 15 minutos.` };
    case "contato_d14":
      return { tipo: "roteiro", texto: `Passar ${naLoja(emp)}${nome ? ` e procurar ${nome}` : ""}: levar o raio-x do Instagram aberto no celular e mostrar 2 ou 3 ajustes rápidos. Sair com dia marcado ou com o motivo do "agora não".` };
    case "contato_d21":
      return { tipo: "mensagem", texto: `${oi} Vou parar de te mandar mensagem para não incomodar. Quando quiser ver o raio-x do Instagram ${daLoja(emp)}, é só me chamar aqui. Um abraço, ${REMETENTE}.` };
    case "diagnostico_d1":
      return { tipo: "mensagem", texto: `${oi} Obrigado pelo tempo de ontem. Vou fechar a proposta com o que conversamos sobre ${emp ?? "a loja"} e te mando nos próximos dias. Se lembrar de mais alguma coisa importante, me fala por aqui.` };
    case "diagnostico_d3":
      return { tipo: "roteiro", texto: `Ligar${nome ? ` para ${nome}` : ""}: tirar dúvidas do diagnóstico, confirmar quem decide e combinar o dia de apresentar a proposta.` };
    case "proposta_d1":
      return { tipo: "mensagem", texto: `${oi} Conseguiu abrir a proposta que te mandei? Qualquer ponto que queira ajustar, me fala que eu adapto para ${emp ?? "vocês"}.` };
    case "proposta_d3":
      return { tipo: "roteiro", texto: `Ligar${nome ? ` para ${nome}` : ""}: perguntar o que achou da proposta, o que pesa na decisão e quem mais precisa aprovar. Combinar o próximo passo com data.` };
    case "proposta_d7":
      return { tipo: "mensagem", texto: `${oi} Consegue me dar um retorno sobre a proposta esta semana? Se o momento não for agora, sem problema: me fala que eu volto a te procurar mais para frente.` };
    case "negociacao":
      return { tipo: "mensagem", texto: `${oi} Como ficou do seu lado? Se estiver tudo certo, já deixo o início organizado para ${emp ?? "vocês"}. Se faltar alguma coisa para decidir, me fala o que é.` };
    default:
      return { tipo: "mensagem", texto: `${oi} Aqui é o ${REMETENTE}, da ${AGENCIA}. Passando para saber se posso te ajudar com o Instagram ${daLoja(emp)}.` };
  }
}

/** Mensagem para lead parado (esfriando) ou retomada — sem passo da régua. */
export function mensagemDeRetomada(lead: LeadParaModelo): Saida {
  const nome = primeiroNome(lead.contatoNome, lead.empresa);
  const emp = lead.empresa?.trim() || null;
  return { tipo: "mensagem", texto: `${saudacao(nome)} Aqui é o ${REMETENTE}, da ${AGENCIA}. Lembrei da nossa conversa${emp ? ` sobre a ${emp}` : ""}. Faz sentido retomarmos? Tenho 15 minutos esta semana para te mostrar o raio-x do Instagram.` };
}

/** Link do WhatsApp Web com o texto pronto (só dígitos; DDI 55 quando não vier). */
export function waComTexto(telefone: string | null | undefined, texto: string): string | null {
  let d = String(telefone ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (!d.startsWith("55")) d = `55${d}`;
  return `https://web.whatsapp.com/send?phone=${d}&text=${encodeURIComponent(texto)}`;
}
