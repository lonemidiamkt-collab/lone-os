import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  // next-themes põe .dark no <html>; sem isto `dark:` seguia o sistema operacional, não o botão de tema.
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background-rgb) / <alpha-value>)",
        foreground: "rgb(var(--foreground-rgb) / <alpha-value>)",
        card: {
          DEFAULT: "rgb(var(--card-rgb) / <alpha-value>)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "rgb(var(--primary-rgb) / <alpha-value>)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "rgb(var(--secondary-rgb) / <alpha-value>)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "rgb(var(--muted-rgb) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground-rgb) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent-rgb) / <alpha-value>)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "rgb(var(--destructive-rgb) / <alpha-value>)",
          foreground: "var(--destructive-foreground)",
        },
        // --border-alpha: no claro a borda é preto a 8%; o /50 multiplica esse alfa.
        border: "rgb(var(--border-rgb) / calc(<alpha-value> * var(--border-alpha)))",
        input: "var(--input)",
        ring: "var(--ring)",
        surface: "var(--muted)",

        // ── Design System v2 — cores lone-* ──────────────────
        // Todas referenciam CSS vars --lone-* definidos em globals.css.
        // Prefixo lone- garante zero colisão com cores existentes.
        lone: {
          bg: {
            primary:  "var(--lone-bg-primary)",
            card:     "var(--lone-bg-card)",
            elevated: "var(--lone-bg-elevated)",
          },
          border: {
            DEFAULT: "var(--lone-border-default)",
            strong:  "var(--lone-border-strong)",
          },
          text: {
            primary:   "var(--lone-text-primary)",
            secondary: "var(--lone-text-secondary)",
            tertiary:  "var(--lone-text-tertiary)",
            disabled:  "var(--lone-text-disabled)",
          },
          brand: {
            DEFAULT: "var(--lone-brand-primary)",
            soft:    "var(--lone-brand-soft)",
            "bg-soft": "var(--lone-brand-bg-soft)",
          },
          danger:  "var(--lone-danger)",
          "danger-bg":     "var(--lone-danger-bg)",
          "danger-border": "var(--lone-danger-border)",
          warning: "var(--lone-warning)",
          "warning-bg":     "var(--lone-warning-bg)",
          "warning-border": "var(--lone-warning-border)",
          success: "var(--lone-success)",
          "success-bg":     "var(--lone-success-bg)",
          "success-border": "var(--lone-success-border)",
          info:    "var(--lone-info)",
          "info-bg":     "var(--lone-info-bg)",
          "info-border": "var(--lone-info-border)",
          high: "var(--lone-high)",
          "high-bg":     "var(--lone-high-bg)",
          "high-border": "var(--lone-high-border)",
        },

        overlay: {
          DEFAULT: "var(--overlay)",
          strong: "var(--overlay-strong)",
          foreground: "var(--overlay-foreground)",
        },
        whatsapp: "var(--whatsapp)",
        // Channelizado (bg-chart-4/15 funciona); o var(--chart-N) segue valendo em prop de recharts/SVG.
        chart: {
          1: "rgb(var(--chart-1-rgb) / <alpha-value>)",
          2: "rgb(var(--chart-2-rgb) / <alpha-value>)",
          3: "rgb(var(--chart-3-rgb) / <alpha-value>)",
          4: "rgb(var(--chart-4-rgb) / <alpha-value>)",
          5: "rgb(var(--chart-5-rgb) / <alpha-value>)",
        },

        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },
      // Passo de 8% (tinta suave) — o `bg-primary/8` não gerava CSS porque 8 não existe na escala padrão.
      opacity: {
        8: "0.08",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
      fontFamily: {
        // UI/corpo = Montserrat (pedido do Roberto: fonte da marca no sistema todo).
        sans: ["var(--font-montserrat)", "Montserrat", "ui-sans-serif", "system-ui", "sans-serif"],
        brand: ["var(--font-montserrat)", "Montserrat", "ui-sans-serif", "sans-serif"],
        // `font-inter` também aponta pro Montserrat (telas antigas usam essa classe).
        inter:      ["var(--font-montserrat)", "Montserrat", "ui-sans-serif", "sans-serif"],
        mono:       ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
        jetbrains:  ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // ── Tipografia lone-* (Design System v2) ──────────────
        // Coexiste com os tamanhos Tailwind existentes (sm, base, lg…)
        "lone-hero":    ["28px", { lineHeight: "1.1",  fontWeight: "500" }],
        "lone-h1":      ["22px", { lineHeight: "1.2",  fontWeight: "500" }],
        "lone-h2":      ["15px", { lineHeight: "1.3",  fontWeight: "500" }],
        "lone-body":    ["13px", { lineHeight: "1.5",  fontWeight: "400" }],
        "lone-caption": ["11px", { lineHeight: "1.4",  fontWeight: "400" }],
        "lone-eyebrow": ["10px", { lineHeight: "1.4",  fontWeight: "500",
                                    letterSpacing: "1.5px" }],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
    },
  },
  plugins: [typography, tailwindcssAnimate],
};

export default config;
