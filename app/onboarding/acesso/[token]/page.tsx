"use client";

// /onboarding/acesso/[token] — o cliente manda UM acesso (Meta, Instagram ou Google Ads) direto para o
// cofre da Lone Mídia (Leva 7C, N24). Página pública, autenticada pelo token do link, sem login.
// A senha vai cifrada; esta página nunca recebe senha de volta.
//
// 24/10/2026 (item 1.12): o link aceita reenvio até a equipe testar — quem errou a senha corrige
// pelo mesmo link, sem pedir outro.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, Loader2, Lock, RefreshCw } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { chamar } from "@/lib/api/chamar";
import type { SituacaoPedido } from "@/lib/clients/cofre";

interface Pedido {
  cliente: string; plataforma: string; dica: string | null; situacao: SituacaoPedido;
  aceitaEnvio?: boolean; jaRecebido?: boolean; fechado?: string | null;
}

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

  // Servidor antigo (sem aceitaEnvio) só aceitava o link aberto.
  const aceita = pedido ? (pedido.aceitaEnvio ?? pedido.situacao === "aberto") : false;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setErro(null);
    const r = await chamar("/api/onboarding/acesso", { token, login, senha });
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setSenha("");
    setEnviado(true);
    setPedido((p) => (p ? { ...p, jaRecebido: true, situacao: "recebido" } : p));
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
            <div className="space-y-3 text-center">
              <CheckCircle2 size={28} className="mx-auto text-lone-success" aria-hidden="true" />
              <h1 className="text-lone-h1 tracking-tight text-foreground">Acesso recebido</h1>
              <p className="text-lone-body text-muted-foreground">
                Obrigado! O acesso ao {pedido.plataforma} já está guardado com segurança. A equipe vai testar e, se precisar de algo (como um código de confirmação), avisa você.
              </p>
              <button type="button" onClick={() => { setEnviado(false); setErro(null); }}
                className="inline-flex items-center gap-1.5 text-lone-caption text-primary hover:underline underline-offset-2">
                <RefreshCw size={13} aria-hidden="true" /> Digitei errado — mandar de novo
              </button>
            </div>
          )}

          {pedido && !enviado && !aceita && (
            <p className="text-lone-body text-muted-foreground">
              {pedido.fechado ?? "Este link não aceita mais envios. Peça um novo à equipe da Lone Mídia."}
            </p>
          )}

          {pedido && !enviado && aceita && (
            <form onSubmit={enviar} className="space-y-4">
              <div>
                <h1 className="text-lone-h1 tracking-tight text-foreground">Acesso ao {pedido.plataforma}</h1>
                <p className="mt-1 text-lone-body text-muted-foreground">
                  Para a equipe da Lone Mídia cuidar de {pedido.cliente}. {pedido.dica}
                </p>
              </div>
              {pedido.jaRecebido && (
                <p role="status" className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-lone-caption text-muted-foreground">
                  Já recebemos um acesso por este link. Se a senha estava errada ou mudou, mande de novo: o novo substitui o anterior.
                </p>
              )}
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
              {erro && <p role="alert" className="text-lone-caption text-destructive">{erro}</p>}
              <button type="submit" disabled={enviando || !login.trim() || !senha}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
                {enviando ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}
                {pedido.jaRecebido ? "Mandar de novo com segurança" : "Enviar com segurança"}
              </button>
              <p className="text-lone-caption text-muted-foreground">
                A senha é guardada criptografada e só a equipe responsável tem acesso. Se errar, dá para mandar de novo por este mesmo link até a equipe confirmar que funcionou.
              </p>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
