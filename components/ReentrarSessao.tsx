"use client";

// components/ReentrarSessao.tsx — "Entre de novo para continuar", POR CIMA da página.
//
// 25/10/2026 (onda 6 da auditoria de erro recuperável, itens 8.3 e 8.4). Quando a sessão caía (4 h sem
// uso, sessão recusada pelo servidor, saída em outra aba), o AuthGate trocava a página inteira pela tela
// de login — e o formulário aberto sumia. Agora a página fica montada por baixo deste pedido de senha
// (fundo opaco: nada do conteúdo aparece para quem chegar no computador). Entrou de novo, tudo continua
// de onde parou, e os pedidos que tinham voltado 401 são repetidos sozinhos (lib/auth/reentrada.ts).

import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { useRole } from "@/lib/context/RoleContext";
import { apagaSenha } from "@/lib/auth/login-erro";
import { Logo } from "@/components/ui/Logo";

export default function ReentrarSessao() {
  const { sessaoInterrompida, reentrar, duasEtapasPendente, confirmarDuasEtapas, logout } = useRole();
  const [senha, setSenha] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [confirmarTroca, setConfirmarTroca] = useState(false);
  const senhaRef = useRef<HTMLInputElement>(null);
  const codigoRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (duasEtapasPendente) setTimeout(() => codigoRef.current?.focus(), 60); }, [duasEtapasPendente]);

  if (!sessaoInterrompida) return null;
  const porInatividade = sessaoInterrompida.motivo === "inatividade";
  const primeiroNome = sessaoInterrompida.nome.split(" ")[0] || sessaoInterrompida.nome;

  async function entrar() {
    if (!senha || ocupado) return;
    setOcupado(true); setErro("");
    const r = await reentrar(senha);
    setOcupado(false);
    if (!r.ok) {
      setErro(r.frase);
      if (apagaSenha(r.motivo)) setSenha("");
      setTimeout(() => senhaRef.current?.focus(), 30);
      return;
    }
    setSenha("");
  }

  async function confirmarCodigo() {
    if (codigo.length !== 6 || ocupado) return;
    setOcupado(true); setErro("");
    const r = await confirmarDuasEtapas(codigo);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro ?? "Código inválido."); setCodigo(""); }
  }

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        {/* Fundo OPACO de propósito: a página continua montada (o formulário não se perde), mas nada
            dela aparece para quem sentar no computador. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-[200] bg-background" />
        <DialogPrimitive.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => { e.preventDefault(); setTimeout(() => (duasEtapasPendente ? codigoRef : senhaRef).current?.focus(), 30); }}
          className="fixed left-1/2 top-1/2 z-[201] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-5 rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8"
        >
          <div className="flex items-center gap-3">
            <Logo className="h-9 w-9" />
            <span className="font-brand text-base font-bold tracking-tight text-foreground">Lone OS</span>
          </div>

          <div className="space-y-2">
            <DialogPrimitive.Title className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
              <LockKeyhole size={18} className="text-primary" aria-hidden />
              {porInatividade ? "Sessão fechada por inatividade" : "Sua sessão expirou"}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              {porInatividade
                ? "Ninguém usou o Lone OS neste navegador por 4 horas, então a sessão fechou aqui (no celular e em outros computadores ela continua)."
                : "O servidor pediu para você entrar de novo."}{" "}
              <strong className="font-medium text-foreground">A página e o que você estava preenchendo continuam aqui</strong> — é só digitar a senha.
            </DialogPrimitive.Description>
          </div>

          <div className="rounded-xl border border-border bg-secondary px-4 py-3">
            <p className="text-sm font-medium text-foreground">{sessaoInterrompida.nome}</p>
            <p className="text-xs text-muted-foreground">{sessaoInterrompida.email}</p>
          </div>

          {duasEtapasPendente ? (
            <div className="space-y-2">
              <label htmlFor="reentrar-codigo" className="block text-sm font-medium text-muted-foreground">Código do autenticador</label>
              <input
                ref={codigoRef}
                id="reentrar-codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={codigo}
                onChange={(e) => { setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6)); setErro(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") void confirmarCodigo(); }}
                placeholder="000000"
                className="h-12 w-full rounded-xl border border-input bg-secondary px-4 text-center font-mono text-xl tracking-[0.5em] text-foreground outline-none focus:border-primary"
              />
              <button type="button" onClick={confirmarCodigo} disabled={codigo.length !== 6 || ocupado}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">
                {ocupado ? <><Loader2 size={16} className="animate-spin" /> Conferindo…</> : <>Continuar <ArrowRight size={16} /></>}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="reentrar-senha" className="block text-sm font-medium text-muted-foreground">Senha</label>
              <div className="relative flex items-center">
                <input
                  ref={senhaRef}
                  id="reentrar-senha"
                  type={mostrar ? "text" : "password"}
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => { setSenha(e.target.value); setErro(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") void entrar(); }}
                  placeholder="Sua senha"
                  className="h-12 w-full rounded-xl border border-input bg-secondary px-4 pr-12 text-[15px] text-foreground outline-none focus:border-primary"
                />
                <button type="button" onClick={() => setMostrar((v) => !v)} aria-label={mostrar ? "Esconder senha" : "Mostrar senha"}
                  className="absolute right-2 grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
                  {mostrar ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button type="button" onClick={entrar} disabled={!senha || ocupado}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">
                {ocupado ? <><Loader2 size={16} className="animate-spin" /> Entrando…</> : <>Continuar, {primeiroNome} <ArrowRight size={16} /></>}
              </button>
            </div>
          )}

          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}

          {confirmarTroca ? (
            <div role="alertdialog" aria-label="Entrar com outra conta" className="space-y-2 rounded-xl border border-lone-warning-border bg-lone-warning-bg p-3">
              <p className="text-xs text-foreground">O que não foi salvo nesta página se perde. Entrar com outra conta mesmo assim?</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => void logout()} className="rounded-lg bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent">Sim, trocar de conta</button>
                <button type="button" onClick={() => setConfirmarTroca(false)} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Voltar</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmarTroca(true)} className="w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground">
              Não é {primeiroNome}? Entrar com outra conta
            </button>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
