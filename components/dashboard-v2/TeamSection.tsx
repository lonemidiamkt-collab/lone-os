"use client";

import React from "react";
import { Camera, TrendingUp, Plus } from "lucide-react";
import { TeamMemberRow } from "@/components/lone-ui";
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
              <Camera size={14} className="text-lone-brand shrink-0" aria-hidden="true" />
              <span className="text-lone-body font-inter font-semibold text-lone-text-primary">
                Equipe Social
              </span>
            </div>
            <span className="text-lone-caption font-inter text-lone-text-tertiary">
              {totalPublished} publicados · {totalPipeline} pipeline
            </span>
          </div>

          <div className="px-4">
            {socialTeam.map((member, i) => (
              <TeamMemberRow
                key={member.name}
                name={member.name}
                role={`${member.clientCount} clientes`}
                initials={initials(member.name)}
                metric={{
                  value: `${member.inPipeline} / ${member.published + member.inPipeline}`,
                  label: "pipeline",
                  tone: "default",
                }}
                last={i === socialTeam.length - 1}
              />
            ))}
            {socialTeam.length === 0 && (
              <p className="text-lone-caption font-inter text-lone-text-disabled text-center py-4">
                Nenhum membro
              </p>
            )}
          </div>

          <div className="flex items-center justify-between px-4 py-2.5 border-t border-lone-border">
            <span className="text-lone-caption font-inter italic text-lone-text-disabled">
              Adicionar membro
            </span>
            <Plus size={13} className="text-lone-text-disabled" aria-hidden="true" />
          </div>
        </div>

        {/* Equipe Tráfego */}
        <div className="rounded-xl border border-lone-border bg-lone-bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-lone-border">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-lone-brand shrink-0" aria-hidden="true" />
              <span className="text-lone-body font-inter font-semibold text-lone-text-primary">
                Equipe Tráfego
              </span>
            </div>
            <span className="text-lone-caption font-inter text-lone-text-tertiary">
              {totalSupDone}/{totalSupTotal} atendidos hoje
            </span>
          </div>

          <div className="px-4">
            {trafficTeam.map((member, i) => (
              <TeamMemberRow
                key={member.name}
                name={member.name}
                role={`${member.clientCount} clientes`}
                initials={initials(member.name)}
                metric={{
                  value: `${member.supportDone} / ${member.supportTotal}`,
                  label: "suporte",
                  tone: member.supportDone < member.supportTotal ? "warning" : "default",
                }}
                last={i === trafficTeam.length - 1}
              />
            ))}
            {trafficTeam.length === 0 && (
              <p className="text-lone-caption font-inter text-lone-text-disabled text-center py-4">
                Nenhum membro
              </p>
            )}
          </div>

          <div className="flex items-center justify-between px-4 py-2.5 border-t border-lone-border">
            <span className="text-lone-caption font-inter italic text-lone-text-disabled">
              Adicionar membro
            </span>
            <Plus size={13} className="text-lone-text-disabled" aria-hidden="true" />
          </div>
        </div>

      </div>
    );
  }
);

TeamSection.displayName = "DashboardV2.TeamSection";

export default TeamSection;
