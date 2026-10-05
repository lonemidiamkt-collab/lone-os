"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, Bell, AlertTriangle, FileText, Activity, Settings, Zap, ArrowUpRight, TrendingDown } from "lucide-react";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/lib/types";
import { useRole } from "@/lib/context/RoleContext";
import { FRASE_TETO_ARTE, agruparArte, deveFalar, ehAvisoDeArte, fraseParaFalar, vezDaArte } from "@/lib/avisos/fala";
import { falar } from "@/lib/avisos/tocar";
import { candidatarSe, reservarAviso, type Candidatura } from "@/lib/avisos/lider";
import { useVozAvisosStore } from "@/stores/useVozAvisosStore";
import { useClientsStore } from "@/stores/useClientsStore";
import { authedFetch } from "@/lib/supabase/authed-fetch";

// Controlador headless: observa a store e dispara no <Toaster> global (components/ui/sonner.tsx).
// Não renderiza nada próprio — um só sistema de toast no app.

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; accent: string }> = {
  sla:     { icon: AlertTriangle, color: "text-destructive",      accent: "border-l-destructive" },
  status:  { icon: Activity,      color: "text-primary",          accent: "border-l-primary" },
  content: { icon: FileText,      color: "text-primary",          accent: "border-l-primary" },
  checkin: { icon: Bell,          color: "text-primary",          accent: "border-l-primary" },
  system:  { icon: Settings,      color: "text-muted-foreground", accent: "border-l-border" },
  trafego: { icon: TrendingDown,  color: "text-lone-warning",     accent: "border-l-lone-warning" },
};

const CRITICAL_TYPES = new Set(["sla"]);

// Play premium ping for critical notifications only
function playPremiumPing() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => ctx.close();
  } catch {}
}

// Chime agradável (3 notas ascendentes) p/ quando entra ARTE — designer entregou ou social adicionou.
// Pedido do Roberto: som obrigatório tipo WhatsApp nesses eventos.
function playArtChime() {
  try {
    const ctx = new AudioContext();
    const notas = [
      { f: 659.25, t: 0.0 },   // E5
      { f: 830.61, t: 0.10 },  // G#5
      { f: 987.77, t: 0.20 },  // B5
    ];
    for (const n of notas) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(n.f, ctx.currentTime + n.t);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + n.t);
      gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + n.t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + n.t + 0.28);
      osc.start(ctx.currentTime + n.t);
      osc.stop(ctx.currentTime + n.t + 0.3);
    }
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {}
}

// Notificação do SISTEMA OPERACIONAL (Web Notifications API) — aparece e TOCA mesmo com a aba em
// segundo plano (o AudioContext é suspenso em aba inativa, por isso o som in-app não tocava fora do
// painel). Só dispara quando a aba NÃO está em foco; com a aba ativa, o toast + chime já resolvem.
function showOsNotification(id: string, title: string, body: string) {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (typeof document !== "undefined" && !document.hidden) return; // aba ativa → não precisa
    const n = new Notification(title, { body: body.slice(0, 160), tag: id, silent: false });
    n.onclick = () => { try { window.focus(); } catch { /* ignore */ } n.close(); };
  } catch { /* Notification pode falhar em contexto não seguro */ }
}

// Notificação é sobre ARTE entrando (entrega do designer / arte adicionada pelo social)? A regra
// mora em lib/avisos/fala.ts porque a voz usa a mesma.
const ehEventoDeArte = (n: AppNotification) => ehAvisoDeArte(n);

// Card → abre o card no Social; senão cliente → ficha do cliente.
function linkDe(n: AppNotification): string | null {
  if (n.cardId) return `/social?card=${encodeURIComponent(n.cardId)}`;
  if (n.clientId) return `/clients/${encodeURIComponent(n.clientId)}`;
  return null;
}

interface ToastPayload {
  key: string;
  title: string;
  body: string;
  type: string;
  count: number;
  isCritical: boolean;
  /** Só existe em toast de UMA notificação — agrupado não tem id real pra marcar lido. */
  notificationId?: string;
  href: string | null;
}

