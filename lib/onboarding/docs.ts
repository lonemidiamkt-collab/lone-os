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

/** Tira UM arquivo do campo (o cliente mandou o arquivo errado). null = campo ficou vazio. */
export function removerDocDaLista(valorAtual: string | undefined | null, url: string): string | null {
  const resto = listaDocs(valorAtual).filter((u) => u !== url);
  return resto.length ? resto.join(SEP_DOCS) : null;
}

/**
 * O que a rota de upload grava na ficha (clients) depois de guardar o arquivo.
 * POR QUE (24/10/2026, item 1.13). A rota gravava só a url nova: num campo de vários arquivos de um
 * cliente JÁ ativo (a sincronia do rascunho só preenche o vazio da ficha), a ficha ficava com o
 * último arquivo e as outras páginas do cartão CNPJ sumiam. Campo de vários acrescenta; o logo troca.
 */
export const COLUNAS_DE_VARIOS = new Set(["doc_contrato_social", "doc_identidade"]);

export function valorAposUpload(coluna: string, atual: string | null | undefined, novaUrl: string): string {
  if (!COLUNAS_DE_VARIOS.has(coluna)) return novaUrl;
  return listaDocs(atual).includes(novaUrl) ? listaDocs(atual).join(SEP_DOCS) : adicionarDoc(atual, novaUrl);
}
