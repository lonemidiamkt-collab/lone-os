import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lone OS",
  description: "Sistema de Gestão Operacional Interna",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${montserrat.variable} bg-background text-foreground`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
