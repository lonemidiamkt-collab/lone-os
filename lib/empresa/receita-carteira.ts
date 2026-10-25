// lib/empresa/receita-carteira.ts — consulta na Receita (BrasilAPI) o CNPJ dos clientes ativos (out/2026).
//
// Grava porte, atividade (CNAE) e situação na ficha. O nicho só é preenchido onde está vazio — o que a equipe definiu à
// mão vale mais que o palpite pelo CNAE (lib/empresa/receita.ts). Número e complemento do endereço: só os vazios e só
// com o mesmo CEP da Receita; endereço inteiro: ficha sem os campos recebe o do CNPJ quando o texto antigo está vazio ou
// bate com ele (lib/empresa/endereco.ts — autorizado pelo Roberto em 25/10/2026; nunca sobrescreve, o texto antigo fica).
// Avisa no sino do Roberto quando um CNPJ PASSA a constar não ativo (achado de 25/10/2026: cliente com a empresa extinta
// havia um mês, ficha e contrato ainda ativos). Usado por /api/system/receita-clientes (manual) e receita-vigia (cron).

import { supabaseAdmin } from "@/lib/supabase/server";
import { consultarCnpj } from "@/lib/empresa/receita-server";
import { colunasDaReceita, cnpjValido } from "@/lib/empresa/receita";
import { enderecoPelaReceita, numeroPelaReceita, type FichaSemEndereco } from "@/lib/empresa/endereco";
import { DESTINO_AVISOS_COMERCIAL } from "@/lib/crm/acesso"; // = o Roberto (o sino de gestão dele)

const TRINTA_DIAS = 30 * 24 * 60 * 60 * 1000;
const PAUSA_MS = 1500; // a BrasilAPI é gratuita: uma consulta por vez, com folga
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function rodarReceitaClientes({ aplicar, forcar }: { aplicar: boolean; forcar: boolean }) {
  const { data: clientes, error } = await supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, cnpj, nicho, receita_consultada_em, situacao_cadastral, endereco, endereco_cep, endereco_rua, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_estado")
    .eq("active", true).is("churned_at", null).is("draft_status", null);
  if (error) throw new Error(error.message);

  const agora = Date.now();
  const linhas: Record<string, unknown>[] = [];
  const pulados: { cliente: string; motivo: string }[] = [];
  let gravados = 0, nichos = 0, numeros = 0, enderecos = 0;
  const viraramNaoAtivas: { id: string; texto: string }[] = [];

  for (const c of clientes ?? []) {
    const nome = (c.nome_fantasia as string) || (c.name as string);
    if (!c.cnpj || !cnpjValido(c.cnpj)) { pulados.push({ cliente: nome, motivo: c.cnpj ? "CNPJ inválido no cadastro" : "sem CNPJ" }); continue; }
    const ultima = c.receita_consultada_em ? Date.parse(c.receita_consultada_em as string) : NaN;
    if (!forcar && Number.isFinite(ultima) && agora - ultima < TRINTA_DIAS) { pulados.push({ cliente: nome, motivo: "consultado há menos de 30 dias" }); continue; }

    const r = await consultarCnpj(c.cnpj as string);
    if (!r.ok) { pulados.push({ cliente: nome, motivo: r.motivo }); if (!r.ok && r.status === 503) await espera(PAUSA_MS * 2); continue; }

    const e = r.empresa;
    const ficha = c as unknown as FichaSemEndereco;
    const inteiro = enderecoPelaReceita(ficha, e);
    const endereco: Record<string, string> = { ...numeroPelaReceita(ficha, e), ...(inteiro.acao === "preencher" ? inteiro.campos : {}) };
    const campos: Record<string, unknown> = { ...colunasDaReceita(e), ...endereco };
    const nichoVazio = !(c.nicho as string | null)?.trim();
    if (nichoVazio && e.nichoRotulo) campos.nicho = e.nichoRotulo;

    if (aplicar) {
      const { error: eGrava } = await supabaseAdmin.from("clients").update(campos).eq("id", c.id as string);
      if (eGrava) { pulados.push({ cliente: nome, motivo: `não gravou: ${eGrava.message}` }); continue; }
      gravados++;
      if ("nicho" in campos) nichos++;
      if ("endereco_numero" in endereco) numeros++;
      if (inteiro.acao === "preencher") enderecos++;
      if (e.situacao && e.situacao !== "ATIVA" && e.situacao !== (c.situacao_cadastral as string | null)) {
        const desde = e.situacaoDesde ? ` desde ${e.situacaoDesde.split("-").reverse().join("/")}` : "";
        viraramNaoAtivas.push({ id: c.id as string, texto: `${nome}: ${e.situacao}${desde}${e.motivoSituacao ? ` (${e.motivoSituacao})` : ""}` });
      }
    }
    linhas.push({
      cliente: nome, porte: e.porte, cnae: `${e.cnaePrincipal} ${e.cnaeDescricao ?? ""}`.trim(), situacao: e.situacao,
      nicho_atual: (c.nicho as string) || null, nicho_sugerido: e.nichoRotulo, nicho_gravado: "nicho" in campos ? e.nichoRotulo : null,
      numero_endereco: endereco.endereco_numero ?? null,
      endereco_inteiro: inteiro.motivo === "ficha já tem endereço" ? null : {
        decisao: inteiro.motivo,
        texto_antigo: ficha.endereco || null,
        receita: [e.endereco.rua, e.endereco.numero, e.endereco.bairro, e.endereco.cidade && `${e.endereco.cidade}/${e.endereco.uf ?? ""}`, e.endereco.cep].filter(Boolean).join(", "),
      },
      sem_numero: !(c.endereco_numero as string | null)?.trim() && !endereco.endereco_numero
        ? (!String(c.endereco_cep ?? "").replace(/\D/g, "") ? "ficha sem endereço"
          : !e.endereco.numero ? "a Receita também não tem número" : "CEP da ficha diferente do da Receita")
        : null,
    });
    if (!r.doCache) await espera(PAUSA_MS);
  }

  const naoAtivas = linhas.filter((l) => l.situacao && l.situacao !== "ATIVA").map((l) => `${l.cliente}: ${l.situacao}`);
  // Só o que MUDOU desde a última consulta vira aviso (o mesmo CNPJ baixado não repete todo mês).
  for (const v of viraramNaoAtivas) {
    const { error: eSino } = await supabaseAdmin.from("notifications").insert({
      type: "system", target_user: DESTINO_AVISOS_COMERCIAL, client_id: v.id, read: false,
      title: "CNPJ de cliente ativo não está mais ativo na Receita",
      body: `${v.texto}. A ficha continua ativa no Lone OS: confira se o cliente fechou ou trocou de CNPJ.`,
    });
    if (eSino) console.error("[receita-clientes] sino:", eSino.message);
  }
  return {
    ok: true, aplicar, consultados: linhas.length, gravados, nichos_preenchidos: nichos, numeros_preenchidos: numeros, enderecos_preenchidos: enderecos,
    avisos_cnpj: viraramNaoAtivas.map((v) => v.texto),
    empresas_nao_ativas: naoAtivas, pulados, linhas,
  };
}
