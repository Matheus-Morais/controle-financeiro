/* Service worker da PWA: cache offline do casco, Web Push e clique na notificação. */

/* Sobe a cada mudança neste arquivo para descartar o cache da versão anterior. */
const CACHE = "cf-v1";

/**
 * O que vale a pena guardar: só arquivos estáticos e a página de "sem conexão".
 *
 * Nenhum HTML de rota entra aqui de propósito. Toda tela do app é renderizada
 * no servidor com os dados do usuário — guardá-la significaria mostrar saldo
 * velho como se fosse atual e deixar dado financeiro no disco do aparelho.
 */
const PRECACHE = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/logo.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      /* addAll é tudo-ou-nada: um 404 aborta a instalação inteira e a PWA fica
         sem service worker. Cada item vai sozinho e as falhas são ignoradas. */
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  /* Só GET, e nunca a API: POST de Server Action e rota de fatura precisam
     sempre ir à rede. */
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  /* Navegação: rede primeiro (dado financeiro nunca sai do cache). Offline,
     mostra a página de aviso em vez do dinossauro do navegador. */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline.html").then((res) => res ?? Response.error()),
      ),
    );
    return;
  }

  /* Estático (ícones, manifest, bundles do /_next/static, que têm hash no nome):
     cache primeiro, com a resposta nova guardada em segundo plano. */
  if (url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Controle Financeiro", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Controle Financeiro";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url || "/" },
    tag: payload.tag,
    renotify: Boolean(payload.tag),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
