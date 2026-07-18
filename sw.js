/* Carnet de chantier — cache pour un fonctionnement hors réseau.
 * Stratégie : cache d'abord. Une fois l'app ouverte une fois avec du réseau,
 * elle s'ouvre partout, y compris au fond d'un chantier sans barre.
 */
const CACHE = "carnet-v1";

// Ce qui vient du dossier lui-même.
const LOCAL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

// Ce qui vient d'ailleurs et sans quoi l'app ne démarre pas.
const DISTANT = [
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone@7/babel.min.js",
  "https://unpkg.com/@supabase/supabase-js@2",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Le local doit réussir ; le distant, on tente sans bloquer l'installation.
    await c.addAll(LOCAL);
    await Promise.all(DISTANT.map((u) => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const cles = await caches.keys();
    await Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Jamais l'API : une réponse de Claude mise en cache serait un mensonge.
  if (url.hostname === "api.anthropic.com") return;
  // Ni les données partagées : une réponse en cache serait un carnet d'hier.
  if (url.hostname.endsWith(".supabase.co")) return;

  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreVary: true });
    if (hit) {
      // Rafraîchir en arrière-plan sans faire attendre l'utilisateur.
      e.waitUntil(fetch(req).then(async (r) => {
        if (r && (r.ok || r.type === "opaque")) (await caches.open(CACHE)).put(req, r.clone());
      }).catch(() => {}));
      return hit;
    }
    try {
      const r = await fetch(req);
      if (r && (r.ok || r.type === "opaque")) (await caches.open(CACHE)).put(req, r.clone());
      return r;
    } catch (err) {
      // Hors ligne et jamais vu : au moins renvoyer la page d'accueil.
      if (req.mode === "navigate") {
        const acc = await caches.match("./index.html", { ignoreVary: true });
        if (acc) return acc;
      }
      throw err;
    }
  })());
});
