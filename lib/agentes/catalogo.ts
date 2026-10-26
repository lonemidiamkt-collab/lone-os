// lib/agentes/catalogo.ts — OS AGENTES DE IA DA LONE, UM POR ENTRADA.
//
// 25/10/2026: o Roberto não sabia quais nem quantos agentes o Lone OS tem. Contados no código e
// conferidos um a um: eram 50 capacidades que chamam IA (todas na OpenAI), em 64 pontos do código.
// O Morning Briefing saiu na faxina do mesmo dia (tela desmontada, rota sem quem chamasse) — ficam 49.
// Existe UM agente com nome, o Loninho; o resto são capacidades dele ou rotinas em volta.
//
// Este arquivo é a fonte da verdade da Central de Agentes (/agentes). Cada agente diz:
//   · o que faz, de que área é e quem no time responde por ele;
//   · até onde ele chega (alcance): só sugere, grava, fala com o time, fala com o cliente, mexe na Meta;
//   · o que o põe para rodar (gatilho) e o que o desliga (interruptor);
//   · as ETIQUETAS (`origens`) com que as chamadas dele chegam em llm_calls. Toda chamada de IA do
//     código leva uma etiqueta daqui — o tipo `OrigemIa` não aceita outra, e
//     tests/agentes-etiqueta.test.ts quebra se alguma chamada sair sem.
//
// Criou um agente novo ou uma chamada de IA nova? Entra aqui no mesmo commit, com etiqueta própria.
// Etiqueta terminada em ":*" cobre um prefixo (a prospecção monta o nome da mensagem na hora).
//
// Custo em dinheiro NÃO entra aqui nem na tela: é número da agência e fica fora do Lone OS.

export type Area = "Atendimento" | "Social e conteúdo" | "Design" | "Tráfego" | "Comercial" | "Gestão";

export const AREAS: readonly Area[] = ["Atendimento", "Social e conteúdo", "Design", "Tráfego", "Comercial", "Gestão"];

/** Até onde o agente chega, do mais contido ao que mais pesa. Vale o MAIOR alcance que ele tem. */
export type Alcance = "sugere" | "grava" | "time" | "cliente" | "meta";

export const ALCANCES: readonly Alcance[] = ["sugere", "grava", "time", "cliente", "meta"];

export const ROTULO_ALCANCE: Record<Alcance, string> = {
  sugere: "Só sugere",
  grava: "Grava no sistema",
  time: "Fala com o time",
  cliente: "Fala com o cliente",
  meta: "Mexe na Meta",
};

export type Gatilho =
  /** Rotina agendada. O horário mora no registro da Central de Automações (lib/automacoes/registro.ts). */
  | { tipo: "cron"; automacao: string }
  /** Mensagem que chega no WhatsApp (webhook /api/cs/inbound): de cliente, ou alguém chamando o Loninho. */
  | { tipo: "webhook"; quando: string }
  /** Alguém clica no painel. */
  | { tipo: "botao"; onde: string }
  /** O próprio sistema dispara, no meio de outro fluxo (ex.: ao entregar a arte). */
  | { tipo: "evento"; quando: string }
  /** Sem botão e sem agenda: só chamando a rota. */
  | { tipo: "manual"; como: string };

export type Interruptor =
  /** O interruptor geral do Loninho, na Central de Agentes: desliga a leitura dos grupos (webhook). */
  | { tipo: "loninho" }
  /** Liga/desliga de uma rotina na Central de Automações. */
  | { tipo: "automacao"; job: string }
  /**
   * Variável do servidor. `on`: liga só com o valor "on". `lista`: a lista diz quem entra (vazia = ninguém
   * ou todos, conforme `significado`). `existe`: liga quando está preenchida.
   */
  | { tipo: "env"; variavel: string; modo: "on" | "lista" | "existe"; significado: string }
  /** Chave em agency_settings. `on`: só "on". `modo-ia`: off | revisao | on. `voz`: só escolhe a voz. */
  | { tipo: "agency_settings"; chave: string; modo: "on" | "modo-ia"; significado: string }
  /** Uma constante no código decide (mudar exige deploy). */
  | { tipo: "constante"; onde: string; significado: string };

export interface Agente {
  /** Estável: é a chave da tela e dos testes. */
  id: string;
  /** Único. É assim que o time chama. */
  nome: string;
  faz: string;
  area: Area;
  /** Quem no time responde por ele (função). */
  dono: string;
  alcance: Alcance;
  gatilhos: readonly Gatilho[];
  interruptores: readonly Interruptor[];
  /** Etiquetas das chamadas de IA dele em llm_calls. A primeira é a principal. */
  origens: readonly string[];
  /** Origens em agent_runs que são execuções dele (o "inbound" é do Loninho inteiro, não entra aqui). */
  execucoes?: readonly string[];
  /** Roda dentro do webhook do Loninho: o interruptor geral desliga. */
  noLoninho?: boolean;
  /** De propósito: em sombra (grava e não manda) ou desligado. */
  situacao?: "sombra" | "desligado";
  /** O que o dono precisa saber (ex.: grava sem o "ok" do time). */
  atencao?: string;
  modelo: string;
  arquivos: readonly string[];
  /**
   * Para o que roda a cada mensagem: sem nenhuma execução por mais que isto = parado. As rotinas usam o
   * maxSilencioHoras do registro da Central de Automações; botão e comando não têm prazo.
   */
  silencioMaxHoras?: number;
}

