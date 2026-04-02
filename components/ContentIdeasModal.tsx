"use client";

import { useState } from "react";
import { Sparkles, RefreshCw, Target, Zap, TrendingUp } from "lucide-react";
import type { Client, ToneOfVoice } from "@/lib/types";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface ContentIdea {
  title: string;
  objective: "Engajamento" | "Venda" | "Autoridade";
  hook: string;
}

const OBJECTIVE_STYLE = {
  Engajamento: { color: "text-[#0a34f5]", bg: "bg-[#0a34f5]/15 border-[#0a34f5]/20", icon: TrendingUp },
  Venda: { color: "text-[#0a34f5]", bg: "bg-[#0a34f5]/15 border-[#0a34f5]/30", icon: Target },
  Autoridade: { color: "text-[#0a34f5]", bg: "bg-[#0a34f5]/15 border-[#0a34f5]/30", icon: Zap },
};

const NICHE_IDEAS: Record<string, ContentIdea[]> = {
  Tecnologia: [
    { title: "3 ferramentas de IA que vão transformar seu negócio agora", objective: "Autoridade", hook: "A maioria das empresas ainda não sabe que isso existe" },
    { title: "Antes e depois: como a automação reduziu nosso tempo em 60%", objective: "Engajamento", hook: "De 40h semanais para 15 — mostrando o processo" },
    { title: "O erro fatal que 90% das startups cometem (e como evitar)", objective: "Autoridade", hook: "Nós cometemos o número 1 e quase encerramos as portas" },
    { title: "Caso real: como triplicamos os leads sem aumentar o orçamento", objective: "Venda", hook: "Estratégia que ninguém estava usando no setor" },
    { title: "Bastidores: um dia na nossa operação com IA", objective: "Engajamento", hook: "Revelando o que ninguém mostra por trás das câmeras" },
  ],
  Fitness: [
    { title: "3 erros que impedem você de ganhar massa (e como corrigir)", objective: "Engajamento", hook: "Provavelmente você está cometendo o número 2 agora" },
    { title: "O protocolo de 21 minutos que ninguém te conta", objective: "Autoridade", hook: "Menos tempo, mais resultado — testamos por 30 dias" },
    { title: "Transformação real: 3 meses sem dieta da moda", objective: "Venda", hook: "Resultado de aluno real — sem truques, sem photoshop" },
    { title: "Por que você não precisa de suplemento caro para evoluir", objective: "Autoridade", hook: "A indústria de R$ 4 bilhões que vive de mito" },
    { title: "Tour pela academia: o equipamento que você ignora todo dia", objective: "Engajamento", hook: "Você paga por isso e nunca usou do jeito certo" },
  ],
  Saúde: [
    { title: "5 sinais que seu corpo dá quando algo está errado (não ignore)", objective: "Autoridade", hook: "O número 3 é o mais negligenciado nos consultórios" },
    { title: "Mitos sobre saúde que a internet ainda repete em 2026", objective: "Engajamento", hook: "Desmontando o que 70% das pessoas ainda acreditam" },
    { title: "Antes da consulta: o que você deve perguntar ao seu médico", objective: "Autoridade", hook: "As 4 perguntas que poucos pacientes fazem" },
    { title: "Novo procedimento: o que é, para quem e quando indicar", objective: "Venda", hook: "Respondendo as 10 dúvidas mais comuns da nossa DM" },
    { title: "Um dia na vida: nossa rotina de atendimento", objective: "Engajamento", hook: "Bastidores de como tratamos cada paciente com cuidado" },
  ],
  Gastronomia: [
    { title: "O prato mais pedido da semana (a receita que você pediu)", objective: "Engajamento", hook: "Revelamos o segredo do nosso hit do mês" },
    { title: "Bastidores: como preparamos 200 pratos por dia", objective: "Engajamento", hook: "60 segundos no coração da nossa cozinha" },
    { title: "3 harmonizações perfeitas que você nunca tentou", objective: "Autoridade", hook: "O sommelier da casa revela o segredo de cada combinação" },
    { title: "Cardápio especial de temporada: reserve sua mesa", objective: "Venda", hook: "Vagas limitadas para o jantar desta semana" },
    { title: "Cliente especial: 10 anos celebrando aqui toda semana", objective: "Engajamento", hook: "A história por trás da nossa mesa de sempre" },
  ],
  Imobiliário: [
    { title: "3 perguntas que todo comprador deve fazer antes de fechar", objective: "Autoridade", hook: "A número 2 pode salvar você de um erro caro" },
    { title: "Antes e depois: reforma que valorizou 40% o imóvel", objective: "Engajamento", hook: "Investiu R$ 30k e recuperou R$ 120k na venda" },
    { title: "Tour virtual: o apartamento garden que acabou de entrar no mercado", objective: "Venda", hook: "Primeiro a ver, primeiro a conquistar" },
    { title: "O bairro que vai valorizar mais em 2026 (e por quê)", objective: "Autoridade", hook: "Dados que o mercado ainda não está precificando" },
    { title: "Mitos do mercado imobiliário que ainda enganam compradores", objective: "Engajamento", hook: "O mito do financiamento que custa R$ 50k desnecessários" },
  ],
  Educação: [
    { title: "Como nossos alunos conseguem emprego antes de se formar", objective: "Autoridade", hook: "O método que o mercado de cursos não ensina" },
    { title: "5 habilidades que o mercado vai exigir em 2027", objective: "Engajamento", hook: "Só 3% dos profissionais têm todas elas hoje" },
    { title: "Resultado real: aluno que passou de R$ 3k para R$ 12k em 6 meses", objective: "Venda", hook: "Sem promessa milagrosa — só método e consistência" },
    { title: "Por que cursos longos estão perdendo para microsessões", objective: "Autoridade", hook: "A ciência do aprendizado que mudou nossa metodologia" },
    { title: "Bastidores: como criamos um módulo do zero", objective: "Engajamento", hook: "Do rascunho no papel ao conteúdo que transformou carreiras" },
  ],
};

