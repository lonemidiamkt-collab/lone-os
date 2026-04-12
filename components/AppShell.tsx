"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";
import { AppStateProvider, useAppState } from "@/lib/context/AppStateContext";
import { ThemeProvider } from "@/lib/context/ThemeContext";
import { NavProvider, useNav } from "@/lib/context/NavContext";
import Sidebar from "@/components/Sidebar";
import LoginScreen from "@/components/LoginScreen";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Menu } from "lucide-react";
import NotificationToast from "@/components/NotificationToast";
import NotificationCenter from "@/components/NotificationCenter";
import ScheduledNoticePopup from "@/components/ScheduledNoticePopup";
import GlobalSearch from "@/components/GlobalSearch";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import OnboardingTour from "@/components/OnboardingTour";

// Routes that have a secondary sidebar (240px extra)
const SECONDARY_ROUTES = ["/traffic", "/social", "/design", "/clients"];

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hydrated } = useRole();

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center animate-pulse shadow-[0_0_30px_rgba(10,52,245,0.4)] overflow-hidden">
          <img src="/logo.png" alt="Lone" width={24} height={24} className="object-contain" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <LoginScreen />;
  return <>{children}</>;
}

function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { secondaryOpen, mobileOpen, setMobileOpen } = useNav();
  const { pushNotification } = useAppState();

  // Check Meta token expiry on mount and warn user
  useEffect(() => {
    const expiresAt = localStorage.getItem("meta_token_expires_at");
    const token = localStorage.getItem("meta_access_token");
    if (token && expiresAt) {
      const expiryMs = parseInt(expiresAt, 10);
      const now = Date.now();
      if (now > expiryMs) {
        pushNotification("system", "Token Meta Ads expirado", "Seu token de acesso ao Meta Ads expirou. Reconecte na pagina de Trafego para continuar visualizando campanhas.");
        localStorage.removeItem("meta_access_token");
        localStorage.removeItem("meta_token_expires_at");
        localStorage.removeItem("meta_token_type");
      } else {
        const daysLeft = Math.floor((expiryMs - now) / 86400000);
        if (daysLeft <= 7) {
          pushNotification("system", "Token Meta Ads expira em breve", `Seu token Meta Ads expira em ${daysLeft} dia(s). Reconecte na pagina de Trafego para renovar.`);
        }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Secondary sidebar is 240px; primary is 72px
  const hasSecondaryRoute = SECONDARY_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/")
  );
  const showSecondary = hasSecondaryRoute && secondaryOpen;

  // Dynamic left offset for main content
  const contentOffset = showSecondary ? "lg:pl-[312px]" : "lg:pl-[72px]";

  return (
    <div className="flex min-h-screen bg-black relative">
      {/* Ambient glows — ultra subtle, hidden on mobile for performance */}
      <div className="hidden lg:block fixed top-0 right-0 w-[500px] h-[500px] bg-[#0a34f5]/[0.01] rounded-full blur-[250px] pointer-events-none" />
      <div className="hidden lg:block fixed bottom-0 left-72 w-[300px] h-[300px] bg-[#0a34f5]/[0.008] rounded-full blur-[200px] pointer-events-none" />

      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-4 left-4 z-30 w-10 h-10 rounded-xl bg-[#0a34f5] flex items-center justify-center shadow-[0_2px_10px_rgba(10,52,245,0.25)]"
        aria-label="Abrir menu"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        <Menu size={18} className="text-white" />
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
          "flex-1 flex flex-col overflow-hidden w-full",
          "transition-all duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[padding]",
          contentOffset,
        ].join(" ")}
      >
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <RoleProvider>
        <AuthGate>
          <AppStateProvider>
            <NavProvider>
              <MainLayout>{children}</MainLayout>
              <NotificationToast />
              <ScheduledNoticePopup />
              <GlobalSearch />
              <KeyboardShortcuts />
              <OnboardingTour />
            </NavProvider>
          </AppStateProvider>
        </AuthGate>
      </RoleProvider>
    </ThemeProvider>
  );
}
