// lib/cs/datas.ts — calendário de DATAS COMEMORATIVAS pro social media (radar proativo da Lone).
// Curadoria fixa (sem API externa): datas gerais do varejo BR + datas de nicho (construção, auto,
// saúde, pet, food, beleza…), + datas MÓVEIS calculadas (Páscoa/Carnaval/Mães/Pais/Black Friday).
// Determinístico e puro (testável). Quem usa: cron cs-datas (radar semanal), bom-dia (lembrete),
// snapshot (contexto da conversa) e o comando "Lone, que datas vêm aí?".

export interface DataComemorativa {
  nome: string;
  mes: number;              // 1-12
  dia: number;              // 1-31
  tags: string[];           // nichos que a data encaixa; "geral" = serve pra todo mundo
  peso: 1 | 2 | 3;          // 3 = data GRANDE (planejar com antecedência) · 2 = boa · 1 = leve
  obs?: string;             // dica de abordagem pro post
}

export interface DataResolvida extends Omit<DataComemorativa, "mes" | "dia"> {
  data: Date;               // dia concreto naquele ano
}

// ── Datas fixas (mês/dia) ─────────────────────────────────────────────────────
// Curadoria conservadora: só datas consolidadas no varejo/agências BR.
export const DATAS_FIXAS: DataComemorativa[] = [
  { nome: "Ano Novo", mes: 1, dia: 1, tags: ["geral"], peso: 2, obs: "retrospectiva/metas do ano" },
  { nome: "Volta às aulas (temporada)", mes: 1, dia: 15, tags: ["varejo", "educacao", "tech"], peso: 1, obs: "material, mochila, eletrônico, curso" },
  { nome: "Dia do Farmacêutico", mes: 1, dia: 20, tags: ["farmacia", "saude"], peso: 2, obs: "homenagem à equipe + autoridade" },
  { nome: "Dia Internacional da Mulher", mes: 3, dia: 8, tags: ["geral"], peso: 3, obs: "homenagem SEM clichê; cuidado com tom" },
  { nome: "Dia do Consumidor", mes: 3, dia: 15, tags: ["varejo", "geral"], peso: 3, obs: "a 'Black Friday do 1º semestre' — oferta" },
  { nome: "Dia Mundial da Saúde", mes: 4, dia: 7, tags: ["saude", "farmacia"], peso: 2, obs: "conteúdo educativo/prevenção" },
  { nome: "Tiradentes (feriado)", mes: 4, dia: 21, tags: ["geral"], peso: 1, obs: "aviso de horário/feriado" },
  { nome: "Dia do Trabalhador (feriado)", mes: 5, dia: 1, tags: ["geral"], peso: 2, obs: "homenagem a quem faz acontecer" },
  { nome: "Dia do Hambúrguer", mes: 5, dia: 28, tags: ["food"], peso: 2, obs: "promo do dia — forte pra hamburgueria/lanchonete" },
  { nome: "Dia do Meio Ambiente", mes: 6, dia: 5, tags: ["energia", "construcao", "geral"], peso: 2, obs: "forte pra solar/sustentável" },
  { nome: "Dia dos Namorados", mes: 6, dia: 12, tags: ["geral", "varejo", "food", "beleza"], peso: 3, obs: "presente/experiência a dois — planejar antes" },
  { nome: "São João / Festa Junina", mes: 6, dia: 24, tags: ["geral", "food", "varejo"], peso: 2, obs: "clima junino, promoção temática" },
  { nome: "Dia da Pizza", mes: 7, dia: 10, tags: ["food"], peso: 2, obs: "promo do dia" },
  { nome: "Dia Mundial do Rock", mes: 7, dia: 13, tags: ["geral", "food"], peso: 1, obs: "conteúdo leve/trilha — se combinar com a marca" },
  { nome: "Dia do Comerciante", mes: 7, dia: 16, tags: ["varejo"], peso: 1, obs: "história da loja/bastidor" },
  { nome: "Dia do Amigo", mes: 7, dia: 20, tags: ["geral", "food", "varejo"], peso: 1, obs: "engajamento: marque um amigo / promo em dupla" },
  { nome: "Dia do Motorista (São Cristóvão)", mes: 7, dia: 25, tags: ["auto"], peso: 2, obs: "homenagem + revisão/cuidado" },
  { nome: "Dia dos Avós", mes: 7, dia: 26, tags: ["geral", "varejo", "farmacia", "saude"], peso: 2, obs: "homenagem afetiva + presente de família" },
  { nome: "Dia do Advogado", mes: 8, dia: 11, tags: ["juridico"], peso: 2 },
  { nome: "Independência do Brasil (feriado)", mes: 9, dia: 7, tags: ["geral"], peso: 1, obs: "aviso de horário/feriado" },
  { nome: "Setembro Amarelo (campanha do mês)", mes: 9, dia: 1, tags: ["saude", "geral"], peso: 2, obs: "saúde mental — tom responsável, sem oportunismo" },
  { nome: "Dia do Cliente", mes: 9, dia: 15, tags: ["varejo", "geral"], peso: 3, obs: "agradecer + mimo/cupom — data forte de venda" },
  { nome: "Dia da Árvore", mes: 9, dia: 21, tags: ["construcao", "energia", "geral"], peso: 1, obs: "boa pra madeireira/solar (manejo, sustentabilidade)" },
  { nome: "Dia do Contador", mes: 9, dia: 22, tags: ["contabil"], peso: 2 }, // VERIFICAR data (há tb Contabilista 25/04)
  { nome: "Outubro Rosa (campanha do mês)", mes: 10, dia: 1, tags: ["saude", "farmacia", "beleza", "geral"], peso: 2, obs: "prevenção — tom responsável" },
  { nome: "Dia do Vendedor", mes: 10, dia: 1, tags: ["varejo"], peso: 1, obs: "homenagem à equipe de vendas" },
  { nome: "Dia dos Animais", mes: 10, dia: 4, tags: ["pet"], peso: 2 },
  { nome: "Dia das Crianças", mes: 10, dia: 12, tags: ["geral", "varejo"], peso: 3, obs: "presente/família — planejar antes" },
  { nome: "Dia do Professor", mes: 10, dia: 15, tags: ["educacao", "geral"], peso: 2 },
  { nome: "Dia do Médico", mes: 10, dia: 18, tags: ["saude"], peso: 2 },
  { nome: "Dia do Dentista", mes: 10, dia: 25, tags: ["saude"], peso: 2 },
  { nome: "Halloween", mes: 10, dia: 31, tags: ["geral", "food", "varejo"], peso: 1, obs: "leve/divertido, se combinar com a marca" },
  { nome: "Novembro Azul (campanha do mês)", mes: 11, dia: 1, tags: ["saude", "farmacia", "geral"], peso: 2, obs: "prevenção — tom responsável" },
  { nome: "Dia da Consciência Negra", mes: 11, dia: 20, tags: ["geral"], peso: 2, obs: "respeito — não usar pra venda" },
  { nome: "Véspera de Natal", mes: 12, dia: 24, tags: ["geral"], peso: 2, obs: "última chamada + horário especial" },
  { nome: "Natal", mes: 12, dia: 25, tags: ["geral"], peso: 3, obs: "campanha do mês inteiro — planejar MUITO antes" },
];

