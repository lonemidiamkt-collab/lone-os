// lib/loninho/pedidos/catalogo.ts — O QUE O LONINHO SABE FAZER, num lugar só. Puro.
//
// Roberto (05/10/2026): "temos que preparar um manual também para o Loninho — eu peço em áudio ou
// mensagem 'Loninho, me manda os clientes que precisam da minha atenção hoje' e ele manda um PDF ...
// os clientes que tiveram bons resultados essa semana, os que não tiveram ... crie uma boa estrutura".
//
// Antes, cada comando era um `if` solto no inbound (3.500 linhas) e o manual era texto escrito à mão
// em três lugares diferentes, que ficava velho. Agora:
//   - PEDIDOS_PDF: o que ele monta NA HORA em PDF (detectar.ts reconhece; atender.ts executa);
//   - COMANDOS_EXISTENTES: o que já existia, descrito com as frases que de fato acionam (as regex do
//     inbound) — pra o manual não ensinar frase que não funciona;
//   - manualTexto() e pedidosParaOAgente(): o manual em PDF e a auto-descrição do agente saem DAQUI.
// Pedido novo entra aqui primeiro; o manual se atualiza sozinho.

export type IdPedido = "atencao_hoje" | "resultados_semana" | "diagnostico_trafego" | "manual";

export interface Entrada {
  titulo: string;
  oQueFaz: string;
  /** Frases que funcionam (texto ou áudio). A primeira é a principal. */
  exemplos: string[];
  /** O que volta: "PDF", "texto" ou "PDF no grupo do cliente". */
  volta: string;
  /** Onde funciona e quem pode. */
  onde: string;
}

export interface PedidoPdf extends Entrada { id: IdPedido }

export const PEDIDOS_PDF: PedidoPdf[] = [
  {
    id: "atencao_hoje",
    titulo: "Quem precisa da minha atenção hoje",
    oQueFaz: "As prioridades abertas no seu nome, os clientes da sua carteira em risco ou pedindo atenção (com o porquê e a próxima ação) e, pra quem cuida de tráfego, as contas paradas ou com saldo zerado hoje. Sócio e gestão podem pedir \"da equipe\" pra ver todo mundo.",
    exemplos: [
      "Loninho, me manda os clientes que precisam da minha atenção hoje",
      "Loninho, quem precisa de mim hoje?",
      "Loninho, clientes em risco da equipe",
    ],
    volta: "PDF",
    onde: "grupos internos (artes, tráfego, equipe e cadastro) — quem estiver cadastrado no time",
  },
  {
    id: "resultados_semana",
    titulo: "Resultados da semana",
    oQueFaz: "A semana que fechou (segunda a domingo) contra a anterior, cliente por cliente de tráfego: quem melhorou, quem piorou e quem parou de rodar, com investimento, conversas e custo por conversa.",
    exemplos: [
      "Loninho, me manda os clientes que tiveram bons resultados essa semana",
      "Loninho, quem foi mal essa semana?",
      "Loninho, resultados da semana",
    ],
    volta: "PDF",
    onde: "grupos internos — quem estiver cadastrado no time",
  },
  {
    id: "diagnostico_trafego",
    titulo: "Diagnóstico do tráfego",
    oQueFaz: "O diagnóstico das contas de anúncio agora: contas sem entrega, desperdício, anomalias, verba mal distribuída, criativo cansado e o que merece mais verba.",
    exemplos: ["Loninho, me manda o diagnóstico do tráfego", "Loninho, como estão as contas hoje?"],
    volta: "PDF",
    onde: "grupos internos — quem estiver cadastrado no time",
  },
  {
    id: "manual",
    titulo: "Este manual",
    oQueFaz: "Tudo o que o Loninho sabe fazer, com as frases que funcionam.",
    exemplos: ["Loninho, me manda o manual", "Loninho, o que você sabe fazer?"],
    volta: "PDF",
    onde: "grupos internos",
  },
];

