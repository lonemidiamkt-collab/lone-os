"use client";

// /tarefas — endereço antigo que continua valendo (notificação, WhatsApp, favoritos, Agente Lone).
//
// Quem tem Meu Trabalho vai para a vista Tarefas de lá (/my-work?view=tarefas): eram três telas para
// as mesmas tarefas. O comercial não tem Meu Trabalho, então para ele esta continua sendo a tela de
// Tarefas — mesmo componente, mesmo formulário.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { useRole } from "@/lib/context/RoleContext";
import { papelVe } from "@/lib/navegacao/menu";
import Tarefas from "./Tarefas";
import { BotaoNovaTarefa } from "./NovaTarefa";

function lerAcao(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("acao");
}

export default function TarefasPage() {
  const router = useRouter();
  const { role } = useRole();
  const vaiProMeuTrabalho = papelVe(role, "/my-work?view=tarefas");

  useEffect(() => {
    if (!vaiProMeuTrabalho) return;
    const acao = lerAcao();
    router.replace(`/my-work?view=tarefas${acao ? `&acao=${encodeURIComponent(acao)}` : ""}`);
  }, [vaiProMeuTrabalho, router]);

  if (vaiProMeuTrabalho) return null;

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Tarefas" subtitle="Crie tarefas pro time, acompanhe prazos e conclua" />
      <div className="p-6 space-y-5 animate-fade-in">
        <div className="flex items-center justify-between gap-3">
          <p className="text-lone-caption text-muted-foreground">O Lone CS cobra o que vencer.</p>
          <BotaoNovaTarefa
            abrirAoMontar={lerAcao() === "nova-tarefa"}
            aoAbrir={() => router.replace("/tarefas", { scroll: false })}
          />
        </div>
        <Tarefas />
      </div>
    </div>
  );
}
