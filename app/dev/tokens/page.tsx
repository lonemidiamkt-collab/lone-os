"use client";

/**
 * /dev/tokens — Página de preview do Design System v2
 *
 * Acesse em http://localhost:3000/dev/tokens
 * Não é deployada em produção para uso de equipe (rota /dev/*).
 * Componentes serão adicionados em Fase 0.3.
 */

export default function TokensPage() {
  const COLORS = [
    // Fundos
    { label: "lone-bg-primary",  value: "var(--lone-bg-primary)",  hex: "#13141A", group: "Fundos" },
    { label: "lone-bg-card",     value: "var(--lone-bg-card)",     hex: "#1A1B23", group: "Fundos" },
    { label: "lone-bg-elevated", value: "var(--lone-bg-elevated)", hex: "#22242E", group: "Fundos" },
    // Bordas
    { label: "lone-border-default", value: "var(--lone-border-default)", hex: "#2A2C36", group: "Bordas" },
    { label: "lone-border-strong",  value: "var(--lone-border-strong)",  hex: "#3A3D48", group: "Bordas" },
    // Texto
    { label: "lone-text-primary",   value: "var(--lone-text-primary)",   hex: "#FFFFFF",  group: "Texto" },
    { label: "lone-text-secondary", value: "var(--lone-text-secondary)", hex: "#9EA1AB",  group: "Texto" },
    { label: "lone-text-tertiary",  value: "var(--lone-text-tertiary)",  hex: "#7B7E89",  group: "Texto" },
    { label: "lone-text-disabled",  value: "var(--lone-text-disabled)",  hex: "#6B6E78",  group: "Texto" },
    // Marca
    { label: "lone-brand-primary", value: "var(--lone-brand-primary)", hex: "#2B3CFF",              group: "Marca" },
    { label: "lone-brand-soft",    value: "var(--lone-brand-soft)",    hex: "#8DA4FF",              group: "Marca" },
    { label: "lone-brand-bg-soft", value: "var(--lone-brand-bg-soft)", hex: "rgba(43,60,255,0.20)", group: "Marca" },
    // Semântico
    { label: "lone-danger",  value: "var(--lone-danger)",  hex: "#F87171", group: "Semântico" },
    { label: "lone-warning", value: "var(--lone-warning)", hex: "#FBB13C", group: "Semântico" },
    { label: "lone-success", value: "var(--lone-success)", hex: "#4ADE80", group: "Semântico" },
    { label: "lone-info",    value: "var(--lone-info)",    hex: "#8DA4FF", group: "Semântico" },
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

  return (
    <div
      className="min-h-screen p-8 font-inter"
      style={{ backgroundColor: "var(--lone-bg-primary)", color: "var(--lone-text-primary)" }}
    >
      <div className="max-w-5xl mx-auto space-y-12">

        {/* Header */}
        <div>
          <p className="text-lone-eyebrow text-lone-text-tertiary mb-1 font-inter uppercase tracking-widest">
            Lone OS
          </p>
          <h1 className="text-lone-hero font-inter font-medium text-lone-text-primary">
            Design System v2
          </h1>
          <p className="text-lone-body text-lone-text-secondary mt-2">
            Tokens de cor, tipografia e componentes — Onda UI-1 / Fase 0
          </p>
        </div>

        {/* Paleta de cores */}
        <section>
          <h2 className="text-lone-h2 font-medium mb-4" style={{ color: "var(--lone-text-primary)" }}>
            Paleta de Cores
          </h2>
          {groups.map((group) => (
            <div key={group} className="mb-6">
              <p
                className="text-[10px] font-medium uppercase tracking-widest mb-3"
                style={{ color: "var(--lone-text-tertiary)" }}
              >
                {group}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {COLORS.filter((c) => c.group === group).map((color) => (
                  <div
                    key={color.label}
                    className="rounded-lg overflow-hidden border"
                    style={{ borderColor: "var(--lone-border-default)" }}
                  >
                    <div
                      className="h-12 w-full"
                      style={{ background: color.value }}
                    />
                    <div
                      className="px-2 py-1.5"
                      style={{ backgroundColor: "var(--lone-bg-card)" }}
                    >
                      <p className="text-[10px] font-medium" style={{ color: "var(--lone-text-primary)" }}>
                        {color.label}
                      </p>
                      <p className="text-[9px] font-mono" style={{ color: "var(--lone-text-tertiary)" }}>
                        {color.hex}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Escala tipográfica */}
        <section>
          <h2 className="text-lone-h2 font-medium mb-4" style={{ color: "var(--lone-text-primary)" }}>
            Tipografia — Inter
          </h2>
          <div
            className="rounded-xl border divide-y"
            style={{
              backgroundColor: "var(--lone-bg-card)",
              borderColor: "var(--lone-border-default)",
              // @ts-expect-error CSS custom property
              "--tw-divide-opacity": 1,
              borderTopWidth: 0,
            }}
          >
            {TYPE_SCALE.map((t) => (
              <div
                key={t.token}
                className="flex items-baseline gap-4 px-4 py-3"
                style={{ borderColor: "var(--lone-border-default)", borderTopWidth: "1px" }}
              >
                <span
                  className="w-28 shrink-0 font-mono text-[10px]"
                  style={{ color: "var(--lone-text-tertiary)" }}
                >
                  {t.token}
                </span>
                <span
                  className="shrink-0 text-[10px]"
                  style={{ color: "var(--lone-text-disabled)" }}
                >
                  {t.size} / {t.weight}
                </span>
                <span
                  className={`font-inter text-${t.token}`}
                  style={{ color: "var(--lone-text-primary)", fontFamily: "var(--font-inter)" }}
                >
                  {t.sample}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* JetBrains Mono */}
        <section>
          <h2 className="text-lone-h2 font-medium mb-4" style={{ color: "var(--lone-text-primary)" }}>
            Tipografia — JetBrains Mono
          </h2>
          <div
            className="rounded-xl border px-4 py-4 space-y-2"
            style={{ backgroundColor: "var(--lone-bg-card)", borderColor: "var(--lone-border-default)" }}
          >
            {[
              { label: "IDs / tokens", value: "act_1207177640402171" },
              { label: "Timestamps", value: "2026-05-19 · 00:42:15 UTC" },
              { label: "Números técnicos", value: "R$ 47.823,00" },
              { label: "Versão / hash", value: "v1 · commit 5fba76b" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-4">
                <span
                  className="w-36 shrink-0 text-[10px]"
                  style={{ color: "var(--lone-text-tertiary)", fontFamily: "var(--font-inter)" }}
                >
                  {item.label}
                </span>
                <span
                  className="text-[13px]"
                  style={{
                    color: "var(--lone-text-secondary)",
                    fontFamily: "var(--font-jetbrains-mono)",
                  }}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Placeholder para componentes — preenchido em Fase 0.3 */}
        <section
          className="rounded-xl border border-dashed px-6 py-8 text-center"
          style={{ borderColor: "var(--lone-border-default)" }}
        >
          <p className="text-lone-body" style={{ color: "var(--lone-text-tertiary)" }}>
            Componentes lone-ui serão adicionados aqui na Fase 0.3
          </p>
          <p className="text-lone-caption mt-1" style={{ color: "var(--lone-text-disabled)" }}>
            KPICard · SectionDivider · TeamMemberRow · AlertBanner · PillBadge
          </p>
        </section>

      </div>
    </div>
  );
}
