"use client";

import { useState } from "react";
import { Megaphone, Sparkles, Copy, Check, Target } from "lucide-react";
import { useAppState } from "@/lib/context/AppStateContext";
import type { Client } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface ArtDescription {
  title: string;
  description: string;
}

interface VideoScript {
  method: string;
  steps: { label: string; content: string }[];
}

interface GeneratedContent {
  artDescriptions: ArtDescription[];
  videoScript: VideoScript;
  captions: string[];
  trafficSuggestion: string;
}

function generateCampaignContent(briefing: string, client: Client): GeneratedContent {
  const niche = client.industry;
  const tone = client.toneOfVoice ?? "authoritative";
  const toneAdj = tone === "funny" ? "descontraído e divertido" : tone === "formal" ? "clean e profissional" : tone === "casual" ? "amigável e próximo" : "impactante e direto";
  const words = briefing.split(" ").filter(Boolean);
  const mainTopic = words.slice(0, 5).join(" ");
  const cta = niche === "Gastronomia" ? "Reserve sua mesa" : niche === "Fitness" ? "Matricule-se agora" : niche === "Educação" ? "Inscreva-se" : niche === "Imobiliário" ? "Agende sua visita" : "Saiba mais";

  const trafficSuggestion = `Público recomendado para impulsionamento: ${
    niche === "Fitness" ? "Mulheres e homens de 25-40 anos, interesse em academia, saúde, emagrecimento. Objetivo: Conversões. CPM estimado: R$ 8–15." :
    niche === "Gastronomia" ? "Pessoas de 28-50 anos, 5km de raio do estabelecimento, interesse em gastronomia e restaurantes. Objetivo: Alcance local. CPM estimado: R$ 5–10." :
    niche === "Educação" ? "Adultos de 22-45 anos interessados em cursos, requalificação profissional, aumento de renda. Objetivo: Geração de leads. CPM estimado: R$ 12–20." :
    niche === "Imobiliário" ? "Renda alta, 30-55 anos, interessados em imóveis e investimentos. Objetivo: Leads qualificados. CPM estimado: R$ 15–25." :
    `Adultos de 25-45 anos com interesse no setor de ${niche}. Objetivo: Awareness e conversões. Segmentação por interesses comportamentais.`
  }`;

  return {
    artDescriptions: [
      {
        title: "Arte 1 — Capa de Reels (9:16)",
        description: `Fundo com gradiente nas cores da marca. Título em destaque em fonte bold: "${mainTopic.toUpperCase()}". Layout ${toneAdj}, com espaço para logo no canto. Elemento gráfico relacionado a ${niche}. Sem texto excessivo — imagem fala por si.`,
      },
      {
        title: "Arte 2 — Carrossel Feed (1:1 · 6 slides)",
        description: `Slide 1: Gancho visual com pergunta impactante sobre o tema. Slides 2–5: Desenvolvimento passo a passo com ícones e tópicos curtos. Slide 6: CTA direto com fundo colorido e "${cta}". Tipografia consistente, paleta da marca em todos os slides.`,
      },
      {
        title: "Arte 3 — Story Interativo (9:16)",
        description: `Sticker de enquete ou contagem regressiva. Imagem de fundo relacionada a ${niche}. Texto em camadas sobrepostas com opacidade. Área inferior livre para zona de toque. Chamada curta: "${briefing.substring(0, 40)}...".`,
      },
    ],
    videoScript: {
      method: "AIDA",
      steps: [
        {
          label: "🔴 Atenção (0–3s)",
          content: `[GANCHO VISUAL — corte rápido]\nVoz/texto: "Você ainda ${niche === "Fitness" ? "luta para ter resultado na academia" : niche === "Gastronomia" ? "não encontrou o restaurante ideal" : niche === "Educação" ? "não conseguiu mudar de carreira" : "perde tempo com isso todo dia"}? Para tudo. Olha isso."`,
        },
        {
          label: "🟡 Interesse (3–15s)",
          content: `Mostrar o problema de forma visual.\nVoz: "A maioria das pessoas ${niche === "Fitness" ? "treina errado por anos sem perceber" : niche === "Gastronomia" ? "fica de restaurante em restaurante sem experiência real" : "estuda muito mas não aplica o que aprendeu"}. E o resultado? ${mainTopic}."`,
        },
        {
          label: "🟢 Desejo (15–45s)",
          content: `Apresentar a solução com prova social.\nVoz: "Com o nosso método/serviço, você consegue [benefício principal]. [Nome de cliente/caso real] saiu de [situação antes] para [resultado em X dias/semanas]. Sem enrolação."`,
        },
        {
          label: "🔵 Ação (45–60s)",
          content: `[TELA FINAL COM CTA]\nVoz: "${cta} — link na bio. Vagas/disponibilidade limitada. Não espera para amanhã o que você pode resolver hoje."`,
        },
      ],
    },
    captions: [
      `🎯 ${mainTopic}\n\nVocê sabia que ${niche === "Fitness" ? "80% das pessoas desistem da academia nos primeiros 3 meses" : niche === "Gastronomia" ? "a experiência gastronômica vai muito além da comida" : niche === "Educação" ? "aprender a habilidade certa pode mudar seu salário em 6 meses" : "pequenas mudanças geram grandes resultados"}?\n\n${briefing.substring(0, 100)}...\n\n💬 Comenta aqui: você já passou por isso?\n↓ Salva esse post para não esquecer\n\n#${niche.toLowerCase().replace(/\s/g, "")} #resultados #${niche === "Fitness" ? "treino #academia #saude" : niche === "Gastronomia" ? "gastronomia #restaurante #foodie" : niche === "Educação" ? "educacao #curso #carreira" : "negocio #marketing #crescimento"}`,
      `A verdade sobre ${niche.toLowerCase()} que poucos falam 👇\n\n${briefing.substring(0, 80)}...\n\nSe você quer [resultado], o primeiro passo é [ação]. Mas a maioria nunca começa porque [objeção comum].\n\nNós já ajudamos + de [X] pessoas a superar isso.\n\nQuer saber como? Clica no link da bio 👆\n\n#${niche.toLowerCase().replace(/\s/g, "")} #dica #${cta.toLowerCase().replace(/\s/g, "")}`,
    ],
    trafficSuggestion,
  };
}

