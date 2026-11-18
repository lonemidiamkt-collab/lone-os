// lib/google/relatorio-dados.ts — lê do BANCO (nunca do Google ao vivo) o bloco Google de um cliente para uma janela.
// Só servidor. As contas ficam em relatorio.ts (puro). Relatório semanal, mensal, PDF e painel chamam isto.
//
// Regras (docs/ERRO_RECUPERAVEL.md — falha nunca vira zero):
//   · conta vinculada mas nunca sincronizada, ou a última leitura falhou e não há número no período → o bloco sai
//     como INDISPONÍVEL com o motivo, nunca como "0 cliques".
//   · Google Ads só com contrato de tráfego (podeFalarDeAnuncio — a mesma regra dos anúncios da Meta).
//   · Perfil da Empresa sempre que vinculado (como o Instagram): é presença, não anúncio.

import { supabaseAdmin } from "@/lib/supabase/server";
import { podeFalarDeAnuncio } from "@/lib/clients/servico";
import { janelaAnterior, somarDias, type Janela } from "@/lib/reports/relatorioCliente";
import { hojeSP } from "@/lib/clients/pausa";
import { normalizarIdAds } from "./ids";
import {
  montarRelatorioAds, montarRelatorioPerfil,
  type LinhaAdsDia, type LinhaAcaoDia, type LinhaPerfilDia, type LinhaTermo, type RelatorioGoogle,
} from "./relatorio";

export const COLUNAS_GOOGLE_CLIENTE = "google_ads_customer_id, google_ads_login_id, google_perfil_local";

export interface ClienteGoogleRelatorio {
  id: string;
  service_type: string | null;
  google_ads_customer_id?: string | null;
  google_perfil_local?: string | null;
}

/** O cliente tem algo do Google para entrar no relatório? (Ads só com contrato de tráfego.) */
export function temGoogleNoRelatorio(c: ClienteGoogleRelatorio): { ads: boolean; perfil: boolean } {
  return {
    ads: !!normalizarIdAds(c.google_ads_customer_id) && podeFalarDeAnuncio(c),
    perfil: !!c.google_perfil_local,
  };
}

const PAGINA = 1000;

/** Lê todas as linhas (o PostgREST corta em 1.000). */
async function lerTudo<T>(montar: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < 50; i++) {
    const { data, error } = await montar(i * PAGINA, (i + 1) * PAGINA - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) break;
  }
  return out;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const rotuloMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;

/**
 * O bloco Google de um cliente para `janela`. Nunca lança: problema de leitura vira bloco indisponível com motivo.
 * Devolve null quando o cliente não tem nada do Google para este relatório.
 */
