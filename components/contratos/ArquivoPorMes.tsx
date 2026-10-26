"use client";

// components/contratos/ArquivoPorMes.tsx — os contratos assinados de cada mês, para ver e baixar.
// Roberto, 26/10/2026: "deveria ter uma área de arquivos para vermos contratos de cada mês, e podermos
// baixar eles também". Fonte: lib/contracts/arquivo-d4sign.ts (D4Sign + PDFs subidos no Lone OS).

import Link from "next/link";
import { useEffect, useState } from "react";
import { Archive, Download, FileDown, Loader2, AlertTriangle, CloudDownload } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { nomeDoMes } from "@/lib/contracts/arquivo-mes";
import type { ItemArquivo } from "@/lib/contracts/arquivo-d4sign";

interface Resposta { meses: { mes: string; total: number; comPdf: number }[]; mes: string | null; itens: ItemArquivo[] }

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default function ArquivoPorMes() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [mes, setMes] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = async (m: string | null) => {
    setCarregando(true);
    const r = await chamar<Resposta>(`/api/contracts/arquivo${m ? `?mes=${m}` : ""}`);
    setCarregando(false);
    if (r.status === 403) { setDados(null); return; }
    if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui abrir o arquivo de contratos."); return; }
    setErro(null);
    setDados(r.data);
    setMes(r.data.mes);
  };

  useEffect(() => { void carregar(null); }, []);

  const abrirPdf = async (ref: string, id: string) => {
    setOcupado(id);
    const r = await chamar<{ url: string }>("/api/storage/signed-url", { path: ref, download: true });
    setOcupado(null);
    if (!r.ok || !r.data?.url) { setErro(r.erro ?? "Não consegui gerar o link do PDF."); return; }
    window.open(r.data.url, "_blank", "noopener,noreferrer");
  };

  const trazerAgora = async (item: ItemArquivo) => {
    setOcupado(item.id);
    setErro(null);
    const r = await chamar<{ pdf: string }>("/api/contracts/arquivo/baixar", { uuid: item.id });
    setOcupado(null);
    if (!r.ok || !r.data?.pdf) { setErro(r.erro ?? "Não consegui trazer o PDF da D4Sign."); return; }
    await carregar(mes);
  };

  const baixarMes = async () => {
    if (!mes) return;
    setOcupado("zip");
    setErro(null);
    try {
      const res = await authedFetch(`/api/contracts/arquivo/zip?mes=${mes}`);
      if (!res.ok) {
        const corpo = await res.text().catch(() => "");
        let msg = `Não consegui montar o .zip (erro ${res.status}).`;
        try { msg = (JSON.parse(corpo) as { error?: string }).error ?? msg; } catch { /* corpo não-JSON (502 do nginx) */ }
        setErro(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contratos-${mes}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setErro("Sem conexão com o servidor. Tenta de novo?");
    } finally {
      setOcupado(null);
    }
  };

  if (!dados && !erro && !carregando) return null; // não é admin
  const doMes = dados?.meses.find((m) => m.mes === mes);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <Archive size={14} className="text-primary" /> Arquivo por mês
        </p>
        {doMes && doMes.comPdf > 0 && (
          <button onClick={baixarMes} disabled={ocupado === "zip"}
            className="flex items-center gap-1 px-2.5 py-1 rounded border border-primary/30 text-primary text-xs hover:bg-primary/10 disabled:opacity-50">
            {ocupado === "zip" ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
            Baixar {nomeDoMes(doMes.mes)} (.zip, {doMes.comPdf} PDF{doMes.comPdf === 1 ? "" : "s"})
          </button>
        )}
      </div>

      {dados && dados.meses.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {dados.meses.map((m) => (
            <button key={m.mes} onClick={() => void carregar(m.mes)}
              className={`px-2.5 py-1 rounded border text-xs transition-all ${m.mes === mes ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {nomeDoMes(m.mes)} · {m.total}
            </button>
          ))}
        </div>
      )}

      {erro && (
        <p className="text-xs text-lone-danger flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{erro}</p>
      )}

      {carregando ? (
        <div className="flex justify-center py-6"><Loader2 size={16} className="text-primary animate-spin" /></div>
      ) : !dados?.itens.length ? (
        <p className="text-xs text-muted-foreground">
          Nenhum contrato assinado no arquivo ainda. Os PDFs assinados na D4Sign chegam de madrugada, alguns por noite
          (a D4Sign responde a 10 chamadas por hora); os subidos aqui entram na hora.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {dados.itens.map((i) => (
            <div key={i.id} className="py-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground w-20 shrink-0">{dataCurta(i.assinadoEm)}</span>
              <div className="flex-1 min-w-[180px]">
                {i.clientId
                  ? <Link href={`/clients/${i.clientId}?tab=contratos`} className="text-foreground hover:text-primary font-medium">{i.cliente}</Link>
                  : <span className="text-foreground font-medium">{i.cliente}</span>}
                <p className="text-[10px] text-muted-foreground truncate">
                  {i.documento.replace(/\.(docx?|pdf)$/i, "")}{i.origem === "lone" ? " · subido no Lone OS" : " · D4Sign"}
                </p>
              </div>
              {i.pdf ? (
                <button onClick={() => void abrirPdf(i.pdf!, i.id)} disabled={ocupado === i.id}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-primary/10 text-primary text-[10px] hover:bg-primary/20 border border-primary/20 disabled:opacity-50">
                  {ocupado === i.id ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />} Baixar PDF
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground" title={i.pdfErro ?? undefined}>
                    {i.pdfErro ? "PDF não veio da D4Sign" : "PDF chega de madrugada"}
                  </span>
                  <button onClick={() => void trazerAgora(i)} disabled={ocupado === i.id}
                    className="flex items-center gap-1 px-2 py-1 rounded border border-border text-muted-foreground text-[10px] hover:text-foreground disabled:opacity-50"
                    title="Busca agora na D4Sign (gasta 1 das 10 chamadas da hora)">
                    {ocupado === i.id ? <Loader2 size={10} className="animate-spin" /> : <CloudDownload size={10} />} Trazer agora
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
