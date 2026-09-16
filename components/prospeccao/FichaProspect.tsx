"use client";

// A ficha lateral de um prospect: empresa (com fonte de cada dado), diagnóstico, decisor, score
// detalhado, quality gate, conversa (timeline) e as ações do Roberto.

import { useEffect, useState } from "react";
import { X, RefreshCw, Send, PauseCircle, PlayCircle, UserCog, CheckCircle2, Ban, ArrowRight, CalendarPlus, Gift } from "lucide-react";
import { toast } from "sonner";
import { chamar } from "@/lib/api/chamar";
import { Button } from "@/components/ui/button";
import { ChipEstagio, ChipClasse, Linha, Campo, inputCls, Erro, fmtDataHora, fmtExtenso, telFmt, ROTULO_ESTAGIO } from "./ui";

interface Prospect {
  id: string; nome: string; razao_social: string | null; cnpj: string | null; cnae: string | null; cnae_descricao: string | null; segmento: string | null;
  cidade: string | null; uf: string | null; endereco: string | null; distancia_km: number | null; modalidade_preferida: string | null; site: string | null;
  instagram: string | null; telefone: string | null; whatsapp_verificado: boolean | null; email: string | null; google_nota: number | null; google_avaliacoes: number | null;
  unidades: number | null; porte: string | null; capital_social: number | null; abertura: string | null; fontes: Record<string, string>;
  presenca: Record<string, unknown> | null; faturamento_sinal: { faixa: string; confianca: number; sinais: string[] } | null;
  diagnostico: { oportunidades: string[]; por_que_prospectar: string; abordagem_recomendada: string; gancho?: string | null } | null;
  score: number | null; score_detalhe: Record<string, { pontos: number; max: number; motivo: string }> | null; classe: string | null;
  decisor_nome: string | null; decisor_cargo: string | null; decisor_confianca: number | null; decisor_fontes: string[] | null; decisor_telefone: string | null;
  estagio: string; etapa_pipeline: string | null; owner: string; modo_agente: string; precisa_humano: boolean; motivo_humano: string | null;
  next_action_type: string | null; next_action_at: string | null; next_action_owner: string | null; next_action_reason: string | null;
  contexto_comercial: Record<string, string | undefined>; objecoes: string[]; gift_reserved: boolean; gift_type: string | null;
  reuniao_em: string | null; reuniao_tipo: string | null; meet_url: string | null; resultado_reuniao: string | null; motivo_perda: string | null;
  quality_gate: { passed: boolean; itens: { chave: string; ok: boolean; detalhe?: string }[] } | null; origem: string | null; created_at: string;
  dados_cnpj: { decisor_alternativas?: { nome: string; cargo: string | null; fonte: string }[] } | null;
}
interface Msg { id: string; direcao: string; autor: string; texto: string; created_at: string; enviado: boolean; erro: string | null; intent: { intent: string } | null }
interface Ev { id: string; tipo: string; de: string | null; para: string | null; motivo: string | null; responsavel: string | null; proxima_acao: string | null; created_at: string }
interface Ficha { prospect: Prospect; mensagens: Msg[]; eventos: Ev[]; rascunho: string; quality_gate: { passed: boolean; itens: { chave: string; ok: boolean; detalhe?: string }[] }; transicoes: string[] }

const FAIXA: Record<string, string> = { indeterminado: "sem sinais", abaixo_100k: "provável < R$ 100k/mês", "100k_300k": "provável R$ 100–300k/mês", acima_300k: "provável > R$ 300k/mês" };
const GATE: Record<string, string> = {
  empresa_valida: "Empresa válida", segmento_valido: "Segmento no ICP", telefone_valido: "Telefone/WhatsApp válido", nao_e_cliente: "Não é cliente nem está em 'nunca prospectar'",
  nao_opt_out: "Sem opt-out", nao_abordado_antes: "Nunca abordado", dentro_da_regiao: "Dentro do RJ", icp_aprovado: "ICP aprovado", pesquisa_concluida: "Pesquisa concluída",
  score_minimo: "Score mínimo", decisor_ou_generica: "Decisor ou abordagem genérica", mensagem_validada: "Mensagem validada", janela_e_teto: "Janela 09–11 e teto", piloto_rodando: "Piloto rodando",
};