// ── Datas móveis ──────────────────────────────────────────────────────────────

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);       // 3 = março, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

/** N-ésimo domingo de um mês (ex.: 2º domingo de maio = Dia das Mães). */
export function nesimoDomingo(ano: number, mes1a12: number, n: number): Date {
  const primeiro = new Date(ano, mes1a12 - 1, 1);
  const offset = (7 - primeiro.getDay()) % 7;               // dias até o 1º domingo
  return new Date(ano, mes1a12 - 1, 1 + offset + (n - 1) * 7);
}

/** Black Friday = sexta após a 4ª quinta-feira de novembro. */
export function blackFriday(ano: number): Date {
  const primeiro = new Date(ano, 10, 1);
  const offsetQuinta = (4 - primeiro.getDay() + 7) % 7;     // dias até a 1ª quinta (getDay 4)
  const quartaQuinta = 1 + offsetQuinta + 21;
  return new Date(ano, 10, quartaQuinta + 1);
}

const addDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function datasMoveis(ano: number): DataResolvida[] {
  const p = pascoa(ano);
  const bf = blackFriday(ano);
  return [
    { nome: "Carnaval (terça)", data: addDias(p, -47), tags: ["geral"], peso: 2, obs: "clima de festa + aviso de horário" },
    { nome: "Sexta-feira Santa (feriado)", data: addDias(p, -2), tags: ["geral"], peso: 1, obs: "aviso de horário" },
    { nome: "Páscoa", data: p, tags: ["geral", "food", "varejo"], peso: 2, obs: "família/celebração" },
    { nome: "Corpus Christi (feriado)", data: addDias(p, 60), tags: ["geral"], peso: 1, obs: "aviso de horário/feriadão" },
    { nome: "Dia das Mães", data: nesimoDomingo(ano, 5, 2), tags: ["geral", "varejo"], peso: 3, obs: "2ª maior data do varejo — planejar MUITO antes" },
    { nome: "Dia dos Pais", data: nesimoDomingo(ano, 8, 2), tags: ["geral", "varejo"], peso: 3, obs: "planejar com antecedência" },
    { nome: "Black Friday", data: bf, tags: ["geral", "varejo"], peso: 3, obs: "maior data do varejo — esquenta semanas antes" },
    { nome: "Cyber Monday", data: addDias(bf, 3), tags: ["varejo", "tech"], peso: 1, obs: "extensão da BF pro online" },
  ];
}

