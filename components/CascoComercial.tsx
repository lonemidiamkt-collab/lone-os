"use client";

// O casco do COMERCIAL.LONEMIDIA.COM (out/2026): o mesmo Lone OS, sem o menu da operação. Cabeçalho com
// a marca, as abas do comercial (lib/navegacao/casco.ts), o sino, o tema e a conta. O login é o mesmo
// do painel (AuthGate); quem não é sócio vê o aviso e o link para o painel.
// Redesign (Leva D1): paleta própria (.casco-comercial no <html>, ver app/globals.css), abre no CLARO na
// primeira visita, sino só com os avisos do comercial e sem o aviso flutuante da operação.

import { useEffect } from "react";
import { useTheme as useTemaDoSistema } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ExternalLink, LogOut, Moon, Sun } from "lucide-react";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";
import { NavProvider, useNav } from "@/lib/context/NavContext";
import { useTheme } from "@/lib/context/ThemeContext";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { AuthGate } from "@/components/AppShell";
import ErrorBoundary from "@/components/ErrorBoundary";
import NotificationCenter from "@/components/NotificationCenter";
import SessionTimeout from "@/components/SessionTimeout";
import { ABRIR_NOTIFICACOES } from "@/components/TopActions";
import { Logo } from "@/components/ui/Logo";
import { FotoPessoa } from "@/components/ui/FotoPessoa";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ABAS_COMERCIAL, ABAS_DA_PAGINA_CRM, type AbaComercial } from "@/lib/navegacao/casco";
import { podeVerComercial } from "@/lib/crm/acesso";
import { ehNotificacaoComercial } from "@/lib/crm/notificacoes";

const PAINEL = "https://painel.lonemidia.com";

function abaAtiva(pathname: string, currentTab: string): AbaComercial {
  if (pathname.startsWith("/crm/rota")) return "rota";
  if (pathname.startsWith("/crm/importar")) return "importar";
  return (ABAS_DA_PAGINA_CRM.includes(currentTab) ? currentTab : "hoje") as AbaComercial;
}

function Abas({ className }: { className: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentTab, setPendingTab } = useNav();
  const ativa = abaAtiva(pathname, currentTab);
  const naPaginaCrm = pathname === "/" || pathname === "/crm";
  return (
    <nav aria-label="Comercial" className={className}>
      {ABAS_COMERCIAL.map((a) => {
        const ehAtiva = a.id === ativa;
        const cls = `shrink-0 rounded-md px-3 py-1.5 text-lone-body font-medium transition-colors ${ehAtiva ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`;
        if (ABAS_DA_PAGINA_CRM.includes(a.id)) {
          return (
            <button key={a.id} className={cls} aria-current={ehAtiva ? "page" : undefined}
              onClick={() => (naPaginaCrm ? setPendingTab(a.id) : router.push(`/crm?aba=${a.id}`))}>
              {a.rotulo}
            </button>
          );
        }
        return <Link key={a.id} href={a.href} className={cls} aria-current={ehAtiva ? "page" : undefined}>{a.rotulo}</Link>;
      })}
    </nav>
  );
}

