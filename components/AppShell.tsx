"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { ThemeProvider } from "@/lib/context/ThemeContext";
import Sidebar from "@/components/Sidebar";
import LoginScreen from "@/components/LoginScreen";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Menu } from "lucide-react";
import NotificationToast from "@/components/NotificationToast";
import ScheduledNoticePopup from "@/components/ScheduledNoticePopup";
import GlobalSearch from "@/components/GlobalSearch";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hydrated } = useRole();

  // Wait for localStorage restore before deciding
  if (!hydrated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center animate-pulse shadow-[0_0_30px_rgba(10,52,245,0.4)] overflow-hidden">
          <img src="/logo.png" alt="Lone" width={24} height={24} className="object-contain" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}

function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-black bg-grid relative">
      {/* Background ambient glow */}
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-[#0a34f5]/[0.02] rounded-full blur-[200px] pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-[#0a34f5]/[0.015] rounded-full blur-[150px] pointer-events-none" />

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50
        transition-transform duration-300
        ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden w-full lg:pl-[72px]">
        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(true)}
          className="lg:hidden fixed top-4 left-4 z-30 w-10 h-10 rounded-xl bg-[#0a34f5] flex items-center justify-center shadow-[0_0_20px_rgba(10,52,245,0.4)]"
          aria-label="Abrir menu"
        >
          <Menu size={18} className="text-white" />
        </button>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <RoleProvider>
        <AuthGate>
          <AppStateProvider>
            <MainLayout>{children}</MainLayout>
            <NotificationToast />
            <ScheduledNoticePopup />
            <GlobalSearch />
            <KeyboardShortcuts />
          </AppStateProvider>
        </AuthGate>
      </RoleProvider>
    </ThemeProvider>
  );
}
