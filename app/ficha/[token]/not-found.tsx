// not-found co-localizado da Ficha Viva. Presença deste boundary faz o notFound() da página
// devolver HTTP 404 de verdade (no Next 15, cair no not-found raiz responde 200). Também dá ao
// cliente uma mensagem melhor do que o 404 interno "Voltar ao Dashboard".

export default function FichaVivaNotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 text-4xl">🔒</div>
      <h1 className="text-h2 font-semibold mb-2">Link expirado ou inválido</h1>
      <p className="text-sm text-muted-foreground max-w-xs">
        Fale com seu gestor da Lone Mídia para receber um novo link de acesso.
      </p>
      <a
        href="https://wa.me/5522981530700"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold bg-lone-success text-white"
      >
        Falar com a equipe
      </a>
    </div>
  );
}
