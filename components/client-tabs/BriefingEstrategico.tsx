"use client";

// Enriquecedor de briefing (Trilha A). Admin gera o RASCUNHO estratégico por IA (junta toda a
// matéria-prima do cliente), REVISA/edita aqui, e salva como nova versão de client_briefings.
// Human-gated: nada grava sem o time aprovar.

import { useState } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { BriefingEstruturado } from "@/lib/cs/enriquecer-briefing";

const TEXTO_CURTO: [keyof BriefingEstruturado, string][] = [
  ["posicionamento", "Posicionamento (1 linha)"],
  ["crenca_atual", "Crença ATUAL do público"],
  ["crenca_desejada", "Crença DESEJADA (a virada)"],
  ["tom_voz", "Tom de voz"],
  ["pessoa_verbal", "Pessoa verbal"],
  ["contato", "Contato (endereço/telefone)"],
];
const TEXTO_LONGO: [keyof BriefingEstruturado, string][] = [
  ["resumo_estrategico", "Resumo estratégico"],
  ["observacoes_estrategicas", "Observações estratégicas"],
];
const LISTAS: [keyof BriefingEstruturado, string][] = [
  ["publico_alvo", "Público-alvo"], ["dores", "Dores (do cliente do cliente)"],
  ["desejos", "Desejos"], ["objecoes", "Objeções"],
  ["diferenciais", "Diferenciais"], ["angulos_concorrencia", "Ângulos vs. concorrência"],
  ["produtos", "Produtos/serviços"], ["produtos_destaque_atual", "Destaque atual"],
  ["ganchos", "Ganchos"], ["ctas", "CTAs"],
  ["palavras_proibidas", "Palavras proibidas"], ["concorrentes_evitar_mencionar", "Concorrentes a evitar"],
  ["hashtags_padrao", "Hashtags padrão"], ["campos_faltando", "⚠️ Falta coletar (o time preenche)"],
];

