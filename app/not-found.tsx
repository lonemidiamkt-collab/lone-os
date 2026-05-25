import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-black relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[#0d4af5]/[0.04] rounded-full blur-[150px] pointer-events-none" />
      <div className="text-center relative z-10 space-y-4">
        <h1 className="text-7xl font-black text-[#0d4af5] text-glow">404</h1>
        <p className="text-zinc-500 text-sm">Página não encontrada</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0d4af5] text-white text-sm font-semibold hover:bg-[#0c3cff] transition-all shadow-[0_0_20px_rgba(10,52,245,0.25)]"
        >
          Voltar ao Dashboard
        </Link>
      </div>
    </div>
  );
}