export async function lerRelatorioGoogle(
  c: ClienteGoogleRelatorio,
  janela: Janela,
  /** Comparação diferente da regra do relatório (o painel compara "este mês" com os mesmos dias do mês anterior). */
  opcoes: { anterior?: Janela } = {},
): Promise<RelatorioGoogle | null> {
  const tem = temGoogleNoRelatorio(c);
  if (!tem.ads && !tem.perfil) return null;
  const out: RelatorioGoogle = { ads: null, adsIndisponivel: null, perfil: null, perfilIndisponivel: null };

  const { data: estado, error: errEstado } = await supabaseAdmin.from("google_sincronia")
    .select("ads_sincronizado_em, ads_erro, ads_moeda, perfil_sincronizado_em, perfil_erro, perfil_ultimo_dia")
    .eq("client_id", c.id).maybeSingle();
  if (errEstado) {
    const motivo = `Não consegui ler o estado do Google no banco (${errEstado.message}).`;
    if (tem.ads) out.adsIndisponivel = { motivo };
    if (tem.perfil) out.perfilIndisponivel = { motivo };
    return out;
  }
  const e = (estado ?? {}) as {
    ads_sincronizado_em?: string | null; ads_erro?: string | null; ads_moeda?: string | null;
    perfil_sincronizado_em?: string | null; perfil_erro?: string | null; perfil_ultimo_dia?: string | null;
  };
  const ant = opcoes.anterior ?? janelaAnterior(janela);
  // O Perfil pode recuar a janela (atraso do Google): lê 2 períodos para trás para a comparação recuada caber.
  const lerDesde = somarDias(ant.inicio, -janela.dias);

  // ── Google Ads ──
  if (tem.ads) {
    const conta = normalizarIdAds(c.google_ads_customer_id)!;
    if (!e.ads_sincronizado_em) {
      out.adsIndisponivel = { motivo: e.ads_erro ? `O Google Ads ainda não foi lido: ${e.ads_erro}` : "A conta do Google Ads foi vinculada e ainda não foi lida (a rotina roda todo dia às 7h — ou use \"Atualizar agora\" na ficha)." };
    } else {
      try {
        const [linhas, acoes] = await Promise.all([
          lerTudo<LinhaAdsDia>((a, b) => supabaseAdmin.from("google_ads_campanha_dia")
            .select("dia, campaign_id, campanha, canal, impressoes, cliques, custo, conversoes, valor_conversoes, ligacoes")
            .eq("customer_id", conta).gte("dia", lerDesde).lte("dia", janela.fim).order("dia").range(a, b)),
          lerTudo<LinhaAcaoDia>((a, b) => supabaseAdmin.from("google_ads_acao_dia")
            .select("dia, categoria, acao, conversoes, todas_conversoes")
            .eq("customer_id", conta).gte("dia", lerDesde).lte("dia", janela.fim).order("dia").range(a, b)),
        ]);
        // Cada leitura vai até a véspera. Se a última leitura boa não cobre o fim da janela, os últimos dias não estão
        // no banco — e não dá para mostrá-los como zero.
        const cobertoAte = somarDias(hojeSP(new Date(e.ads_sincronizado_em)), -1);
        if (cobertoAte < janela.fim) {
          out.adsIndisponivel = {
            motivo: `A última leitura do Google Ads (${quando(e.ads_sincronizado_em)}) vai só até ${cobertoAte.split("-").reverse().join("/")} — não cobre ${janela.rotulo}.${e.ads_erro ? ` A leitura seguinte falhou: ${e.ads_erro}` : ""}`,
          };
        } else {
          out.ads = montarRelatorioAds({ janela, anterior: ant, moeda: e.ads_moeda, linhas, acoes });
        }
      } catch (err) {
        out.adsIndisponivel = { motivo: `Não consegui ler os números do Google Ads no banco (${err instanceof Error ? err.message : String(err)}).` };
      }
    }
  }

  // ── Perfil da Empresa ──
  if (tem.perfil) {
    const local = c.google_perfil_local!;
    if (!e.perfil_sincronizado_em || !e.perfil_ultimo_dia) {
      out.perfilIndisponivel = { motivo: e.perfil_erro ?? "O Perfil da Empresa foi vinculado e ainda não foi lido (a rotina roda todo dia às 7h — ou use \"Atualizar agora\" na ficha)." };
    } else {
      try {
        const [linhas, termos] = await Promise.all([
          lerTudo<LinhaPerfilDia>((a, b) => supabaseAdmin.from("google_perfil_dia")
            .select("dia, impressoes_busca_celular, impressoes_busca_computador, impressoes_mapas_celular, impressoes_mapas_computador, ligacoes, rotas, cliques_site, conversas, reservas, cardapio")
            .eq("local", local).gte("dia", lerDesde).lte("dia", janela.fim).order("dia").range(a, b)),
          // Termos: o mês da janela, se fechado e já entregue; senão o último mês fechado antes do fim da janela.
          supabaseAdmin.from("google_perfil_buscas").select("mes, termo, valor, limiar")
            .eq("local", local).lte("mes", janela.fim).order("mes", { ascending: false }).limit(300),
        ]);
        let mesTermos: string | null = null;
        let lista: LinhaTermo[] = [];
        if (!termos.error && termos.data?.length) {
          const preferido = janela.tipo === "mes" ? janela.inicio : null;
          const meses = [...new Set(termos.data.map((t) => t.mes as string))];
          mesTermos = preferido && meses.includes(preferido) ? preferido : meses[0];
          lista = termos.data.filter((t) => t.mes === mesTermos).map((t) => ({ termo: t.termo as string, valor: t.valor as number | null, limiar: t.limiar as number | null }));
        }
        const p = montarRelatorioPerfil({ janela, anterior: ant, ultimoDia: e.perfil_ultimo_dia, linhas, termos: lista, termosMes: mesTermos ? rotuloMes(mesTermos) : null });
        if (p) out.perfil = p;
        else out.perfilIndisponivel = { motivo: `O Google ainda não liberou os números do perfil para ${janela.rotulo} (tem até ${e.perfil_ultimo_dia.split("-").reverse().join("/")}).` };
      } catch (err) {
        out.perfilIndisponivel = { motivo: `Não consegui ler os números do Perfil da Empresa no banco (${err instanceof Error ? err.message : String(err)}).` };
      }
    }
  }
  return out;
}