export default function NotificationToast() {
  const router = useRouter();
  const notifications = useNotificationsStore((s) => s.notifications);
  const markNotificationRead = useNotificationsStore((s) => s.markRead);
  const { role, currentUser } = useRole();
  // Voz (lib/avisos/fala.ts): preferência do servidor + eleição da aba que fala (uma só).
  const vozLigada = useVozAvisosStore((s) => s.ligada);
  const carregarVoz = useVozAvisosStore((s) => s.carregar);
  const clientes = useClientsStore((s) => s.clients);
  const candidaturaRef = useRef<Candidatura | null>(null);
  useEffect(() => { carregarVoz(); }, [carregarVoz]);
  useEffect(() => {
    candidaturaRef.current = candidatarSe();
    return () => { candidaturaRef.current?.encerrar(); candidaturaRef.current = null; };
  }, []);
  const seenRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);

  // Mark existing notifications as seen on first render
  useEffect(() => {
    if (initialLoadRef.current) {
      notifications.forEach((n) => seenRef.current.add(n.id));
      initialLoadRef.current = false;
    }
  }, [notifications]);

  // Pede permissão de notificação do navegador na 1ª interação do usuário (policy exige gesto).
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    const ask = () => { Notification.requestPermission().catch(() => {}); };
    window.addEventListener("pointerdown", ask, { once: true });
    return () => window.removeEventListener("pointerdown", ask);
  }, []);

  // Watch for new notifications — GROUP by type
  useEffect(() => {
    if (initialLoadRef.current) return;

    const newOnes = notifications.filter((n) => !n.read && !seenRef.current.has(n.id));
    if (newOnes.length === 0) return;

    newOnes.forEach((n) => seenRef.current.add(n.id));

    const grouped = new Map<string, AppNotification[]>();
    newOnes.forEach((n) => {
      if (!grouped.has(n.type)) grouped.set(n.type, []);
      grouped.get(n.type)!.push(n);
    });

    const payloads: ToastPayload[] = [];
    grouped.forEach((items, type) => {
      const isCritical = CRITICAL_TYPES.has(type) || items.some((i) => i.title.includes("[Urgente]") || i.title.includes("[Auto]"));
      if (items.length === 1) {
        payloads.push({
          key: items[0].id,
          title: items[0].title,
          body: items[0].body,
          type,
          count: 1,
          isCritical,
          notificationId: items[0].id,
          href: linkDe(items[0]),
        });
      } else {
        payloads.push({
          key: `group-${type}-${Date.now()}`,
          title: `${items.length} novas notificações`,
          body: items.map((i) => i.title).slice(0, 3).join(" · ") + (items.length > 3 ? ` +${items.length - 3}` : ""),
          type,
          count: items.length,
          isCritical,
          href: null,
        });
      }
    });

    // AVISO FALADO (v2, 05/10): o servidor decide o que é falável (tráfego) e a regra de arte olha o
    // dono do cliente — lib/avisos/fala.ts. Um por um, na ordem em que chegaram: agrupar faria a voz
    // dizer "3 novas notificações", que não serve pra nada. Só a aba eleita fala (lib/avisos/lider.ts).
    const falados = newOnes.filter((n) => {
      const c = n.clientId ? clientes.find((x) => x.id === n.clientId) : undefined;
      return deveFalar(n, {
        papel: role, ligada: vozLigada, eu: currentUser,
        dono: c ? { social: c.assignedSocial, designer: c.assignedDesigner } : null,
      });
    });
    const souAFalante = candidaturaRef.current?.souLider() ?? false;
    if (souAFalante) {
      const emOrdem = [...falados].reverse().filter((n) => reservarAviso(n.id)); // a lista vem do mais novo pro mais velho
      // Tráfego: um por um (o servidor já aplicou teto e horário).
      emOrdem.filter((n) => n.type === "trafego").forEach((n) => {
        falar(fraseParaFalar(n.title, n.body, currentUser), n.avisoId ? () => {
          // Prova de que a voz tocou — vira "ouvido" na medição. Falhar aqui não importa pra quem ouviu.
          authedFetch("/api/avisos/ouvido", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId: n.id }),
          }).catch(() => {});
        } : undefined);
      });
      // Arte: agrupada por cliente e com o mesmo teto diário (lib/avisos/fala.ts).
      const nomeDe = (id: string) => { const c = clientes.find((x) => x.id === id); return c ? (c.nomeFantasia || c.name) : null; };
      for (const g of agruparArte(emOrdem.filter((n) => n.type !== "trafego"), nomeDe)) {
        const vez = vezDaArte();
        const primeiro = currentUser.trim().split(/\s+/)[0];
        if (vez === "falar") falar(primeiro ? `${primeiro}, ${g.frase[0].toLowerCase()}${g.frase.slice(1)}` : g.frase);
        else if (vez === "avisar_teto") falar(FRASE_TETO_ARTE);
      }
    }

    // Som: chime de ARTE quando designer entrega / social adiciona arte; ping premium p/ crítico.
    if (falados.length) {
      // A voz já avisa — o ping por cima atrapalharia ouvir a frase.
    } else if (newOnes.some(ehEventoDeArte)) {
      playArtChime();
    } else if (payloads.some((p) => p.isCritical)) {
      playPremiumPing();
    }

    // Aba em segundo plano → dispara notificação do SO (aparece + toca fora do painel).
    if (typeof document !== "undefined" && document.hidden) {
      payloads.forEach((p) => showOsNotification(p.key, p.title, p.body));
    }

    for (const p of payloads) {
      const config = TYPE_CONFIG[p.type] ?? TYPE_CONFIG.system;
      const Icon = p.count > 1 ? Zap : config.icon;
      // Mesmo contrato de antes: só o X marca como lida; sumir sozinho após 4s deixa no sino.
      const fechar = (id: string | number) => {
        toast.dismiss(id);
        if (p.notificationId) markNotificationRead(p.notificationId);
      };

      toast.custom(
        (id) => (
          <div
            className={cn(
              "flex w-[356px] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border border-border border-l-2 bg-card p-4 shadow-sm",
              config.accent
            )}
          >
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                p.isCritical ? "bg-lone-danger-bg" : "bg-muted"
              )}
            >
              <Icon size={14} className={p.isCritical ? "text-destructive" : config.color} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold leading-tight text-foreground">
                {p.title}
                {p.count > 1 && (
                  <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {p.count}x
                  </span>
                )}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{p.body}</p>
              {p.href && (
                <button
                  type="button"
                  onClick={() => { router.push(p.href!); fechar(id); }}
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  Ver agora <ArrowUpRight size={11} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => fechar(id)}
              aria-label="Dispensar notificação"
              className="shrink-0 p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X size={12} />
            </button>
          </div>
        ),
        { id: p.key, duration: p.isCritical ? Infinity : 4000 }
      );
    }
  }, [notifications, markNotificationRead, router, role, currentUser, vozLigada, clientes]);

  return null;
}
