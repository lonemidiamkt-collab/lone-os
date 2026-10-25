"use client";

// Histórico do material enviado pelo cliente (N37): o que ele mandou por "Enviar material", se o time
// já recebeu e onde foi usado (quando o time ligou o material a um post). Regras e campos em
// lib/portal/materiais.ts — quem do time abriu e o caminho no storage não saem da rota.
//
// 24/10/2026 (item 1.11): o que o time ainda não abriu tem "Apagar" — o cliente que mandou o arquivo
// errado tira sozinho, sem pedir no WhatsApp (DELETE /api/portal/[token]/upload).

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, ExternalLink, File, FileSpreadsheet, FileText, Film, FolderOpen, Image as ImageIcon, Loader2, Trash2, type LucideIcon } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { rotuloDia, rotuloDiaLongo, diaEmSP } from "@/lib/portal/formatos";
import type { MaterialPortal, TipoMaterial } from "@/lib/portal/materiais";
import { Cartao, CabecalhoSecao, entrada } from "./ui";

const ICONE: Record<TipoMaterial, LucideIcon> = { imagem: ImageIcon, video: Film, pdf: FileText, planilha: FileSpreadsheet, arquivo: File };
const INICIAL = 6;

function textoUso(m: MaterialPortal): string | null {
  const u = m.uso;
  if (!u) return null;
  if (u.situacao === "no_ar") return `Usado em "${u.titulo}" · no ar${u.dia ? ` desde ${rotuloDia(u.dia)}` : ""}`;
  if (u.situacao === "agendado") return `Usado em "${u.titulo}" · agendado para ${u.dia ? rotuloDiaLongo(u.dia) : "breve"}`;
  if (u.situacao === "aprovado") return `Usado em "${u.titulo}" · aprovado`;
  return `Usado em "${u.titulo}" · em produção`;
}

export default function PortalMateriais({ token, versao = 0 }: {
  token: string;
  /** Muda depois de um envio novo — recarrega a lista. */
  versao?: number;
}) {
  const [itens, setItens] = useState<MaterialPortal[] | null>(null);
  const [erro, setErro] = useState(false);
  const [todos, setTodos] = useState(false);
  const [apagando, setApagando] = useState<string | null>(null);
  const [erroApagar, setErroApagar] = useState<string | null>(null);

  const apagar = async (m: MaterialPortal) => {
    if (!window.confirm(`Apagar "${m.nome}"? O time ainda não abriu este arquivo, então ele sai daqui e do painel da equipe.`)) return;
    setApagando(m.id); setErroApagar(null);
    const r = await chamar(`/api/portal/${token}/upload?id=${encodeURIComponent(m.id)}`, undefined, { method: "DELETE" });
    setApagando(null);
    if (!r.ok) {
      setErroApagar(r.erro ?? "Não consegui apagar agora. Tente de novo.");
      // 409 = o time abriu no meio: mostra como recebido.
      if (r.status === 409) setItens((l) => l?.map((x) => (x.id === m.id ? { ...x, recebido: true } : x)) ?? l);
      if (r.status === 404) setItens((l) => l?.filter((x) => x.id !== m.id) ?? l);
      return;
    }
    setItens((l) => l?.filter((x) => x.id !== m.id) ?? l);
  };

  useEffect(() => {
    let vivo = true;
    chamar<{ itens: MaterialPortal[] }>(`/api/portal/${token}/materiais`).then((r) => {
      if (!vivo) return;
      if (!r.ok || !r.data) { setErro(true); return; }
      setErro(false);
      setItens(r.data.itens ?? []);
    });
    return () => { vivo = false; };
  }, [token, versao]);

  // Falha aqui não pode esconder o que o cliente mandou sem dizer nada.
  if (erro && !itens) {
    return <p className="text-lone-caption text-muted-foreground">Não consegui carregar o histórico dos seus envios agora.</p>;
  }
  if (!itens || itens.length === 0) return null;

  const visiveis = todos ? itens : itens.slice(0, INICIAL);

  return (
    <motion.section variants={entrada} initial="oculto" animate="visivel" className="space-y-3">
      <CabecalhoSecao icone={FolderOpen} titulo="Seus envios" descricao="O que você mandou por aqui, se o time já recebeu e onde foi usado" />
      <Cartao className="p-4">
        <ul className="divide-y divide-border">
          {visiveis.map((m) => {
            const Icone = ICONE[m.tipo];
            const uso = textoUso(m);
            return (
              <li key={m.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Icone size={17} aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    {m.url ? (
                      <a href={m.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-sm font-medium text-foreground hover:underline">{m.nome}</a>
                    ) : (
                      <p className="min-w-0 truncate text-sm font-medium text-foreground">{m.nome}</p>
                    )}
                    <span className="text-lone-caption text-muted-foreground">
                      {rotuloDia(diaEmSP(m.enviadoEm))}{m.enviadoPor ? ` · ${m.enviadoPor}` : ""}
                    </span>
                  </div>
                  {m.observacao && <p className="mt-0.5 line-clamp-2 text-lone-caption text-muted-foreground">{m.observacao}</p>}
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-lone-caption">
                    {m.recebido ? (
                      <span className="inline-flex items-center gap-1 font-medium text-lone-success"><CheckCircle2 size={13} aria-hidden /> Recebido pelo time</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock size={13} aria-hidden /> Aguardando o time abrir</span>
                    )}
                    {uso ? (
                      <span className="inline-flex min-w-0 items-center gap-1 text-foreground">
                        <span className="truncate">{uso}</span>
                        {m.uso?.link && (
                          <a href={m.uso.link} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-0.5 font-medium text-primary hover:underline">
                            ver post <ExternalLink size={11} aria-hidden />
                          </a>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Ainda não usado em post</span>
                    )}
                    {!m.recebido && (
                      <button type="button" onClick={() => void apagar(m)} disabled={apagando !== null}
                        aria-label={`Apagar ${m.nome}`}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-lone-danger disabled:opacity-50">
                        {apagando === m.id ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Trash2 size={12} aria-hidden />} Apagar
                      </button>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        {erroApagar && <p role="alert" className="mt-2 text-lone-caption text-lone-danger">{erroApagar}</p>}
        {itens.length > INICIAL && (
          <button type="button" onClick={() => setTodos((v) => !v)}
            className="mt-3 min-h-[40px] w-full rounded-lg border border-border bg-card text-sm font-medium text-secondary-foreground hover:bg-accent">
            {todos ? "Mostrar menos" : `Ver todos os ${itens.length} envios`}
          </button>
        )}
      </Cartao>
    </motion.section>
  );
}
