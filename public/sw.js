const CACHE_NAME = "lone-os-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Purga QUALQUER cache antigo (de versões passadas do SW) — evita o app servir uma versão
  // velha em cache e "esconder" features já entregues. Depois assume o controle das abas.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  // Network-first strategy for API calls
  if (event.request.url.includes("/api/") || event.request.url.includes("/supabase/")) {
    return;
  }
});
