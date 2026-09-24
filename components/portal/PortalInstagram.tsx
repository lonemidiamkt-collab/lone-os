"use client";

// Relatório de Instagram orgânico no portal do cliente — seguidores + seguidores GANHOS + alcance +
// visualizações + engajamento (curtidas/comentários) do PERÍODO (7/14/30 dias) + posts mais engajados.
// Lê do cache (rota /api/meta/instagram/[clientId]?token=&period=).

import { useState, useEffect } from "react";
import { chamar } from "@/lib/api/chamar";

interface Post { id: string; tipo: string; thumb: string | null; permalink: string | null; curtidas: number | null; comentarios: number | null; views: number | null; alcance: number | null; engajamento: number }
interface Resumo { alcance: number | null; alcanceJanelaDias?: number | null; seguidoresGanhos: number | null; curtidas: number; comentarios: number; engajamento: number; postsNoPeriodo: number }
interface Audiencia { generoMascPct: number | null; generoFemPct: number | null; idades: { faixa: string; pct: number }[]; cidades: { nome: string; pct: number }[] }
interface Snap { conta?: { username: string; seguidores: number | null; posts: number | null }; resumo?: Resumo; audiencia?: Audiencia; posts?: Post[]; fonte?: "owned" | "publico" }

// Rosa da marca Instagram (exceção de marca, igual nos dois temas).
const IG_PINK = "#c13584";

