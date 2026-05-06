import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import ConditionalAppShell from "@/components/ConditionalAppShell";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lone OS",
  description: "Sistema de Gestão Operacional Interna",
  icons: { icon: "/logo.png" },
  manifest: "/manifest.json",
  themeColor: "#0d4af5",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Lone OS" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className={`${montserrat.className} bg-background text-foreground`}>
        <ConditionalAppShell>{children}</ConditionalAppShell>
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}` }} />
      </body>
    </html>
  );
}