const TONE_PREFIXES: Record<ToneOfVoice, string> = {
  formal: "De forma profissional: ",
  funny: "Com humor: ",
  authoritative: "Com autoridade: ",
  casual: "De forma descontraída: ",
};

function getIdeasForClient(industry: string, tone?: ToneOfVoice): ContentIdea[] {
  const base = NICHE_IDEAS[industry] ?? [
    { title: "Os 3 maiores erros do setor (e como evitar)", objective: "Autoridade", hook: "Cometemos o número 1 e quase pagamos caro por isso" },
    { title: "Bastidores: um dia na nossa operação", objective: "Engajamento", hook: "Nunca mostramos isso — e a reação do público nos surpreendeu" },
    { title: "Resultado real de cliente: antes e depois", objective: "Venda", hook: "Sem promessas mirabolantes — só resultado concreto" },
    { title: "Por que nossos clientes ficam conosco por anos", objective: "Autoridade", hook: "A resposta vai te surpreender (não é o preço)" },
    { title: "Novidade que ninguém está usando no setor ainda", objective: "Engajamento", hook: "Fomos os primeiros a testar e os dados falam por si" },
  ];

  if (!tone || tone === "authoritative" || tone === "formal") return base;

  return base.map((idea) => ({
    ...idea,
    hook: `${TONE_PREFIXES[tone]}${idea.hook.charAt(0).toLowerCase()}${idea.hook.slice(1)}`,
  }));
}

interface Props {
  client: Client;
  onClose: () => void;
}

export default function ContentIdeasModal({ client, onClose }: Props) {
  const ideas = getIdeasForClient(client.industry, client.toneOfVoice);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const { addContentCard } = useAppState();
  const { currentUser } = useRole();

  const TONE_LABELS: Record<ToneOfVoice, string> = {
    formal: "Formal",
    funny: "Engraçado",
    authoritative: "Autoritário",
    casual: "Casual",
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="flex-row items-start justify-between px-6 py-5 border-b border-border shrink-0 space-y-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                <Sparkles size={14} className="text-primary" />
              </div>
              <DialogTitle>Gerador de Pautas</DialogTitle>
            </div>
            <p className="text-xs text-muted-foreground">
              Baseado no nicho e tom de voz de <span className="text-primary font-medium">{client.name}</span>
            </p>
          </div>
          <div className="flex gap-1.5">
            <Badge variant="secondary">{client.industry}</Badge>
            {client.toneOfVoice && (
              <Badge variant="secondary" className="text-primary border-primary/20 bg-primary/15">
                {TONE_LABELS[client.toneOfVoice]}
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* Ideas list */}
        <div className="flex-1 overflow-auto p-6 space-y-3">
          <p className="text-xs text-muted-foreground mb-4">
            5 pautas estratégicas para a semana — foco em Seg, Qua e Sex
          </p>
          {ideas.map((idea, i) => {
            const style = OBJECTIVE_STYLE[idea.objective];
            const Icon = style.icon;
            const isAdded = added.has(i);
            return (
              <Card key={i} className="p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-start gap-3">
                  <span className="text-xs text-muted-foreground font-bold mt-0.5 w-5 shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-snug mb-2">{idea.title}</p>
                    <div className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border mb-2 ${style.bg} ${style.color}`}>
                      <Icon size={10} />
                      {idea.objective}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span className="text-muted-foreground/60">Gancho: </span>
                      "{idea.hook}"
                    </p>
                  </div>
                  <Button
                    variant={isAdded ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => {
                      addContentCard({
                        title: idea.title,
                        clientId: client.id,
                        clientName: client.name,
                        socialMedia: client.assignedSocial ?? currentUser,
                        status: "ideas",
                        priority: idea.objective === "Venda" ? "high" : idea.objective === "Autoridade" ? "medium" : "low",
                        format: "Post",
                        briefing: `Gancho: ${idea.hook}\n\nObjetivo: ${idea.objective}\n\nGerado pelo sistema de pautas IA.`,
                      });
                      setAdded((prev) => new Set([...prev, i]));
                    }}
                    className={isAdded ? "text-[#0a34f5]" : ""}
                  >
                    {isAdded ? "✓ Criado no Kanban" : "+ Usar"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border">
          <p className="text-xs text-muted-foreground mr-auto">
            <RefreshCw size={10} className="inline mr-1" />
            Pautas geradas com base no nicho {client.industry}
          </p>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
