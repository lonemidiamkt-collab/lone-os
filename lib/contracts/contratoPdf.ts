// lib/contracts/contratoPdf.ts — contrato preenchido, em PDF, pra mandar no WhatsApp.
//
// PRA QUE (Roberto, 05/08): quando o cliente termina o cadastro, o agente avisa no grupo e
// oferece gerar o contrato. O Roberto responde com valor, duração e dia de pagamento, e recebe o
// arquivo pronto pra encaminhar pra assinatura — sem abrir a plataforma.
//
// POR QUE HTML→PDF E NÃO O .DOCX QUE JÁ EXISTE. O gerador oficial produz .docx (é o que sobe no
// D4Sign). No WhatsApp, .docx abre mal no celular e vira "baixe um app pra visualizar" — o cliente
// não lê. PDF abre direto. Então esta rota monta o MESMO conteúdo (as cláusulas do
// `contract_templates`, os mesmos dados do cadastro) na trilha de PDF que já usamos nos relatórios.
//
// O .docx continua sendo o oficial: este PDF é pra LER e assinar, não substitui o fluxo do D4Sign.

import { supabaseAdmin } from "@/lib/supabase/server";

export interface DadosComerciais {
  valorMensal: number;
  duracaoMeses: number;
  diaPagamento: number;
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

/** Extenso simples pro valor — contrato sem valor por extenso levanta dúvida na assinatura. */
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

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Monta o HTML do contrato com os dados do cadastro + os números comerciais.
 *
 * Só devolve `ok` quando NÃO falta nada do cliente. Contrato com "CNPJ: ___" chegando no WhatsApp
 * do cliente é pior que um aviso dizendo o que preencher — por isso a lacuna vira lista, não
 * placeholder.
 */
export async function montarContratoHtml(
  clientId: string,
  com: DadosComerciais,
): Promise<ContratoMontado> {
  const { data: cli } = await supabaseAdmin.from("clients").select("*").eq("id", clientId).maybeSingle();
  if (!cli) return { ok: false, erro: "Cliente não encontrado." };
  const c = cli as Record<string, unknown>;

  const nome = (c.nome_fantasia as string) || (c.name as string) || "";
  const faltando: string[] = [];
  if (!nome) faltando.push("razão social");
  if (!c.cnpj) faltando.push("CNPJ");
  if (!c.contact_name) faltando.push("nome do representante");
  if (!c.cpf_cnpj && !c.cpf) faltando.push("CPF do representante");
  if (!c.endereco_rua && !c.endereco) faltando.push("endereço");
  if (!c.endereco_cidade) faltando.push("cidade");
  if (faltando.length) return { ok: false, cliente: nome || "cliente", faltando };

  const tipo = (c.service_type as string) || "lone_growth";
  const { data: tpl } = await supabaseAdmin
    .from("contract_templates").select("clauses, conditional_clauses").eq("service_type", tipo).maybeSingle();

  type Clausula = { id: string; title: string; body: string; enabled?: boolean };
  const fixas = ((tpl?.clauses as Clausula[]) ?? []);
  const condicionais = ((tpl?.conditional_clauses as Clausula[]) ?? []).filter((x) => x.enabled);
  if (!fixas.length) {
    return { ok: false, cliente: nome, erro: `Não há modelo de contrato cadastrado para "${tipo}". Cadastre em Configurações.` };
  }

  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const endereco = [
    (c.endereco_rua as string) || (c.endereco as string),
    (c.endereco_numero as string), (c.endereco_bairro as string),
    (c.endereco_cidade as string), (c.endereco_estado as string), (c.endereco_cep as string),
  ].filter(Boolean).join(", ");

  // Substitui os marcadores das cláusulas pelos valores reais. Marcador que sobrar aparece no
  // documento — de propósito: some seria pior, porque ninguém veria que faltou preencher.
  const trocar = (txt: string) => esc(txt)
    .replace(/\{\{\s*cliente_razao_social\s*\}\}/g, esc(nome))
    .replace(/\{\{\s*cliente_cnpj\s*\}\}/g, esc(c.cnpj as string))
    .replace(/\{\{\s*cliente_endereco\s*\}\}/g, esc(endereco))
    .replace(/\{\{\s*cliente_representante_nome\s*\}\}/g, esc(c.contact_name as string))
    .replace(/\{\{\s*cliente_representante_cpf\s*\}\}/g, esc((c.cpf_cnpj as string) || (c.cpf as string)))
    .replace(/\{\{\s*valor_mensal\s*\}\}/g, brl(com.valorMensal))
    .replace(/\{\{\s*valor_mensal_extenso\s*\}\}/g, porExtenso(com.valorMensal))
    .replace(/\{\{\s*duracao_meses\s*\}\}/g, String(com.duracaoMeses))
    .replace(/\{\{\s*dia_pagamento\s*\}\}/g, String(com.diaPagamento))
    .replace(/\n/g, "<br/>");

  const clausulasHtml = [...fixas, ...condicionais]
    .map((cl, i) => `<section><h2>${i + 1}. ${esc(cl.title)}</h2><p>${trocar(cl.body)}</p></section>`)
    .join("");

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    @page { margin: 22mm 18mm; }
    body { font-family: Georgia, "Times New Roman", serif; color:#111; font-size:11pt; line-height:1.65; }
    h1 { font-size:15pt; text-align:center; margin:0 0 4px; letter-spacing:.5px; }
    .sub { text-align:center; color:#555; font-size:9.5pt; margin-bottom:22px; }
    h2 { font-size:11pt; margin:18px 0 6px; }
    section { break-inside: avoid; }
    .partes { background:#f6f7f9; border:1px solid #e3e6ec; border-radius:6px; padding:12px 14px; margin-bottom:18px; font-size:10pt; }
    .partes p { margin:4px 0; }
    .cond { margin:18px 0; padding:12px 14px; border:1px solid #e3e6ec; border-radius:6px; font-size:10pt; }
    .assin { margin-top:44px; display:flex; gap:40px; }
    .assin div { flex:1; text-align:center; border-top:1px solid #333; padding-top:6px; font-size:9.5pt; }
    footer { margin-top:26px; text-align:center; color:#777; font-size:8.5pt; }
  </style></head><body>
    <h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MARKETING</h1>
    <p class="sub">Lone Mídia · Assessoria de Marketing para Vendas</p>

    <div class="partes">
      <p><strong>CONTRATADA:</strong> Lone Mídia — Assessoria de Marketing para Vendas.</p>
      <p><strong>CONTRATANTE:</strong> ${esc(nome)}, CNPJ ${esc(c.cnpj as string)}, com sede em ${esc(endereco)}.</p>
      <p><strong>REPRESENTANTE:</strong> ${esc(c.contact_name as string)}, CPF ${esc((c.cpf_cnpj as string) || (c.cpf as string))}.</p>
    </div>

    <div class="cond">
      <strong>Condições comerciais</strong><br/>
      Valor mensal: <strong>${brl(com.valorMensal)}</strong> (${porExtenso(com.valorMensal)})<br/>
      Vigência: <strong>${com.duracaoMeses} meses</strong> a partir de ${hoje}<br/>
      Vencimento: todo dia <strong>${com.diaPagamento}</strong> de cada mês
    </div>

    ${clausulasHtml}

    <div class="assin">
      <div>Lone Mídia<br/><span style="color:#777">CONTRATADA</span></div>
      <div>${esc(c.contact_name as string)}<br/><span style="color:#777">${esc(nome)}</span></div>
    </div>
    <footer>Documento gerado pelo Lone OS em ${hoje} · para leitura e assinatura</footer>
  </body></html>`;

  const slug = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

  return { ok: true, html, cliente: nome, nomeArquivo: `contrato-${slug}.pdf` };
}
