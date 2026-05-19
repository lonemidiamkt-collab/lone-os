"use client";

/**
 * /dev/tokens — Preview do Design System v2
 *
 * Proteção:
 *   - Development: qualquer pessoa acessa
 *   - Production:  só admin/manager (verificado via sessionStorage)
 *
 * Acesse em http://localhost:3000/dev/tokens
 */

import { useEffect, useState } from "react";
import { USER_PROFILES } from "@/lib/context/RoleContext";
import {
  KPICard,
  SectionDivider,
  TeamMemberRow,
  AlertBanner,
  PillBadge,
} from "@/components/lone-ui";

const COLORS = [
  { label: "lone-bg-primary",  hex: "#13141A", group: "Fundos",    css: "var(--lone-bg-primary)" },
  { label: "lone-bg-card",     hex: "#1A1B23", group: "Fundos",    css: "var(--lone-bg-card)" },
  { label: "lone-bg-elevated", hex: "#22242E", group: "Fundos",    css: "var(--lone-bg-elevated)" },
  { label: "lone-border",      hex: "#2A2C36", group: "Bordas",    css: "var(--lone-border-default)" },
  { label: "lone-border-strong", hex: "#3A3D48", group: "Bordas",  css: "var(--lone-border-strong)" },
  { label: "lone-text-primary",   hex: "#FFFFFF",  group: "Texto", css: "var(--lone-text-primary)" },
  { label: "lone-text-secondary", hex: "#9EA1AB",  group: "Texto", css: "var(--lone-text-secondary)" },
  { label: "lone-text-tertiary",  hex: "#7B7E89",  group: "Texto", css: "var(--lone-text-tertiary)" },
  { label: "lone-text-disabled",  hex: "#6B6E78",  group: "Texto", css: "var(--lone-text-disabled)" },
  { label: "lone-brand",         hex: "#2B3CFF",              group: "Marca", css: "var(--lone-brand-primary)" },
  { label: "lone-brand-soft",    hex: "#8DA4FF",              group: "Marca", css: "var(--lone-brand-soft)" },
  { label: "lone-brand-bg-soft", hex: "rgba(43,60,255,0.20)", group: "Marca", css: "var(--lone-brand-bg-soft)" },
  { label: "lone-danger",  hex: "#F87171", group: "Semântico", css: "var(--lone-danger)" },
  { label: "lone-warning", hex: "#FBB13C", group: "Semântico", css: "var(--lone-warning)" },
  { label: "lone-success", hex: "#4ADE80", group: "Semântico", css: "var(--lone-success)" },
  { label: "lone-info",    hex: "#8DA4FF", group: "Semântico", css: "var(--lone-info)" },
];

const TYPE_SCALE = [
  { token: "lone-hero",    size: "28px", weight: "500", sample: "Hero — Título de painel" },
  { token: "lone-h1",      size: "22px", weight: "500", sample: "H1 — Cabeçalho principal" },
  { token: "lone-h2",      size: "15px", weight: "500", sample: "H2 — Seção ou card title" },
  { token: "lone-body",    size: "13px", weight: "400", sample: "Body — Texto de conteúdo padrão" },
  { token: "lone-caption", size: "11px", weight: "400", sample: "Caption — Label secundário" },
  { token: "lone-eyebrow", size: "10px", weight: "500", sample: "EYEBROW — UPPERCASE LABEL" },
];

const groups = [...new Set(COLORS.map((c) => c.group))];

// ── Dev gate ──────────────────────────────────────────────────

function useDevGate(): "loading" | "allowed" | "denied" {
  const isDev = process.env.NODE_ENV === "development";
  const [state, setState] = useState<"loading" | "allowed" | "denied">(
    isDev ? "allowed" : "loading",
  );

  useEffect(() => {
    if (isDev) return; // já está "allowed" desde o início
    try {
      const sessionId = sessionStorage.getItem("lone_local_session");
      const profile = USER_PROFILES.find((p) => p.id === sessionId);
      setState(
        profile?.role === "admin" || profile?.role === "manager"
          ? "allowed"
          : "denied",
      );
    } catch {
      setState("denied");
    }
  }, [isDev]);

  return state;
}

// ── Page ──────────────────────────────────────────────────────

