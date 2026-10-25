"use client";

import { useCallback, useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, Paperclip, RefreshCw, X } from "lucide-react";
import { chamar } from "@/lib/api/chamar";

// O cliente manda material pelo painel (Roberto, 31/08). Hoje foto de produto, logo e tabela de
// preço chegam pelo WhatsApp e somem na rolagem do grupo — quem vai fazer a arte precisa caçar a
// mensagem de três dias atrás. Aqui o arquivo fica preso ao cliente, com a observação e a data.
//
// A observação é o que transforma "IMG_4471.jpg" em material utilizável, e por isso ela vem ANTES
// do arquivo na tela: quem só anexa e some deixa o time adivinhando pra que serve aquilo.
//
// 24/10/2026 (auditoria de erro recuperável, item 1.11): escolher o arquivo já enviava — sem lista,
// sem como tirar o errado — e cada arquivo virava uma mensagem no grupo do time. Agora o cliente vê a
// lista do que escolheu, remove o que não quer e toca em "Enviar"; o time recebe UMA mensagem com
// todos (lib/portal/envio-material.ts). O que já foi enviado e o time não abriu ainda dá para apagar
// em "Seus envios".

const MAX_MB = 25;
const TIPOS_OK = /^(image\/|video\/(mp4|quicktime)$|application\/pdf$|text\/csv$|application\/vnd\.(ms-excel|openxmlformats-officedocument\.spreadsheetml\.sheet)$)/;

interface Escolhido {
  chave: string;
  arquivo: File;
  estado: "pronto" | "enviando" | "enviado" | "falhou";
  motivo?: string;
  id?: string;
}

