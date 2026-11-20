// El mapa de Morlaco, vectorial, con MapLibre GL: lo dibuja la tarjeta gráfica, así que el
// zoom es continuo y los recorridos se trazan con una animación (sin movimiento si la persona
// lo pidió así). app.js solo usa lo que devuelve `crearMapa`: mostrar, resaltar,
// resaltarLinea, dibujarRuta, agregarCapas y mostrarCapa.

import { CENTRO_CUENCA, LIMITES_CUENCA, horaLegible, nombreDia, nombreParada, puntoEnGeometria } from "./logica.js";
import { paradasDeRecorrido } from "./rutas.js";
import { listar, t } from "./textos.js";
import { busesEnCamino, medirRecorrido, minutosAlProximo, puntoEnRecorrido, puntosDeTrazado } from "./vehiculos.js";

// MapLibre se carga en index.html, con versión fija y hash de integridad.
// Mapas vectoriales de OpenFreeMap, hechos con datos de OpenStreetMap: sin clave ni cuenta.
const ESTILOS = {
  claro: "https://tiles.openfreemap.org/styles/positron",
  oscuro: "https://tiles.openfreemap.org/styles/dark",
};
// Niveles de MapLibre (teselas de 512 px): 12 muestra la ciudad entera.
const ZOOM_INICIAL = 12;
const ZOOM_MINIMO = 10;
const ZOOM_PUNTO = 14.5;
const DURACION_TRAZO = 900;
const SEPARACION_SENTIDOS = 3.5; // px: cada sentido va a su derecha, como en la calle
const CADA_BUSES_QUIETO_MS = 15000; // si se pidió reducir el movimiento: a saltos, sin animar
// El marcador de un bus: una gota que apunta al norte (el marcador la gira según el rumbo)
// y, encima, un bus visto de lado que no gira. Dibujos propios.
const SVG_GOTA =
  '<svg class="bus-gota" viewBox="0 0 40 48" aria-hidden="true"><path d="M20 3 L30.2 17.9 A13 13 0 1 1 9.8 17.9 Z" fill="var(--color-bus)" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg>';
const SVG_GLIFO =
  '<svg class="bus-glifo" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="12" rx="3" fill="currentColor"/><rect x="4" y="7.3" width="3.6" height="3.8" rx=".8" fill="var(--color-bus)"/><rect x="8.6" y="7.3" width="3.6" height="3.8" rx=".8" fill="var(--color-bus)"/><rect x="13.2" y="7.3" width="3.6" height="3.8" rx=".8" fill="var(--color-bus)"/><rect x="17.8" y="7.3" width="2.6" height="6.5" rx=".8" fill="var(--color-bus)"/><rect x="2" y="13.6" width="20" height="1" fill="var(--color-bus)" opacity=".45"/><circle cx="7" cy="17.4" r="2.3" fill="currentColor" stroke="var(--color-bus)" stroke-width="1.3"/><circle cx="17" cy="17.4" r="2.3" fill="currentColor" stroke="var(--color-bus)" stroke-width="1.3"/></svg>';
const PROPIO = "m-"; // prefijo de las fuentes y capas de Morlaco, para conservarlas al cambiar de estilo

export const SVG_BICI =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l2 7M14 6h3"/></svg>';
const SVG_RAYO =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M13.5 2.5 5 13.5h6.2l-1 8 8.8-11h-6.3z"/></svg>';
const SVG_CAPAS =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/></svg>';

const ESPERA_BIBLIOTECA_MS = 20000;

/** MapLibre se pide en index.html sin bloquear la página; aquí se espera a que llegue. */
function cargarBiblioteca() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  const guion = document.getElementById("maplibre");
  return new Promise((resolver, fallar) => {
    const fin = setTimeout(() => fallar(new Error("MapLibre no llegó")), ESPERA_BIBLIOTECA_MS);
    guion?.addEventListener("load", () => {
      clearTimeout(fin);
      resolver(window.maplibregl);
    });
    guion?.addEventListener("error", () => {
      clearTimeout(fin);
      fallar(new Error("No se pudo cargar MapLibre"));
    });
    if (!guion) fallar(new Error("Falta MapLibre en index.html"));
  });
}

