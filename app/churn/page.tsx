import { redirect } from "next/navigation";

// /churn — o Termômetro de Churn virou a Saúde da carteira (Leva 6A, 25/09/2026). Eram três telas
// (Termômetro, Jornada CS, Carteira) dando respostas diferentes para "este cliente está em risco?";
// agora é uma, com o modelo único de lib/saude/carteira.ts.
//
// O Termômetro mostrava TODOS os clientes, pior primeiro — é o equivalente aqui: todos os níveis, toda
// a carteira. A composição da nota e a tendência de 14 dias estão no detalhe de cada cliente.
// A rota fica de pé como redirecionamento: link salvo e mensagem antiga continuam caindo no lugar certo.
export default function TermometroRedirect() {
  redirect("/saude?nivel=todos&resp=all");
}
