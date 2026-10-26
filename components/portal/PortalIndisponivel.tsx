// components/portal/PortalIndisponivel.tsx — o que o cliente vê quando o painel não abriu POR NÓS.
//
// 26/10/2026: quando o banco oscilava, o link do portal caía em "página não encontrada" — o cliente
// achava que o link tinha morrido e o time ouvia "o link do painel não funciona". O link continua
// válido; quem falhou foi a leitura. Esta tela diz isso e oferece tentar de novo (recarregar), sem
// JavaScript, e o WhatsApp da equipe se continuar.

import { linkWhatsapp } from "@/lib/portal/contato";

export default function PortalIndisponivel() {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <meta name="robots" content="noindex, nofollow" />
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center space-y-4">
        <p className="text-lone-eyebrow uppercase text-muted-foreground">Painel de Resultados</p>
        <h1 className="text-xl font-semibold">Não consegui abrir seu painel agora</h1>
        <p className="text-sm text-muted-foreground">
          Seu link está certo — foi uma instabilidade do nosso lado. Tente de novo em instantes.
        </p>
        <a
          href=""
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Tentar de novo
        </a>
        <p className="text-xs text-muted-foreground">
          Continua sem abrir?{" "}
          <a href={linkWhatsapp()} className="underline" target="_blank" rel="noreferrer">Fale com a equipe no WhatsApp</a>.
        </p>
      </div>
    </main>
  );
}