export default function BriefingEstrategico({ clientId }: { clientId: string }) {
  const [r, setR] = useState<BriefingEstruturado | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fontes, setFontes] = useState<Record<string, boolean> | null>(null);
  const [msg, setMsg] = useState("");
  const [material, setMaterial] = useState("");
  const [lendoPdf, setLendoPdf] = useState(false);
  const [avisoPdf, setAvisoPdf] = useState<string | null>(null);

  /**
   * PDF vira TEXTO e cai no mesmo campo do que é colado — daí pra frente o caminho é um só.
   * O social recebe tabela de preço e catálogo em PDF; antes ele redigitava à mão, ou não
   * redigitava, e o agente montava roteiro sem saber o que a loja vende.
   * Acrescenta ao que já está escrito em vez de substituir: dá pra juntar 2 PDFs + anotação.
   */
  const lerPdfs = async (arquivos: File[]) => {
    const pdfs = arquivos.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (!pdfs.length) return;
    setLendoPdf(true); setAvisoPdf(null);
    const partes: string[] = [];
    for (const f of pdfs) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        const res = await authedFetch("/api/cs/ler-pdf", { method: "POST", body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.texto) { setAvisoPdf(j?.error || `Não consegui ler "${f.name}".`); continue; }
        partes.push(`--- ${f.name} (${j.paginas} pág.) ---\n${j.texto}`);
        if (j.cortado) setAvisoPdf(`"${f.name}" é grande — usei o começo do documento.`);
      } catch {
        setAvisoPdf(`Falha de conexão ao ler "${f.name}".`);
      }
    }
    if (partes.length) setMaterial((m) => [m.trim(), ...partes].filter(Boolean).join("\n\n"));
    setLendoPdf(false);
  };

  const gerar = async () => {
    setLoading(true); setMsg("");
    try {
      const res = await authedFetch(`/api/cs/enriquecer-briefing`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, materialExtra: material }),
      });
      const j = await res.json();
      if (!res.ok) setMsg(j.error || "Falhou ao gerar");
      else { setR(j.rascunho); setFontes(j.fontes); }
    } catch { setMsg("Erro de conexão"); } finally { setLoading(false); }
  };

  const salvar = async () => {
    if (!r) return;
    setSaving(true); setMsg("");
    try {
      const res = await authedFetch(`/api/cs/enriquecer-briefing`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, rascunho: r }),
      });
      const j = await res.json();
      setMsg(res.ok ? `Salvo como nova versão (v${j.version}) ✓` : (j.error || "Falhou ao salvar"));
    } catch { setMsg("Erro de conexão"); } finally { setSaving(false); }
  };

  const setField = (k: keyof BriefingEstruturado, v: unknown) => setR((p) => (p ? { ...p, [k]: v } : p));
  const strOf = (k: keyof BriefingEstruturado) => (Array.isArray(r?.[k]) ? (r![k] as string[]).join("\n") : "");
  const setArr = (k: keyof BriefingEstruturado, text: string) =>
    setField(k, text.split("\n").map((s) => s.trim()).filter(Boolean));

  const fontesLabel: Record<string, string> = {
    materialNovo: "✦ material novo", fixedBriefing: "briefing fixo", campanha: "campanha",
    onboarding: "onboarding", ficha: "ficha", notas: "notas", briefingAtual: "briefing atual",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold">Briefing estratégico (IA)</h3>
          <p className="text-sm text-muted-foreground">Junta o material do cliente e monta o briefing com diagnóstico. Revise antes de salvar.</p>
        </div>
        <Button onClick={gerar} disabled={loading}>{loading ? "Gerando…" : r ? "Gerar de novo" : "Gerar rascunho"}</Button>
      </div>

      <div className="space-y-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void lerPdfs(Array.from(e.dataTransfer?.files ?? [])); }}>
        <Label>Material novo do cliente <span className="text-muted-foreground">(cole o texto ou solte o PDF — é fonte prioritária)</span></Label>
        <Textarea value={material} onChange={(e) => setMaterial(e.target.value)} rows={5}
          onPaste={(e) => {
            // PDF colado (Ctrl+V) também vale — o clipboard traz como arquivo.
            const fs = Array.from(e.clipboardData?.files ?? []);
            if (fs.some((f) => /pdf/i.test(f.type) || /\.pdf$/i.test(f.name))) { e.preventDefault(); void lerPdfs(fs); }
          }}
          placeholder="Cole o material do cliente aqui — ou arraste o PDF (tabela de preço, catálogo, apresentação)." />
        <div className="flex items-center gap-3 flex-wrap">
          <input type="file" accept="application/pdf" multiple disabled={lendoPdf}
            onChange={(e) => { void lerPdfs(Array.from(e.target.files ?? [])); e.currentTarget.value = ""; }}
            className="block text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20" />
          {lendoPdf && <span className="text-xs text-primary">Lendo o PDF…</span>}
        </div>
        {avisoPdf && <p className="text-xs text-lone-warning">{avisoPdf}</p>}
        <p className="text-[10px] text-muted-foreground">
          O texto do PDF entra aqui e vira base do briefing — é o que o agente usa pra roteiro e planejamento.
        </p>
      </div>

      {fontes && (
        <p className="text-xs text-muted-foreground">
          Base: {Object.entries(fontes).filter(([, v]) => v).map(([k]) => fontesLabel[k] || k).join(" · ") || "nenhuma fonte encontrada"}
        </p>
      )}
      {msg && <p className="text-sm font-medium">{msg}</p>}

      {r && (
        <div className="space-y-4">
          {TEXTO_LONGO.map(([k, label]) => (
            <div key={k} className="space-y-1">
              <Label>{label}</Label>
              <Textarea value={(r[k] as string) || ""} onChange={(e) => setField(k, e.target.value)} rows={3} />
            </div>
          ))}

          <div className="grid gap-3 sm:grid-cols-2">
            {TEXTO_CURTO.map(([k, label]) => (
              <div key={k} className="space-y-1">
                <Label>{label}</Label>
                <Input value={(r[k] as string) || ""} onChange={(e) => setField(k, e.target.value)} />
              </div>
            ))}
            <div className="space-y-1">
              <Label>Maturidade da marca</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={r.maturidade_marca} onChange={(e) => setField("maturidade_marca", e.target.value)}>
                <option value="nova">nova</option>
                <option value="em_crescimento">em crescimento</option>
                <option value="consolidada">consolidada</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Mix de pilares (%)</Label>
              <div className="flex gap-2">
                {(["autoridade", "aproximacao", "comercial"] as const).map((k) => (
                  <div key={k} className="flex-1">
                    <Input type="number" value={r.mix_pilares?.[k] ?? 0}
                      onChange={(e) => setField("mix_pilares", { ...r.mix_pilares, [k]: Number(e.target.value) || 0 })} />
                    <span className="text-[10px] text-muted-foreground">{k}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {LISTAS.map(([k, label]) => (
              <div key={k} className="space-y-1">
                <Label>{label} <span className="text-muted-foreground">(1 por linha)</span></Label>
                <Textarea value={strOf(k)} onChange={(e) => setArr(k, e.target.value)} rows={3} />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
            <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar como novo briefing"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
