"use client";

// /onboarding/acesso/[token] — o cliente manda UM acesso (Meta, Instagram ou Google Ads) direto para o
// cofre da Lone Mídia (Leva 7C, N24). Página pública, autenticada pelo token do link, sem login.
// A senha vai cifrada; esta página nunca recebe senha de volta.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { chamar } from "@/lib/api/chamar";

interface Pedido { cliente: string; plataforma: string; dica: string | null; situacao: "aberto" | "recebido" | "cancelado" | "vencido" }

const FECHADO: Record<Exclude<Pedido["situacao"], "aberto">, string> = {
  recebido: "Já recebemos este acesso. Obrigado! Se precisar mandar outro, peça um link novo à equipe.",
  vencido: "Este link venceu. Peça um novo à equipe da Lone Mídia.",
  cancelado: "Este link foi cancelado pela equipe da Lone Mídia.",
};

export default function PedidoDeAcessoPage() {
  const { token } = useParams<{ token: string }>();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [ver, setVer] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    chamar<Pedido>(`/api/onboarding/acesso?token=${encodeURIComponent(token)}`).then((r) => {
      if (!r.ok || !r.data) setErro(r.status === 404 ? "Este link não existe ou foi removido." : r.erro);
      else setPedido(r.data);
    });
  }, [token]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setErro(null);
    const r = await chamar("/api/onboarding/acesso", { token, login, senha });
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setSenha("");
    setEnviado(true);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center gap-3">
          <Logo className="h-9 w-9" priority />
          <div>
            <p className="text-lone-eyebrow uppercase text-muted-foreground">Lone Mídia</p>
            <p className="text-lone-body text-foreground">Envio seguro de acesso</p>
          </div>
        </div>

        <section className="space-y-5 rounded-xl border border-border bg-card p-5 sm:p-6">
          {!pedido && !erro && <div className="h-40 animate-pulse rounded-lg bg-muted" />}
          {!pedido && erro && <p className="text-lone-body text-muted-foreground">{erro}</p>}

          {pedido && enviado && (
            <div className="space-y-2 text-center">
              <CheckCircle2 size={28} className="mx-auto text-lone-success" aria-hidden="true" />
              <h1 className="text-lone-h1 tracking-tight text-foreground">Acesso recebido</h1>
              <p className="text-lone-body text-muted-foreground">
                Obrigado! O acesso ao {pedido.plataforma} já está guardado com segurança. A equipe vai testar e, se precisar de algo (como um código de confirmação), avisa você.
              </p>
            </div>
          )}

          {pedido && !enviado && pedido.situacao !== "aberto" && (
            <p className="text-lone-body text-muted-foreground">{FECHADO[pedido.situacao]}</p>
          )}

          {pedido && !enviado && pedido.situacao === "aberto" && (
            <form onSubmit={enviar} className="space-y-4">
              <div>
                <h1 className="text-lone-h1 tracking-tight text-foreground">Acesso ao {pedido.plataforma}</h1>
                <p className="mt-1 text-lone-body text-muted-foreground">
                  Para a equipe da Lone Mídia cuidar de {pedido.cliente}. {pedido.dica}
                </p>
              </div>
              <label className="block space-y-1.5">
                <span className="text-lone-caption text-muted-foreground">Login (e-mail, telefone ou usuário)</span>
                <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required maxLength={200}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-lone-caption text-muted-foreground">Senha</span>
                <span className="relative block">
                  <input value={senha} onChange={(e) => setSenha(e.target.value)} type={ver ? "text" : "password"} autoComplete="current-password" required maxLength={200}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 pr-10 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring" />
                  <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? "Esconder a senha" : "Mostrar a senha"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {ver ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                  </button>
                </span>
              </label>
              {erro && <p className="text-lone-caption text-destructive">{erro}</p>}
              <button type="submit" disabled={enviando || !login.trim() || !senha}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
                {enviando ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}
                Enviar com segurança
              </button>
              <p className="text-lone-caption text-muted-foreground">
                A senha é guardada criptografada e só a equipe responsável tem acesso. Este link vale uma vez.
              </p>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
