/**
 * Datas comemorativas relevantes pra agência de marketing.
 *
 * Diferente de `static-fallback.ts` (que tem feriados nacionais oficiais),
 * este arquivo tem datas comerciais, culturais, awareness months e dias
 * de profissões — pra alimentar planejamento de conteúdo dos clientes.
 *
 * Fonte: lista curada manualmente. Atualizar quando novas datas relevantes
 * surgirem ou quando os nichos atendidos pela agência mudarem.
 */

export type CommemorativeCategory =
  | "comercial"        // Mães, Pais, Namorados, Black Friday, Cliente
  | "cultural"         // São João, Halloween, Réveillon, Bandeira
  | "awareness_month"  // Outubro Rosa, Novembro Azul (mês inteiro)
  | "profissao";       // Dia do Dentista, Vendedor, Médico etc.

export interface CommemorativeDate {
  date: string;                    // YYYY-MM-DD computed para o ano
  name: string;
  category: CommemorativeCategory;
  nichos?: string[];               // nichos relacionados (do onboarding)
  monthLong?: boolean;             // true pras awareness months — render como banner do mês
}

// Datas FIXAS (mesmo dia/mês todo ano)
const FIXED: ReadonlyArray<{ mmdd: string; name: string; category: CommemorativeCategory; nichos?: string[]; monthLong?: boolean }> = [
  // ─── COMERCIAIS ────────────────────────────────────────────
  { mmdd: "03-08", name: "Dia da Mulher", category: "comercial" },
  { mmdd: "04-13", name: "Dia do Beijo", category: "comercial" },
  { mmdd: "06-12", name: "Dia dos Namorados", category: "comercial" },
  { mmdd: "06-24", name: "São João", category: "cultural" },
  { mmdd: "07-20", name: "Dia do Amigo", category: "comercial" },
  { mmdd: "07-26", name: "Dia dos Avós", category: "comercial" },
  { mmdd: "09-15", name: "Dia do Cliente", category: "comercial" },
  { mmdd: "09-21", name: "Dia da Árvore", category: "cultural" },
  { mmdd: "10-31", name: "Halloween / Dia das Bruxas", category: "cultural" },
  { mmdd: "11-19", name: "Dia da Bandeira", category: "cultural" },
  { mmdd: "12-08", name: "Dia da Família", category: "comercial" },
  { mmdd: "12-31", name: "Réveillon", category: "cultural" },

  // ─── AWARENESS MONTHS (mês inteiro) ────────────────────────
  { mmdd: "01-01", name: "Janeiro Branco — Saúde Mental", category: "awareness_month", monthLong: true },
  { mmdd: "05-01", name: "Maio Amarelo — Segurança no Trânsito", category: "awareness_month", monthLong: true },
  { mmdd: "08-01", name: "Agosto Lilás — Combate à Violência contra a Mulher", category: "awareness_month", monthLong: true },
  { mmdd: "09-01", name: "Setembro Amarelo — Prevenção ao Suicídio", category: "awareness_month", monthLong: true },
  { mmdd: "10-01", name: "Outubro Rosa — Prevenção do Câncer de Mama", category: "awareness_month", monthLong: true },
  { mmdd: "11-01", name: "Novembro Azul — Saúde do Homem", category: "awareness_month", monthLong: true },
  { mmdd: "12-01", name: "Dezembro Vermelho — Combate ao HIV/AIDS", category: "awareness_month", monthLong: true },

  // ─── PROFISSÕES — Mídia / Marketing ─────────────────────────
  { mmdd: "01-08", name: "Dia do Fotógrafo", category: "profissao" },
  { mmdd: "02-01", name: "Dia do Publicitário", category: "profissao" },
  { mmdd: "04-07", name: "Dia do Jornalista", category: "profissao" },
  { mmdd: "04-27", name: "Dia do Designer Gráfico", category: "profissao" },
  { mmdd: "05-18", name: "Dia do Web Designer", category: "profissao" },
  { mmdd: "05-19", name: "Dia do Marketing", category: "profissao" },
  { mmdd: "09-19", name: "Dia do Programador", category: "profissao" },
  { mmdd: "10-30", name: "Dia do Designer", category: "profissao" },

  // ─── PROFISSÕES — Negócios / Vendas ─────────────────────────
  { mmdd: "07-16", name: "Dia do Comerciante", category: "profissao" },
  { mmdd: "10-01", name: "Dia do Vendedor", category: "profissao" },
  { mmdd: "10-05", name: "Dia do Empreendedor / Empresário", category: "profissao" },

  // ─── NICHO: Odontologia ─────────────────────────────────────
  { mmdd: "10-03", name: "Dia do Dentista", category: "profissao", nichos: ["Odontologia"] },

  // ─── NICHO: Saúde / Clínicas ────────────────────────────────
  { mmdd: "01-20", name: "Dia do Farmacêutico", category: "profissao", nichos: ["Saúde / Clínicas"] },
  { mmdd: "04-07", name: "Dia Mundial da Saúde", category: "profissao", nichos: ["Saúde / Clínicas"] },
  { mmdd: "05-12", name: "Dia do Enfermeiro", category: "profissao", nichos: ["Saúde / Clínicas"] },
  { mmdd: "08-14", name: "Dia do Cardiologista", category: "profissao", nichos: ["Saúde / Clínicas"] },
  { mmdd: "08-27", name: "Dia do Psicólogo", category: "profissao", nichos: ["Saúde / Clínicas"] },
  { mmdd: "08-31", name: "Dia do Nutricionista", category: "profissao", nichos: ["Saúde / Clínicas", "Fitness / Academia"] },
  { mmdd: "10-13", name: "Dia do Fisioterapeuta", category: "profissao", nichos: ["Saúde / Clínicas"] },
  { mmdd: "10-18", name: "Dia do Médico", category: "profissao", nichos: ["Saúde / Clínicas"] },

  // ─── NICHO: Advocacia ───────────────────────────────────────
  { mmdd: "08-11", name: "Dia do Advogado", category: "profissao", nichos: ["Advocacia"] },

  // ─── NICHO: Imobiliária ─────────────────────────────────────
  { mmdd: "08-27", name: "Dia do Corretor de Imóveis", category: "profissao", nichos: ["Imobiliária"] },

  // ─── NICHO: Construção Civil ────────────────────────────────
  { mmdd: "05-24", name: "Dia do Construtor", category: "profissao", nichos: ["Construção Civil"] },
  { mmdd: "07-25", name: "Dia do Pedreiro", category: "profissao", nichos: ["Construção Civil"] },

  // ─── NICHO: Arquitetura e Engenharia ────────────────────────
  { mmdd: "12-11", name: "Dia do Engenheiro", category: "profissao", nichos: ["Arquitetura e Engenharia"] },
  { mmdd: "12-15", name: "Dia do Arquiteto", category: "profissao", nichos: ["Arquitetura e Engenharia"] },

  // ─── NICHO: Estética e Beleza ───────────────────────────────
  { mmdd: "07-17", name: "Dia do Tatuador", category: "profissao", nichos: ["Estética e Beleza"] },
  { mmdd: "07-25", name: "Dia da Manicure", category: "profissao", nichos: ["Estética e Beleza"] },
  { mmdd: "07-28", name: "Dia do Maquiador", category: "profissao", nichos: ["Estética e Beleza"] },
  { mmdd: "09-08", name: "Dia do Cabeleireiro", category: "profissao", nichos: ["Estética e Beleza"] },
  { mmdd: "09-26", name: "Dia da Beleza", category: "profissao", nichos: ["Estética e Beleza"] },

  // ─── NICHO: Restaurante / Food ──────────────────────────────
  { mmdd: "04-14", name: "Dia do Café", category: "profissao", nichos: ["Restaurante / Food"] },
  { mmdd: "05-28", name: "Dia do Hambúrguer", category: "profissao", nichos: ["Restaurante / Food"] },
  { mmdd: "07-05", name: "Dia do Confeiteiro", category: "profissao", nichos: ["Restaurante / Food"] },
  { mmdd: "07-08", name: "Dia do Padeiro", category: "profissao", nichos: ["Restaurante / Food"] },
  { mmdd: "07-10", name: "Dia da Pizza", category: "profissao", nichos: ["Restaurante / Food"] },
  { mmdd: "08-11", name: "Dia do Garçom", category: "profissao", nichos: ["Restaurante / Food"] },
  { mmdd: "08-17", name: "Dia do Cozinheiro", category: "profissao", nichos: ["Restaurante / Food"] },
  { mmdd: "09-23", name: "Dia do Sorvete", category: "profissao", nichos: ["Restaurante / Food"] },

  // ─── NICHO: Pet Shop ────────────────────────────────────────
  { mmdd: "02-17", name: "Dia do Gato", category: "profissao", nichos: ["Pet Shop"] },
  { mmdd: "08-26", name: "Dia do Cachorro", category: "profissao", nichos: ["Pet Shop"] },
  { mmdd: "09-09", name: "Dia do Veterinário", category: "profissao", nichos: ["Pet Shop"] },
  { mmdd: "10-04", name: "Dia do Pet / Animal", category: "profissao", nichos: ["Pet Shop"] },

  // ─── NICHO: Fitness / Academia ──────────────────────────────
  { mmdd: "08-19", name: "Dia do Personal Trainer", category: "profissao", nichos: ["Fitness / Academia"] },
  { mmdd: "09-01", name: "Dia do Educador Físico", category: "profissao", nichos: ["Fitness / Academia"] },

  // ─── NICHO: Educação / Cursos ───────────────────────────────
  { mmdd: "08-11", name: "Dia do Estudante", category: "profissao", nichos: ["Educação / Cursos"] },
  { mmdd: "10-15", name: "Dia do Professor", category: "profissao", nichos: ["Educação / Cursos"] },

  // ─── NICHO: Automotivo ──────────────────────────────────────
  { mmdd: "07-25", name: "Dia do Motorista", category: "profissao", nichos: ["Automotivo"] },
  { mmdd: "07-27", name: "Dia do Motoboy", category: "profissao", nichos: ["Automotivo"] },
  { mmdd: "11-23", name: "Dia do Mecânico", category: "profissao", nichos: ["Automotivo"] },
];