export default function TokensPage() {
  const gate = useDevGate();

  if (gate === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-lone-bg-primary">
        <span className="font-inter text-lone-caption text-lone-text-tertiary">
          Verificando acesso…
        </span>
      </div>
    );
  }

  if (gate === "denied") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-lone-bg-primary">
        <span className="font-inter text-lone-h1 font-medium text-lone-danger">403</span>
        <p className="font-inter text-lone-body text-lone-text-secondary">
          Página restrita a admin e manager em produção.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 font-inter bg-lone-bg-primary text-lone-text-primary">
      <div className="max-w-5xl mx-auto space-y-14">

        {/* ── Header ─────────────────────────────────────────── */}
        <div>
          <p className="text-lone-eyebrow text-lone-text-tertiary mb-2 tracking-[1.5px]">LONE OS</p>
          <h1 className="text-lone-hero font-medium text-lone-text-primary">Design System v2</h1>
          <p className="text-lone-body text-lone-text-secondary mt-2">
            Tokens de cor, tipografia e componentes — Onda UI-1 / Fase 0
          </p>
        </div>

        {/* ── Paleta de cores ──────────────────────────────────── */}
        <section>
          <SectionDivider label="Paleta de Cores" badge={`${COLORS.length} tokens`} className="mb-5" />
          {groups.map((group) => (
            <div key={group} className="mb-6">
              <p className="text-lone-eyebrow text-lone-text-disabled mb-3 tracking-[1.5px]">{group}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {COLORS.filter((c) => c.group === group).map((color) => (
                  <div key={color.label} className="rounded-lg overflow-hidden border border-lone-border">
                    <div className="h-10 w-full" style={{ background: color.css }} />
                    <div className="px-2 py-1.5 bg-lone-bg-card">
                      <p className="text-[10px] font-medium text-lone-text-primary">{color.label}</p>
                      <p className="text-[9px] font-jetbrains text-lone-text-tertiary">{color.hex}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* ── Tipografia ───────────────────────────────────────── */}
        <section>
          <SectionDivider label="Tipografia — Inter" className="mb-5" />
          <div className="rounded-xl border border-lone-border bg-lone-bg-card divide-y divide-lone-border">
            {TYPE_SCALE.map((t) => (
              <div key={t.token} className="flex items-baseline gap-4 px-4 py-3">
                <span className="w-28 shrink-0 font-jetbrains text-[10px] text-lone-text-tertiary">{t.token}</span>
                <span className="shrink-0 text-[10px] text-lone-text-disabled">{t.size} / {t.weight}</span>
                <span className={`font-inter text-${t.token} text-lone-text-primary`}>{t.sample}</span>
              </div>
            ))}
          </div>
          {/* JetBrains Mono */}
          <div className="mt-4 rounded-xl border border-lone-border bg-lone-bg-card px-4 py-4 space-y-2">
            <p className="text-lone-eyebrow text-lone-text-disabled tracking-[1.5px] mb-3">JETBRAINS MONO — dados técnicos</p>
            {[
              { label: "ID / token",        value: "act_1207177640402171" },
              { label: "Timestamp",         value: "2026-05-19 · 00:42:15 UTC" },
              { label: "Número financeiro", value: "R$ 47.823,00" },
              { label: "Versão / hash",     value: "v1 · commit 5fba76b" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-4">
                <span className="w-40 shrink-0 font-inter text-[10px] text-lone-text-tertiary">{item.label}</span>
                <span className="font-jetbrains text-[13px] text-lone-text-secondary">{item.value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── KPICard ──────────────────────────────────────────── */}
        <section>
          <SectionDivider label="KPICard" badge="4 tones" className="mb-5" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard label="Ativos"   value={34}    caption="clientes em operação" tone="default" accent />
            <KPICard label="Em risco" value={3}     caption="precisam atenção"     tone="danger"  accent />
            <KPICard label="Alerta"   value={7}     caption="sem post esta semana" tone="warning" accent />
            <KPICard label="Entregues" value={142}  caption="posts publicados"     tone="success" accent />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <KPICard label="Info" value="R$ 12.4k" caption="investido no mês" tone="info" />
            <KPICard label="Sem accent" value={8} caption="sem barra lateral" tone="default" />
            <KPICard
              label="Clicável"
              value={5}
              caption="clique para ver"
              tone="info"
              onClick={() => alert("KPICard clicado")}
            />
            <KPICard label="Sem caption" value="100%" tone="success" accent />
          </div>
        </section>

        {/* ── SectionDivider ───────────────────────────────────── */}
        <section>
          <SectionDivider label="SectionDivider" className="mb-5" />
          <div className="space-y-4 bg-lone-bg-card rounded-xl border border-lone-border p-5">
            <SectionDivider label="Foco do dia" />
            <SectionDivider label="Equipe" badge="6 membros" />
            <SectionDivider label="Relatórios pendentes" badge="3" />
            <SectionDivider label="Seção sem badge" />
          </div>
        </section>

        {/* ── TeamMemberRow ────────────────────────────────────── */}
        <section>
          <SectionDivider label="TeamMemberRow" badge="4 variações" className="mb-5" />
          <div className="bg-lone-bg-card rounded-xl border border-lone-border px-4">
            <TeamMemberRow name="Carlos Augusto" role="Social Media" initials="CA"
              metric={{ label: "posts", value: "14", tone: "default" }} />
            <TeamMemberRow name="Pedro Henrique" role="Social Media" initials="PH"
              metric={{ label: "posts", value: "6", tone: "warning" }} />
            <TeamMemberRow name="Ana Lima" role="Tráfego Pago" initials="AL"
              metric={{ label: "clientes", value: "11", tone: "default" }} />
            <TeamMemberRow name="Rafael Designer" role="Designer" initials="RD"
              metric={{ label: "pendentes", value: "3", tone: "danger" }} last />
          </div>
        </section>

        {/* ── AlertBanner ──────────────────────────────────────── */}
        <section>
          <SectionDivider label="AlertBanner" badge="4 tones" className="mb-5" />
          <div className="space-y-3">
            <AlertBanner
              tone="danger"
              title="3 clientes em risco crítico"
              description="Calabria Decorações, Iron Fox e Elace glass sem interação há mais de 7 dias."
              icon={<span className="text-lone-danger text-[14px]">⚠</span>}
              action={{ label: "Ver clientes", onClick: () => {} }}
            />
            <AlertBanner
              tone="warning"
              title="7 clientes sem post esta semana"
              description="Posts agendados estão atrasados. Verifique o calendário editorial."
              icon={<span className="text-lone-warning text-[14px]">⏱</span>}
              action={{ label: "Ver calendário", onClick: () => {} }}
            />
            <AlertBanner
              tone="success"
              title="Backup do dia confirmado"
              description="loneos_20260519_0300.dump.gz · 3.7MB · PostgreSQL"
              icon={<span className="text-lone-success text-[14px]">✓</span>}
            />
            <AlertBanner
              tone="info"
              title="Novo cliente em onboarding"
              description="Atlas inc acabou de ser cadastrado. Complete o briefing para a equipe."
              icon={<span className="text-lone-info text-[14px]">ℹ</span>}
              action={{ label: "Ver onboarding", onClick: () => {} }}
            />
          </div>
        </section>

        {/* ── PillBadge ────────────────────────────────────────── */}
        <section>
          <SectionDivider label="PillBadge" badge="6 tones × 2 sizes" className="mb-5" />
          <div className="bg-lone-bg-card rounded-xl border border-lone-border p-5 space-y-4">
            {/* Size sm */}
            <div>
              <p className="text-lone-eyebrow text-lone-text-disabled tracking-[1.5px] mb-3">SIZE SM</p>
              <div className="flex flex-wrap gap-2">
                <PillBadge tone="default">Default</PillBadge>
                <PillBadge tone="brand">Brand</PillBadge>
                <PillBadge tone="danger">Em risco</PillBadge>
                <PillBadge tone="warning">Atenção</PillBadge>
                <PillBadge tone="success">Ativo</PillBadge>
                <PillBadge tone="info">Onboarding</PillBadge>
              </div>
            </div>
            {/* Size md */}
            <div>
              <p className="text-lone-eyebrow text-lone-text-disabled tracking-[1.5px] mb-3">SIZE MD</p>
              <div className="flex flex-wrap gap-2">
                <PillBadge tone="default" size="md">Default</PillBadge>
                <PillBadge tone="brand"   size="md">Lone Growth</PillBadge>
                <PillBadge tone="danger"  size="md">Crítico</PillBadge>
                <PillBadge tone="warning" size="md">7+ dias sem post</PillBadge>
                <PillBadge tone="success" size="md">Bons resultados</PillBadge>
                <PillBadge tone="info"    size="md">Social Media</PillBadge>
              </div>
            </div>
            {/* Com ícone */}
            <div>
              <p className="text-lone-eyebrow text-lone-text-disabled tracking-[1.5px] mb-3">COM ÍCONE</p>
              <div className="flex flex-wrap gap-2">
                <PillBadge tone="success" icon={<span>●</span>}>Online</PillBadge>
                <PillBadge tone="danger"  icon={<span>▲</span>}>Urgente</PillBadge>
                <PillBadge tone="brand"   icon={<span>★</span>} size="md">Premium</PillBadge>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="border-t border-lone-border pt-6 text-center">
          <p className="text-lone-caption text-lone-text-disabled">
            Lone OS Design System v2 · Onda UI-1 Fase 0 · 2026-05-19
          </p>
        </div>

      </div>
    </div>
  );
}
