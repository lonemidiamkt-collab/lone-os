// lib/onboarding/docs.ts — um campo de documento pode guardar VÁRIOS arquivos.
//
// PRA QUE (Roberto, 24/08): "na área de cadastro do cliente ele só conseguiu adicionar um conteúdo
// de imagem no arquivo, sendo que quando é CNPJ às vezes é mais de uma imagem".
//
// Cartão CNPJ tem várias páginas e RG tem frente e verso. O campo guardava UMA url: o segundo
// arquivo substituía o primeiro sem avisar — o cliente enviava tudo e só o último chegava.
//
// As colunas são `text` e existe cadastro antigo com uma url só, então o formato é
// "url\nurl\nurl": quem tem um arquivo continua com uma linha, e nada precisa migrar.

export const SEP_DOCS = "\n";

/** Lista de urls de um campo de documento. Aceita o formato antigo (uma url só). */
export function listaDocs(valor?: string | null): string[] {
  return (valor || "").split(SEP_DOCS).map((x) => x.trim()).filter(Boolean);
}

/** Acrescenta sem perder o que já estava lá. */
export function adicionarDoc(valorAtual: string | undefined | null, novaUrl: string): string {
  return [...listaDocs(valorAtual), novaUrl].join(SEP_DOCS);
}

/** Primeira url — para quem só sabe lidar com um arquivo (thumbnail, contrato). */
export function primeiroDoc(valor?: string | null): string | null {
  return listaDocs(valor)[0] ?? null;
}
