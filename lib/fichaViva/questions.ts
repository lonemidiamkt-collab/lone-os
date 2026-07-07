// lib/fichaViva/questions.ts — as 10 perguntas do diagnóstico comercial (estruturação
// comercial) que o cliente responde no link da Ficha Viva. Fonte única: usadas tanto no
// formulário público quanto no prompt da IA. Ordem e ids são estáveis (o id vira chave em
// client_diagnostics.respostas).

export interface DiagQuestion {
  id: string;
  label: string;        // a pergunta como o cliente lê
  placeholder?: string; // exemplo pra guiar a resposta
}

export const DIAG_QUESTIONS: DiagQuestion[] = [
  { id: "produto",        label: "Qual é o seu principal produto ou serviço, e qual o ticket médio dele?", placeholder: "Ex: piso porcelanato — ticket médio de R$ 3.000 por venda" },
  { id: "cliente_ideal",  label: "Quem é o seu cliente ideal? (perfil, região, faixa de renda)", placeholder: "Ex: famílias reformando a casa, Região dos Lagos, classe B/C" },
  { id: "origem_vendas",  label: "Hoje, de onde vem a MAIORIA das suas vendas?", placeholder: "Ex: 60% indicação, 30% Instagram, 10% loja física" },
  { id: "volume",         label: "Quantas vendas ou orçamentos você fecha por mês, em média?", placeholder: "Ex: uns 20 orçamentos, fecho 8" },
  { id: "meta",           label: "Qual a sua meta de faturamento para os próximos 6 meses?", placeholder: "Ex: sair de R$ 40 mil para R$ 70 mil/mês" },
  { id: "gargalo",        label: "Qual o seu MAIOR gargalo hoje para vender mais?", placeholder: "Ex: falta de leads, equipe pequena, estoque, preço" },
  { id: "processo",       label: "Você tem um processo de atendimento/vendas definido? (quem responde, em quanto tempo, tem script?)", placeholder: "Ex: eu mesmo respondo pelo WhatsApp quando dá, sem script" },
  { id: "diferencial",    label: "O que te diferencia dos concorrentes? Por que o cliente compra de você?", placeholder: "Ex: entrega rápida, atendimento próximo, garantia" },
  { id: "indicadores",    label: "Você acompanha algum número do negócio hoje? (faturamento, ticket, taxa de fechamento)", placeholder: "Ex: só olho o faturamento no fim do mês" },
  { id: "prioridade",     label: "Se pudesse resolver UMA coisa no seu comercial nos próximos 90 dias, qual seria?", placeholder: "Ex: ter um fluxo constante de leads qualificados" },
];
