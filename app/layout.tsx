import type { Metadata, Viewport } from "next";
import { Montserrat, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ConditionalAppShell from "@/components/ConditionalAppShell";
import { ThemeProvider } from "@/lib/context/ThemeContext";
import { Toaster } from "@/components/ui/sonner";

// Sistema existente — intacto
const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

// Design System v2 — componentes lone-ui
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lone OS",
  description: "Sistema de Gestão Operacional Interna",
  icons: { icon: "/logo.png" },
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Lone OS" },
};

// Viewport do painel do time (igual ao que estava fixo no <head>). Como export, a página do portal do cliente
// consegue trocar o dela (zoom liberado, cor da barra) — meta fixa no <head> não dá para sobrescrever.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: false,
  themeColor: "#2b3cff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className={`${inter.variable} ${montserrat.variable} ${jetbrainsMono.variable} font-sans bg-background text-foreground`}>
        <ThemeProvider>
          <ConditionalAppShell>{children}</ConditionalAppShell>
          <Toaster />
        </ThemeProvider>
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}` }} />
      </body>
    </html>
  );
}
