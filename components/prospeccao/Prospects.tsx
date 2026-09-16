"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { ChipEstagio, ChipClasse, Vazio, Erro, inputCls, fmtDataHora, haQuanto, ROTULO_ESTAGIO } from "./ui";

export interface Linha {
  id: string; nome: string; cidade: string | null; segmento: string | null; classe: string | null; score: number | null; estagio: string; owner: string; modo_agente: string;
  precisa_humano: boolean; motivo_humano: string | null; decisor_nome: string | null; distancia_km: number | null; modalidade_preferida: string | null; telefone: string | null;
  next_action_type: string | null; next_action_at: string | null; ultima_interacao_em: string | null; ultima_msg_de: string | null; reuniao_em: string | null; primeira_abordagem_em: string | null; origem: string | null; updated_at: string;
}
interface Resp { prospects: Linha[]; total: number; filtros: { cidades: string[]; segmentos: string[] } }

const GRUPOS: { rotulo: string; estagios: string[] }[] = [
  { rotulo: "Todos", estagios: [] },
  { rotulo: "Candidatos", estagios: ["descoberto", "enriquecido"] },
  { rotulo: "ICP aprovado", estagios: ["icp_aprovado", "fila_prospeccao"] },
  { rotulo: "Em conversa", estagios: ["abordado", "aguardando_resposta", "followup", "atendente", "decisor_identificado", "decisor_contatado", "interesse", "horario_proposto", "aguardando_confirmacao"] },
  { rotulo: "Reunião / Roberto", estagios: ["reuniao_agendada", "handoff", "reuniao_realizada", "no_show", "proposta", "cliente"] },
  { rotulo: "Nutrição", estagios: ["momento_ruim", "nutricao_30d", "nutricao_90d"] },
  { rotulo: "Encerrados", estagios: ["sem_interesse", "nao_perturbe", "perdido", "fora_icp"] },
];

export default function Prospects({ abrir, versao }: { abrir: (id: string) => void; versao: number }) {
  const [r, setR] = useState<Resp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [grupo, setGrupo] = useState(0);
  const [classe, setClasse] = useState("");
  const [cidade, setCidade] = useState("");
  const [segmento, setSegmento] = useState("");
  const [humano, setHumano] = useState(false);
  const [q, setQ] = useState("");
  const [ordem, setOrdem] = useState("score");

  useEffect(() => {
    const t = setTimeout(async () => {
      const qs = new URLSearchParams();
      if (GRUPOS[grupo].estagios.length) qs.set("estagio", GRUPOS[grupo].estagios.join(","));
      if (classe) qs.set("classe", classe);
      if (cidade) qs.set("cidade", cidade);
      if (segmento) qs.set("segmento", segmento);
      if (humano) qs.set("humano", "1");
      if (q.trim()) qs.set("q", q.trim());
      qs.set("ordem", ordem);
      const res = await chamar<Resp>(`/api/prospeccao/prospects?${qs.toString()}`);
      if (!res.ok) { setErro(res.erro); return; }
      setErro(null); setR(res.data);
    }, 250);
    return () => clearTimeout(t);
  }, [grupo, classe, cidade, segmento, humano, q, ordem, versao]);

  return (
    <div className="space-y-4">
      <Erro texto={erro} />
      <div className="flex flex-wrap gap-1">
        {GRUPOS.map((g, i) => (
          <button key={g.rotulo} onClick={() => setGrupo(i)} className={`rounded-lg px-3 py-1.5 text-lone-body ${grupo === i ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`}>{g.rotulo}</button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative lg:col-span-2"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input className={`${inputCls} pl-8`} placeholder="Empresa, decisor, telefone, @" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className={inputCls} value={classe} onChange={(e) => setClasse(e.target.value)}><option value="">Classe: todas</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="NP">Não prioritário</option></select>
        <select className={inputCls} value={cidade} onChange={(e) => setCidade(e.target.value)}><option value="">Cidade: todas</option>{r?.filtros.cidades.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select className={inputCls} value={segmento} onChange={(e) => setSegmento(e.target.value)}><option value="">Segmento: todos</option>{r?.filtros.segmentos.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <div className="flex items-center gap-2">
          <select className={inputCls} value={ordem} onChange={(e) => setOrdem(e.target.value)}><option value="score">Maior score</option><option value="recentes">Atualizados</option><option value="proxima">Próxima ação</option></select>
          <label className="flex shrink-0 items-center gap-1 text-lone-caption text-muted-foreground"><input type="checkbox" checked={humano} onChange={(e) => setHumano(e.target.checked)} /> precisa de mim</label>
        </div>
      </div>
      {!r ? <p className="text-lone-body text-muted-foreground">Carregando…</p> : r.prospects.length === 0 ? <Vazio texto="Nenhum prospect com esses filtros." /> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-lone-body">
            <thead className="text-left text-lone-caption text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2 font-medium">Empresa</th><th className="px-3 py-2 font-medium">Classe</th><th className="px-3 py-2 font-medium">Etapa</th>
                <th className="px-3 py-2 font-medium">Decisor</th><th className="px-3 py-2 font-medium">Distância</th><th className="px-3 py-2 font-medium">Próxima ação</th><th className="px-3 py-2 font-medium">Última interação</th>
              </tr>
            </thead>
            <tbody>
              {r.prospects.map((p) => (
                <tr key={p.id} onClick={() => abrir(p.id)} className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2"><span className="font-medium text-foreground">{p.nome}</span>{p.precisa_humano && <span className="h-2 w-2 rounded-full bg-lone-warning" title={p.motivo_humano ?? ""} />}{p.modo_agente !== "ativo" && <span className="text-lone-caption text-muted-foreground">({p.owner === "ROBERTO" ? "Roberto" : "pausado"})</span>}</div>
                    <div className="text-lone-caption text-muted-foreground">{p.cidade ?? "—"} · {p.segmento ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2"><ChipClasse classe={p.classe} score={p.score} /></td>
                  <td className="px-3 py-2"><ChipEstagio estagio={p.estagio} /></td>
                  <td className="px-3 py-2 text-foreground">{p.decisor_nome ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2 tabular-nums text-foreground">{p.distancia_km != null ? `${p.distancia_km} km` : "—"}<span className="text-lone-caption text-muted-foreground">{p.modalidade_preferida ? ` · ${p.modalidade_preferida}` : ""}</span></td>
                  <td className="px-3 py-2"><div className="text-foreground">{p.next_action_type ?? "—"}</div><div className="text-lone-caption text-muted-foreground">{fmtDataHora(p.next_action_at)}</div></td>
                  <td className="px-3 py-2 text-lone-caption text-muted-foreground">{p.ultima_interacao_em ? `${haQuanto(p.ultima_interacao_em)} (${p.ultima_msg_de})` : p.primeira_abordagem_em ? `abordado ${haQuanto(p.primeira_abordagem_em)}` : ROTULO_ESTAGIO[p.estagio]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-border px-3 py-2 text-lone-caption text-muted-foreground">{r.total} prospect{r.total === 1 ? "" : "s"}</div>
        </div>
      )}
    </div>
  );
}
