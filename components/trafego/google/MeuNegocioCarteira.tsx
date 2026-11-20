"use client";

// Tráfego › Google Meu Negócio (19/11/2026). O Perfil da Empresa de cada cliente numa tela:
//   · contatos pelo perfil (ligações, rotas, cliques no site, conversas) nos últimos 28 dias que o Google já entregou,
//     contra os 28 anteriores — o Google atrasa 2 a 5 dias, então a janela termina no último dia entregue, nunca "hoje";
//   · onde as pessoas acharam o perfil: Busca × Maps;
//   · nota, total de avaliações e a FILA de avaliações sem resposta (as negativas primeiro). Meta: 100% respondidas em
//     até 48 h (89% dos consumidores esperam resposta do dono — BrightLocal 2026).
// O sistema só lê: a resposta se escreve no Google (o botão abre o perfil certo). A Q&A do Google acabou em 03/11/2025.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ChevronDown, ChevronRight, ExternalLink, Loader2, MapPin, MessageSquareText, Navigation, Phone,
  PlugZap, RefreshCw, Search, Star, Store, Globe, MessagesSquare,
} from "lucide-react";
import { toast } from "sonner";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { pior, type Gravidade } from "@/lib/google/carteira";
import type { ClientePerfil, RespostaPerfil } from "@/app/api/trafego/google-perfil/route";
import { Button } from "@/components/ui/button";
import { Aviso, CartaoNumero, ChipSinal, GRAVIDADE, SemSinais, Variacao, inteiro, quando } from "./ui";

type Filtro = "todos" | "responder" | "nota" | "queda";
const ordem: Record<Gravidade | "ok", number> = { critico: 0, atencao: 1, info: 2, ok: 3 };
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const dataBr = (ymd: string | null) => (ymd ? ymd.slice(0, 10).split("-").reverse().join("/") : "—");
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function Estrelas({ nota, tamanho = 12 }: { nota: number | null; tamanho?: number }) {
  if (nota == null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={tamanho} className={i <= Math.round(nota) ? "fill-lone-warning text-lone-warning" : "text-muted-foreground/40"} aria-hidden="true" />
      ))}
    </span>
  );
}

const variacaoDe = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);

