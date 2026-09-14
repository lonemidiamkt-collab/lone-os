"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ExternalLink, Image as ImageIcon, Link2, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { authedFetch } from "@/lib/supabase/authed-fetch";

// MATERIAIS DA MARCA — usado na ficha (aba Dados) e no drawer do designer. Uma fonte só:
// /api/clients/[id]/marca. Ver, baixar, subir versão nova, definir capa, guardar links.

interface Item { id: string; tipo: string; nome: string; url: string; mime?: string | null; bytes?: number | null; largura?: number | null; altura?: number | null }
interface Dados { capa: string | null; driveLink: string | null; itens: Item[]; agencia: Item[]; error?: string }

const ROTULO: Record<string, string> = { logo: "Logo", logo_variante: "Versão", marca_dagua: "Marca d'água", link_figma: "Figma", link_drive: "Drive / PSD", outro: "Outro" };
const kb = (n?: number | null) => (n ? `${Math.round(n / 1024)} KB` : "");

export default function MarcaDoCliente({ clientId, compacto = false, podeEditar = true, onCapaChange }: { clientId: string; compacto?: boolean; podeEditar?: boolean; onCapaChange?: (url: string) => void }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [novoLink, setNovoLink] = useState<{ tipo: "link_figma" | "link_drive"; url: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const capaRef = useRef(false);

  const carregar = useCallback(async () => {
    try {
      const r = await authedFetch(`/api/clients/${clientId}/marca`);
      const d = (await r.json()) as Dados;
      if (!r.ok) { setErro(d.error ?? `HTTP ${r.status}`); return; }
      setDados(d); setErro(null);
    } catch { setErro("Não consegui carregar os materiais."); }
  }, [clientId]);
  useEffect(() => { void carregar(); }, [carregar]);

  const subir = async (file: File, capa: boolean) => {
    setOcupado(true); setErro(null);
    try {
      const fd = new FormData(); fd.append("file", file); if (capa) fd.append("capa", "1");
      const r = await authedFetch(`/api/clients/${clientId}/marca`, { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d?.error ?? `HTTP ${r.status}`); return; }
      if (d?.capa && onCapaChange) onCapaChange(d.capa as string);
      await carregar();
    } finally { setOcupado(false); }
  };
  const salvarLink = async () => {
    if (!novoLink?.url.trim()) return;
    setOcupado(true); setErro(null);
    try {
      const r = await authedFetch(`/api/clients/${clientId}/marca`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(novoLink) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d?.error ?? `HTTP ${r.status}`); return; }
      setNovoLink(null); await carregar();
    } finally { setOcupado(false); }
  };
  const remover = async (assetId: string) => {
    if (!window.confirm("Tirar este item da lista? O arquivo continua no armazenamento.")) return;
    setOcupado(true);
    try {
      const r = await authedFetch(`/api/clients/${clientId}/marca`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErro(d?.error ?? `HTTP ${r.status}`); return; }
      await carregar();
    } finally { setOcupado(false); }
  };

  const arquivos = (dados?.itens ?? []).filter((i) => !i.tipo.startsWith("link_"));
  const links = (dados?.itens ?? []).filter((i) => i.tipo.startsWith("link_"));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground flex items-center gap-1.5"><ImageIcon size={12} className="text-primary" /> Materiais da marca {arquivos.length ? <span className="text-muted-foreground">({arquivos.length})</span> : null}</p>
        {podeEditar && (
          <div className="flex items-center gap-1.5">
            <input ref={inputRef} id={`marca-upload-${clientId}`} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,application/pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f, capaRef.current); e.target.value = ""; }} />
            <button disabled={ocupado} onClick={() => { capaRef.current = false; inputRef.current?.click(); }} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50">
              {ocupado ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Subir versão
            </button>
            <button disabled={ocupado} onClick={() => { capaRef.current = true; inputRef.current?.click(); }} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50" title="Sobe o arquivo e define como a logo de capa do cliente">
              <Star size={11} /> Nova capa
            </button>
            <button disabled={ocupado} onClick={() => setNovoLink(novoLink ? null : { tipo: "link_figma", url: "" })} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50">
              <Link2 size={11} /> Link
            </button>
          </div>
        )}
      </div>
      {erro && <p className="text-[11px] text-destructive">{erro}</p>}

      {novoLink && (
        <div className="flex flex-wrap items-center gap-1.5">
          <select value={novoLink.tipo} onChange={(e) => setNovoLink({ ...novoLink, tipo: e.target.value as "link_figma" | "link_drive" })} className="h-8 rounded-lg border border-input bg-background px-2 text-[11px] text-foreground">
            <option value="link_figma">Figma</option><option value="link_drive">Drive / Photoshop</option>
          </select>
          <input id={`marca-link-${clientId}`} value={novoLink.url} onChange={(e) => setNovoLink({ ...novoLink, url: e.target.value })} placeholder="https://…" className="h-8 min-w-[220px] flex-1 rounded-lg border border-input bg-background px-2 text-[11px] text-foreground outline-none focus:border-primary" />
          <button onClick={salvarLink} disabled={ocupado || !novoLink.url.trim()} className="h-8 rounded-lg bg-primary px-3 text-[11px] font-medium text-primary-foreground disabled:opacity-50">Salvar</button>
        </div>
      )}

      {dados && arquivos.length === 0 && links.length === 0 && !dados.driveLink && (
        <p className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">Nenhum material ainda. Suba a logo (PNG com fundo transparente é o ideal) ou cole o link do Figma.</p>
      )}

      {arquivos.length > 0 && (
        <ul className={`grid gap-2 ${compacto ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5"}`}>
          {arquivos.map((i) => {
            const ehCapa = !!dados?.capa && dados.capa === i.url;
            const ehImagem = (i.mime ?? "").startsWith("image/");
            return (
              <li key={i.id} className={`group relative overflow-hidden rounded-lg border bg-muted ${ehCapa ? "border-primary/50" : "border-border"}`}>
                <a href={`${i.url}${i.url.includes("?") ? "&" : "?"}download=`} download target="_blank" rel="noopener noreferrer" className="block aspect-square" title="Baixar">
                  {ehImagem ? <img src={i.url} alt={i.nome} className="h-full w-full object-contain p-1.5" loading="lazy" /> : <div className="grid h-full w-full place-items-center text-[10px] text-muted-foreground">{(i.mime ?? "").includes("pdf") ? "PDF" : "arquivo"}</div>}
                </a>
                {ehCapa && <span className="absolute left-1 top-1 rounded bg-primary px-1 py-0.5 text-[9px] font-medium text-primary-foreground">capa</span>}
                <div className="flex items-center justify-between gap-1 px-1.5 py-1 text-[9px] text-muted-foreground">
                  <span className="truncate" title={i.nome}>{ROTULO[i.tipo] ?? i.tipo}{i.largura ? ` · ${i.largura}×${i.altura}` : ""}{i.bytes ? ` · ${kb(i.bytes)}` : ""}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <a href={`${i.url}${i.url.includes("?") ? "&" : "?"}download=`} download className="hover:text-foreground" title="Baixar"><Download size={10} /></a>
                    {podeEditar && <button onClick={() => remover(i.id)} className="hover:text-destructive" title="Tirar da lista"><Trash2 size={10} /></button>}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(links.length > 0 || dados?.driveLink) && (
        <ul className="flex flex-wrap gap-1.5">
          {dados?.driveLink && <li><a href={dados.driveLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"><ExternalLink size={10} /> Pasta do Drive (cadastro)</a></li>}
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground"><ExternalLink size={10} /> {l.nome}</a>
              {podeEditar && <button onClick={() => remover(l.id)} className="hover:text-destructive" title="Tirar da lista"><Trash2 size={10} /></button>}
            </li>
          ))}
        </ul>
      )}

      {!compacto && dados && dados.agencia.length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Materiais da Lone (marca d'água, tarjas) — {dados.agencia.length}</summary>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {dados.agencia.map((a) => (
              <li key={a.id}><a href={`${a.url}?download=`} download className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-muted-foreground hover:text-foreground"><img src={a.url} alt="" className="h-6 w-10 object-contain" /> {a.nome} <Download size={10} /></a></li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
