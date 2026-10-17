// lib/crm/filtro-lead.ts — o formulário do site manda LIXO junto com cliente. Módulo PURO, testado.
//
// Na planilha "Leads Site - Lone Mídia" (98 linhas, set/2025 → out/2026) 37 eram lixo: 13 robôs
// (texto em cirílico, link de propaganda, e-mail descartável `.store`), 10 testes da própria equipe,
// 9 telefones que não existem e 5 duplicados. Lixo no funil vira "lead novo sem contato" cobrado todo
// dia — o comercial passa a ignorar a lista. Regra, não IA: cada recusa tem um motivo legível.

export type MotivoDescarte =
  | "texto_estrangeiro"   // cirílico/chinês no nome ou no desafio
  | "link"                // URL no desafio/nome (propaganda)
  | "email_descartavel"   // domínio de spam conhecido / .store / .ru
  | "nome_robo"           // Fulano_abcd, MAIUSCULAS1912ALEATORIAS, nome = empresa aleatória
  | "telefone_invalido"   // não é celular brasileiro
  | "teste_equipe";       // a própria Lone testando o formulário

export interface EntradaLead {
  nome?: string | null;
  empresa?: string | null;
  email?: string | null;
  telefone?: string | null;
  desafio?: string | null;
}

/**
 * ok: entra no funil. `telefone` = celular em E.164 sem "+", ou null quando a pessoa parece real mas
 * digitou o número errado (falta dígito, fixo) — aí o lead entra com `telefoneDigitado` para conferir
 * pelo e-mail ou Instagram. Descartar gente de verdade custa mais caro que deixar passar um robô.
 */
export type Veredito =
  | { ok: true; telefone: string | null; telefoneDigitado: string | null }
  | { ok: false; motivo: MotivoDescarte; detalhe: string };

const DOMINIOS_SPAM = /(?:@|\.)(?:berlingid\.ru|polosmail\.com|bounce3d\.store|lvdskjn\.store|dezia\.store|aioseoblog\.store|madeiratravelnews\.com|iclub-china\.com)$/i;
const TLD_SPAM = /\.(?:store|ru|cn|xyz|top|click|icu)$/i;
// E-mails e marcas da própria Lone (quem testa o formulário). Comparação sem acento e minúscula.
// E-mail PESSOAL de quem é da equipe não mora no código (o repositório é público): vai na variável
// CRM_EMAILS_EQUIPE do servidor, separado por vírgula.
const EQUIPE_EMAIL = /^(?:lonemidiamkt@gmail\.com|noreply@lonemidia\.com)$|@lonemidia\.com$|@agenciaexemplo\.com\.br$|@teste\.com$/i;
function emailDaEquipe(email: string): boolean {
  if (EQUIPE_EMAIL.test(email)) return true;
  const extras = (typeof process !== "undefined" ? process.env.CRM_EMAILS_EQUIPE ?? "" : "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
  return extras.includes(email);
}
const EQUIPE_TEXTO = /\b(?:teste|test|testando|regress[aã]o)\b|\blone\s*m[ií]dia\b|\bsales tech\b|\bag[eê]ncia exemplo\b/i;

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Celular brasileiro em E.164 sem "+": 55 + DDD (11–99) + 9 + 8 dígitos. Aceita com/sem 55, com
 * máscara. Fixo (8 dígitos depois do DDD) não serve para WhatsApp de lead → inválido.
 */
export function celularBR(entrada: string | null | undefined): string | null {
  let d = String(entrada ?? "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  else if (d.length === 12 && d.startsWith("55")) return null; // 55 + DDD + 8 dígitos = fixo
  if (d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99 || d[2] !== "9") return null;
  // DDDs que não existem no Brasil (20, 23, 25, 26, 29, 30, 36, 39, 40, 50, 52, 56–60, 70, 72, 76, 78, 80, 90)
  if ([20, 23, 25, 26, 29, 30, 36, 39, 40, 50, 52, 56, 57, 58, 59, 60, 70, 72, 76, 78, 80, 90].includes(ddd)) return null;
  return `55${d}`;
}

const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e);

export function avaliarLead(e: EntradaLead): Veredito {
  const nome = (e.nome ?? "").trim();
  const empresa = (e.empresa ?? "").trim();
  const email = (e.email ?? "").trim().toLowerCase();
  const desafio = (e.desafio ?? "").trim();
  const tudo = `${nome} ${empresa} ${desafio}`;
  const nomeDeGente = /\S+\s+\S+/.test(nome); // nome e sobrenome

  if (/[\u0400-\u04FF\u4E00-\u9FFF]/.test(tudo)) return { ok: false, motivo: "texto_estrangeiro", detalhe: "Texto em outro alfabeto." };
  if (/https?:\/\/|www\.|\.com\/|youtube\.com|\bt\.me\//i.test(tudo)) return { ok: false, motivo: "link", detalhe: "Link no formulário (propaganda)." };
  // Robôs: "Internet_ouKl" (sufixo _xxxx); maiúsculas misturadas com números ("NARTYTRYUT1912…");
  // letras aleatórias sem espaço ("HfOEhfvxxMoCnbfMlJD"); uma palavra só igual à empresa ("Andy"/"Andy").
  const compacto = nome.replace(/\s/g, "");
  if (/_[A-Za-z]{2,5}$/.test(nome) || /^(?=.*\d)[A-Z0-9]{12,}$/.test(compacto) ||
      (/^[A-Za-z]{15,}$/.test(nome) && /[A-Z].*[A-Z].*[A-Z]/.test(nome.slice(1))) ||
      (!nomeDeGente && nome.length > 0 && semAcento(nome).toLowerCase() === semAcento(empresa).toLowerCase())) {
    return { ok: false, motivo: "nome_robo", detalhe: "Nome com padrão de robô." };
  }
  if (emailDaEquipe(email) || EQUIPE_TEXTO.test(semAcento(tudo))) return { ok: false, motivo: "teste_equipe", detalhe: "Teste da própria equipe." };
  // Domínio de spam derruba quem não tem nome de gente; com nome e sobrenome e celular válido, passa
  // (um robô usou o mesmo e-mail num cadastro com dados reais de Araruama).
  const tel = celularBR(e.telefone);
  if (email && (DOMINIOS_SPAM.test(email) || TLD_SPAM.test(email)) && !(nomeDeGente && tel)) {
    return { ok: false, motivo: "email_descartavel", detalhe: `Domínio de spam (${email.split("@")[1] ?? email}).` };
  }
  if (!tel) {
    const digitado = String(e.telefone ?? "").replace(/\D/g, "") || null;
    // Gente de verdade com o número errado: entra para conferir. Sem nome de gente ou sem e-mail: descarta.
    if (nomeDeGente && email && emailValido(email)) return { ok: true, telefone: null, telefoneDigitado: digitado };
    return { ok: false, motivo: "telefone_invalido", detalhe: "Não é um celular brasileiro válido." };
  }
  return { ok: true, telefone: tel, telefoneDigitado: null };
}

export const ROTULO_DESCARTE: Record<MotivoDescarte, string> = {
  texto_estrangeiro: "Texto em outro alfabeto",
  link: "Link de propaganda",
  email_descartavel: "E-mail descartável",
  nome_robo: "Nome de robô",
  telefone_invalido: "Telefone inválido",
  teste_equipe: "Teste da equipe",
};
