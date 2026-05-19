/**
 * Lone OS Design System v2 — barrel file
 *
 * Import dos novos componentes:
 *   import { KPICard, PillBadge } from '@/components/lone-ui'
 *
 * Componentes antigos (sistema existente) continuam em:
 *   import KPICard from '@/components/shared/KPICard'
 *   import { Badge } from '@/components/ui/badge'
 */

export { KPICard }        from "./KPICard";
export { SectionDivider } from "./SectionDivider";
export { TeamMemberRow }  from "./TeamMemberRow";
export { AlertBanner }    from "./AlertBanner";
export { PillBadge }      from "./PillBadge";

export type { KPICardProps }        from "./KPICard";
export type { SectionDividerProps } from "./SectionDivider";
export type { TeamMemberRowProps }  from "./TeamMemberRow";
export type { AlertBannerProps }    from "./AlertBanner";
export type { PillBadgeProps }      from "./PillBadge";
