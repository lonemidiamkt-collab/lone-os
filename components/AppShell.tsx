"use client";

import { RoleProvider } from "@/lib/context/RoleContext";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import Sidebar from "@/components/Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <RoleProvider>
      <AppStateProvider>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            {children}
          </div>
        </div>
      </AppStateProvider>
    </RoleProvider>
  );
}
