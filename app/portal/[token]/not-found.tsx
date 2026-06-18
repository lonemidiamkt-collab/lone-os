export default function PortalNotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: "#060814" }}>
      <div className="mb-6 text-5xl">🔒</div>
      <h1 className="text-xl font-semibold text-white mb-2">Link expirado ou inválido</h1>
      <p className="text-[#8b91a1] text-sm max-w-xs">
        Entre em contato com seu gestor da Lone Mídia para receber um novo link de acesso.
      </p>
      <a
        href="https://wa.me/5522981530700"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white"
        style={{ background: "#25D366" }}
      >
        Falar com a equipe
      </a>
    </div>
  );
}
