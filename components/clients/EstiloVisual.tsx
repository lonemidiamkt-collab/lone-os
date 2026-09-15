"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { chamar } from "@/lib/api/chamar";

// ESTILO VISUAL por prints (item 12 do brief 14/09). A equipe sobe 1–4 prints do Instagram do
// cliente; a visão descreve o que está lá (paleta, tipografia, composição, elementos recorrentes).
// O resultado entra no briefing de toda replicação e na prévia de imagem.
interface Analise { paleta: { hex: string; papel: string }[]; tipografia: string; composicao: string; elementos_recorrentes: string[]; tom_visual: string; o_que_evitar: string[]; resumo: string }
interface Leitura { id: string; fonte: string; imagens: string[]; analise: Analise; resumo: string | null; created_by: string | null; created_at: string }
interface Dados { atual: Leitura | null; historico: Leitura[]; artesElegiveis?: number; artesNovas?: number; instrucoes?: string; logoOk?: boolean; geracoes?: { total: number; serviu: number; naoServiu: number }; error?: string }

const hexOk = (h: string) => /^#[0-9a-f]{3,8}$/i.test(h.trim());

export default function EstiloVisual({ clientId, podeEditar = true }: { clientId: string; podeEditar?: boolean }) {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [instrucoes, setInstrucoes] = useState<string>("");
  const [instrucoesSalvas, setInstrucoesSalvas] = useState<string>("");
  const [salvandoInstr, setSalvandoInstr] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const r = await chamar<Dados>(`/api/clients/${clientId}/estilo-visual`);
    if (!r.ok) { setErro(r.erro); return; }
    setD(r.data ?? null);
    setInstrucoes(r.data?.instrucoes ?? ""); setInstrucoesSalvas(r.data?.instrucoes ?? "");
  }, [clientId]);

  async function salvarInstrucoes() {
    setSalvandoInstr(true); setErro(null);
    const r = await chamar<{ ok?: boolean }>(`/api/clients/${clientId}/estilo-visual`, { instrucoes }, { method: "PATCH" });
    setSalvandoInstr(false);
    if (!r.ok) { setErro(r.erro); return; }
    setInstrucoesSalvas(instrucoes);
  }
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

  async function relerDasArtes() {
    setOcupado(true); setErro(null);
    const r = await chamar<{ ok?: boolean; error?: string }>(`/api/clients/${clientId}/estilo-visual`, { fonte: "artes" });
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
          <h4 className="text-sm font-semibold text-foreground">🎨 Estilo visual da marca</h4>
          <p className="text-[11px] text-muted-foreground">Lido sozinho das artes que a Lone entregou (as publicadas e aprovadas primeiro) — e relido quando chegam artes novas. Vai pro briefing de toda variação e pra prévia de imagem. Prints do Instagram são complemento.</p>
        </div>
        {podeEditar && (
          <div className="flex flex-wrap gap-1.5">
            {(d?.artesElegiveis ?? 0) >= 2 && (
              <button onClick={() => void relerDasArtes()} disabled={ocupado} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50">
                {ocupado ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {a ? "Reler das artes" : "Ler das artes entregues"}
              </button>
            )}
            <input id={`prints-${clientId}`} ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { void enviar(e.target.files); e.target.value = ""; }} />
            <button onClick={() => input.current?.click()} disabled={ocupado} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50">
              {ocupado ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />} {ocupado ? "Lendo…" : "Subir prints"}
            </button>
          </div>
        )}
      </div>
      {erro && <p className="mt-2 text-xs text-destructive">{erro}</p>}
      {d && (
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-2.5 text-[11px]">
          <p className="font-medium text-foreground">O que a IA recebe ao gerar arte deste cliente</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
            <li>{d.logoOk ? "✓ logo oficial (imagem)" : "✗ logo em PNG/JPG — sem ela a IA inventa símbolo"}</li>
            <li>{(d.artesElegiveis ?? 0) > 0 ? `✓ ${Math.min(3, d.artesElegiveis ?? 0)} artes recentes como exemplo de estilo` : "✗ nenhuma arte entregue como exemplo"}</li>
            <li>{a ? "✓ paleta, tipografia e composição lidas" : "✗ estilo ainda não lido"}</li>
            <li>{instrucoesSalvas ? "✓ instruções fixas da equipe" : "– sem instruções fixas"}</li>
            <li>✓ textos exatos da referência (transcritos)</li>
            {d.geracoes && d.geracoes.total > 0 && <li>{d.geracoes.total} geração(ões) · {d.geracoes.serviu} serviu · {d.geracoes.naoServiu} não serviu</li>}
          </ul>
          {podeEditar && (
            <div className="mt-2">
              <label htmlFor={`instr-${clientId}`} className="text-muted-foreground">Instruções fixas para a IA deste cliente (o que ela erra e a equipe sabe): ex. "logo sempre no canto superior direito", "preço em selo amarelo", "nunca usar foto de pessoa".</label>
              <textarea id={`instr-${clientId}`} value={instrucoes} onChange={(e) => setInstrucoes(e.target.value)} rows={2} maxLength={1200}
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-primary" />
              {instrucoes !== instrucoesSalvas && (
                <button onClick={() => void salvarInstrucoes()} disabled={salvandoInstr} className="mt-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50">{salvandoInstr ? "Salvando…" : "Salvar instruções"}</button>
              )}
            </div>
          )}
        </div>
      )}
      {!a && d && <p className="mt-3 text-xs text-muted-foreground">{(d.artesElegiveis ?? 0) >= 2 ? `Ainda não lido — o sistema lê sozinho no próximo dia útil às 07:55 (${d.artesElegiveis} artes elegíveis), ou clique em "Ler das artes entregues".` : "Este cliente ainda não tem 2 artes entregues no sistema; até lá, suba prints do Instagram."}</p>}
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
            <p className="text-[10px] text-muted-foreground">{a.fonte === "artes" ? `Lido de ${a.imagens.length} artes entregues` : `Lido de ${a.imagens.length} print(s)`} em {new Date(a.created_at).toLocaleDateString("pt-BR")}{a.created_by && a.created_by !== "cron" ? ` por ${a.created_by.split("@")[0]}` : ""}{(d?.artesNovas ?? 0) > 0 ? ` · ${d?.artesNovas} arte(s) nova(s) desde então` : ""}{d?.historico.length ? ` · ${d.historico.length} leitura(s) anterior(es)` : ""}.
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
