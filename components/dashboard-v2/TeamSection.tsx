"use client";

import React from "react";
import { Instagram, TrendingUp } from "lucide-react";
import { TeamMemberRow, SectionDivider } from "@/components/lone-ui";
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
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function metricTone(
  done: number,
  total: number
): "default" | "warning" | "danger" {
  if (total === 0) return "default";
  const pct = done / total;
  if (pct >= 1) return "default";
  if (pct >= 0.5) return "default";
  if (pct >= 0.25) return "warning";
  return "danger";
}

const TeamSection = React.forwardRef<HTMLDivElement, TeamSectionProps>(
  ({ socialTeam, trafficTeam, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("grid grid-cols-1 xl:grid-cols-2 gap-4", className)}
        {...props}
      >
        {/* Social Team */}
        <div className="rounded-xl border border-lone-border bg-lone-bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Instagram size={13} className="text-lone-text-tertiary shrink-0" aria-hidden="true" />
            <SectionDivider
              label="Equipe Social"
              badge={`${socialTeam.length} membro${socialTeam.length !== 1 ? "s" : ""}`}
              className="flex-1"
            />
          </div>
          <div className="rounded-xl border border-lone-border bg-lone-bg-elevated mt-3">
            {socialTeam.map((member, i) => (
              <TeamMemberRow
                key={member.name}
                name={member.name}
                role={`${member.clientCount} cliente${member.clientCount !== 1 ? "s" : ""}`}
                initials={initials(member.name)}
                metric={{
                  label: "publicados",
                  value: String(member.published),
                  tone: member.published >= 5 ? "default" : "warning",
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
        </div>

        {/* Traffic Team */}
        <div className="rounded-xl border border-lone-border bg-lone-bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={13} className="text-lone-text-tertiary shrink-0" aria-hidden="true" />
            <SectionDivider
              label="Equipe Tráfego"
              badge={`${trafficTeam.length} membro${trafficTeam.length !== 1 ? "s" : ""}`}
              className="flex-1"
            />
          </div>
          <div className="rounded-xl border border-lone-border bg-lone-bg-elevated mt-3">
            {trafficTeam.map((member, i) => (
              <TeamMemberRow
                key={member.name}
                name={member.name}
                role={`${member.clientCount} cliente${member.clientCount !== 1 ? "s" : ""}`}
                initials={initials(member.name)}
                metric={{
                  label: "suporte hoje",
                  value: `${member.supportDone}/${member.supportTotal}`,
                  tone: metricTone(member.supportDone, member.supportTotal),
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
        </div>
      </div>
    );
  }
);

TeamSection.displayName = "DashboardV2.TeamSection";

export default TeamSection;
