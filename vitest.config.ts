import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// A suíte roda no fuso da PRODUÇÃO. O container é UTC e o Mac é Brasília: rodando no fuso do Mac, o
// `spNow()` deslocado parece certo e o lembrete de reunião saiu 3 horas atrasado por dois meses
// com todos os testes verdes (05/11/2026, tests/reuniao-fuso.test.ts).
process.env.TZ = "UTC";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    // path "Projetos Vibe Coding/" com espaços trava o worker pool em paralelo.
    // fileParallelism:false força execução sequencial, evita o timeout.
    pool: "threads",
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
