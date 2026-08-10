"use client";

// components/social/CampoReferencias.tsx — anexar referência pro designer.
//
// O QUE ISTO CONSERTA. Era um <input type="file"> cru: você escolhia as imagens e a tela dizia
// "3 imagens anexadas". Não dava pra ver o que tinha escolhido, nem tirar uma sem recomeçar. E o
// jeito que as pessoas realmente usam — colar print com Ctrl+V — estava escrito em letra miúda
// embaixo, como se fosse curiosidade.
//
// A LINHA QUE MAIS IMPORTA é a que diz que isto NÃO vai pro cliente. Referência e arte final
// moravam no mesmo lugar, e o agente mandava as duas pro cliente aprovar — ele recebia, junto com
// a arte, o print que serviu de inspiração. Já separei isso no envio e na publicação; aqui a tela
// passa a dizer, no momento em que a pessoa anexa, o que aquele arquivo é.

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

interface Props {
  arquivos: File[];
  onChange: (f: File[]) => void;
  erro?: string | null;
  /** Some com o campo enquanto o upload acontece — evita mexer no que já está subindo. */
  ocupado?: boolean;
}

export default function CampoReferencias({ arquivos, onChange, erro, ocupado }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);

  const adicionar = (novos: File[]) => {
    const imagens = novos.filter((f) => f.type.startsWith("image/"));
    if (imagens.length) onChange([...arquivos, ...imagens]);
  };

  const remover = (i: number) => onChange(arquivos.filter((_, idx) => idx !== i));

  // Uma URL por arquivo, criada quando a lista muda e DEVOLVIDA ao trocar. Chamar
  // URL.createObjectURL direto no JSX parecia funcionar e vazava: nasce uma URL nova a cada
  // redesenho do componente, e o navegador segura a imagem inteira na memória até a aba fechar.
  // Com print de referência de 3 MB e o modal redesenhando a cada tecla digitada, isso cresce
  // rápido — e some do radar porque nada quebra.
  const previas = useMemo(() => arquivos.map((f) => URL.createObjectURL(f)), [arquivos]);
  useEffect(() => () => { previas.forEach(URL.revokeObjectURL); }, [previas]);

  const vazio = arquivos.length === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-xs font-medium text-foreground">
          Referências <span className="text-muted-foreground font-normal">(opcional)</span>
        </label>
        {arquivos.length > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {arquivos.length} {arquivos.length === 1 ? "imagem" : "imagens"}
          </span>
        )}
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Anexar imagens de referência"
        onClick={() => !ocupado && inputRef.current?.click()}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !ocupado) { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setSobre(true); }}
        onDragLeave={() => setSobre(false)}
        onDrop={(e) => {
          e.preventDefault(); e.stopPropagation(); setSobre(false);
          adicionar(Array.from(e.dataTransfer.files ?? []));
        }}
        className={`rounded-lg border border-dashed text-center transition-colors cursor-pointer outline-none
          focus-visible:ring-1 focus-visible:ring-ring
          ${vazio ? "px-4 py-5" : "px-3 py-2"}
          ${sobre ? "border-primary bg-primary/5" : "border-input hover:border-primary/40 hover:bg-muted/40"}
          ${ocupado ? "opacity-50 pointer-events-none" : ""}`}
      >
        {/* COM IMAGEM ANEXADA A ÁREA ENCOLHE. Manter o alvo grande depois que a pessoa já anexou é
            espaço morto empurrando o resto do formulário pra baixo — o que ela quer ver dali em
            diante são as miniaturas, não o convite que já aceitou. */}
        {vazio ? (
          <>
            <ImagePlus size={20} className="mx-auto mb-2 text-muted-foreground" />
            {/* A tecla fica no MEIO da frase, nunca antes de vírgula: o padding do <kbd> abre um
                vão visível entre ela e a pontuação. */}
            <p className="text-xs text-foreground">
              Arraste, cole com <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-[10px] font-sans">Ctrl+V</kbd> ou clique
            </p>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
            <ImagePlus size={13} /> Adicionar mais
          </p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { adicionar(Array.from(e.target.files ?? [])); e.target.value = ""; }}
      />

      {arquivos.length > 0 && (
        <ul className="grid grid-cols-4 gap-2">
          {arquivos.map((f, i) => (
            <li key={`${f.name}-${i}`} className="relative aspect-square rounded-md overflow-hidden border border-border bg-muted group">
              {/* Miniatura da própria imagem: ver o que foi anexado é o ponto — "3 imagens
                  anexadas" não diz se você colou a certa. */}
              <img src={previas[i]} alt={f.name} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remover(i); }}
                aria-label={`Remover ${f.name}`}
                className="absolute top-0.5 right-0.5 rounded-full bg-background/90 border border-border p-0.5 text-muted-foreground
                           opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive transition-opacity"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Esta linha nunca some: é ela que separa referência de arte final na cabeça de quem
          anexa, e foi a confusão entre as duas que mandou print de inspiração pro cliente. */}
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        É referência pro designer — não vai pro cliente nem é publicado.
      </p>

      {erro && <p className="text-[10px] text-destructive">{erro}</p>}
    </div>
  );
}
