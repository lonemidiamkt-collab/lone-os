"use client";

// Relatório de Instagram orgânico no portal do cliente — seguidores (e quantos ganhou), alcance,
// taxa de engajamento e posts do PERÍODO (7/14/30 dias, escolhido no topo da aba) + público do
// perfil e os melhores posts. Lê do cache (rota /api/meta/instagram/[clientId]?token=&period=).

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Camera, Heart, MessageCircle, Play, RefreshCw } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import Skeleton from "@/components/ui/Skeleton";
// clsx (não cn) onde o tamanho de fonte "lone" encontra uma cor de texto: o twMerge acha que os dois são cor
// e apaga o tamanho.
import { clsx } from "clsx";
import { cn } from "@/lib/utils";
import { formatarNumero, formatarPct, taxaEngajamento } from "@/lib/portal/formatos";
import PublicoCard from "./PublicoCard";
import { Cartao, CabecalhoSecao, entrada } from "./ui";

interface Post { id: string; tipo: string; thumb: string | null; permalink: string | null; curtidas: number | null; comentarios: number | null; views: number | null; alcance: number | null; engajamento: number }
interface Resumo { alcance: number | null; alcanceJanelaDias?: number | null; seguidoresGanhos: number | null; curtidas: number; comentarios: number; engajamento: number; postsNoPeriodo: number }
interface Audiencia { generoMascPct: number | null; generoFemPct: number | null; idades: { faixa: string; pct: number }[]; cidades: { nome: string; pct: number }[] }
interface Snap { conta?: { username: string; seguidores: number | null; posts: number | null }; resumo?: Resumo; audiencia?: Audiencia; posts?: Post[]; fonte?: "owned" | "publico" }

export type IgPeriodo = "7d" | "14d" | "30d";
export const IG_PERIODOS: readonly { valor: IgPeriodo; rotulo: string; dias: number }[] = [
  { valor: "7d", rotulo: "7 dias", dias: 7 },
  { valor: "14d", rotulo: "14 dias", dias: 14 },
  { valor: "30d", rotulo: "30 dias", dias: 30 },
];

const MELHORES_POSTS = 5;
const nf = (n: number | null | undefined) => (n == null ? "—" : formatarNumero(n));
const nfSinal = (n: number) => `${n > 0 ? "+" : ""}${formatarNumero(n)}`;

// nao_conectado = perfil não vinculado (404); reconectar = vínculo expirou (409); falha = Meta/rede agora.
type Problema = "nao_conectado" | "reconectar" | "falha" | null;

interface Kpi { rotulo: string; valor: string; detalhe?: string; detalheBom?: boolean }

