"use client";

// Relatório de Instagram orgânico no portal do cliente (7/14/30 dias, escolhido no topo da aba).
// Lê do cache (rota /api/meta/instagram/[clientId]?token=&period=).
//
// 05/11/2026 (Painel v2, pesquisa na doc atual da Meta e nos concorrentes): o que o dono de loja entende
// como resultado — quem chegou ao perfil e tocou em ligar/rota/WhatsApp, saldo real de seguidores
// (entraram − saíram), alcance comparado com o período anterior e de onde ele veio (Reels, posts,
// Stories; gente nova ou quem já segue). Saiu a "taxa de engajamento" (1,0% não diz nada ao dono e
// desanima) e as notas de rodapé viraram "?" ao lado de cada número.

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Bookmark, Camera, Eye, Heart, MessageCircle, MousePointerClick, Play, RefreshCw } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import Skeleton from "@/components/ui/Skeleton";
// clsx (não cn) onde o tamanho de fonte "lone" encontra uma cor de texto: o twMerge acha que os dois são cor
// e apaga o tamanho.
import { clsx } from "clsx";
import { cn } from "@/lib/utils";
import { formatarNumero } from "@/lib/portal/formatos";
import { resumoInstagram } from "@/lib/portal/formatDelta";
import PublicoCard from "./PublicoCard";
import { Cartao, CabecalhoSecao, Dica, entrada } from "./ui";

interface Post {
  id: string; tipo: string; thumb: string | null; permalink: string | null;
  curtidas: number | null; comentarios: number | null; views: number | null; alcance: number | null;
  salvos?: number | null; compartilhamentos?: number | null; engajamento: number;
}
interface Resumo { alcance: number | null; alcanceJanelaDias?: number | null; seguidoresGanhos: number | null; curtidas: number; comentarios: number; engajamento: number; postsNoPeriodo: number | null }
interface Audiencia { generoMascPct: number | null; generoFemPct: number | null; idades: { faixa: string; pct: number }[]; cidades: { nome: string; pct: number }[] }
interface Numeros { views: number | null; alcance: number | null; interacoes: number | null; toques: number | null; entraram: number | null; sairam: number | null; posts: number | null }
interface Metricas {
  atual: Numeros; anterior: Numeros | null;
  toquesPorBotao: { tipo: string; valor: number }[];
  alcancePorFormato: { formato: string; valor: number }[];
  pctNaoSeguidores: number | null;
}
interface Snap {
  conta?: { username: string; seguidores: number | null; posts: number | null }; resumo?: Resumo; audiencia?: Audiencia; posts?: Post[];
  metricas?: Metricas;
  fonte?: "owned" | "publico" | "parcial";
  /** A Meta recusou parte da leitura (o detalhe fica com o time). */
  parcial?: boolean;
  /** Quando os números foram buscados (ISO). */
  geradoEm?: string;
  /** "ok" | "falha" | "reconectar" — falha volta 200 com isto (o 502 virava página do Cloudflare). */
  estado?: string;
}
export type IgSnapPortal = Snap;

