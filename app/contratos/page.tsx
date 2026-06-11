"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { useRole } from "@/lib/context/RoleContext";
import {
  FileText, Search, Filter, Upload, FileCheck2, Download, Loader2,
  CheckCircle, Clock, AlertTriangle, ChevronRight, ExternalLink, X,
} from "lucide-react";
import { SERVICE_LABELS } from "@/lib/contracts/types";

interface Row {
  id: string;
  client_id: string;
  version: number;
  service_type: string;
  monthly_value: number;
  start_date: string;
  end_date: string;
  duration_months: number;
  status: "draft" | "active" | "expired";
  signed_pdf_path: string | null;
  signed_at: string | null;
  signed_uploaded_by: string | null;
  signature_method: string | null;
  pdf_url: string | null;
  has_renewal: boolean | null;
  renewal_value: number | null;
  payment_day: number | null;
  created_at: string;
  clients: { name?: string; nome_fantasia?: string; cnpj?: string } | null;
}

interface Summary {
  total: number;
  signed: number;
  pending: number;
  active: number;
  expired: number;
}

type StatusFilter = "all" | "pending" | "signed" | "active" | "expired";
type ServiceFilter = "all" | "assessoria_trafego" | "assessoria_social" | "lone_growth" | "trafego_social_site";

