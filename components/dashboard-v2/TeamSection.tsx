"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface SocialMember {
  name: string;
  clientCount: number;
  published: number;
  inPipeline: number;
}

export interface TrafficMember {
  name: string;
  clientCount: number;
  supportDone: number;
  supportTotal: number;
}

export interface TeamSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  socialTeam: SocialMember[];
  trafficTeam: TrafficMember[];
}

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

const TeamSection = React.forwardRef<HTMLDivElement, TeamSectionProps>(
  ({ socialTeam, trafficTeam, className, ...props }, ref) => {
    const totalPublished = socialTeam.reduce((s, m) => s + m.published, 0);
    const totalPipeline  = socialTeam.reduce((s, m) => s + m.inPipeline, 0);
    const totalSupDone   = trafficTeam.reduce((s, m) => s + m.supportDone, 0);
    const totalSupTotal  = trafficTeam.reduce((s, m) => s + m.supportTotal, 0);

    return (
      <div ref={ref} className={cn("grid grid-cols-1 xl:grid-cols-2 gap-4", className)} {...props}>

        {/* Equipe Social */}
        <div className="rounded-xl border border-lone-border bg-lone-bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-lone-border">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border border-lone-brand/40 bg-lone-brand/10 shrink-0" aria-hidden="true" />
              <span className="text-lone-body font-inter font-semibold text-lone-text-primary">Equipe Social</span>
            </div>
            <span className="text-lone-caption font-inter text-lone-text-tertiary">
              {totalPublished} publicados · {totalPipeline} pipeline
            </span>
          </div>

          {socialTeam.map((member, i) => (
            <div
              key={member.name}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                i < socialTeam.length - 1 && "border-b border-lone-border"
              )}
            >
              <div className="w-9 h-9 rounded-full bg-lone-bg-elevated flex items-center justify-center shrink-0">
                <span className="text-lone-caption font-inter font-bold text-lone-text-secondary">
                  {initials(member.name)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lone-body font-inter font-medium text-lone-text-primary">{member.name}</p>
                <p className="text-lone-caption font-inter text-lone-text-tertiary">{member.clientCount} clientes</p>
              </div>
              <span className={cn(
                "text-lone-body font-inter font-medium tabular-nums shrink-0",
                member.inPipeline > 0 ? "text-lone-brand" : "text-lone-text-tertiary"
              )}>
                {member.inPipeline} / {member.published + member.inPipeline} pipeline
              </span>
            </div>
          ))}

          <div className="flex items-center justify-between px-4 py-3 border-t border-lone-border">
            <span className="text-lone-caption font-inter italic text-lone-text-disabled">Adicionar membro</span>
            <div className="w-4 h-4 rounded border border-lone-border/60" aria-hidden="true" />
          </div>
        </div>

        {/* Equipe Tráfego */}
        <div className="rounded-xl border border-lone-border bg-lone-bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-lone-border">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border border-lone-brand/40 bg-lone-brand/10 shrink-0" aria-hidden="true" />
              <span className="text-lone-body font-inter font-semibold text-lone-text-primary">Equipe Tráfego</span>
            </div>
            <span className="text-lone-caption font-inter text-lone-text-tertiary">
              {totalSupDone}/{totalSupTotal} atendidos hoje
            </span>
          </div>

          {trafficTeam.map((member, i) => (
            <div
              key={member.name}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                i < trafficTeam.length - 1 && "border-b border-lone-border"
              )}
            >
              <div className="w-9 h-9 rounded-full bg-lone-bg-elevated flex items-center justify-center shrink-0">
                <span className="text-lone-caption font-inter font-bold text-lone-text-secondary">
                  {initials(member.name)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lone-body font-inter font-medium text-lone-text-primary">{member.name}</p>
                <p className="text-lone-caption font-inter text-lone-text-tertiary">{member.clientCount} clientes</p>
              </div>
              <span className={cn(
                "text-lone-body font-inter font-medium tabular-nums shrink-0",
                member.supportDone < member.supportTotal
                  ? "text-[var(--lone-warning)]"
                  : "text-lone-text-tertiary"
              )}>
                {member.supportDone} / {member.supportTotal} suporte
              </span>
            </div>
          ))}

          <div className="flex items-center justify-between px-4 py-3 border-t border-lone-border">
            <span className="text-lone-caption font-inter italic text-lone-text-disabled">Adicionar membro</span>
            <div className="w-4 h-4 rounded border border-lone-border/60" aria-hidden="true" />
          </div>
        </div>

      </div>
    );
  }
);

TeamSection.displayName = "DashboardV2.TeamSection";

export default TeamSection;
