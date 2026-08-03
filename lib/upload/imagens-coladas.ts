// lib/upload/imagens-coladas.ts — pegar imagem do Ctrl+V e do arrastar-e-soltar.
//
// POR QUE EXISTE (Roberto, 03/08): o campo de referência só aceitava o seletor de arquivo. Mas o
// jeito que o time realmente trabalha é copiar a arte de outro lugar (WhatsApp, Drive, print) e
// colar. Obrigar a salvar em disco antes é um passo a mais em algo que acontece dezenas de vezes
// por dia.
//
// Fica separado porque os DOIS formulários de criação precisam do mesmo comportamento — o "Novo
// conteúdo" do social e o "Nova Tarefa" do designer. Duplicar isso garantiria que um dia eles
// divergissem.

/** Só imagem: o campo é de referência visual, e PDF/vídeo aqui só geraria erro no upload. */
const EH_IMAGEM = /^image\//;

/**
 * Imagens de um evento de colar. Vazio quando o que veio não é imagem (texto, link, arquivo comum)
 * — nesse caso o chamador NÃO deve impedir o paste padrão, senão quebra colar texto nos campos.
 */
export function imagensDoPaste(e: ClipboardEvent | React.ClipboardEvent): File[] {
  const dt = (e as React.ClipboardEvent).clipboardData ?? (e as ClipboardEvent).clipboardData;
  if (!dt) return [];
  const out: File[] = [];

  // `items` cobre o print da tela (que vem como item, não como file). `files` cobre o arquivo
  // copiado do explorador. Os dois caminhos existem e nenhum sozinho dá conta.
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== "file" || !EH_IMAGEM.test(item.type)) continue;
    const f = item.getAsFile();
    if (f) out.push(renomearSePreciso(f));
  }
  if (!out.length) {
    for (const f of Array.from(dt.files ?? [])) {
      if (EH_IMAGEM.test(f.type)) out.push(renomearSePreciso(f));
    }
  }
  return out;
}

/** Imagens de um arrastar-e-soltar. Mesma regra do paste. */
export function imagensDoDrop(e: React.DragEvent): File[] {
  return Array.from(e.dataTransfer?.files ?? []).filter((f) => EH_IMAGEM.test(f.type));
}

/**
 * Print colado chega como "image.png" — todo mundo com o mesmo nome. Se a pessoa colar três, o
 * aviso de erro diria "image.png" três vezes e ninguém saberia qual falhou. Dá um nome único.
 */
function renomearSePreciso(f: File): File {
  const generico = !f.name || /^image\.(png|jpe?g|webp)$/i.test(f.name);
  if (!generico) return f;
  const ext = (f.type.split("/")[1] || "png").replace("jpeg", "jpg");
  // Sem Date.now() no nome: dois prints colados no mesmo milissegundo colidiriam. O índice quem
  // resolve é o chamador, então aqui basta um sufixo aleatório curto.
  const sufixo = Math.random().toString(36).slice(2, 7);
  return new File([f], `colada-${sufixo}.${ext}`, { type: f.type });
}
