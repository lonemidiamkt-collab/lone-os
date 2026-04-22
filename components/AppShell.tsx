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
const SECONDARY_ROUTES = ["/traffic", "/social", "/design", "/clients"];

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hydrated } = useRole();

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center animate-pulse shadow-[0_0_30px_rgba(10,52,245,0.4)] overflow-hidden">
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
  const { secondaryOpen, mobileOpen, setMobileOpen } = useNav();
  const { pushNotification } = useAppState();

  // Meta token expiry check is handled by useMetaConnection (Supabase-backed)

  // Secondary sidebar is 240px; primary is 72px
  const hasSecondaryRoute = SECONDARY_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/")
  );
  const showSecondary = hasSecondaryRoute && secondaryOpen;

  // Dynamic left offset for main content
  const contentOffset = showSecondary ? "lg:pl-[312px]" : "lg:pl-[72px]";

  return (
    <div className="flex min-h-screen bg-background relative">
      {/* Ambient glows removed — sober premium aesthetic */}

      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-4 left-4 z-30 w-10 h-10 rounded-xl bg-[#0d4af5] flex items-center justify-center"
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
          "flex-1 flex flex-col overflow-auto w-full",
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
    </ThemeProvider>
  );
}
