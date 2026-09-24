// lib/automacoes/registro.ts — TODOS os jobs agendados do VPS, um por entrada.
//
// Fonte da verdade do agendamento continua sendo o crontab do servidor (retrato em
// ops/crontab-producao.txt). Isto é o mapa legível dele para a Central de Automações (/automations).
// O teste tests/automacoes-registro.test.ts falha se uma linha do crontab ficar sem entrada aqui.
//
// Mexeu no crontab? Atualize esta lista no mesmo commit e, depois do deploy, regenere o retrato
// (crontab -l > ops/crontab-producao.txt). Enquanto o retrato estiver um passo atrás, o teste
// aceita só as diferenças listadas nele (EM_TRANSICAO).

export { proximaExecucao, proximaDeVarias } from "./cron";

export type Familia =
  | "Clientes (WhatsApp)"
  | "CS / time"
  | "Tráfego"
  | "Criativos"
  | "Prospecção"
  | "Dados e sync"
  | "Infra";

export type Destino =
  | "grupos dos clientes"
  | "grupo do time"
  | "grupo de tráfego"
  | "admin"
  | "sistema"
  | "prospects";

export const FAMILIAS: Familia[] = [
  "Clientes (WhatsApp)", "CS / time", "Tráfego", "Criativos", "Prospecção", "Dados e sync", "Infra",
];

export interface Automacao {
  /** Nome gravado em automation_runs/automation_settings: o endpoint do cron-call.sh, ou o
   *  CRON_JOB que o script passa. */
  id: string;
  nome: string;
  descricao: string;
  familia: Familia;
  destino: Destino;
  /** UTC, exatamente como no crontab. */
  cron: string;
  /** Linhas extras do crontab para o mesmo job (ex.: task-reminders roda 9h e 10h). */
  cronExtra?: string[];
  agendaBRT: string;
  /** Sem execução com sucesso por mais que isto (e ligado) = "parado". Cobre o fim de semana. */
  maxSilencioHoras: number;
  suportaEnsaio: boolean;
  enviaParaCliente: boolean;
  /** Caminho depois de /api/system/ que o cron chama. Sem endpoint = só roda pelo script. */
  endpoint?: string;
  metodo?: "GET" | "POST";
  /** Cada rota nasceu com um nome de ensaio (dry, dryRun, preview). */
  ensaio?: "dry=1" | "dryRun=1" | "preview=1";
  /** Linha do crontab quando não é cron-call.sh (script + argumentos). */
  comando?: string;
  /** Passa pelo portão do cron-call.sh: liga/desliga funciona e cada execução fica registrada. */
  controlavel: boolean;
}

/** Atalho para as ~65 entradas que o crontab chama via `cron-call.sh <endpoint>`. */
function ep(
  id: string,
  a: Omit<Automacao, "id" | "endpoint" | "metodo" | "controlavel" | "suportaEnsaio" | "enviaParaCliente"> &
    { metodo?: "GET" | "POST"; enviaParaCliente?: boolean },
): Automacao {
  return {
    ...a,
    id,
    endpoint: id,
    metodo: a.metodo ?? "POST",
    controlavel: true,
    suportaEnsaio: !!a.ensaio,
    enviaParaCliente: a.enviaParaCliente ?? false,
  };
}

/** Linhas que chamam um script direto (sem o cron-call.sh) — não registram execução. */
function script(
  id: string,
  a: Omit<Automacao, "id" | "controlavel" | "suportaEnsaio" | "enviaParaCliente" | "ensaio">,
): Automacao {
  return { ...a, id, controlavel: false, suportaEnsaio: false, enviaParaCliente: false };
}

