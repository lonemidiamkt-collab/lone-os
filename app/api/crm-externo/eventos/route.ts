export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/crm-externo/eventos — A API ABERTA DE CRM (docs/CRM_INTEGRACOES.md).
// Qualquer CRM (ou n8n/Make) manda os eventos do cliente com o token gerado na ficha (Integrações › Outro CRM):
//   Authorization: Bearer lcrm_…      corpo: {"eventos": [{ id, tipo, quando, negocio?, valor?, segundos?, etapa? }]}
// O token identifica a conexão — e só ela: o cliente sai do token, nunca do corpo. Conexão PAUSADA continua recebendo
// (pausar só tira do relatório); token trocado ou conexão apagada = 401.
// GET com o mesmo token só confere se o token vale (para o "testar conexão" de quem integra).
//
// Pública no middleware (quem chama é outro sistema, sem login); a porta é o token, comparado pelo hash.
// Lote com qualquer linha errada é recusado INTEIRO (422, com a linha e o motivo) — meio lote gravado em silêncio
// viraria número errado no relatório.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { criarLimite, ipDe } from "@/lib/portal/limite";
import { validarLote } from "@/lib/crm-externo/eventos";
import { conexaoDoToken, temTabelasCrm } from "@/lib/crm-externo/servidor";

const LIMITE = criarLimite(120, 60_000); // por conexão
const LIMITE_FALHA = criarLimite(30, 60_000); // por IP, token errado
const LIMITE_IP = criarLimite(600, 60_000); // por IP, ANTES de ir ao banco (varredura não vira consulta sem fim)
const MAX_BYTES = 512 * 1024;

const erro = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: { code, message, ...extra } }, { status });

async function autenticar(req: NextRequest) {
  const ip = ipDe(req.headers);
  if (LIMITE_IP.estourou(ip)) return { resposta: erro(429, "rate_limited", "Muitas chamadas. Aguarde 1 minuto.") };
  try {
    if (!(await temTabelasCrm())) return { resposta: erro(503, "indisponivel", "A API de CRM ainda não foi ativada neste servidor.") };
  } catch {
    return { resposta: erro(503, "indisponivel", "Não consegui conferir o token agora. Tente de novo em instantes.") };
  }
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let conexao: Awaited<ReturnType<typeof conexaoDoToken>>;
  try {
    conexao = await conexaoDoToken(token);
  } catch {
    return { resposta: erro(503, "indisponivel", "Não consegui conferir o token agora. Tente de novo em instantes.") };
  }
  if (!conexao) {
    if (LIMITE_FALHA.estourou(ip)) return { resposta: erro(429, "rate_limited", "Muitas tentativas. Aguarde 1 minuto.") };
    return { resposta: erro(401, "nao_autorizado", "Token ausente, inválido ou trocado.") };
  }
  if (LIMITE.estourou(conexao.id)) return { resposta: erro(429, "rate_limited", "Mais de 120 envios por minuto. Junte os eventos em lotes de até 500.") };
  return { conexao };
}

export async function GET(req: NextRequest) {
  const a = await autenticar(req);
  if ("resposta" in a) return a.resposta;
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const a = await autenticar(req);
  if ("resposta" in a) return a.resposta;
  const { conexao } = a;

  const grande = () => erro(413, "grande_demais", "Lote acima de 512 KB. Mande em lotes menores.");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return grande();
  const bruto = await req.text();
  if (Buffer.byteLength(bruto, "utf8") > MAX_BYTES) return grande();
  let corpo: unknown;
  try { corpo = JSON.parse(bruto); } catch { return erro(400, "json_invalido", "O corpo não é JSON."); }

  const v = validarLote(corpo);
  if (!v.ok) return erro(422, "validacao", "Lote recusado: nenhum evento foi gravado.", { detalhes: v.erros });

  const linhas = v.linhas.map((l) => ({ ...l, conexao_id: conexao.id, client_id: conexao.client_id, recebido_em: new Date().toISOString() }));
  const { error } = await supabaseAdmin.from("crm_eventos").upsert(linhas, { onConflict: "conexao_id,id_externo" });
  if (error) {
    console.error("[crm-externo/eventos] gravar falhou:", conexao.id, error.message);
    return erro(503, "indisponivel", "Não consegui gravar agora. Nenhum evento foi gravado; mande o lote de novo.");
  }
  await supabaseAdmin.from("crm_conexoes").update({ ultima_leitura_em: new Date().toISOString(), ultimo_erro: null }).eq("id", conexao.id);
  return NextResponse.json({ ok: true, recebidos: linhas.length });
}
