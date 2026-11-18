// tests/stubs/server-only.ts — o "server-only" do Next, nos testes. O Next resolve esse import sozinho no build (e
// quebra o build se um componente de navegador puxar o arquivo); o vitest não conhece o pacote. Aqui ele não faz
// nada: os testes rodam no Node, que é o lado servidor.
export {};
