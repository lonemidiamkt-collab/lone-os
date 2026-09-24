"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  AlertOctagon, AlertTriangle, Bell, Check, CheckCheck, ChevronDown, FileImage, MessageCircle, Settings, TrendingDown, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ABRIR_NOTIFICACOES } from "@/components/TopActions";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/lib/types";

/**
 * Para onde o clique leva — null quando não há para onde ir.
 *
 * O null importa: 90 avisos no banco não têm card nem cliente ("Link de onboarding gerado",
 * "Cliente aprovado"). Eles renderizavam como botão, com hover, e clicar não fazia nada. Agora o
 * item aparece como texto, sem convite ao clique.
 */
export function destinoDaNotificacao(n: { title?: string; cardId?: string; clientId?: string }): string | null {
  if (/arquivad/i.test(n.title ?? "")) return "/social?arquivadas=1";
  if (n.cardId) return `/social?card=${n.cardId}`;
  if (n.clientId) return `/clients/${n.clientId}`;
  return null;
}

type Gravidade = "critico" | "alerta" | "info";
type Area = "trafego" | "conteudo" | "clientes" | "sistema";

const AREAS: { key: Area; label: string }[] = [
  { key: "trafego", label: "Tráfego" },
  { key: "conteudo", label: "Conteúdo" },
  { key: "clientes", label: "Clientes" },
  { key: "sistema", label: "Sistema" },
];

const ICONE: Record<Area, LucideIcon> = { trafego: TrendingDown, conteudo: FileImage, clientes: MessageCircle, sistema: Settings };

const TOM: Record<Gravidade, string> = {
  critico: "bg-lone-danger-bg text-lone-danger",
  alerta: "bg-lone-warning-bg text-lone-warning",
  info: "bg-primary/10 text-primary",
};

interface Lida {
  n: AppNotification;
  titulo: string;
  gravidade: Gravidade;
  area: Area;
}

// Os títulos chegam como "🚨 CRÍTICO: Nova União" / "⚠️ Alerta: Óticas Raki": a gravidade vira cor
// do ícone e o título fica só com o que importa (o cliente ou o assunto).
function ler(n: AppNotification): Lida {
  let t = (n.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  let gravidade: Gravidade = n.type === "sla" ? "critico" : "info";
  if (/^cr[ií]tico\s*:/i.test(t)) { gravidade = "critico"; t = t.replace(/^cr[ií]tico\s*:\s*/i, ""); }
  else if (/^alerta\s*:/i.test(t)) { gravidade = "alerta"; t = t.replace(/^alerta\s*:\s*/i, ""); }
  else if (/^⚠/.test(n.title ?? "")) gravidade = "alerta";
  const texto = `${n.title} ${n.body}`.toLowerCase();
  const area: Area =
    /cpl|ctr|impress|verba|saldo|campanha|an[uú]ncio|meta ads|pacing|conta de an/.test(texto) ? "trafego"
    : n.type === "content" || /arte|card|post|design|legenda|conte[uú]do/.test(texto) ? "conteudo"
    : n.type === "checkin" || n.clientId ? "clientes"
    : "sistema";
  return { n, titulo: t || n.title, gravidade, area };
}

function diaSP(d: Date) { return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); }

function blocoDoTempo(iso: string): string {
  const d = new Date(iso);
  const min = (Date.now() - d.getTime()) / 60000;
  if (min < 60) return "Agora";
  const hoje = diaSP(new Date());
  const ontem = diaSP(new Date(Date.now() - 86400000));
  const dia = diaSP(d);
  if (dia === hoje) return "Hoje";
  if (dia === ontem) return "Ontem";
  if (min < 7 * 1440) return "Esta semana";
  return "Anteriores";
}