export default function MeuNegocioCarteira() {
  const [dados, setDados] = useState<RespostaPerfil | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState<string | null>(null);
  const [mostrarSem, setMostrarSem] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await chamar<RespostaPerfil>("/api/trafego/google-perfil");
    if (r.ok && r.data) { setDados(r.data); setErro(null); } else setErro(r.erro);
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const atualizarAgora = async (c: ClientePerfil) => {
    setAtualizando(c.clientId);
    const r = await chamar<{ resultado?: { perfil?: { ok: boolean; erro?: string } | null } }>(`/api/clients/${c.clientId}/google`, { acao: "sincronizar" });
    setAtualizando(null);
    const p = r.data?.resultado?.perfil;
    if (!r.ok) { toast.error(r.erro ?? "Não consegui ler o Google agora."); return; }
    if (p && !p.ok) toast.error(`O Google recusou: ${p.erro ?? "erro"}`);
    else toast.success(`${c.nome}: perfil lido agora.`);
    carregar();
  };

  const clientes = dados?.clientes ?? [];
  const lista = useMemo(() => {
    const q = norm(busca.trim());
    return clientes
      .filter((c) => !q || norm(`${c.nome} ${c.perfilNome ?? ""}`).includes(q))
      .filter((c) => {
        if (filtro === "responder") return c.linha.semResposta.length > 0;
        if (filtro === "nota") return c.nota != null && c.nota < 4.5;
        if (filtro === "queda") return (c.linha.variacaoContatos ?? 0) <= -20;
        return true;
      })
      .sort((a, b) => ordem[pior(a.linha.sinais) ?? "ok"] - ordem[pior(b.linha.sinais) ?? "ok"] || b.linha.semResposta.length - a.linha.semResposta.length || b.linha.atual.contatos - a.linha.atual.contatos);
  }, [clientes, busca, filtro]);

  const totais = useMemo(() => {
    const comNota = clientes.filter((c) => c.nota != null);
    return {
      perfis: clientes.length,
      contatos: clientes.reduce((s, c) => s + c.linha.atual.contatos, 0),
      contatosAnt: clientes.reduce((s, c) => s + c.linha.anterior.contatos, 0),
      semResposta: clientes.reduce((s, c) => s + c.linha.semResposta.length, 0),
      negativas: clientes.reduce((s, c) => s + c.linha.negativasSemResposta, 0),
      clientesResponder: clientes.filter((c) => c.linha.semResposta.length).length,
      notaMedia: comNota.length ? comNota.reduce((s, c) => s + (c.nota ?? 0), 0) / comNota.length : null,
      notaBaixa: clientes.filter((c) => c.nota != null && c.nota < 4.5).length,
    };
  }, [clientes]);

  if (carregando && !dados) {
    return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Lendo os perfis do Google…</div>;
  }

  return (
    <div className="space-y-5">
      {erro && <Aviso tom="perigo" acao={<button type="button" onClick={carregar} className="font-medium underline">Tentar de novo</button>}>{erro}</Aviso>}
      {dados && (!dados.conexao.conectado || !dados.conexao.perfil) && (
        <Aviso tom="aviso" acao={<Link href="/integracoes" className="font-medium underline">Abrir Integrações</Link>}>
          {dados.conexao.conectado ? "A conexão do Google não tem a permissão do Perfil da Empresa. Reconecte e marque a permissão." : "O Google não está conectado: os perfis não são lidos."}
        </Aviso>
      )}
      {dados && !dados.migracao && (
        <Aviso tom="info">Falta aplicar a migração <code>20261119150000_trafego_google.sql</code>: até lá a nota e as avaliações não aparecem (os números do perfil aparecem).</Aviso>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CartaoNumero rotulo="Perfis" valor={String(totais.perfis)} sub={`${dados?.semPerfil.length ?? 0} clientes sem perfil vinculado`} icone={Store} ativo={filtro === "todos"} onClick={() => setFiltro("todos")} />
        <CartaoNumero rotulo="Contatos pelo perfil" valor={inteiro(totais.contatos)} sub={totais.contatosAnt ? `últimos 28 dias · ${(() => { const v = variacaoDe(totais.contatos, totais.contatosAnt); return v == null ? "" : `${v >= 0 ? "+" : ""}${Math.round(v)}% vs anteriores`; })()}` : "últimos 28 dias entregues"} icone={Phone} />
        <CartaoNumero rotulo="Avaliações sem resposta" valor={String(totais.semResposta)} sub={totais.negativas ? `${totais.negativas} negativas · ${totais.clientesResponder} clientes` : `${totais.clientesResponder} clientes`} icone={MessageSquareText} tom={totais.negativas ? "perigo" : totais.semResposta ? "aviso" : "neutro"} ativo={filtro === "responder"} onClick={() => setFiltro(filtro === "responder" ? "todos" : "responder")} />
        <CartaoNumero rotulo="Nota média" valor={totais.notaMedia == null ? "—" : totais.notaMedia.toFixed(1).replace(".", ",")} sub={`${totais.notaBaixa} perfis abaixo de 4,5`} icone={Star} tom={totais.notaBaixa ? "aviso" : "neutro"} ativo={filtro === "nota"} onClick={() => setFiltro(filtro === "nota" ? "todos" : "nota")} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente ou perfil…"
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          {(["todos", "responder", "nota", "queda"] as Filtro[]).map((f) => (
            <button key={f} type="button" onClick={() => setFiltro(f)}
              className={cn("rounded-md px-3 py-1.5 text-xs transition-colors", filtro === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {f === "todos" ? "Todos" : f === "responder" ? "Para responder" : f === "nota" ? "Nota abaixo de 4,5" : "Contatos caindo"}
            </button>
          ))}
        </div>
        <button type="button" onClick={carregar} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-muted">
          <RefreshCw size={13} className={cn(carregando && "animate-spin")} /> Recarregar
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="hidden grid-cols-[minmax(180px,1.2fr)_minmax(200px,1.3fr)_repeat(4,minmax(78px,0.5fr))_minmax(150px,0.9fr)_28px] gap-4 border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground lg:grid">
          <span>Cliente</span><span>O que precisa de atenção</span><span className="text-right">Ligações</span><span className="text-right">Rotas</span><span className="text-right">Site</span><span className="text-right">Conversas</span><span>Avaliações</span><span />
        </div>
        {!lista.length && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {clientes.length ? "Nenhum perfil neste filtro." : "Nenhum cliente com Perfil da Empresa vinculado. O cliente precisa adicionar a conta da Lone como gerente do perfil; depois, vincule na ficha › Admin › Google."}
          </p>
        )}
        {lista.map((c) => (
          <LinhaPerfil key={c.clientId} c={c} aberto={aberto === c.clientId} onAbrir={() => setAberto(aberto === c.clientId ? null : c.clientId)}
            onAtualizar={() => atualizarAgora(c)} atualizando={atualizando === c.clientId} />
        ))}
      </div>

      {!!dados?.semPerfil.length && (
        <div className="rounded-xl border border-border bg-card">
          <button type="button" onClick={() => setMostrarSem(!mostrarSem)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm">
            {mostrarSem ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <PlugZap size={15} className="text-muted-foreground" />
            <span className="font-medium">{dados.semPerfil.length} clientes sem Perfil da Empresa vinculado</span>
            {dados.semPerfil.some((s) => s.sugestao) && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{dados.semPerfil.filter((s) => s.sugestao).length} com sugestão para confirmar</span>
            )}
          </button>
          {mostrarSem && (
            <ul className="grid gap-1 border-t border-border p-2 sm:grid-cols-2 lg:grid-cols-3">
              {dados.semPerfil.map((s) => (
                <li key={s.clientId}>
                  <Link href={`/clients/${s.clientId}?tab=admin`} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted">
                    <span className="min-w-0">
                      <span className="block truncate">{s.nome}</span>
                      {s.sugestao && <span className="block truncate text-[11px] text-primary">Sugestão: {s.sugestao} — confirmar na ficha</span>}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{s.gestor ?? ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Números do Perfil da Empresa lidos todo dia às 7h. O Google libera com 2 a 5 dias de atraso: a janela de 28 dias termina no último dia entregue e é comparada com os 28 anteriores.
        O Google não conta toques repetidos da mesma pessoa no mesmo dia. Avaliações: as 100 mais recentes de cada perfil. A resposta se escreve no Google.
      </p>
    </div>
  );
}

function LinhaPerfil({ c, aberto, onAbrir, onAtualizar, atualizando }: { c: ClientePerfil; aberto: boolean; onAbrir: () => void; onAtualizar: () => void; atualizando: boolean }) {
  const l = c.linha;
  const g = pior(l.sinais);
  const col = (atual: number, ant: number) => (
    <div className="text-right tabular-nums">
      <p className="text-sm font-medium">{l.janela ? inteiro(atual) : "—"}</p>
      <Variacao valor={l.janela ? variacaoDe(atual, ant) : null} className="justify-end" />
    </div>
  );
  return (
    <div className={cn("relative border-b border-border last:border-b-0", g && g !== "info" && "before:absolute before:inset-y-0 before:left-0 before:w-[3px]", g && GRAVIDADE[g].borda)}>
      <div role="button" tabIndex={0} aria-expanded={aberto} onClick={onAbrir} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(); } }}
        className="grid cursor-pointer grid-cols-4 gap-3 px-4 py-3 transition-colors hover:bg-muted/40 lg:grid-cols-[minmax(180px,1.2fr)_minmax(200px,1.3fr)_repeat(4,minmax(78px,0.5fr))_minmax(150px,0.9fr)_28px] lg:items-center lg:gap-4">
        <div className="col-span-4 min-w-0 lg:col-span-1">
          <p className="truncate text-sm font-medium">{c.nome}</p>
          <p className="truncate text-[11px] text-muted-foreground">{c.perfilNome ?? c.local}{c.gestor ? ` · ${c.gestor}` : ""}</p>
        </div>
        <div className="col-span-4 flex min-w-0 flex-wrap gap-1 lg:col-span-1">
          {l.sinais.length ? l.sinais.slice(0, 2).map((s, i) => <ChipSinal key={i} sinal={s} compacto />) : <SemSinais />}
          {l.sinais.length > 2 && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">+{l.sinais.length - 2}</span>}
        </div>
        {col(l.atual.ligacoes, l.anterior.ligacoes)}
        {col(l.atual.rotas, l.anterior.rotas)}
        {col(l.atual.site, l.anterior.site)}
        {col(l.atual.conversas, l.anterior.conversas)}
        <div className="col-span-4 min-w-0 lg:col-span-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold tabular-nums">{c.nota == null ? "—" : c.nota.toFixed(1).replace(".", ",")}</span>
            <Estrelas nota={c.nota} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {c.total == null ? "avaliações não lidas" : `${inteiro(c.total)} avaliações`}
            {l.semResposta.length > 0 && <span className={cn("ml-1 font-medium", l.negativasSemResposta ? "text-lone-danger" : "text-lone-warning")}>· {l.semResposta.length} sem resposta</span>}
          </p>
        </div>
        <ChevronDown size={16} className={cn("hidden text-muted-foreground transition-transform lg:block", aberto && "rotate-180")} />
      </div>
      {aberto && <DetalhePerfil c={c} onAtualizar={onAtualizar} atualizando={atualizando} />}
    </div>
  );
}

function DetalhePerfil({ c, onAtualizar, atualizando }: { c: ClientePerfil; onAtualizar: () => void; atualizando: boolean }) {
  const l = c.linha;
  const vis = l.atual.busca + l.atual.mapas;
  const fila = [...l.semResposta].sort((a, b) => (a.nota ?? 5) - (b.nota ?? 5) || (a.criada_em ?? "").localeCompare(b.criada_em ?? ""));
  const mesT = c.mesTermos ? `${MESES[Number(c.mesTermos.slice(5, 7)) - 1]}/${c.mesTermos.slice(2, 4)}` : null;
  return (
    <div className="space-y-4 border-t border-border bg-muted/20 px-4 py-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Contatos e visualizações */}
        <div className="space-y-3">
          <p className="text-xs font-medium">
            Contatos pelo perfil {l.janela && <span className="font-normal text-muted-foreground">· {dataBr(l.janela.de)} a {dataBr(l.janela.ate)}</span>}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { r: "Ligações", v: l.atual.ligacoes, a: l.anterior.ligacoes, i: Phone },
              { r: "Rotas pedidas", v: l.atual.rotas, a: l.anterior.rotas, i: Navigation },
              { r: "Cliques no site", v: l.atual.site, a: l.anterior.site, i: Globe },
              { r: "Conversas", v: l.atual.conversas, a: l.anterior.conversas, i: MessagesSquare },
            ].map((k) => (
              <div key={k.r} className="rounded-lg border border-border bg-card px-3 py-2">
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><k.i size={11} />{k.r}</p>
                <p className="mt-0.5 flex items-baseline justify-between text-sm font-semibold tabular-nums">{inteiro(k.v)} <Variacao valor={variacaoDe(k.v, k.a)} /></p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <p className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin size={11} /> Onde acharam o perfil</span>
              <span className="tabular-nums">{inteiro(vis)} visualizações</span>
            </p>
            {vis > 0 ? (
              <>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
                  <div className="bg-primary" style={{ width: `${(l.atual.busca / vis) * 100}%` }} />
                  <div className="bg-lone-success" style={{ width: `${(l.atual.mapas / vis) * 100}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[11px]">
                  <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-primary" />Busca {Math.round((l.atual.busca / vis) * 100)}%</span>
                  <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-lone-success" />Maps {Math.round((l.atual.mapas / vis) * 100)}%</span>
                </div>
              </>
            ) : <p className="mt-1 text-xs text-muted-foreground">Sem visualizações na janela.</p>}
          </div>
          {!!c.termos.length && (
            <div>
              <p className="mb-1.5 text-xs font-medium">Buscas que mostraram o perfil {mesT && <span className="font-normal text-muted-foreground">· {mesT}</span>}</p>
              <ul className="flex flex-wrap gap-1">
                {c.termos.map((t) => (
                  <li key={t.termo} className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px]">
                    {t.termo} <span className="tabular-nums text-muted-foreground">{t.valor != null ? t.valor : t.limiar != null ? `<${t.limiar}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Fila de avaliações */}
        <div className="space-y-2 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium">
              Avaliações sem resposta {fila.length > 0 && <span className="text-muted-foreground">({fila.length})</span>}
            </p>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              {l.taxaResposta90d != null && <span>Respondidas (90 dias): <b className="text-foreground">{Math.round(l.taxaResposta90d * 100)}%</b></span>}
              <span>Novas no mês: <b className="text-foreground">{l.novasNoMes}</b></span>
              {l.ultimaAvaliacaoDias != null && <span>Última: há {l.ultimaAvaliacaoDias} {l.ultimaAvaliacaoDias === 1 ? "dia" : "dias"}</span>}
            </div>
          </div>
          {fila.length ? (
            <ul className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {fila.map((a) => (
                <li key={a.review_id} className={cn("rounded-lg border bg-card px-3 py-2", a.nota != null && a.nota <= 3 ? "border-lone-danger-border" : "border-border")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-medium"><Estrelas nota={a.nota} />{a.autor ?? "Anônimo"}</span>
                    <span className="text-[11px] text-muted-foreground">{dataBr(a.criada_em)}</span>
                  </div>
                  <p className={cn("mt-1 text-xs leading-relaxed", !a.comentario && "italic text-muted-foreground")}>{a.comentario ?? "Só a nota, sem comentário."}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              {c.total == null ? "As avaliações ainda não foram lidas." : "Nenhuma avaliação esperando resposta. 👏"}
            </div>
          )}
        </div>
      </div>

      {/* Sinais */}
      {l.sinais.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {l.sinais.map((s, i) => (
            <li key={i} title={s.detalhe}><ChipSinal sinal={s} /></li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button size="sm" asChild><a href={c.linkAvaliacoes} target="_blank" rel="noreferrer"><MessageSquareText size={13} className="mr-1.5" />Responder no Google <ExternalLink size={11} className="ml-1" /></a></Button>
        <Button size="sm" variant="outline" onClick={onAtualizar} disabled={atualizando}>
          {atualizando ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <RefreshCw size={13} className="mr-1.5" />}Ler o Google agora
        </Button>
        <Button size="sm" variant="ghost" asChild><Link href={`/clients/${c.clientId}?tab=admin`}>Ficha do cliente</Link></Button>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
          {l.sinais.some((s) => s.gravidade === "critico") && <AlertTriangle size={11} className="text-lone-danger" />}
          Lido em {quando(c.sincronizadoEm)} · números até {dataBr(c.ultimoDia)}
        </span>
      </div>
    </div>
  );
}
