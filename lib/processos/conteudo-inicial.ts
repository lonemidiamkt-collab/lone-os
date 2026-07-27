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
];
