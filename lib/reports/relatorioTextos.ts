// lib/reports/relatorioTextos.ts — o que o DONO DO NEGÓCIO lê no relatório, sem jargão de gerenciador.
//
// Roberto (02/10/2026), olhando o PDF de setembro da Madeireira D'Aldeia: "está bom de informações
// mas está bem bagunçado". Parte da bagunça era texto de dentro do Gerenciador indo direto pro
// cliente: "ADS - VIDEO - SE VOCE É DE SÃO PEDRO", "CJ 01 - Whatsapp - regiao dos lagos - aberto -
// Vídeos", "Campanha Engajamento - Mensagem - F - captação". O nome que o gestor dá serve pra ELE
// achar a campanha; pro cliente, o que importa é sobre o que é o anúncio.
//
// Puro e testado: o PDF só chama.

/** Formato do anúncio, quando o nome diz. Vira uma etiqueta pequena ao lado do nome. */
export type FormatoAnuncio = "Vídeo" | "Imagem" | "Carrossel" | "Reels" | "Stories";

const FORMATOS: [RegExp, FormatoAnuncio][] = [
  [/^v[ií]deos?$/i, "Vídeo"],
  [/^(imagem|imagens|img|foto|fotos|est[áa]tico)$/i, "Imagem"],
  [/^carross?[ée]is?$|^carrossel$/i, "Carrossel"],
  [/^reels?$/i, "Reels"],
  [/^stor(y|ies)$/i, "Stories"],
];

/**
 * Pedaços do nome que são código de gestor: prefixos de tipo ("ADS", "AD"), numeração de conjunto
 * ("CJ 01", "C3", "01"), destino ("Whatsapp", "Direct"), segmentação técnica ("aberto", "LAL 1%",
 * "Advantage+"), objetivo ("Engajamento", "Mensagem", "Captação") e sexo abreviado ("F", "M").
 */
const JARGAO = new RegExp([
  "^(ads?|an[uú]ncios?|criativos?)$",
  "^(cj|conj(unto)?|c)\\s*\\d+$",
  "^\\d{1,3}$",
  "^(whats\\s*app|wpp|zap|direct|messenger|instagram|facebook|ig|fb)$",
  "^(aberto|aberta|fechado|amplo|broad|advantage\\+?|lal.*|lookalike.*|interesses?|remarketing|rmkt)$",
  "^(engajamento|mensage(m|ns)|capta[çc][ãa]o|convers[ãa]o|convers[õo]es|tr[áa]fego|leads?|alcance|reconhecimento|vendas?|cadastro)$",
  "^[fm]$",
].join("|"), "i");

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos", "com", "para", "pra", "por", "a", "o", "as", "os"]);

/** Nome TODO EM MAIÚSCULA vira título ("PORTA MACIÇA" → "Porta Maciça"); o resto fica como veio. */
function semGrito(s: string): string {
  const letras = s.replace(/[^\p{L}]/gu, "");
  if (!letras || letras !== letras.toUpperCase()) return s;
  return s.toLowerCase().split(/(\s+)/).map((p, i) => {
    if (/^\s+$/.test(p) || !p) return p;
    if (i > 0 && MINUSCULAS.has(p)) return p;
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join("");
}

const maiusculaInicial = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export interface NomeLegivel {
  nome: string;
  formato: FormatoAnuncio | null;
}

/**
 * O nome de um anúncio ou conjunto como o cliente lê. Separa por " - " / " | " / " _ ", tira o que é
 * código de gestor e pega o formato pra etiqueta. Se sobrar nada (o nome era SÓ código), devolve o
 * original arrumado — melhor o nome do gestor que um buraco.
 */
export function nomeLegivel(bruto: string | null | undefined): NomeLegivel {
  const original = (bruto ?? "").trim();
  if (!original) return { nome: "", formato: null };
  const partes = original.split(/\s+[-–|_]\s+|\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
  let formato: FormatoAnuncio | null = null;
  const sobra: string[] = [];
  for (const p of partes) {
    const f = FORMATOS.find(([rx]) => rx.test(p));
    if (f) { formato ??= f[1]; continue; }
    if (JARGAO.test(p)) continue;
    sobra.push(p);
  }
  const nome = sobra.length ? sobra.map(semGrito).join(" · ") : semGrito(original);
  return { nome: maiusculaInicial(nome), formato };
}

/** "1 curtida" / "3 curtidas" — o PDF dizia "1 curtidas". */
export function plural(n: number, um: string, varios: string): string {
  return `${Math.round(n).toLocaleString("pt-BR")} ${Math.round(n) === 1 ? um : varios}`;
}

/**
 * Gênero que SOMA 100. Arredondar cada lado sozinho dava "64% · 37%" (63,5 e 36,5) no Instagram da
 * Madeireira. Arredonda o maior e o outro é o complemento.
 */
export function generoQueSoma100(mulheres: number, homens: number): { mulheres: number; homens: number } {
  const total = mulheres + homens;
  if (total <= 0) return { mulheres: 0, homens: 0 };
  const m = (mulheres / total) * 100;
  if (m >= 50) { const mr = Math.round(m); return { mulheres: mr, homens: 100 - mr }; }
  const hr = Math.round(100 - m);
  return { mulheres: 100 - hr, homens: hr };
}

const UF: Record<string, string> = {
  "rio de janeiro": "RJ", "são paulo": "SP", "minas gerais": "MG", "espírito santo": "ES", "bahia": "BA",
  "paraná": "PR", "santa catarina": "SC", "rio grande do sul": "RS", "goiás": "GO", "distrito federal": "DF",
  "pernambuco": "PE", "ceará": "CE", "pará": "PA", "amazonas": "AM", "maranhão": "MA", "paraíba": "PB",
  "rio grande do norte": "RN", "alagoas": "AL", "sergipe": "SE", "piauí": "PI", "mato grosso": "MT",
  "mato grosso do sul": "MS", "tocantins": "TO", "rondônia": "RO", "acre": "AC", "amapá": "AP", "roraima": "RR",
};

/** "São Pedro da Aldeia, Rio de Janeiro" → "São Pedro da Aldeia, RJ" — cabe sem cortar no meio. */
export function cidadeCurta(nome: string): string {
  const m = nome.match(/^(.*),\s*([^,]+)$/);
  if (!m) return nome;
  const uf = UF[m[2].trim().toLowerCase()];
  return uf ? `${m[1].trim()}, ${uf}` : nome;
}
