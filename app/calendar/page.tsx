import { redirect } from "next/navigation";

// /calendar — endereço antigo que continua valendo (painel, aba Reuniões do cliente, favoritos).
// A agenda virou a vista "Agenda" do Meu Trabalho: eram três telas para as mesmas tarefas.
// `?d=AAAA-MM-DD` segue junto — é o que abre a agenda já no dia da reunião.
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const destino = new URLSearchParams({ view: "agenda" });
  const d = params.d;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) destino.set("d", d);
  redirect(`/my-work?${destino.toString()}`);
}
