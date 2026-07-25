"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { NavProvider, useNav } from "@/lib/context/NavContext";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import Sidebar from "@/components/Sidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import LoginScreen from "@/components/LoginScreen";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Logo } from "@/components/ui/Logo";
import { Menu } from "lucide-react";
import NotificationToast from "@/components/NotificationToast";
import NotificationCenter from "@/components/NotificationCenter";
import ScheduledNoticePopup from "@/components/ScheduledNoticePopup";
import GlobalSearch from "@/components/GlobalSearch";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import OnboardingTour from "@/components/OnboardingTour";
import SessionTimeout from "@/components/SessionTimeout";
import RealtimeToast from "@/components/RealtimeToast";

// Routes that have a secondary sidebar (240px extra)
const SECONDARY_ROUTES = ["/traffic", "/social", "/design", "/clients", "/crm"];

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hydrated } = useRole();

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center animate-pulse overflow-hidden">
          <Logo className="w-6 h-6" priority />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <LoginScreen />;
  return <>{children}</>;
}

function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useRole();
  const { secondaryOpen, mobileOpen, setMobileOpen } = useNav();

  // O comercial (SDR) só trabalha no /crm e nem tem item de menu na Home. Ao cair em '/'
  // (login/atalho), manda direto pro funil — antes aterrissava numa dashboard que não é dele.
  useEffect(() => {
    if (role === "comercial" && pathname === "/") router.replace("/crm");
  }, [role, pathname, router]);
  // Meta token expiry check is handled by useMetaConnection (Supabase-backed)

  // Notificações do sino — ninguém carregava o histórico do banco, então cada usuário só via o
  // que a própria sessão empurrava (ex: o designer nunca recebia "Conteúdo reprovado" do social).
  // Carrega no login + refetch a cada 45s e ao voltar o foco. Realtime está OFF.
  // IMPORTANTE: o poll roda MESMO com a aba oculta (antes era gated em "visible") — senão, numa
  // outra aba do navegador as notificações novas nem chegavam, e a notificação do SO não disparava.
  // Em segundo plano o browser afrouxa o timer p/ ~1/min, o que é ok pra notificação.
  const initNotifs = useNotificationsStore((s) => s.init);
  const refreshNotifs = useNotificationsStore((s) => s.refresh);
  useEffect(() => {
    initNotifs();
    const interval = setInterval(() => { refreshNotifs(); }, 45000);
    const onVisible = () => { if (document.visibilityState === "visible") refreshNotifs(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [initNotifs, refreshNotifs]);

  // Secondary sidebar is 240px; primary is 72px
  const hasSecondaryRoute = SECONDARY_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/")
  );
  const showSecondary = hasSecondaryRoute && secondaryOpen;

  // Dynamic left offset for main content
  const contentOffset = showSecondary ? "lg:pl-[312px]" : "lg:pl-[72px]";

  return (
    <div className="flex min-h-screen bg-transparent relative">
      {/* Fundo navy + glow azul vêm do body (html.dark body) — wrapper transparente deixa aparecer */}

      {/* Hambúrguer flutuante — escondido: no mobile a navegação é a barra inferior (MobileBottomNav),
          e o "Mais" dela abre este mesmo drawer. Mantido no DOM só pra preservar as refs. */}
      <button
        className="hidden"
        aria-label="Abrir menu"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        <Menu size={18} className="text-primary-foreground" />
      </button>

      {/* Double Sidebar */}
      <Sidebar />

      {/* Notification bell — fixed top-right */}
      <div className="fixed top-4 right-4 z-30">
        <NotificationCenter />
      </div>

      {/* Main content — shifts right when secondary is open */}
      <main
        className={[
          "flex-1 flex flex-col overflow-auto w-full",
          "transition-all duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[padding]",
          // Espaço pra barra inferior no mobile (altura 3.5rem + safe-area do iPhone). Zero no desktop.
          "pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0",
          contentOffset,
        ].join(" ")}
      >
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>

      {/* Navegação inferior estilo app (só mobile) */}
      <MobileBottomNav />
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <RoleProvider>
      <AuthGate>
        <AppStateProvider>
          <NavProvider>
            <MainLayout>{children}</MainLayout>
            <NotificationToast />
            <RealtimeToast />
            <ScheduledNoticePopup />
            <GlobalSearch />
            <KeyboardShortcuts />
            <OnboardingTour />
            <SessionTimeout />
          </NavProvider>
        </AppStateProvider>
      </AuthGate>
    </RoleProvider>
  );
}