const kb = (b: number) => (b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const novoLote = () => `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export default function PortalUpload({ token, clientName, onEnviado }: {
  token: string;
  clientName: string;
  /** Chamado depois de um envio que deu certo (o histórico "Seus envios" recarrega). */
  onEnviado?: () => void;
}) {
  const [observacao, setObservacao] = useState("");
  const [enviadoPor, setEnviadoPor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhidos, setEscolhidos] = useState<Escolhido[]>([]);
  const [resultado, setResultado] = useState<{ quantos: number; avisado: boolean; lote: string; ids: string[] } | null>(null);
  const [avisando, setAvisando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Escolher só põe na lista. O limite é dito aqui, antes de enviar (regra 3 do erro recuperável).
  const escolher = (arquivos: FileList | null) => {
    if (!arquivos?.length) return;
    setErro(null);
    setResultado(null);
    const recusados: string[] = [];
    const novos: Escolhido[] = [];
    for (const arquivo of Array.from(arquivos)) {
      if (arquivo.size > MAX_MB * 1024 * 1024) { recusados.push(`"${arquivo.name}" passa de ${MAX_MB} MB${arquivo.type.startsWith("video/") ? " — mande um trecho do vídeo" : ""}`); continue; }
      if (arquivo.size === 0) { recusados.push(`"${arquivo.name}" está vazio`); continue; }
      if (arquivo.type && !TIPOS_OK.test(arquivo.type)) { recusados.push(`"${arquivo.name}" não é imagem, vídeo, PDF ou planilha`); continue; }
      novos.push({ chave: `${arquivo.name}-${arquivo.size}-${arquivo.lastModified}-${Math.random().toString(36).slice(2, 6)}`, arquivo, estado: "pronto" });
    }
    setEscolhidos((l) => [...l.filter((x) => x.estado !== "enviado"), ...novos]);
    if (recusados.length) setErro(`Não entrou na lista: ${recusados.join("; ")}.`);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remover = (chave: string) => setEscolhidos((l) => l.filter((x) => x.chave !== chave));

  const pedirAviso = useCallback(async (lote: string, ids: string[]) => {
    setAvisando(true);
    const r = await chamar(`/api/portal/${token}/upload/aviso`, { lote, ids });
    setAvisando(false);
    return r.ok;
  }, [token]);

  const enviar = useCallback(async () => {
    const fila = escolhidos.filter((x) => x.estado === "pronto" || x.estado === "falhou");
    if (!fila.length || enviando) return;
    setErro(null);
    setResultado(null);
    setEnviando(true);
    const lote = novoLote();
    const ids: string[] = [];
    try {
      // Um de cada vez: o cliente costuma mandar do celular, e mandar 8 fotos em paralelo numa
      // rede fraca faz todas falharem juntas. Uma a uma, o que subiu fica.
      for (const item of fila) {
        setEscolhidos((l) => l.map((x): Escolhido => (x.chave === item.chave ? { ...x, estado: "enviando", motivo: undefined } : x)));
        const fd = new FormData();
        fd.append("arquivo", item.arquivo);
        if (observacao.trim()) fd.append("observacao", observacao.trim());
        if (enviadoPor.trim()) fd.append("enviado_por", enviadoPor.trim());
        fd.append("lote", lote);
        fd.append("avisar", "depois"); // o aviso ao time é UM só, no fim
        const r = await chamar<{ id?: string }>(`/api/portal/${token}/upload`, fd);
        if (r.ok && r.data?.id) {
          ids.push(r.data.id);
          setEscolhidos((l) => l.map((x): Escolhido => (x.chave === item.chave ? { ...x, estado: "enviado", id: r.data!.id } : x)));
        } else {
          const motivo = r.status === 0 ? "a conexão caiu" : (r.erro || "não consegui enviar");
          setEscolhidos((l) => l.map((x): Escolhido => (x.chave === item.chave ? { ...x, estado: "falhou", motivo } : x)));
        }
      }
      if (ids.length) {
        const avisado = await pedirAviso(lote, ids);
        setResultado({ quantos: ids.length, avisado, lote, ids });
        setObservacao("");
        onEnviado?.();
      }
    } finally {
      setEnviando(false);
    }
  }, [escolhidos, enviando, observacao, enviadoPor, token, pedirAviso, onEnviado]);

  const pendentes = escolhidos.filter((x) => x.estado === "pronto" || x.estado === "falhou");
  const falharam = escolhidos.filter((x) => x.estado === "falhou").length;

  return (
    <section className="rounded-xl p-4 sm:p-5 bg-card border border-border">
      <h2 className="flex items-center gap-2 text-lone-h2 tracking-tight mb-1 text-foreground">
        <Paperclip size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        Enviar material
      </h2>
      <p className="text-lone-caption sm:text-sm mb-4 text-muted-foreground">
        Foto de produto, logo, tabela de preço, vídeo da loja — o que chegar aqui fica guardado com
        o time da {clientName}, sem se perder no WhatsApp.
      </p>

      <label className="block text-xs mb-1 text-muted-foreground" htmlFor="portal-upload-obs">
        O que é esse material? <span className="text-lone-text-tertiary">(ajuda muito)</span>
      </label>
      <textarea
        id="portal-upload-obs"
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        rows={2}
        placeholder="Ex.: fotos do produto novo que chegou, pra usar nos posts da semana"
        className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none mb-3 bg-background border border-border text-foreground focus:border-primary"
      />

      <label className="block text-xs mb-1 text-muted-foreground" htmlFor="portal-upload-nome">Seu nome</label>
      <input
        id="portal-upload-nome"
        value={enviadoPor}
        onChange={(e) => setEnviadoPor(e.target.value)}
        placeholder="Quem está enviando"
        className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-4 bg-background border border-border text-foreground focus:border-primary"
      />

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/mp4,video/quicktime,application/pdf,.csv,.xlsx,.xls"
        onChange={(e) => escolher(e.target.files)}
        disabled={enviando}
        className="hidden"
        id="portal-upload-input"
      />
      <label
        htmlFor="portal-upload-input"
        className={`flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium min-h-[48px] border border-dashed border-border bg-background text-foreground transition-opacity ${enviando ? "opacity-60 pointer-events-none" : "cursor-pointer hover:border-primary/40"}`}
      >
        <Paperclip size={16} aria-hidden="true" /> {escolhidos.some((x) => x.estado !== "enviado") ? "Escolher mais arquivos" : "Escolher arquivos"}
      </label>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Imagem, vídeo, PDF ou planilha — até {MAX_MB} MB cada.</p>

      {escolhidos.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-label="Arquivos escolhidos">
          {escolhidos.map((x) => (
            <li key={x.chave} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <FileText size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-foreground">{x.arquivo.name}</p>
                <p className={`text-[11px] ${x.estado === "falhou" ? "text-lone-danger" : x.estado === "enviado" ? "text-lone-success" : "text-muted-foreground"}`}>
                  {kb(x.arquivo.size)}
                  {x.estado === "enviando" ? " · enviando…" : x.estado === "enviado" ? " · enviado" : x.estado === "falhou" ? ` · não foi: ${x.motivo}` : ""}
                </p>
              </div>
              {x.estado === "enviando" && <Loader2 size={14} className="shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />}
              {(x.estado === "pronto" || x.estado === "falhou") && (
                <button type="button" onClick={() => remover(x.chave)} disabled={enviando} aria-label={`Remover ${x.arquivo.name}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-lone-danger disabled:opacity-50">
                  <X size={12} aria-hidden="true" /> Remover
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {pendentes.length > 0 && (
        <button type="button" onClick={() => void enviar()} disabled={enviando}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium min-h-[48px] bg-primary text-primary-foreground disabled:opacity-70">
          {enviando ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Enviando…</>
            : falharam ? <><RefreshCw size={16} aria-hidden="true" /> Tentar de novo ({pendentes.length})</>
            : <>Enviar {pendentes.length === 1 ? "1 arquivo" : `${pendentes.length} arquivos`}</>}
        </button>
      )}

      {erro && <p role="alert" className="text-xs mt-3 text-lone-warning">{erro}</p>}

      {resultado && (
        <div className="mt-4 pt-3 border-t border-border space-y-1.5" role="status">
          <p className="text-xs text-lone-success inline-flex items-center gap-1.5">
            <CheckCircle2 size={14} aria-hidden="true" />
            {resultado.quantos} arquivo{resultado.quantos > 1 ? "s" : ""} enviado{resultado.quantos > 1 ? "s" : ""}
            {resultado.avisado ? " — o time já foi avisado" : ""}
          </p>
          {!resultado.avisado && (
            <p className="text-xs text-lone-warning">
              Os arquivos estão guardados, mas não consegui avisar o time agora.{" "}
              <button type="button" disabled={avisando} onClick={async () => {
                const ok = await pedirAviso(resultado.lote, resultado.ids);
                setResultado((r) => (r ? { ...r, avisado: ok } : r));
              }} className="font-medium text-primary hover:underline underline-offset-2 disabled:opacity-50">
                {avisando ? "Avisando…" : "Avisar o time"}
              </button>
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">Mandou algo errado? Em “Seus envios”, dá para apagar enquanto o time ainda não abriu.</p>
        </div>
      )}
    </section>
  );
}
