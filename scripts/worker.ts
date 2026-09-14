// scripts/worker.ts — sobe o worker da fila sozinho (fora do Next). Uso futuro: container próprio.
//   DATABASE_URL=… npx tsx scripts/worker.ts
import { iniciarWorker, pararWorker } from "../lib/fila/worker";

iniciarWorker().then((r) => {
  if (!r.ok) { console.error(r.motivo); process.exit(1); }
});
for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => { void pararWorker().then(() => process.exit(0)); });
}
