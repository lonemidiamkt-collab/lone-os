"use client";

// A aba ROTA do comercial (out/2026): as lojas da Rota de Prospecção, quem já foi visitado e onde cada
// uma está no funil — e o mapa do app da rota embutido, para planejar a próxima saída sem trocar de tela.
// Os dados vêm de GET /api/crm/rota (lista de lojas da página da rota + rota_visitas + leads).

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Map as MapIcon, MapPin, MessageCircle, RefreshCw } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { useRole } from "@/lib/context/RoleContext";
import { podeVerComercial } from "@/lib/crm/acesso";
import { ROTULO_ETAPA, normalizarEtapa } from "@/lib/crm/etapas";
import { formatarWhatsapp } from "@/lib/team/whatsapp";
import type { LojaNaRota } from "@/lib/crm/rota";
import { Anel } from "@/components/crm/graficos";

interface Resposta {
  cidades: { cidade: string; lojas: LojaNaRota[] }[];
  totais: { lojas: number; visitadas: number; noFunil: number; negociando: number };
  pagina: string;
}

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

export default function RotaComercialPage() {
  const { role } = useRole();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [mapa, setMapa] = useState(false);
  const podeVer = podeVerComercial(role);

  const carregar = () => {
    setCarregando(true);
    chamar<Resposta>("/api/crm/rota").then((r) => {
      if (r.ok && r.data) { setDados(r.data); setErro(null); } else setErro(r.erro ?? "Não consegui carregar a rota.");
      setCarregando(false);
    });
  };
  useEffect(() => { if (podeVer) carregar(); else setCarregando(false); }, [podeVer]);

  if (!podeVer) return <div className="p-8 text-sm text-destructive">Esta área é do time comercial.</div>;

  const t = dados?.totais;
  const pagina = dados?.pagina ?? "https://rota-lagos.vercel.app/";
  return (
    <div className="space-y-5 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lone-h1 tracking-tight text-foreground">Rota de prospecção</h1>
          <p className="text-lone-caption text-muted-foreground">Lojas da rota, quem já foi visitado e onde cada uma está no funil. Visita marcada no app entra sozinha no funil em até 30 min.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={carregar} disabled={carregando} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-foreground hover:bg-accent disabled:opacity-50">
            <RefreshCw size={15} className={carregando ? "animate-spin" : ""} /> Atualizar
          </button>
          <button onClick={() => setMapa((m) => !m)} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-foreground hover:bg-accent">
            <MapIcon size={15} /> {mapa ? "Esconder o mapa" : "Ver o mapa"}
          </button>
          <a href={pagina} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
            <ExternalLink size={15} /> Abrir o app da rota
          </a>
        </div>
      </header>

      {mapa && (
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <iframe src={pagina} title="Mapa da Rota de Prospecção" className="h-[70vh] w-full" allow="geolocation" loading="lazy" />
        </section>
      )}

      {erro && <section className="rounded-xl border border-lone-danger-border bg-lone-danger-bg p-4 text-lone-body text-lone-danger">{erro}</section>}
      {carregando && !dados && <p className="text-lone-body text-muted-foreground">Carregando a rota…</p>}

      {t && (
        <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-card shadow-sm dark:shadow-none lg:grid-cols-4 lg:divide-x lg:divide-border">
          {([
            ["Lojas na rota", t.lojas, "na lista do app"],
            ["Visitadas", t.visitadas, t.lojas ? `${Math.round((t.visitadas / t.lojas) * 100)}% da rota` : "—"],
            ["No funil", t.noFunil, "viraram lead"],
            ["Em proposta ou negociação", t.negociando, "as mais quentes"],
          ] as const).map(([rot, val, sub]) => (
            <div key={rot} className="px-4 py-3">
              <div className="text-lone-caption text-muted-foreground">{rot}</div>
              <div className="mt-0.5 text-lone-h2 text-foreground">{val}</div>
              <div className="text-lone-caption text-muted-foreground">{sub}</div>
            </div>
          ))}
        </div>
      )}

      {dados?.cidades.map((c) => (
        <section key={c.cidade} className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lone-h2 text-foreground"><MapPin size={15} className="text-muted-foreground" /> {c.cidade}</h2>
            <span className="flex items-center gap-2 text-lone-caption text-muted-foreground">
              <Anel tamanho="xs" pct={(c.lojas.filter((l) => l.visitada).length / c.lojas.length) * 100} tom={c.lojas.every((l) => l.visitada) ? "success" : "primary"}
                rotuloAcessivel={`${c.lojas.filter((l) => l.visitada).length} de ${c.lojas.length} visitadas`} />
              {c.lojas.filter((l) => l.visitada).length} de {c.lojas.length} visitadas
              {c.lojas.some((l) => l.lead && ["proposta", "negociacao"].includes(l.lead.estagio)) && <span className="rounded-md bg-lone-success-bg px-1.5 py-0.5 font-medium text-lone-success">{c.lojas.filter((l) => l.lead && ["proposta", "negociacao"].includes(l.lead.estagio)).length} em negociação</span>}
            </span>
          </div>
          <div className="divide-y divide-border">
            {c.lojas.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${l.visitada ? "bg-lone-success" : "bg-muted-foreground"}`} aria-hidden="true" />
                    <span className="truncate text-lone-body font-medium text-foreground">{l.empresa}</span>
                    {l.segmento && <span className="hidden text-lone-caption text-muted-foreground sm:inline">· {l.segmento}</span>}
                  </div>
                  <div className="mt-0.5 pl-4 text-lone-caption text-muted-foreground">
                    {[l.contato, l.visitada ? `visitada${l.por ? ` por ${l.por}` : ""}${l.quando ? ` em ${dataCurta(l.quando)}` : ""}` : "ainda não visitada", l.obs].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {l.telefone && (
                    <a href={`https://web.whatsapp.com/send?phone=${l.telefone}`} target="_blank" rel="noopener noreferrer" title={formatarWhatsapp(l.telefone)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-lone-caption text-foreground hover:bg-accent">
                      <MessageCircle size={12} /> WhatsApp
                    </a>
                  )}
                  {l.lead ? (
                    <Link href={`/crm?lead=${l.lead.id}`} className="inline-flex items-center rounded-md bg-primary/10 px-2.5 py-1 text-lone-caption font-medium text-primary hover:bg-primary/15">
                      {ROTULO_ETAPA[normalizarEtapa(l.lead.estagio)]}
                    </Link>
                  ) : (
                    <span className="rounded-md bg-muted px-2.5 py-1 text-lone-caption text-muted-foreground">{l.visitada ? "Entra no funil em breve" : "Fora do funil"}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
