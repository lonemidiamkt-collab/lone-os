// lib/processos/conteudo-inicial.ts — OS PROCESSOS DA LONE, escritos.
//
// Fonte (as duas únicas, por definição do Roberto):
//   1. Playbook Social Media – Lone Mídia (docs/PLAYBOOK_SOCIAL.md, transcrito do PDF dele)
//   2. O que a plataforma REALMENTE faz — o fluxo do código, não teoria de agência
//
// Por que mora no código e não só no banco: assim a correção do Roberto fica versionada no git,
// e um deploy novo não perde o texto. O seed é idempotente (não sobrescreve o que já existe no
// banco), então a partir do momento em que alguém editar pelo produto, o produto manda.
//
// SEM "dono do processo": em time de 6, quem executa é o responsável. Cada PASSO tem o papel de
// quem faz — isso é operação. Um dono separado do executor seria campo pra ninguém preencher.

import type { AreaProcesso, TipoDoc } from "./redator";

export interface PassoSeed {
  titulo: string;
  instrucao: string;
  papel: string;
  sistema?: string;
  evidencia?: string;
  decisao?: string;
  opcional?: boolean;
}

export interface ProcessoSeed {
  code: string;
  titulo: string;
  area: AreaProcesso;
  tipo: TipoDoc;
  resumo: string;
  tags: string[];
  objetivo: string;
  problema: string;
  escopo: string;
  foraDeEscopo: string;
  gatilho: string;
  frequencia: string;
  entradas: string;
  saidas: string;
  criterioPronto: string;
  criteriosQualidade: string;
  sla: string;
  passos: PassoSeed[];
  kpis?: { nome: string; definicao: string; fonte: string; meta: string; acaoAbaixo: string }[];
  excecoes?: { situacao: string; tratamento: string; escalonarPara: string }[];
}

