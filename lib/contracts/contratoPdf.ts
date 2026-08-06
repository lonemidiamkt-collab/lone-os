// lib/contracts/contratoPdf.ts — contrato preenchido, em PDF, pra mandar no WhatsApp.
//
// PRA QUE (Roberto, 05/08): quando o cliente termina o cadastro, o agente avisa no grupo e oferece
// gerar o contrato. O Roberto responde com valor e dia de vencimento e recebe o arquivo pronto pra
// encaminhar pra assinatura — sem abrir a plataforma.
//
// POR QUE PDF E NÃO O .DOCX QUE JÁ EXISTE. O gerador oficial produz .docx (é o que sobe no D4Sign).
// No WhatsApp, .docx abre mal no celular e vira "baixe um app pra visualizar" — o cliente não lê.
// O .docx continua sendo o oficial: este PDF é pra LER e assinar.
//
// A ESTRUTURA É A DOS CONTRATOS REAIS DA CASA (06/08). A primeira versão saía com três cláusulas
// genéricas, sem pagamento, sem rescisão e sem foro — documento que parece contrato e não protege
// ninguém. Agora segue o modelo assinado de verdade: qualificação completa das duas partes,
// quadro-resumo, cláusulas numeradas por extenso e blocos de assinatura.

import { supabaseAdmin } from "@/lib/supabase/server";
import { CONTRATADA } from "@/lib/contracts/contratada";

/** Padrão da casa: ciclos de 3 meses com renovação automática. Teste/projeto = prazo determinado. */
export type Modalidade = "ciclos" | "determinado";

export interface DadosComerciais {
  valorMensal: number;
  diaPagamento: number;
  /** Só na modalidade "determinado" (ex.: teste de 30 dias). Nos ciclos, a vigência é a padrão. */
  duracaoMeses?: number;
  modalidade?: Modalidade;
}

export interface ContratoMontado {
  ok: boolean;
  html?: string;
  nomeArquivo?: string;
  cliente?: string;
  /** O que faltou no cadastro. Contrato com lacuna é pior que contrato não gerado. */
  faltando?: string[];
  erro?: string;
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const ORDINAIS = [
  "PRIMEIRA", "SEGUNDA", "TERCEIRA", "QUARTA", "QUINTA", "SEXTA", "SÉTIMA", "OITAVA", "NONA",
  "DÉCIMA", "DÉCIMA PRIMEIRA", "DÉCIMA SEGUNDA", "DÉCIMA TERCEIRA", "DÉCIMA QUARTA", "DÉCIMA QUINTA",
];

const TITULO_POR_SERVICO: Record<string, string> = {
  lone_growth: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MARKETING DIGITAL — LONE GROWTH",
  assessoria_trafego: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MARKETING DIGITAL — TRÁFEGO PAGO",
  assessoria_social: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MARKETING DIGITAL — SOCIAL MEDIA",
  assessoria_design: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE DESIGN",
  trafego_social_site: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MARKETING DIGITAL",
};

const NOME_DO_SERVICO: Record<string, string> = {
  lone_growth: "Lone Growth",
  assessoria_trafego: "Assessoria de Tráfego Pago",
  assessoria_social: "Assessoria de Social Media",
  assessoria_design: "Assessoria de Design",
  trafego_social_site: "Tráfego, Social Media e Site",
};

/** Extenso do valor — contrato sem valor por extenso levanta dúvida na hora de assinar. */
function porExtenso(n: number): string {
  const u = ["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove","dez","onze","doze","treze","quatorze","quinze","dezesseis","dezessete","dezoito","dezenove"];
  const d = ["","","vinte","trinta","quarenta","cinquenta","sessenta","setenta","oitenta","noventa"];
  const c = ["","cento","duzentos","trezentos","quatrocentos","quinhentos","seiscentos","setecentos","oitocentos","novecentos"];
  const ate999 = (v: number): string => {
    if (v === 100) return "cem";
    const cen = Math.floor(v / 100), res = v % 100;
    const parteC = cen ? c[cen] : "";
    const parteD = res < 20 ? u[res] : `${d[Math.floor(res / 10)]}${res % 10 ? ` e ${u[res % 10]}` : ""}`;
    return [parteC, res ? parteD : ""].filter(Boolean).join(" e ");
  };
  const inteiro = Math.floor(n);
  if (inteiro === 0) return "zero reais";
  const mil = Math.floor(inteiro / 1000), resto = inteiro % 1000;
  const partes: string[] = [];
  if (mil) partes.push(mil === 1 ? "mil" : `${ate999(mil)} mil`);
  if (resto) partes.push(ate999(resto));
  return `${partes.join(" e ")} ${inteiro === 1 ? "real" : "reais"}`;
}

const EXT_NUM = ["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove","dez",
  "onze","doze","treze","quatorze","quinze","dezesseis","dezessete","dezoito","dezenove","vinte"];
const numExt = (n: number) => (n <= 20 ? EXT_NUM[n] : String(n));

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Corpo da cláusula: parágrafos por linha em branco, alíneas mantidas como linha própria. */
function corpoHtml(txt: string): string {
  return txt
    .split(/\n{2,}/)
    .map((bloco) => {
      const linhas = bloco.split("\n").map((l) => l.trim()).filter(Boolean);
      // Lista de alíneas (a), b)… / I –, II –) ganha recuo, não vira parágrafo corrido.
      const ehLista = linhas.length > 1 && linhas.every((l) => /^([a-z]\)|[IVX]+\s*[–-]|\d+\.\d+)/.test(l));
      if (ehLista) return `<ul class="alineas">${linhas.map((l) => `<li>${l}</li>`).join("")}</ul>`;
      return `<p>${linhas.join("<br/>")}</p>`;
    })
    .join("");
}

