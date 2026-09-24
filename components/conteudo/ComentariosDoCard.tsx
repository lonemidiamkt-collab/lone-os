"use client";

// components/conteudo/ComentariosDoCard.tsx — a conversa do card (estilo Trello): campo em cima, marcar
// quem precisa ver (designer e social) e a lista. Saiu do modal do card para servir também ao card do
// designer, onde fica recolhida em "Contexto do post".

import { useRef, useState } from "react";
import { AtSign, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useContentStore } from "@/stores/useContentStore";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { useRole } from "@/lib/context/RoleContext";
import { useTeamMembers } from "@/lib/hooks/useTeamMembers";
import { cn } from "@/lib/utils";
import type { ContentCard } from "@/lib/types";

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function ComentariosDoCard({ card, className }: {
  card: Pick<ContentCard, "id" | "title" | "clientId" | "clientName" | "comments">;
  className?: string;
}) {
  const addCardComment = useContentStore((s) => s.addCardComment);
  const pushNotification = useNotificationsStore((s) => s.push);
  const { role, currentUser } = useRole();
  const team = useTeamMembers();
  // Comentários REATIVOS: lê do store (não da prop estática) — o comentário recém-escrito aparece na hora.
  const vivos = useContentStore((s) => s.contentCards.find((c) => c.id === card.id)?.comments);
  const comments = vivos ?? card.comments ?? [];
  // Quem pode ser marcado num comentário: designers e socials (quem mexe na arte).
  const marcaveis = [...team.designer, ...team.social].filter((m) => m.name && m.name !== currentUser);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [texto, setTexto] = useState("");
  const fimRef = useRef<HTMLDivElement>(null);

  const alternar = (nome: string) => setMarcados((m) => (m.includes(nome) ? m.filter((x) => x !== nome) : [...m, nome]));

  const enviar = () => {
    const corpo = texto.trim();
    if (!corpo) return;
    // Prefixa o comentário com @PrimeiroNome de quem foi marcado (fica visível na conversa).
    const prefixo = marcados.length ? marcados.map((m) => `@${m.split(" ")[0]}`).join(" ") + " " : "";
    addCardComment(card.id, currentUser, role, prefixo + corpo);
    // Com o card: quem foi marcado abre o comentário, não a ficha do cliente.
    marcados.forEach((nome) => {
      pushNotification("content", `${nome}, você foi marcado`, `${currentUser} te marcou em "${card.title}" (${card.clientName}): "${corpo.slice(0, 80)}${corpo.length > 80 ? "..." : ""}"`, card.clientId, card.id);
    });
    setTexto("");
    setMarcados([]);
    setTimeout(() => fimRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  return (
    <div className={cn("flex flex-col min-h-0", className)}>
      <div className="pb-3 border-b border-border shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enviar()}
            placeholder="Escreva um comentário..."
            aria-label="Escreva um comentário"
            className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
          />
          <Button variant="ghost" size="sm" onClick={enviar} disabled={!texto.trim()} className="shrink-0 px-3" aria-label="Enviar comentário">
            <Send size={14} />
          </Button>
        </div>
        {marcaveis.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mt-2">
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><AtSign size={10} aria-hidden="true" /> Marcar:</span>
            {marcaveis.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => alternar(m.name)}
                title={`Marcar ${m.name} (${m.role})`}
                aria-pressed={marcados.includes(m.name)}
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full border transition-colors",
                  marcados.includes(m.name) ? "bg-primary/20 text-primary border-primary/30" : "bg-muted text-muted-foreground border-border hover:text-foreground",
                )}
              >
                {m.name.split(" ")[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto pt-4 space-y-3">
        {comments.length === 0 ? (
          <p className="text-xs text-muted-foreground leading-relaxed">
            Inicie a discussão sobre este conteúdo. Comentários ficam vinculados ao card e aparecem na timeline do cliente.
          </p>
        ) : (
          comments.map((cmt) => (
            <div key={cmt.id} className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-semibold text-primary">
                  {cmt.author.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-foreground">{cmt.author}</span>
                  <span className="text-[10px] text-muted-foreground">{timeAgo(cmt.createdAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed bg-muted/40 rounded-lg px-3 py-2 whitespace-pre-wrap">
                  {cmt.text.split(/(@[^\s@]+)/g).map((parte, i) =>
                    parte.startsWith("@") ? <span key={i} className="text-primary font-semibold">{parte}</span> : parte,
                  )}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={fimRef} />
      </div>
    </div>
  );
}
