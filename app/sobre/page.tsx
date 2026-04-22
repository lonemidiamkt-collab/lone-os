"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { Logo } from "@/components/ui/Logo";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import { supabase } from "@/lib/supabase/client";
import {
  Brain, Users, TrendingUp, Instagram, Palette, FileText, Megaphone, Zap, Lock,
  Settings, Printer, Sparkles, ChevronDown, ChevronUp, Rocket, Package,
  GitBranch, Lightbulb, HelpCircle, PlayCircle,
} from "lucide-react";

interface PlatformUpdate {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: string | null;
  created_by: string | null;
  created_at: string;
}

export default function SobrePage() {
  const { clients } = useAppState();
  const { currentProfile, role } = useRole();
  const isAdmin = role === "admin" || role === "manager";
  const [updates, setUpdates] = useState<PlatformUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>("dashboard");

  useEffect(() => {
    supabase.from("platform_updates").select("*").eq("published", true).order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setUpdates(data as PlatformUpdate[]); setLoading(false); });
  }, []);

  const activeClients = clients.filter((c) => c.status !== "onboarding" && !c.draftStatus).length;
  const linkedMetaCount = clients.filter((c) => c.metaAdAccountId).length;
  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  const handlePrint = () => window.print();
  const toggleModule = (id: string) => setExpanded((prev) => (prev === id ? null : id));

  return (
    <div className="flex flex-col flex-1 overflow-auto print:overflow-visible">
      <div className="print:hidden">
        <Header title="Sobre o Sistema" subtitle="Manual vivo do Lone OS" />
      </div>

      <div className="p-6 max-w-4xl mx-auto w-full space-y-8 animate-fade-in print:p-0 print:max-w-none">
        {/* Action bar */}
        <div className="flex items-center justify-between print:hidden">
          <p className="text-xs text-muted-foreground">Atualizado em {today} · Banco de estudo do time</p>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-foreground border border-border hover:border-primary/30 text-xs font-medium transition-colors"
          >
            <Printer size={12} /> Exportar PDF
          </button>
        </div>

        {/* Capa */}
        <section className="rounded-2xl border border-border bg-gradient-to-br from-[#0d4af5]/[0.08] via-card to-card p-10 print:p-6 print:page-break-after-always">
          <div className="flex items-center gap-4 mb-6">
            <Logo className="w-14 h-14" priority />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Lone OS</h1>
              <p className="text-sm text-muted-foreground">Sistema de Gestão Operacional · Lone Mídia</p>
            </div>
          </div>
          <p className="text-foreground text-base leading-relaxed max-w-2xl">
            Plataforma proprietária da Lone Mídia que unifica a gestão de clientes, tráfego pago,
            social media, design, contratos e comunicação em uma única interface. Construída com IA
            integrada para acelerar decisões e aumentar resultados.
          </p>
          <div className="grid grid-cols-3 gap-4 mt-8 pt-8 border-t border-border/50">
            <Stat value={clients.length.toString()} label="Clientes cadastrados" />
            <Stat value={activeClients.toString()} label="Ativos em operação" />
            <Stat value={linkedMetaCount.toString()} label="Contas Meta conectadas" />
          </div>
        </section>

        {/* Visao geral */}
        <Section title="Visão Geral" icon={Sparkles}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoCard title="Pra que serve">
              Substituir planilhas e Notion por um painel único onde CEO, gestor de tráfego, social media e designer
              trabalham integrados, com dados em tempo real e automações reduzindo retrabalho.
            </InfoCard>
            <InfoCard title="Quem usa">
              Time Lone Mídia: Roberto (CEO), Lucas (admin), Julio (tráfego), Carlos & Pedro (social), Rodrigo (designer).
              Cada cargo vê apenas o que precisa pra executar.
            </InfoCard>
            <InfoCard title="Diferencial">
              Camada de IA (GPT-4) analisa campanhas diariamente, identifica problemas e sugere ações.
              Contratos com assinatura digital automática e renovação inteligente.
            </InfoCard>
            <InfoCard title="Como usar este manual">
              Clique em qualquer módulo abaixo pra expandir e ler a explicação completa — o que faz, como usar,
              dicas práticas e perguntas frequentes.
            </InfoCard>
          </div>
        </Section>

        {/* Módulos — Accordion */}
        <Section title="Módulos do Sistema" icon={Package}>
          <p className="text-sm text-muted-foreground mb-4">
            Clique em cada módulo pra expandir e ver o manual detalhado.
          </p>
          <div className="space-y-3">
            {MODULES.map((m) => (
              <ModuleAccordion
                key={m.id}
                module={m}
                expanded={expanded === m.id}
                onToggle={() => toggleModule(m.id)}
              />
            ))}
          </div>
        </Section>

        {/* Changelog */}
        <Section title="Histórico de Atualizações" icon={GitBranch} id="changelog">
          <p className="text-sm text-muted-foreground mb-4">
            Todas as features lançadas e melhorias do sistema.
          </p>
          {loading ? (
            <div className="text-center py-8 text-xs text-muted-foreground">Carregando...</div>
          ) : updates.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">Nenhuma atualização registrada ainda.</div>
          ) : (
            <div className="space-y-3">
              {updates.map((u) => (
                <div key={u.id} className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/40 print:break-inside-avoid">
                  <div className="w-9 h-9 rounded-lg bg-[#0d4af5]/10 flex items-center justify-center shrink-0 text-lg">
                    {u.icon || "📦"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{u.title}</p>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                        u.category === "feature" ? "bg-[#0d4af5]/10 text-[#3b6ff5] border border-[#0d4af5]/20" :
                        u.category === "fix" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                        u.category === "breaking" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                        "bg-muted text-muted-foreground border border-border"
                      }`}>{u.category}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{u.description}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-2">
                      {new Date(u.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                      {u.created_by ? ` · ${u.created_by}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Roadmap — admin only */}
        {isAdmin && (
          <Section title="Roadmap" icon={Rocket}>
            <div className="mb-3 flex items-center gap-2 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1 w-fit print:hidden">
              <Lock size={10} /> Visível apenas para Admin / Manager
            </div>
            <p className="text-sm text-muted-foreground mb-4">O que vem a seguir.</p>
            <div className="space-y-3">
              {ROADMAP.map((r) => (
                <div key={r.title} className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/40">
                  <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
                    r.status === "in_progress" ? "bg-amber-400" : r.status === "next" ? "bg-[#0d4af5]" : "bg-zinc-500"
                  }`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">{r.title}</p>
                      <span className="text-[10px] text-muted-foreground">{r.eta}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{r.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Footer */}
        <div className="text-center pt-8 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Lone OS v1.0 · Manual interno · {currentProfile?.name ?? "Time Lone Mídia"}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            Gerado em {today} · Exportar em PDF via Cmd+P
          </p>
        </div>
      </div>

      {/* Print CSS */}
      <style jsx global>{`
        @media print {
          body { background: white !important; color: black !important; }
          .card, .rounded-lg, .rounded-xl, .rounded-2xl { break-inside: avoid; }
          section { break-inside: avoid-page; }
          .print\\:page-break-after-always { page-break-after: always; }
          .print\\:break-inside-avoid { break-inside: avoid; }
          .print\\:hidden { display: none !important; }
          .print\\:overflow-visible { overflow: visible !important; }
          .print\\:p-0 { padding: 0 !important; }
          .print\\:max-w-none { max-width: none !important; }
          .print\\:p-6 { padding: 1.5rem !important; }
          /* Força acordeões abertos no print */
          [data-accordion-content] { display: block !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-bold text-[#0d4af5]">{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}

function Section({ title, icon: Icon, children, id }: { title: string; icon: typeof Sparkles; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="space-y-4 print:break-inside-avoid">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <Icon size={16} className="text-[#0d4af5]" />
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 print:break-inside-avoid">
      <p className="text-xs font-semibold text-[#3b6ff5] uppercase tracking-wider mb-2">{title}</p>
      <p className="text-sm text-foreground leading-relaxed">{children}</p>
    </div>
  );
}

interface Module {
  id: string;
  icon: typeof Sparkles;
  title: string;
  shortDesc: string;
  whoUses: string;
  context: string;
  howItWorks: string[];
  features: string[];
  tips?: string[];
  faq?: { q: string; a: string }[];
}

function ModuleAccordion({ module: m, expanded, onToggle }: { module: Module; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 overflow-hidden transition-all print:break-inside-avoid">
      {/* Header — sempre visivel */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/60 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-[#0d4af5]/15 flex items-center justify-center shrink-0">
          <m.icon size={18} className="text-[#0d4af5]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-foreground">{m.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{m.shortDesc}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider hidden sm:inline">
            {expanded ? "Recolher" : "Abrir"}
          </span>
          {expanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
        </div>
      </button>

      {/* Conteudo expandido */}
      {expanded && (
        <div data-accordion-content className="px-4 pb-5 space-y-5 border-t border-border/50 pt-4 animate-fade-in">
          {/* Quem usa */}
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-muted-foreground uppercase tracking-wider">Quem usa:</span>
            <span className="px-2 py-0.5 rounded bg-[#0d4af5]/10 text-[#3b6ff5] border border-[#0d4af5]/20 font-medium">
              {m.whoUses}
            </span>
          </div>

          {/* Pra que serve */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb size={12} className="text-amber-400" />
              <p className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Pra que serve</p>
            </div>
            <p className="text-sm text-foreground leading-relaxed">{m.context}</p>
          </div>

          {/* Como funciona */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <PlayCircle size={12} className="text-[#0d4af5]" />
              <p className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Como funciona</p>
            </div>
            <ol className="space-y-2">
              {m.howItWorks.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <span className="w-5 h-5 rounded-full bg-[#0d4af5]/15 text-[#3b6ff5] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Features */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={12} className="text-[#3b6ff5]" />
              <p className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Principais features</p>
            </div>
            <ul className="space-y-1.5">
              {m.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="text-[#0d4af5] mt-0.5">•</span>
                  <span className="leading-relaxed">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Dicas */}
          {m.tips && m.tips.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb size={12} className="text-emerald-400" />
                <p className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Dicas práticas</p>
              </div>
              <ul className="space-y-1.5">
                {m.tips.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-emerald-400/90 bg-emerald-500/[0.04] border border-emerald-500/15 rounded-lg p-2">
                    <span className="shrink-0">💡</span>
                    <span className="leading-relaxed">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* FAQ */}
          {m.faq && m.faq.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <HelpCircle size={12} className="text-[#3b6ff5]" />
                <p className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Perguntas frequentes</p>
              </div>
              <div className="space-y-2">
                {m.faq.map((q, i) => (
                  <div key={i} className="rounded-lg border border-border bg-background/40 p-3">
                    <p className="text-xs font-semibold text-foreground mb-1">{q.q}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{q.a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Content ──────────────────────────────────────────────────────

const MODULES: Module[] = [
  {
    id: "dashboard",
    icon: TrendingUp,
    title: "Dashboard (Início)",
    shortDesc: "Tela inicial — visão 360° do que precisa da sua atenção hoje",
    whoUses: "Todos os perfis",
    context: "Quando você loga, a primeira coisa que vê. A ideia é responder em 30 segundos: 'onde está o fogo hoje?' e 'o que vai bem?'. Não é um relatório de números — é um alerta operacional que te aponta onde agir.",
    howItWorks: [
      "Assim que você abre o painel, o Lone OS carrega os dados de todos os clientes em tempo real.",
      "O Morning Briefing (IA) analisa cada conta e gera o plano do dia: urgências, oportunidades e o que está ok.",
      "Alertas aparecem conforme a gravidade — vermelho pra crítico, amarelo pra atenção, azul pra oportunidade.",
      "Os cards do topo mostram métricas-chave (clientes ativos, em risco, onboarding, tarefas urgentes).",
      "Novidades do Lone OS aparecem num widget azul quando há algo novo que você ainda não leu.",
    ],
    features: [
      "Briefing matinal gerado por IA com urgências e oportunidades",
      "Radar de saúde das contas (score agregado por cliente)",
      "Alertas automáticos: CTR baixo, gasto sem conversão, fadiga de criativo",
      "Card 'Clientes' clicável leva pra aba detalhada",
      "Avisos broadcast de admin aparecem em destaque no topo",
    ],
    tips: [
      "Comece o dia sempre pela Dashboard — ela já te diz o que importa, sem precisar abrir outras abas.",
      "Se você é gestor de tráfego, o Morning Briefing praticamente substitui o café da manhã técnico.",
      "Os alertas críticos usam dados reais do Meta Ads — confia neles, não são genéricos.",
    ],
  },
  {
    id: "clientes",
    icon: Users,
    title: "Clientes & Onboarding",
    shortDesc: "Cadastro completo + formulário público de onboarding pra novos clientes",
    whoUses: "Admin, Manager, Social, Designer",
    context: "É onde ficam TODOS os clientes da Lone — ativos, em onboarding, ou em risco. Cada cliente tem 10 abas de informação (dados, contratos, chat, histórico, tarefas, IA, etc). Novos clientes preenchem um formulário público pela primeira vez, sem precisar de login.",
    howItWorks: [
      "Lista de clientes em /clients — filtra por status, nicho ou responsável.",
      "Pra cadastrar novo cliente, você gera um 'Link de Onboarding' e manda pro cliente por WhatsApp.",
      "Cliente abre o link, preenche nome, CNPJ, endereço, WhatsApp, e-mail — 11 campos obrigatórios.",
      "Upload de logotipo (fica público) e contrato social (fica privado, só admin acessa).",
      "Após envio, o cadastro vai pra uma fila de 'Aguardando aprovação' — admin revisa e ativa.",
      "Depois de ativo, o cliente aparece em todas as abas do sistema (tráfego, social, design).",
    ],
    features: [
      "Formulário externo responsivo — cliente preenche pelo celular",
      "ViaCEP automático (digite CEP, endereço completo preenche)",
      "Validação CNPJ com dígitos verificadores",
      "Storage separado: logos públicas vs contratos privados (signed URLs)",
      "Briefing editável por todos os roles (tom de voz, fixo, campanha)",
      "Aba 'Análise IA' com histórico navegável de pareceres automáticos",
      "10 abas por cliente: Overview, Dados, Resultados, Análise IA, Contratos, Chat, Histórico, Tarefas, Conteúdo, Onboarding",
    ],
    tips: [
      "Antes de gerar link, verifique se o cliente já não existe — o sistema tem dedup por CNPJ/email.",
      "Se o cliente demorar pra preencher, reenvie o mesmo link — ele salva rascunhos automaticamente.",
      "O campo 'briefing fixo' é ouro: preencha uma vez com a marca do cliente e reutiliza o mês todo.",
    ],
    faq: [
      {
        q: "O cliente precisa de login pra preencher o onboarding?",
        a: "Não. O link é público e tem um token único. Só quem tem o link consegue abrir — sem cadastro, sem senha.",
      },
      {
        q: "Quem pode editar o briefing do cliente?",
        a: "Qualquer role pode (admin, manager, traffic, social, designer). A ideia é que quem trabalha com a marca mantenha a informação viva.",
      },
    ],
  },
  {
    id: "trafego",
    icon: TrendingUp,
    title: "Tráfego Pago",
    shortDesc: "Gestão de Meta Ads com IA analisando tudo em tempo real",
    whoUses: "Admin, Manager, Gestor de Tráfego",
    context: "Centro de comando do tráfego pago. Conecta direto com a API do Meta Ads pra trazer métricas reais, e usa IA (GPT-4o-mini) pra gerar análises e sugestões. O objetivo é sair do 'operacional cego' pra 'decisão informada' — a IA diz onde mexer, você executa.",
    howItWorks: [
      "Na aba /traffic, o sistema puxa campanhas ativas de todas as 26 contas Meta conectadas.",
      "Seleciona um cliente específico e clica em 'Analisar com IA' — GPT gera score 0-100 + 4 insights.",
      "Alertas críticos (rule-based) rodam em background: CTR <0.8%, CPC >R$8, fadiga, gasto sem conversão.",
      "A análise fica salva no histórico (aba Análise IA do cliente) — dá pra comparar evolução semana a semana.",
      "Kanban de tarefas de tráfego + rotina diária (checkins por cliente).",
      "Quando percebe algo grande, gera um 'Smart Handoff' pro designer com sugestão de criativo.",
    ],
    features: [
      "Integração Meta API (26 contas conectadas)",
      "Análise IA com score 0-100 + insights acionáveis",
      "Alertas rule-based em tempo real",
      "Controle de investimento mensal com alerta de pacing >90%",
      "Kanban de tarefas de tráfego + rotina diária",
      "Smart Handoff Tráfego → Design com IA sugerindo criativos",
      "Seletor de conta filtrado (só mostra contas dos clientes da carteira)",
    ],
    tips: [
      "Rode análise IA pelo menos 1x por semana por cliente — o histórico de scores mostra se está evoluindo.",
      "Se um cliente der score <50, abra imediatamente e veja os insights. Em 90% dos casos a IA acerta a causa.",
      "O alerta de 'gasto sem resultado' é o mais urgente — para o anúncio antes de queimar mais verba.",
    ],
  },
  {
    id: "social",
    icon: Instagram,
    title: "Social Media",
    shortDesc: "Kanban editorial de conteúdo + calendário + aprovação",
    whoUses: "Admin, Manager, Social, Designer",
    context: "Onde o time de social produz, aprova e agenda conteúdo. Cada post passa por um pipeline: ideia → roteiro → produção → aprovação interna → aprovação do cliente → agendado → publicado. Permite que Carlos e Pedro organizem o trabalho sem misturar com outros departamentos.",
    howItWorks: [
      "Em /social, o kanban mostra todos os cards de conteúdo do mês.",
      "Filtro automático: Carlos vê só os 12 clientes dele, Pedro vê os 14 dele.",
      "Arrasta cards entre colunas conforme avança (de Ideias pra Roteiro, depois Em Produção, etc).",
      "Quando o card chega em 'Aprovação', dispara notificação pro admin aprovar.",
      "Depois de aprovado pelo cliente, vai pra 'Agendado' — indica que já está programado na ferramenta de agendamento.",
      "Calendário editorial mostra a visão mensal de todos os posts.",
    ],
    features: [
      "Kanban com 7 colunas de pipeline editorial",
      "Filtro automático por social responsável (carteira individual)",
      "Inbox de aprovações com notificação",
      "Calendário editorial (visão mensal)",
      "Detecção de cards parados >48h (SLA violado)",
      "Banco de hashtags reutilizável",
      "Criação em lote de conteúdo mensal (20 cards de uma vez)",
    ],
    tips: [
      "Use 'criação em lote' no começo do mês pra já deixar o calendário montado.",
      "Cards parados 48h+ aparecem em vermelho — é o maior indicador de bottleneck.",
      "Quando arrastar pra 'Aprovação', escreva nota explicando o que precisa ser validado.",
    ],
  },
  {
    id: "designer",
    icon: Palette,
    title: "Designer",
    shortDesc: "Carteira de clientes + quadro de tarefas com pedidos e auto-iniciadas",
    whoUses: "Admin, Manager, Designer",
    context: "Espaço do Rodrigo. Ele tem 26 clientes atendidos como designer (os Lone Growth). Pode ver a carteira completa, ler o briefing de cada um, criar tarefas próprias (auto-iniciadas) quando quer trabalhar em algo que ele mesmo identificou, e recebe pedidos do tráfego/social no Quadro de Tarefas.",
    howItWorks: [
      "Na aba /design, o sidebar tem 4 opções: Quadro de Tarefas, Meus Clientes, Minhas Tarefas, Performance.",
      "Em 'Meus Clientes' vê o grid dos 26 clientes — logo, status, pedidos abertos, última entrega.",
      "Clica num cliente → drawer abre com briefing completo (tom de voz, branding, campanha atual).",
      "Pode editar o briefing ali mesmo (função disponível pra qualquer role).",
      "Se quiser começar uma tarefa do nada, clica 'Nova Tarefa' no Kanban — modal com cliente, título, prazo.",
      "Tarefa auto-iniciada fica marcada com tag ⚡ pra diferenciar de pedidos externos.",
    ],
    features: [
      "Grid de carteira com visual rápido (logo, stats, pedidos abertos)",
      "Drawer com briefing completo + edição inline",
      "Botão 'Nova Tarefa' pro designer criar trabalho próprio",
      "Tag '⚡ Auto-iniciada' distinguindo tarefas próprias de pedidos",
      "Upload de artes com preview",
      "Smart Handoff do Tráfego chega com sugestões IA de criativos",
      "Performance: entregas no prazo, atrasadas, breakdown por social",
    ],
    tips: [
      "Abra o drawer do cliente ANTES de começar uma tarefa — é onde está o tom de voz e o que não fazer.",
      "Se o briefing estiver vazio, preencha ali mesmo — vale pra sempre.",
      "Use tarefa auto-iniciada pra bloquear tempo de trabalho em brainstorming, não só execução.",
    ],
  },
  {
    id: "contratos",
    icon: FileText,
    title: "Contratos",
    shortDesc: "Geração local do DOCX oficial + upload manual no D4Sign + renovação automática",
    whoUses: "Admin, Manager (visibilidade restrita)",
    context: "Fluxo de contrato do zero ao envio pra assinatura. Gera DOCX preenchido com os dados do cliente, admin baixa e sobe manualmente no D4Sign (validade jurídica). O sistema monitora vencimento: 30 dias antes já cria rascunho de renovação + notifica o admin. 7 dias antes, alerta urgente.",
    howItWorks: [
      "Na aba Contratos do cliente (só admin/manager vê), clica 'Novo Contrato'.",
      "Escolhe: tipo de serviço (Lone Growth, Tráfego, Social), valor mensal, duração (3/6/12 ou personalizado), dia de pagamento.",
      "Marca se terá reajuste após período inicial — se sim, informa novo valor (vira cláusula 2.7 automática no contrato).",
      "Sistema gera PDF preliminar e salva o contrato no cofre do cliente.",
      "Admin clica 'Baixar DOCX Oficial' → recebe contrato oficial preenchido (template Lone Midia com merge de dados).",
      "Admin sobe manualmente no painel D4Sign e envia pra assinatura — D4Sign cuida do resto (email pro cliente, assinatura, certificado).",
      "9h da manhã todo dia, cron verifica contratos vencendo em 30 dias e cria rascunho V2 automático.",
      "Admin abre o rascunho, revisa, baixa o DOCX V2 e repete o fluxo de assinatura.",
    ],
    features: [
      "Template oficial Lone Midia (3 tipos: Tráfego, Social, Lone Growth) com merge de dados do cliente",
      "Cláusula de reajuste condicional (só aparece se habilitada na geração)",
      "Nicho customizado na cláusula 1.1 dos contratos de Tráfego/Lone Growth",
      "Valores por extenso automáticos (real/reais/centavos) gerados pela lib extenso",
      "Duração flexível: 3/6/12 meses ou personalizado (1-60)",
      "Renovação automática 30 dias antes do vencimento",
      "Alerta URGENTE quando faltam ≤7 dias",
      "Upload manual no D4Sign preserva validade jurídica da assinatura digital",
    ],
    tips: [
      "Sempre verifique se todos os dados do cliente estão completos ANTES de gerar — o sistema bloqueia se faltar algo.",
      "Use 'reajuste' quando o cliente quer começar com valor menor e depois normalizar.",
      "O rascunho de renovação aparece sozinho — abre, revisa valor/duração, baixa o DOCX e sobe no D4Sign.",
    ],
    faq: [
      {
        q: "Quem vê os contratos e valores?",
        a: "Apenas admin e manager. Social, tráfego e designer nunca veem essa aba — informação financeira é compartimentada.",
      },
      {
        q: "Por que upload manual no D4Sign ao invés de automação?",
        a: "O plano atual do D4Sign da Lone Midia não expõe API de template. O sistema gera o DOCX já preenchido (economizando todo o trabalho de digitação) e o admin sobe uma vez no painel pra disparar a assinatura. A validade jurídica do D4Sign é mantida 100%.",
      },
      {
        q: "Se o cliente não assinar em 7 dias, o que acontece?",
        a: "Alerta urgente chega pro admin. Você pode reenviar o link da D4Sign ou entrar em contato direto.",
      },
    ],
  },
  {
    id: "comunicados",
    icon: Megaphone,
    title: "Comunicados (Broadcasts)",
    shortDesc: "Email em massa pra toda a base com personalização automática",
    whoUses: "Admin, Manager",
    context: "Quando o Roberto quer comunicar algo importante pra todos os clientes — lançamento de feature, mudança de processo, pesquisa de satisfação — usa o Comunicados. Escreve 1 email, o sistema manda individualmente pra cada cliente com o nome do responsável substituído automaticamente. Cada cliente recebe parecendo um email pessoal.",
    howItWorks: [
      "Em /broadcasts, clica 'Novo Comunicado'.",
      "Preenche assunto e corpo (editor com negrito, itálico, listas, links).",
      "Usa tags {{nome_responsavel}} e {{empresa}} pra personalizar.",
      "Escolhe público: 'Todos ativos' ou filtra por nicho.",
      "Clica 'Enviar Teste' — recebe no próprio email pra conferir como fica.",
      "Se tá ok, clica 'Enviar para 32' — sistema manda em lotes de 10 com 300ms de delay.",
      "Cada envio fica logado com messageId e status (sent/failed).",
    ],
    features: [
      "Editor rich text (bold, itálico, listas, links)",
      "Personalização automática por destinatário",
      "Audience: Todos ativos ou filtro por nicho",
      "Envio em lotes pra não cair em spam",
      "Botão 'Enviar Teste' com email customizável",
      "Histórico completo com taxa de sucesso",
      "Layout Sober Premium (mesmo do welcome email)",
    ],
    tips: [
      "SEMPRE teste antes de enviar pra base — revisar gramática, formatação, nome no lugar certo.",
      "Use {{nome_responsavel}} em vez de 'Olá cliente' — abertura pessoal triplica a taxa de leitura.",
      "Comunicados estratégicos (lançamentos, mudanças) funcionam melhor de manhã, terça/quarta/quinta.",
    ],
  },
  {
    id: "ceo",
    icon: Lock,
    title: "Área CEO",
    shortDesc: "Dashboard executivo protegido por PIN",
    whoUses: "Admin (apenas Roberto)",
    context: "Espaço reservado pra Roberto onde ele vê a operação de cima. Tem proteção extra (PIN de 4 dígitos) porque contém relatórios quinzenais, análise de churn e visão financeira consolidada. Ninguém mais da equipe acessa, nem outros admins.",
    howItWorks: [
      "Apenas admin vê a aba 'Área CEO' no sidebar.",
      "Clica → tela de PIN aparece.",
      "Digita PIN → desbloqueia dashboard executivo.",
      "Vê relatórios quinzenais, análise de churn, métricas agregadas.",
      "Fecha a aba → PIN precisa ser digitado de novo na próxima vez.",
    ],
    features: [
      "Proteção por PIN 4 dígitos",
      "Relatórios quinzenais (Quinz Reports)",
      "Análise de churn e saúde do portfolio",
      "Visão executiva (sem dados operacionais)",
    ],
    tips: [
      "Se você é CEO, use esta área antes de reuniões estratégicas — a visão agregada ajuda a enxergar tendências.",
    ],
  },
  {
    id: "sobre",
    icon: Package,
    title: "Sobre o Sistema (este manual)",
    shortDesc: "Você está aqui — manual vivo + changelog + exportar PDF",
    whoUses: "Todos os perfis",
    context: "Esta página que você está lendo agora. É um manual interno + banco de estudo. Novos funcionários chegam, abrem aqui, aprendem o sistema. Toda vez que lançamos feature nova, aparece um card azul na Dashboard com 'Novidades' — clica, atualiza, lê, marca como lido.",
    howItWorks: [
      "Todos os roles veem 'Sobre o Sistema' no sidebar principal.",
      "Cada módulo abre em accordion (clica pra expandir, clica de novo pra recolher).",
      "Cada módulo tem: contexto, como funciona (passo-a-passo), features, dicas, FAQ.",
      "Quando tem atualização nova, a Dashboard mostra um widget azul 'Novidades'.",
      "Botão 'Exportar PDF' no topo — gera versão impressa pra passar em reunião.",
    ],
    features: [
      "Accordion expandível por módulo",
      "Widget de novidades no dashboard (marca como lido por usuário)",
      "Print CSS otimizado (PDF fica limpo)",
      "Changelog cronológico com categorias",
      "Números dinâmicos (clientes, ativos, Meta conectadas)",
    ],
    tips: [
      "Quando a equipe crescer, este vira o onboarding do novo funcionário — mande o link do /sobre.",
      "Exporte PDF antes de apresentação pra cliente ou investidor.",
      "Veja o changelog — ele conta a história de evolução do produto.",
    ],
  },
];

const ROADMAP = [
  {
    title: "Gerador de Criativos por IA",
    description: "Dado briefing + top creative da conta, GPT gera 5 variações de copy/hook/CTA pro Rodrigo produzir.",
    eta: "Próximo",
    status: "next",
  },
  {
    title: "Realocador Inteligente de Verba",
    description: "IA compara CPA/ROAS entre campanhas e sugere transferências com 1 clique.",
    eta: "Fase 3",
    status: "planned",
  },
  {
    title: "Relatório Quinzenal Automatizado",
    description: "PDF auto-gerado a cada 15 dias com análise IA enviado pro cliente.",
    eta: "Fase 2",
    status: "planned",
  },
  {
    title: "Área do Cliente Externa",
    description: "Cliente final acessa sua própria área pra ver análises, relatórios e aprovar conteúdos.",
    eta: "Q3 2026",
    status: "planned",
  },
  {
    title: "App Mobile (PWA)",
    description: "Experiência otimizada pra celular com notificações push.",
    eta: "Q4 2026",
    status: "planned",
  },
];