function Cabecalho() {
  const { currentProfile, roleLabel, logout } = useRole();
  const { theme, toggleTheme } = useTheme();
  const naoLidas = useNotificationsStore((s) => s.notifications.filter((n) => !n.read && ehNotificacaoComercial(n)).length);
  const botao = "relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-card"><Logo className="h-5 w-5" /></span>
          <span className="text-lone-body font-semibold text-foreground">Lone <span className="font-normal text-muted-foreground">Comercial</span></span>
        </Link>
        <Abas className="ml-4 hidden items-center gap-1 overflow-x-auto md:flex" />
        <div className="ml-auto flex items-center gap-2">
          <button className={botao} aria-label={`Notificações${naoLidas ? ` (${naoLidas} não lidas)` : ""}`} onClick={() => window.dispatchEvent(new Event(ABRIR_NOTIFICACOES))}>
            <Bell size={16} />
            {naoLidas > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-[18px] text-primary-foreground">{naoLidas > 99 ? "99+" : naoLidas}</span>}
          </button>
          <button className={botao} aria-label={theme === "dark" ? "Modo claro" : "Modo escuro"} onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger aria-label={`Conta de ${currentProfile.name}`} className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <FotoPessoa perfil={currentProfile} size={32} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-1.5">
              <DropdownMenuLabel className="font-normal">
                <p className="truncate text-sm font-semibold text-foreground">{currentProfile.name}</p>
                <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href={PAINEL}><ExternalLink size={15} className="mr-2" />Abrir o Lone OS</a>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive" onSelect={() => { if (window.confirm("Sair da conta?")) logout(); }}>
                <LogOut size={15} className="mr-2" />Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <Abas className="flex items-center gap-1 overflow-x-auto px-4 pb-2 md:hidden" />
    </header>
  );
}

/**
 * Fundo da marca (o mesmo do site da Lone, ~/dev/lone-midia-site, FundoMarca): arcos de luz royal e o
 * "M" em contorno, numa camada fixa atrás de tudo — redesenhado em vetor para ficar nítido. Pedido do Roberto em 17/10/2026: "coloca esse fundo
 * no Lone Comercial… diminui um pouquinho a opacidade". Entra NÍTIDO e apagado por opacidade (nunca
 * desfocado — ver a regra do fundo discreto do site); mais fraco que no site, porque aqui se lê número
 * o dia todo e os cartões ficam por cima. No claro vira quase uma marca d'água azul.
 */
function FundoMarca() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-background">
      {/* Vetor (public/fundos/marca.svg): nítido em qualquer tela — a arte do site é um JPEG de 2000 px. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/fundos/marca.svg" alt="" decoding="async"
        className="h-full w-full object-cover opacity-[0.07] dark:opacity-[0.22]" />
    </div>
  );
}

function Conteudo({ children }: { children: React.ReactNode }) {
  const { role } = useRole();
  const pathname = usePathname();
  const { setTheme } = useTemaDoSistema();
  const init = useNotificationsStore((s) => s.init);
  const refresh = useNotificationsStore((s) => s.refresh);
  useEffect(() => {
    init();
    const t = setInterval(refresh, 45000);
    return () => clearInterval(t);
  }, [init, refresh]);
  // Paleta do comercial no <html> (alcança também janelas e menus que abrem fora do casco) e tema claro
  // na primeira visita — o navegador guarda o tema por endereço, e o padrão do sistema é escuro.
  useEffect(() => {
    document.documentElement.classList.add("casco-comercial");
    try { if (!window.localStorage.getItem("theme")) setTheme("light"); } catch { /* sem localStorage: fica o padrão */ }
    return () => document.documentElement.classList.remove("casco-comercial");
  }, [setTheme]);
  // Cada tela do Next troca o título; o do comercial é um só.
  useEffect(() => { document.title = "Lone Comercial"; }, [pathname]);

  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <FundoMarca />
      <Cabecalho />
      <main className="mx-auto w-full max-w-[1400px] flex-1">
        {podeVerComercial(role) ? (
          <ErrorBoundary>{children}</ErrorBoundary>
        ) : (
          <div className="p-8">
            <p className="text-lone-body text-foreground">O Comercial é só dos sócios.</p>
            <a href={PAINEL} className="mt-2 inline-block text-lone-body text-primary hover:underline">Ir para o Lone OS</a>
          </div>
        )}
      </main>
      <NotificationCenter semBotao filtro={ehNotificacaoComercial} />
      <SessionTimeout />
    </div>
  );
}

export default function CascoComercial({ children }: { children: React.ReactNode }) {
  return (
    <RoleProvider>
      <AuthGate>
        <NavProvider>
          <Conteudo>{children}</Conteudo>
        </NavProvider>
      </AuthGate>
    </RoleProvider>
  );
}
