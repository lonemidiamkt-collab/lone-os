// Service worker do Lone OS. Não guarda páginas nem números do app — só a tela "sem conexão" do
// Painel de Resultados do cliente (public/portal-offline.html), para quem abre o aplicativo sem internet.
const CACHE_NAME = "lone-os-v2";
const PORTAL_SEM_CONEXAO = "/portal-offline.html";

self.addEventListener("install", (event) => {
  // Guarda a tela "sem conexão". Se não der (rede caiu na hora), instala assim mesmo: sem ela, o cliente
  // vê a tela de erro do navegador, como antes — nunca um service worker travado.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.add(new Request(PORTAL_SEM_CONEXAO, { cache: "reload" })))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Purga QUALQUER cache de versões passadas do SW — evita o app servir uma versão velha em cache e
  // "esconder" features já entregues. Fica só o cache atual (a tela "sem conexão"). Depois assume as abas.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Só a ABERTURA do portal do cliente (/portal/<token>): rede primeiro, sempre. Sem rede, a tela
  // "sem conexão". Tudo o mais (painel do time, API, arquivos) segue direto para a rede, sem passar aqui.
  if (req.mode !== "navigate") return;
  if (!new URL(req.url).pathname.startsWith("/portal/")) return;
  event.respondWith(
    fetch(req).catch(async () => (await caches.match(PORTAL_SEM_CONEXAO)) || Response.error()),
  );
});