export const AUTOMACOES: Automacao[] = [
  // ── Clientes (WhatsApp) ─────────────────────────────────────────────────────────────────────
  {
    id: "client-messages-monday", nome: "Relatório de segunda aos clientes",
    descricao: "PDF de 7 dias com mensagem personalizada no grupo de cada cliente (só-social recebe a mensagem de início de semana).",
    familia: "Clientes (WhatsApp)", destino: "grupos dos clientes", cron: "0 11 * * 1", agendaBRT: "segunda, 8h",
    maxSilencioHoras: 8 * 24, suportaEnsaio: true, enviaParaCliente: true, controlavel: true,
    endpoint: "client-messages?kind=monday", metodo: "POST", ensaio: "dryRun=1", comando: "client-messages.sh monday",
  },
  {
    id: "client-messages-wed", nome: "Mensagem de suporte de quarta",
    descricao: "Mensagem de meio de semana no grupo de cada cliente, escrita pelo agente com o que está acontecendo na conta.",
    familia: "Clientes (WhatsApp)", destino: "grupos dos clientes", cron: "0 11 * * 3", agendaBRT: "quarta, 8h",
    maxSilencioHoras: 8 * 24, suportaEnsaio: true, enviaParaCliente: true, controlavel: true,
    endpoint: "client-messages?kind=wed", metodo: "POST", ensaio: "dryRun=1", comando: "client-messages.sh wed",
  },
  {
    id: "client-messages-fri", nome: "Mensagem de suporte de sexta",
    descricao: "Mensagem de fechamento da semana no grupo de cada cliente.",
    familia: "Clientes (WhatsApp)", destino: "grupos dos clientes", cron: "0 11 * * 5", agendaBRT: "sexta, 8h",
    maxSilencioHoras: 8 * 24, suportaEnsaio: true, enviaParaCliente: true, controlavel: true,
    endpoint: "client-messages?kind=fri", metodo: "POST", ensaio: "dryRun=1", comando: "client-messages.sh fri",
  },
  {
    id: "relatorio-mensal", nome: "Relatório do mês fechado",
    descricao: "Dia 1º: confere token da Meta e o ensaio, e só então manda o relatório do mês anterior nos grupos dos clientes.",
    familia: "Clientes (WhatsApp)", destino: "grupos dos clientes", cron: "0 11 1 * *", agendaBRT: "dia 1º de cada mês, 8h",
    maxSilencioHoras: 32 * 24, suportaEnsaio: false, enviaParaCliente: true, controlavel: true,
    comando: "relatorio-mensal.sh",
  },
  ep("monthly-calendar", {
    nome: "Planejamento do próximo mês", descricao: "Pergunta a promoção do mês seguinte e manda o calendário de datas em PDF no grupo de cada cliente.",
    familia: "Clientes (WhatsApp)", destino: "grupos dos clientes", cron: "0 14 20,21,22 * *",
    agendaBRT: "dias 20, 21 e 22, 11h (envia só no dia útil certo)", maxSilencioHoras: 30 * 24, ensaio: "dryRun=1", enviaParaCliente: true,
  }),
  ep("cs-reuniao-mensal", {
    nome: "Reunião mensal com o cliente", descricao: "Lembra o cliente e o time da reunião (véspera e 1h antes) e, do dia 15 ao 22, cobra quem ainda não marcou.",
    familia: "Clientes (WhatsApp)", destino: "grupos dos clientes", cron: "0 11-20 * * 1-5",
    agendaBRT: "seg a sex, de hora em hora das 8h às 17h", maxSilencioHoras: 65, ensaio: "dry=1", enviaParaCliente: true,
  }),

  // ── CS / time ───────────────────────────────────────────────────────────────────────────────
  // cs-manha substituiu cs-bom-dia + cs-postagem + cs-pendencias + cs-setup; cs-risco-semanal
  // substituiu cs-esfriando + cs-risco (set/2026). As rotas antigas seguem chamáveis, fora do cron.
  ep("cs-manha", {
    nome: "Resumo da manhã", descricao: "Uma mensagem só no grupo interno: bom-dia, postagem do dia, sugestões pendentes e setup dos clientes novos.",
    familia: "CS / time", destino: "grupo do time", cron: "0 11 * * 1-5", agendaBRT: "seg a sex, 8h", maxSilencioHoras: 74, ensaio: "dry=1",
  }),
  ep("cs-datas", {
    nome: "Radar de datas comemorativas", descricao: "Cruza as datas dos próximos dias com o ramo de cada cliente e sugere uma ideia de post.",
    familia: "CS / time", destino: "grupo do time", cron: "30 11 * * 1", agendaBRT: "segunda, 8h30", maxSilencioHoras: 8 * 24, ensaio: "preview=1",
  }),
  ep("task-reminders", {
    nome: "Cobrança de tarefas", descricao: "Cobra no grupo da equipe as tarefas da véspera, do dia e as atrasadas (no máximo 1 vez por dia cada).",
    familia: "CS / time", destino: "grupo do time", cron: "0 12 * * *", cronExtra: ["0 13 * * *"],
    agendaBRT: "todo dia, 9h e 10h", maxSilencioHoras: 26, ensaio: "preview=1",
  }),
  ep("cs-eventos", {
    nome: "Datas e promoções dos clientes", descricao: "Avisa o time das datas que o cliente marcou, faltando ~5 e ~2 dias.",
    familia: "CS / time", destino: "grupo do time", cron: "0 12 * * *", agendaBRT: "todo dia, 9h", maxSilencioHoras: 26,
  }),
  ep("cs-roteiro-semanal", {
    nome: "Roteiros da semana", descricao: "Gera roteiros de vídeo em PDF para parte da carteira (rodízio) e manda pro social gravar.",
    familia: "CS / time", destino: "grupo do time", cron: "0 12 * * 1", agendaBRT: "segunda, 9h", maxSilencioHoras: 8 * 24, ensaio: "dry=1",
  }),
  ep("cs-risco-semanal", {
    nome: "Clientes pedindo atenção", descricao: "Clientes em risco, em atenção ou que esfriaram, numa seção por responsável e com o porquê de cada um.",
    familia: "CS / time", destino: "grupo do time", cron: "30 12 * * 1", agendaBRT: "segunda, 9h30", maxSilencioHoras: 8 * 24, ensaio: "dry=1",
  }),
  ep("cs-autoavaliacao", {
    nome: "Acurácia do agente", descricao: "Mede quantas sugestões do agente o time aprovou ou recusou nos últimos 7 dias.",
    familia: "CS / time", destino: "grupo do time", cron: "0 13 * * 1", agendaBRT: "segunda, 10h", maxSilencioHoras: 8 * 24, ensaio: "dry=1",
  }),
  ep("cs-vigilancia", {
    nome: "Vigilância de fluxo", descricao: "Acompanha o caminho de cada post (pauta → designer → aprovação) e cobra no grupo o card que travou.",
    familia: "CS / time", destino: "grupo do time", cron: "0 13,16,19 * * 1-5", agendaBRT: "seg a sex, 10h, 13h e 16h", maxSilencioHoras: 68,
  }),
  ep("cs-saude", {
    nome: "Saúde da carteira", descricao: "Avalia reclamação, status, retração e dias sem post de cada cliente e posta os que estão em risco.",
    familia: "CS / time", destino: "grupo do time", cron: "0 14 * * 1", agendaBRT: "segunda, 11h", maxSilencioHoras: 8 * 24, ensaio: "dry=1",
  }),
  ep("cs-sem-resposta", {
    nome: "Cliente sem resposta", descricao: "Avisa o time quando um cliente perguntou no grupo e ninguém respondeu dentro do prazo.",
    familia: "CS / time", destino: "grupo do time", cron: "*/15 11-20 * * 1-5",
    agendaBRT: "seg a sex, a cada 15 min das 8h às 17h45", maxSilencioHoras: 64, ensaio: "dry=1",
  }),
  ep("cs-pauta", {
    nome: "Pauta da semana seguinte", descricao: "Propõe a pauta da próxima semana por cliente; o time responde \"ok\" e os cards nascem no board.",
    familia: "CS / time", destino: "grupo do time", cron: "0 17 * * 5", agendaBRT: "sexta, 14h", maxSilencioHoras: 8 * 24, ensaio: "preview=1",
  }),
  ep("cs-vespera", {
    nome: "Véspera de postagem", descricao: "Na tarde anterior a um dia de post, cobra a arte (e o roteiro, se for vídeo) de amanhã.",
    familia: "CS / time", destino: "grupo do time", cron: "0 19 * * 0,2,4", agendaBRT: "dom, ter e qui, 16h", maxSilencioHoras: 74, ensaio: "preview=1",
  }),
  ep("cs-raio-x", {
    nome: "Raio-X do gestor", descricao: "Gargalo do fluxo (lead time, prazo) e cards travados por social.",
    familia: "CS / time", destino: "grupo do time", cron: "0 19 * * 5", agendaBRT: "sexta, 16h", maxSilencioHoras: 8 * 24, ensaio: "dry=1",
  }),
  ep("cs-relatorio", {
    nome: "Relatório semanal de entregas", descricao: "Resumo das entregas da semana, do que está em produção e do que foi publicado.",
    familia: "CS / time", destino: "grupo do time", cron: "0 20 * * 5", agendaBRT: "sexta, 17h", maxSilencioHoras: 8 * 24, ensaio: "preview=1",
  }),
  ep("team-weekly", {
    nome: "Produção do time (PDF)", descricao: "PDF com entregas por designer, publicações por social e a rotina do tráfego na semana.",
    familia: "CS / time", destino: "grupo do time", cron: "30 20 * * 5", agendaBRT: "sexta, 17h30", maxSilencioHoras: 8 * 24, ensaio: "preview=1",
  }),
  ep("cs-desempenho", {
    nome: "Desempenho da semana (PDF)", descricao: "Um PDF com o desempenho de cada pessoa pela métrica da própria função, no grupo administrativo.",
    familia: "CS / time", destino: "admin", cron: "0 21 * * 5", agendaBRT: "sexta, 18h", maxSilencioHoras: 8 * 24, ensaio: "dry=1",
  }),
  ep("cs-conferir-postagem", {
    nome: "Conferência de postagem", descricao: "Confere no Instagram quem postou de verdade e resume no grupo quem faltou, com o dono.",
    familia: "CS / time", destino: "grupo do time", cron: "0 22 * * 1,3,5", agendaBRT: "seg, qua e sex, 19h", maxSilencioHoras: 74, ensaio: "dryRun=1",
  }),
  ep("followup", {
    nome: "Follow-up de clientes parados", descricao: "Cria notificação para o responsável quando um cliente fica 10+ dias sem interação registrada.",
    familia: "CS / time", destino: "sistema", cron: "0 8 * * *", agendaBRT: "todo dia, 5h", maxSilencioHoras: 26, metodo: "GET",
  }),
  ep("holiday-alert", {
    nome: "Feriados do próximo mês", descricao: "Avisa designers, social e gestão (sino + e-mail) dos feriados do mês seguinte.",
    familia: "CS / time", destino: "sistema", cron: "0 9 20 * *", agendaBRT: "dia 20 de cada mês, 6h", maxSilencioHoras: 32 * 24,
  }),

  // ── Tráfego ─────────────────────────────────────────────────────────────────────────────────
  ep("defense-scan", {
    nome: "Defesa Ativa (varredura)", descricao: "Compara as métricas Meta de cada conta com a média de 7 dias e grava os alertas de anomalia.",
    familia: "Tráfego", destino: "sistema", cron: "*/15 * * * *", agendaBRT: "a cada 15 min, o dia todo", maxSilencioHoras: 2,
  }),
  ep("meta-granular", {
    nome: "Coleta por campanha e anúncio", descricao: "Grava o desempenho por campanha, conjunto e anúncio (e os criativos que gastaram) dos últimos dias.",
    familia: "Tráfego", destino: "sistema", cron: "0 10 * * 1-5", agendaBRT: "seg a sex, 7h", maxSilencioHoras: 74, ensaio: "dry=1",
  }),
  ep("traffic-diagnostico", {
    nome: "Diagnóstico diário das contas", descricao: "PDF com o que quebrou em cada conta, ordenado pelo tamanho do estrago, no grupo de tráfego.",
    familia: "Tráfego", destino: "grupo de tráfego", cron: "0 11 * * 1-5", agendaBRT: "seg a sex, 8h", maxSilencioHoras: 74, ensaio: "dry=1",
  }),
  ep("budget-digest", {
    nome: "Saldos das contas Meta", descricao: "Atualiza os saldos e manda o resumo de verba de cada conta no grupo de tráfego.",
    familia: "Tráfego", destino: "grupo de tráfego", cron: "0 11 * * 1,3,5", agendaBRT: "seg, qua e sex, 8h", maxSilencioHoras: 74, ensaio: "dryRun=1",
  }),
  ep("sync-saldos", {
    nome: "Saldo das contas (2 em 2h)", descricao: "Lê saldo e gasto na Meta e avisa na hora a conta que cruzou o limite (no máximo 1 aviso por conta/dia). Ensaio sincroniza sem avisar.",
    familia: "Tráfego", destino: "grupo de tráfego", cron: "0 11-23/2 * * *", agendaBRT: "todo dia, de 2 em 2h das 8h às 20h", maxSilencioHoras: 14, ensaio: "dry=1",
  }),
  ep("urgent-alerts", {
    nome: "Alertas urgentes de tráfego", descricao: "Só sai se houver conta com erro, verba zerada ou anúncios parados.",
    familia: "Tráfego", destino: "grupo de tráfego", cron: "0 11 * * 2,4", agendaBRT: "ter e qui, 8h", maxSilencioHoras: 122, ensaio: "dryRun=1",
  }),
  ep("traffic-brief-segunda", {
    nome: "Brief de segunda do tráfego", descricao: "Monta e grava o brief da semana (5 linhas por conta + uma proposta); vai ao WhatsApp quando a sombra for aprovada.",
    familia: "Tráfego", destino: "grupo de tráfego", cron: "5 11 * * 1", agendaBRT: "segunda, 8h05", maxSilencioHoras: 8 * 24,
  }),
  ep("alerta-queda", {
    nome: "Alerta de queda de resultado", descricao: "Avisa o grupo de tráfego das quedas críticas das últimas 24h, uma linha por cliente.",
    familia: "Tráfego", destino: "grupo de tráfego", cron: "30 12 * * 1-5", agendaBRT: "seg a sex, 9h30", maxSilencioHoras: 74, ensaio: "dry=1",
  }),
  ep("status-clientes", {
    nome: "Status dos clientes pelo resultado", descricao: "Recalcula o status do kanban de cada cliente de anúncio pelo CPL dos últimos 7 dias.",
    familia: "Tráfego", destino: "grupo de tráfego", cron: "0 12 * * 5", agendaBRT: "sexta, 9h", maxSilencioHoras: 8 * 24, ensaio: "preview=1",
  }),
  ep("traffic-policy", {
    nome: "Política de tráfego por cliente", descricao: "Deriva a meta de custo de cada cliente da mediana do próprio histórico.",
    familia: "Tráfego", destino: "sistema", cron: "0 9 1 * *", agendaBRT: "dia 1º de cada mês, 6h", maxSilencioHoras: 32 * 24, ensaio: "dry=1",
  }),

  // ── Criativos ───────────────────────────────────────────────────────────────────────────────
  ep("creative-health", {
    nome: "Saúde dos criativos", descricao: "Avalia cada criativo que gastou nos últimos 21 dias (fadiga, vencedor). Só grava, não avisa.",
    familia: "Criativos", destino: "sistema", cron: "20 10 * * 1-5", agendaBRT: "seg a sex, 7h20", maxSilencioHoras: 74,
  }),
  ep("creative-atributos", {
    nome: "Atributos dos criativos", descricao: "Extrai os atributos dos anúncios que ainda não têm, começando por quem gastou mais.",
    familia: "Criativos", destino: "sistema", cron: "30 10 * * 1-5", agendaBRT: "seg a sex, 7h30", maxSilencioHoras: 74,
  }),
  ep("creative-casar", {
    nome: "Casar anúncio com arte", descricao: "Liga cada anúncio à arte entregue do mesmo cliente pela semelhança da imagem.",
    familia: "Criativos", destino: "sistema", cron: "35 10 * * 1-5", agendaBRT: "seg a sex, 7h35", maxSilencioHoras: 74,
  }),
  ep("creative-vencedores", {
    nome: "Análise dos vencedores", descricao: "Para cada criativo vencedor: hipóteses, 2 variações e roteiro. Usa IA; só grava.",
    familia: "Criativos", destino: "sistema", cron: "40 10 * * 1-5", agendaBRT: "seg a sex, 7h40", maxSilencioHoras: 74,
  }),
  ep("creative-medir", {
    nome: "Medir variações", descricao: "Compara cada variação no ar com o anúncio original e registra se a hipótese se confirmou.",
    familia: "Criativos", destino: "sistema", cron: "45 10 * * 1-5", agendaBRT: "seg a sex, 7h45", maxSilencioHoras: 74,
  }),
  ep("creative-social", {
    nome: "Vencedor vira pauta orgânica", descricao: "Transforma o vencedor do tráfego em 3 pautas no Radar para quem também tem social.",
    familia: "Criativos", destino: "sistema", cron: "50 10 * * 1-5", agendaBRT: "seg a sex, 7h50", maxSilencioHoras: 74,
  }),
  ep("creative-estilo", {
    nome: "Estilo visual dos clientes", descricao: "Lê o estilo visual de cada cliente a partir das artes entregues.",
    familia: "Criativos", destino: "sistema", cron: "55 10 * * 1-5", agendaBRT: "seg a sex, 7h55", maxSilencioHoras: 74,
  }),
  ep("radar-coleta", {
    nome: "Trend Radar — coleta", descricao: "Lê os perfis monitorados de cada nicho e separa o conteúdo que performou acima do normal.",
    familia: "Criativos", destino: "sistema", cron: "0 9 * * 1", agendaBRT: "segunda, 6h", maxSilencioHoras: 8 * 24, ensaio: "dry=1",
  }),
  ep("radar-inteligencia", {
    nome: "Trend Radar — pautas", descricao: "Entende os destaques com IA, agrupa o que virou tendência e transforma em pauta por nicho.",
    familia: "Criativos", destino: "sistema", cron: "30 9 * * 1", agendaBRT: "segunda, 6h30", maxSilencioHoras: 8 * 24, ensaio: "dry=1",
  }),
  ep("radar-descoberta", {
    nome: "Trend Radar — descoberta", descricao: "Procura perfis novos no mercado para o Radar acompanhar (varredura funda no dia 1º).",
    familia: "Criativos", destino: "sistema", cron: "0 8 * * 1", cronExtra: ["0 7 1 * *"],
    agendaBRT: "segunda, 5h, e dia 1º, 4h", maxSilencioHoras: 8 * 24, ensaio: "dry=1",
  }),

  // ── Prospecção ──────────────────────────────────────────────────────────────────────────────
  ep("prospect-descobrir", {
    nome: "SDR — descobrir empresas", descricao: "Pesquisa segmento × cidade em rodízio e grava as empresas novas como descobertas.",
    familia: "Prospecção", destino: "sistema", cron: "30 9 * * 1-5", agendaBRT: "seg a sex, 6h30", maxSilencioHoras: 74, ensaio: "dry=1",
  }),
  ep("prospect-enriquecer", {
    nome: "SDR — enriquecer", descricao: "Pesquisa a fundo um lote de empresas descobertas, dá score e separa quem é do perfil.",
    familia: "Prospecção", destino: "sistema", cron: "0,15,30,45 10 * * 1-5", cronExtra: ["0,15,30 11 * * 1-5"],
    agendaBRT: "seg a sex, a cada 15 min das 7h às 8h30", maxSilencioHoras: 73,
  }),
  ep("prospect-ranking", {
    nome: "SDR — fila do dia", descricao: "Passa o quality gate e monta a fila de abordagem do dia pelos melhores scores.",
    familia: "Prospecção", destino: "sistema", cron: "35 11 * * 1-5", agendaBRT: "seg a sex, 8h35", maxSilencioHoras: 74, ensaio: "dry=1",
  }),
  ep("prospect-outbound", {
    nome: "SDR — abordagem", descricao: "Manda a primeira abordagem da fila e os follow-ups vencidos no WhatsApp dos prospects.",
    familia: "Prospecção", destino: "prospects", cron: "*/5 12-13 * * 1-5",
    agendaBRT: "seg a sex, a cada 5 min das 9h às 10h55", maxSilencioHoras: 73, ensaio: "dry=1", enviaParaCliente: true,
  }),
  ep("prospect-tick", {
    nome: "SDR — conversas e lembretes", descricao: "Responde os prospects pendentes, lembra reuniões (24h/1h) e espelha na planilha.",
    familia: "Prospecção", destino: "prospects", cron: "*/15 12-20 * * 1-5",
    agendaBRT: "seg a sex, a cada 15 min das 9h às 17h45", maxSilencioHoras: 66, ensaio: "dry=1", enviaParaCliente: true,
  }),
  ep("prospect-relatorio", {
    nome: "SDR — relatório do dia", descricao: "Grava as métricas do dia e manda o relatório do piloto no grupo administrativo.",
    familia: "Prospecção", destino: "admin", cron: "30 21 * * 1-5", agendaBRT: "seg a sex, 18h30", maxSilencioHoras: 74, ensaio: "dry=1",
  }),
  ep("prospect-piloto", {
    nome: "SDR — fim do piloto", descricao: "Encerra o piloto quando vence o prazo e manda o relatório final ao grupo administrativo.",
    familia: "Prospecção", destino: "admin", cron: "10 3 * * *", agendaBRT: "todo dia, 0h10", maxSilencioHoras: 26,
  }),
  ep("crm-followups", {
    nome: "Follow-up do comercial", descricao: "Leads com próximo contato vencido ou pra hoje viram notificação no sino do comercial.",
    familia: "Prospecção", destino: "sistema", cron: "0 11 * * 1-5", agendaBRT: "seg a sex, 8h", maxSilencioHoras: 74, ensaio: "dry=1",
  }),

  // ── Dados e sync ────────────────────────────────────────────────────────────────────────────
  ep("historico-cliente", {
    nome: "Histórico operacional", descricao: "Varre o banco e registra no histórico de cada cliente os fatos da operação (post publicado, entrega, etc.).",
    familia: "Dados e sync", destino: "sistema", cron: "0 * * * *", agendaBRT: "de hora em hora", maxSilencioHoras: 3, ensaio: "dry=1",
  }),
  ep("priority-recalcular", {
    nome: "Feed de prioridades", descricao: "Recalcula o \"O que precisa de você hoje\" a partir de todas as fontes.",
    familia: "Dados e sync", destino: "sistema", cron: "10 10-23 * * *", agendaBRT: "todo dia, de hora em hora das 7h10 às 20h10", maxSilencioHoras: 13,
  }),
  ep("ig-snapshots", {
    nome: "Relatórios de Instagram", descricao: "Pré-gera os relatórios de Instagram (semana e mês) de cada cliente para o portal não bater na Meta ao vivo.",
    familia: "Dados e sync", destino: "sistema", cron: "0 6 * * *", agendaBRT: "todo dia, 3h", maxSilencioHoras: 26,
  }),
  ep("sync-posts", {
    nome: "Postagens do mês", descricao: "Recalcula posts do mês e último post de cada cliente a partir do Instagram real.",
    familia: "Dados e sync", destino: "sistema", cron: "30 9 * * *", agendaBRT: "todo dia, 6h30", maxSilencioHoras: 26, ensaio: "preview=1",
  }),
  ep("warmup-snapshots", {
    nome: "Aquecer relatórios públicos", descricao: "Gera o cache dos relatórios públicos (semana, 2 semanas, mês) de quem tem link ativo.",
    familia: "Dados e sync", destino: "sistema", cron: "40 9 * * *", agendaBRT: "todo dia, 6h40", maxSilencioHoras: 26,
  }),
  ep("contract-renewal", {
    nome: "Renovação de contratos", descricao: "Cria o rascunho de renovação dos contratos a 30 dias do fim e avisa os admins.",
    familia: "Dados e sync", destino: "admin", cron: "0 9 * * *", agendaBRT: "todo dia, 6h", maxSilencioHoras: 26,
  }),
  ep("cs-briefing-inicial", {
    nome: "Briefing de quem não tem", descricao: "Monta com IA o primeiro briefing dos clientes que nunca tiveram, a partir das conversas.",
    familia: "Dados e sync", destino: "sistema", cron: "0 9 * * 2", agendaBRT: "terça, 6h", maxSilencioHoras: 8 * 24, ensaio: "dry=1",
  }),
  ep("cs-briefing-update", {
    nome: "Regras aprendidas nas conversas", descricao: "Extrai regras das mensagens dos clientes (vão para \"Aprendido\"; não mexe no briefing).",
    familia: "Dados e sync", destino: "sistema", cron: "0 10 * * 0", agendaBRT: "domingo, 7h", maxSilencioHoras: 8 * 24, ensaio: "dry=1",
  }),
  ep("cs-releitura", {
    nome: "Releitura do ciclo", descricao: "Lê pedido → entrega → correção → aprovação de cada cliente e guarda o que o agente aprendeu.",
    familia: "Dados e sync", destino: "sistema", cron: "0 11 * * 0", agendaBRT: "domingo, 8h", maxSilencioHoras: 8 * 24, ensaio: "dry=1",
  }),
  ep("cs-estilo", {
    nome: "Estilo de comunicação", descricao: "Resume com IA o jeito de escrever de cada cliente e do time (preserva o que já foi revisado).",
    familia: "Dados e sync", destino: "sistema", cron: "0 9 * * 0", agendaBRT: "domingo, 6h", maxSilencioHoras: 8 * 24, ensaio: "dry=1",
  }),
  ep("cs-nichos", {
    nome: "Ramo de cada cliente", descricao: "Descobre o nicho de quem ainda não tem, do mais barato (nome) ao mais caro (IA).",
    familia: "Dados e sync", destino: "sistema", cron: "0 8 * * 0", agendaBRT: "domingo, 5h", maxSilencioHoras: 8 * 24, ensaio: "dry=1",
  }),
  script("generate-snapshots-cron", {
    nome: "Snapshots do portal", descricao: "Gera os snapshots do portal do cliente (script próprio com log em loneos-snapshots.log).",
    familia: "Dados e sync", destino: "sistema", cron: "0 9 * * *", agendaBRT: "todo dia, 6h", maxSilencioHoras: 26,
    comando: "generate-snapshots-cron.sh",
  }),
  script("cron-scores", {
    nome: "Score de saúde dos clientes", descricao: "Grava a saúde de cada cliente ativo com o detalhamento (único escritor de client_health_scores).",
    familia: "Dados e sync", destino: "sistema", cron: "20 9 * * *", agendaBRT: "todo dia, 6h20", maxSilencioHoras: 26,
    comando: "cron-scores.sh",
  }),

  // ── Infra ───────────────────────────────────────────────────────────────────────────────────
  ep("check-meta-token", {
    nome: "Validade do token da Meta", descricao: "Avisa admin (sino e e-mail) quando o token da Meta está a 14 dias ou menos de vencer.",
    familia: "Infra", destino: "admin", cron: "0 11 * * *", agendaBRT: "todo dia, 8h", maxSilencioHoras: 26,
  }),
  ep("whatsapp-health", {
    nome: "WhatsApp de pé", descricao: "Antes dos disparos das 8h, confere os dois números; tenta religar e só avisa se não conseguir.",
    familia: "Infra", destino: "grupo do time", cron: "50 10 * * 1-5", agendaBRT: "seg a sex, 7h50", maxSilencioHoras: 74, ensaio: "preview=1",
  }),
  ep("automacoes/vigia", {
    nome: "Vigia das automações", descricao: "Avisa no grupo administrativo os jobs que falharam ou pararam (no máximo 1 aviso por job a cada 24h).",
    familia: "Infra", destino: "admin", cron: "5 * * * *", agendaBRT: "de hora em hora (minuto 5)", maxSilencioHoras: 3, ensaio: "dry=1",
  }),
  script("healthcheck", {
    nome: "Healthcheck do servidor", descricao: "Confere se o painel está respondendo (script do servidor, fora do repositório).",
    familia: "Infra", destino: "sistema", cron: "*/5 * * * *", agendaBRT: "a cada 5 min", maxSilencioHoras: 2,
    comando: "healthcheck.sh",
  }),
  script("backup-postgres", {
    nome: "Backup do banco", descricao: "pg_dump diário com validação de tamanho e 14 dias de retenção; avisa o grupo interno se falhar.",
    familia: "Infra", destino: "sistema", cron: "0 3 * * *", agendaBRT: "todo dia, 0h", maxSilencioHoras: 26,
    comando: "backup-postgres.sh",
  }),
  script("cleanup-storage", {
    nome: "Limpeza de arquivos", descricao: "Apaga prévias e caches locais com mais de 7 dias (o banco e o Drive ficam).",
    familia: "Infra", destino: "sistema", cron: "0 3 * * 0", agendaBRT: "domingo, 0h", maxSilencioHoras: 8 * 24,
    comando: "cleanup-storage.sh",
  }),
  script("docker-builder-prune", {
    nome: "Limpeza do Docker", descricao: "Remove o cache de build do Docker com mais de 7 dias.",
    familia: "Infra", destino: "sistema", cron: "0 4 * * 0", agendaBRT: "domingo, 1h", maxSilencioHoras: 8 * 24,
    comando: "docker builder prune -af --filter \"until=168h\"",
  }),
];

const PORID = new Map(AUTOMACOES.map((a) => [a.id, a]));

export function automacaoPorId(id: string): Automacao | undefined {
  return PORID.get(id);
}

/** Todas as linhas de crontab do job. */
export function cronsDe(a: Automacao): string[] {
  return [a.cron, ...(a.cronExtra ?? [])];
}