/**
 * Monta o HTML do contrato com os dados do cadastro + os números comerciais.
 *
 * Só devolve `ok` quando NÃO falta nada do cliente. Contrato com "CNPJ: ___" chegando no WhatsApp
 * é pior que um aviso dizendo o que preencher — por isso a lacuna vira lista, não placeholder.
 */
export async function montarContratoHtml(
  clientId: string,
  com: DadosComerciais,
): Promise<ContratoMontado> {
  const { data: cli } = await supabaseAdmin.from("clients").select("*").eq("id", clientId).maybeSingle();
  if (!cli) return { ok: false, erro: "Cliente não encontrado." };
  const c = cli as Record<string, unknown>;

  const fantasia = (c.nome_fantasia as string) || (c.name as string) || "";
  // Contrato qualifica pela RAZÃO SOCIAL — é ela que assina. Nome fantasia é só referência.
  const razao = (c.razao_social as string) || fantasia;

  const faltando: string[] = [];
  if (!razao) faltando.push("razão social");
  if (!c.cnpj) faltando.push("CNPJ");
  if (!c.contact_name) faltando.push("nome do representante");
  if (!c.cpf_cnpj) faltando.push("CPF do representante");
  if (!c.endereco_rua && !c.endereco) faltando.push("endereço");
  if (!c.endereco_cidade) faltando.push("cidade");
  if (faltando.length) return { ok: false, cliente: fantasia || "cliente", faltando };

  const tipo = (c.service_type as string) || "lone_growth";
  const { data: tpl } = await supabaseAdmin
    .from("contract_templates").select("clauses, conditional_clauses").eq("service_type", tipo).maybeSingle();

  type Clausula = { id: string; title: string; body: string; enabled?: boolean };
  const fixas = (tpl?.clauses as Clausula[]) ?? [];
  const condicionais = ((tpl?.conditional_clauses as Clausula[]) ?? []).filter((x) => x.enabled);
  if (!fixas.length) {
    return { ok: false, cliente: fantasia, erro: `Não há modelo de contrato cadastrado para "${tipo}". Cadastre em Configurações.` };
  }

  const modalidade: Modalidade = com.modalidade ?? "ciclos";
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const anoAtual = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric" });

  const endereco = [
    (c.endereco_rua as string) || (c.endereco as string),
    (c.endereco_bairro as string),
    `${c.endereco_cidade as string}${c.endereco_estado ? `/${c.endereco_estado}` : ""}`,
    (c.endereco_cep as string) ? `CEP ${c.endereco_cep}` : "",
  ].filter(Boolean).join(", ");

  const segmento = ((c.nicho as string) || (c.industry as string) || "").trim();
  const emailCliente = ((c.email as string) || (c.email_corporativo as string) || "").trim();
  const servico = NOME_DO_SERVICO[tipo] ?? "Assessoria de Marketing";

  // Substitui os marcadores das cláusulas. Marcador que sobrar aparece no documento — de propósito:
  // sumir seria pior, porque ninguém veria que faltou preencher.
  const trocar = (txt: string) => esc(txt)
    .replace(/\{\{\s*cliente_razao_social\s*\}\}/g, esc(razao))
    .replace(/\{\{\s*cliente_nome_fantasia\s*\}\}/g, esc(fantasia))
    .replace(/\{\{\s*cliente_cnpj\s*\}\}/g, esc(c.cnpj))
    .replace(/\{\{\s*cliente_endereco\s*\}\}/g, esc(endereco))
    .replace(/\{\{\s*cliente_representante_nome\s*\}\}/g, esc(c.contact_name))
    .replace(/\{\{\s*cliente_representante_cpf\s*\}\}/g, esc(c.cpf_cnpj))
    .replace(/\{\{\s*servico\s*\}\}/g, esc(servico))
    .replace(/\{\{\s*valor_mensal\s*\}\}/g, brl(com.valorMensal))
    .replace(/\{\{\s*valor_mensal_extenso\s*\}\}/g, porExtenso(com.valorMensal))
    .replace(/\{\{\s*dia_pagamento\s*\}\}/g, `${String(com.diaPagamento).padStart(2, "0")} (${numExt(com.diaPagamento)})`)
    .replace(/\{\{\s*duracao_meses\s*\}\}/g, String(com.duracaoMeses ?? 3));

  const clausulasHtml = [...fixas, ...condicionais]
    .map((cl, i) => `<section class="clausula">
        <h2>CLÁUSULA ${ORDINAIS[i] ?? `${i + 1}ª`} – ${esc(cl.title)}</h2>
        ${corpoHtml(trocar(cl.body))}
      </section>`)
    .join("");

  const linhaVigencia = modalidade === "ciclos"
    ? `<p><strong>Organização da vigência:</strong> ciclos sucessivos de 3 (três) meses.</p>
       <p><strong>Renovação:</strong> automática por períodos sucessivos de 3 (três) meses, salvo alteração acordada entre as partes.</p>
       <p><strong>Encerramento:</strong> permitido a qualquer momento, mediante aviso prévio escrito de 30 (trinta) dias e indicação breve do motivo.</p>
       <p><strong>Valor mensal:</strong> ${brl(com.valorMensal)} (${porExtenso(com.valorMensal)}).</p>
       <p><strong>Vencimento:</strong> primeira mensalidade após a assinatura e antes do início dos serviços; mensalidades seguintes no dia ${String(com.diaPagamento).padStart(2, "0")} de cada mês.</p>`
    : `<p><strong>Prazo:</strong> ${com.duracaoMeses ?? 1} ${(com.duracaoMeses ?? 1) === 1 ? "mês" : "meses"}, a contar do início dos serviços.</p>
       <p><strong>Renovação automática:</strong> não haverá.</p>
       <p><strong>Valor mensal:</strong> ${brl(com.valorMensal)} (${porExtenso(com.valorMensal)}).</p>
       <p><strong>Vencimento:</strong> primeira mensalidade após a assinatura e antes do início dos serviços; mensalidades seguintes no dia ${String(com.diaPagamento).padStart(2, "0")} de cada mês.</p>`;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    @page { margin: 20mm 18mm; }
    * { box-sizing: border-box; }
    body { font-family: Georgia, "Times New Roman", serif; color:#111; font-size:10.5pt; line-height:1.6; margin:0; }
    h1 { font-size:14pt; text-align:center; margin:0 0 26px; line-height:1.35; letter-spacing:.3px; }
    h2 { font-size:11pt; margin:22px 0 8px; break-after:avoid; }
    p { margin:0 0 8px; text-align:justify; }
    .abertura { margin-bottom:14px; }
    .parte { margin:0 0 10px; text-align:justify; }
    .resumo { border:1px solid #d8dce4; border-radius:4px; padding:14px 16px; margin:18px 0 8px; break-inside:avoid; }
    .resumo h2 { margin:0 0 10px; font-size:10.5pt; letter-spacing:.5px; }
    .resumo p { margin:0 0 5px; text-align:left; }
    .clausula { break-inside:avoid; }
    ul.alineas { margin:0 0 8px; padding-left:20px; list-style:none; }
    ul.alineas li { margin:0 0 4px; text-align:justify; }
    .fecho { margin-top:26px; }
    .data { margin-top:18px; font-weight:bold; }
    .assinaturas { margin-top:34px; }
    .bloco-assinatura { break-inside:avoid; margin-top:30px; padding-top:10px; border-top:1px solid #333; }
    .bloco-assinatura strong { display:block; font-size:10.5pt; }
    .bloco-assinatura span { display:block; font-size:9.5pt; color:#333; }
    .linha-assinar { margin-top:26px; font-size:10pt; }
    footer { margin-top:30px; padding-top:8px; border-top:1px solid #e0e3ea; text-align:center; color:#777; font-size:8.5pt; }
  </style></head><body>

    <h1>${esc(TITULO_POR_SERVICO[tipo] ?? TITULO_POR_SERVICO.trafego_social_site)}</h1>

    <p class="abertura">Pelo presente instrumento particular, as partes abaixo identificadas:</p>

    <p class="parte"><strong>CONTRATADA:</strong> ${esc(CONTRATADA.razaoSocial)}, pessoa jurídica inscrita no CNPJ sob o nº ${esc(CONTRATADA.cnpj)}, com sede na ${esc(CONTRATADA.endereco)}, neste ato representada por ${esc(CONTRATADA.representantes)}, e-mail: ${esc(CONTRATADA.email)}.</p>

    <p class="parte"><strong>CONTRATANTE:</strong> ${esc(razao)}, pessoa jurídica inscrita no CNPJ sob o nº ${esc(c.cnpj)}, com sede na ${esc(endereco)}, neste ato representada por ${esc(c.contact_name)}, inscrito no CPF sob o nº ${esc(c.cpf_cnpj)}${c.contact_role ? `, na qualidade de ${esc(c.contact_role)}` : ""}${emailCliente ? `, e-mail: ${esc(emailCliente)}` : ""}.</p>

    <p class="parte">As partes resolvem celebrar o presente Contrato de Prestação de Serviços de Marketing Digital — ${esc(servico)}, mediante as cláusulas seguintes.</p>

    <div class="resumo">
      <h2>QUADRO-RESUMO DA CONTRATAÇÃO</h2>
      <p><strong>Serviço contratado:</strong> ${esc(servico)}.</p>
      ${segmento ? `<p><strong>Segmento da CONTRATANTE:</strong> ${esc(segmento)}.</p>` : ""}
      ${linhaVigencia}
      <p><strong>Investimento em anúncios:</strong> não incluído no valor mensal e pago separadamente pela CONTRATANTE.</p>
      <p><strong>Atendimento:</strong> de segunda a sexta-feira, das 9h às 18h, exceto feriados.</p>
      <p><strong>Canais oficiais de comunicação:</strong> grupo de WhatsApp e e-mails informados pelas partes.</p>
    </div>

    ${clausulasHtml}

    <div class="fecho">
      <p>E, por estarem de acordo, as partes assinam o presente instrumento.</p>
      <p class="data">${esc(CONTRATADA.comarca)}, _____ de ______________________________ de ${esc(anoAtual)}.</p>
    </div>

    <div class="assinaturas">
      <div class="bloco-assinatura">
        <strong>${esc(CONTRATADA.razaoSocial)}</strong>
        <span>CNPJ nº ${esc(CONTRATADA.cnpj)}</span>
        <span>Representada por ${esc(CONTRATADA.representantesNomes)}</span>
        <div class="linha-assinar">Assinatura: __________________________________________</div>
      </div>
      <div class="bloco-assinatura">
        <strong>${esc(razao)}</strong>
        <span>CNPJ nº ${esc(c.cnpj)}</span>
        <span>Representada por ${esc(c.contact_name)}</span>
        <div class="linha-assinar">Assinatura: __________________________________________</div>
      </div>
    </div>

    <footer>Documento gerado pelo Lone OS em ${hoje} · ${esc(CONTRATADA.nomeFantasia)}</footer>
  </body></html>`;

  const slug = fantasia.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

  return { ok: true, html, cliente: fantasia, nomeArquivo: `contrato-${slug}.pdf` };
}
