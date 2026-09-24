import { Suspense } from "react";
import AgenteLone from "./AgenteLone";

// /agente — o Agente Lone. Abre no "Hoje" do CS (o feed de prioridades); ?view=desempenho mostra a
// acurácia, o aprendizado e o estilo. Ler a query no cliente exige um Suspense em volta no prerender.
export default function AgentePage() {
  return (
    <Suspense fallback={null}>
      <AgenteLone />
    </Suspense>
  );
}
