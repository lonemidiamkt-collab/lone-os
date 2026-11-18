export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { encryptVault, decryptVault } from "@/lib/crypto/vault";
import { ancoraLigada, lerEstadosNoAncora } from "@/lib/integracoes/ancora-server";
import type { EstadoDoCliente } from "@/lib/integracoes/ancora";
import { hostDoKommo } from "@/lib/crm-externo/kommo";
import { lerFunisDoKommo } from "@/lib/crm-externo/kommo-server";
import {
  conexaoPublica, detectarAncora, janelaDaPrevia, lerRelatorioCrm, linhaDaConexao, novoToken, temTabelasCrm,
} from "@/lib/crm-externo/servidor";
import { janelaDoRelatorio } from "@/lib/reports/relatorioCliente";
import { hojeSP } from "@/lib/clients/pausa";

// /api/clients/[id]/crm — o CRM do cliente na ficha (aba Integrações). docs/CRM_INTEGRACOES.md
//   GET → a conexão (sem segredo), o estado do cliente no Âncora e se a integração do Âncora está ligada.
//         Se o cliente já se cadastrou no Âncora e não tem CRM, a conexão nasce aqui (a mesma detecção do relatório).
//   POST { acao: "previa" }                                → o bloco dos últimos 30 dias, lido agora no CRM
//   POST { acao: "conectar_ancora" }                       → só com o cadastro feito no Âncora
//   POST { acao: "conectar_kommo", subdominio, token }     → testa o token (lê os funis) ANTES de gravar
//   POST { acao: "kommo_funis" }                           → funis e etapas, para escolher funil e etapa de orçamento
//   POST { acao: "kommo_config", funilId, etapaOrcamentoId }
//   POST { acao: "gerar_token" }                           → API aberta: o token aparece UMA vez (gerar de novo troca)
//   POST { acao: "pausar" | "retomar" | "desconectar" }
// Ver: gestão e tráfego. Alterar: só gestão (admin e gestor).
// Um CRM por cliente: trocar = desconectar o atual primeiro (409) — o relatório não soma dois sistemas.

const VER = ["admin", "manager", "traffic"] as const;

const semTabela = () => NextResponse.json({ error: "O CRM ainda não foi ligado no banco: falta aplicar a migração 20261118150000_crm_conexoes.sql." }, { status: 503 });
const falha = (status: number, error: string) => NextResponse.json({ error }, { status });
/** Troca de conta, funil, etapa ou token: o cache de leituras é de antes e não vale mais (o portal mostraria o velho). */
const esquecerLeituras = (conexaoId: string) => supabaseAdmin.from("crm_leituras").delete().eq("conexao_id", conexaoId);