/** Todas as datas de um ano (fixas + móveis), ordenadas. */
export function datasDoAno(ano: number): DataResolvida[] {
  const fixas: DataResolvida[] = DATAS_FIXAS.map(({ mes, dia, ...resto }) => ({ ...resto, data: new Date(ano, mes - 1, dia) }));
  return [...fixas, ...datasMoveis(ano)].sort((a, b) => a.data.getTime() - b.data.getTime());
}

// ── Janela / próximas ────────────────────────────────────────────────────────

const soData = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Datas que caem em [de + deDias, de + ateDias] (inclusivo). Cruza a virada do ano. */
export function datasNaJanela(de: Date, deDias: number, ateDias: number): DataResolvida[] {
  const ini = addDias(soData(de), deDias).getTime();
  const fim = addDias(soData(de), ateDias).getTime();
  return [...datasDoAno(de.getFullYear()), ...datasDoAno(de.getFullYear() + 1)]
    .filter((d) => { const t = soData(d.data).getTime(); return t >= ini && t <= fim; })
    .sort((a, b) => a.data.getTime() - b.data.getTime() || b.peso - a.peso);
}

/** Próximas datas a partir de hoje (inclui hoje), pros próximos N dias. */
export const proximasDatas = (hoje: Date, dias: number) => datasNaJanela(hoje, 0, dias);

// ── Matching por nicho ───────────────────────────────────────────────────────
// O nicho do cliente é texto livre ("Materiais de construção", "Energia solar") → derivamos tags
// por palavra-chave. Conservador: não achou tag → só datas "geral".

const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const KEYWORDS: Record<string, string[]> = {
  construcao: ["constru", "madeir", "material", "acabament", "tinta", "piso", "telha", "vidr", "marmor", "serralh", "ferrag", "eletric", "hidraul", "cimento", "gesso", "esquadria"],
  moveis: ["movel", "moveis", "mobili", "sofa", "colch", "decor", "planejad", "estofad"],
  auto: ["carro", "auto", "pneu", "mecanic", "moto", "veic", "oficina", "funilar", "lava-", "lava r", "concession"],
  saude: ["saude", "clinic", "medic", "dentist", "odont", "fisio", "psico", "veterin", "otica", "farmac", "manipul", "laborat", "hospital", "estetic"],
  farmacia: ["farmac", "manipul", "drogar"],
  pet: ["pet", "veterin", "racao", "banho e tosa", "agropec"],
  food: ["restaurant", "pizz", "lanch", "hamburg", "acai", "doce", "confeit", "padar", "mercad", "hortifrut", "churrasc", "sorvet", "cafe", "burger", "bar e", "gastro"],
  beleza: ["beleza", "salao", "cabel", "estetic", "barb", "manicure", "spa", "depil", "sobrancelh"],
  educacao: ["escola", "curso", "faculdade", "educa", "ensino", "idioma", "crech"],
  varejo: ["loja", "comercio", "magazin", "bazar", "boutique", "calcad", "moda", "vestu", "celular", "cell", "eletro", "utilidad", "presente", "papelar", "otica", "joalher", "perfum"],
  contabil: ["contab", "contad"],
  juridico: ["advoc", "advog", "juridic"],
  energia: ["solar", "energia", "fotovolt"],
  imobiliario: ["imobili", "imove", "corretor"],
  tech: ["informat", "tecnolog", "software", "assistencia tec"],
};

/** Deriva as tags de nicho de um cliente a partir do texto livre do nicho/industry. */
export function tagsDoNicho(nicho?: string | null): string[] {
  const n = norm(nicho || "");
  if (!n) return [];
  return Object.entries(KEYWORDS).filter(([, kws]) => kws.some((k) => n.includes(k))).map(([tag]) => tag);
}

/** A data encaixa pro cliente? "geral" serve pra todos; senão precisa cruzar tag de nicho. */
export function dataEncaixa(data: DataResolvida, nichoTags: string[]): boolean {
  return data.tags.includes("geral") || data.tags.some((t) => nichoTags.includes(t));
}

// ── Formatação ───────────────────────────────────────────────────────────────

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function formatDataCurta(d: DataResolvida): string {
  const dt = d.data;
  return `*${d.nome}* — ${DIAS_SEMANA[dt.getDay()]} ${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

/** Linha do bom-dia quando tem data HOJE/AMANHÃ ("" se não tem). Só peso >= 2 (não alarma feriadinho). */
export function linhaDataBomDia(hoje: Date): string {
  const rel = proximasDatas(hoje, 1).filter((d) => d.peso >= 2);
  if (!rel.length) return "";
  const d = rel[0];
  const ehHoje = soData(d.data).getTime() === soData(hoje).getTime();
  return `📅 ${ehHoje ? "HOJE é" : "Amanhã é"} ${formatDataCurta(d)} — bom ter post no ar!`;
}
