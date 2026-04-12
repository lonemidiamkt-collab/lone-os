"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronRight, ChevronLeft, Sparkles, Search, Bell, Plus, Briefcase, CheckCircle } from "lucide-react";

interface TourStep {
  title: string;
  description: string;
  position: "center" | "bottom-left" | "top-right" | "top-center" | "bottom-center";
  icon: typeof Sparkles;
}

const STEPS: TourStep[] = [
  {
    title: "Bem-vindo ao Lone OS!",
    description: "Seu sistema de gestao operacional. Vamos fazer um tour rapido pelas principais funcionalidades.",
    position: "center",
    icon: Sparkles,
  },
  {
    title: "Barra Lateral",
    description: "Navegue entre as areas do sistema: Dashboard, Trafego, Social Media, Design, Clientes e mais. O menu se adapta ao seu papel.",
    position: "bottom-left",
    icon: Briefcase,
  },
  {
    title: "Busca Global (Cmd+K)",
    description: "Encontre rapidamente clientes, tarefas e conteudos. Use o atalho Cmd+K para abrir a busca de qualquer lugar.",
    position: "top-center",
    icon: Search,
  },
  {
    title: "Notificacoes",
    description: "Fique por dentro de tudo: alertas de SLA, mudancas de status, conteudo pendente e mais. Filtre por tipo para encontrar o que precisa.",
    position: "top-right",
    icon: Bell,
  },
  {
    title: "Acoes Rapidas",
    description: "Crie rapidamente novos clientes, conteudos ou inicie um chat da equipe usando o botao + no topo.",
    position: "top-right",
    icon: Plus,
  },
  {
    title: "Meu Trabalho",
    description: "Acesse todas as suas tarefas, lembretes e conteudos atribuidos a voce em um so lugar. Sua central de produtividade.",
    position: "bottom-left",
    icon: Briefcase,
  },
  {
    title: "Pronto!",
    description: "Voce esta preparado para usar o Lone OS! Pode refazer este tour a qualquer momento nas Configuracoes.",
    position: "center",
    icon: CheckCircle,
  },
];

const STORAGE_KEY = "lone-os-tour-completed";

export default function OnboardingTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if tour was already completed
    if (typeof window !== "undefined") {
      const completed = localStorage.getItem(STORAGE_KEY);
      if (!completed) {
        // Small delay to let the app render first
        const timer = setTimeout(() => {
          setActive(true);
          setIsVisible(true);
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      completeTour();
    }
  }, [step]);

  const prev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  const skip = useCallback(() => {
    completeTour();
  }, []);

  const completeTour = () => {
    setIsVisible(false);
    setTimeout(() => {
      setActive(false);
      localStorage.setItem(STORAGE_KEY, "true");
    }, 300);
  };

  // Listen for restart event (from settings or help button)
  useEffect(() => {
    const handler = () => {
      setStep(0);
      setActive(true);
      setTimeout(() => setIsVisible(true), 50);
    };
    window.addEventListener("restart-tour", handler);
    return () => window.removeEventListener("restart-tour", handler);
  }, []);

  if (!active) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  const getTooltipPosition = () => {
    switch (current.position) {
      case "center":
        return "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2";
      case "bottom-left":
        return "top-[120px] left-[90px]";
      case "top-right":
        return "top-[80px] right-[80px]";
      case "top-center":
        return "top-[80px] left-1/2 -translate-x-1/2";
      case "bottom-center":
        return "bottom-[120px] left-1/2 -translate-x-1/2";
      default:
        return "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2";
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[9999] transition-opacity duration-300 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

      {/* Tooltip */}
      <div className={`absolute ${getTooltipPosition()} w-full max-w-md mx-4`}>
        <div className="bg-[#111118] border border-[#1a1a1a] rounded-2xl shadow-[0_0_60px_rgba(10,52,245,0.15)] overflow-hidden animate-fade-in">
          {/* Top glow */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[#0a34f5]/60 to-transparent" />

          <div className="p-6">
            {/* Icon + Close */}
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-[#0a34f5]/10 flex items-center justify-center">
                <Icon size={24} className="text-[#0a34f5]" />
              </div>
              <button
                onClick={skip}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-600 hover:text-foreground hover:bg-white/5 transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <h2 className="text-lg font-bold text-foreground mb-2">{current.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1.5 mt-5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step
                      ? "w-6 bg-[#0a34f5]"
                      : i < step
                      ? "w-1.5 bg-[#0a34f5]/40"
                      : "w-1.5 bg-zinc-800"
                  }`}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#1a1a1a]">
              <div>
                {!isFirst && (
                  <button
                    onClick={prev}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-foreground hover:bg-white/5 transition-all"
                  >
                    <ChevronLeft size={14} /> Anterior
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isLast && (
                  <button
                    onClick={skip}
                    className="px-3 py-1.5 rounded-lg text-xs text-zinc-600 hover:text-foreground transition-all"
                  >
                    Pular
                  </button>
                )}
                <button
                  onClick={next}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl bg-[#0a34f5] text-white text-xs font-medium hover:bg-[#0a34f5]/80 transition-all shadow-[0_0_15px_rgba(10,52,245,0.3)]"
                >
                  {isLast ? "Comecar!" : "Proximo"} <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper button to restart tour (can be placed anywhere)
export function RestartTourButton({ className }: { className?: string }) {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("restart-tour"))}
      className={className || "text-xs text-[#0a34f5] hover:underline"}
    >
      Refazer tour
    </button>
  );
}
