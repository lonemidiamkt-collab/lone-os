"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { chamar } from "@/lib/api/chamar";

// ESTILO VISUAL por prints (item 12 do brief 14/09). A equipe sobe 1–4 prints do Instagram do
// cliente; a visão descreve o que está lá (paleta, tipografia, composição, elementos recorrentes).
// O resultado entra no briefing de toda replicação e na prévia de imagem.
interface Analise { paleta: { hex: string; papel: string }[]; tipografia: string; composicao: string; elementos_recorrentes: string[]; tom_visual: string; o_que_evitar: string[]; resumo: string }
interface Leitura { id: string; fonte: string; imagens: string[]; analise: Analise; resumo: string | null; created_by: string | null; created_at: string }
interface Dados { atual: Leitura | null; historico: Leitura[]; error?: string }

const hexOk = (h: string) => /^#[0-9a-f]{3,8}$/i.test(h.trim());

export default function EstiloVisual({ clientId, podeEditar = true }: { clientId: string; podeEditar?: boolean }) {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const r = await chamar<Dados>(`/api/clients/${clientId}/estilo-visual`);
    if (!r.ok) { setErro(r.erro); return; }
    setD(r.data ?? null);
  }, [clientId]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function enviar(files: FileList | null) {
    if (!files?.length) return;
    setOcupado(true); setErro(null);
    const fd = new FormData();
    for (const f of Array.from(files).slice(0, 4)) fd.append("files", f);
    const r = await chamar<{ ok?: boolean; error?: string }>(`/api/clients/${clientId}/estilo-visual`, fd);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    await carregar();
  }

  async function apagar(id: string) {
    if (!confirm("Apagar esta leitura de estilo?")) return;
    const r = await chamar(`/api/clients/${clientId}/estilo-visual?id=${id}`, undefined, { method: "DELETE" });
    if (!r.ok) { setErro(r.erro); return; }
    await carregar();
  }

  const a = d?.atual;
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground">📸 Estilo visual (lido dos prints)</h4>
          <p className="text-[11px] text-muted-foreground">Sobe 1–4 prints do Instagram do cliente e a IA descreve paleta, tipografia e composição. Vai direto pro briefing de toda variação e pra prévia de imagem.</p>
        </div>
        {podeEditar && (
          <>
            <input id={`prints-${clientId}`} ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { void enviar(e.target.files); e.target.value = ""; }} />
            <button onClick={() => input.current?.click()} disabled={ocupado} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50">
              {ocupado ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />} {ocupado ? "Lendo os prints…" : a ? "Ler prints novos" : "Subir prints do Instagram"}
            </button>
          </>
        )}
      </div>
      {erro && <p className="mt-2 text-xs text-destructive">{erro}</p>}
      {!a && d && <p className="mt-3 text-xs text-muted-foreground">Nenhum print lido ainda. Sem isso, a IA só conhece o estilo pelos anúncios da Meta e pelas artes entregues.</p>}
      {a && (
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="space-y-2 text-xs">
            <p className="text-foreground">{a.analise.resumo}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {a.analise.paleta.filter((c) => hexOk(c.hex)).map((c, k) => (
                <span key={k} className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground" title={c.papel}>
                  <span className="inline-block h-3 w-3 rounded-full border border-border" style={{ background: c.hex }} /> {c.hex} · {c.papel}
                </span>
              ))}
            </div>
            <p className="text-muted-foreground"><span className="text-foreground/80">Tipografia:</span> {a.analise.tipografia}</p>
            <p className="text-muted-foreground"><span className="text-foreground/80">Composição:</span> {a.analise.composicao}</p>
            {a.analise.elementos_recorrentes.length > 0 && <p className="text-muted-foreground"><span className="text-foreground/80">Se repete:</span> {a.analise.elementos_recorrentes.join(" · ")}</p>}
            <p className="text-muted-foreground"><span className="text-foreground/80">Tom:</span> {a.analise.tom_visual}</p>
            {a.analise.o_que_evitar.length > 0 && <p className="text-muted-foreground"><span className="text-foreground/80">Evitar:</span> {a.analise.o_que_evitar.join(" · ")}</p>}
            <p className="text-[10px] text-muted-foreground">Lido em {new Date(a.created_at).toLocaleDateString("pt-BR")}{a.created_by ? ` por ${a.created_by.split("@")[0]}` : ""}{d?.historico.length ? ` · ${d.historico.length} leitura(s) anterior(es)` : ""}.
              {podeEditar && <button onClick={() => void apagar(a.id)} className="ml-2 inline-flex items-center gap-0.5 text-destructive hover:underline"><Trash2 size={10} /> apagar</button>}
            </p>
          </div>
          <div className="flex gap-1.5 lg:flex-col">
            {a.imagens.slice(0, 4).map((u, k) => <a key={k} href={u} target="_blank" rel="noreferrer" className="h-16 w-16 overflow-hidden rounded-md border border-border bg-muted"><img src={u} alt="" className="h-full w-full object-cover" /></a>)}
          </div>
        </div>
      )}
    </div>
  );
}