async function estadoNoAncora(id: string): Promise<{ estado: EstadoDoCliente | null; erro: string | null }> {
  if (!ancoraLigada()) return { estado: null, erro: null };
  const r = await lerEstadosNoAncora([id]);
  return r.ok ? { estado: r.data.find((e) => e.ref_externa === id) ?? null, erro: null } : { estado: null, erro: r.mensagem };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, [...VER]);
  if (gate instanceof NextResponse) return gate;
  try { if (!(await temTabelasCrm())) return semTabela(); }
  catch (e) { return falha(503, e instanceof Error ? e.message : "Não consegui conferir o banco."); }
  const { id } = await params;
  const { data: c, error } = await supabaseAdmin.from("clients").select("id").eq("id", id).maybeSingle();
  if (error) return falha(500, `Não consegui ler o cliente: ${error.message}`);
  if (!c) return falha(404, "Cliente não encontrado.");

  const ancora = await estadoNoAncora(id);
  let detectou: string | null = null;
  if (ancora.estado?.estado === "cadastrou") {
    const d = await detectarAncora([id]);
    if (d.erro) detectou = d.erro;
  }
  try {
    const linha = await linhaDaConexao(id);
    const gestao = GESTAO.includes(gate.papel!);
    // O link de cadastro (pré-preenchido) é da gestão — a mesma regra de /api/ancora. O tráfego vê só o estado.
    const estado = ancora.estado && !gestao ? { ...ancora.estado, link: null } : ancora.estado;
    return NextResponse.json({
      conexao: linha ? conexaoPublica(linha) : null,
      ancora: { ligada: ancoraLigada(), estado, erro: ancora.erro ?? detectou },
      podeAlterar: gestao,
    });
  } catch (e) {
    return falha(500, e instanceof Error ? e.message : "Não consegui ler a conexão.");
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const acao = String(body.acao ?? "");
  // Prévia é leitura: quem vê pode pedir. O resto altera: só gestão.
  const gate = await requireRole(req, acao === "previa" ? [...VER] : GESTAO);
  if (gate instanceof NextResponse) return gate;
  try { if (!(await temTabelasCrm())) return semTabela(); }
  catch (e) { return falha(503, e instanceof Error ? e.message : "Não consegui conferir o banco."); }

  let atual: Awaited<ReturnType<typeof linhaDaConexao>>;
  try { atual = await linhaDaConexao(id); } catch (e) { return falha(500, e instanceof Error ? e.message : "Não consegui ler a conexão."); }
  const quem = gate.user.email;
  const agora = new Date().toISOString();
  const ocupado = (provedor: string) => atual && atual.provedor !== provedor
    ? falha(409, "Este cliente já tem outro CRM conectado. Desconecte o atual antes de trocar.") : null;

  switch (acao) {
    case "previa": {
      if (!atual) return falha(409, "Nenhum CRM conectado.");
      const p = janelaDaPrevia(hojeSP());
      let r: Awaited<ReturnType<typeof lerRelatorioCrm>>;
      try { r = await lerRelatorioCrm(id, janelaDoRelatorio(p.inicio, p.fim), { fresco: true }); }
      catch (e) { return falha(502, e instanceof Error ? e.message : "Não consegui ler o CRM."); }
      if (!r) return falha(409, "A conexão está pausada.");
      return NextResponse.json({ relatorio: r.relatorio, avisos: r.avisos, indisponivel: r.indisponivel });
    }

    case "conectar_ancora": {
      const o = ocupado("ancora"); if (o) return o;
      if (atual) return NextResponse.json({ conexao: conexaoPublica(atual) });
      const a = await estadoNoAncora(id);
      if (a.erro) return falha(502, a.erro);
      if (a.estado?.estado !== "cadastrou") return falha(409, "O cliente ainda não se cadastrou no Âncora. Gere o link de cadastro e envie a ele; a conexão nasce sozinha quando ele terminar.");
      const { error } = await supabaseAdmin.from("crm_conexoes").insert({ client_id: id, provedor: "ancora", origem: "manual", criado_por: quem });
      if (error) return falha(500, `Não consegui gravar: ${error.message}`);
      break;
    }

    case "conectar_kommo": {
      const o = ocupado("kommo"); if (o) return o;
      const host = hostDoKommo(String(body.subdominio ?? ""));
      if (!host) return falha(422, "Subdomínio inválido. Use o endereço da conta, por exemplo: minhaempresa.kommo.com");
      const token = String(body.token ?? "").trim();
      if (token.length < 20 || token.length > 4000 || /\s/.test(token)) return falha(422, "Cole o token de longa duração inteiro (Kommo › Configurações › Integrações › sua integração › Chaves e escopos).");
      try { await lerFunisDoKommo(host, token); } catch (e) { return falha(422, e instanceof Error ? e.message : "O Kommo recusou."); }
      let cifrado: string | null;
      try { cifrado = encryptVault(token); } catch { return falha(500, "O servidor está sem a chave do cofre (VAULT_KEY): o token não pode ser guardado."); }
      const linha = {
        client_id: id, provedor: "kommo", ativa: true, origem: "manual", criado_por: quem, atualizado_em: agora,
        // Trocar o token mantém o funil e a etapa escolhidos, se for a mesma conta.
        config: { ...(atual?.config?.subdominio === host ? atual.config : {}), subdominio: host },
        segredo: cifrado, ultimo_erro: null,
      };
      const { error } = atual
        ? await supabaseAdmin.from("crm_conexoes").update(linha).eq("id", atual.id)
        : await supabaseAdmin.from("crm_conexoes").insert(linha);
      if (error) return falha(500, `Não consegui gravar: ${error.message}`);
      if (atual) await esquecerLeituras(atual.id);
      break;
    }

    case "kommo_funis":
    case "kommo_config": {
      if (atual?.provedor !== "kommo" || !atual.config?.subdominio) return falha(409, "Conecte o Kommo primeiro.");
      let token: string | null;
      try { token = decryptVault(atual.segredo); } catch { token = null; }
      if (!token) return falha(409, "Não consegui abrir o token do Kommo. Cole o token de novo.");
      let funis: Awaited<ReturnType<typeof lerFunisDoKommo>>;
      try { funis = await lerFunisDoKommo(atual.config.subdominio, token); } catch (e) { return falha(502, e instanceof Error ? e.message : "O Kommo não respondeu."); }
      if (acao === "kommo_funis") return NextResponse.json({ funis });
      const funilId = body.funilId == null || body.funilId === "" ? null : Number(body.funilId);
      const etapaId = body.etapaOrcamentoId == null || body.etapaOrcamentoId === "" ? null : Number(body.etapaOrcamentoId);
      if (funilId != null && !funis.some((f) => f.id === funilId)) return falha(422, "Esse funil não existe no Kommo do cliente.");
      if (etapaId != null && !funis.some((f) => (funilId == null || f.id === funilId) && f.etapas.some((e) => e.id === etapaId && !e.fechada))) {
        return falha(422, "Essa etapa não existe no funil escolhido.");
      }
      const { error } = await supabaseAdmin.from("crm_conexoes").update({
        config: { ...atual.config, funil_id: funilId, etapa_orcamento_id: etapaId }, atualizado_em: agora,
      }).eq("id", atual.id);
      if (error) return falha(500, `Não consegui gravar: ${error.message}`);
      await esquecerLeituras(atual.id);
      break;
    }

    case "gerar_token": {
      const o = ocupado("api_aberta"); if (o) return o;
      const t = novoToken();
      const linha = { client_id: id, provedor: "api_aberta", ativa: true, origem: "manual", criado_por: quem, atualizado_em: agora,
        token_hash: t.hash, token_prefixo: t.prefixo, ultimo_erro: null };
      const { error } = atual
        ? await supabaseAdmin.from("crm_conexoes").update(linha).eq("id", atual.id)
        : await supabaseAdmin.from("crm_conexoes").insert(linha);
      if (error) return falha(500, `Não consegui gravar: ${error.message}`);
      const nova = await linhaDaConexao(id);
      // O token só sai AGORA. Depois, nem o sistema sabe qual é (guarda o hash).
      return NextResponse.json({ conexao: nova ? conexaoPublica(nova) : null, token: t.token });
    }

    case "pausar":
    case "retomar": {
      if (!atual) return falha(409, "Nenhum CRM conectado.");
      const { error } = await supabaseAdmin.from("crm_conexoes").update({ ativa: acao === "retomar", atualizado_em: agora }).eq("id", atual.id);
      if (error) return falha(500, `Não consegui gravar: ${error.message}`);
      break;
    }

    case "desconectar": {
      if (!atual) return NextResponse.json({ conexao: null });
      // Âncora detectado sozinho voltaria na próxima detecção: pausar é o jeito de tirar do relatório.
      const { error } = await supabaseAdmin.from("crm_conexoes").delete().eq("id", atual.id);
      if (error) return falha(500, `Não consegui desconectar: ${error.message}`);
      return NextResponse.json({ conexao: null });
    }

    default:
      return falha(400, "Ação desconhecida.");
  }

  const nova = await linhaDaConexao(id).catch(() => null);
  return NextResponse.json({ conexao: nova ? conexaoPublica(nova) : null });
}