function fmtAtualizado(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export type IgPeriodo = "7d" | "14d" | "30d";
export const IG_PERIODOS: readonly { valor: IgPeriodo; rotulo: string; dias: number }[] = [
  { valor: "7d", rotulo: "7 dias", dias: 7 },
  { valor: "14d", rotulo: "14 dias", dias: 14 },
  { valor: "30d", rotulo: "30 dias", dias: 30 },
];

const MELHORES_POSTS = 5;
const nf = (n: number | null | undefined) => (n == null ? "—" : formatarNumero(n));
const nfSinal = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatarNumero(Math.abs(n))}`;

/** Nome do botão do perfil, como o dono chama. */
export const ROTULO_BOTAO: Record<string, string> = {
  CALL: "Ligar", TEXT: "Mensagem / WhatsApp", DIRECTION: "Como chegar", EMAIL: "E-mail", BOOK_NOW: "Agendar",
  INSTANT_EXPERIENCE: "Site", UNDEFINED: "Outros",
};
/** Formato de onde veio o alcance. */
export const ROTULO_FORMATO: Record<string, string> = {
  REELS: "Reels", REEL: "Reels", FEED: "Posts", POST: "Posts", STORY: "Stories", AD: "Anúncios", CAROUSEL_CONTAINER: "Carrossel",
};

/** Variação % entre dois números (null quando não dá para comparar). Pura (testada). */
export function variacaoPct(atual: number | null | undefined, anterior: number | null | undefined): number | null {
  if (atual == null || anterior == null || anterior <= 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

// nao_conectado = perfil não vinculado (404); reconectar = vínculo expirou (409); falha = Meta/rede agora.
type Problema = "nao_conectado" | "reconectar" | "falha" | null;

interface Kpi { rotulo: string; valor: string; detalhe?: string; detalheBom?: boolean; variacao?: number | null; dica?: string; destaque?: boolean }

export default function PortalInstagram({ token, clientId, period, inicial = null }: { token: string; clientId: string; period: IgPeriodo; inicial?: Snap | null }) {
  // 7 dias já vem pronto no HTML (lido do cache no servidor): a aba abre com número, sem esperar.
  const usarInicial = period === "7d" && !!inicial?.conta;
  const [data, setData] = useState<Snap | null>(usarInicial ? inicial : null);
  const [problema, setProblema] = useState<Problema>(null);
  const [loading, setLoading] = useState(!usarInicial);
  const [tentativa, setTentativa] = useState(0);
  const pularPrimeira = useRef(usarInicial);

  useEffect(() => {
    if (pularPrimeira.current) { pularPrimeira.current = false; return; }
    let alive = true; setLoading(true); setProblema(null);
    chamar<Snap>(`/api/meta/instagram/${clientId}?token=${encodeURIComponent(token)}&period=${period}`).then((r) => {
      if (!alive) return;
      const estado = r.data?.estado;
      if (r.ok && r.data?.conta && (!estado || estado === "ok")) { setData(r.data); }
      else {
        // Nunca deixar os números do período anterior sob o rótulo do novo.
        setData(null);
        setProblema(r.status === 404 ? "nao_conectado"
          : estado === "reconectar" || r.status === 409 ? "reconectar" : "falha");
      }
      setLoading(false);
    });
    return () => { alive = false; };
  }, [token, clientId, period, tentativa]);

  if (problema === "falha" || problema === "reconectar") {
    return (
      <Cartao className="p-5 text-center" role="status">
        <p className="text-sm font-medium text-foreground">
          {problema === "reconectar" ? "A conexão com seu Instagram precisa ser renovada" : "Não consegui buscar os números do Instagram agora"}
        </p>
        <p className="mt-1 text-lone-caption text-muted-foreground">
          {problema === "reconectar"
            ? "Nossa equipe cuida disso — se quiser agilizar, é só chamar a gente no WhatsApp."
            : "Seus dados continuam guardados. Tente de novo em alguns minutos."}
        </p>
        {problema === "falha" && (
          <button onClick={() => setTentativa((t) => t + 1)}
            className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-accent">
            <RefreshCw size={15} aria-hidden /> Tentar de novo
          </button>
        )}
      </Cartao>
    );
  }

  if (problema === "nao_conectado") {
    return (
      <Cartao className="p-6 text-center">
        <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground"><Camera size={18} aria-hidden /></span>
        <p className="mt-3 text-sm font-medium text-foreground">Seu Instagram ainda não está ligado a este painel</p>
        {/* Sem pedir ao cliente que resolva (04/11/2026): ligar o perfil é tarefa nossa. */}
        <p className="mx-auto mt-1 max-w-prose text-lone-caption text-muted-foreground">
          Assim que a nossa equipe ligar o perfil, esta aba passa a mostrar seguidores, alcance,
          quem tocou nos seus botões e os posts que mais renderam.
        </p>
      </Cartao>
    );
  }

  // Carregando sem nada na tela: a aba inteira em esqueleto (antes eram só 4 caixinhas e o resto
  // sumia — parecia vazio, e o cliente recarregava).
  if (loading && !data) return <EsqueletoInstagram />;

  const r = data?.resumo;
  const a = data?.audiencia;
  const m = data?.metricas;
  const atual = m?.atual;
  const ant = m?.anterior ?? null;
  const posts = data?.posts ?? [];
  const isPublico = data?.fonte === "publico";
  const dias = IG_PERIODOS.find((p) => p.valor === period)?.dias ?? 7;

  // Seguidores: saldo real quando a Meta entrega entraram/saíram; senão, só os novos (snapshot antigo).
  const saldo = atual?.entraram != null && atual?.sairam != null ? atual.entraram - atual.sairam : null;
  const detalheSeguidores = isPublico ? undefined
    : saldo != null ? `${nfSinal(saldo)} no período · ${formatarNumero(atual!.entraram!)} entraram, ${formatarNumero(atual!.sairam!)} saíram`
    : r?.seguidoresGanhos != null ? `${nfSinal(r.seguidoresGanhos)} ${r.seguidoresGanhos === 1 ? "novo" : "novos"} no período` : undefined;
  const alcance = atual?.alcance ?? r?.alcance ?? null;
  const interacoes = atual?.interacoes ?? (posts.length ? posts.reduce((s, p) => s + p.engajamento, 0) : null);

  const principais: Kpi[] = [
    { rotulo: "Seguidores", valor: nf(data?.conta?.seguidores ?? null), detalhe: detalheSeguidores, detalheBom: (saldo ?? r?.seguidoresGanhos ?? 0) > 0 },
    ...(isPublico ? [] : [
      { rotulo: "Pessoas alcançadas", valor: nf(alcance), variacao: variacaoPct(alcance, ant?.alcance),
        dica: "Pessoas diferentes que viram o perfil, os posts ou os Stories — inclui quem chegou pelos anúncios, então não some com o alcance do tráfego pago." },
      { rotulo: "Visualizações", valor: nf(atual?.views ?? null), variacao: variacaoPct(atual?.views, ant?.views),
        dica: "Quantas vezes posts, Reels e Stories foram vistos (a mesma pessoa pode ver mais de uma vez)." },
      { rotulo: "Toques nos botões", valor: nf(atual?.toques ?? null), variacao: variacaoPct(atual?.toques, ant?.toques), destaque: true,
        dica: "Quantas vezes alguém tocou em ligar, mensagem, como chegar ou e-mail no seu perfil: gente querendo falar com a loja." },
    ]),
  ].filter((k) => k.rotulo === "Seguidores" || k.valor !== "—");

  const secundarios: Kpi[] = [
    { rotulo: "Interações", valor: nf(interacoes), variacao: variacaoPct(atual?.interacoes, ant?.interacoes),
      dica: "Curtidas, comentários, salvamentos e compartilhamentos somados." },
    { rotulo: "Posts no período", valor: nf(r?.postsNoPeriodo ?? null),
      detalhe: ant?.posts != null ? `${formatarNumero(ant.posts)} no período anterior` : undefined },
  ].filter((k) => k.valor !== "—" || k.rotulo === "Posts no período");

  // A frase usa os MESMOS números dos cartões: "seguidores novos" = quem entrou (não o follower_count antigo,
  // que dava 36 na frase e 26 no cartão — visto na Araruama Tintas, 05/11/2026).
  const frase = resumoInstagram(dias, isPublico ? { postsNoPeriodo: r?.postsNoPeriodo }
    : r ? { ...r, alcance, alcanceJanelaDias: atual?.alcance != null ? dias : r.alcanceJanelaDias, seguidoresGanhos: atual?.entraram ?? r.seguidoresGanhos } : r);
  const temAudiencia = !!a && (a.generoMascPct != null || a.idades.length > 0 || a.cidades.length > 0);
  const melhores = posts.slice(0, MELHORES_POSTS);
  const botoes = m?.toquesPorBotao ?? [];
  const formatos = (m?.alcancePorFormato ?? []).filter((f) => f.formato !== "AD");

  return (
    <div className="space-y-5">
      <motion.section variants={entrada} initial="oculto" animate="visivel" className="space-y-3">
        <CabecalhoSecao
          icone={Camera}
          titulo={<>Instagram{data?.conta?.username && <span className="text-lone-body font-normal text-muted-foreground">@{data.conta.username}</span>}</>}
          descricao={`Números do perfil nos últimos ${dias} dias, comparados com os ${dias} dias anteriores`}
        />
        {!loading && data?.geradoEm && (
          <p className="inline-flex items-center gap-1.5 text-lone-caption text-muted-foreground">
            <RefreshCw size={12} aria-hidden /> Atualizado em {fmtAtualizado(data.geradoEm)}
          </p>
        )}

        {!loading && frase && (
          <Cartao className="px-4 py-3.5">
            <p className="text-lone-eyebrow uppercase text-muted-foreground">Em uma frase</p>
            <p className="mt-1 text-sm font-medium text-foreground sm:text-base">{frase}</p>
          </Cartao>
        )}

        <GradeKpis kpis={principais} loading={loading} grande />
        <GradeKpis kpis={secundarios} loading={loading} />

        {!loading && (data?.parcial || data?.fonte === "parcial") && (
          <p className="text-lone-caption text-muted-foreground">
            Parte dos números deste perfil não veio da Meta nesta atualização. Nossa equipe já foi avisada para ajustar o acesso.
          </p>
        )}
        {!loading && isPublico && (
          <p className="text-lone-caption text-muted-foreground">
            Alcance, visualizações, toques nos botões e público ficam disponíveis quando o perfil é conectado ao nosso Business Manager.
          </p>
        )}
        {/* Sem post no período, os números da conta sozinhos dão a impressão de que houve trabalho.
            null = a Meta não deixou ler os posts: isso não é "nenhum post". */}
        {!loading && data && r?.postsNoPeriodo === 0 && (
          <p className="text-lone-caption text-muted-foreground">
            <strong className="font-medium text-foreground">Nenhum post publicado neste período.</strong> Os números acima são do perfil como um todo.
          </p>
        )}
      </motion.section>

      {!loading && (botoes.length > 0 || formatos.length > 0) && (
        <motion.div variants={entrada} initial="oculto" animate="visivel" custom={1} className="grid gap-4 lg:grid-cols-2">
          {botoes.length > 0 && (
            <Barras
              icone={MousePointerClick}
              titulo="Quem tocou nos botões do perfil"
              descricao="Cada toque é alguém querendo falar com a loja"
              itens={botoes.map((b) => ({ rotulo: ROTULO_BOTAO[b.tipo] ?? b.tipo, valor: b.valor }))}
              formato="numero"
            />
          )}
          {formatos.length > 0 && (
            <Barras
              icone={Eye}
              titulo="De onde veio o alcance"
              descricao={m?.pctNaoSeguidores != null
                ? `${m.pctNaoSeguidores}% de quem viu o perfil (anúncios incluídos) ainda não segue`
                : "Pessoas alcançadas por formato"}
              itens={formatos.map((f) => ({ rotulo: ROTULO_FORMATO[f.formato] ?? f.formato, valor: f.valor }))}
              formato="pct"
            />
          )}
        </motion.div>
      )}

      {!loading && temAudiencia && (
        <motion.div variants={entrada} initial="oculto" animate="visivel" custom={2}>
          <PublicoCard
            titulo="Público do perfil"
            descricao={data?.conta?.username ? `Quem segue @${data.conta.username}` : "Quem segue o perfil"}
            genero={a!.generoMascPct != null || a!.generoFemPct != null ? { mulheres: a!.generoFemPct, homens: a!.generoMascPct } : null}
            idades={a!.idades}
            cidades={a!.cidades}
          />
        </motion.div>
      )}

      {!loading && melhores.length > 0 && (
        <motion.section variants={entrada} initial="oculto" animate="visivel" custom={3} className="space-y-3">
          <CabecalhoSecao
            titulo="Melhores posts"
            descricao={melhores.length === 1 ? "O post do período" : "Os que mais tiveram curtidas, comentários, salvamentos e compartilhamentos"}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {melhores.map((p) => <CardPost key={p.id} post={p} />)}
          </div>
        </motion.section>
      )}
    </div>
  );
}

function GradeKpis({ kpis, loading, grande = false }: { kpis: Kpi[]; loading: boolean; grande?: boolean }) {
  if (!kpis.length) return null;
  const impar = kpis.length % 2 === 1;
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4", kpis.length >= 4 ? "lg:grid-cols-4" : kpis.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
      {kpis.map((k, i) => (
        <Cartao key={k.rotulo} className={cn("min-w-0 p-4", impar && i === 0 && "col-span-2 lg:col-span-1", k.destaque && "border-primary/30")}>
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-lone-caption text-muted-foreground">{k.rotulo}</p>
            {k.dica && <Dica rotulo={k.rotulo}>{k.dica}</Dica>}
          </div>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-20" />
          ) : (
            <>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <p className={clsx("font-semibold tabular-nums tracking-tight text-foreground", grande ? "text-lone-h1 sm:text-lone-hero" : "text-lone-h1")}>{k.valor}</p>
                {k.variacao != null && <Variacao pct={k.variacao} />}
              </div>
              {k.detalhe && <p className={clsx("mt-1 text-lone-caption", k.detalheBom ? "font-medium text-lone-success" : "text-muted-foreground")}>{k.detalhe}</p>}
            </>
          )}
        </Cartao>
      ))}
    </div>
  );
}

/** "↑ 12%" contra o período anterior. Estável dentro de 5%. */
function Variacao({ pct }: { pct: number }) {
  const estavel = Math.abs(pct) <= 5;
  const subiu = pct > 0;
  return (
    <span
      className={clsx("text-lone-caption font-medium tabular-nums", estavel ? "text-muted-foreground" : subiu ? "text-lone-success" : "text-lone-warning")}
      title="Comparado com o período anterior"
    >
      {estavel ? "≈ estável" : `${subiu ? "↑" : "↓"} ${Math.abs(pct)}%`}
      <span className="sr-only"> em relação ao período anterior</span>
    </span>
  );
}

function Barras({ icone, titulo, descricao, itens, formato }: {
  icone: typeof Eye; titulo: string; descricao: string; itens: { rotulo: string; valor: number }[]; formato: "numero" | "pct";
}) {
  const total = itens.reduce((s, i) => s + i.valor, 0) || 1;
  const maior = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <Cartao as="section" className="p-4 sm:p-5">
      <CabecalhoSecao icone={icone} titulo={titulo} descricao={descricao} nivel={3} />
      <ul className="mt-4 space-y-3">
        {itens.slice(0, 5).map((i) => (
          <li key={i.rotulo}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-foreground">{i.rotulo}</span>
              <span className="tabular-nums text-muted-foreground">
                {formato === "pct" ? `${Math.round((i.valor / total) * 100)}%` : formatarNumero(i.valor)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, Math.round((i.valor / maior) * 100))}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}

function CardPost({ post: p }: { post: Post }) {
  const video = p.tipo === "VIDEO" || p.tipo === "REELS";
  const salvosEComp = (p.salvos ?? 0) + (p.compartilhamentos ?? 0);
  return (
    <a href={p.permalink ?? "#"} target="_blank" rel="noopener noreferrer"
      className="group block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
      <div className="relative">
        {p.thumb
          ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.thumb} alt="" className="aspect-square w-full bg-muted object-cover" loading="lazy" />
          : <div className="aspect-square w-full bg-muted" />}
        {video && (
          <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-overlay text-overlay-foreground" aria-label="Reels">
            <Play size={12} aria-hidden />
          </span>
        )}
      </div>
      <div className="space-y-1 p-2.5 text-lone-caption tabular-nums text-muted-foreground">
        {(p.views != null || p.alcance != null) && (
          <p className="flex flex-wrap gap-x-3">
            {p.views != null && <span className="inline-flex items-center gap-1" title="Visualizações"><Eye size={12} aria-hidden /><span className="text-foreground">{nf(p.views)}</span></span>}
            {p.alcance != null && <span title="Pessoas alcançadas">{nf(p.alcance)} pessoas</span>}
          </p>
        )}
        <p className="flex flex-wrap gap-x-3">
          <span className="inline-flex items-center gap-1" title="Curtidas"><Heart size={12} aria-hidden /><span className="text-foreground">{nf(p.curtidas)}</span></span>
          <span className="inline-flex items-center gap-1" title="Comentários"><MessageCircle size={12} aria-hidden /><span className="text-foreground">{nf(p.comentarios)}</span></span>
          {salvosEComp > 0 && <span className="inline-flex items-center gap-1" title="Salvamentos e compartilhamentos"><Bookmark size={12} aria-hidden /><span className="text-foreground">{nf(salvosEComp)}</span></span>}
        </p>
      </div>
    </a>
  );
}

/** Esqueleto da aba inteira, no desenho do conteúdo final (frase, números, posts). */
function EsqueletoInstagram() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando os números do Instagram">
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-16 rounded-xl" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)}
        </div>
      </div>
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
      </div>
    </div>
  );
}