// Os mesmos interruptores aparecem em muitos agentes do Loninho.
const LONINHO = { tipo: "loninho" } as const;
const GRUPOS_LIDOS = {
  tipo: "env", variavel: "CS_PILOT_GROUP_JIDS", modo: "lista",
  significado: "Grupos de cliente que o Loninho lê. Com grupos na lista, o resto é ignorado; vazia, lê todos.",
} as const;
const MSG_CLIENTE = { tipo: "webhook", quando: "Mensagem de cliente nos grupos que o Loninho lê" } as const;
const COMANDO = (exemplo: string) => ({ tipo: "webhook", quando: `Alguém do time chama no grupo: “${exemplo}”` }) as const;

export const AGENTES = [
  // ── Atendimento: o Loninho e as rotinas do CS ────────────────────────────────────────────────
  {
    id: "classificador", nome: "Classificador de pedidos",
    faz: "Lê a mensagem do cliente e diz se é pedido, de que tipo e com que urgência. Vira sugestão no grupo do time.",
    area: "Atendimento", dono: "Social media", alcance: "time",
    gatilhos: [MSG_CLIENTE], interruptores: [LONINHO, GRUPOS_LIDOS],
    origens: ["cs:classificador"], noLoninho: true, silencioMaxHoras: 72,
    modelo: "gpt-4o-mini", arquivos: ["lib/cs/classifier.ts", "app/api/cs/inbound/route.ts"],
  },
  {
    id: "verificador", nome: "Verificador",
    faz: "Dá a segunda opinião quando o classificador fica em dúvida, para cortar falso pedido antes de incomodar o time.",
    area: "Atendimento", dono: "Social media", alcance: "sugere",
    gatilhos: [{ tipo: "webhook", quando: "Mensagem de cliente que o classificador marcou com confiança média" }],
    interruptores: [LONINHO, GRUPOS_LIDOS],
    origens: ["cs:verificador"], noLoninho: true,
    modelo: "gpt-4o", arquivos: ["lib/cs/verifier.ts"],
  },
  {
    id: "redator-pedido", nome: "Redator do pedido",
    faz: "Escreve o pedido claro para o designer ou o social; se o cliente foi vago, lista o que falta perguntar.",
    area: "Atendimento", dono: "Social media", alcance: "time",
    gatilhos: [{ tipo: "webhook", quando: "Mensagem de cliente que virou pedido" }], interruptores: [LONINHO, GRUPOS_LIDOS],
    origens: ["cs:redator-pedido"], noLoninho: true,
    modelo: "gpt-4o", arquivos: ["lib/cs/briefing.ts"],
  },
  {
    id: "rascunho-resposta", nome: "Rascunho de resposta",
    faz: "Deixa pronto, no grupo do time, o texto de resposta ao cliente para o social copiar e mandar.",
    area: "Atendimento", dono: "Social media", alcance: "time",
    gatilhos: [{ tipo: "webhook", quando: "Dúvida, cobrança de prazo ou reclamação do cliente" }], interruptores: [LONINHO, GRUPOS_LIDOS],
    origens: ["cs:rascunho-resposta"], noLoninho: true,
    modelo: "gpt-4o-mini", arquivos: ["lib/cs/resposta.ts"],
  },
  {
    id: "transcricao-audio", nome: "Transcrição de áudio",
    faz: "Transforma em texto a nota de voz que chega nos grupos (de cliente, de vendas e do onboarding).",
    area: "Atendimento", dono: "Social media", alcance: "grava",
    gatilhos: [{ tipo: "webhook", quando: "Todo áudio nos grupos que o Loninho lê" }], interruptores: [LONINHO, GRUPOS_LIDOS],
    origens: ["cs:transcribe"], noLoninho: true, silencioMaxHoras: 72,
    modelo: "whisper-1", arquivos: ["lib/cs/transcribe.ts"],
  },
  {
    id: "leitura-imagem", nome: "Leitura de imagem",
    faz: "Transforma em texto a foto ou o print que o cliente manda (preço, panfleto, referência); pode avançar o card.",
    area: "Atendimento", dono: "Social media", alcance: "grava",
    gatilhos: [{ tipo: "webhook", quando: "Toda imagem nos grupos que o Loninho lê" }], interruptores: [LONINHO, GRUPOS_LIDOS],
    origens: ["cs:vision"], noLoninho: true, silencioMaxHoras: 72,
    modelo: "gpt-4o-mini", arquivos: ["lib/cs/vision.ts"],
  },
  {
    id: "termometro", nome: "Termômetro",
    faz: "Percebe insatisfação ou risco de saída na mensagem do cliente. Quem decide se vira alerta é um portão em código.",
    area: "Atendimento", dono: "Sócios", alcance: "time",
    gatilhos: [MSG_CLIENTE], interruptores: [LONINHO, GRUPOS_LIDOS],
    origens: ["cs:termometro"], noLoninho: true, silencioMaxHoras: 72,
    modelo: "gpt-4o-mini", arquivos: ["lib/cs/sentimento.ts", "lib/cs/portao-satisfacao.ts"],
  },
  {
    id: "detector-aprovacao", nome: "Detector de aprovação",
    faz: "Entende o “pode postar” do cliente e marca a arte como aprovada.",
    area: "Atendimento", dono: "Social media", alcance: "grava",
    gatilhos: [{ tipo: "webhook", quando: "Mensagem do cliente com arte aguardando aprovação dele" }], interruptores: [LONINHO, GRUPOS_LIDOS],
    origens: ["cs:aprovacao"], noLoninho: true,
    modelo: "gpt-4o-mini", arquivos: ["lib/cs/aprovacao.ts"],
  },
  {
    id: "datas-eventos", nome: "Datas e eventos",
    faz: "Quando o cliente fala de uma data futura (“promoção dia 12”), cria o lembrete no calendário do social.",
    area: "Atendimento", dono: "Social media", alcance: "time",
    gatilhos: [{ tipo: "webhook", quando: "Mensagem de cliente que menciona uma data" }], interruptores: [LONINHO, GRUPOS_LIDOS],
    origens: ["cs:evento"], noLoninho: true,
    modelo: "gpt-4o-mini", arquivos: ["lib/cs/evento.ts"],
  },
  {
    id: "aprende-correcao", nome: "Aprende com a correção",
    faz: "Quando o cliente corrige uma arte ou legenda, tira a lição que vale para sempre e propõe como regra do cliente, no grupo do time, com o código para salvar.",
    area: "Atendimento", dono: "Sócios", alcance: "time",
    gatilhos: [{ tipo: "webhook", quando: "Pedido de ajuste ou reclamação do cliente" }], interruptores: [LONINHO, GRUPOS_LIDOS],
    origens: ["cs:aprende-correcao"], noLoninho: true,
    atencao: "Desde 26/10/2026 a regra só vale com o ok de um gestor (ok + código); sem resposta em 14 dias, some.",
    modelo: "gpt-4o-mini", arquivos: ["lib/cs/aprender-correcao.ts"],
  },
  {
    id: "leitor-resposta-time", nome: "Leitor da resposta do time",
    faz: "Entende a resposta solta do time a uma sugestão do Loninho (aprovou, recusou ou já mandou a informação).",
    area: "Atendimento", dono: "Social media", alcance: "grava",
    gatilhos: [{ tipo: "webhook", quando: "Resposta no grupo do time a uma sugestão do Loninho" }], interruptores: [LONINHO],
    origens: ["cs:leitor-resposta-time"], noLoninho: true,
    modelo: "gpt-4o", arquivos: ["lib/cs/interpreter.ts"],
  },
  {
    id: "conversa-time", nome: "Conversa com o time",
    faz: "Responde, com os dados do sistema, quando alguém chama “Loninho, …” e não é um comando conhecido.",
    area: "Atendimento", dono: "Sócios", alcance: "time",
    gatilhos: [COMANDO("Loninho, …")], interruptores: [LONINHO],
    origens: ["cs:conversa"], noLoninho: true,
    modelo: "gpt-4o", arquivos: ["lib/cs/conversa.ts"],
  },
  {
    id: "ferias-ausencia", nome: "Férias e ausência",
    faz: "Registra quem do time está fora e até quando, para não mandar pedido para quem não está.",
    area: "Atendimento", dono: "Sócios", alcance: "grava",
    gatilhos: [COMANDO("Loninho, o Fulano está de férias até dia 15")], interruptores: [LONINHO],
    origens: ["cs:ausencia"], noLoninho: true,
    modelo: "gpt-4o-mini", arquivos: ["lib/cs/ausencia.ts"],
  },
  {
    id: "onboarding", nome: "Onboarding",
    faz: "Faz as perguntas de boas-vindas no grupo do cliente novo, uma por vez, e monta o briefing com as respostas.",
    area: "Atendimento", dono: "Sócios", alcance: "cliente",
    gatilhos: [COMANDO("Loninho, entrou um cliente novo, o X no grupo Y")], interruptores: [LONINHO],
    origens: ["cs:onboarding"], noLoninho: true,
    modelo: "gpt-4o-mini e gpt-4o", arquivos: ["lib/cs/onboarding.ts"],
  },
  {
    id: "cobranca-pendencias", nome: "Cobrança de pendências",
    faz: "Escreve a cobrança de material ou aprovação para o cliente, explicando o que cada pendência trava. Só sai com “ok”.",
    area: "Atendimento", dono: "Social media", alcance: "cliente",
    gatilhos: [COMANDO("Loninho, cobra as pendências do X")], interruptores: [LONINHO],
    origens: ["cs:cobranca"], noLoninho: true,
    modelo: "gpt-4o", arquivos: ["lib/cs/cobranca.ts"],
  },
  {
    id: "preparo-reuniao", nome: "Preparo de reunião",
    faz: "Junta o momento do cliente e sugere os pontos para puxar na reunião.",
    area: "Atendimento", dono: "Gestor do cliente", alcance: "time",
    gatilhos: [COMANDO("Loninho, prepara a reunião do X"), { tipo: "botao", onde: "Reuniões do cliente e agenda" }],
    interruptores: [LONINHO],
    origens: ["cs:reuniao-preparo"],
    modelo: "gpt-4o-mini", arquivos: ["lib/cs/reuniao.ts", "app/api/reunioes/gerenciar/route.ts"],
  },
  {
    id: "resumo-reuniao", nome: "Resumo de reunião",
    faz: "Tira das notas da reunião as decisões, as próximas ações e as pendências, e grava na jornada do cliente.",
    area: "Atendimento", dono: "Gestor do cliente", alcance: "grava",
    gatilhos: [COMANDO("Loninho, resumo da reunião do X: …")], interruptores: [LONINHO],
    origens: ["cs:reuniao-resumo"], noLoninho: true,
    modelo: "gpt-4o", arquivos: ["lib/cs/reuniao.ts"],
  },
  {
    id: "transcricao-reuniao", nome: "Transcrição de reunião",
    faz: "Lê a transcrição da reunião e guarda como memória do cliente: pontos de atenção e o que repescar.",
    area: "Atendimento", dono: "Gestor do cliente", alcance: "grava",
    gatilhos: [{ tipo: "botao", onde: "Reuniões do cliente" }],
    interruptores: [],
    origens: ["cs:reuniao-transcricao"],
    modelo: "gpt-4o", arquivos: ["lib/cs/reuniao-transcricao.ts", "app/api/reunioes/transcricao/route.ts"],
  },
  {
    id: "mensagem-quarta-sexta", nome: "Mensagem de quarta e sexta",
    faz: "Escreve a mensagem de meio e fim de semana no grupo do cliente a partir do que aconteceu na conta; antes, confere se o cliente já falou da arte.",
    area: "Atendimento", dono: "Sócios", alcance: "cliente",
    gatilhos: [{ tipo: "cron", automacao: "client-messages-wed" }, { tipo: "cron", automacao: "client-messages-fri" }],
    interruptores: [
      { tipo: "agency_settings", chave: "cs_msg_ia_enabled", modo: "modo-ia",
        significado: "Desligada: vai o texto fixo de sempre. Em revisão: o texto da IA vai para o grupo do time ler. Ligada: vai para o cliente." },
      { tipo: "automacao", job: "client-messages-wed" }, { tipo: "automacao", job: "client-messages-fri" },
    ],
    origens: ["cs:mensagem-cliente", "cs:leu-a-arte"],
    modelo: "gpt-4o-mini", arquivos: ["lib/cs/mensagem-cliente.ts", "lib/cs/leu-a-arte.ts", "app/api/system/client-messages/route.ts"],
  },
  {
    id: "revisor", nome: "Revisor",
    faz: "Revisa com olho de CS o roteiro e o calendário antes de mandar: aprova, pede ajuste ou manda refazer.",
    area: "Atendimento", dono: "Sócios", alcance: "sugere",
    gatilhos: [{ tipo: "webhook", quando: "Dentro dos comandos de roteiro e calendário" }], interruptores: [LONINHO],
    origens: ["cs:revisor"], noLoninho: true,
    modelo: "gpt-4o-mini", arquivos: ["lib/cs/revisor.ts"],
  },
  {
    id: "regras-semana", nome: "Regras da semana",
    faz: "Lê as conversas da semana com cada cliente e propõe até 2 regras novas por cliente, que esperam o ok no resumo de segunda.",
    area: "Atendimento", dono: "Sócios", alcance: "grava",
    gatilhos: [{ tipo: "cron", automacao: "cs-briefing-update" }],
    interruptores: [{ tipo: "automacao", job: "cs-briefing-update" }],
    origens: ["cs:regras-semana"],
    atencao: "Desde 26/10/2026 só propõe: a regra vale depois do ok de um gestor no resumo de segunda (Regras esperando ok).",
    modelo: "gpt-4o-mini", arquivos: ["app/api/system/cs-briefing-update/route.ts"],
  },
  {
    id: "releitura-ciclo", nome: "Releitura do ciclo",
    faz: "Relê pedido, entrega, correção e aprovação de cada arte e propõe até 2 regras por cliente, que esperam o ok no resumo de segunda.",
    area: "Atendimento", dono: "Sócios", alcance: "grava",
    gatilhos: [{ tipo: "cron", automacao: "cs-releitura" }],
    interruptores: [{ tipo: "automacao", job: "cs-releitura" }],
    origens: ["cs:releitura"],
    atencao: "Desde 26/10/2026 só propõe: a regra vale depois do ok de um gestor no resumo de segunda (Regras esperando ok).",
    modelo: "gpt-4o-mini", arquivos: ["app/api/system/cs-releitura/route.ts"],
  },
  {
    id: "faxina-regras", nome: "Faxina de regras",
    faz: "Desativa as regras de cliente velhas, repetidas ou que não servem para agir.",
    area: "Atendimento", dono: "Sócios", alcance: "grava",
    gatilhos: [{ tipo: "manual", como: "Chamando /api/system/cs-faxina-regras (não tem agenda nem botão)" }],
    interruptores: [],
    origens: ["cs:faxina-regras"],
    modelo: "gpt-4o-mini", arquivos: ["app/api/system/cs-faxina-regras/route.ts"],
  },
  {
    id: "estilo-comunicacao", nome: "Estilo de comunicação",
    faz: "Resume como cada cliente e o time escrevem, para o Loninho falar no tom da casa.",
    area: "Atendimento", dono: "Sócios", alcance: "grava",
    gatilhos: [{ tipo: "cron", automacao: "cs-estilo" }],
    interruptores: [{ tipo: "automacao", job: "cs-estilo" }],
    origens: ["cs:estilo"],
    modelo: "gpt-4o-mini", arquivos: ["app/api/system/cs-estilo/route.ts"],
  },
  {
    id: "ramo-cliente", nome: "Ramo do cliente",
    faz: "Descobre o ramo do cliente quando o cadastro não diz.",
    area: "Atendimento", dono: "Sócios", alcance: "grava",
    gatilhos: [{ tipo: "cron", automacao: "cs-nichos" }],
    interruptores: [{ tipo: "automacao", job: "cs-nichos" }],
    origens: ["cs:nichos"],
    modelo: "gpt-4o-mini", arquivos: ["app/api/system/cs-nichos/route.ts"],
  },
  {
    id: "briefing-estrategico", nome: "Briefing inicial",
    faz: "Monta o briefing estratégico do cliente a partir de todo o material que existe dele (cadastro, onboarding, conversas).",
    area: "Atendimento", dono: "Social media", alcance: "grava",
    gatilhos: [{ tipo: "cron", automacao: "cs-briefing-inicial" }, { tipo: "botao", onde: "Ficha do cliente › Briefing estratégico" }],
    interruptores: [{ tipo: "automacao", job: "cs-briefing-inicial" }],
    origens: ["cs:briefing-estrategico"],
    atencao: "A rotina de terça grava o briefing de quem não tem direto, marcado como gerado por IA. Pelo botão, só grava quando alguém salva.",
    modelo: "gpt-4o", arquivos: ["lib/cs/enriquecer-briefing.ts", "app/api/system/cs-briefing-inicial/route.ts", "app/api/cs/enriquecer-briefing/route.ts"],
  },
  {
    id: "feedback-cliente", nome: "Feedback do cliente",
    faz: "Classifica o feedback do cliente que o time digita (elogio, crítica, pedido) e o tema.",
    area: "Atendimento", dono: "Social media", alcance: "grava",
    gatilhos: [{ tipo: "botao", onde: "Ficha do cliente › Relacionamento e etapa de design" }],
    interruptores: [],
    origens: ["cs:feedback-cliente"],
    modelo: "gpt-4o-mini", arquivos: ["app/api/clients/[id]/feedback/route.ts"],
  },
  {
    id: "diagnostico-comercial", nome: "Diagnóstico comercial",
    faz: "Lê as respostas de estruturação comercial do cliente e devolve SWOT, prioridades de 90 dias e scripts de venda.",
    area: "Atendimento", dono: "Sócios", alcance: "sugere",
    gatilhos: [{ tipo: "botao", onde: "Ficha Viva 360 › Analisar" }],
    interruptores: [],
    origens: ["cs:diagnostico-comercial"],
    modelo: "gpt-4o", arquivos: ["lib/cs/diagnostico-comercial.ts", "app/api/clients/[id]/ficha-viva/analyze/route.ts"],
  },
  {
    id: "produtos-briefing", nome: "Produtos do briefing",
    faz: "Completa o catálogo de produtos do cliente com o que o briefing e as regras citam e ainda não está lá.",
    area: "Atendimento", dono: "Social media", alcance: "grava",
    gatilhos: [{ tipo: "manual", como: "Chamando /api/system/produtos-do-briefing (não está no crontab)" }],
    interruptores: [],
    origens: ["cliente:produtos-briefing"], execucoes: ["cron:produtos-do-briefing"],
    modelo: "gpt-4o-mini", arquivos: ["lib/clients/produtos-do-briefing.ts", "app/api/system/produtos-do-briefing/route.ts"],
  },

  // ── Social e conteúdo ────────────────────────────────────────────────────────────────────────
  {
    id: "roteiros", nome: "Roteiros (Agente Criativo)",
    faz: "Escreve 2 ou 3 roteiros de vídeo no Método Lone e manda em PDF.",
    area: "Social e conteúdo", dono: "Social media", alcance: "time",
    gatilhos: [COMANDO("Loninho, roteiro para o X"), { tipo: "cron", automacao: "cs-roteiro-semanal" }],
    interruptores: [
      LONINHO, { tipo: "automacao", job: "cs-roteiro-semanal" },
      { tipo: "constante", onde: "app/api/system/cs-roteiro-semanal/route.ts (CARTEIRA_REAL e TEST_PATTERNS)",
        significado: "A rotina de segunda só roda para 7 clientes de teste fixos no código." },
    ],
    origens: ["social:roteiros"],
    modelo: "gpt-4o", arquivos: ["lib/cs/criativo.ts", "lib/cs/roteiro-pdf.ts", "app/api/system/cs-roteiro-semanal/route.ts"],
  },
  {
    id: "pauta-semanal", nome: "Pauta semanal",
    faz: "Propõe a pauta da semana seguinte de cada cliente; o “ok” do time cria os cards.",
    area: "Social e conteúdo", dono: "Social media", alcance: "time",
    gatilhos: [{ tipo: "cron", automacao: "cs-pauta" }, COMANDO("Loninho, pauta do X")],
    interruptores: [
      LONINHO, { tipo: "automacao", job: "cs-pauta" },
      { tipo: "env", variavel: "CS_PAUTA_CLIENT_IDS", modo: "lista", significado: "Clientes da rotina de sexta. Vazia, entram os 3 primeiros com briefing (piloto)." },
    ],
    origens: ["social:pauta-semanal"],
    modelo: "gpt-4o", arquivos: ["lib/cs/pauta.ts", "app/api/system/cs-pauta/route.ts"],
  },
  {
    id: "calendario-estrategico", nome: "Calendário estratégico",
    faz: "Diagnostica o cliente, decide o objetivo do período e as peças, e escreve cada uma com o porquê.",
    area: "Social e conteúdo", dono: "Social media", alcance: "time",
    gatilhos: [COMANDO("Loninho, calendário do X"), { tipo: "botao", onde: "Planejamento e ficha do cliente › Marca" }],
    interruptores: [LONINHO],
    origens: ["social:calendario"],
    modelo: "gpt-4o", arquivos: ["lib/cs/motor.ts", "app/api/cs/calendario/route.ts"],
  },
  {
    id: "datas-comemorativas", nome: "Datas comemorativas",
    faz: "Sugere uma ideia de post por cliente para as datas comemorativas que vêm aí.",
    area: "Social e conteúdo", dono: "Social media", alcance: "time",
    gatilhos: [{ tipo: "cron", automacao: "cs-datas" }],
    interruptores: [{ tipo: "automacao", job: "cs-datas" }],
    origens: ["social:datas-comemorativas"],
    modelo: "gpt-4o-mini", arquivos: ["app/api/system/cs-datas/route.ts"],
  },
  {
    id: "legendas", nome: "Legendas",
    faz: "Escreve a legenda do post no tom do cliente, lendo a arte; uma a uma ou a semana inteira de um cliente.",
    area: "Social e conteúdo", dono: "Social media", alcance: "sugere",
    gatilhos: [{ tipo: "botao", onde: "Card de conteúdo › Legenda e Social › Legendas da semana" }],
    interruptores: [],
    origens: ["social:legenda"], execucoes: ["conteudo:legendas-em-lote"],
    modelo: "gpt-4o", arquivos: ["lib/cs/legenda.ts", "app/api/cs/legenda/route.ts", "app/api/conteudo/legendas/route.ts"],
  },
  {
    id: "revisao-post", nome: "Revisão do post",
    faz: "Confere arte, legenda, preço, contato e português do post antes de ir para o cliente.",
    area: "Social e conteúdo", dono: "Social media", alcance: "sugere",
    gatilhos: [{ tipo: "botao", onde: "Card de conteúdo › Revisar post" }],
    interruptores: [],
    origens: ["cs:revisao-post"],
    modelo: "gpt-4o", arquivos: ["lib/cs/revisao-post.ts", "app/api/cs/revisar-post/route.ts"],
  },
  {
    id: "radar-descoberta", nome: "Trend Radar: descoberta",
    faz: "Busca na web perfis novos do nicho de cada cliente para o radar acompanhar.",
    area: "Social e conteúdo", dono: "Social media", alcance: "grava",
    gatilhos: [{ tipo: "cron", automacao: "radar-descoberta" }],
    interruptores: [{ tipo: "automacao", job: "radar-descoberta" }],
    origens: ["radar:candidatos", "radar:texto"],
    modelo: "gpt-5.4-mini", arquivos: ["lib/radar/discovery.ts", "app/api/system/radar-descoberta/route.ts"],
  },
  {
    id: "radar-inteligencia", nome: "Trend Radar: inteligência",
    faz: "Agrupa o que os perfis acompanhados estão postando em tendências e vira pauta por nicho.",
    area: "Social e conteúdo", dono: "Social media", alcance: "grava",
    gatilhos: [{ tipo: "cron", automacao: "radar-inteligencia" }],
    interruptores: [{ tipo: "automacao", job: "radar-inteligencia" }],
    origens: ["radar:analise", "radar:pauta"],
    modelo: "gpt-5.4-nano e gpt-5.4-mini", arquivos: ["app/api/system/radar-inteligencia/route.ts"],
  },
  {
    id: "vencedor-vira-pauta", nome: "Vencedor vira pauta",
    faz: "Transforma o anúncio vencedor do tráfego em 3 pautas para o orgânico.",
    area: "Social e conteúdo", dono: "Social media", alcance: "grava",
    gatilhos: [{ tipo: "cron", automacao: "creative-social" }],
    interruptores: [{ tipo: "automacao", job: "creative-social" }],
    origens: ["social:pauta-do-trafego"], execucoes: ["cron:creative-social"],
    modelo: "gpt-4o-mini", arquivos: ["lib/traffic/pauta-do-trafego.ts", "app/api/system/creative-social/route.ts"],
  },

  // ── Design ───────────────────────────────────────────────────────────────────────────────────
  {
    id: "briefing-arte", nome: "Briefing da arte",
    faz: "Monta o briefing para o designer: objetivo, texto que vai na arte, regras visuais do cliente e motivos das reprovações.",
    area: "Design", dono: "Designer", alcance: "grava",
    gatilhos: [{ tipo: "evento", quando: "Quando o pedido de arte nasce" }, { tipo: "botao", onde: "Card de conteúdo › Briefing da arte" }],
    interruptores: [],
    origens: ["design:briefing-arte"],
    modelo: "gpt-4o", arquivos: ["lib/cs/briefing-design.ts", "lib/cs/briefing-design-card.ts", "app/api/cs/briefing-design/route.ts"],
  },
  {
    id: "revisor-arte", nome: "Revisor de arte",
    faz: "Confere a arte entregue contra o briefing e as regras do cliente: texto, preço, telefone, logo, palavra proibida.",
    area: "Design", dono: "Designer", alcance: "time",
    gatilhos: [
      { tipo: "evento", quando: "Quando o designer entrega a arte (dois caminhos)" },
      { tipo: "botao", onde: "Card de conteúdo › Revisar arte" },
    ],
    interruptores: [],
    origens: ["cs:revisao-arte"], execucoes: ["cs:revisar-entrega"],
    modelo: "gpt-4o", arquivos: ["lib/cs/revisao-arte.ts", "lib/cs/verificar-arte.ts", "app/api/cs/revisar-entrega/route.ts", "app/api/cs/revisar-arte/route.ts"],
  },
  {
    id: "estilo-visual", nome: "Estilo visual",
    faz: "Descreve paleta, tipografia e composição da marca de cada cliente a partir das artes aprovadas.",
    area: "Design", dono: "Designer", alcance: "grava",
    gatilhos: [{ tipo: "cron", automacao: "creative-estilo" }, { tipo: "botao", onde: "Ficha do cliente › Estilo visual" }],
    interruptores: [{ tipo: "automacao", job: "creative-estilo" }],
    origens: ["cliente:estilo-visual"], execucoes: ["cron:creative-estilo", "api:estilo-visual", "api:estilo-visual-artes"],
    modelo: "gpt-4o", arquivos: ["lib/traffic/estilo-visual.ts", "app/api/system/creative-estilo/route.ts"],
  },
  {
    id: "arte-ia", nome: "Arte por IA",
    faz: "Gera variação de imagem com a identidade do cliente, mantendo o que a pessoa travou.",
    area: "Design", dono: "Designer", alcance: "grava",
    gatilhos: [{ tipo: "botao", onde: "Etapa de design › Variações por IA e Saúde dos criativos › Prévia" }],
    interruptores: [{ tipo: "agency_settings", chave: "ia_imagem", modo: "on", significado: "Liga a geração de imagem. Desligada, os botões avisam e não geram." }],
    origens: ["design:variacoes-ia", "trafego:previa"], execucoes: ["api:variacoes-ia", "api:previa-variacao"],
    modelo: "gpt-image-1 (e gpt-4o-mini para ler o texto da referência)",
    arquivos: ["lib/ia/arte-do-cliente.ts", "app/api/design-requests/[id]/variacoes-ia/route.ts", "app/api/traffic/criativos/previa/route.ts"],
  },

  // ── Tráfego ──────────────────────────────────────────────────────────────────────────────────
  {
    id: "atributos-criativos", nome: "Atributos dos criativos",
    faz: "Descreve cada anúncio: produto, oferta, chamada e cor.",
    area: "Tráfego", dono: "Gestor de tráfego", alcance: "grava",
    gatilhos: [{ tipo: "cron", automacao: "creative-atributos" }],
    interruptores: [{ tipo: "automacao", job: "creative-atributos" }],
    origens: ["trafego:atributos"], execucoes: ["cron:creative-atributos"],
    modelo: "gpt-4o-mini", arquivos: ["lib/traffic/atributos.ts", "app/api/system/creative-atributos/route.ts"],
  },
  {
    id: "analise-vencedores", nome: "Análise de vencedores",
    faz: "Explica por que o anúncio venceu, propõe 2 variações e um roteiro.",
    area: "Tráfego", dono: "Gestor de tráfego", alcance: "grava",
    gatilhos: [{ tipo: "cron", automacao: "creative-vencedores" }],
    interruptores: [{ tipo: "automacao", job: "creative-vencedores" }],
    origens: ["trafego:vencedor"], execucoes: ["cron:creative-vencedores", "api:replicar-vencedor"],
    situacao: "sombra",
    modelo: "gpt-4o", arquivos: ["lib/traffic/vencedor.ts", "app/api/system/creative-vencedores/route.ts"],
  },
  {
    id: "analisar-anuncios", nome: "Analisar anúncios",
    faz: "Lê as campanhas de um cliente e escreve os pontos de atenção e o que testar.",
    area: "Tráfego", dono: "Gestor de tráfego", alcance: "sugere",
    gatilhos: [{ tipo: "botao", onde: "Tráfego › Anúncios Meta › Analisar" }],
    interruptores: [],
    origens: ["ai:analyze-ads"],
    modelo: "gpt-4o-mini", arquivos: ["app/api/ai/analyze-ads/route.ts", "components/AdsInsightCard.tsx"],
  },
  {
    id: "voz-avisos", nome: "Voz dos avisos",
    faz: "Transforma o aviso de tráfego em áudio com voz natural para o painel falar.",
    area: "Tráfego", dono: "Gestor de tráfego", alcance: "grava",
    gatilhos: [{ tipo: "evento", quando: "Quando o painel vai falar um aviso (conta parada, saldo zerado)" }],
    interruptores: [{ tipo: "automacao", job: "avisos-falados" }],
    origens: ["avisos:voz"],
    modelo: "gpt-4o-mini-tts", arquivos: ["lib/avisos/audio-server.ts", "app/api/avisos/audio/route.ts"],
  },

  // ── Comercial ────────────────────────────────────────────────────────────────────────────────
  {
    id: "loninho-vendas", nome: "Loninho em vendas",
    faz: "No grupo de vendas, registra lead, follow-up e reunião e responde o que está pendente no funil.",
    area: "Comercial", dono: "Sócios", alcance: "grava",
    gatilhos: [{ tipo: "webhook", quando: "Sócio chama o Loninho no grupo de vendas" }],
    interruptores: [LONINHO, { tipo: "env", variavel: "CS_VENDAS_GROUP_JID", modo: "existe", significado: "O grupo de vendas. Sem ele, o Loninho não atende vendas." }],
    origens: ["crm:assistente"], noLoninho: true,
    modelo: "gpt-4o-mini", arquivos: ["lib/crm/assistente-server.ts"],
  },
  {
    id: "sdr-rafaela", nome: "SDR Rafaela",
    faz: "Prospecta empresas, pesquisa cada uma na web e conversa com o decisor pelo WhatsApp.",
    area: "Comercial", dono: "Sócios", alcance: "cliente",
    gatilhos: [{ tipo: "webhook", quando: "Prospect responde no privado" }, { tipo: "botao", onde: "Prospecção (redescobrir, reenriquecer, simular)" }],
    interruptores: [{ tipo: "env", variavel: "PROSPECCAO_SDR", modo: "on", significado: "Só responde prospect com o valor “on”. Desligada em 17/10/2026; as rotinas saíram do crontab." }],
    origens: ["prospeccao:*"],
    execucoes: ["prospeccao:outbound", "prospeccao:piloto", "prospeccao:tick", "prospeccao:enriquecer", "prospeccao:relatorio", "prospeccao:descobrir", "prospeccao:ranking", "prospeccao:reenriquecer", "prospeccao:simulador", "prospeccao:descobrir-manual"],
    situacao: "desligado",
    modelo: "gpt-4o, gpt-4o-mini e gpt-5.4-mini (busca na web)",
    arquivos: ["lib/prospeccao/mensagens.ts", "lib/prospeccao/enriquecer.ts", "lib/prospeccao/intencao.ts", "lib/prospeccao/providers/web-search.ts"],
  },

  // ── Gestão ───────────────────────────────────────────────────────────────────────────────────
  {
    id: "redator-processos", nome: "Redator de processos",
    faz: "Transforma um texto corrido em processo com dono, passos e prazo.",
    area: "Gestão", dono: "Sócios", alcance: "sugere",
    gatilhos: [{ tipo: "botao", onde: "Processos › Novo processo" }],
    interruptores: [],
    origens: ["gestao:redator-processos"],
    modelo: "gpt-4o-mini", arquivos: ["lib/processos/redator.ts", "app/api/processos/route.ts"],
  },
] as const satisfies readonly Agente[];

