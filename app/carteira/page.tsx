import { redirect } from "next/navigation";

// /carteira — a Carteira virou a Saúde da carteira (Leva 6A, 25/09/2026), vista "Por responsável": a
// distribuição dos clientes por pessoa, com quantos estão em risco, em atenção e calados.
//
// O "Radar de receita" que morava aqui dizia "em risco" pelo FATURAMENTO do cliente caindo — uma 4ª
// resposta para a mesma pergunta. O crescimento de cada cliente continua na ficha dele (aba Ficha
// Viva › Crescimento) e a rota /api/ficha-viva/carteira continua de pé; só deixou de ser uma tela
// que concorria com a saúde. A rota fica de pé como redirecionamento.
export default function CarteiraRedirect() {
  redirect("/saude?view=responsaveis&resp=all");
}
