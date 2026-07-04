// lib/cs/lacunas.ts — "ninguém fica pra trás": clientes de social SEM nenhum post planejado na
// semana corrente (seg-dom). O erro nº 1 de agência é esquecer um cliente numa semana corrida —
// aqui a Lone cruza carteira × board e aponta a lacuna. Puro (testável); snapshot injeta os dados.

export interface ClienteLacuna {
  id: string;
  nome: string;
  social?: string | null;   // responsável (assigned_social)
}

export interface CardSemana {
  clientId: string | null;
  dueDate: string | null;    // YYYY-MM-DD (due_date do card = data do post)
}

/** Segunda-feira da semana de `hoje` (00:00 local). */
export function inicioDaSemana(hoje: Date): Date {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const offset = (d.getDay() + 6) % 7;                       // seg=0 … dom=6
  d.setDate(d.getDate() - offset);
  return d;
}

const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Clientes elegíveis (ativos, com social) sem NENHUM card com due_date dentro da semana corrente.
 * `clientes` já deve vir filtrado (ativos, com assigned_social, sem "(teste)").
 */
export function clientesSemPostNaSemana(clientes: ClienteLacuna[], cards: CardSemana[], hoje: Date): ClienteLacuna[] {
  const ini = ymdLocal(inicioDaSemana(hoje));
  const fim = ymdLocal(new Date(inicioDaSemana(hoje).getFullYear(), inicioDaSemana(hoje).getMonth(), inicioDaSemana(hoje).getDate() + 6));
  const cobertos = new Set(
    cards
      .filter((c) => c.clientId && c.dueDate && c.dueDate >= ini && c.dueDate <= fim)
      .map((c) => c.clientId as string),
  );
  return clientes.filter((c) => !cobertos.has(c.id));
}
