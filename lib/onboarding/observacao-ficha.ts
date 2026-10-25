// lib/onboarding/observacao-ficha.ts — a observação que o CLIENTE escreveu no link de cadastro, para a
// ficha. Puro.
//
// POR QUE (25/10/2026, onda 5 da auditoria de erro recuperável). Desde a onda 1 a observação do cliente
// mora em client_onboarding_submissions.notes (antes apagava as notas internas do time, item 1.2). Só
// que ela só aparecia na linha do tempo e na tela de Pendentes: quem abria a ficha para cuidar do
// cliente não via o que ele pediu ao se cadastrar. Aqui se escolhe qual observação mostrar e com que
// data; a aba Admin a mostra separada das notas internas (`clients.notes`), só para ler.
//
// Testado em tests/observacao-cadastro-ficha.test.ts.

export interface LinhaCadastro {
  notes?: string | null;
  status?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
}

export interface ObservacaoCadastro {
  /** O texto como o cliente escreveu (só sem espaço sobrando nas pontas). */
  texto: string;
  /** Quando: o envio do cadastro; sem envio, quando o link foi aberto (o rascunho não guarda hora). */
  em: string | null;
  /** O cliente concluiu o cadastro (true) ou a observação está num rascunho ainda não enviado (false). */
  enviada: boolean;
}

/** Limite de exibição: o campo é livre e a ficha não pode virar um muro de texto. */
export const MAX_OBSERVACAO = 4000;

function quando(l: LinhaCadastro): string {
  return l.submitted_at || l.created_at || "";
}

/**
 * A observação a mostrar: a do cadastro mais recente que tenha texto (um cliente pode ter recebido mais
 * de um link). null = o cliente não escreveu nada.
 */
export function observacaoParaFicha(linhas: LinhaCadastro[] | null | undefined): ObservacaoCadastro | null {
  const comTexto = (linhas ?? [])
    .filter((l) => typeof l.notes === "string" && l.notes.trim())
    .sort((a, b) => quando(b).localeCompare(quando(a)));
  const l = comTexto[0];
  if (!l) return null;
  const texto = (l.notes as string).trim();
  return {
    texto: texto.length > MAX_OBSERVACAO ? `${texto.slice(0, MAX_OBSERVACAO - 1).trimEnd()}…` : texto,
    em: l.submitted_at || l.created_at || null,
    enviada: !!l.submitted_at,
  };
}

/** "Escrita no envio do cadastro, em 21/10/2026" / "No rascunho do link (ainda não enviado), aberto em 20/10/2026". */
export function rotuloDaObservacao(o: Pick<ObservacaoCadastro, "em" | "enviada">): string {
  const d = o.em ? new Date(o.em) : null;
  const data = d && Number.isFinite(d.getTime())
    ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" })
    : null;
  if (o.enviada) return data ? `Escrita no envio do cadastro, em ${data}` : "Escrita no envio do cadastro";
  return data ? `No rascunho do link (ainda não enviado), aberto em ${data}` : "No rascunho do link (ainda não enviado)";
}
