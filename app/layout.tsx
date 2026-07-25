import type { Metadata } from "next";
import { Montserrat, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ConditionalAppShell from "@/components/ConditionalAppShell";
import { ThemeProvider } from "@/lib/context/ThemeContext";
import { Toaster } from "sonner";

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
  themeColor: "#2b3cff",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Lone OS" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    {/* `translate="no"` + notranslate: a tradução automática do navegador REESCREVE o DOM e quebra o
        React (bug conhecido do removeChild) — a tela para de atualizar, os contadores travam em zero
        e os cards ficam em branco. Aconteceu em produção: o Chrome traduziu a página que já é
        pt-BR e virou "Assinados"→"Assassinados", "Pipeline"→"Gasoduto", "Design"→"Projeto". */}
    <html lang="pt-BR" translate="no" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className={`notranslate ${inter.variable} ${montserrat.variable} ${jetbrainsMono.variable} font-sans bg-background text-foreground`}>
        <ThemeProvider>
          <ConditionalAppShell>{children}</ConditionalAppShell>
          <Toaster position="bottom-right" richColors />
        </ThemeProvider>
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}` }} />
      </body>
    </html>
  );
}