export const PROCESSOS_INICIAIS: ProcessoSeed[] = [
  // ══════════════════════════════════════════════════════════════════════════
  {
    code: "SOC-01",
    titulo: "Criar demanda de arte para o designer",
    area: "social",
    tipo: "sop",
    resumo: "Como abrir um pedido de arte que o designer consegue executar sem voltar perguntando.",
    tags: ["arte", "designer", "demanda", "briefing"],
    objetivo:
      "Fazer com que toda arte chegue ao designer com informação suficiente pra ser produzida de " +
      "primeira, e com prazo que caiba no dia dele.",
    problema:
      "Pedido sem preço, sem produto definido ou pedido no mesmo dia da postagem: o designer para " +
      "pra perguntar, a arte volta pra correção e a postagem atrasa. No sistema isso aparece como " +
      "card em produção passando do prazo.",
    escopo: "Do momento em que a pauta é definida até o card estar no board do designer.",
    foraDeEscopo: "Produção da arte, revisão final e envio ao cliente (SOC-02 e SOC-03).",
    gatilho: "Pauta da semana aprovada, pedido do cliente no grupo, ou data comemorativa se aproximando.",
    frequencia: "A cada peça planejada — na prática, seg/qua/sex de cada cliente.",
    entradas: "Pauta ou pedido do cliente · briefing do cliente · tabela de preços quando houver oferta",
    saidas: "Card criado no board com briefing completo e data de postagem.",
    criterioPronto: "Card existe no board do designer, com data e briefing, e o designer não precisou perguntar nada.",
    criteriosQualidade:
      "O briefing responde: qual produto/serviço, qual preço (se houver), qual benefício principal, " +
      "qual o objetivo do post e qual a referência visual.",
    sla: "Mínimo 1 dia útil antes da data de postagem. Nunca pedir arte pra sair no mesmo dia (playbook §7.1).",
    passos: [
      {
        titulo: "Conferir se já existe card pra essa peça",
        instrucao:
          "Antes de criar, procure no board do cliente pelo tema. Se já existir card do mesmo assunto, " +
          "é AJUSTE — edite o card existente em vez de abrir outro. Card duplicado divide o histórico e " +
          "o designer produz a mesma arte duas vezes.",
        papel: "social",
        sistema: "Lone OS > Social > board do cliente",
        evidencia: "busca feita no board",
      },
      {
        titulo: "Criar o card com data de postagem",
        instrucao:
          "Abra o card com o título do assunto e preencha a DATA DE POSTAGEM (não a data em que você " +
          "está pedindo). É essa data que alimenta o alerta de prazo e a cobrança de véspera do agente.",
        papel: "social",
        sistema: "Lone OS > Social",
        evidencia: "card criado com due date preenchido",
      },
      {
        titulo: "Escrever o briefing completo",
        instrucao:
          "No campo de briefing, informe: produto ou serviço · preço, se aplicável · benefícios " +
          "principais · objetivo do conteúdo (venda, posicionamento, educativo, prova social) · " +
          "referência visual quando houver. Preço vai por escrito, nunca 'o de sempre'.",
        papel: "social",
        sistema: "Lone OS > Social > card",
        evidencia: "briefing preenchido no card",
      },
      {
        titulo: "Definir o formato",
        instrucao:
          "Marque o formato conforme o dia: segunda = post estratégico simples, quarta = vídeo/Reels, " +
          "sexta = carrossel ou conteúdo de venda (playbook §2). Vídeo vai para o editor, não para o designer.",
        papel: "social",
        sistema: "Lone OS > Social > card",
        evidencia: "formato marcado no card",
        decisao: "Se for vídeo, o card segue para o editor e o roteiro precisa estar pronto antes (SOC-04).",
      },
      {
        titulo: "Anexar o material do cliente",
        instrucao:
          "Anexe foto do produto, logo atualizado ou vídeo bruto que o cliente mandou. Se não houver " +
          "material, diga isso no briefing — o designer precisa saber se pode usar banco de imagem.",
        papel: "social",
        sistema: "Lone OS > Social > card",
        evidencia: "anexo no card ou observação de que não há material",
        opcional: true,
      },
      {
        titulo: "Confirmar que o card chegou no board do designer",
        instrucao:
          "Depois de salvar, veja se o card aparece na fila do designer. Card que fica só no board do " +
          "social não é visto por ninguém e vira atraso silencioso.",
        papel: "social",
        sistema: "Lone OS > Designer",
        evidencia: "card visível na fila do designer",
      },
    ],
    kpis: [
      {
        nome: "Artes entregues no prazo",
        definicao: "% de cards entregues até a data de postagem",
        fonte: "Lone OS — relatório interno de sexta",
        meta: "95%",
        acaoAbaixo: "Levar na reunião de segunda: é carga do designer ou pedido em cima da hora?",
      },
      {
        nome: "Retrabalho",
        definicao: "Artes que voltaram pro designer após entrega",
        fonte: "Lone OS — comentários no card",
        meta: "menos de 10%",
        acaoAbaixo: "Revisar se o briefing está saindo incompleto.",
      },
    ],
    excecoes: [
      {
        situacao: "Cliente pede arte pra sair hoje",
        tratamento:
          "Não crie o card em silêncio. Avise no grupo da equipe, alinhe com o designer o que sai do " +
          "lugar, e responda ao cliente com o prazo real.",
        escalonarPara: "gestor",
      },
      {
        situacao: "Não há preço nem material e o cliente não responde",
        tratamento: "Card fica em rascunho e a pendência entra na cobrança do agente. Não invente preço.",
        escalonarPara: "gestor",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    code: "SOC-02",
    titulo: "Revisar a arte antes de mandar pro cliente",
    area: "social",
    tipo: "checklist",
    resumo: "O social é o último filtro. Nada vai pro cliente sem passar por aqui.",
    tags: ["revisão", "qualidade", "aprovação"],
    objetivo: "Impedir que erro de preço, texto ou informação chegue ao cliente e ao público.",
    problema:
      "Arte com preço errado chegou a ser publicada. Repassar a arte do designer direto pro cliente, " +
      "sem ler, transfere o erro pra frente — e quem responde é a Lone.",
    escopo: "Da entrega do designer até o envio ao cliente.",
    foraDeEscopo: "Produção da arte e publicação.",
    gatilho: "Designer marca a arte como entregue.",
    frequencia: "A cada arte entregue.",
    entradas: "Arte entregue · briefing original · tabela de preços do cliente",
    saidas: "Arte enviada ao cliente, ou devolvida ao designer com o ajuste apontado.",
    criterioPronto: "Arte conferida item a item e enviada, ou devolvida com o que corrigir escrito.",
    criteriosQualidade: "Ortografia · clareza · preço · produto/serviço · CTA (playbook §10).",
    sla: "Enviar preferencialmente até as 15h. Evitar depois das 17h/18h — o cliente não tem tempo de aprovar (playbook §7.3).",
    passos: [
      {
        titulo: "Conferir o preço contra a fonte",
        instrucao:
          "Compare o preço da arte com a tabela que o cliente mandou. Não confie na memória nem na arte " +
          "anterior. Se não houver fonte escrita, pergunte ao cliente antes de enviar.",
        papel: "social",
        evidencia: "preço conferido contra a tabela",
      },
      {
        titulo: "Ler o texto inteiro em voz alta",
        instrucao:
          "Ortografia, gramática e clareza. Ler em voz alta pega erro que a leitura rápida não pega, " +
          "principalmente número trocado e palavra faltando.",
        papel: "social",
        evidencia: "texto revisado",
      },
      {
        titulo: "Conferir produto, localização e contato",
        instrucao:
          "O produto anunciado é o que o cliente vende? O endereço e o telefone estão certos e atuais? " +
          "Erro de contato queima a arte inteira — a pessoa vê o anúncio e não consegue comprar.",
        papel: "social",
        evidencia: "dados conferidos",
      },
      {
        titulo: "Conferir a chamada para ação",
        instrucao:
          "Toda peça precisa dizer o que a pessoa faz agora: chamar no WhatsApp, ir na loja, comentar. " +
          "Post sem CTA é post que não converte (playbook §12).",
        papel: "social",
        evidencia: "CTA presente",
      },
      {
        titulo: "Devolver ao designer se houver erro",
        instrucao:
          "Achou erro: escreva NO CARD o que exatamente corrigir e devolva. Não conserte por fora nem " +
          "mande a arte errada dizendo 'ignora o preço'. Depois do ajuste, revise de novo.",
        papel: "social",
        sistema: "Lone OS > Social > card",
        evidencia: "comentário no card com o ajuste",
        decisao: "Se o erro for do briefing e não do designer, corrija o briefing também.",
        opcional: true,
      },
      {
        titulo: "Enviar ao cliente",
        instrucao:
          "Envie no grupo do cliente ou pelo portal de aprovação. Diga a data prevista de postagem junto — " +
          "o cliente precisa saber até quando responder.",
        papel: "social",
        sistema: "WhatsApp do cliente ou portal",
        evidencia: "arte enviada com a data informada",
      },
    ],
    kpis: [
      {
        nome: "Erro que chegou ao cliente",
        definicao: "Artes com erro apontado pelo cliente após envio",
        fonte: "Grupo do cliente e comentários no card",
        meta: "zero",
        acaoAbaixo: "Cada ocorrência vira conversa na reunião de segunda, sem procurar culpado.",
      },
    ],
    excecoes: [
      {
        situacao: "Cliente aprova mas pede ajuste pequeno",
        tratamento:
          "Volta pro card existente como ajuste, não abre card novo. O agente do CS já roteia assim quando " +
          "identifica pedido de ajuste.",
        escalonarPara: "social",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    code: "SOC-03",
    titulo: "Publicar e registrar a postagem",
    area: "social",
    tipo: "sop",
    resumo: "Publicar e fechar o card — sem isso o sistema acha que o cliente parou de postar.",
    tags: ["publicação", "instagram", "card"],
    objetivo: "Garantir que o que foi publicado seja registrado, pra métrica e cobrança falarem a verdade.",
    problema:
      "Ninguém movia o card depois de publicar: o board tinha 3 cards 'publicado' enquanto o Instagram " +
      "registrava 307 posts em 30 dias. Resultado: a plataforma acusava cliente que tinha postado na " +
      "sexta de estar 21 dias sem post, e o Posts/Mês aparecia zerado pra todo mundo.",
    escopo: "Da aprovação do cliente até o card fechado.",
    foraDeEscopo: "Criação e revisão da arte.",
    gatilho: "Cliente aprovou a arte e chegou a data de postagem.",
    frequencia: "A cada postagem — seg/qua/sex.",
    entradas: "Arte aprovada · legenda pronta · data e horário definidos",
    saidas: "Post no ar e card marcado como publicado.",
    criterioPronto: "Post publicado no perfil E card marcado como publicado no Lone OS.",
    criteriosQualidade: "Legenda com CTA e contato · hashtags · marcação de localização quando fizer sentido.",
    sla: "No dia planejado. Se não for publicar, avisar no grupo da equipe no mesmo dia.",
    passos: [
      {
        titulo: "Conferir a legenda antes de subir",
        instrucao:
          "A legenda fecha com o contato do cliente (regra nº 1 do guia de legendas). Confira também " +
          "se o texto conversa com a arte — legenda genérica em arte específica derruba o post.",
        papel: "social",
        evidencia: "legenda revisada",
      },
      {
        titulo: "Publicar no perfil",
        instrucao: "Publique no horário planejado. Se o cliente publica por conta, confirme com ele que subiu.",
        papel: "social",
        sistema: "Instagram do cliente",
        evidencia: "post no ar",
      },
      {
        titulo: "Marcar o card como publicado",
        instrucao:
          "Volte ao Lone OS e mova o card para publicado. É isso que alimenta Posts/Mês, o alerta de " +
          "'sem post há X dias' e o relatório do cliente. Card não movido = trabalho feito que o " +
          "sistema não enxerga.",
        papel: "social",
        sistema: "Lone OS > Social",
        evidencia: "card em publicado",
      },
      {
        titulo: "Avisar quando NÃO for publicar",
        instrucao:
          "Se a postagem não vai sair (cliente não aprovou, material não chegou), diga no grupo da equipe " +
          "e registre o motivo no card. Silêncio vira atraso sem explicação e o agente cobra em cima.",
        papel: "social",
        sistema: "Grupo da equipe",
        evidencia: "motivo registrado no card",
        opcional: true,
      },
    ],
    kpis: [
      {
        nome: "Posts publicados no mês",
        definicao: "Posts reais no Instagram do cliente no mês corrente",
        fonte: "Instagram (sincronizado todo dia às 6h) — Lone OS mostra na ficha do cliente",
        meta: "12 por mês (3 por semana)",
        acaoAbaixo: "Ver em qual semana ficou o buraco e reprogramar.",
      },
    ],
    excecoes: [
      {
        situacao: "Cliente publica por conta própria e não avisa",
        tratamento:
          "O Instagram é a fonte da verdade: o sistema lê o perfil todo dia. Mesmo assim, marque o card — " +
          "é o que liga o post ao trabalho que a Lone fez.",
        escalonarPara: "social",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    code: "TRF-01",
    titulo: "Colocar cliente novo no ar (tráfego)",
    area: "traffic",
    tipo: "sop",
    resumo: "Do contrato assinado até a campanha rodando e visível no Lone OS.",
    tags: ["onboarding", "meta ads", "setup"],
    objetivo: "Ter o cliente anunciando e aparecendo em relatório, métrica e alerta de saldo.",
    problema:
      "Cliente com gestor atribuído e conta de anúncio NÃO vinculada no Lone OS fica invisível: não " +
      "entra em relatório semanal, não tem métrica, não dispara alerta de saldo. Chegaram a ser 9 " +
      "clientes assim ao mesmo tempo — trabalho acontecendo e sistema cego.",
    escopo: "Do aceite do cliente até a primeira campanha rodando com dados no Lone OS.",
    foraDeEscopo: "Otimização do dia a dia e relatório mensal.",
    gatilho: "Cliente novo aprovado com tráfego pago no contrato.",
    frequencia: "A cada cliente novo — janela de 7 dias.",
    entradas: "Acesso ao Gerenciador do cliente · verba definida · objetivo da campanha",
    saidas: "Campanha no ar e conta vinculada no Lone OS.",
    criterioPronto: "Campanha ativa, gasto aparecendo no Lone OS e cliente saindo de onboarding.",
    criteriosQualidade: "Pixel disparando · público definido · criativo aprovado · verba conferida.",
    sla: "7 dias corridos a partir do aceite.",
    passos: [
      {
        titulo: "Receber acesso ao Gerenciador",
        instrucao:
          "Peça acesso de parceiro à conta de anúncio e à página. Guarde no Cofre de Acessos do cliente — " +
          "não deixe login em conversa de WhatsApp.",
        papel: "trafego",
        sistema: "Lone OS > Clientes > Acessos",
        evidencia: "acesso registrado no cofre",
      },
      {
        titulo: "Vincular a conta de anúncio no Lone OS",
        instrucao:
          "Na ficha do cliente, Visão Geral > Conta Meta Ads, selecione a conta. Sem isso o cliente não " +
          "existe pra nenhuma automação de tráfego.",
        papel: "trafego",
        sistema: "Lone OS > Clientes > Visão Geral",
        evidencia: "conta vinculada e nome aparecendo na ficha",
      },
      {
        titulo: "Conferir o pixel",
        instrucao:
          "Verifique se o pixel está instalado e disparando evento. Sem pixel, a campanha roda às cegas e " +
          "o relatório não mostra conversa nem conversão.",
        papel: "trafego",
        sistema: "Gerenciador da Meta",
        evidencia: "evento disparando no Gerenciador",
      },
      {
        titulo: "Alinhar criativo com o social",
        instrucao:
          "Peça ao social a arte do anúncio pelo board (SOC-01). Anúncio e feed precisam falar a mesma " +
          "coisa — é o que o playbook chama de sinergia com o tráfego (§8).",
        papel: "trafego",
        sistema: "Lone OS > Designer",
        evidencia: "card de criativo criado",
      },
      {
        titulo: "Subir a campanha",
        instrucao:
          "Suba com a verba combinada em contrato. Confira o valor duas vezes: verba errada aparece no " +
          "extrato do cliente antes de aparecer pra gente.",
        papel: "trafego",
        sistema: "Gerenciador da Meta",
        evidencia: "campanha ativa",
      },
      {
        titulo: "Confirmar que o gasto chegou no Lone OS",
        instrucao:
          "No dia seguinte, veja se o gasto aparece no Lone OS. Se não aparecer, a conta não está " +
          "vinculada corretamente — volte ao passo 2.",
        papel: "trafego",
        sistema: "Lone OS > Tráfego",
        evidencia: "gasto visível no painel",
      },
    ],
    kpis: [
      {
        nome: "Dias até a primeira campanha",
        definicao: "Do aceite até a campanha ativa",
        fonte: "Lone OS — data de cadastro x primeiro gasto",
        meta: "até 7 dias",
        acaoAbaixo: "Ver o que travou: acesso, criativo ou verba.",
      },
    ],
    excecoes: [
      {
        situacao: "Cliente não libera acesso",
        tratamento: "Registre a pendência na ficha e avise a gestão. O prazo de 7 dias fica suspenso, mas o motivo tem que estar escrito.",
        escalonarPara: "gestor",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  {
    code: "CS-01",
    titulo: "Setup dos 7 primeiros dias do cliente",
    area: "cs",
    tipo: "checklist",
    resumo: "O que precisa estar de pé na primeira semana pra o cliente sair de onboarding.",
    tags: ["onboarding", "perfil", "setup"],
    objetivo: "Deixar o perfil do cliente apresentável e a operação rodando na primeira semana.",
    problema:
      "Cliente ficava meses 'em onboarding' com trabalho acontecendo, porque nada media o que já estava " +
      "pronto. Um cliente passou 98 dias assim, com 7 artes entregues.",
    escopo: "Dos 7 primeiros dias do cliente novo.",
    foraDeEscopo: "Rotina de conteúdo depois de estabilizado.",
    gatilho: "Cliente aprovado e cadastrado no Lone OS.",
    frequencia: "Uma vez por cliente novo.",
    entradas: "Acesso ao Instagram · logo · informações da loja",
    saidas: "Perfil montado e cliente ativo no sistema.",
    criterioPronto:
      "Cliente de social: pelo menos uma arte entregue. Cliente de anúncio: conta vinculada e campanha " +
      "rodando. Cliente completo: as duas coisas.",
    criteriosQualidade: "Perfil com identidade coerente e informação de contato correta.",
    sla: "7 dias corridos a partir do cadastro.",
    passos: [
      {
        titulo: "Logo finalizada",
        instrucao: "Logo tratada e disponível pra equipe na ficha do cliente.",
        papel: "designer",
        sistema: "Lone OS > Clientes > Dados",
        evidencia: "logo na ficha",
      },
      {
        titulo: "Bio do perfil escrita",
        instrucao: "Bio dizendo o que a loja faz, onde fica e como comprar. Não é slogan — é informação útil.",
        papel: "social",
        evidencia: "bio publicada no perfil",
      },
      {
        titulo: "Linktree no ar",
        instrucao: "Link único com WhatsApp, localização e catálogo, conforme o que o cliente tem.",
        papel: "social",
        evidencia: "link ativo na bio",
      },
      {
        titulo: "Destaques criados e capeados",
        instrucao: "Destaques organizados com capa padronizada na identidade do cliente.",
        papel: "social",
        evidencia: "destaques no perfil",
      },
      {
        titulo: "3 artes fixadas no feed",
        instrucao:
          "Padrão: localização · o que você encontra na loja · feedbacks de clientes. Pode trocar por " +
          "vídeo de apresentação, horário de funcionamento ou variação do mix — a regra são TRÊS FIXADOS, " +
          "não três temas engessados. Localização e prova social precisam aparecer em algum lugar do perfil.",
        papel: "designer",
        evidencia: "3 posts fixados no perfil",
      },
      {
        titulo: "Vídeos recebidos",
        instrucao: "Só para cliente que grava vídeo: material bruto recebido e organizado.",
        papel: "social",
        evidencia: "material na pasta do cliente",
        opcional: true,
      },
      {
        titulo: "Anúncio no ar e conta vinculada",
        instrucao: "Só para cliente de tráfego: ver TRF-01. Conta vinculada no Lone OS é parte do setup, não detalhe técnico.",
        papel: "trafego",
        sistema: "Lone OS > Clientes",
        evidencia: "gasto aparecendo no painel",
        opcional: true,
      },
    ],
    kpis: [
      {
        nome: "Setup fechado em 7 dias",
        definicao: "% de clientes novos com o checklist completo dentro do prazo",
        fonte: "Lone OS > Tarefas",
        meta: "100%",
        acaoAbaixo: "Ver na cobrança diária do agente qual item trava e quem está sem dono.",
      },
    ],
    excecoes: [
      {
        situacao: "Cliente não manda material da loja",
        tratamento:
          "As fixadas ficam pendentes e o cliente segue em onboarding, com o motivo escrito. Não invente " +
          "conteúdo de loja que você não conhece.",
        escalonarPara: "gestor",
      },
    ],
  },
  // ══════════════════════════════════════════════════════════════════════════
  // COM-01 — transcrito do "Fluxo Completo Lone Mídia" (proposta operacional v1.0, Roberto, 12/11/2026).
  // É o PROCESSO-ALVO: cada passo diz "HOJE NO SISTEMA" quando o Lone OS ainda não faz o que o processo
  // pede, para ninguém esperar por uma automação que não existe. A comparação linha a linha com o código
  // está em docs/FLUXO_ENTRADA_CLIENTES.md. Sem nome de cliente e sem valor: o repositório é público.
  {
    code: "COM-01",
    titulo: "Entrada de cliente: da venda fechada à ativação",
    area: "comercial",
    tipo: "processo",
    resumo:
      "A jornada inteira: lead, follow-up, venda fechada, cadastro, contrato, assinatura na D4Sign, cobrança, " +
      "pasta do Drive e início da entrega. Processo-alvo, com o que o sistema já faz marcado passo a passo.",
    tags: ["venda", "cadastro", "onboarding", "contrato", "d4sign", "drive", "cobrança", "ativação"],
    objetivo:
      "Toda venda fechada vira um fluxo de trabalho com responsável, etapa, bloqueio e próxima ação visíveis, " +
      "em vez de uma sequência de mensagens soltas. O tempo entre a venda e a ativação diminui sem aumentar erro.",
    problema:
      "Venda fechada, contrato assinado e cliente ativado eram tratados como a mesma coisa. O valor era " +
      "perguntado de novo na hora do contrato, o contrato saía antes de o cadastro ser revisado, a pasta do " +
      "Drive e o envio para assinatura dependiam de alguém lembrar, e o cliente começava a ser atendido sem " +
      "contrato assinado nem cobrança.",
    escopo: "Do lead criado no Comercial até o cliente ativado, com kickoff marcado e acompanhamento iniciado.",
    foraDeEscopo:
      "Rotina de conteúdo e de tráfego depois da ativação (SOC-01 a SOC-03, TRF-01), o setup da primeira " +
      "semana (CS-01), renovação e encerramento de contrato.",
    gatilho: "Lead criado no Comercial. O ponto de virada é a venda fechada (lead em Ganho).",
    frequencia: "A cada lead e a cada venda fechada.",
    entradas:
      "Lead com empresa, contato, telefone, responsável, origem e serviço de interesse · acordo fechado " +
      "(serviço, valor, vigência, condições) · cadastro preenchido pelo cliente · modelo de contrato do serviço",
    saidas:
      "Cliente ativo no Lone OS com cadastro aprovado, contrato assinado e arquivado, cobrança emitida, " +
      "pasta no Drive, grupo de WhatsApp, responsáveis definidos e kickoff marcado.",
    criterioPronto:
      "Cadastro aprovado + contrato com todas as assinaturas confirmadas pela D4Sign + situação financeira " +
      "conforme a política + responsável designado + acessos mínimos recebidos. Venda fechada não é contrato " +
      "assinado, e contrato assinado não é cliente ativado.",
    criteriosQualidade:
      "Nenhum dado é pedido duas vezes: o que o Comercial registrou vale para o contrato e para a cobrança. " +
      "Nada é informado como assinado, cobrado ou enviado sem a confirmação do serviço (D4Sign, Asaas, Google). " +
      "Repetir uma ação não cria cliente, contrato, cobrança ou pasta em dobro.",
    sla:
      "A DEFINIR: prazo de cada etapa e quem assume o cliente depois da venda. Referência atual do sistema: " +
      "aviso de contrato sem assinatura depois de 3 dias, setup em 7 dias (CS-01).",
    passos: [
      {
        titulo: "Cadastrar o lead sem duplicar",
        instrucao:
          "Antes de criar, procure no Comercial pelo telefone e pelo nome da empresa. Cadastre com empresa, " +
          "contato, telefone/WhatsApp, responsável, origem e serviço de interesse. HOJE NO SISTEMA: só o nome " +
          "do contato é obrigatório, a tela não confere duplicidade (só o Loninho de vendas e a importação " +
          "conferem) e o lead não tem campo de CNPJ. A conferência é manual.",
        papel: "comercial",
        sistema: "Lone OS > Comercial > Funil",
        evidencia: "lead no funil com responsável e origem preenchidos",
      },
      {
        titulo: "Cumprir a cadência de follow-up",
        instrucao:
          "Processo-alvo: cinco ações em dias úteis (D1 WhatsApp, D2 WhatsApp, D3 ligação, D4 ligação em outro " +
          "horário, D5 última mensagem). Registre cada toque como atividade no lead. Se o lead respondeu, marcou " +
          "reunião ou trouxe objeção, mude a etapa ou use 'Retomar em'. HOJE NO SISTEMA: a régua é por etapa e " +
          "em dias corridos, aparece na aba Hoje e não cria tarefa. O sistema não percebe sozinho que o lead " +
          "respondeu: sem mudar a etapa, ele continua sugerindo toque.",
        papel: "comercial",
        sistema: "Lone OS > Comercial > Hoje",
        evidencia: "atividade registrada no lead a cada toque",
      },
      {
        titulo: "Decidir o lead com a régua encerrada",
        instrucao:
          "Depois da última tentativa sem resposta, o lead aparece em 'Régua encerrada'. Decida: perdido (com " +
          "motivo) ou retomar em 30 dias. A oportunidade nunca é encerrada sozinha.",
        papel: "comercial",
        sistema: "Lone OS > Comercial > Hoje",
        evidencia: "lead marcado como perdido com motivo, ou com data de retomada",
        decisao: "Perdido ou retomar em 30 dias",
      },
      {
        titulo: "Fechar a venda com o acordo completo",
        instrucao:
          "Antes de mover para Ganho, confira no lead: serviço vendido, valor mensal exato, taxa de implantação " +
          "(se houver), vigência, condições negociadas e a evidência do aceite (mensagem ou e-mail do cliente). " +
          "HOJE NO SISTEMA: mover para Ganho não exige nenhum campo, e não existe o registro congelado do " +
          "acordo. O contrato e o financeiro leem o valor que estiver no lead no momento, então NÃO altere o " +
          "valor do lead depois de fechar. Vigência, desconto e data de início não têm campo: escreva na " +
          "observação do lead.",
        papel: "comercial",
        sistema: "Lone OS > Comercial > Funil",
        evidencia: "lead em Ganho com valor mensal preenchido e aceite anotado",
      },
      {
        titulo: "Criar o cadastro e enviar o link ao cliente",
        instrucao:
          "No lead em Ganho, clique em 'Criar cadastro e enviar link'. O sistema cria o cliente em rascunho, " +
          "gera um link único (um lead, um cliente: o segundo clique é recusado), avisa o grupo de cadastro " +
          "sem valor nem dado sensível e abre as tarefas de criar e vincular o grupo de WhatsApp. Envie o link " +
          "ao cliente pelo WhatsApp. Venda em Ganho sem cadastro fica listada na aba Fechados até resolver.",
        papel: "comercial",
        sistema: "Lone OS > Comercial > Fechados",
        evidencia: "aviso do link no grupo de cadastro e cliente em 'aguardando cadastro'",
      },
      {
        titulo: "Preencher o cadastro",
        instrucao:
          "O cliente preenche pelo link: CNPJ, razão social, endereço, quem assina (nome, cargo, CPF, e-mail), " +
          "acessos e documentos. O sistema devolve só os campos que faltam ou estão errados. HOJE NO SISTEMA: " +
          "para cliente novo o formulário abre vazio (não vem preenchido com o que o Comercial já sabe).",
        papel: "cliente",
        sistema: "Link de cadastro do Lone OS",
        evidencia: "cadastro enviado (aviso 'Novo cadastro pendente')",
      },
      {
        titulo: "Revisar e aprovar o cadastro",
        instrucao:
          "Em Cadastros Pendentes, confira razão social e CNPJ, se quem assina tem poder de representar a " +
          "empresa (cargo e e-mail preenchidos) e se o serviço bate com a venda. Cadastro enviado não é " +
          "cadastro aprovado. HOJE NO SISTEMA: aprovar já torna o cliente ativo, sem conferir contrato nem " +
          "cobrança. Só aprove quando o passo 'Liberar o início da operação' estiver cumprido, ou registre a " +
          "exceção.",
        papel: "gestor",
        sistema: "Lone OS > Clientes > Pendentes",
        evidencia: "cadastro aprovado com signatário, cargo e e-mail conferidos",
      },
      {
        titulo: "Conferir a pasta do cliente no Drive",
        instrucao:
          "Ao fim do cadastro o sistema cria 'Clientes Lone Mídia > Cliente' com Documentos (só admin) e Fotos " +
          "e Vídeos (social e designer do cliente) e manda os links no grupo de cadastro. Se vier 'Pasta do " +
          "Drive não criada', abra a ficha em Marca & Briefing > Pasta do Drive, leia o motivo e clique em " +
          "'Tentar de novo'. Senha nunca vai para o Drive: fica no cofre do Lone OS. HOJE NO SISTEMA: são 2 " +
          "subpastas, não as 8 da proposta (00_Administrativo a 07_Financeiro), e o contrato assinado não é " +
          "copiado para o Drive.",
        papel: "gestor",
        sistema: "Lone OS > Clientes > ficha > Marca & Briefing",
        evidencia: "links das duas pastas na ficha do cliente",
      },
      {
        titulo: "Gerar a minuta do contrato",
        instrucao:
          "Gere o contrato só depois do cadastro aprovado. O valor mensal vem da venda: não redigite. Informe " +
          "o dia de vencimento. Mantenha separadas as quatro datas: assinatura, início do serviço, primeiro " +
          "vencimento e recorrência. Prefira gerar pelo grupo de cadastro, que roda a auditoria (razão social, " +
          "CNPJ, representante, CPF, endereço, escopo e valores) e bloqueia divergência. HOJE NO SISTEMA: o " +
          "contrato é oferecido já no envio do cadastro, antes da revisão; o gerador da ficha não passa pela " +
          "auditoria; cargo ou e-mail ausente gera só alerta; a vigência é o padrão da casa e o vencimento é " +
          "sempre perguntado.",
        papel: "gestor",
        sistema: "Lone OS > Clientes > ficha > Contratos",
        evidencia: "contrato em rascunho na ficha, com versão e PDF",
      },
      {
        titulo: "Aprovar e enviar para assinatura na D4Sign",
        instrucao:
          "Na ficha > Contratos, clique em 'Enviar para assinatura', confira na prévia quem assina, o e-mail e " +
          "o cofre, e confirme. Nada é enviado sozinho e nenhuma mensagem de WhatsApp dispara o envio. Se " +
          "falhar no meio, clique de novo: o envio continua de onde parou, sem subir o contrato duas vezes. " +
          "Condições para o envio: e-mail válido no cadastro do cliente, PDF do contrato guardado, cofre " +
          "escolhido e e-mail de quem assina pela Lone em Configurações > Jurídico. A conta da D4Sign aceita " +
          "10 chamadas por hora: recusa por limite se resolve esperando alguns minutos. HOJE NO SISTEMA: não " +
          "existe o estado 'aprovado' separado do envio; o clique de quem tem papel de gestão é a aprovação.",
        papel: "gestor",
        sistema: "Lone OS > Clientes > ficha > Contratos",
        evidencia: "aviso 'enviado para assinatura' no grupo de cadastro",
      },
      {
        titulo: "Acompanhar a assinatura até o fim",
        instrucao:
          "A D4Sign avisa a cada assinatura; o grupo de cadastro recebe 'assinado por X, falta Y' e depois " +
          "'assinou o contrato'. Só com todas as assinaturas o contrato conta como assinado. Dia útil, 8h30, " +
          "sai a lista de contratos enviados há 3 dias ou mais sem assinatura: cobre o cliente. O PDF assinado " +
          "é guardado no Lone OS de madrugada. HOJE NO SISTEMA: recusa do signatário e e-mail devolvido não " +
          "geram aviso; confira no painel da D4Sign quando o contrato não andar.",
        papel: "gestor",
        sistema: "Grupo de cadastro e Lone OS > Contratos",
        evidencia: "contrato com 'Assinado na D4Sign' e PDF assinado no arquivo",
      },
      {
        titulo: "Emitir a cobrança",
        instrucao:
          "Com o contrato assinado, confirme o contrato no Lone Finance (a Conferência mostra 'assinado na " +
          "D4Sign e sem contrato aqui' como urgente) e emita a cobrança no Asaas com o valor e o vencimento do " +
          "contrato. Cobrança criada não é pagamento confirmado. HOJE NO SISTEMA: não há integração com o " +
          "Asaas. A cobrança, a confirmação de pagamento e o registro de atraso são manuais.",
        papel: "admin",
        sistema: "Lone Finance > Conferência e painel do Asaas",
        evidencia: "contrato confirmado no Lone Finance e cobrança emitida no Asaas",
      },
      {
        titulo: "Liberar o início da operação",
        instrucao:
          "Só libere com: cadastro aprovado, contrato assinado, situação financeira conforme a política, " +
          "responsável designado (tráfego, social, designer) e acessos mínimos recebidos. Para começar antes, " +
          "registre na linha do tempo do cliente quem autorizou, o motivo, o prazo e a condição para " +
          "regularizar. A exceção não apaga a pendência. A DEFINIR: se o pagamento confirmado é exigido antes " +
          "do kickoff e quem pode autorizar início antecipado. HOJE NO SISTEMA: não existe trava; a conferência " +
          "é de quem aprova.",
        papel: "gestor",
        sistema: "Lone OS > Clientes > ficha",
        evidencia: "cliente aprovado com responsáveis definidos, ou exceção registrada na linha do tempo",
        decisao: "Liberar, ou registrar exceção com quem autorizou, motivo e prazo",
      },
      {
        titulo: "Criar o grupo, marcar o kickoff e iniciar o acompanhamento",
        instrucao:
          "Cumpra as tarefas [Onboarding] de criar o grupo de WhatsApp e vincular o grupo na ficha, marque a " +
          "primeira reunião de alinhamento e siga o checklist do serviço contratado (CS-01). Processo-alvo: " +
          "acompanhamento em 7, 14 e 30 dias. HOJE NO SISTEMA: o acompanhamento é o setup de 7 dias com " +
          "cobrança até 15 dias e marcos de 3 e 6 meses; o tempo da venda até a ativação não é medido.",
        papel: "social",
        sistema: "Lone OS > Tarefas e ficha do cliente",
        evidencia: "grupo vinculado na ficha e primeira reunião registrada",
      },
    ],
    kpis: [
      {
        nome: "Tempo da venda até a ativação",
        definicao: "Dias entre o lead ir para Ganho e o cliente ser ativado, por cliente e por etapa",
        fonte: "Lone OS > Comercial > Fechados e a mensagem 'Entrada de clientes' das 8h30 (medição automática ainda não existe)",
        meta: "A DEFINIR: prazo-alvo em dias",
        acaoAbaixo: "Ver em qual etapa o cliente está parado, quem é o responsável e registrar a próxima ação.",
      },
      {
        nome: "Vendas em Ganho sem cadastro",
        definicao: "Quantidade de leads em Ganho que ainda não têm cadastro criado ou enviado",
        fonte: "Lone OS > Comercial > Fechados",
        meta: "Zero com mais de 1 dia útil",
        acaoAbaixo: "O vendedor responsável cria o cadastro e envia o link no mesmo dia.",
      },
      {
        nome: "Contratos enviados sem assinatura há 3 dias ou mais",
        definicao: "Contratos na D4Sign esperando assinatura há 3 dias ou mais",
        fonte: "Aviso 'Ainda não assinaram o contrato' no grupo de cadastro (dia útil, 8h30)",
        meta: "Zero",
        acaoAbaixo: "Cobrar quem falta assinar no mesmo dia e conferir o e-mail do signatário.",
      },
    ],
    excecoes: [
      {
        situacao: "Cliente precisa começar antes de assinar o contrato ou de pagar",
        tratamento:
          "Registrar na linha do tempo quem autorizou, o motivo, o prazo e a condição de regularização. A " +
          "pendência continua aberta até ser resolvida.",
        escalonarPara: "admin",
      },
      {
        situacao: "Preço, escopo ou cláusula mudou depois de o contrato ser gerado",
        tratamento:
          "Gerar nova versão do contrato (ou adendo) e passar de novo pela revisão antes de enviar. Não enviar " +
          "a versão antiga.",
        escalonarPara: "gestor",
      },
      {
        situacao: "Quem assina não tem cargo ou poder de representação no cadastro",
        tratamento: "Não enviar para assinatura. Pedir ao cliente o dado que falta e corrigir na ficha.",
        escalonarPara: "gestor",
      },
      {
        situacao: "Pasta do Drive não foi criada ou o envio à D4Sign falhou",
        tratamento:
          "Ler o motivo que o sistema mostra na ficha (Pasta do Drive) ou no contrato e repetir a ação pelo " +
          "botão. Não criar pasta à mão nem subir o contrato pelo painel da D4Sign em paralelo, para não " +
          "duplicar.",
        escalonarPara: "admin",
      },
    ],
  },
];
