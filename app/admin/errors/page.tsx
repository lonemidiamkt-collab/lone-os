"use client";

import { useRole } from "@/lib/context/RoleContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ExternalLink, AlertTriangle, Tag, BookOpen } from "lucide-react";

const SENTRY_ORG = "lone-midia";
const SENTRY_PROJECT = "lone-os-portal";
const SENTRY_BASE = `https://sentry.io/organizations/${SENTRY_ORG}/issues`;

const QUICK_LINKS = [
  {
    label: "Todos os erros",
    url: `${SENTRY_BASE}/?project=${SENTRY_PROJECT}`,
    desc: "Issues abertas nos últimos 14 dias",
  },
  {
    label: "Erros da Meta API",
    url: `${SENTRY_BASE}/?project=${SENTRY_PROJECT}&query=meta_api_call%3Atrue`,
    desc: "tag: meta_api_call:true",
  },
  {
    label: "Erros do Portal",
    url: `${SENTRY_BASE}/?project=${SENTRY_PROJECT}&query=portal_endpoint%3Atrue`,
    desc: "tag: portal_endpoint:true",
  },
  {
    label: "Erros de cron",
    url: `${SENTRY_BASE}/?project=${SENTRY_PROJECT}&query=cron_endpoint%3Atrue`,
    desc: "tag: cron_endpoint:true — generate-snapshots, defense-scan",
  },
];

export default function AdminErrorsPage() {
  const { role } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (role !== "admin" && role !== "manager") router.replace("/");
  }, [role, router]);

  if (role !== "admin" && role !== "manager") return null;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <AlertTriangle size={20} className="text-yellow-500" />
        <h1 className="text-xl font-bold">Monitoramento de Erros — Sentry</h1>
      </div>

      <div className="grid gap-3">
        {QUICK_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start justify-between gap-4 p-4 rounded-xl border hover:opacity-80 transition-opacity"
            style={{ background: "#16161D", borderColor: "#1E1E2A" }}
          >
            <div>
              <p className="font-semibold text-sm text-white">{link.label}</p>
              <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>{link.desc}</p>
            </div>
            <ExternalLink size={14} className="shrink-0 mt-0.5" style={{ color: "#6B7280" }} />
          </a>
        ))}
      </div>

      <div className="rounded-xl border p-4 space-y-2" style={{ background: "#16161D", borderColor: "#1E1E2A" }}>
        <div className="flex items-center gap-2 mb-3">
          <Tag size={14} style={{ color: "#0d4af5" }} />
          <p className="text-sm font-semibold">Tags disponíveis para filtrar</p>
        </div>
        {[
          { tag: "meta_api_call:true", desc: "Qualquer erro em chamada à Meta Graph API" },
          { tag: "portal_endpoint:true", desc: "Erros em /api/portal/* ou geração de snapshot" },
          { tag: "cron_endpoint:true", desc: "Erros em /api/system/generate-snapshots" },
        ].map(({ tag, desc }) => (
          <div key={tag} className="flex items-start gap-3">
            <code className="text-xs px-2 py-0.5 rounded shrink-0" style={{ background: "#0f0f1a", color: "#0d4af5" }}>{tag}</code>
            <p className="text-xs" style={{ color: "#9CA3AF" }}>{desc}</p>
          </div>
        ))}
      </div>

      <a
        href={`/docs/SENTRY.md`}
        className="flex items-center gap-2 text-xs"
        style={{ color: "#6B7280" }}
      >
        <BookOpen size={12} />
        Documentação completa em docs/SENTRY.md
      </a>
    </div>
  );
}
