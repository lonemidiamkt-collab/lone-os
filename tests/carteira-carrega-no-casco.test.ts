import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Roberto (11/09/2026): "os social midia seguem com o erro de não conseguir escolher o cliente
// para adicionar que teve reunião ou marcar, sendo Carlos e Thiago".
//
// Causa: o /calendar lia useClientsStore.clients e NUNCA chamava init(). Dependia de outra página
// ter carregado antes. Admin entra pelo dashboard (que carrega) e nunca viu; social abre o
// calendário direto ou dá F5 e recebe "Nenhum cliente na sua carteira" — com a mensagem culpando o
// cadastro. Seis páginas tinham o mesmo defeito.
//
// A correção é carregar UMA vez no casco do app, onde todo login passa. Este teste trava isso: se
// alguém tirar o init do AppShell achando que "cada página cuida do seu", as seis voltam.

const SHELL = readFileSync("components/AppShell.tsx", "utf8");

describe("carteira de clientes carrega no casco do app", () => {
  it("o MainLayout inicia o store de clientes junto com as notificações", () => {
    expect(SHELL).toMatch(/const initClients = useClientsStore\(\(s\) => s\.init\)/);
    expect(SHELL).toMatch(/initNotifs\(\);\s*\n\s*initClients\(\);/);
  });

  it("o efeito depende do initClients (senão o React reclama e alguém 'corrige' tirando)", () => {
    expect(SHELL).toMatch(/\[initNotifs, refreshNotifs, initClients, initContent, initOps, initTraffic\]/);
  });
});

describe("o modal do calendário não culpa o cadastro enquanto carrega", () => {
  const CAL = readFileSync("app/calendar/page.tsx", "utf8");

  it("distingue carregando, falhou e vazio de verdade", () => {
    expect(CAL).toMatch(/Carregando sua carteira/);
    expect(CAL).toMatch(/Não consegui carregar os clientes/);
    expect(CAL).toMatch(/Nenhum cliente na sua carteira\. Fale com a gestão/);
  });

  it("lê loading e initialized do store, não só a lista", () => {
    expect(CAL).toMatch(/useClientsStore\(\(s\) => s\.loading\)/);
    expect(CAL).toMatch(/useClientsStore\(\(s\) => s\.initialized\)/);
  });
});

describe("o quadro do designer não afirma 'sem itens' antes de saber", () => {
  const DESIGN = readFileSync("app/design/page.tsx", "utf8");

  it("espera a carteira carregar antes de filtrar por dono", () => {
    // Rodrigo (11/09): "todas as demandas sumiram". O dono é resolvido pela lista de clientes;
    // lista vazia = toda demanda sem dono = quadro pessoal vazio, com cara de verdade.
    expect(DESIGN).toMatch(/tab === "requests" && !clientesCarregados && quadroAtivo !== "Todos"/);
    expect(DESIGN).toMatch(/Carregando sua carteira para montar o quadro/);
    expect(DESIGN).toMatch(/Não consegui carregar a lista de clientes/);
  });

  it("a carteira tenta carregar de novo sozinha quando a primeira carga falha", () => {
    expect(SHELL).toMatch(/initClients\(\); initContent\(\); initOps\(\); initTraffic\(\);\s*\n\s*\}, 45000\)/);
  });
});

describe("os quatro stores de dados carregam no casco, não em cada página", () => {
  it("content, operational e traffic entram junto com clients", () => {
    // Varredura de 11/09 à tarde: /calendar, /my-work, /ceo e /tarefas liam esses stores sem
    // chamar init(). Quem entra pelo dashboard nunca vê; quem cai direto vê "nenhum dado".
    expect(SHELL).toMatch(/initClients\(\); initContent\(\); initOps\(\); initTraffic\(\);/);
  });

  it("o intervalo de 45s re-tenta os quatro", () => {
    expect(SHELL).toMatch(/refreshNotifs\(\);\s*\n\s*initClients\(\); initContent\(\); initOps\(\); initTraffic\(\);/);
  });

  it("o timesheet do CEO diz 'carregando' em vez de 'nenhum dado' enquanto espera", () => {
    const CEO = readFileSync("app/ceo/page.tsx", "utf8");
    expect(CEO).toMatch(/dadosProntos \? msg : "Carregando…"/);
    expect(CEO).not.toMatch(/<p className="text-xs text-muted-foreground">Nenhum dado disponível\.<\/p>/);
  });
});