function formatCurrency(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function ContratosGlobalPage() {
  const { role } = useRole();
  const isAdmin = role === "admin" || role === "manager";

  const [contracts, setContracts] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all");
  const [search, setSearch] = useState("");

  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadContractId = useRef<string | null>(null);

  const loadList = async () => {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (serviceFilter !== "all") params.set("serviceType", serviceFilter);
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", "200");
      const res = await fetch(`/api/contracts/list?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        setErr(data.error || "Falha ao carregar contratos");
        return;
      }
      const data = await res.json();
      setContracts(data.contracts ?? []);
      setSummary(data.summary ?? null);
    } catch {
      setErr("Falha de conexão");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, statusFilter, serviceFilter]);

  // Debounce search
  useEffect(() => {
    if (!isAdmin) return;
    const t = setTimeout(() => loadList(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleUpload = (contractId: string) => {
    pendingUploadContractId.current = contractId;
    fileInputRef.current?.click();
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const contractId = pendingUploadContractId.current;
    e.target.value = ""; // reset pra permitir mesmo arquivo de novo
    if (!file || !contractId) return;
    if (file.size > 20 * 1024 * 1024) {
      setErr("PDF muito grande. Máximo 20MB.");
      return;
    }
    setUploadingId(contractId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("contractId", contractId);
      fd.append("method", "d4sign_manual");
      const res = await fetch("/api/contracts/upload-signed", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Falha no upload" }));
        setErr(data.error || "Falha no upload");
        return;
      }
      await loadList();
    } catch {
      setErr("Falha de conexão no upload");
    } finally {
      setUploadingId(null);
      pendingUploadContractId.current = null;
    }
  };

  const handleViewSigned = async (signedPath: string) => {
    try {
      const res = await fetch("/api/storage/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: signedPath, download: false }),
      });
      if (!res.ok) { setErr("Não foi possível abrir o PDF"); return; }
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
    } catch { setErr("Falha ao abrir PDF"); }
  };

  const statusBadge = (c: Row): { label: string; cls: string; icon: typeof CheckCircle } => {
    if (c.signed_at) return { label: "Assinado", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: FileCheck2 };
    if (c.status === "expired") return { label: "Vencido", cls: "bg-red-500/10 text-red-400 border-red-500/20", icon: AlertTriangle };
    if (c.status === "active") return { label: "Ativo", cls: "bg-[#0d4af5]/10 text-[#0d4af5] border-[#0d4af5]/20", icon: CheckCircle };
    return { label: "Pendente", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: Clock };
  };

  const filteredContracts = useMemo(() => contracts, [contracts]);

  if (!isAdmin) {
    return (
      <div className="flex-1 min-w-0 overflow-auto">
        <Header title="Contratos" />
        <div className="p-6"><p className="text-sm text-muted-foreground">Esta página é restrita a administradores.</p></div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 overflow-auto">
      <Header title="Contratos" />
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileText size={22} className="text-[#0d4af5]" />
              Contratos
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Todos os contratos da base. Upload do PDF assinado fecha o ciclo.</p>
          </div>
        </div>

        {/* Summary cards — apenas contagens; valores agregados (MRR/ARR/LTV) não existem no sistema por regra do CEO */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="Total" value={summary.total} color="text-foreground" />
            <SummaryCard label="Assinados" value={summary.signed} color="text-emerald-400" />
            <SummaryCard label="Pendentes" value={summary.pending} color="text-amber-400" />
            <SummaryCard label="Vencidos" value={summary.expired} color="text-red-400" />
          </div>
        )}

        {/* Filters */}
        <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou CNPJ..."
              className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <Filter size={12} className="text-zinc-500" />
            <span className="text-zinc-500">Status:</span>
            {(["all", "pending", "signed", "active", "expired"] as StatusFilter[]).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded border text-xs transition-all ${statusFilter === s ? "border-[#0d4af5]/50 bg-[#0d4af5]/10 text-[#0d4af5]" : "border-border text-zinc-500 hover:text-foreground"}`}>
                {s === "all" ? "Tudo" : s === "pending" ? "Pendentes" : s === "signed" ? "Assinados" : s === "active" ? "Ativos" : "Vencidos"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-zinc-500">Serviço:</span>
            {(["all", "assessoria_trafego", "assessoria_social", "lone_growth", "trafego_social_site"] as ServiceFilter[]).map((s) => (
              <button key={s} onClick={() => setServiceFilter(s)}
                className={`px-2.5 py-1 rounded border text-xs transition-all ${serviceFilter === s ? "border-[#0d4af5]/50 bg-[#0d4af5]/10 text-[#0d4af5]" : "border-border text-zinc-500 hover:text-foreground"}`}>
                {s === "all" ? "Tudo" : s === "trafego_social_site" ? "Site" : SERVICE_LABELS[s]?.split(" ")[0] ?? s}
              </button>
            ))}
          </div>
        </div>

        {err && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 flex items-start gap-2">
            <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-400 flex-1">{err}</p>
            <button onClick={() => setErr("")} className="text-red-400/50 hover:text-red-400"><X size={12} /></button>
          </div>
        )}

        {/* Table / list */}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={20} className="text-[#0d4af5] animate-spin" /></div>
        ) : filteredContracts.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <FileText size={32} className="text-zinc-700 mx-auto" />
            <p className="text-sm text-muted-foreground">Nenhum contrato encontrado com esses filtros.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Serviço</th>
                    <th className="px-4 py-3 font-medium">Valor/mês</th>
                    <th className="px-4 py-3 font-medium">Vigência</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredContracts.map((c) => {
                    const badge = statusBadge(c);
                    const Icon = badge.icon;
                    const clientName = c.clients?.nome_fantasia || c.clients?.name || "(sem nome)";
                    return (
                      <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/clients/${c.client_id}`} className="text-foreground hover:text-[#0d4af5] font-medium flex items-center gap-1 group">
                            {clientName}
                            <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                          <p className="text-[10px] text-zinc-500 mt-0.5">V{c.version} · {c.clients?.cnpj || "sem CNPJ"}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-400">{SERVICE_LABELS[c.service_type] ?? c.service_type}</td>
                        <td className="px-4 py-3 text-[#0d4af5] font-semibold text-xs">
                          {Number(c.monthly_value) > 0 ? formatCurrency(Number(c.monthly_value)) : <span className="text-zinc-600 font-normal">— ver PDF</span>}
                        </td>
                        <td className="px-4 py-3 text-[10px] text-zinc-400">
                          <div>{formatDate(c.start_date)} → {formatDate(c.end_date)}</div>
                          <div className="text-zinc-600">{c.duration_months}m · pgto dia {c.payment_day ?? 10}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border ${badge.cls}`}>
                            <Icon size={10} />
                            {badge.label}
                          </span>
                          {c.signed_at && (
                            <p className="text-[10px] text-zinc-600 mt-0.5">em {formatDate(c.signed_at)}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 justify-end">
                            {c.pdf_url && (
                              <a href={c.pdf_url} target="_blank" rel="noopener noreferrer"
                                className="p-1.5 rounded hover:bg-muted text-zinc-500 hover:text-foreground" title="Ver PDF preliminar">
                                <Download size={13} />
                              </a>
                            )}
                            {c.signed_pdf_path ? (
                              <button onClick={() => handleViewSigned(c.signed_pdf_path!)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#0d4af5]/10 text-[#0d4af5] text-[10px] hover:bg-[#0d4af5]/20 border border-[#0d4af5]/20">
                                <FileCheck2 size={10} /> Ver Assinado
                              </button>
                            ) : (
                              <button onClick={() => handleUpload(c.id)} disabled={uploadingId === c.id}
                                className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 text-[10px] hover:bg-emerald-500/20 border border-emerald-500/20 disabled:opacity-50">
                                {uploadingId === c.id ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
                                {uploadingId === c.id ? "Enviando" : "Upload"}
                              </button>
                            )}
                            <Link href={`/clients/${c.client_id}?tab=contratos`} className="p-1.5 rounded hover:bg-muted text-zinc-500 hover:text-foreground" title="Abrir aba de contratos do cliente">
                              <ExternalLink size={12} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Hidden file input reused pra todos os uploads */}
        <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFileSelected} />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">{label}</p>
      <p className={`${color} font-bold mt-1 text-2xl`}>{value}</p>
    </div>
  );
}
