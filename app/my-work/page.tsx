import { Suspense } from "react";
import MeuTrabalho from "./MeuTrabalho";

// /my-work — Meu Trabalho. A vista (Hoje, Tarefas, Agenda) vem de ?view=; ler a query no cliente
// exige um Suspense em volta no prerender do Next.
export default function MeuTrabalhoPage() {
  return (
    <Suspense fallback={null}>
      <MeuTrabalho />
    </Suspense>
  );
}
