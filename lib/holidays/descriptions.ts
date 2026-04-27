/**
 * Descrições humanizadas das datas, usadas no PDF que vai pros clientes.
 *
 * A chave é o nome exato da data (como aparece em static-fallback.ts ou
 * commemorative-dates.ts). Pra datas sem entrada aqui, usamos fallback
 * gerado pela categoria.
 */

const DESCRIPTIONS: Record<string, string> = {
  // ─── Feriados nacionais ──────────────────────────────────────
  "Confraternização Universal": "Início do ano novo. Feriado nacional em todo o Brasil — ponto facultativo em órgãos públicos e fechamento generalizado do comércio.",
  "Tiradentes": "Homenagem a Joaquim José da Silva Xavier, mártir da Inconfidência Mineira. Feriado nacional.",
  "Dia do Trabalho": "Celebração mundial da luta dos trabalhadores por melhores condições de trabalho. Feriado nacional em todo o território brasileiro.",
  "Independência do Brasil": "Aniversário da proclamação da independência em 1822. Feriado nacional com desfiles cívicos em todo o país.",
  "Nossa Senhora Aparecida": "Padroeira do Brasil. Feriado nacional religioso celebrado em 12 de outubro.",
  "Finados": "Dia de homenagem aos mortos. Feriado nacional — cemitérios recebem grande movimento.",
  "Proclamação da República": "Aniversário da proclamação da República em 1889. Feriado nacional.",
  "Consciência Negra": "Dia em memória de Zumbi dos Palmares. Feriado nacional desde 2024 — momento de reflexão sobre a história e cultura afro-brasileira.",
  "Natal": "Celebração cristã do nascimento de Jesus. Feriado nacional, com forte tradição familiar e cultural no Brasil.",
  "Sexta-feira Santa": "Sexta-feira que antecede a Páscoa. Feriado nacional religioso.",
  "Carnaval (segunda)": "Segunda-feira de Carnaval. Ponto facultativo nacional, mas tratado como feriado em quase todo o país.",
  "Carnaval (terça)": "Terça-feira de Carnaval. Ponto facultativo nacional, mas tratado como feriado em quase todo o país.",
  "Corpus Christi": "Quinta-feira após o Domingo da Trindade. Ponto facultativo nacional com forte tradição religiosa.",

  // ─── Awareness Months ────────────────────────────────────────
  "Janeiro Branco — Saúde Mental": "Mês de conscientização sobre saúde mental. Movimento que estimula o cuidado emocional e o combate ao estigma sobre transtornos psicológicos.",
  "Maio Amarelo — Segurança no Trânsito": "Mês mundial de conscientização sobre segurança no trânsito. Foco em prevenção de acidentes e direção responsável.",
  "Agosto Lilás — Combate à Violência contra a Mulher": "Mês de conscientização sobre a Lei Maria da Penha e o enfrentamento à violência doméstica.",
  "Setembro Amarelo — Prevenção ao Suicídio": "Movimento internacional de prevenção ao suicídio. Dia 10 de setembro é o Dia Mundial.",
  "Outubro Rosa — Prevenção do Câncer de Mama": "Mês mundial de conscientização sobre o câncer de mama. Foco em diagnóstico precoce e prevenção.",
  "Novembro Azul — Saúde do Homem": "Mês de conscientização sobre câncer de próstata e saúde masculina em geral. Estimula exames preventivos.",
  "Dezembro Vermelho — Combate ao HIV/AIDS": "Mês de conscientização sobre HIV/AIDS. Dia 1 de dezembro é o Dia Mundial.",

  // ─── Comerciais grandes ──────────────────────────────────────
  "Dia da Mulher": "8 de março. Data internacional de luta pela igualdade de gênero — uma das maiores datas comerciais do calendário.",
  "Dia das Mães": "Segundo domingo de maio. Uma das datas mais importantes do calendário brasileiro — não é feriado oficial, mas é amplamente comemorada em todo o país.",
  "Dia dos Namorados": "12 de junho. Data brasileira de celebração do amor — uma das maiores em volume de vendas do varejo.",
  "Dia dos Pais": "Segundo domingo de agosto. Importante data comercial, especialmente pra varejo de eletrônicos, moda masculina e alimentação.",
  "Dia do Cliente": "15 de setembro. Data criada no Brasil pra que empresas reconheçam e bonifiquem seus clientes.",
  "Dia do Amigo": "20 de julho. Celebração da amizade — boa data pra ações de relacionamento e compartilhamento.",
  "Dia dos Avós": "26 de julho. Data de homenagem aos avós — relevante pra famílias e segmentos de saúde, presente, alimentação.",
  "Dia da Família": "8 de dezembro. Celebração da família como núcleo social — bom timing pré-Natal.",
  "Dia do Beijo": "13 de abril. Data leve e descontraída — boa pra conteúdo de relacionamento, beleza e estilo de vida.",
  "Black Friday": "Quarta sexta-feira de novembro. Maior data do varejo no Brasil — origem americana, hoje plenamente integrada ao calendário comercial brasileiro.",
  "Cyber Monday": "Segunda-feira após a Black Friday. Foco em ofertas online — relevante pra e-commerce e produtos digitais.",

  // ─── Culturais ───────────────────────────────────────────────
  "São João": "24 de junho. Auge do ciclo junino — uma das festas mais tradicionais e regionais do Brasil, principalmente no Nordeste.",
  "Halloween / Dia das Bruxas": "31 de outubro. Data de origem celta, hoje muito comemorada em mídias sociais — gera grande engajamento criativo.",
  "Dia da Bandeira": "19 de novembro. Data cívica — moderado apelo comercial mas relevante pra conteúdo educativo e de cidadania.",
  "Dia da Árvore": "21 de setembro. Data ambiental — relevante pra marcas com pegada de sustentabilidade.",
  "Réveillon": "31 de dezembro. Virada de ano — momento de retrospectivas, balanços e propostas pro próximo ciclo.",

  // ─── Profissões — alguns exemplos curados ────────────────────
  "Dia do Dentista": "3 de outubro. Homenagem aos profissionais da Odontologia. Boa data pra clínicas postarem agradecimentos, casos clínicos e bastidores.",
  "Dia do Médico": "18 de outubro. Homenagem aos médicos. Dia importante pra clínicas e hospitais reforçarem confiança e relação com pacientes.",
  "Dia do Advogado": "11 de agosto. Data celebrada pela OAB e pelos profissionais do Direito.",
  "Dia do Vendedor": "1 de outubro. Reconhecimento à classe que move o comércio brasileiro.",
  "Dia do Marketing": "19 de maio. Celebração dos profissionais de comunicação e marketing.",
  "Dia do Designer Gráfico": "27 de abril. Homenagem aos profissionais do design — momento ideal pra mostrar processo criativo.",
  "Dia do Veterinário": "9 de setembro. Profissionais que cuidam da saúde animal — data forte pra pet shops e clínicas veterinárias.",
  "Dia do Personal Trainer": "19 de agosto. Reconhecimento aos professores de Educação Física que atendem alunos individualmente.",
  "Dia do Pet / Animal": "4 de outubro. Dia mundial dos animais. Excelente pra conteúdo emocional em marcas pet.",
  "Dia do Empreendedor / Empresário": "5 de outubro. Reconhecimento a quem cria negócios e gera empregos.",
  "Dia do Professor": "15 de outubro. Homenagem aos educadores. Boa data pra escolas e cursos engajarem alunos e ex-alunos.",
};

/**
 * Retorna a descrição da data, ou um fallback baseado em categoria/nicho.
 */
export function getDescriptionFor(name: string, category: string, nichos?: string[]): string {
  const exact = DESCRIPTIONS[name];
  if (exact) return exact;

  // Fallback genérico baseado em categoria
  if (category === "national") {
    return "Feriado nacional brasileiro. Ponto facultativo em órgãos públicos e fechamento generalizado do comércio.";
  }
  if (category === "awareness_month") {
    return "Mês de conscientização. Movimento que mobiliza marcas, profissionais e público em torno da causa.";
  }
  if (category === "comercial") {
    return "Data comercial relevante no calendário brasileiro — boa oportunidade pra ações de marketing e conteúdo.";
  }
  if (category === "cultural") {
    return "Data cultural celebrada no Brasil — relevante pra conteúdo de relacionamento e branding.";
  }
  if (category === "profissao") {
    if (nichos && nichos.length > 0) {
      return `Homenagem aos profissionais de ${nichos.join(" / ")}. Boa oportunidade pra agradecimentos e conteúdo de bastidores.`;
    }
    return "Dia profissional. Boa oportunidade pra reconhecimento da classe e conteúdo de bastidores.";
  }
  return "Data comemorativa.";
}
