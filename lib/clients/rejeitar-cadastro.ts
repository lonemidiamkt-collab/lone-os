// lib/clients/rejeitar-cadastro.ts — a confirmação de "Rejeitar" em Cadastros Pendentes
// (app/clients/pending/page.tsx).
//
// 24/10/2026 (auditoria de erro recuperável, 3.14): a confirmação dizia só "Rejeitar este cadastro?".
// Com a fila aberta e um cadastro selecionado na lateral, nada no aviso dizia QUAL seria apagado — e a
// rejeição apaga de vez. O nome (e o contato, quando há) entram na pergunta.

export function textoRejeitarCadastro(nome: string, contato?: string | null): string {
  const quem = nome.trim() || "Sem nome";
  const comContato = contato && contato.trim() && contato.trim() !== quem ? ` (contato: ${contato.trim()})` : "";
  return `Rejeitar o cadastro de "${quem}"${comContato}?\n\n` +
    "O rascunho e o que foi enviado pelo link de cadastro serão apagados — não dá para desfazer.";
}
