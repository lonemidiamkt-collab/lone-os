// O TERMO DE ENCERRAMENTO EM PDF.
//
// Roberto (09/09): "hoje a Lone Mídia já utiliza um modelo de termo. Quero transformar esse
// modelo em um template automático dentro do Lone OS."
//
// A regra que atravessa este arquivo, e que veio dele com todas as letras: **não afirmar o que
// ninguém conferiu**. As frases sobre financeiro e entregas vêm de `frasesDoTermo`, que devolve
// "não foi conferido" quando é o caso. Um documento que o cliente assina dizendo "todos os
// débitos quitados" sem alguém ter olhado é pior que um documento incompleto — e é o tipo de
// frase que volta como problema meses depois.

import { frasesDoTermo, INICIATIVAS, rotuloMotivo, tempoDeParceria, type Offboarding } from "@/lib/clients/offboarding";

const BRAND = "#2b3cff";
const TINTA = "#111318";
const SUAVE = "#5d6470";
const LINHA = "#e3e6ec";

const esc = (s: string) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const dataBR = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00-03:00`)
    .toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

export interface DadosTermo {
  /** CONTRATADA — vem de agency_settings, não é chumbado. */
  agencia: { razaoSocial: string; nomeFantasia: string; cnpj: string };
  /** CONTRATANTE — da ficha do cliente. */
  cliente: {
    nomeFantasia: string; razaoSocial: string | null; cnpj: string | null;
    responsavel: string | null;
  };
  inicioParceria: string;      // YYYY-MM-DD
  offboarding: Offboarding;
  servicos: string[];
  entregasExtra: string[];
  /** Cidade do cliente, para o fecho do documento. */
  cidade: string | null;
}

export function termoHtml(d: DadosTermo, logo: string): string {
  const o = d.offboarding;
  const frases = frasesDoTermo(o);
  const tempo = tempoDeParceria(d.inicioParceria, o.encerraEm);

  const linhaDado = (r: string, v: string | null) => v
    ? `<tr><td style="padding:3px 12px 3px 0;color:${SUAVE};white-space:nowrap">${esc(r)}</td>
         <td style="padding:3px 0;color:${TINTA};font-weight:500">${esc(v)}</td></tr>`
    : "";

  const lista = (itens: string[]) => itens.length
    ? `<ul style="margin:6px 0 0;padding-left:18px">${itens
        .map((i) => `<li style="margin:3px 0">${esc(i)}</li>`).join("")}</ul>`
    : `<p style="margin:6px 0 0;color:${SUAVE}">Nenhum serviço registrado.</p>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: Helvetica, Arial, sans-serif; color: ${TINTA}; font-size: 11pt; line-height: 1.6; margin: 0; }
  h1 { font-size: 15pt; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 11pt; margin: 20px 0 4px; color: ${BRAND}; text-transform: uppercase; letter-spacing: .06em; }
  p { margin: 6px 0; }
  .topo { display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid ${BRAND}; padding-bottom:10px; }
  .bloco { border:1px solid ${LINHA}; border-radius:6px; padding:10px 12px; margin-top:6px; }
  .assinatura { margin-top:34px; page-break-inside:avoid; }
  .linha-assinatura { border-top:1px solid ${TINTA}; width:260px; margin-top:38px; padding-top:4px; font-size:9.5pt; color:${SUAVE}; }
  .aviso { border-left:3px solid ${BRAND}; padding-left:10px; margin-top:8px; }
</style></head><body>

  <div class="topo">
    <div>
      <h1>Termo de Encerramento de Prestação de Serviços</h1>
      <p style="margin:0;color:${SUAVE};font-size:9.5pt">
        ${esc(d.cliente.nomeFantasia)} &middot; emitido em ${dataBR(new Date().toISOString())}
      </p>
    </div>
    ${logo ? `<img src="${logo}" style="height:34px" alt="">` : ""}
  </div>

  <h2>Partes</h2>
  <div class="bloco">
    <p style="margin:0 0 6px"><strong>CONTRATADA</strong></p>
    <table style="border-collapse:collapse;font-size:10.5pt">
      ${linhaDado("Razão social", d.agencia.razaoSocial)}
      ${linhaDado("Nome fantasia", d.agencia.nomeFantasia)}
      ${linhaDado("CNPJ", d.agencia.cnpj)}
    </table>
  </div>
  <div class="bloco">
    <p style="margin:0 0 6px"><strong>CONTRATANTE</strong></p>
    <table style="border-collapse:collapse;font-size:10.5pt">
      ${linhaDado("Empresa", d.cliente.razaoSocial || d.cliente.nomeFantasia)}
      ${linhaDado("Nome fantasia", d.cliente.razaoSocial ? d.cliente.nomeFantasia : null)}
      ${linhaDado("CNPJ", d.cliente.cnpj)}
      ${linhaDado("Responsável", d.cliente.responsavel)}
    </table>
  </div>

  <h2>Vigência</h2>
  <table style="border-collapse:collapse;font-size:10.5pt">
    ${linhaDado("Início da parceria", dataBR(d.inicioParceria))}
    ${linhaDado("Solicitação de encerramento", dataBR(o.solicitadoEm))}
    ${linhaDado("Encerramento efetivo", dataBR(o.encerraEm))}
    ${linhaDado("Tempo de parceria", tempo)}
    ${linhaDado("Encerramento por", INICIATIVAS[o.iniciativa])}
    ${linhaDado("Motivo", rotuloMotivo(String(o.motivo)))}
  </table>
  ${o.motivoDetalhe ? `<p style="margin-top:6px;color:${SUAVE}">${esc(o.motivoDetalhe)}</p>` : ""}

  <h2>Serviços prestados durante a parceria</h2>
  ${lista(d.servicos)}
  ${d.entregasExtra.length ? `<p style="margin-top:8px"><strong>Entregas adicionais</strong></p>${lista(d.entregasExtra)}` : ""}

  <h2>Situação financeira</h2>
  <p>${esc(frases.financeiro)}</p>

  <h2>Situação das entregas</h2>
  <p>${esc(frases.entregas)}</p>

  <h2>Responsabilidade até o encerramento</h2>
  <div class="aviso">
    <p style="margin:0">
      Até <strong>${dataBR(o.encerraEm)}</strong>, a ${esc(d.agencia.nomeFantasia)} permanece
      responsável pela operação contratada. A partir dessa data, cessam as obrigações de ambas as
      partes quanto à prestação dos serviços descritos neste termo.
    </p>
  </div>

  <div class="assinatura">
    <p>${d.cidade ? `${esc(d.cidade)}, ` : ""}${dataBR(new Date().toISOString())}.</p>
    <p style="margin-top:18px">Li e estou de acordo com o encerramento da prestação de serviços.</p>
    <div class="linha-assinatura">
      ${esc(d.cliente.responsavel || d.cliente.nomeFantasia)}<br>
      ${esc(d.cliente.razaoSocial || d.cliente.nomeFantasia)}
    </div>
    <div class="linha-assinatura">
      ${esc(d.agencia.nomeFantasia)}<br>
      ${esc(d.agencia.razaoSocial)}
    </div>
  </div>

</body></html>`;
}
