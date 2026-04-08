"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { ThemeProvider } from "@/lib/context/ThemeContext";
import { NavProvider, useNav } from "@/lib/context/NavContext";
import Sidebar from "@/components/Sidebar";
import LoginScreen from "@/components/LoginScreen";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Menu } from "lucide-react";
import NotificationToast from "@/components/NotificationToast";
import ScheduledNoticePopup from "@/components/ScheduledNoticePopup";
import GlobalSearch from "@/components/GlobalSearch";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";

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

  // Secondary sidebar is 240px; primary is 72px
  const hasSecondaryRoute = SECONDARY_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/")
  );
  const showSecondary = hasSecondaryRoute && secondaryOpen;

  // Dynamic left offset for main content
  const contentOffset = showSecondary ? "lg:pl-[312px]" : "lg:pl-[72px]";

  return (
    <div className="flex min-h-screen bg-black relative">
      {/* Ambient glows */}
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-[#0a34f5]/[0.018] rounded-full blur-[200px] pointer-events-none" />
      <div className="fixed bottom-0 left-72 w-[400px] h-[400px] bg-[#0a34f5]/[0.012] rounded-full blur-[150px] pointer-events-none" />

      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-4 left-4 z-30 w-10 h-10 rounded-xl bg-[#0a34f5] flex items-center justify-center shadow-[0_0_20px_rgba(10,52,245,0.4)]"
        aria-label="Abrir menu"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        <Menu size={18} className="text-white" />
      </button>

      {/* Double Sidebar */}
      <Sidebar />

      {/* Main content — shifts right when secondary is open */}
      <main
        className={[
          "flex-1 flex flex-col overflow-hidden w-full",
          "transition-all duration-300 ease-in-out",
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
            </NavProvider>
          </AppStateProvider>
        </AuthGate>
      </RoleProvider>
    </ThemeProvider>
  );
}
