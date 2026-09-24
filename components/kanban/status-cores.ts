import type { ContentCard } from "@/lib/types";

// Uma cor por etapa: antes cinco status dividiam bg-muted e a bolinha não dizia nada.
export const STATUS_COR: Record<ContentCard["status"], string> = {
  ideas: "bg-muted-foreground",
  script: "bg-chart-4",
  in_production: "bg-primary",
  blocked: "bg-destructive",
  approval: "bg-lone-warning",
  client_approval: "bg-lone-info",
  scheduled: "bg-chart-2",
  published: "bg-lone-success",
};