/**
 * Calcula o N-ésimo dia-da-semana de um mês.
 *   year, monthIdx0 (0=jan), weekday (0=domingo), n (1=primeiro, 2=segundo, -1=último)
 * Retorna YYYY-MM-DD em UTC.
 */
function nthWeekday(year: number, monthIdx0: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = new Date(Date.UTC(year, monthIdx0, 1));
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    const day = 1 + offset + (n - 1) * 7;
    return `${year}-${String(monthIdx0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  // n<0: contar do fim
  const lastDay = new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate();
  const lastWeekday = new Date(Date.UTC(year, monthIdx0, lastDay)).getUTCDay();
  const offset = (lastWeekday - weekday + 7) % 7;
  const day = lastDay - offset;
  return `${year}-${String(monthIdx0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Datas variáveis (calculadas por ano).
 *   - Mães: 2º domingo de maio
 *   - Pais: 2º domingo de agosto
 *   - Black Friday: 4ª sexta-feira de novembro (dia seguinte ao Thanksgiving americano)
 *   - Cyber Monday: 3 dias após Black Friday
 */
function getVariableForYear(year: number): CommemorativeDate[] {
  const blackFriday = nthWeekday(year, 10, 5, 4); // novembro=10
  const bf = new Date(blackFriday + "T12:00:00Z");
  bf.setUTCDate(bf.getUTCDate() + 3);
  const cyberMonday = bf.toISOString().slice(0, 10);
  return [
    { date: nthWeekday(year, 4, 0, 2), name: "Dia das Mães", category: "comercial" },
    { date: nthWeekday(year, 7, 0, 2), name: "Dia dos Pais", category: "comercial" },
    { date: blackFriday, name: "Black Friday", category: "comercial" },
    { date: cyberMonday, name: "Cyber Monday", category: "comercial" },
  ];
}

/**
 * Retorna todas as datas comemorativas do ano (fixas + variáveis), ordenadas por data.
 */
export function getCommemorativeDates(year: number): CommemorativeDate[] {
  const fixed: CommemorativeDate[] = FIXED.map((f) => ({
    date: `${year}-${f.mmdd}`,
    name: f.name,
    category: f.category,
    nichos: f.nichos,
    monthLong: f.monthLong,
  }));
  return [...fixed, ...getVariableForYear(year)].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Filtra datas relevantes pra um conjunto de nichos.
 * Inclui sempre comerciais/culturais/awareness (não têm nicho).
 * Pra profissões, inclui só as que tocam um dos nichos do cliente.
 */
export function filterByNichos(dates: CommemorativeDate[], nichos: string[]): CommemorativeDate[] {
  if (nichos.length === 0) return dates;
  return dates.filter((d) => {
    if (d.category !== "profissao") return true;
    if (!d.nichos || d.nichos.length === 0) return true; // profissão genérica (Vendedor, Marketing) — sempre inclui
    return d.nichos.some((n) => nichos.includes(n));
  });
}