function quando(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

// Vários avisos da mesma área e gravidade em até 15 min viram UMA pilha (ex.: o scan de tráfego que
// dispara 6 alertas de uma vez). Lê-se o resumo; abre-se se quiser os detalhes.
type Bloco = { chave: string; itens: Lida[] };
function empilhar(lista: Lida[]): Bloco[] {
  const out: Bloco[] = [];
  for (const l of lista) {
    const ult = out[out.length - 1];
    const base = ult?.itens[0];
    if (base && base.area === l.area && base.gravidade === l.gravidade
      && Math.abs(new Date(base.n.createdAt).getTime() - new Date(l.n.createdAt).getTime()) < 15 * 60000) {
      ult.itens.push(l);
    } else {
      out.push({ chave: l.n.id, itens: [l] });
    }
  }
  return out;
}

const NOME_AREA: Record<Area, [string, string]> = {
  trafego: ["alerta de tráfego", "alertas de tráfego"],
  conteudo: ["aviso de conteúdo", "avisos de conteúdo"],
  clientes: ["aviso de clientes", "avisos de clientes"],
  sistema: ["aviso do sistema", "avisos do sistema"],
};

export default function NotificationCenter(_props: { semBotao?: boolean }) {
  const notifications = useNotificationsStore((s) => s.notifications);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState<"todas" | "nao_lidas" | Area>("todas");
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const router = useRouter();

  // O sino mora na barra de ações do topo e abre este painel por evento.
  useEffect(() => {
    const alternar = () => setOpen((o) => !o);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener(ABRIR_NOTIFICACOES, alternar);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener(ABRIR_NOTIFICACOES, alternar); window.removeEventListener("keydown", esc); };
  }, []);

  const lidas = useMemo(() => notifications.map(ler), [notifications]);
  const naoLidas = lidas.filter((l) => !l.n.read).length;
  const porArea = useMemo(() => {
    const m: Record<Area, number> = { trafego: 0, conteudo: 0, clientes: 0, sistema: 0 };
    lidas.forEach((l) => { if (!l.n.read) m[l.area] += 1; });
    return m;
  }, [lidas]);

  const visiveis = lidas.filter((l) =>
    filtro === "todas" ? true : filtro === "nao_lidas" ? !l.n.read : l.area === filtro);

  const grupos = useMemo(() => {
    const ordem = ["Agora", "Hoje", "Ontem", "Esta semana", "Anteriores"];
    const m = new Map<string, Lida[]>();
    visiveis.forEach((l) => { const b = blocoDoTempo(l.n.createdAt); m.set(b, [...(m.get(b) ?? []), l]); });
    return ordem.filter((o) => m.has(o)).map((o) => ({ titulo: o, blocos: empilhar(m.get(o)!) }));
  }, [visiveis]);

  const abrir = (l: Lida) => {
    if (!l.n.read) markRead(l.n.id);
    const destino = destinoDaNotificacao(l.n);
    if (destino) { setOpen(false); router.push(destino); }
  };

  const chips: { key: typeof filtro; label: string; n?: number }[] = [
    { key: "todas", label: "Todas" },
    { key: "nao_lidas", label: "Não lidas", n: naoLidas },
    ...AREAS.filter((a) => porArea[a.key] > 0).map((a) => ({ key: a.key, label: a.label, n: porArea[a.key] })),
  ];

  let ordemAnim = 0;

  const renderItem = (l: Lida, compacto = false) => {
    const Icone = l.gravidade === "critico" ? AlertOctagon : l.gravidade === "alerta" ? AlertTriangle : ICONE[l.area];
    const clicavel = !!destinoDaNotificacao(l.n);
    const i = ordemAnim++;
    return (
      <motion.div
        key={l.n.id}
        layout="position"
        initial={{ opacity: 0, x: 12, filter: "blur(6px)" }}
        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.28, delay: Math.min(i, 8) * 0.035, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "group relative flex gap-3 rounded-xl px-3 transition-colors",
          compacto ? "py-2" : "py-2.5",
          clicavel ? "cursor-pointer hover:bg-accent" : "",
        )}
        onClick={clicavel ? () => abrir(l) : undefined}
      >
        {!l.n.read && <span className="absolute left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary" aria-label="não lida" />}
        {!compacto && (
          <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", TOM[l.gravidade])}>
            <Icone size={15} strokeWidth={2} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className={cn("truncate text-[13px]", l.n.read ? "font-medium text-muted-foreground" : "font-semibold text-foreground")}>{l.titulo}</p>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{quando(l.n.createdAt)}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{l.n.body}</p>
        </div>
        {!l.n.read && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); markRead(l.n.id); }}
            className="absolute right-2 top-2 hidden h-6 w-6 items-center justify-center rounded-md bg-card text-muted-foreground shadow-sm ring-1 ring-border hover:text-foreground group-hover:flex"
            aria-label="Marcar como lida" title="Marcar como lida"
          >
            <Check size={13} />
          </button>
        )}
      </motion.div>
    );
  };

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-[150]" onClick={() => setOpen(false)} aria-hidden />
            <motion.section
              role="dialog"
              aria-label="Notificações"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              style={{ transformOrigin: "top right" }}
              className="fixed right-4 top-[68px] z-[151] flex max-h-[min(680px,calc(100vh-88px))] w-[440px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl"
            >
              <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-semibold tracking-tight">Notificações</h2>
                  {naoLidas > 0 && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary-foreground">{naoLidas}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {naoLidas > 0 && (
                    <button type="button" onClick={() => markAllRead()}
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
                      <CheckCheck size={14} /> Marcar todas como lidas
                    </button>
                  )}
                  <button type="button" onClick={() => setOpen(false)} aria-label="Fechar"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
                    <X size={15} />
                  </button>
                </div>
              </header>

              <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 no-scrollbar">
                {chips.map((c) => (
                  <button key={c.key} type="button" onClick={() => setFiltro(c.key)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      filtro === c.key ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}>
                    {c.label}
                    {!!c.n && <span className="tabular-nums opacity-80">{c.n}</span>}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto border-t border-border px-2 pb-3">
                {grupos.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-lone-success-bg text-lone-success"><Bell size={18} /></span>
                    <p className="text-sm font-medium text-foreground">Tudo em dia</p>
                    <p className="text-xs text-muted-foreground">Nenhuma notificação {filtro === "todas" ? "" : "neste filtro "}por aqui.</p>
                  </div>
                ) : grupos.map((g) => (
                  <div key={g.titulo} className="pt-3">
                    <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{g.titulo}</p>
                    {g.blocos.map((b) => {
                      if (b.itens.length === 1) return renderItem(b.itens[0]);
                      const base = b.itens[0];
                      const aberta = abertas.has(b.chave);
                      const nomes = b.itens.map((i) => i.titulo);
                      const naoLidasPilha = b.itens.filter((i) => !i.n.read).length;
                      const Icone = base.gravidade === "critico" ? AlertOctagon : base.gravidade === "alerta" ? AlertTriangle : ICONE[base.area];
                      return (
                        <div key={b.chave} className="relative">
                          <button type="button"
                            onClick={() => setAbertas((s) => { const n = new Set(s); if (n.has(b.chave)) n.delete(b.chave); else n.add(b.chave); return n; })}
                            className="relative flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-accent"
                            aria-expanded={aberta}
                          >
                            {naoLidasPilha > 0 && <span className="absolute left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary" />}
                            <span className={cn("relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", TOM[base.gravidade])}>
                              <Icone size={15} strokeWidth={2} />
                              <span className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-popover px-1 text-[10px] font-semibold tabular-nums ring-1 ring-border">{b.itens.length}</span>
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-3">
                                <p className="text-[13px] font-semibold text-foreground">{b.itens.length} {NOME_AREA[base.area][1]}</p>
                                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{quando(base.n.createdAt)}</span>
                              </div>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {nomes.slice(0, 3).join(" · ")}{nomes.length > 3 ? ` +${nomes.length - 3}` : ""}
                              </p>
                            </div>
                            <ChevronDown size={15} className={cn("mt-2 shrink-0 text-muted-foreground transition-transform", aberta && "rotate-180")} />
                          </button>
                          <AnimatePresence initial={false}>
                            {aberta && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                className="ml-[22px] overflow-hidden border-l border-border pl-3">
                                {b.itens.map((l) => renderItem(l, true))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
