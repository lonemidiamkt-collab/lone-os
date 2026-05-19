"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface DashboardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  userName?: string;
  dateLabel?: string;
}

const DashboardHeader = React.forwardRef<HTMLDivElement, DashboardHeaderProps>(
  ({ title, subtitle, eyebrow, userName, dateLabel, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex items-end justify-between gap-4 flex-wrap", className)}
        {...props}
      >
        <div>
          {eyebrow && (
            <p className="text-lone-eyebrow text-lone-text-tertiary mb-1 tracking-[1.5px] font-inter">
              {eyebrow}
            </p>
          )}
          <h1 className="text-lone-h1 font-inter font-medium text-lone-text-primary leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-lone-body font-inter text-lone-text-secondary mt-0.5">
              {subtitle}
            </p>
          )}
        </div>

        {(userName || dateLabel) && (
          <div className="text-right shrink-0">
            {userName && (
              <p className="text-lone-body font-inter font-medium text-lone-text-primary">
                {userName}
              </p>
            )}
            {dateLabel && (
              <p className="text-lone-caption font-inter text-lone-text-tertiary mt-0.5">
                {dateLabel}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
);

DashboardHeader.displayName = "DashboardV2.DashboardHeader";

export default DashboardHeader;
