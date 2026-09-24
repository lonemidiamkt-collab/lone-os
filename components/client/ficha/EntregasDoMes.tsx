"use client";

// components/client/ficha/EntregasDoMes.tsx — "O QUE ENTREGAMOS NO MÊS" (Leva 7C, N21). O resumo se
// monta sozinho (GET /api/clients/[id]/entregas-do-mes): posts reais, artes, anúncios contra a meta,
// reuniões e criativos vencedores. O CS baixa o PDF, revisa o RASCUNHO e manda ele mesmo — nada sai
// daqui para o cliente.

import { useEffect, useMemo, useState } from "react";
import { Copy, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { chamar } from "@/lib/api/chamar";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { todaySP } from "@/lib/utils";
import { brl, fraseMeta, rotuloMes, type ResumoEntregasMes } from "@/lib/clientes/entregas-do-mes";
import { Vazio } from "./Secao";
import { dataCurta } from "./rotulos";

interface Resposta { resumo: ResumoEntregasMes; rascunho: string | null }

function ultimosMeses(hoje: string, n: number): string[] {
  const [a, m] = hoje.slice(0, 7).split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

function Numero({ valor, rotulo, sub }: { valor: string; rotulo: string; sub?: string | null }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <p className="text-lone-h2 tabular-nums text-foreground">{valor}</p>
      <p className="text-lone-caption text-muted-foreground">{rotulo}</p>
      {sub && <p className="mt-0.5 text-lone-caption text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function EntregasDoMes({ clientId, nomeArquivo }: { clientId: string; nomeArquivo: string }) {
  const hoje = todaySP();
  const meses = useMemo(() => ultimosMeses(hoje, 6), [hoje]);
  // No começo do mês o que interessa é fechar o mês passado.
  const [mes, setMes] = useState(() => (Number(hoje.slice(8, 10)) <= 10 ? meses[1] : meses[0]));
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setDados(null); setErro(null);
    chamar<Resposta>(`/api/clients/${clientId}/entregas-do-mes?mes=${mes}`).then((r) => {
      if (!vivo) return;
      if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui montar o resumo."); return; }
      setDados(r.data);
      setTexto(r.data.rascunho ?? "");
    });
    return () => { vivo = false; };
  }, [clientId, mes]);

  const baixar = async () => {
    setBaixando(true);
    try {
      const res = await authedFetch(`/api/clients/${clientId}/entregas-do-mes?mes=${mes}&formato=pdf`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `erro ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `entregas-${mes}-${nomeArquivo}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(`Não consegui gerar o PDF: ${e instanceof Error ? e.message : "erro"}`);
    } finally { setBaixando(false); }
  };

  const copiar = () => {
    navigator.clipboard?.writeText(texto).then(() => toast.success("Rascunho copiado. Revise e mande no grupo do cliente."), () => toast.error("Não consegui copiar."));
  };

  const r = dados?.resumo;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-lone-caption text-muted-foreground">
          Mês
          <select value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês do resumo"
            className="h-8 rounded-lg border border-input bg-card px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring">
            {meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}{m === meses[0] ? " (em curso)" : ""}</option>)}
          </select>
        </label>
        <button onClick={baixar} disabled={baixando || !r?.temConteudo}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
          {baixando ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Download size={13} aria-hidden="true" />} Baixar PDF
        </button>
      </div>

      {erro && <Vazio>{erro}</Vazio>}
      {!r && !erro && <div className="h-28 animate-pulse rounded-lg bg-muted" />}

      {r && !r.temConteudo && <Vazio>Nada registrado em {r.mesRotulo} para montar o resumo.</Vazio>}
      {r && r.temConteudo && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {r.conteudo && r.conteudo.posts > 0 && (
            <Numero valor={String(r.conteudo.posts)} rotulo={r.conteudo.posts === 1 ? "post no ar" : "posts no ar"}
              sub={r.conteudo.reels ? `${r.conteudo.reels} em Reels` : r.conteudo.fonte === "board" ? "pelo quadro" : "no Instagram"} />
          )}
          {r.conteudo && r.conteudo.artes > 0 && <Numero valor={String(r.conteudo.artes)} rotulo={r.conteudo.artes === 1 ? "arte produzida" : "artes produzidas"} />}
          {r.anuncios && <Numero valor={r.anuncios.conversas.toLocaleString("pt-BR")} rotulo="conversas pelos anúncios" sub={`${brl(r.anuncios.gasto)} investidos`} />}
          {r.anuncios?.cpl != null && <Numero valor={brl(r.anuncios.cpl)} rotulo="por conversa" sub={fraseMeta(r.anuncios)} />}
          {r.reunioes.length > 0 && (
            <Numero valor={String(r.reunioes.length)} rotulo={r.reunioes.length === 1 ? "reunião" : "reuniões"} sub={r.reunioes.map((x) => dataCurta(x.em)).join(", ")} />
          )}
        </div>
      )}
      {r && r.vencedores.length > 0 && (
        <p className="text-lone-caption text-muted-foreground">
          Criativos vencedores: <span className="text-foreground">{r.vencedores.map((v) => v.nome).join(" · ")}</span>
        </p>
      )}
      {r && r.lacunas.length > 0 && (
        <ul className="space-y-0.5">
          {r.lacunas.map((l) => <li key={l} className="text-lone-caption text-lone-warning">{l}</li>)}
        </ul>
      )}

      {r?.temConteudo && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-lone-caption text-muted-foreground">Rascunho para o WhatsApp — revise antes de mandar.</p>
            <button onClick={copiar} disabled={!texto.trim()}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-foreground transition-colors hover:bg-accent disabled:opacity-40">
              <Copy size={11} aria-hidden="true" /> Copiar
            </button>
          </div>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={10} aria-label="Rascunho da mensagem ao cliente"
            className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground outline-none focus:ring-1 focus:ring-ring" />
        </div>
      )}
    </div>
  );
}
