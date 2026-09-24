export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { todaySP } from "@/lib/utils";
import {
  lerPeriodo, chavePeriodo, mapearCampanhas, resumirCampanhas, podeSincronizar, mensagemConexao,
  type ResumoAnuncios,
} from "@/lib/trafego/anuncios";
import {
  lerCache, lerConexao, sincronizarAnuncios, emAndamento, ultimaTentativa,
  type LinhaCache,
} from "@/lib/trafego/anuncios-server";
import type { AdCampaign } from "@/lib/types";

// /api/trafego/anuncios — a aba "Anúncios Meta" do Tráfego. O navegador NÃO fala mais com a Meta.
//
//   GET  ?periodo=7d&clientes=<uuid>,<uuid>[&completo=1]
//        → o que o servidor já guardou (meta_campaign_cache). Sem `completo`, só o resumo por cliente
//          (visão "Todos"); com, as campanhas mapeadas + demografia (visão de um cliente e PDFs).
//   POST { clientId, periodo }  → "Atualizar agora": lê a Meta NO SERVIDOR e guarda.
//        Uma vez a cada 5 min por cliente+período (lib/trafego/anuncios.ts INTERVALO_MINIMO_MIN).
//        Responde 200 com `resultado`: ok · aguarde · em_andamento · ocupado · sem_conexao · falhou.
//        Leitura que passa de ~20s continua no servidor e a tela acompanha pelo GET.

const TRAFEGO: Papel[] = ["admin", "manager", "traffic"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CLIENTES = 200;
const ESPERA_RESPOSTA_MS = 20_000;

interface ItemAnuncios {
  clientId: string;
  sincronizadoEm: string | null;
  tentativaEm: string | null;
  erro: string | null;
  atualizando: boolean;
  resumo: ResumoAnuncios;
  campanhas?: AdCampaign[];
  demografia?: unknown | null;
}

type Dono = { id: string; name: string; meta_ad_account_id: string | null };

function montarItem(clientId: string, linha: LinhaCache | null, dono: Dono | undefined, periodo: string, completo: boolean): ItemAnuncios {
  const campanhas = linha && dono
    ? mapearCampanhas(linha.campaigns, { clientId, clientName: dono.name, accountId: linha.meta_ad_account_id ?? dono.meta_ad_account_id ?? "" })
    : [];
  return {
    clientId,
    sincronizadoEm: linha?.synced_at ?? null,
    tentativaEm: linha?.attempted_at ?? null,
    erro: linha?.error ?? null,
    atualizando: emAndamento(clientId, periodo),
    resumo: resumirCampanhas(campanhas),
    ...(completo ? { campanhas, demografia: linha?.demographics ?? null } : {}),
  };
}

async function donos(ids: string[]): Promise<Map<string, Dono>> {
  const { data, error } = await supabaseAdmin.from("clients").select("id, name, meta_ad_account_id").in("id", ids);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as Dono[]).map((c) => [c.id, c]));
}

function conexaoPublica(c: Awaited<ReturnType<typeof lerConexao>>) {
  return { estado: c.estado, expiraEm: c.expiraEm, tipo: c.tipo };
}

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, TRAFEGO);
  if (gate instanceof NextResponse) return gate;

  const sp = req.nextUrl.searchParams;
  const periodo = lerPeriodo(sp.get("periodo"), todaySP());
  if (!periodo) return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  const ids = [...new Set((sp.get("clientes") ?? "").split(",").map((s) => s.trim()).filter((s) => UUID.test(s)))].slice(0, MAX_CLIENTES);
  const completo = sp.get("completo") === "1";
  const chave = chavePeriodo(periodo); // forma canônica ("07d" e "7d" são a mesma linha)

  try {
    const [conexao, cache, mapa] = await Promise.all([lerConexao(), lerCache(ids, chave), ids.length ? donos(ids) : Promise.resolve(new Map<string, Dono>())]);
    const porCliente = new Map(cache.linhas.map((l) => [l.client_id, l]));
    return NextResponse.json({
      periodo: chave,
      conexao: conexaoPublica(conexao),
      persistente: cache.persistente,
      itens: ids.map((id) => montarItem(id, porCliente.get(id) ?? null, mapa.get(id), chave, completo)),
    });
  } catch (err) {
    console.error("[trafego/anuncios GET]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não consegui ler os anúncios guardados. Recarregue em instantes." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, TRAFEGO);
  if (gate instanceof NextResponse) return gate;

  const body = (await req.json().catch(() => null)) as { clientId?: string; periodo?: string } | null;
  const clientId = body?.clientId ?? "";
  const periodo = lerPeriodo(body?.periodo, todaySP());
  if (!UUID.test(clientId)) return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });
  if (!periodo) return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  const chave = chavePeriodo(periodo);

  try {
    const conexao = await lerConexao();
    const item = async () => {
      const [{ linhas }, mapa] = await Promise.all([lerCache([clientId], chave), donos([clientId])]);
      return montarItem(clientId, linhas[0] ?? null, mapa.get(clientId), chave, true);
    };

    if (conexao.estado !== "ok") {
      return NextResponse.json({ resultado: "sem_conexao", mensagem: mensagemConexao(conexao.estado), conexao: conexaoPublica(conexao), item: await item() });
    }

    // Já rodando? Espera a mesma leitura (não conta como nova tentativa).
    if (!emAndamento(clientId, chave)) {
      const limite = podeSincronizar(await ultimaTentativa(clientId, chave), Date.now());
      if (!limite.pode) {
        return NextResponse.json({
          resultado: "aguarde", esperarMin: limite.esperarMin,
          mensagem: `A Meta foi lida para este cliente há poucos minutos. Dá para atualizar de novo em ${limite.esperarMin} min.`,
          conexao: conexaoPublica(conexao), item: await item(),
        });
      }
    }

    const leitura = sincronizarAnuncios(clientId, periodo);
    if (!leitura) {
      return NextResponse.json({ resultado: "ocupado", mensagem: "O servidor já está lendo outras contas na Meta. Tente de novo em instantes.", conexao: conexaoPublica(conexao) });
    }

    const pronto = await Promise.race([leitura, new Promise<null>((r) => setTimeout(() => r(null), ESPERA_RESPOSTA_MS))]);
    if (!pronto) {
      return NextResponse.json({ resultado: "em_andamento", mensagem: "Conta grande — a leitura continua no servidor. A tela atualiza sozinha quando terminar.", conexao: conexaoPublica(conexao) });
    }
    if (!pronto.ok) {
      const conexaoAgora = pronto.conexao ? { ...conexaoPublica(conexao), estado: pronto.conexao } : conexaoPublica(conexao);
      return NextResponse.json({
        resultado: pronto.conexao ? "sem_conexao" : "falhou",
        mensagem: pronto.conexao ? mensagemConexao(pronto.conexao) : `A Meta não respondeu: ${pronto.erro}`,
        conexao: conexaoAgora, item: await item(),
      });
    }
    return NextResponse.json({ resultado: "ok", conexao: conexaoPublica(conexao), item: await item() });
  } catch (err) {
    console.error("[trafego/anuncios POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não consegui atualizar agora. Tente de novo em instantes." }, { status: 500 });
  }
}
