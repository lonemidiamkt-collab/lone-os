"use client";

import { ChevronRight } from "lucide-react";
import { useRole } from "@/lib/context/RoleContext";
import TopActions, { useRegistrarHeader } from "@/components/TopActions";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { currentProfile } = useRole();
  useRegistrarHeader();

  return (
    <header className="h-16 border-b border-border bg-background flex items-center px-4 pl-16 lg:pl-6 lg:px-6 gap-3 lg:gap-4 shrink-0 relative z-[100]">
      {/* Breadcrumb + Welcome */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground leading-none mb-1">Olá, {currentProfile.name}</p>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-foreground text-sm leading-none tracking-tight">{title}</h2>
            {subtitle && (
              <>
                <ChevronRight size={12} className="text-muted-foreground" />
                <p className="text-muted-foreground text-xs">{subtitle}</p>
              </>
            )}
          </div>
        </div>
      </div>

      <TopActions />
    </header>
  );
}
