// lib/cs/bibliotecas.ts
// ─────────────────────────────────────────────────────────────────────────────
// BIBLIOTECAS DO LONE MARKETING OS — o repertório curado que o estágio de DECISÃO
// e de EXECUÇÃO consultam. É a "mão" (repertório) que executa a "cabeça" (fluxo de
// decisão em estrategista.ts) sobre a "espinha" (contrato em pipeline.ts).
//
// Não são regras rígidas — são referências. O agente escolhe o que serve à decisão.
// Ver docs/lone-marketing-os.md §6. Cada bloco tem uma forma STRUCT (pra escolha) e,
// quando útil, uma forma STRING compacta pra injeção em prompt.
// ─────────────────────────────────────────────────────────────────────────────

// ── Estruturas por formato (o esqueleto de execução de cada peça) ────────────

export interface EstruturaFormato { formato: string; passos: string[]; regra: string }

export const ESTRUTURAS_FORMATO: EstruturaFormato[] = [
  {
    formato: "carrossel",
    passos: [
      "Slide 1 — gancho forte (para o scroll; promessa ou tensão)",
      "Slides 2–6 — construção lógica (um argumento/ideia por slide, ritmo)",
      "Penúltimo — resumo/virada (o insight que amarra tudo)",
      "Último — CTA (salvar, enviar pra alguém, chamar no direct)",
    ],
    regra: "Um slide = uma ideia. Se não avança o raciocínio, corta. Varie o layout entre slides.",
  },
  {
    formato: "reel",
    passos: [
      "0–3s — gancho (a retenção se ganha ou perde aqui)",
      "Desenvolvimento — entrega a promessa do gancho, sem enrolar",
      "Pico — o ponto de maior impacto/insight",
      "Fechamento — conclusão que reposiciona a marca",
      "CTA — ação clara (seguir, salvar, chamar)",
    ],
    regra: "Fala direta, cortes rápidos, legível sem som. O gancho promete; o corpo entrega.",
  },
  {
    formato: "post",
    passos: [
      "Headline — a promessa/tensão numa linha",
      "Subheadline — abre o loop ou qualifica",
      "Corpo — desenvolve com foco na dor/desejo",
      "CTA — a ação ou a pergunta que gera conversa",
    ],
    regra: "Arte fala UMA coisa. Se precisa explicar a arte, a arte falhou.",
  },
  {
    formato: "stories",
    passos: [
      "Story 1 — gancho", "Story 2 — curiosidade", "Story 3 — desenvolvimento",
      "Story 4 — autoridade/prova", "Story 5 — CTA",
    ],
    regra: "Sequência pensada em RETENÇÃO — cada story dá motivo pra tocar no próximo.",
  },
  {
    formato: "video_venda",
    passos: [
      "Gancho", "Problema", "Consequência (o custo de não resolver)", "Solução",
      "Diferencial", "Prova", "Oferta", "CTA",
    ],
    regra: "Vende a transformação/solução, nunca o produto pelo produto.",
  },
];

/** Forma compacta pra injetar no executor de um formato específico. */
export function estruturaDoFormato(formato: string): string {
  const e = ESTRUTURAS_FORMATO.find((x) => x.formato === formato);
  if (!e) return "";
  return `# ESTRUTURA (${e.formato})\n${e.passos.map((p) => `- ${p}`).join("\n")}\nRegra: ${e.regra}`;
}

// ── Frameworks de copy (escolher pelo objetivo da peça) ──────────────────────

export interface Framework { nome: string; estrutura: string; quandoUsar: string }

export const FRAMEWORKS_COPY: Framework[] = [
  { nome: "AIDA", estrutura: "Atenção → Interesse → Desejo → Ação", quandoUsar: "conteúdo comercial e anúncios clássicos" },
  { nome: "PAS", estrutura: "Problema → Agitação → Solução", quandoUsar: "quando a dor é forte e conhecida" },
  { nome: "BAB", estrutura: "Antes → Depois → Ponte", quandoUsar: "mostrar transformação; provas e cases" },
  { nome: "Hook-Story-Offer", estrutura: "Gancho → História → Oferta", quandoUsar: "reels e vídeos de venda" },
  { nome: "PASTOR", estrutura: "Problema → Amplificação → História → Transformação → Oferta → Resposta", quandoUsar: "copy longa e persuasiva" },
  { nome: "4U", estrutura: "Útil, Urgente, Único, Ultra-específico (headline)", quandoUsar: "afinar headlines" },
  { nome: "Golden Circle", estrutura: "Por quê → Como → O quê", quandoUsar: "conteúdo de marca/posicionamento" },
  { nome: "FAB", estrutura: "Feature → Advantage → Benefit", quandoUsar: "traduzir característica em benefício real" },
];

