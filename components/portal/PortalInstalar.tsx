"use client";

// components/portal/PortalInstalar.tsx — convite para ter o Painel de Resultados na tela do celular
// (19/11/2026, Leva 4). Um cartão no fim da página, nunca uma janela na frente dos números.
//
//   · Android (Chrome): o navegador avisa que dá para instalar → botão "Instalar".
//   · iPhone no Safari: não existe botão; mostramos o caminho (Compartilhar → Adicionar à Tela de Início).
//   · iPhone em outro navegador ou dentro do WhatsApp: ali não dá — dizemos para abrir no Safari e
//     oferecemos copiar o link.
//   · Já instalado, ou computador sem convite do navegador: não aparece nada.
//
// "Agora não" guarda a escolha neste aparelho e deixa um link discreto para trazer o convite de volta
// (docs/ERRO_RECUPERAVEL.md: toda escolha se desfaz).

import { useEffect, useState } from "react";
import { Check, Copy, Share, Smartphone, SquarePlus, X } from "lucide-react";
import { Cartao } from "./ui";
import { CHAVE_DISPENSADO, modoNoIphone, type ModoNoIphone } from "@/lib/portal/instalar";

/** O evento do Chrome que permite abrir o convite de instalação (não está nos tipos do DOM). */
interface EventoDeInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const BOTAO = "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

const ler = (): boolean => { try { return window.localStorage.getItem(CHAVE_DISPENSADO) === "1"; } catch { return false; } };
const gravar = (v: boolean) => { try { if (v) window.localStorage.setItem(CHAVE_DISPENSADO, "1"); else window.localStorage.removeItem(CHAVE_DISPENSADO); } catch { /* sem armazenamento: vale só nesta visita */ } };

export default function PortalInstalar() {
  const [evento, setEvento] = useState<EventoDeInstalar | null>(null);
  const [iphone, setIphone] = useState<ModoNoIphone>("nenhum");
  const [dispensado, setDispensado] = useState(false);
  const [copia, setCopia] = useState<"" | "ok" | "falha">("");

  useEffect(() => {
    const instalado = window.matchMedia?.("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIphone(modoNoIphone(navigator.userAgent, { instalado, pontosDeToque: navigator.maxTouchPoints }));
    setDispensado(ler());

    const aoPoderInstalar = (e: Event) => { e.preventDefault(); setEvento(e as EventoDeInstalar); };
    const aoInstalar = () => { setEvento(null); setIphone("nenhum"); };
    window.addEventListener("beforeinstallprompt", aoPoderInstalar);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoPoderInstalar);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  const modo: "android" | ModoNoIphone = evento ? "android" : iphone;
  if (modo === "nenhum") return null;

  const dispensar = () => { gravar(true); setDispensado(true); };
  const trazerDeVolta = () => { gravar(false); setDispensado(false); };

  if (dispensado) {
    return (
      <p className="text-center">
        <button type="button" onClick={trazerDeVolta} className="text-lone-caption text-muted-foreground underline-offset-2 hover:underline">
          Colocar o painel na tela do celular
        </button>
      </p>
    );
  }

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    // O convite do navegador só vale uma vez; recusou, o cartão sai e o link discreto fica.
    setEvento(null);
    if (outcome !== "accepted") dispensar();
  }

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopia("ok");
    } catch {
      setCopia("falha");
    }
  }

  return (
    <Cartao as="section" interativo={false} aria-label="Instalar o painel no celular" className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-lone-brand-soft" aria-hidden>
          <Smartphone size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lone-h2 tracking-tight text-foreground">Tenha o painel na tela do seu celular</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Abre direto nos seus resultados, sem procurar o link no WhatsApp.</p>
        </div>
        <button type="button" onClick={dispensar} aria-label="Agora não"
          className="-mr-1 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <X size={17} aria-hidden />
        </button>
      </div>

      {modo === "android" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={instalar} className={`${BOTAO} bg-primary text-primary-foreground hover:opacity-90`}>Instalar</button>
          <button type="button" onClick={dispensar} className={`${BOTAO} border border-border bg-card text-foreground hover:bg-accent`}>Agora não</button>
        </div>
      )}

      {modo === "safari" && (
        <ol className="mt-4 space-y-2 text-sm text-foreground">
          <li className="flex items-start gap-2.5">
            <Share size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>Toque em <strong className="font-medium">Compartilhar</strong>, na barra do Safari.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <SquarePlus size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>Escolha <strong className="font-medium">Adicionar à Tela de Início</strong>.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <Check size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>Toque em <strong className="font-medium">Adicionar</strong>. O ícone “Resultados” aparece na tela do celular.</span>
          </li>
        </ol>
      )}

      {modo === "outro" && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-foreground">
            No iPhone isso só funciona pelo <strong className="font-medium">Safari</strong>. Copie o link, abra o Safari e cole na barra de endereço.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={copiarLink} className={`${BOTAO} border border-border bg-card text-foreground hover:bg-accent`}>
              <Copy size={15} aria-hidden /> Copiar link
            </button>
            {copia === "ok" && <span role="status" className="text-sm font-medium text-lone-success">Link copiado.</span>}
            {copia === "falha" && <span role="alert" className="text-sm text-lone-warning">Não consegui copiar. Toque e segure na barra de endereço para copiar.</span>}
          </div>
        </div>
      )}
    </Cartao>
  );
}
