// Service worker de Morlaco: permite abrir la página sin conexión con los últimos datos.
//
// - La página y los datos se piden primero a la red (para tenerlos siempre al día) y,
//   si no hay conexión, se sirven desde la caché.
// - Las bibliotecas externas (Leaflet, la tipografía) y los mapas ya vistos se sirven
//   desde la caché, porque no cambian.
// - La búsqueda de lugares (Nominatim) nunca se guarda.

const CACHE_PAGINA = "morlaco-pagina-v1";
const CACHE_EXTERNOS = "morlaco-externos-v1";
const CACHE_MAPA = "morlaco-mapa-v2";
const CACHES = [CACHE_PAGINA, CACHE_EXTERNOS, CACHE_MAPA];
const MAXIMO_TESELAS = 300;
const ESPERA_RED_MS = 4000;

const PRECARGA = [
  "./",
  "index.html",
  "estilos.css",
  "app.js",
  "logica.js",
  "calles.js",
  "buses.js",
  "textos.js",
  "icono.svg",
  "manifest.webmanifest",
  "iconos/icono-192.png",
  "../datos/recoleccion/zonas.geojson",
  "../datos/luz/suspensiones.json",
  "../datos/buses/paradas.geojson",
  "../datos/buses/lineas.geojson",
  "../datos/buses/rutas.json",
  "../datos/estado.json",
  "../datos/movilidad/bicicletas.geojson",
  "../datos/farmacias/turnos.json",
];
const EXTERNOS = ["unpkg.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE_PAGINA).then((cache) =>
      // Uno por uno: si un archivo falla, el resto se guarda igual.
      Promise.allSettled(PRECARGA.map((ruta) => cache.add(new Request(ruta, { cache: "reload" })))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) => Promise.all(nombres.filter((n) => !CACHES.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

function conLimite(promesa, ms) {
  return Promise.race([promesa, new Promise((_, rechazar) => setTimeout(() => rechazar(new Error("lenta")), ms))]);
}

/** Red primero; sin red (o si tarda demasiado), la última copia guardada. */
async function redPrimero(peticion) {
  const cache = await caches.open(CACHE_PAGINA);
  try {
    const respuesta = await conLimite(fetch(peticion), ESPERA_RED_MS);
    if (respuesta.ok) cache.put(peticion, respuesta.clone());
    return respuesta;
  } catch (error) {
    const guardada =
      (await cache.match(peticion, { ignoreSearch: true })) ??
      (peticion.mode === "navigate" ? await cache.match("index.html") : undefined);
    if (guardada) return guardada;
    throw error;
  }
}

/** Caché primero, para lo que no cambia. */
async function cachePrimero(peticion, nombreCache, maximo = Infinity) {
  const cache = await caches.open(nombreCache);
  const guardada = await cache.match(peticion);
  if (guardada) return guardada;
  const respuesta = await fetch(peticion);
  // Las respuestas opacas (sin CORS) ocupan varios MB de cuota cada una: no se guardan.
  if (respuesta.ok) {
    await cache.put(peticion, respuesta.clone());
    if (Number.isFinite(maximo)) {
      const claves = await cache.keys();
      // Se borran las más antiguas para no llenar el teléfono.
      await Promise.all(claves.slice(0, Math.max(0, claves.length - maximo)).map((c) => cache.delete(c)));
    }
  }
  return respuesta;
}

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;
  const url = new URL(peticion.url);

  if (url.origin === self.location.origin) {
    evento.respondWith(redPrimero(peticion));
  } else if (url.hostname === "tile.openstreetmap.org") {
    evento.respondWith(cachePrimero(peticion, CACHE_MAPA, MAXIMO_TESELAS));
  } else if (EXTERNOS.includes(url.hostname)) {
    evento.respondWith(cachePrimero(peticion, CACHE_EXTERNOS));
  }
  // Todo lo demás (por ejemplo Nominatim) va directo a la red, sin guardarse.
});