interface Props {
  client: Client;
  onClose: () => void;
}

export default function CampaignModal({ client, onClose }: Props) {
  const { updateClientData } = useAppState();
  const [briefing, setBriefing] = useState(client.campaignBriefing ?? "");
  const [generated, setGenerated] = useState<GeneratedContent | null>(null);
  const [generating, setGenerating] = useState(false);
  const [activeSection, setActiveSection] = useState<"art" | "video" | "caption" | "traffic">("art");
  const [copied, setCopied] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleGenerate = () => {
    if (!briefing.trim()) return;
    setGenerating(true);
    setTimeout(() => {
      setGenerated(generateCampaignContent(briefing, client));
      setGenerating(false);
    }, 800);
  };

  const handleSaveBriefing = () => {
    updateClientData(client.id, { campaignBriefing: briefing });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="flex-row items-center justify-between px-6 py-5 border-b border-border shrink-0 space-y-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Megaphone size={16} className="text-[#3b6ff5]" />
              <DialogTitle>Campanha do Mês</DialogTitle>
              <Badge variant="secondary" className="text-primary border-primary/20 bg-primary/15">IA Copywriter</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{client.name} · {client.industry}</p>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-6 space-y-5">
          {/* Briefing input */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">
              Briefing da Campanha
              <span className="text-muted-foreground/60 ml-2 font-normal">Descreva o objetivo, oferta e público da campanha deste mês</span>
            </label>
            <Textarea
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              rows={4}
              placeholder="Ex: Lançamento do novo programa de emagrecimento em 12 semanas. Público: mulheres 25-45 anos que já tentaram de tudo. Oferta: matrícula com 30% de desconto + acompanhamento nutricional. Objetivo: 50 matrículas no mês."
            />
            <div className="flex items-center gap-2 mt-2">
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={!briefing.trim() || generating}
                className="flex items-center gap-2"
              >
                <Sparkles size={13} />
                {generating ? "Gerando..." : "Gerar com IA"}
              </Button>
              <Button
                size="sm"
                variant={saved ? "secondary" : "ghost"}
                onClick={handleSaveBriefing}
                disabled={!briefing.trim()}
                className={saved ? "text-[#0a34f5]" : ""}
              >
                {saved ? "✓ Salvo" : "Salvar Briefing"}
              </Button>
            </div>
          </div>

          {/* Generated content */}
          {generated && (
            <div className="animate-in fade-in-0 space-y-4">
              <div className="flex gap-1 border-b border-border pb-0 -mb-4">
                {(["art", "video", "caption", "traffic"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setActiveSection(s)}
                    className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                      activeSection === s ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s === "art" ? "🎨 Descrições de Arte" : s === "video" ? "🎬 Roteiro de Vídeo" : s === "caption" ? "📝 Copy de Legenda" : "🎯 Sugestão de Tráfego"}
                  </button>
                ))}
              </div>

              {activeSection === "art" && (
                <div className="space-y-3 pt-2">
                  {generated.artDescriptions.map((art, i) => (
                    <Card key={i} className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-xs font-semibold text-foreground">{art.title}</p>
                        <button
                          onClick={() => handleCopy(art.description, `art-${i}`)}
                          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        >
                          {copied === `art-${i}` ? <Check size={13} className="text-[#0a34f5]" /> : <Copy size={13} />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{art.description}</p>
                    </Card>
                  ))}
                </div>
              )}

              {activeSection === "video" && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-primary border-primary/20 bg-primary/15">Framework AIDA</Badge>
                    <span className="text-xs text-muted-foreground">Duração sugerida: 30–60 segundos</span>
                  </div>
                  {generated.videoScript.steps.map((step, i) => (
                    <Card key={i} className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-xs font-semibold text-foreground">{step.label}</p>
                        <button onClick={() => handleCopy(step.content, `step-${i}`)} className="text-muted-foreground hover:text-foreground transition-colors">
                          {copied === `step-${i}` ? <Check size={13} className="text-[#0a34f5]" /> : <Copy size={13} />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{step.content}</p>
                    </Card>
                  ))}
                </div>
              )}

              {activeSection === "caption" && (
                <div className="space-y-3 pt-2">
                  {generated.captions.map((caption, i) => (
                    <Card key={i} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-foreground">Legenda {i + 1}</p>
                        <button onClick={() => handleCopy(caption, `cap-${i}`)} className="text-muted-foreground hover:text-foreground transition-colors">
                          {copied === `cap-${i}` ? <Check size={13} className="text-[#0a34f5]" /> : <Copy size={13} />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{caption}</p>
                    </Card>
                  ))}
                </div>
              )}

              {activeSection === "traffic" && generated && (
                <Card className="p-5 mt-4 border-primary/20 bg-primary/5">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                      <Target size={16} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Sugestão de Público para Tráfego Pago</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Repasse ao gestor de tráfego para impulsionar este conteúdo</p>
                    </div>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{generated.trafficSuggestion}</p>
                  <button
                    onClick={() => handleCopy(generated.trafficSuggestion, "traffic")}
                    className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copied === "traffic" ? <Check size={12} className="text-[#0a34f5]" /> : <Copy size={12} />}
                    {copied === "traffic" ? "Copiado!" : "Copiar sugestão"}
                  </button>
                </Card>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
