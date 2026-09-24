import { redirect } from "next/navigation";

// /jornada — a Jornada CS virou a Saúde da carteira (Leva 6A, 25/09/2026), vista "Jornada" (a etapa de
// cada cliente: onboarding, ativo, acompanhamento, atenção, risco, renovação). O resto do que ela
// fazia mora em cada cliente da fila:
//   • risco e porquê → o nível do modelo único (lib/saude/carteira.ts), igual em toda tela;
//   • próxima ação   → sugerida pelo feed de prioridades, a pessoa confirma ou edita;
//   • ficha de relacionamento (pendências do cliente, reuniões, notas, check-ins) → no detalhe do
//     cliente, só para a gestão (como antes: as notas trazem o handoff do comercial).
// A rota fica de pé como redirecionamento (links salvos, WhatsApp).
export default function JornadaRedirect() {
  redirect("/saude?view=jornada");
}
