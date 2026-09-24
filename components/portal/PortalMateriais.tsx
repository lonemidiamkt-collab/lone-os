"use client";

// Histórico do material enviado pelo cliente (N37): o que ele mandou por "Enviar material", se o time
// já recebeu e onde foi usado (quando o time ligou o material a um post). Regras e campos em
// lib/portal/materiais.ts — quem do time abriu e o caminho no storage não saem da rota.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, ExternalLink, File, FileSpreadsheet, FileText, Film, FolderOpen, Image as ImageIcon, type LucideIcon } from "lucide-react";
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
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
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