/** Quantos o inventário de 25/10/2026 contou, antes da faxina. */
export const CONTADOS_NO_INVENTARIO = 50;
/** O que saiu na faxina de 25/10/2026, para a tela explicar a diferença. */
export const REMOVIDOS_NA_FAXINA = [
  { nome: "Morning Briefing", motivo: "A tela foi desmontada e a rota não tinha mais quem chamasse." },
] as const;

type Curinga<T> = T extends `${infer P}:*` ? `${P}:${string}` : T;

/** Etiqueta de chamada de IA. Só as do catálogo — outra não compila. */
export type OrigemIa = Curinga<(typeof AGENTES)[number]["origens"][number]>;

/** A etiqueta casa com a origem do catálogo? (":*" no fim cobre o prefixo.) */
export function casaOrigem(etiqueta: string, origemDoCatalogo: string): boolean {
  return origemDoCatalogo.endsWith(":*")
    ? etiqueta.startsWith(origemDoCatalogo.slice(0, -1))
    : etiqueta === origemDoCatalogo;
}

/** O agente dono de uma etiqueta de llm_calls, ou null (chamada sem etiqueta ou de antes do catálogo). */
export function agenteDaOrigem(etiqueta: string | null | undefined): Agente | null {
  if (!etiqueta) return null;
  return (AGENTES as readonly Agente[]).find((a) => a.origens.some((o) => casaOrigem(etiqueta, o))) ?? null;
}

/** O agente dono de uma execução de agent_runs, ou null. */
export function agenteDaExecucao(origem: string | null | undefined): Agente | null {
  if (!origem) return null;
  return (AGENTES as readonly Agente[]).find((a) => a.execucoes?.includes(origem)) ?? null;
}

export function agentePorId(id: string): Agente | null {
  return (AGENTES as readonly Agente[]).find((a) => a.id === id) ?? null;
}

/** Chave do interruptor geral do Loninho em automation_settings (mesma tabela da Central de Automações). */
export const JOB_LONINHO = "agente:loninho";
