import { Lock } from "lucide-react";
import { linkWhatsapp } from "@/lib/portal/contato";

export default function PortalNotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-background">
      <div className="mb-6 w-14 h-14 rounded-full bg-muted flex items-center justify-center">
        <Lock size={24} className="text-muted-foreground" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-semibold text-foreground mb-2">Link expirado ou inválido</h1>
      <p className="text-muted-foreground text-sm max-w-xs">
        Entre em contato com seu gestor da Lone Mídia para receber um novo link de acesso.
      </p>
      <a
        href={linkWhatsapp()}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex items-center gap-2 px-5 min-h-[44px] rounded-full text-sm font-semibold bg-whatsapp text-primary-foreground"
      >
        Falar com a equipe
      </a>
    </div>
  );
}