function Bar({ label, pct, color, max = 100 }: { label: string; pct: number; color: string; max?: number }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-[11px] shrink-0 text-muted-foreground" style={{ width: 58 }}>{label}</span>
      <div className="flex-1 rounded-full overflow-hidden bg-border" style={{ height: 6 }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(Math.round((pct / max) * 100), 3)}%`, background: color }} />
      </div>
      <span className="text-[11px] font-bold text-right" style={{ width: 42 }}>{pct.toFixed(1)}%</span>
    </div>
  );
}

type Period = "7d" | "14d" | "30d";
const nf = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const nfSigned = (n: number | null | undefined) => (n == null ? "—" : (n > 0 ? "+" : "") + n.toLocaleString("pt-BR"));
const PERIODOS: [Period, string][] = [["7d", "7 dias"], ["14d", "14 dias"], ["30d", "30 dias"]];

// nao_conectado = perfil não vinculado (404); reconectar = vínculo expirou (409); falha = Meta/rede agora.
type Problema = "nao_conectado" | "reconectar" | "falha" | null;

export default function PortalInstagram({ token, clientId }: { token: string; clientId: string }) {
  const [period, setPeriod] = useState<Period>("7d");
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
      <div className="mb-6 lg:mb-8 rounded-xl p-5 text-center bg-card border border-border" role="status">
        <p className="text-sm font-semibold mb-1 text-secondary-foreground">
          {problema === "reconectar" ? "A conexão com seu Instagram precisa ser renovada" : "Não consegui buscar os números do Instagram agora"}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {problema === "reconectar"
            ? "Nossa equipe cuida disso — se quiser agilizar, é só chamar a gente no WhatsApp."
            : "Seus dados continuam guardados. Tente de novo em alguns minutos."}
        </p>
        {problema === "falha" && (
          <button onClick={() => setTentativa((t) => t + 1)}
            className="mt-3 rounded-lg px-4 text-sm font-semibold min-h-[44px] bg-card border border-border text-foreground">
            Tentar de novo
          </button>
        )}
      </div>
    );
  }

  // Sem Instagram vinculado, isto sumia INTEIRO e a aba "Crescimento nas redes" ficava em branco —
  // o cliente clicava e via uma tela vazia, sem entender se era erro, se estava carregando ou se
  // não havia resultado. Agora a aba explica o que falta e dá o caminho.
  if (problema === "nao_conectado") {
    return (
      <div className="mb-6 lg:mb-8 rounded-xl p-6 text-center bg-card border border-border">
        <p className="text-sm font-semibold mb-1 text-secondary-foreground">
          Instagram ainda não conectado
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Assim que a gente conectar o perfil, esta aba passa a mostrar seguidores, alcance,
          engajamento e os posts que mais performaram.
          <br />
          Fala com a nossa equipe que a gente conecta rapidinho.
        </p>
      </div>
    );
  }

  const r = data?.resumo;
  const a = data?.audiencia;
  // Fonte pública (business discovery): a Meta não entrega alcance nem seguidores-ganhos de conta que
  // não é nossa. Em vez de mostrar "—" (parece quebrado), escondemos esses e explicamos numa nota.
  const isPublico = data?.fonte === "publico";
  const cards = [
    { l: "Seguidores", v: nf(data?.conta?.seguidores ?? null) },
    ...(isPublico ? [] : [{ l: "Seguidores ganhos", v: nfSigned(r?.seguidoresGanhos ?? null) }]),
    // A Meta só entrega alcance sem repetir pessoa em janela de 7 ou 28 dias. Escolher "14 dias" no
    // seletor devolvia o número de 28 — rotulado como 14. O rótulo agora diz a janela que veio.
    ...(isPublico ? [] : [{ l: r?.alcanceJanelaDias ? `Alcance da conta · ${r.alcanceJanelaDias} dias` : "Alcance da conta", v: nf(r?.alcance ?? null) }]),
    { l: "Engajamento", v: nf(r?.engajamento ?? null) },
    { l: "Curtidas", v: nf(r?.curtidas ?? null) },
    { l: "Comentários", v: nf(r?.comentarios ?? null) },
    { l: "Posts no período", v: nf(r?.postsNoPeriodo ?? null) },
  ];
  const temAudiencia = !!a && (a.generoMascPct != null || a.idades.length > 0 || a.cidades.length > 0);

  return (
    <div className="mb-6 lg:mb-8">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-lg">📸</span>
          <h2 className="text-base font-bold">Instagram</h2>
          {data?.conta?.username && <span className="text-xs text-lone-text-tertiary">@{data.conta.username}</span>}
        </div>
        <div className="flex gap-0.5 rounded-full p-0.5 bg-card border border-border">
          {PERIODOS.map(([p, l]) => (
            <button key={p} onClick={() => setPeriod(p)} disabled={loading} className={`rounded-full text-xs font-semibold px-4 py-2 min-h-[44px] min-w-[44px] disabled:opacity-60 ${period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
      </div>

      {/* Resumo do período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {cards.map((k) => (
          <div key={k.l} className="rounded-xl p-4 bg-card border border-border">
            <p className="text-xs mb-1 text-lone-text-tertiary">{k.l}</p>
            <p className="text-2xl font-bold">{loading ? "…" : k.v}</p>
          </div>
        ))}
      </div>

      {isPublico && (
        <p className="text-xs mb-4 text-lone-text-tertiary">
          📊 Alcance, seguidores ganhos e público (gênero/idade/cidades) ficam disponíveis quando o perfil é conectado ao nosso Business Manager.
        </p>
      )}

      {/* O alcance do perfil conta também quem chegou por anúncio — sem dizer isso, o cliente soma
          com o alcance do relatório de tráfego e conta a mesma pessoa duas vezes. */}
      {!isPublico && r?.alcance != null && (
        <p className="text-xs mb-4 text-lone-text-tertiary">
          O alcance do perfil inclui quem chegou pelos anúncios — não some com o alcance do tráfego pago.
        </p>
      )}

      {/* Sem post no período, os números da conta sozinhos dão a impressão de que houve trabalho. */}
      {!loading && data && (r?.postsNoPeriodo ?? 0) === 0 && (
        <p className="text-xs mb-4 text-muted-foreground">
          <strong className="text-secondary-foreground">Nenhum post publicado neste período.</strong> Os números acima são do perfil como um todo.
        </p>
      )}

      {/* Público do perfil (gênero / idade / cidades) */}
      {temAudiencia && (
        <div className="rounded-xl p-4 mb-3 bg-card border border-border">
          <p className="text-xs font-semibold mb-3 text-muted-foreground">Público do perfil</p>
          <div className="grid gap-5 sm:grid-cols-3">
            {a!.generoMascPct != null && (
              <div>
                <p className="text-[10px] uppercase tracking-wide mb-2 text-lone-text-tertiary">Gênero</p>
                <Bar label="Homens" pct={a!.generoMascPct} color="var(--primary)" />
                {a!.generoFemPct != null && <Bar label="Mulheres" pct={a!.generoFemPct} color={IG_PINK} />}
              </div>
            )}
            {a!.idades.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide mb-2 text-lone-text-tertiary">Faixa etária</p>
                {a!.idades.slice(0, 5).map((x) => (
                  <Bar key={x.faixa} label={x.faixa} pct={x.pct} color="var(--primary)" max={Math.max(...a!.idades.map((i) => i.pct), 1)} />
                ))}
              </div>
            )}
            {a!.cidades.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide mb-2 text-lone-text-tertiary">Principais cidades</p>
                {a!.cidades.map((c, i) => (
                  <div key={c.nome} className="flex items-center gap-2 mb-2">
                    <span className="flex items-center justify-center text-[9px] font-bold rounded-full shrink-0" style={{ width: 16, height: 16, background: `color-mix(in srgb, ${IG_PINK} 13%, transparent)`, color: IG_PINK }}>{i + 1}</span>
                    <span className="flex-1 text-xs truncate">{c.nome}</span>
                    <span className="text-[11px] font-semibold text-muted-foreground">{c.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Posts mais engajados do período */}
      {(data?.posts?.length ?? 0) > 0 && (
        <>
          <p className="text-xs font-semibold mb-2 text-muted-foreground">5 melhores posts</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {(data!.posts ?? []).slice(0, 5).map((p) => (
              <a key={p.id} href={p.permalink ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded-xl overflow-hidden block bg-card border border-border">
                {p.thumb
                  ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.thumb} alt="" className="w-full aspect-square object-cover" loading="lazy" />
                  : <div className="w-full aspect-square bg-border" />}
                <div className="p-2 flex items-center gap-3 text-xs flex-wrap">
                  <span>❤️ {nf(p.curtidas)}</span>
                  <span>💬 {nf(p.comentarios)}</span>
                  {p.views != null && <span>▶️ {nf(p.views)}</span>}
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