// ── Ganchos (padrões de abertura — a 1ª linha) ───────────────────────────────

export interface PadraoGancho { tipo: string; padrao: string; exemplo: string }

export const GANCHOS: PadraoGancho[] = [
  { tipo: "erro-comum", padrao: "O erro que [público] comete e nem percebe", exemplo: "O erro que faz sua empresa pagar mais imposto sem você notar." },
  { tipo: "contraste", padrao: "Não é [X]. É [Y].", exemplo: "Seu contador não entrega guias. Ou entrega só isso?" },
  { tipo: "custo-oculto", padrao: "Quanto [dor invisível] está custando", exemplo: "Quanto a desorganização fiscal já tirou do seu lucro este ano?" },
  { tipo: "pergunta-provocativa", padrao: "Você [faz X] ou só [faz Y]?", exemplo: "Sua empresa usa a contabilidade pra crescer ou só pra cumprir obrigação?" },
  { tipo: "numero", padrao: "[N] [erros/sinais/formas] de [resultado]", exemplo: "3 erros que fazem empresas pagarem mais imposto do que deveriam." },
  { tipo: "mito", padrao: "Mito: [crença comum]. Verdade: [reframe]", exemplo: "Pagar mais imposto não significa que faturou mais." },
  { tipo: "antes-depois", padrao: "De [estado ruim] para [estado desejado]", exemplo: "De empresa no escuro para decisões com base em números." },
  { tipo: "verdade-inconveniente", padrao: "Ninguém te conta que [verdade dura]", exemplo: "Ninguém te conta que o barato na contabilidade sai caro em multa." },
];

// ── CTAs por objetivo (a ação que a peça pede) ───────────────────────────────

export const CTAS: Record<string, string[]> = {
  salvar: ["Salve pra não esquecer", "Salve este post pra consultar depois"],
  compartilhar: ["Envie pra aquele [público] que precisa ver isso", "Marca alguém que vive isso"],
  comentar: ["Comenta [palavra] que eu te explico", "Qual desses você já viveu? Conta aqui"],
  direct: ["Chama no direct que a gente te mostra como", "Manda um 'quero' no direct"],
  agendar: ["Agende uma conversa sem compromisso", "Fale com um especialista hoje"],
  posicionamento: ["Sua empresa faz [X] ou só [Y]?", "Como você enxerga isso no seu negócio?"],
};

// ── Checklists (portões de qualidade — usados pela revisão crítica) ──────────

export const CHECKLISTS: Record<string, string[]> = {
  carrossel: [
    "Slide 1 segura o scroll sozinho?", "Cada slide avança o raciocínio (sem encher)?",
    "Tem virada/insight antes do CTA?", "Layout varia entre slides (não é tudo igual)?", "Último slide tem CTA claro?",
  ],
  reel: [
    "Os 3 primeiros segundos prendem?", "Entrega o que o gancho promete?",
    "Legível sem áudio?", "Tem pico de impacto?", "CTA no fim?",
  ],
  legenda: [
    "1ª linha é gancho (não saudação genérica)?", "Fala da dor/desejo (não do institucional)?",
    "Tem CTA?", "Fecha com o contato do cliente?", "Sem clichê/promessa vazia?",
  ],
  calendario: [
    "As 3 peças formam funil (percepção → educação → posicionamento/venda)?",
    "O mix de pilares bate com a meta (≈60/25/15)?", "Nenhuma peça repete ângulo/pilar?",
    "Cada peça tem objetivo e 'por que agora'?", "Alguma quebra o padrão visual do feed?",
  ],
};

/** Injeção compacta: o checklist de um tipo como bloco de prompt. */
export function checklistDe(tipo: string): string {
  const c = CHECKLISTS[tipo];
  if (!c) return "";
  return `# CHECKLIST (${tipo}) — se algum "não", refaça\n${c.map((x) => `✓ ${x}`).join("\n")}`;
}
