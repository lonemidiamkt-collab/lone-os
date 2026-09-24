// lib/trafego/cobertura.ts — COBERTURA DE DADOS da Meta (Leva 7A, N7). Regras puras.
//
// PRA QUE: relatório com buraco, "Resultado de ontem" que pula cliente, ranking sem criativo — quase
// sempre é um dia que a leitura da Meta não gravou. Esta tela mostra, cliente por cliente e dia a
// dia, onde falta dado, e o motivo provável (sem conta, conta desativada, leitura com erro).
//
// Duas fontes, as duas gravadas pelo servidor:
//   · CONTA  — metric_snapshots (defense-scan, um dia fechado por linha). É o que os relatórios usam.
//   · ANÚNCIO — meta_entity_snapshots nível campanha (meta-granular). É o que o diagnóstico e o
//     ranking usam.
// A Meta não devolve linha para dia SEM ENTREGA — então "sem dado" pode ser "não gastou". Por isso a
// tela separa: dia sem nada nas duas fontes numa conta ativa é o buraco a olhar; dia com conta mas
// sem anúncio é falha só da coleta por anúncio.
//
// Testado em tests/trafego-cobertura.test.ts.

export type EstadoDia = "completo" | "so_conta" | "so_anuncio" | "vazio";

export interface ClienteCobertura {
  clientId: string;
  nome: string;
  gestor: string | null;
  metaAccountId: string | null;
  /** ad_accounts.account_status (1 = ativa). */
  statusConta: number | null;
  syncErro: string | null;
}

export interface LinhaCobertura {
  clientId: string;
  nome: string;
  gestor: string | null;
  /** Um estado por dia da janela, na ordem da janela (mais antigo → mais novo). */
  dias: EstadoDia[];
  diasComConta: number;
  diasComAnuncio: number;
  /** Último dia com dado da conta. */
  ultimoDia: string | null;
  /** Buracos: dias sem nada nas duas fontes (conta ativa). */
  buracos: number;
  /** Motivo provável quando há buraco — ou "Sem conta vinculada". */
  motivo: string | null;
  gravidade: "ok" | "atencao" | "critico";
}

export function janelaDeDias(ate: string, n: number): string[] {
  const out: string[] = [];
  const base = new Date(`${ate}T12:00:00Z`);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function montarCobertura(
  clientes: ClienteCobertura[],
  diasConta: Map<string, Set<string>>,
  diasAnuncio: Map<string, Set<string>>,
  janela: string[],
): LinhaCobertura[] {
  const linhas = clientes.map((c): LinhaCobertura => {
    const sc = diasConta.get(c.clientId) ?? new Set<string>();
    const sa = diasAnuncio.get(c.clientId) ?? new Set<string>();
    const dias = janela.map((d): EstadoDia => (sc.has(d) && sa.has(d) ? "completo" : sc.has(d) ? "so_conta" : sa.has(d) ? "so_anuncio" : "vazio"));
    const diasComConta = janela.filter((d) => sc.has(d)).length;
    const diasComAnuncio = janela.filter((d) => sa.has(d)).length;
    const ultimoDia = [...sc].filter((d) => d <= janela[janela.length - 1]).sort().pop() ?? null;
    const buracos = dias.filter((e) => e === "vazio").length;
    let motivo: string | null = null;
    if (!c.metaAccountId) motivo = "Sem conta de anúncio vinculada";
    else if (c.syncErro) motivo = `Leitura da Meta com erro: ${c.syncErro}`;
    else if (c.statusConta != null && c.statusConta !== 1) motivo = "Conta não está ativa na Meta";
    else if (diasComConta === 0 && diasComAnuncio === 0) motivo = "Nenhum dado na janela — conta sem entrega ou leitura parada";
    else if (buracos > 0) motivo = "Dias sem dado: sem entrega nesses dias ou a leitura falhou";
    else if (diasComAnuncio < diasComConta) motivo = "Coleta por anúncio incompleta (diagnóstico e ranking ficam sem esses dias)";
    const gravidade: LinhaCobertura["gravidade"] = !c.metaAccountId || diasComConta === 0
      ? "critico"
      : buracos >= 3 || c.syncErro ? "critico"
      : buracos > 0 || diasComAnuncio < diasComConta ? "atencao"
      : "ok";
    return { clientId: c.clientId, nome: c.nome, gestor: c.gestor, dias, diasComConta, diasComAnuncio, ultimoDia, buracos, motivo, gravidade };
  });
  const ordem = { critico: 0, atencao: 1, ok: 2 };
  return linhas.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade] || b.buracos - a.buracos || a.nome.localeCompare(b.nome));
}

export interface RespostaCobertura {
  janela: string[];
  linhas: LinhaCobertura[];
}
