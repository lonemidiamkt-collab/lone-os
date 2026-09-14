"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FolderOpen, Image as ImageIcon, Loader2 } from "lucide-react";
import { chamar } from "@/lib/api/chamar";

// MATERIAIS DO CLIENTE dentro do pedido (Novo Conteúdo / Solicitar Arte). Substitui o aviso
// "Cliente sem pasta Drive — cadastre em Clientes → Editar" que aparecia em 52 de 52 clientes:
// mostra o que EXISTE (logo, versões, Drive/Figma) e deixa colar o link ali mesmo. Só avisa quando
// o cliente não tem nada — e aí o caminho é um clique.
interface Item { id: string; tipo: string; nome: string; url: string }
interface Dados { capa: string | null; driveLink: string | null; itens: Item[]; error?: string }

const tipoDoLink = (url: string): "link_figma" | "link_drive" => (/figma\.com/i.test(url) ? "link_figma" : "link_drive");

export default function MateriaisResumo({ clientId, clientName }: { clientId: string; clientName?: string }) {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [colando, setColando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await chamar<Dados>(`/api/clients/${clientId}/marca`);
    if (!r.ok) { setErro(r.erro); return; }
    setD(r.data ?? null);
  }, [clientId]);
  useEffect(() => { setD(null); setErro(null); setColando(false); setLink(""); void carregar(); }, [carregar]);

  async function salvarLink() {
    const url = link.trim();
    if (!/^https?:\/\//.test(url)) { setErro("Cola o link completo (começa com https://)."); return; }
    setSalvando(true); setErro(null);
    const r = await chamar<{ ok?: boolean; error?: string }>(`/api/clients/${clientId}/marca`, { tipo: tipoDoLink(url), url });
    setSalvando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setLink(""); setColando(false);
    await carregar();
  }

  if (!d && !erro) return <div className="rounded-lg border border-border bg-card/[0.03] px-3 py-2 text-[10px] text-muted-foreground">Carregando materiais do cliente…</div>;
  const links = (d?.itens ?? []).filter((i) => i.tipo === "link_drive" || i.tipo === "link_figma");
  const arquivos = (d?.itens ?? []).filter((i) => i.tipo !== "link_drive" && i.tipo !== "link_figma");
  const temAlgo = !!d?.capa || arquivos.length > 0 || links.length > 0 || !!d?.driveLink;
  const ficha = `/clients/${clientId}?tab=inteligencia`;

  return (
    <div className={`rounded-lg border p-2.5 text-[10px] ${temAlgo ? "border-border bg-card/[0.03]" : "border-lone-warning-border/[0.2] bg-lone-warning-bg/[0.05]"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
          {d?.capa && !/\.pdf(\?|$)/i.test(d.capa) ? <img src={d.capa} alt="" className="h-full w-full object-contain" /> : d?.capa ? <span className="text-[9px] font-medium text-muted-foreground">PDF</span> : <ImageIcon size={14} className="text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">Materiais {clientName ? `— ${clientName}` : "do cliente"}</p>
          <p className="text-muted-foreground">
            {temAlgo
              ? [d?.capa ? "logo" : null, arquivos.length ? `${arquivos.length} arquivo${arquivos.length > 1 ? "s" : ""}` : null, links.length || d?.driveLink ? "link de pasta" : null].filter(Boolean).join(" · ")
              : "Nenhum material cadastrado — sem logo o designer vai te perguntar."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {d?.driveLink && !links.some((l) => l.url === d.driveLink) && (
            <a href={d.driveLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/[0.06] px-2 py-1 text-primary hover:bg-primary/[0.12]"><FolderOpen size={10} /> Drive <ExternalLink size={9} /></a>
          )}
          {links.map((l) => (
            <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/[0.06] px-2 py-1 text-primary hover:bg-primary/[0.12]"><FolderOpen size={10} /> {l.tipo === "link_figma" ? "Figma" : "Drive"} <ExternalLink size={9} /></a>
          ))}
          {!links.length && !d?.driveLink && !colando && (
            <button type="button" onClick={() => setColando(true)} className="rounded-md border border-border px-2 py-1 text-muted-foreground hover:text-foreground">+ Colar link do Drive/Figma</button>
          )}
          <a href={ficha} target="_blank" rel="noopener noreferrer" className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground">Ver ficha ↗</a>
        </div>
      </div>
      {colando && (
        <div className="mt-2 flex gap-1.5">
          <input id={`link-marca-${clientId}`} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/… ou https://figma.com/…" autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void salvarLink(); } }}
            className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-[11px] text-foreground outline-none focus:border-primary" />
          <button type="button" onClick={() => void salvarLink()} disabled={salvando} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50">{salvando ? <Loader2 size={11} className="animate-spin" /> : null} Salvar</button>
          <button type="button" onClick={() => { setColando(false); setLink(""); }} className="rounded-md border border-border px-2 text-[11px] text-muted-foreground">Cancelar</button>
        </div>
      )}
      {erro && <p className="mt-1.5 text-destructive">{erro}</p>}
    </div>
  );
}
