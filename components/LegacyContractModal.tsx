"use client";

import { useState, useRef, useMemo } from "react";
import {
  X, Upload, Loader2, AlertTriangle, FileCheck2, Calendar, Clock, FileText,
} from "lucide-react";

interface Props {
  clientId: string;
  clientName: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void; // chamado após upload OK pra recarregar lista
}

const SERVICE_OPTIONS = [
  { value: "assessoria_trafego", label: "Assessoria de Tráfego" },
  { value: "assessoria_social", label: "Assessoria Social Media" },
  { value: "lone_growth", label: "Lone Growth" },
] as const;

const METHOD_OPTIONS = [
  { value: "legado", label: "Importação manual (legado)" },
  { value: "d4sign_externo", label: "D4Sign (assinado fora do sistema)" },
  { value: "papel", label: "Papel / físico" },
  { value: "outros", label: "Outros" },
];

function addMonthsIso(iso: string, months: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export default function LegacyContractModal({ clientId, clientName, open, onClose, onSuccess }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [serviceType, setServiceType] = useState<string>("lone_growth");
  const [startDate, setStartDate] = useState<string>(today);
  const [durationMonths, setDurationMonths] = useState<number>(6);
  const [paymentDay, setPaymentDay] = useState<number>(10);
  const [signedAt, setSignedAt] = useState<string>(today);
  const [signatureMethod, setSignatureMethod] = useState<string>("legado");
  const [notes, setNotes] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const endDate = useMemo(() => addMonthsIso(startDate, durationMonths), [startDate, durationMonths]);

  const reset = () => {
    setServiceType("lone_growth");
    setStartDate(today);
    setDurationMonths(6);
    setPaymentDay(10);
    setSignedAt(today);
    setSignatureMethod("legado");
    setNotes("");
    setFile(null);
    setErr("");
    setOk("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = () => {
    if (uploading) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setErr("");
    if (!file) { setErr("Selecione o PDF do contrato assinado."); return; }
    if (file.size > 20 * 1024 * 1024) { setErr("PDF muito grande (máx 20MB)."); return; }
    if (!startDate || !signedAt) { setErr("Datas obrigatórias."); return; }
    if (durationMonths < 1 || durationMonths > 60) { setErr("Duração entre 1 e 60 meses."); return; }
    if (paymentDay < 1 || paymentDay > 31) { setErr("Dia de pagamento entre 1 e 31."); return; }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("clientId", clientId);
      fd.append("serviceType", serviceType);
      fd.append("startDate", startDate);
      fd.append("durationMonths", String(durationMonths));
      fd.append("paymentDay", String(paymentDay));
      fd.append("signedAt", signedAt);
      fd.append("signatureMethod", signatureMethod);
      if (notes.trim()) fd.append("notes", notes.trim());

      const res = await fetch("/api/contracts/upload-legacy", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Falha no upload" }));
        setErr(data.error || "Falha no upload");
        return;
      }
      const data = await res.json();
      setOk(`Contrato V${data.version} importado. Vigência até ${data.endDate}.`);
      onSuccess();
      // Auto-fecha após 1.5s
      setTimeout(() => { handleClose(); }, 1500);
    } catch {
      setErr("Falha de conexão");
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-auto animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <FileCheck2 size={18} className="text-[#0d4af5]" />
            <div>
              <h3 className="text-foreground font-semibold text-sm">Anexar contrato existente</h3>
              <p className="text-[11px] text-muted-foreground">{clientName}</p>
            </div>
          </div>
          <button onClick={handleClose} disabled={uploading} className="text-muted-foreground hover:text-foreground disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="rounded-lg bg-[#0d4af5]/5 border border-[#0d4af5]/20 p-3">
            <p className="text-[11px] text-foreground leading-relaxed">
              Use isso pra contratos <strong>já assinados fora do sistema</strong> (papel, D4Sign feito antes, herdado de outra agência).
              O sistema não vai gerar PDF — você anexa o que já tem. Vai entrar como contrato <strong>ativo</strong> imediatamente.
            </p>
          </div>

          {/* Tipo de serviço */}
          <Field label="Tipo de serviço" icon={<FileText size={12} />}>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50"
            >
              {SERVICE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>

          {/* Datas + duração */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data de início" icon={<Calendar size={12} />}>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50" />
            </Field>
            <Field label="Duração (meses)" icon={<Clock size={12} />}>
              <input type="number" min={1} max={60} value={durationMonths} onChange={(e) => setDurationMonths(parseInt(e.target.value || "0", 10))}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50" />
            </Field>
          </div>

          {endDate && (
            <p className="text-[11px] text-muted-foreground -mt-2">
              Vigência calculada: <span className="text-foreground font-medium">{startDate}</span> → <span className="text-foreground font-medium">{endDate}</span>
            </p>
          )}

          {/* Dia de pagamento (valor mensal não é capturado — fica no PDF) */}
          <Field label="Dia de pagamento" icon={<Calendar size={12} />}>
            <input type="number" min={1} max={31} value={paymentDay} onChange={(e) => setPaymentDay(parseInt(e.target.value || "10", 10))}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50" />
          </Field>

          {/* Data de assinatura + método */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data de assinatura" icon={<Calendar size={12} />}>
              <input type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50" />
            </Field>
            <Field label="Método de assinatura">
              <select value={signatureMethod} onChange={(e) => setSignatureMethod(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50">
                {METHOD_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
          </div>

          {/* Observações */}
          <Field label="Observações (opcional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: contrato originalmente fechado em papel via Pedro em mar/2026"
              rows={2}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50 resize-none"
            />
          </Field>

          {/* PDF */}
          <Field label="PDF assinado">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-border file:bg-muted file:text-foreground file:text-xs file:cursor-pointer hover:file:bg-muted/80"
            />
            {file && <p className="text-[11px] text-emerald-400 mt-1">{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>}
          </Field>

          {err && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2.5">
              <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-400">{err}</p>
            </div>
          )}
          {ok && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5">
              <FileCheck2 size={12} className="text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-xs text-emerald-400">{ok}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-5 border-t border-border sticky bottom-0 bg-card">
          <button onClick={handleClose} disabled={uploading}
            className="px-4 py-2 rounded-lg border border-border text-xs text-foreground hover:bg-muted transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={uploading || !file}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0d4af5] hover:bg-[#0d4af5]/80 text-white text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {uploading ? "Importando..." : "Importar contrato"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}