export default function FichaProspect({ id, onClose, onChange }: { id: string; onClose: () => void; onChange?: () => void }) {
  const [f, setF] = useState<Ficha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<"conversa" | "dados" | "score" | "historico">("conversa");
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [mover, setMover] = useState<{ para: string; motivo: string } | null>(null);
  const [reuniao, setReuniao] = useState<{ quando: string; tipo: "visita" | "online" } | null>(null);

  const carregar = async () => {
    const r = await chamar<Ficha>(`/api/prospeccao/prospects/${id}`);
    if (!r.ok) { setErro(r.erro); return; }
    setErro(null); setF(r.data);
  };
  useEffect(() => { void carregar(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const acao = async (corpo: Record<string, unknown>, rotulo: string) => {
    setOcupado(rotulo);
    const r = await chamar<{ prospect: Prospect; sem_link?: boolean; handoff_erros?: string[] }>(`/api/prospeccao/prospects/${id}`, corpo, { method: "PATCH" });
    setOcupado(null);
    if (!r.ok) { toast.error(r.erro ?? "Não consegui"); return false; }
    toast.success(rotulo);
    if (r.data?.sem_link) toast.warning("Google não conectado: você precisa mandar o link do Meet ao prospect.");
    if (r.data?.handoff_erros?.length) toast.warning(`Handoff com falha: ${r.data.handoff_erros.join("; ")}`);
    await carregar(); onChange?.();
    return true;
  };

  const enviar = async () => {
    if (!texto.trim()) return;
    setOcupado("Enviando");
    const r = await chamar(`/api/prospeccao/prospects/${id}/enviar`, { texto });
    setOcupado(null);
    if (!r.ok) { toast.error(r.erro ?? "Não enviei"); return; }
    setTexto(""); toast.success("Enviada (o agente ficou pausado neste prospect)"); await carregar(); onChange?.();
  };

  const reenriquecer = async () => {
    setOcupado("Pesquisando");
    const r = await chamar<{ etapas: string[]; erros: string[] }>(`/api/prospeccao/prospects/${id}/reenriquecer`, {});
    setOcupado(null);
    if (!r.ok) { toast.error(r.erro ?? "Falhou"); return; }
    toast.success(`Pesquisa: ${r.data?.etapas.join(", ") || "nada novo"}${r.data?.erros.length ? ` · falhas: ${r.data.erros.join("; ")}` : ""}`);
    await carregar(); onChange?.();
  };

  const salvarEdicao = async () => {
    const ok = await acao({ acao: "editar", campos }, "Dados salvos");
    if (ok) { setEditando(false); setCampos({}); }
  };

  if (erro && !f) return <div className="p-5"><Erro texto={erro} /><Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button></div>;
  if (!f) return <div className="p-5 text-lone-body text-muted-foreground">Carregando…</div>;
  const p = f.prospect;
  const fonte = (k: string) => p.fontes?.[k] ?? null;
  const podeFalar = !["nao_perturbe"].includes(p.estagio);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lone-h1 tracking-tight text-foreground">{p.nome}</h2>
            <ChipClasse classe={p.classe} score={p.score} /><ChipEstagio estagio={p.estagio} />
            {p.owner === "ROBERTO" && <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-lone-caption text-muted-foreground">dono: Roberto</span>}
            {p.modo_agente !== "ativo" && <span className="rounded-full border border-lone-warning-border bg-lone-warning-bg px-2 py-0.5 text-lone-caption text-lone-warning">agente em {p.modo_agente === "pausado" ? "pausa" : "observação"}</span>}
          </div>
          <div className="mt-0.5 text-lone-caption text-muted-foreground">{p.segmento ?? "—"} · {p.cidade ?? "—"}{p.uf ? `/${p.uf}` : ""}{p.distancia_km != null ? ` · ${p.distancia_km} km (${p.modalidade_preferida === "visita" ? "visita" : "online"})` : ""} · {p.etapa_pipeline ?? ""}</div>
          {p.precisa_humano && <div className="mt-1 rounded-md border border-lone-warning-border bg-lone-warning-bg px-2 py-1 text-lone-caption text-lone-warning">Precisa de você: {p.motivo_humano}</div>}
          {p.next_action_type && <div className="mt-1 text-lone-caption text-muted-foreground">Próxima ação: {p.next_action_type} · {fmtDataHora(p.next_action_at)} · {p.next_action_owner} — {p.next_action_reason}</div>}
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent" aria-label="Fechar"><X size={18} /></button>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border px-4 py-2">
        {p.precisa_humano && <Button size="sm" variant="secondary" disabled={!!ocupado} onClick={() => acao({ acao: "resolver_humano" }, "Marcado como resolvido")}><CheckCircle2 size={14} /> Resolvido</Button>}
        {p.modo_agente === "ativo" ? (
          <Button size="sm" variant="secondary" disabled={!!ocupado} onClick={() => acao({ acao: "assumir" }, "Você assumiu a conversa")}><UserCog size={14} /> Assumir</Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={!!ocupado} onClick={() => acao({ acao: "retomar" }, "Agente retomado")}><PlayCircle size={14} /> Devolver ao agente</Button>
        )}
        {p.modo_agente === "ativo" && <Button size="sm" variant="ghost" disabled={!!ocupado} onClick={() => acao({ acao: "pausar" }, "Agente pausado")}><PauseCircle size={14} /> Pausar</Button>}
        {["enriquecido", "icp_aprovado", "fora_icp"].includes(p.estagio) && <Button size="sm" disabled={!!ocupado} onClick={() => acao({ acao: "aprovar_fila", motivo: "aprovado à mão" }, "Na fila do dia")}><ArrowRight size={14} /> Aprovar e pôr na fila</Button>}
        {!p.reuniao_em && podeFalar && <Button size="sm" variant="secondary" onClick={() => setReuniao({ quando: "", tipo: p.modalidade_preferida === "visita" ? "visita" : "online" })}><CalendarPlus size={14} /> Marcar reunião</Button>}
        {["reuniao_agendada", "handoff"].includes(p.estagio) && (
          <>
            <Button size="sm" disabled={!!ocupado} onClick={() => acao({ acao: "resultado_reuniao", resultado: "realizada", nota: prompt("Como foi a reunião? (opcional)") ?? undefined }, "Reunião realizada")}>Realizada</Button>
            <Button size="sm" variant="secondary" disabled={!!ocupado} onClick={() => acao({ acao: "resultado_reuniao", resultado: "no_show" }, "No-show registrado")}>No-show</Button>
          </>
        )}
        <Button size="sm" variant="ghost" disabled={!!ocupado} onClick={reenriquecer}><RefreshCw size={14} /> Pesquisar de novo</Button>
        <Button size="sm" variant="ghost" disabled={!!ocupado} onClick={() => acao({ acao: "editar", campos: { gift_reserved: !p.gift_reserved, gift_type: p.gift_reserved ? null : (prompt("Qual presente?") ?? "presente") } }, p.gift_reserved ? "Presente liberado" : "Presente reservado")}><Gift size={14} /> {p.gift_reserved ? `Presente: ${p.gift_type ?? "reservado"}` : "Reservar presente"}</Button>
        <Button size="sm" variant="ghost" onClick={() => setMover({ para: "", motivo: "" })}>Mover etapa</Button>
        {podeFalar && <Button size="sm" variant="destructive" disabled={!!ocupado} onClick={() => { const m = prompt("Motivo do 'não perturbe' (fica no histórico):"); if (m) void acao({ acao: "mover", para: "nao_perturbe", motivo: m }, "Marcado: não perturbe"); }}><Ban size={14} /> Não perturbe</Button>}
      </div>

      {mover && (
        <div className="border-b border-border bg-muted/30 p-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <select className={inputCls} value={mover.para} onChange={(e) => setMover({ ...mover, para: e.target.value })}>
              <option value="">Para qual etapa?</option>
              {f.transicoes.map((t) => <option key={t} value={t}>{ROTULO_ESTAGIO[t] ?? t}</option>)}
            </select>
            <input className={inputCls} placeholder="Motivo (obrigatório — vai para o histórico)" value={mover.motivo} onChange={(e) => setMover({ ...mover, motivo: e.target.value })} />
            <div className="flex gap-1"><Button size="sm" disabled={!mover.para || !mover.motivo.trim() || !!ocupado} onClick={async () => { if (await acao({ acao: "mover", para: mover.para, motivo: mover.motivo }, "Etapa alterada")) setMover(null); }}>Mover</Button><Button size="sm" variant="ghost" onClick={() => setMover(null)}>Cancelar</Button></div>
          </div>
        </div>
      )}
      {reuniao && (
        <div className="border-b border-border bg-muted/30 p-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input type="datetime-local" className={inputCls} value={reuniao.quando} onChange={(e) => setReuniao({ ...reuniao, quando: e.target.value })} />
            <select className={inputCls} value={reuniao.tipo} onChange={(e) => setReuniao({ ...reuniao, tipo: e.target.value as "visita" | "online" })}><option value="online">Google Meet</option><option value="visita">Visita presencial</option></select>
            <div className="flex gap-1"><Button size="sm" disabled={!reuniao.quando || !!ocupado} onClick={async () => { if (await acao({ acao: "marcar_reuniao", inicioIso: new Date(reuniao.quando).toISOString(), tipo: reuniao.tipo }, "Reunião marcada + handoff")) setReuniao(null); }}>Marcar</Button><Button size="sm" variant="ghost" onClick={() => setReuniao(null)}>Cancelar</Button></div>
          </div>
          <p className="mt-1 text-lone-caption text-muted-foreground">Cria no Google Calendar (se conectado), na agenda do time e no funil comercial, e faz o handoff. A confirmação ao prospect você manda pela conversa.</p>
        </div>
      )}

      <div className="flex gap-1 border-b border-border px-4">
        {(["conversa", "dados", "score", "historico"] as const).map((a) => (
          <button key={a} onClick={() => setAba(a)} className={`border-b-2 px-3 py-2 text-lone-body ${aba === a ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {a === "conversa" ? `Conversa (${f.mensagens.length})` : a === "dados" ? "Empresa e decisor" : a === "score" ? "Score e diagnóstico" : `Histórico (${f.eventos.length})`}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {aba === "conversa" && (
          <div className="space-y-3">
            {f.mensagens.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-3">
                <div className="text-lone-caption text-muted-foreground">Ainda sem mensagens. A abordagem que o agente mandaria:</div>
                <p className="mt-1 whitespace-pre-wrap text-lone-body text-foreground">{f.rascunho}</p>
              </div>
            )}
            {f.mensagens.map((m) => (
              <div key={m.id} className={`flex ${m.direcao === "in" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 ${m.direcao === "in" ? "bg-muted text-foreground" : m.autor === "humano" ? "border border-lone-warning-border bg-lone-warning-bg text-foreground" : "bg-primary/10 text-foreground"}`}>
                  <p className="whitespace-pre-wrap text-lone-body">{m.texto}</p>
                  <div className="mt-1 text-lone-caption text-muted-foreground">{m.direcao === "in" ? "prospect" : m.autor === "humano" ? "você" : "agente"} · {fmtDataHora(m.created_at)}{m.intent?.intent ? ` · ${m.intent.intent}` : ""}{!m.enviado ? ` · NÃO ENVIADA (${m.erro ?? ""})` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {aba === "dados" && (
          <div className="space-y-4">
            {!editando ? (
              <>
                <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={() => { setEditando(true); setCampos({ nome: p.nome, cnpj: p.cnpj ?? "", telefone: p.telefone ?? "", instagram: p.instagram ?? "", site: p.site ?? "", email: p.email ?? "", endereco: p.endereco ?? "", cidade: p.cidade ?? "", segmento: p.segmento ?? "", decisor_nome: p.decisor_nome ?? "", decisor_cargo: p.decisor_cargo ?? "", decisor_telefone: p.decisor_telefone ?? "", unidades: p.unidades?.toString() ?? "" }); }}>Editar dados</Button></div>
                <div>
                  <h3 className="text-lone-eyebrow uppercase tracking-wider text-muted-foreground">Empresa</h3>
                  <Linha rotulo="Razão social" valor={p.razao_social} fonte={fonte("razao_social")} />
                  <Linha rotulo="CNPJ" valor={p.cnpj} fonte={fonte("cnpj")} />
                  <Linha rotulo="CNAE" valor={p.cnae ? `${p.cnae}${p.cnae_descricao ? ` — ${p.cnae_descricao}` : ""}` : null} fonte={fonte("cnae")} />
                  <Linha rotulo="Porte / capital" valor={p.porte || p.capital_social ? `${p.porte ?? "—"}${p.capital_social ? ` · R$ ${Math.round(p.capital_social).toLocaleString("pt-BR")}` : ""}` : null} fonte={fonte("porte")} />
                  <Linha rotulo="Abertura" valor={p.abertura} fonte={fonte("abertura")} />
                  <Linha rotulo="Endereço" valor={p.endereco} fonte={fonte("endereco")} />
                  <Linha rotulo="Distância" valor={p.distancia_km != null ? `${p.distancia_km} km de Araruama` : null} fonte={fonte("lat")} />
                  <Linha rotulo="Telefone" valor={p.telefone ? `${telFmt(p.telefone)}${p.whatsapp_verificado === true ? " · WhatsApp ok" : p.whatsapp_verificado === false ? " · SEM WhatsApp" : ""}` : null} fonte={fonte("telefone")} />
                  <Linha rotulo="Instagram" valor={p.instagram ? <a className="text-primary hover:underline" href={`https://instagram.com/${p.instagram}`} target="_blank" rel="noreferrer">@{p.instagram}</a> : null} fonte={fonte("instagram")} />
                  <Linha rotulo="Site" valor={p.site ? <a className="text-primary hover:underline" href={p.site} target="_blank" rel="noreferrer">{p.site}</a> : null} fonte={fonte("site")} />
                  <Linha rotulo="E-mail" valor={p.email} fonte={fonte("email")} />
                  <Linha rotulo="Google" valor={p.google_avaliacoes != null ? `${p.google_nota ?? "?"} estrelas · ${p.google_avaliacoes} avaliações` : null} fonte={fonte("google_avaliacoes")} />
                  <Linha rotulo="Unidades" valor={p.unidades} fonte={fonte("unidades")} />
                  <Linha rotulo="Instagram (leitura)" valor={p.presenca?.instagram_followers ? `${Number(p.presenca.instagram_followers).toLocaleString("pt-BR")} seguidores · ${p.presenca.posts_por_semana ?? "?"} posts/sem · ${p.presenca.pct_reels ?? "?"}% Reels` : null} fonte={fonte("instagram_followers")} />
                  <Linha rotulo="Anúncios" valor={p.presenca?.anuncia === true ? "sim" : p.presenca?.anuncia === false ? "não identificados" : "não verificado"} fonte={fonte("anuncia")} />
                  <Linha rotulo="Faturamento (sinal)" valor={p.faturamento_sinal ? `${FAIXA[p.faturamento_sinal.faixa] ?? p.faturamento_sinal.faixa} · confiança ${Math.round(p.faturamento_sinal.confianca * 100)}% · ESTIMATIVA` : null} />
                  {!!p.faturamento_sinal?.sinais?.length && <div className="text-lone-caption text-muted-foreground">Sinais: {p.faturamento_sinal.sinais.join("; ")}</div>}
                  <Linha rotulo="Origem" valor={p.origem} />
                </div>
                <div>
                  <h3 className="text-lone-eyebrow uppercase tracking-wider text-muted-foreground">Decisor</h3>
                  <Linha rotulo="Nome" valor={p.decisor_nome} fonte={p.decisor_fontes?.join(" + ")} />
                  <Linha rotulo="Cargo" valor={p.decisor_cargo} />
                  <Linha rotulo="Confiança" valor={p.decisor_confianca != null ? `${Math.round(p.decisor_confianca * 100)}%` : null} />
                  <Linha rotulo="WhatsApp direto" valor={telFmt(p.decisor_telefone)} />
                  {!!p.dados_cnpj?.decisor_alternativas?.length && <div className="mt-1 text-lone-caption text-muted-foreground">Outros nomes vistos: {p.dados_cnpj.decisor_alternativas.map((a) => `${a.nome}${a.cargo ? ` (${a.cargo})` : ""} — ${a.fonte}`).join(" · ")}</div>}
                </div>
                {(p.contexto_comercial?.resumo || p.objecoes?.length || p.contexto_comercial?.proxima_abordagem) && (
                  <div>
                    <h3 className="text-lone-eyebrow uppercase tracking-wider text-muted-foreground">Contexto comercial</h3>
                    <Linha rotulo="Resumo" valor={p.contexto_comercial?.resumo} />
                    <Linha rotulo="Objeções" valor={p.objecoes?.join("; ")} />
                    <Linha rotulo="Motivo do retorno" valor={p.contexto_comercial?.motivo_retorno} />
                    <Linha rotulo="Próxima abordagem" valor={p.contexto_comercial?.proxima_abordagem} />
                  </div>
                )}
                {p.reuniao_em && (
                  <div>
                    <h3 className="text-lone-eyebrow uppercase tracking-wider text-muted-foreground">Reunião</h3>
                    <Linha rotulo="Quando" valor={fmtExtenso(p.reuniao_em)} />
                    <Linha rotulo="Formato" valor={p.reuniao_tipo === "visita" ? "Visita presencial" : "Google Meet"} />
                    <Linha rotulo="Link" valor={p.meet_url ? <a className="text-primary hover:underline" href={p.meet_url} target="_blank" rel="noreferrer">{p.meet_url}</a> : p.reuniao_tipo === "online" ? "sem link (Google não conectado)" : null} />
                    <Linha rotulo="Resultado" valor={p.resultado_reuniao} />
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  {[["nome", "Nome"], ["cnpj", "CNPJ"], ["segmento", "Segmento (nome do ICP)"], ["cidade", "Cidade"], ["endereco", "Endereço"], ["telefone", "Telefone/WhatsApp"], ["instagram", "Instagram"], ["site", "Site"], ["email", "E-mail"], ["unidades", "Unidades"], ["decisor_nome", "Decisor"], ["decisor_cargo", "Cargo do decisor"], ["decisor_telefone", "WhatsApp do decisor"]].map(([k, l]) => (
                    <Campo key={k} label={l}><input className={inputCls} value={campos[k] ?? ""} onChange={(e) => setCampos({ ...campos, [k]: e.target.value })} /></Campo>
                  ))}
                </div>
                <div className="flex gap-2"><Button size="sm" disabled={!!ocupado} onClick={salvarEdicao}>Salvar</Button><Button size="sm" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button></div>
                <p className="text-lone-caption text-muted-foreground">Depois de corrigir CNPJ/Instagram, use "Pesquisar de novo" para o agente reler tudo.</p>
              </div>
            )}
          </div>
        )}
        {aba === "score" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lone-eyebrow uppercase tracking-wider text-muted-foreground">Score {p.score ?? "—"}/100 · {p.classe ?? "—"}</h3>
              {p.score_detalhe ? (
                <ul className="mt-1 space-y-1">
                  {Object.entries(p.score_detalhe).map(([k, v]) => (
                    <li key={k} className="flex items-center gap-3 text-lone-body">
                      <span className="w-44 shrink-0 truncate text-muted-foreground">{k.replace(/_/g, " ")}</span>
                      <div className="h-1.5 flex-1 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${v.max ? (v.pontos / v.max) * 100 : 0}%` }} /></div>
                      <span className="w-12 text-right tabular-nums text-foreground">{v.pontos}/{v.max}</span>
                      <span className="hidden w-64 truncate text-lone-caption text-muted-foreground sm:block" title={v.motivo}>{v.motivo}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-lone-body text-muted-foreground">Ainda não pontuado.</p>}
            </div>
            <div>
              <h3 className="text-lone-eyebrow uppercase tracking-wider text-muted-foreground">Por que prospectar</h3>
              {p.diagnostico ? (
                <div className="mt-1 space-y-2 text-lone-body text-foreground">
                  <p>{p.diagnostico.por_que_prospectar}</p>
                  <ul className="list-disc space-y-0.5 pl-5">{p.diagnostico.oportunidades.map((o, i) => <li key={i}>{o}</li>)}</ul>
                  <p><span className="text-muted-foreground">Abordagem recomendada:</span> {p.diagnostico.abordagem_recomendada}</p>
                  {p.diagnostico.gancho && <p><span className="text-muted-foreground">Gancho para a conversa:</span> {p.diagnostico.gancho}</p>}
                </div>
              ) : <p className="text-lone-body text-muted-foreground">Sem diagnóstico (pesquisa ainda não rodou).</p>}
            </div>
            <div>
              <h3 className="text-lone-eyebrow uppercase tracking-wider text-muted-foreground">Quality gate {f.quality_gate.passed ? "— aprovado" : "— reprovado"}</h3>
              <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                {f.quality_gate.itens.map((i) => (
                  <li key={i.chave} className={`flex items-start gap-2 text-lone-body ${i.ok ? "text-foreground" : "text-lone-danger"}`}>
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${i.ok ? "bg-lone-success" : "bg-lone-danger"}`} />
                    <span>{GATE[i.chave] ?? i.chave}{i.detalhe ? <span className="text-lone-caption text-muted-foreground"> — {i.detalhe}</span> : null}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {aba === "historico" && (
          <ul className="space-y-2">
            {f.eventos.slice().reverse().map((e) => (
              <li key={e.id} className="text-lone-body">
                <div className="text-lone-caption text-muted-foreground">{fmtDataHora(e.created_at)} · {e.tipo}{e.responsavel ? ` · ${e.responsavel}` : ""}</div>
                <div className="text-foreground">{e.de || e.para ? `${e.de ? ROTULO_ESTAGIO[e.de] ?? e.de : "—"} → ${e.para ? ROTULO_ESTAGIO[e.para] ?? e.para : "—"}` : ""}{e.motivo ? ` — ${e.motivo}` : ""}</div>
                {e.proxima_acao && <div className="text-lone-caption text-muted-foreground">Próxima ação: {e.proxima_acao}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {podeFalar && (
        <div className="border-t border-border p-3">
          <div className="flex gap-2">
            <textarea className={`${inputCls} min-h-[44px] resize-none`} rows={2} placeholder="Responder como você (pausa o agente neste prospect)" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void enviar(); }} />
            <Button disabled={!texto.trim() || !!ocupado} onClick={enviar}><Send size={14} /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