/** Comandos que já existiam — frases tiradas das regras que de fato os reconhecem (inbound). */
export const COMANDOS_EXISTENTES: Entrada[] = [
  { titulo: "Minhas prioridades agora", oQueFaz: "As 5 coisas mais importantes no seu nome, com o fato e o que fazer.", exemplos: ["Lone, o que preciso fazer hoje?", "Lone, minhas pendências de hoje"], volta: "texto", onde: "grupos internos" },
  { titulo: "Calendário de conteúdo", oQueFaz: "Planeja a semana, a quinzena ou o mês do cliente com direção de arte de cada peça.", exemplos: ["Lone, monta o calendário mensal do [cliente]", "Lone, faz o planejamento da semana do [cliente]"], volta: "PDF", onde: "grupos internos" },
  { titulo: "Roteiro", oQueFaz: "Escreve o roteiro de vídeo ou anúncio pelo Método Lone.", exemplos: ["Lone, faz um roteiro pro [cliente]"], volta: "PDF", onde: "grupos internos" },
  { titulo: "Raio-X do cliente", oQueFaz: "O panorama do cliente: demandas, entregas, pendências e como ele anda.", exemplos: ["Lone, raio-x do [cliente]", "Lone, como anda o [cliente]?"], volta: "texto", onde: "grupos de artes e de tráfego" },
  { titulo: "Status de uma demanda", oQueFaz: "Se a demanda do cliente já foi feita, entregue ou está parada.", exemplos: ["Lone, a demanda do [cliente] foi feita?"], volta: "texto", onde: "grupos de artes e de tráfego" },
  { titulo: "Check-in do cliente", oQueFaz: "Coleta de negócio (leads, atendimento, objeções, prioridades) e registra na ficha.", exemplos: ["Lone, faz o check-in do [cliente]", "Lone, faz o check-in do [cliente] pro cliente"], volta: "texto (ou no grupo do cliente)", onde: "grupos internos" },
  { titulo: "Cobrar pendências do cliente", oQueFaz: "Cobra o que o cliente deve (material, informação, aprovação) mostrando o impacto. Quando chega, dá baixa.", exemplos: ["Lone, cobra as pendências do [cliente]", "Lone, o [cliente] já mandou as fotos"], volta: "texto (ou no grupo do cliente)", onde: "grupos internos" },
  { titulo: "Reunião do cliente", oQueFaz: "Prepara o briefing antes e registra decisões e próximas ações depois.", exemplos: ["Lone, prepara a reunião do [cliente]", "Lone, resumo da reunião do [cliente]: <suas notas>"], volta: "texto", onde: "grupos internos" },
  { titulo: "Transformar texto em PDF", oQueFaz: "Diagrama no padrão Lone o texto que você mandar junto.", exemplos: ["Loninho, transforma esse texto em PDF pro [cliente] <texto>"], volta: "PDF", onde: "grupos internos" },
  { titulo: "Criar demanda", oQueFaz: "Cria a demanda no quadro do cliente.", exemplos: ["Lone, cria uma demanda na [cliente] sobre [tema]"], volta: "texto", onde: "grupos de artes e de tráfego" },
  { titulo: "Datas e ideias", oQueFaz: "Datas comemorativas que vêm aí e ideias de post por cliente.", exemplos: ["Lone, que datas vêm aí?", "Lone, ideias de post pro [cliente]"], volta: "texto", onde: "grupos internos" },
  { titulo: "Ausência do time", oQueFaz: "Registra férias ou folga pra ninguém cobrar quem está fora.", exemplos: ["Lone, o [pessoa] tá de férias até dia [data]"], volta: "texto", onde: "grupos de artes e de tráfego" },
];

/** O manual no formato de aviso do WhatsApp (vira PDF em lib/reports/avisoPdf.ts). */
export function manualTexto(): string {
  const bloco = (e: Entrada) =>
    [`*${e.titulo}*`, e.oQueFaz, ...e.exemplos.map((x) => `• "${x}"`), `_Volta em ${e.volta} · ${e.onde}_`].join("\n");
  return [
    "*Manual do Loninho*",
    "Pode pedir por mensagem ou por áudio, nos grupos internos. Comece chamando pelo nome (Lone ou Loninho). Ele responde na hora que entendeu e manda o PDF em seguida.",
    "─────",
    "*📄 Relatórios em PDF, na hora*",
    ...PEDIDOS_PDF.filter((p) => p.id !== "manual").map(bloco),
    "─────",
    "*🛠️ Outros comandos*",
    ...COMANDOS_EXISTENTES.map(bloco),
    "─────",
    "*Regras da casa*",
    "• Nada disso funciona no grupo de cliente: relatório com dado de outros clientes nunca sai lá.",
    "• Só o sistema escreve no grupo do cliente, e só quando você pede \"pro cliente\".",
    "• Pediu e ele não entendeu? Repita com uma das frases acima — ou diga \"Loninho, me manda o manual\".",
    "• Voz no painel: quem cuida de tráfego ouve, em voz alta, conta parada e saldo zerado (dia útil, 8h às 18h, até 5 por dia). Os outros ligam no sino, em \"Voz desligada\", se quiserem.",
  ].join("\n\n");
}

/** Bloco pra auto-descrição do agente (lib/cs/conversa.ts) — mesma fonte do manual. */
export function pedidosParaOAgente(): string {
  return PEDIDOS_PDF.map((p) => `- ${p.titulo.toUpperCase()} em PDF, na hora: "${p.exemplos[0]}". ${p.oQueFaz}`).join("\n");
}
