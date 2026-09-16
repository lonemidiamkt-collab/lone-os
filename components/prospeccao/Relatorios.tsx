"use client";

import { useEffect, useState } from "react";
import { chamar } from "@/lib/api/chamar";
import { Secao, Vazio, Erro, fmtData } from "./ui";

interface Diario { dia: string; encontrados: number; icp_aprovados: number; abordados: number; respostas: number; decisores: number; interessados: number; reunioes_online: number; visitas: number; realizadas: number; no_shows: number; propostas: number; vendas: number; followups: number; opt_outs: number; custo_usd: number; tempo_medio_resposta_min: number | null; melhor_lead: { nome: string; score: number | null } | null }
interface Corte { chave: string; abordados: number; respostas: number; reunioes: number; realizadas: number; vendas: number; taxa: string; n_ok: boolean }
interface Resp { campanha: { nome: string; status: string } | null; diarios: Diario[]; texto: string | null; salvo: boolean; cruzamentos: Record<string, Corte[] | { chave: string; n: number }[] | number> | null }

const CORTES: [string, string][] = [["segmento", "Segmento"], ["cidade", "Cidade"], ["faixa_score", "Faixa de score"], ["cnae", "CNAE"], ["abordagem", "Abordagem"], ["dia_semana", "Dia da semana"], ["hora", "Hora do 1º contato"], ["distancia", "Distância"], ["modalidade", "Presencial × online"]];

export default function Relatorios({ versao }: { versao: number }) {
  const [r, setR] = useState<Resp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { void (async () => { const x = await chamar<Resp>("/api/prospeccao/relatorio"); if (!x.ok) { setErro(x.erro); return; } setErro(null); setR(x.data!); })(); }, [versao]);
  if (erro && !r) return <Erro texto={erro} />;
  if (!r) return <p className="text-lone-body text-muted-foreground">Carregando…</p>;
  const cz = r.cruzamentos;
  const nMin = (cz?.n_minimo as number | undefined) ?? 5;
  return (
    <div className="space-y-5">
      <Secao titulo={r.salvo ? "Relatório final do piloto" : "Prévia do relatório final (o definitivo sai quando o piloto encerrar)"}>
        {r.texto ? <pre className="whitespace-pre-wrap font-sans text-lone-body text-foreground">{r.texto}</pre> : <Vazio texto="Sem piloto." />}
      </Secao>
      <Secao titulo="Aprendizado — quem converte mais">
        <p className="mb-3 text-lone-caption text-muted-foreground">Taxa = reuniões marcadas ÷ abordados. Cortes com menos de {nMin} abordagens aparecem apagados: ainda não ensinam nada.</p>
        {!cz ? <Vazio texto="Sem dados ainda." /> : (
          <div className="grid gap-4 lg:grid-cols-2">
            {CORTES.map(([k, rotulo]) => {
              const lista = (cz[k] as Corte[] | undefined) ?? [];
              return (
                <div key={k}>
                  <h3 className="text-lone-eyebrow uppercase tracking-wider text-muted-foreground">{rotulo}</h3>
                  {lista.length === 0 ? <p className="text-lone-caption text-muted-foreground">—</p> : (
                    <table className="mt-1 w-full text-lone-body"><tbody>
                      {lista.slice(0, 8).map((c) => (
                        <tr key={c.chave} className={`border-b border-border last:border-0 ${c.n_ok ? "text-foreground" : "text-muted-foreground/60"}`}>
                          <td className="py-1 pr-2">{c.chave}</td><td className="py-1 text-right tabular-nums">{c.abordados} abord.</td><td className="py-1 text-right tabular-nums">{c.respostas} resp.</td><td className="py-1 text-right tabular-nums">{c.reunioes} reun.</td><td className="py-1 text-right tabular-nums font-medium">{c.taxa}</td>
                        </tr>
                      ))}
                    </tbody></table>
                  )}
                </div>
              );
            })}
            <div>
              <h3 className="text-lone-eyebrow uppercase tracking-wider text-muted-foreground">Objeções mais comuns</h3>
              {((cz.objecoes as { chave: string; n: number }[] | undefined) ?? []).length === 0 ? <p className="text-lone-caption text-muted-foreground">—</p> : <ul className="mt-1 text-lone-body text-foreground">{(cz.objecoes as { chave: string; n: number }[]).map((o) => <li key={o.chave} className="flex justify-between border-b border-border py-1 last:border-0"><span>{o.chave}</span><span className="tabular-nums">{o.n}</span></li>)}</ul>}
            </div>
          </div>
        )}
      </Secao>
      <Secao titulo="Diários (§34)">
        {r.diarios.length === 0 ? <Vazio texto="O relatório diário roda às 18:30 nos dias úteis." /> : (
          <div className="overflow-x-auto"><table className="w-full text-lone-body">
            <thead className="text-left text-lone-caption text-muted-foreground"><tr className="border-b border-border">{["Dia", "Encontr.", "ICP", "Abord.", "Resp.", "Decis.", "Inter.", "Meet", "Visita", "Realiz.", "No-show", "Prop.", "Vendas", "Follow", "Opt-out", "Custo", "Melhor lead"].map((h) => <th key={h} className="px-2 py-1 font-medium">{h}</th>)}</tr></thead>
            <tbody>{r.diarios.map((d) => (
              <tr key={d.dia} className="border-b border-border last:border-0 text-foreground">
                <td className="px-2 py-1">{fmtData(`${d.dia}T12:00:00-03:00`)}</td>
                {[d.encontrados, d.icp_aprovados, d.abordados, d.respostas, d.decisores, d.interessados, d.reunioes_online, d.visitas, d.realizadas, d.no_shows, d.propostas, d.vendas, d.followups, d.opt_outs].map((v, i) => <td key={i} className="px-2 py-1 tabular-nums">{v}</td>)}
                <td className="px-2 py-1 tabular-nums">US$ {Number(d.custo_usd).toFixed(2)}</td>
                <td className="px-2 py-1 text-lone-caption text-muted-foreground">{d.melhor_lead ? `${d.melhor_lead.nome} (${d.melhor_lead.score ?? "?"})` : "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Secao>
    </div>
  );
}
