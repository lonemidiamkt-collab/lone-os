"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Package, Pencil, Plus, Trash2, X } from "lucide-react";
import { authedFetch } from "@/lib/supabase/authed-fetch";

// CATÁLOGO DE PRODUTOS (Product Library). Foto, marca, código, preço, categoria — e em quantos
// anúncios o produto apareceu. Começa semeado pelos produtos do briefing; a equipe completa.

interface Produto { id: string; nome: string; marca: string | null; codigo: string | null; categoria: string | null; preco: number | null; descricao: string | null; fotos: string[]; origem: string; anuncios: string[] }
const brl = (n: number | null) => (n == null ? "" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const vazio = { nome: "", marca: "", codigo: "", categoria: "", preco: "", descricao: "" };

export default function CatalogoProdutos({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const [itens, setItens] = useState<Produto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<typeof vazio & { id?: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [busca, setBusca] = useState("");
  const fotoRef = useRef<HTMLInputElement>(null);
  const fotoPara = useRef<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await authedFetch(`/api/clients/${clientId}/produtos`);
      const d = await r.json();
      if (!r.ok) { setErro(d?.error ?? `HTTP ${r.status}`); return; }
      setItens(d.itens as Produto[]); setErro(null);
    } catch { setErro("Não consegui carregar o catálogo."); }
  }, [clientId]);
  useEffect(() => { void carregar(); }, [carregar]);

  const salvar = async () => {
    if (!form?.nome.trim()) return;
    setOcupado(true); setErro(null);
    try {
      const metodo = form.id ? "PATCH" : "POST";
      const r = await authedFetch(`/api/clients/${clientId}/produtos`, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d?.error ?? `HTTP ${r.status}`); return; }
      setForm(null); await carregar();
    } finally { setOcupado(false); }
  };
  const remover = async (id: string) => {
    if (!window.confirm("Tirar este produto do catálogo?")) return;
    setOcupado(true);
    try { const r = await authedFetch(`/api/clients/${clientId}/produtos`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); if (r.ok) await carregar(); }
    finally { setOcupado(false); }
  };
  const subirFoto = async (file: File) => {
    const produtoId = fotoPara.current; if (!produtoId) return;
    setOcupado(true); setErro(null);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("produtoId", produtoId);
      const r = await authedFetch(`/api/clients/${clientId}/produtos`, { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d?.error ?? `HTTP ${r.status}`); return; }
      await carregar();
    } finally { setOcupado(false); }
  };

  const lista = (itens ?? []).filter((p) => !busca.trim() || `${p.nome} ${p.marca ?? ""} ${p.categoria ?? ""} ${p.codigo ?? ""}`.toLowerCase().includes(busca.toLowerCase()));
  const semFoto = (itens ?? []).filter((p) => !p.fotos?.length).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground"><Package size={12} className="text-primary" /> Catálogo de produtos {itens ? <span className="text-muted-foreground">({itens.length}{semFoto ? ` · ${semFoto} sem foto` : ""})</span> : null}</p>
        <div className="flex items-center gap-1.5">
          <input id={`busca-produto-${clientId}`} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="buscar…" className="h-7 w-36 rounded-lg border border-input bg-background px-2 text-[11px] text-foreground outline-none focus:border-primary" />
          {podeEditar && <button onClick={() => setForm({ ...vazio })} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"><Plus size={11} /> Produto</button>}
        </div>
      </div>
      {erro && <p className="text-[11px] text-destructive">{erro}</p>}
      <input ref={fotoRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirFoto(f); e.target.value = ""; }} />

      {form && (
        <div className="grid gap-2 rounded-lg border border-primary/30 bg-primary/[0.03] p-3 sm:grid-cols-3">
          {([["nome", "Nome *"], ["marca", "Marca"], ["codigo", "Código"], ["categoria", "Categoria"], ["preco", "Preço (R$)"], ["descricao", "Descrição"]] as const).map(([k, rotulo]) => (
            <label key={k} className={`text-[10px] text-muted-foreground ${k === "descricao" ? "sm:col-span-3" : ""}`}>{rotulo}
              <input id={`produto-${k}-${clientId}`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="mt-0.5 h-8 w-full rounded-lg border border-input bg-background px-2 text-[11px] text-foreground outline-none focus:border-primary" />
            </label>
          ))}
          <div className="flex gap-1.5 sm:col-span-3">
            <button onClick={salvar} disabled={ocupado || !form.nome.trim()} className="h-8 rounded-lg bg-primary px-3 text-[11px] font-medium text-primary-foreground disabled:opacity-50">{ocupado ? <Loader2 size={11} className="animate-spin" /> : form.id ? "Salvar" : "Adicionar"}</button>
            <button onClick={() => setForm(null)} className="h-8 rounded-lg px-3 text-[11px] text-muted-foreground hover:text-foreground"><X size={11} /></button>
          </div>
        </div>
      )}

      {itens && itens.length === 0 && <p className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">Nenhum produto. Cadastre os principais com foto — o designer para de procurar, e a IA usa a foto certa.</p>}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((p) => (
          <li key={p.id} className="flex gap-2 rounded-lg border border-border bg-card p-2">
            <button disabled={!podeEditar || ocupado} onClick={() => { fotoPara.current = p.id; fotoRef.current?.click(); }} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted" title={podeEditar ? "Subir foto" : ""}>
              {p.fotos?.[0] ? <img src={p.fotos[0]} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span className="grid h-full w-full place-items-center text-muted-foreground"><Camera size={14} /></span>}
              {p.fotos?.length > 1 && <span className="absolute bottom-0.5 right-0.5 rounded bg-background/80 px-1 text-[9px] text-foreground">+{p.fotos.length - 1}</span>}
            </button>
            <div className="min-w-0 flex-1 text-[11px]">
              <p className="truncate font-medium text-foreground" title={p.nome}>{p.nome}</p>
              <p className="truncate text-muted-foreground">{[p.marca, p.categoria, p.codigo].filter(Boolean).join(" · ") || (p.origem === "briefing" ? "do briefing — completar" : p.origem === "briefing_ia" ? "lido do briefing pela IA — conferir" : "")}</p>
              <p className="text-muted-foreground">{p.preco != null ? <span className="text-foreground">{brl(p.preco)}</span> : "sem preço"}{p.anuncios.length ? <> · <span className="text-primary">{p.anuncios.length} anúncio{p.anuncios.length === 1 ? "" : "s"}</span></> : null}</p>
            </div>
            {podeEditar && (
              <div className="flex shrink-0 flex-col gap-1">
                <button onClick={() => setForm({ id: p.id, nome: p.nome, marca: p.marca ?? "", codigo: p.codigo ?? "", categoria: p.categoria ?? "", preco: p.preco == null ? "" : String(p.preco), descricao: p.descricao ?? "" })} className="text-muted-foreground hover:text-foreground" title="Editar"><Pencil size={11} /></button>
                <button onClick={() => remover(p.id)} className="text-muted-foreground hover:text-destructive" title="Tirar"><Trash2 size={11} /></button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