function hayWebgl() {
  try {
    const lienzo = document.createElement("canvas");
    return Boolean(lienzo.getContext("webgl2") ?? lienzo.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Una flecha (›) para marcar el sentido sobre la línea; se colorea en el mapa (SDF). */
function imagenFlecha() {
  const n = 32;
  const lienzo = document.createElement("canvas");
  lienzo.width = lienzo.height = n;
  const g = lienzo.getContext("2d");
  g.strokeStyle = "#000";
  g.lineWidth = 6;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(11, 7);
  g.lineTo(21, 16);
  g.lineTo(11, 25);
  g.stroke();
  return g.getImageData(0, 0, n, n);
}

function color(nombre) {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

const esLmv = (zona) => zona.properties.dias_iso.includes(1);

/** Un punto dentro de la zona para poner su número (el centro de una zona cóncava puede caer fuera). */
function puntoInterior(zona) {
  const anillos =
    zona.geometry.type === "Polygon" ? [zona.geometry.coordinates[0]] : zona.geometry.coordinates.map((p) => p[0]);
  const anillo = anillos.reduce((a, b) => (b.length > a.length ? b : a));
  const lons = anillo.map((p) => p[0]);
  const lats = anillo.map((p) => p[1]);
  const media = { lon: lons.reduce((s, v) => s + v, 0) / lons.length, lat: lats.reduce((s, v) => s + v, 0) / lats.length };
  if (puntoEnGeometria(media.lon, media.lat, zona.geometry)) return media;
  // Si el promedio cae fuera, el punto de una rejilla dentro de la zona más cercano a él.
  const [oeste, este] = [Math.min(...lons), Math.max(...lons)];
  const [sur, norte] = [Math.min(...lats), Math.max(...lats)];
  let mejor = null;
  for (let i = 1; i < 24; i++) {
    for (let j = 1; j < 24; j++) {
      const p = { lon: oeste + ((este - oeste) * i) / 24, lat: sur + ((norte - sur) * j) / 24 };
      if (!puntoEnGeometria(p.lon, p.lat, zona.geometry)) continue;
      const d = (p.lon - media.lon) ** 2 + (p.lat - media.lat) ** 2;
      if (!mejor || d < mejor.d) mejor = { ...p, d };
    }
  }
  return mejor ?? media;
}

function textoAcceso(acceso) {
  return { publico: t("accesoPublico"), clientes: t("accesoClientes"), privado: t("accesoPrivado") }[acceso] ?? "";
}

/** Sin WebGL o sin MapLibre, un aviso en el lugar del mapa; el resto de la página sigue igual. */
function sinMapa(contenedor) {
  contenedor.classList.add("mapa-ausente");
  contenedor.replaceChildren(Object.assign(document.createElement("p"), { textContent: t("mapaNoDisponible") }));
}

const METODOS = ["agregarCapas", "mostrarCapa", "resaltar", "resaltarLinea", "dibujarRuta", "mostrar"];

/**
 * El mapa de la página. Se devuelve enseguida: la página no espera a MapLibre para mostrar
 * las respuestas. Lo que se le pide antes de que llegue se guarda y se hace al llegar.
 */
export function crearMapa(zonas, alElegir, opciones) {
  let real = null;
  const encargos = [];
  const mapa = Object.fromEntries(
    METODOS.map((nombre) => [nombre, (...args) => (real ? real[nombre](...args) : encargos.push([nombre, args]))]),
  );
  const contenedor = document.getElementById("mapa");
  if (!hayWebgl()) {
    sinMapa(contenedor);
    return mapa;
  }
  montar(contenedor, zonas, alElegir, opciones)
    .then((listo) => {
      real = listo;
      for (const [nombre, args] of encargos.splice(0)) real[nombre](...args);
    })
    .catch(() => sinMapa(contenedor));
  return mapa;
}

const oscuro = window.matchMedia("(prefers-color-scheme: dark)");
const estiloActual = () => (oscuro.matches ? ESTILOS.oscuro : ESTILOS.claro);

const vacio = () => ({ type: "FeatureCollection", features: [] });
const coleccion = (features) => ({ type: "FeatureCollection", features });

/** Las líneas de un GeoJSON como listas de [lon, lat], sea LineString o MultiLineString. */
function lineasDe(feature) {
  const g = feature.geometry;
  if (!g) return [];
  if (g.type === "LineString") return [g.coordinates];
  if (g.type === "MultiLineString") return g.coordinates;
  return [];
}

function caja(features, puntos = []) {
  let oeste = Infinity;
  let sur = Infinity;
  let este = -Infinity;
  let norte = -Infinity;
  const sumar = ([lon, lat]) => {
    oeste = Math.min(oeste, lon);
    este = Math.max(este, lon);
    sur = Math.min(sur, lat);
    norte = Math.max(norte, lat);
  };
  for (const f of features) for (const linea of lineasDe(f)) linea.forEach(sumar);
  puntos.forEach(sumar);
  return Number.isFinite(oeste) ? [[oeste, sur], [este, norte]] : null;
}

/** Corta una línea en la fracción `f` de su largo, interpolando el último punto. */
function cortar(coords, f) {
  if (f >= 1 || coords.length < 2) return coords;
  const tramos = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
    tramos.push(d);
    total += d;
  }
  let falta = total * f;
  const salida = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    if (falta >= tramos[i - 1]) {
      salida.push(coords[i]);
      falta -= tramos[i - 1];
      continue;
    }
    const r = tramos[i - 1] ? falta / tramos[i - 1] : 0;
    const [a, b] = [coords[i - 1], coords[i]];
    salida.push([a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r]);
    break;
  }
  return salida.length > 1 ? salida : [coords[0], coords[0]];
}

const suave = (x) => 1 - (1 - x) ** 3;

const escapar = (texto) =>
  String(texto).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function montar(contenedor, zonas, alElegir, { cargarJson, sinMovimiento }) {
  const SIN_MOVIMIENTO = sinMovimiento;
  const maplibregl = await cargarBiblioteca();
  const { sur, oeste, norte, este } = LIMITES_CUENCA;
  const mapa = new maplibregl.Map({
    container: contenedor,
    style: estiloActual(),
    center: [CENTRO_CUENCA.lon, CENTRO_CUENCA.lat],
    zoom: ZOOM_INICIAL,
    minZoom: ZOOM_MINIMO,
    maxBounds: [
      [oeste, sur],
      [este, norte],
    ],
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    fadeDuration: SIN_MOVIMIENTO ? 0 : 300,
  });
  mapa.touchZoomRotate.disableRotation();
  mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

  // ---------- Datos propios ----------
  const datosZonas = coleccion(
    zonas.features.map((z) => ({ ...z, properties: { ...z.properties, lmv: esLmv(z) } })),
  );
  const fuentes = {
    zonas: datosZonas,
    calles: vacio(),
    linea: vacio(),
    rutaPie: vacio(),
    rutaBus: vacio(),
    paradasLinea: vacio(),
    ciclovias: vacio(),
  };
  const transicion = { duration: SIN_MOVIMIENTO ? 0 : 450 };
  const visibles = new Set();
  const verCiclovias = () => (visibles.has("ciclovias") ? "visible" : "none");

  // Ida en rojo bandera y retorno en azul cúpula; se puede ver un solo sentido.
  const PRINCIPAL = ["!=", ["get", "tipo"], "alargue"];
  const ALARGUE = ["==", ["get", "tipo"], "alargue"];
  let sentidoVisible = "ambos";
  const filtroLinea = (base) =>
    sentidoVisible === "ambos" ? base : ["all", base, ["==", ["get", "sentido"], sentidoVisible]];
  const colorSentido = () => ["match", ["get", "sentido"], "retorno", color("--cupula-hondo"), color("--bandera-rojo")];

  // Se vuelven a pedir los colores cada vez: cambian con el modo oscuro.
  const capasPropias = () => [
    {
      id: `${PROPIO}zonas-relleno`,
      type: "fill",
      source: `${PROPIO}zonas`,
      paint: {
        "fill-color": ["case", ["get", "lmv"], color("--cupula"), color("--tomebamba")],
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "elegida"], false],
          0.3,
          ["boolean", ["feature-state", "atenuada"], false],
          0.07,
          0.16,
        ],
        "fill-opacity-transition": transicion,
      },
    },
    {
      id: `${PROPIO}zonas-borde`,
      type: "line",
      source: `${PROPIO}zonas`,
      paint: {
        "line-color": ["case", ["get", "lmv"], color("--cupula"), color("--tomebamba")],
        "line-width": ["case", ["boolean", ["feature-state", "elegida"], false], 3, 1.5],
        "line-opacity": ["case", ["boolean", ["feature-state", "atenuada"], false], 0.5, 0.9],
        "line-width-transition": transicion,
        "line-opacity-transition": transicion,
      },
    },
    {
      id: `${PROPIO}ciclovias`,
      type: "line",
      source: `${PROPIO}ciclovias`,
      filter: ["==", ["get", "tipo"], "separada"],
      layout: { visibility: verCiclovias(), "line-cap": "round" },
      paint: { "line-color": color("--tomebamba"), "line-width": 4, "line-opacity": 0.9 },
    },
    {
      id: `${PROPIO}ciclovias-carril`,
      type: "line",
      source: `${PROPIO}ciclovias`,
      filter: ["!=", ["get", "tipo"], "separada"],
      layout: { visibility: verCiclovias() },
      paint: { "line-color": color("--tomebamba"), "line-width": 3, "line-opacity": 0.9, "line-dasharray": [1.6, 2] },
    },
    {
      id: `${PROPIO}calles`,
      type: "line",
      source: `${PROPIO}calles`,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color("--cupula-hondo"), "line-width": 6, "line-opacity": 0.85 },
    },
    {
      id: `${PROPIO}linea`,
      type: "line",
      source: `${PROPIO}linea`,
      filter: filtroLinea(PRINCIPAL),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": colorSentido(), "line-width": 4, "line-opacity": 0.9, "line-offset": SEPARACION_SENTIDOS },
    },
    {
      id: `${PROPIO}linea-alargue`,
      type: "line",
      source: `${PROPIO}linea`,
      filter: filtroLinea(ALARGUE),
      paint: {
        "line-color": colorSentido(),
        "line-width": 3,
        "line-opacity": 0.85,
        "line-dasharray": [2, 2],
        "line-offset": SEPARACION_SENTIDOS,
      },
    },
    {
      id: `${PROPIO}linea-paradas`,
      type: "circle",
      source: `${PROPIO}paradasLinea`,
      minzoom: 12,
      filter: filtroLinea(["has", "sentido"]),
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 3, 16, 6],
        "circle-color": color("--superficie"),
        "circle-stroke-color": colorSentido(),
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 12, 1.5, 16, 2.5],
        "circle-translate": [0, 0],
      },
    },
    {
      id: `${PROPIO}linea-paradas-nombre`,
      type: "symbol",
      source: `${PROPIO}paradasLinea`,
      minzoom: 15,
      filter: filtroLinea(["has", "sentido"]),
      layout: {
        "text-field": ["get", "nombre"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
        "text-max-width": 9,
      },
      paint: {
        "text-color": color("--tinta"),
        "text-halo-color": color("--superficie"),
        "text-halo-width": 1.5,
      },
    },
    {
      id: `${PROPIO}linea-flechas`,
      type: "symbol",
      source: `${PROPIO}linea`,
      filter: filtroLinea(PRINCIPAL),
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 70,
        "icon-image": `${PROPIO}flecha`,
        "icon-size": 0.85,
        "icon-offset": [0, SEPARACION_SENTIDOS / 0.85],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-rotation-alignment": "map",
      },
      paint: { "icon-color": colorSentido(), "icon-halo-color": color("--superficie"), "icon-halo-width": 1.5 },
    },
    {
      id: `${PROPIO}ruta-pie`,
      type: "line",
      source: `${PROPIO}rutaPie`,
      layout: { "line-cap": "round" },
      paint: { "line-color": color("--tinta-suave"), "line-width": 3, "line-dasharray": [0.1, 2.4] },
    },
    {
      id: `${PROPIO}ruta-bus`,
      type: "line",
      source: `${PROPIO}rutaBus`,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["case", ["==", ["get", "tipo"], "tranvia"], color("--tranvia"), color("--cupula-hondo")],
        "line-width": 5,
        "line-opacity": 0.9,
      },
    },
  ];
  const fuentesDelEstilo = () =>
    Object.fromEntries(
      Object.entries(fuentes).map(([nombre, datos]) => [
        `${PROPIO}${nombre}`,
        { type: "geojson", data: datos, ...(nombre === "zonas" ? { promoteId: "zona" } : {}) },
      ]),
    );

  let estadoZonas = { elegida: null };
  const aplicarEstadoZonas = () => {
    if (!mapa.getSource(`${PROPIO}zonas`)) return;
    for (const z of zonas.features) {
      const id = z.properties.zona;
      mapa.setFeatureState(
        { source: `${PROPIO}zonas`, id },
        { elegida: id === estadoZonas.elegida, atenuada: estadoZonas.elegida !== null && id !== estadoZonas.elegida },
      );
    }
  };
  // Las separadas van llenas y los carriles punteados.
  const ajustarCiclovias = () => {
    for (const id of ["ciclovias", "ciclovias-carril"]) {
      if (mapa.getLayer(`${PROPIO}${id}`)) mapa.setLayoutProperty(`${PROPIO}${id}`, "visibility", verCiclovias());
    }
  };

  // Se añaden sobre el mapa base, debajo de sus nombres de calles para que se sigan leyendo.
  const anadirPropias = () => {
    for (const [id, fuente] of Object.entries(fuentesDelEstilo())) {
      if (!mapa.getSource(id)) mapa.addSource(id, fuente);
    }
    // Encima de todo lo dibujado (edificios incluidos) y debajo de los nombres que vienen después.
    const capas = mapa.getStyle().layers;
    const ultimaDibujada = capas.findLastIndex((c) => c.type !== "symbol");
    const nombres = capas.slice(ultimaDibujada + 1).find((c) => c.type === "symbol")?.id;
    if (!mapa.hasImage(`${PROPIO}flecha`)) mapa.addImage(`${PROPIO}flecha`, imagenFlecha(), { sdf: true, pixelRatio: 2 });
    for (const capa of capasPropias()) if (!mapa.getLayer(capa.id)) mapa.addLayer(capa, nombres);
    aplicarEstadoZonas();
    ajustarCiclovias();
  };
  // Al llegar el estilo (no hace falta esperar a las teselas) y cada vez que cambia: en modo
  // oscuro hay otro mapa base, y las capas propias se vuelven a poner con los colores nuevos.
  mapa.on("style.load", anadirPropias);
  // De lejos, los buses estimados son puntos; con zoom se lee su número.
  const ZOOM_NUMEROS = 13;
  const ajustarLejos = () => contenedor.classList.toggle("mapa-lejos", mapa.getZoom() < ZOOM_NUMEROS);
  mapa.on("zoomend", ajustarLejos);
  ajustarLejos();
  oscuro.addEventListener("change", () => mapa.setStyle(estiloActual(), { diff: false }));

  const poner = (nombre, datos) => {
    fuentes[nombre] = datos;
    mapa.getSource(`${PROPIO}${nombre}`)?.setData(datos);
  };

  // ---------- Recorridos que se dibujan solos ----------
  const animaciones = new Map();
  function trazar(nombre, features) {
    cancelAnimationFrame(animaciones.get(nombre));
    if (SIN_MOVIMIENTO || !features.length) {
      poner(nombre, coleccion(features));
      return;
    }
    const inicio = performance.now();
    const paso = (ahora) => {
      const f = suave(Math.min(1, (ahora - inicio) / DURACION_TRAZO));
      poner(
        nombre,
        coleccion(
          features.map((feat) => ({
            ...feat,
            geometry: { type: "MultiLineString", coordinates: lineasDe(feat).map((c) => cortar(c, f)) },
          })),
        ),
      );
      if (f < 1) animaciones.set(nombre, requestAnimationFrame(paso));
    };
    animaciones.set(nombre, requestAnimationFrame(paso));
  }

  const encuadrar = (limites, margen) => {
    if (limites) mapa.fitBounds(limites, { padding: margen, duration: SIN_MOVIMIENTO ? 0 : 900, maxZoom: 16 });
  };

  // ---------- Marcadores HTML ----------
  const etiquetaFlotante = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    className: "tooltip-gl",
    offset: 14,
    maxWidth: "280px",
  });
  function marcador(html, lngLat, { texto, clase = "", encima = false } = {}) {
    const nodo = document.createElement("div");
    nodo.className = `marca-gl ${clase}`;
    nodo.innerHTML = html;
    if (encima) nodo.style.zIndex = "2";
    if (texto) {
      // Con ratón, al pasar por encima; en el teléfono, al tocar (sin elegir ese punto del mapa).
      const ver = () => etiquetaFlotante.setLngLat(lngLat).setText(texto).addTo(mapa);
      nodo.addEventListener("mouseenter", ver);
      nodo.addEventListener("mouseleave", () => etiquetaFlotante.remove());
      nodo.addEventListener("click", (e) => {
        e.stopPropagation();
        ver();
      });
    } else {
      nodo.style.pointerEvents = "none";
    }
    return new maplibregl.Marker({ element: nodo }).setLngLat(lngLat);
  }

  for (const zona of zonas.features) {
    const { lat, lon } = puntoInterior(zona);
    marcador(`<span class="etiqueta-zona ${esLmv(zona) ? "lmv" : "mjs"}">${zona.properties.zona}</span>`, [lon, lat]).addTo(
      mapa,
    );
  }

  // Los días de la zona al pasar el ratón.
  mapa.on("mousemove", `${PROPIO}zonas-relleno`, (e) => {
    // MapLibre entrega las listas como texto: se usa la zona original.
    const p = zonas.features.find((z) => z.properties.zona === e.features[0].properties.zona)?.properties;
    if (!p) return;
    const dias = listar(p.dias_iso.map(nombreDia));
    mapa.getCanvas().style.cursor = "pointer";
    etiquetaFlotante
      .setLngLat(e.lngLat)
      .setText(t("zonaTooltip", { zona: p.zona, dias, desde: p.desde, hasta: horaLegible(p.hasta) }))
      .addTo(mapa);
  });
  mapa.on("mouseleave", `${PROPIO}zonas-relleno`, () => {
    mapa.getCanvas().style.cursor = "";
    etiquetaFlotante.remove();
  });
  // Pasar por una parada de la línea dice su nombre y hacia dónde va el bus desde ahí.
  const textoParada = (f) => t("paradaDeLinea", { parada: f.properties.nombre, destino: f.properties.hacia });
  mapa.on("mousemove", `${PROPIO}linea-paradas`, (e) => {
    mapa.getCanvas().style.cursor = "pointer";
    etiquetaFlotante.setLngLat(e.features[0].geometry.coordinates).setText(textoParada(e.features[0])).addTo(mapa);
  });
  mapa.on("mouseleave", `${PROPIO}linea-paradas`, () => {
    mapa.getCanvas().style.cursor = "";
    etiquetaFlotante.remove();
  });
  mapa.on("click", (e) => {
    etiquetaFlotante.remove();
    // Tocar una parada (en el teléfono) muestra su nombre en vez de elegir ese punto.
    const capa = `${PROPIO}linea-paradas`;
    const [parada] = mapa.getLayer(capa) ? mapa.queryRenderedFeatures(e.point, { layers: [capa] }) : [];
    if (parada) {
      etiquetaFlotante.setLngLat(parada.geometry.coordinates).setText(textoParada(parada)).addTo(mapa);
      return;
    }
    alElegir({ lat: e.lngLat.lat, lon: e.lngLat.lng });
  });

  let paradas = [];
  let rutaMarcas = [];
  let elegido = null;
  let movimiento = 0;
  const quitar = (lista) => {
    lista.forEach((m) => m.remove());
    return [];
  };

  // El punto elegido viaja de un lugar al otro en vez de saltar.
  function moverElegido(destino) {
    if (!elegido) {
      elegido = marcador('<span class="punto-elegido"></span>', destino, { clase: "pulso", encima: true }).addTo(mapa);
      return;
    }
    const origen = elegido.getLngLat().toArray();
    cancelAnimationFrame(movimiento);
    if (SIN_MOVIMIENTO) {
      elegido.setLngLat(destino);
      return;
    }
    const inicio = performance.now();
    const paso = (ahora) => {
      const f = suave(Math.min(1, (ahora - inicio) / 700));
      elegido.setLngLat([origen[0] + (destino[0] - origen[0]) * f, origen[1] + (destino[1] - origen[1]) * f]);
      if (f < 1) movimiento = requestAnimationFrame(paso);
    };
    movimiento = requestAnimationFrame(paso);
  }

  // ---------- Capas de movilidad ----------
  const grupos = { tranvia: [], bicis: [], carga: [] };
  const pendientes = new Map();
  function prepararCapas(bicicletas, estaciones) {
    if (estaciones) {
      grupos.tranvia = estaciones.features.map((f) =>
        marcador('<span class="marca-capa tranvia">T</span>', f.geometry.coordinates, {
          texto: t("tranviaEstacionMapa", { estacion: f.properties.nombre, hacia: listar(f.properties.hacia) }),
        }),
      );
    }
    if (bicicletas) {
      grupos.bicis = bicicletas.features.map((f) =>
        marcador(`<span class="marca-capa bici">${SVG_BICI}</span>`, f.geometry.coordinates, {
          texto: [f.properties.nombre, f.properties.capacidad ? t("bicicletaAnclajes", { n: f.properties.capacidad }) : null]
            .filter(Boolean)
            .join(" · "),
        }),
      );
    }
    pendientes.set("ciclovias", async () => poner("ciclovias", await cargarJson("movilidad/ciclovias.geojson")));
    pendientes.set("carga", async () => {
      const carga = await cargarJson("movilidad/carga.geojson");
      grupos.carga = carga.features.map((f) =>
        marcador(`<span class="marca-capa carga">${SVG_RAYO}</span>`, f.geometry.coordinates, {
          texto: [f.properties.nombre, textoAcceso(f.properties.acceso)].filter(Boolean).join(" · "),
        }),
      );
    });

    const opciones = [
      ...(estaciones ? [["tranvia", t("capaTranvia")]] : []),
      ["bicis", t("capaBicis")],
      ["ciclovias", t("capaCiclovias")],
      ["carga", t("capaCarga")],
    ];
    const control = document.createElement("details");
    control.className = "maplibregl-ctrl control-capas";
    control.innerHTML = `<summary aria-label="${t("capasMapa")}" title="${t("capasMapa")}">${SVG_CAPAS}</summary>`;
    const lista = document.createElement("div");
    const muestra = { tranvia: "tranvia", bicis: "bici", ciclovias: "ciclovia", carga: "carga" };
    for (const [clave, texto] of opciones) {
      const etiqueta = document.createElement("label");
      etiqueta.innerHTML = `<input type="checkbox" data-capa="${clave}"> <span class="muestra-capa ${muestra[clave]}"></span>${texto}`;
      lista.append(etiqueta);
    }
    control.append(lista);
    lista.addEventListener("change", (e) => cambiarCapa(e.target.dataset.capa, e.target.checked));
    mapa.addControl({ onAdd: () => control, onRemove: () => control.remove() }, "top-right");
    return control;
  }

  async function cambiarCapa(clave, ver) {
    if (ver) visibles.add(clave);
    else visibles.delete(clave);
    const cargar = pendientes.get(clave);
    if (ver && cargar) {
      pendientes.delete(clave);
      try {
        await cargar();
      } catch {
        pendientes.set(clave, cargar); // se reintentará la próxima vez
      }
    }
    if (clave === "ciclovias") ajustarCiclovias();
    else grupos[clave].forEach((m) => (visibles.has(clave) ? m.addTo(mapa) : m.remove()));
  }

  // ---------- Línea elegida: puntas, sentido y buses estimados ----------
  const panel = document.createElement("div");
  panel.className = "panel-linea";
  panel.hidden = true;
  contenedor.append(panel);
  let puntas = [];
  let recorridos = [];
  let busesMarcas = [];
  let reloj = 0;
  let lineaActual = null;
  let enRuta = false; // los buses de la opción de "¿qué bus me lleva?"

  function limpiarLinea() {
    cancelAnimationFrame(animaciones.get("linea"));
    poner("linea", vacio());
    poner("paradasLinea", vacio());
    clearInterval(reloj);
    cancelAnimationFrame(reloj);
    puntas = quitar(puntas);
    busesMarcas.forEach((bus) => bus.marca.remove());
    busesMarcas = [];
    recorridos = [];
    lineaActual = null;
    enRuta = false;
    panel.hidden = true;
    contenedor.classList.remove("con-linea");
    elegirSentido("ambos");
  }

  function elegirSentido(sentido) {
    sentidoVisible = sentido;
    if (mapa.getLayer(`${PROPIO}linea`)) {
      mapa.setFilter(`${PROPIO}linea`, filtroLinea(PRINCIPAL));
      mapa.setFilter(`${PROPIO}linea-alargue`, filtroLinea(ALARGUE));
      mapa.setFilter(`${PROPIO}linea-flechas`, filtroLinea(PRINCIPAL));
      mapa.setFilter(`${PROPIO}linea-paradas`, filtroLinea(["has", "sentido"]));
      mapa.setFilter(`${PROPIO}linea-paradas-nombre`, filtroLinea(["has", "sentido"]));
    }
    for (const b of panel.querySelectorAll("[data-sentido]")) {
      b.setAttribute("aria-pressed", String(b.dataset.sentido === sentido));
    }
    if (lineaActual) moverBuses();
  }

  function mostrarLinea(principales, { linea, horarios, tipo, paradas, alargues = [] }) {
    const de = (sentido) => principales.find((f) => f.properties.sentido === sentido);
    const [ida, retorno] = [de("ida"), de("retorno")];
    // Las paradas registradas de cada sentido, con el color de su sentido.
    poner(
      "paradasLinea",
      coleccion(
        [ida, retorno].filter(Boolean).flatMap((f) =>
          paradasDeRecorrido(f, paradas).map((p) => ({
            type: "Feature",
            properties: { nombre: p.nombre, sentido: f.properties.sentido, hacia: f.properties.hacia },
            geometry: { type: "Point", coordinates: [p.lon, p.lat] },
          })),
        ),
      ),
    );
    lineaActual = { linea, tipo, horarios };
    // A es donde empieza la ida (y termina el retorno); B, a donde va la ida.
    const extremos = ida ? puntosDeTrazado(ida.geometry) : [];
    if (extremos.length > 1) {
      const nombreA = retorno?.properties.hacia;
      const nombreB = ida.properties.hacia;
      for (const [letra, nombre, punto] of [
        ["A", nombreA, extremos[0]],
        ["B", nombreB, extremos.at(-1)],
      ]) {
        puntas.push(
          marcador(`<span class="punta-linea"><b>${letra}</b>${nombre ? ` ${escapar(nombre)}` : ""}</span>`, punto, {
            clase: "aparece",
          }).addTo(mapa),
        );
      }
    }
    recorridos = [ida, retorno].filter(Boolean).map((f) => {
      const medida = medirRecorrido(puntosDeTrazado(f.geometry));
      return {
        linea,
        sentido: f.properties.sentido,
        color: f.properties.sentido,
        hacia: f.properties.hacia,
        horario: horarios?.[f.properties.sentido],
        medida,
        largo: medida.total,
        hasta: 1,
      };
    });

    // El selector: los dos sentidos con su color, y la nota de los buses estimados.
    const botones = [["ambos", t("sentidoAmbos")]].concat(
      recorridos.map((r) => [r.sentido, t("sentidoHacia", { destino: r.hacia })]),
    );
    panel.replaceChildren();
    const grupo = document.createElement("div");
    grupo.className = "sentidos";
    grupo.setAttribute("role", "group");
    grupo.setAttribute("aria-label", t("sentidosLinea", { linea: tipo === "tranvia" ? t("tranvia") : linea }));
    for (const [sentido, texto] of botones) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.sentido = sentido;
      b.setAttribute("aria-pressed", String(sentido === "ambos"));
      if (sentido !== "ambos") {
        const muestra = document.createElement("i");
        muestra.className = `muestra-sentido ${sentido}`;
        b.append(muestra);
      }
      b.append(texto);
      b.addEventListener("click", () => elegirSentido(sentido));
      grupo.append(b);
    }
    const nota = document.createElement("p");
    nota.className = "nota-buses";
    panel.append(grupo);
    // El punteado son los alargues: solo algunos buses siguen hasta esos barrios.
    if (alargues.length) {
      const punteado = document.createElement("p");
      punteado.className = "nota-alargue";
      punteado.innerHTML = '<i class="muestra-alargue" aria-hidden="true"></i>';
      punteado.append(t("alarguesNota", { lugares: listar(alargues) }));
      panel.append(punteado);
    }
    panel.append(nota);
    panel.hidden = false;
    contenedor.classList.add("con-linea");

    if (tipo === "tranvia") {
      nota.hidden = true; // del tranvía no hay horario de salidas para estimar
      return;
    }
    arrancarBuses();
  }

  /**
   * Los buses de una opción de ruta: los de cada línea que se toma, en su sentido, desde
   * que salen hasta donde uno se baja, y cuánto falta para que el próximo llegue a la parada.
   */
  function mostrarBusesDeRuta(tramos) {
    recorridos = tramos.map((tramo) => ({
      linea: tramo.linea,
      sentido: tramo.sentido,
      color: "retorno", // del azul de la ruta dibujada
      hacia: tramo.hacia,
      horario: tramo.horario,
      medida: medirRecorrido(tramo.trazado),
      largo: tramo.largo,
      hasta: tramo.metrosBajada / tramo.largo,
      metrosSubida: tramo.metrosSubida,
    }));
    enRuta = true;
    const nota = document.createElement("p");
    nota.className = "nota-buses";
    panel.replaceChildren(nota);
    panel.hidden = false;
    contenedor.classList.add("con-linea");
    arrancarBuses();
  }

  function arrancarBuses() {
    moverBuses();
    if (SIN_MOVIMIENTO) {
      reloj = setInterval(() => !document.hidden && moverBuses(), CADA_BUSES_QUIETO_MS);
      return;
    }
    // Cuadro a cuadro: cada bus avanza de forma continua por su recorrido.
    const paso = () => {
      moverBuses();
      reloj = requestAnimationFrame(paso);
    };
    reloj = requestAnimationFrame(paso);
  }

  function marcaDeBus() {
    const nodo = document.createElement("div");
    nodo.className = "bus-estimado";
    nodo.innerHTML = `<span class="bus-pulso"></span>${SVG_GOTA}${SVG_GLIFO}<span class="bus-numero"></span>`;
    // El centro de la gota (no el del marcador, que incluye el número) cae sobre la calle.
    const marca = new maplibregl.Marker({ element: nodo, offset: [0, 3] });
    const ver = () => etiquetaFlotante.setLngLat(marca.getLngLat()).setText(nodo.dataset.texto).addTo(mapa);
    nodo.addEventListener("mouseenter", ver);
    nodo.addEventListener("mouseleave", () => etiquetaFlotante.remove());
    nodo.addEventListener("click", (e) => {
      e.stopPropagation();
      ver();
    });
    return { marca, puesta: false };
  }

  /** Pone cada bus donde va ahora según el horario, y dice cuántos hay en camino. */
  function moverBuses() {
    if (!enRuta && (!lineaActual || lineaActual.tipo === "tranvia")) return;
    const ahora = new Date();
    const posiciones = [];
    for (const r of recorridos) {
      if (!enRuta && sentidoVisible !== "ambos" && sentidoVisible !== r.sentido) continue;
      for (const metros of busesEnCamino(r.horario, r.largo, ahora)) {
        const fraccion = metros / r.largo;
        if (fraccion > r.hasta) continue; // en una ruta, solo hasta donde uno se baja
        posiciones.push({ ...puntoEnRecorrido(r.medida, fraccion * r.medida.total), r });
      }
    }
    while (busesMarcas.length < posiciones.length) busesMarcas.push(marcaDeBus());
    busesMarcas.forEach((bus, i) => {
      const p = posiciones[i];
      if (!p) {
        bus.marca.remove();
        bus.puesta = false;
        return;
      }
      const nodo = bus.marca.getElement();
      nodo.style.setProperty("--rumbo", `${p.rumbo}deg`);
      bus.marca.setLngLat([p.lon, p.lat]);
      // El resto solo cambia cuando el marcador pasa a otro bus.
      if (bus.de !== p.r) {
        bus.de = p.r;
        nodo.classList.toggle("retorno", p.r.color === "retorno");
        nodo.querySelector(".bus-numero").textContent = p.r.linea;
        nodo.dataset.texto = t("busEstimado", { linea: p.r.linea, destino: p.r.hacia });
      }
      if (!bus.puesta) {
        bus.marca.addTo(mapa);
        bus.puesta = true;
      }
    });
    const nota = panel.querySelector(".nota-buses");
    if (enRuta) {
      // Lo que importa en una ruta: cuándo llega el próximo bus a la parada.
      const [primero] = recorridos;
      const faltan = minutosAlProximo(primero.horario, primero.largo, primero.metrosSubida, ahora);
      const texto =
        faltan === null
          ? t("rutaSinBusAhora", { linea: primero.linea })
          : faltan < 1.5
            ? t("rutaProximoBusYa", { linea: primero.linea })
            : t("rutaProximoBus", { linea: primero.linea, minutos: Math.round(faltan) });
      if (nota.textContent !== texto) nota.textContent = texto;
      return;
    }
    const sinHorario = recorridos.every((r) => r.horario === undefined);
    const texto = sinHorario
      ? t("busesSinHorario")
      : posiciones.length === 0
        ? t("busesSinServicio")
        : posiciones.length === 1
          ? t("busesEnCaminoUno")
          : t("busesEnCamino", { n: posiciones.length });
    if (nota.textContent !== texto) nota.textContent = texto;
  }

  let control = null;

  return {
    agregarCapas(bicicletas, estaciones) {
      control = prepararCapas(bicicletas, estaciones);
    },
    mostrarCapa(clave) {
      const casilla = control?.querySelector(`[data-capa="${clave}"]`);
      if (!casilla || casilla.checked) return;
      casilla.checked = true;
      cambiarCapa(clave, true);
    },
    /** Dibuja una o varias calles y encuadra el mapa en ellas. */
    resaltar(calles) {
      etiquetaFlotante.remove();
      limpiarLinea();
      paradas = quitar(paradas);
      elegido?.remove();
      elegido = null;
      trazar("calles", calles);
      encuadrar(caja(calles), 30);
    },
    /**
     * Dibuja una línea (o la quita con null): cada sentido con su color y sus flechas, las
     * puntas A y B, un selector de sentido y los buses en camino, estimados con el horario.
     */
    resaltarLinea(trazados, { linea, horarios, tipo, paradas } = {}) {
      etiquetaFlotante.remove();
      limpiarLinea();
      if (!trazados) return;
      const principales = trazados.filter((t) => t.properties.tipo !== "alargue");
      trazar("linea", trazados);
      const alargues = [
        ...new Set(trazados.filter((t) => t.properties.tipo === "alargue").map((t) => t.properties.hacia)),
      ].filter(Boolean);
      mostrarLinea(principales, { linea, horarios, tipo, paradas, alargues });
      // Que el selector de sentido no tape el final del recorrido.
      encuadrar(caja(principales.length ? principales : trazados), {
        top: 40,
        right: 40,
        left: 40,
        bottom: panel.offsetHeight + 40,
      });
    },
    /** Dibuja una opción de "¿qué bus me lleva?": tramos a pie punteados y en bus llenos. */
    dibujarRuta(opcion, destino) {
      etiquetaFlotante.remove();
      rutaMarcas = quitar(rutaMarcas);
      limpiarLinea();
      poner("rutaPie", vacio());
      poner("rutaBus", vacio());
      if (!opcion) return;
      const pie = [];
      const bus = [];
      for (const t of opcion.tramos) {
        if (t.modo === "caminar") {
          if (t.metros < 5) continue;
          pie.push({
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [[t.desde.lon, t.desde.lat], [t.hasta.lon, t.hasta.lat]] },
          });
        } else {
          bus.push({ type: "Feature", properties: { tipo: t.tipo }, geometry: { type: "LineString", coordinates: t.coords } });
          rutaMarcas.push(
            marcador(`<span class="etiqueta-ruta">${t.tipo === "tranvia" ? "T" : t.linea}</span>`, [t.subida.lon, t.subida.lat], {
              clase: "aparece",
            }).addTo(mapa),
          );
        }
      }
      rutaMarcas.push(
        marcador('<span class="punto-destino"></span>', [destino.lon, destino.lat], { clase: "aparece", encima: true }).addTo(mapa),
      );
      poner("rutaPie", coleccion(pie));
      trazar("rutaBus", bus);
      const conHorario = opcion.tramos.filter((t) => t.modo === "bus" && t.tipo !== "tranvia" && t.horario && t.largo > 0);
      if (conHorario.length) mostrarBusesDeRuta(conHorario);
      encuadrar(caja([...pie, ...bus], [[destino.lon, destino.lat]]), {
        top: 40,
        right: 40,
        left: 40,
        bottom: (panel.hidden ? 0 : panel.offsetHeight) + 40,
      });
    },
    mostrar(punto, zona, cercanas) {
      etiquetaFlotante.remove();
      poner("calles", vacio());
      limpiarLinea();
      poner("rutaPie", vacio());
      poner("rutaBus", vacio());
      rutaMarcas = quitar(rutaMarcas);
      estadoZonas = { elegida: zona ? zona.properties.zona : null };
      aplicarEstadoZonas();
      paradas = quitar(paradas);
      cercanas.forEach((parada, i) => {
        const m = marcador(`<span class="etiqueta-parada">${i + 1}</span>`, [parada.lon, parada.lat], {
          texto: nombreParada(parada),
          clase: "aparece",
        });
        m.getElement().style.setProperty("--retraso", `${300 + i * 70}ms`);
        paradas.push(m.addTo(mapa));
      });
      const destino = [punto.lon, punto.lat];
      moverElegido(destino);
      const zoom = Math.max(mapa.getZoom(), ZOOM_PUNTO);
      if (SIN_MOVIMIENTO) mapa.jumpTo({ center: destino, zoom });
      else mapa.flyTo({ center: destino, zoom, speed: 1.4, curve: 1.42, essential: false });
    },
  };
}