export default function PortalInstagram({ token, clientId, period }: { token: string; clientId: string; period: IgPeriodo }) {
  const [data, setData] = useState<Snap | null>(null);
  const [problema, setProblema] = useState<Problema>(null);
  const [loading, setLoading] = useState(true);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let alive = true; setLoading(true); setProblema(null);
    chamar<Snap>(`/api/meta/instagram/${clientId}?token=${encodeURIComponent(token)}&period=${period}`).then((r) => {
      if (!alive) return;
      if (r.ok && r.data?.conta) { setData(r.data); }
      else {
        // Nunca deixar os números do período anterior sob o rótulo do novo.
        setData(null);
        setProblema(r.status === 404 ? "nao_conectado" : r.status === 409 ? "reconectar" : "falha");
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

  // Sem Instagram vinculado, isto sumia INTEIRO e a aba "Crescimento nas redes" ficava em branco —
  // o cliente clicava e via uma tela vazia, sem entender se era erro, se estava carregando ou se
  // não havia resultado. Agora a aba explica o que falta e dá o caminho.
  if (problema === "nao_conectado") {
    return (
      <Cartao className="p-6 text-center">
        <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground"><Camera size={18} aria-hidden /></span>
        <p className="mt-3 text-sm font-medium text-foreground">Instagram ainda não conectado</p>
        <p className="mx-auto mt-1 max-w-prose text-lone-caption text-muted-foreground">
          Assim que a gente conectar o perfil, esta aba passa a mostrar seguidores, alcance,
          engajamento e os posts que mais performaram. Fala com a nossa equipe que a gente conecta rapidinho.
        </p>
      </Cartao>
    );
  }

  const r = data?.resumo;
  const a = data?.audiencia;
  const posts = data?.posts ?? [];
  // Fonte pública (business discovery): a Meta não entrega alcance nem seguidores-ganhos de conta que
  // não é nossa. Em vez de mostrar "—" (parece quebrado), escondemos esses e explicamos numa nota.
  const isPublico = data?.fonte === "publico";
  const taxa = taxaEngajamento(posts, data?.conta?.seguidores ?? null);
  const interacoes = r ? `${formatarNumero(r.curtidas)} ${r.curtidas === 1 ? "curtida" : "curtidas"} · ${formatarNumero(r.comentarios)} ${r.comentarios === 1 ? "comentário" : "comentários"}` : undefined;

  const kpis: Kpi[] = [
    {
      rotulo: "Seguidores",
      valor: nf(data?.conta?.seguidores ?? null),
      detalhe: !isPublico && r?.seguidoresGanhos != null ? `${nfSinal(r.seguidoresGanhos)} no período` : undefined,
      detalheBom: !isPublico && (r?.seguidoresGanhos ?? 0) > 0,
    },
    // A Meta só entrega alcance sem repetir pessoa em janela de 7 ou 28 dias. Escolher "14 dias" no
    // seletor devolvia o número de 28 — rotulado como 14. O rótulo diz a janela que veio.
    ...(isPublico ? [] : [{
      rotulo: "Alcance da conta",
      valor: nf(r?.alcance ?? null),
      detalhe: r?.alcanceJanelaDias ? `Pessoas únicas · ${r.alcanceJanelaDias} dias` : "Pessoas únicas",
    }]),
    // "Engajamento 22" repetia "Curtidas 22" (era a soma das duas). Agora é taxa, com as interações embaixo.
    {
      rotulo: "Taxa de engajamento",
      valor: taxa ? formatarPct(taxa.pct) : "—",
      detalhe: taxa ? interacoes : "Sem post no período",
    },
    { rotulo: "Posts no período", valor: nf(r?.postsNoPeriodo ?? null) },
  ];
  const impar = kpis.length % 2 === 1;
  const temAudiencia = !!a && (a.generoMascPct != null || a.idades.length > 0 || a.cidades.length > 0);
  const melhores = posts.slice(0, MELHORES_POSTS);

  return (
    <div className="space-y-5">
      <motion.section variants={entrada} initial="oculto" animate="visivel" className="space-y-3">
        <CabecalhoSecao
          icone={Camera}
          titulo={<>Instagram{data?.conta?.username && <span className="text-lone-body font-normal text-muted-foreground">@{data.conta.username}</span>}</>}
          descricao="Números do perfil no período escolhido"
        />

        <div className={cn("grid grid-cols-2 gap-3 sm:gap-4", kpis.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4")}>
          {kpis.map((k, i) => (
            <Cartao key={k.rotulo} className={cn("min-w-0 p-4", impar && i === 0 && "col-span-2 lg:col-span-1")}>
              <p className="truncate text-lone-caption text-muted-foreground">{k.rotulo}</p>
              {loading ? (
                <Skeleton className="mt-2 h-7 w-20" />
              ) : (
                <>
                  <p className="mt-2 text-lone-h1 font-semibold tabular-nums tracking-tight text-foreground sm:text-lone-hero">{k.valor}</p>
                  {k.detalhe && <p className={clsx("mt-1 text-lone-caption", k.detalheBom ? "font-medium text-lone-success" : "text-muted-foreground")}>{k.detalhe}</p>}
                </>
              )}
            </Cartao>
          ))}
        </div>

        {!loading && taxa && (
          <p className="text-lone-caption text-muted-foreground">
            {taxa.base === "seguidores"
              ? "Taxa de engajamento: média de curtidas e comentários por post, dividida pelos seguidores."
              : "Taxa de engajamento: curtidas e comentários dos posts, divididos pelas pessoas que eles alcançaram."}
          </p>
        )}
        {!loading && isPublico && (
          <p className="text-lone-caption text-muted-foreground">
            Alcance, seguidores ganhos e público (gênero, idade e cidades) ficam disponíveis quando o perfil é conectado ao nosso Business Manager.
          </p>
        )}
        {/* O alcance do perfil conta também quem chegou por anúncio — sem dizer isso, o cliente soma
            com o alcance do relatório de tráfego e conta a mesma pessoa duas vezes. */}
        {!loading && !isPublico && r?.alcance != null && (
          <p className="text-lone-caption text-muted-foreground">
            O alcance do perfil inclui quem chegou pelos anúncios — não some com o alcance do tráfego pago.
          </p>
        )}
        {/* Sem post no período, os números da conta sozinhos dão a impressão de que houve trabalho. */}
        {!loading && data && (r?.postsNoPeriodo ?? 0) === 0 && (
          <p className="text-lone-caption text-muted-foreground">
            <strong className="font-medium text-foreground">Nenhum post publicado neste período.</strong> Os números acima são do perfil como um todo.
          </p>
        )}
      </motion.section>

      {!loading && temAudiencia && (
        <motion.div variants={entrada} initial="oculto" animate="visivel" custom={1}>
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
        <motion.section variants={entrada} initial="oculto" animate="visivel" custom={2} className="space-y-3">
          <CabecalhoSecao
            titulo="Melhores posts"
            descricao={melhores.length === 1 ? "O post do período, com curtidas e comentários" : "Os que mais engajaram no período"}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {melhores.map((p) => {
              const video = p.tipo === "VIDEO" || p.tipo === "REELS";
              return (
                <a key={p.id} href={p.permalink ?? "#"} target="_blank" rel="noopener noreferrer"
                  className="group block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                  <div className="relative">
                    {p.thumb
                      ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.thumb} alt="" className="aspect-square w-full bg-muted object-cover" loading="lazy" />
                      : <div className="aspect-square w-full bg-muted" />}
                    {video && (
                      <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-overlay text-overlay-foreground" aria-label="Vídeo">
                        <Play size={12} aria-hidden />
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2.5 text-lone-caption tabular-nums text-muted-foreground">
                    <span className="inline-flex items-center gap-1" title="Curtidas"><Heart size={12} aria-hidden="true" /><span className="text-foreground">{nf(p.curtidas)}</span></span>
                    <span className="inline-flex items-center gap-1" title="Comentários"><MessageCircle size={12} aria-hidden="true" /><span className="text-foreground">{nf(p.comentarios)}</span></span>
                    {p.views != null && <span className="inline-flex items-center gap-1" title="Visualizações"><Play size={12} aria-hidden="true" /><span className="text-foreground">{nf(p.views)}</span></span>}
                  </div>
                </a>
              );
            })}
          </div>
        </motion.section>
      )}
    </div>
  );
}
