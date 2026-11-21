// El mapa de Morlaco, vectorial, con MapLibre GL: lo dibuja la tarjeta gráfica, así que el
// zoom es continuo y los recorridos se trazan con una animación (sin movimiento si la persona
// lo pidió así). app.js solo usa lo que devuelve `crearMapa`: mostrar, resaltar,
// resaltarLinea, dibujarRuta, agregarCapas y mostrarCapa.

import { CENTRO_CUENCA, LIMITES_CUENCA, horaDentroDe, horaLegible, nombreDia, nombreParada, puntoEnGeometria } from "./logica.js";
import { paradasDeRecorrido, variantesDeLinea } from "./rutas.js";
import { listar, t } from "./textos.js";
import { busesEnCamino, medirRecorrido, minutosAlProximo, puntoEnRecorrido, puntosDeTrazado } from "./vehiculos.js";

// MapLibre se carga en index.html, con versión fija y hash de integridad.
// Mapas vectoriales de OpenFreeMap, hechos con datos de OpenStreetMap: sin clave ni cuenta.
const ESTILOS = {
  claro: "https://tiles.openfreemap.org/styles/positron",
  oscuro: "https://tiles.openfreemap.org/styles/dark",
};
// El mapa base de OpenFreeMap con colores propios: parques verdes, el Tomebamba y los otros
// ríos en celeste, calles blancas y avenidas con borde. Las teselas son las mismas.
const PALETA_BASE = {
  claro: {
    fondo: "#eef0ec", residencial: "#e8eae5", parque: "#cfe5c4", bosque: "#c2dcb5", agua: "#a9d3e0", rio: "#97c6d6",
    edificio: "#e1e2db", edificioBorde: "#d2d3cb", calle: "#ffffff", avenida: "#ffffff", avenidaBorde: "#c3c8c0",
    autopista: "#fbe4a6", autopistaBorde: "#e3c47c", tenue: "#d9dcd5", tren: "#c7cbc3",
    textoCalle: "#5b6570", textoLugar: "#2e3944", textoAgua: "#3d7088", halo: "#ffffff",
    // Lugares para orientarse: iglesias, salud, mercados, parques y lo demás (museos, colegios).
    iglesia: "#6d5a96", salud: "#c2410c", mercado: "#a16207", verde: "#3f7d3a", otro: "#4b6584",
    // Suelo: parques de la ciudad, canchas, centros educativos y de salud, cementerios.
    pasto: "#d6ebcb", cancha: "#c6e3b8", educacion: "#efe9dd", hospital: "#f5e4e1", cementerio: "#dde6d6",
  },
  oscuro: {
    fondo: "#121821", residencial: "#151c26", parque: "#17291f", bosque: "#193123", agua: "#1c4560", rio: "#2a6182",
    edificio: "#1b2330", edificioBorde: "#232d3b", calle: "#242e3c", avenida: "#2f3a4a", avenidaBorde: "#19212c",
    autopista: "#4c4129", autopistaBorde: "#2d2719", tenue: "#242e3c", tren: "#2a3442",
    textoCalle: "#a3afbd", textoLugar: "#b9c3cf", textoAgua: "#6fa6c2", halo: "#121821",
    iglesia: "#b4a4dc", salud: "#fb9a6c", mercado: "#e7b75a", verde: "#8fcf87", otro: "#9fb3cc",
    pasto: "#172a20", cancha: "#1a3123", educacion: "#1d2129", hospital: "#261c22", cementerio: "#18241d",
  },
};
// Niveles de MapLibre (teselas de 512 px): 12 muestra la ciudad entera.
const ZOOM_INICIAL = 12;
// Desde aquí las paradas de una línea dejan de ser puntos y se ven como letreros de parada.
const ZOOM_LETRERO = 14.5;
const ZOOM_MINIMO = 10;
const ZOOM_PUNTO = 14.5;
const DURACION_TRAZO = 900;
// Arriba y a los lados quedan los botones del mapa (44 px): el trazo no debe quedar debajo.
const MARGEN_TRAZO = { top: 70, right: 64, left: 64 };
const SEPARACION_SENTIDOS = 3.5; // px: cada sentido va a su derecha, como en la calle
const CADA_BUSES_QUIETO_MS = 15000; // si se pidió reducir el movimiento: a saltos, sin animar
// El marcador de un bus: una gota que apunta al norte (el marcador la gira según el rumbo)
// y, encima, un bus visto de lado que no gira. Dibujos propios.
const SVG_GOTA =
  '<svg class="bus-gota" viewBox="0 0 40 48" aria-hidden="true"><path d="M20 3 L30.2 17.9 A13 13 0 1 1 9.8 17.9 Z" fill="var(--color-bus)" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg>';
const SVG_GLIFO =
  '<svg class="bus-glifo" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="12" rx="3" fill="currentColor"/><rect x="4" y="7.3" width="3.6" height="3.8" rx=".8" fill="var(--color-bus)"/><rect x="8.6" y="7.3" width="3.6" height="3.8" rx=".8" fill="var(--color-bus)"/><rect x="13.2" y="7.3" width="3.6" height="3.8" rx=".8" fill="var(--color-bus)"/><rect x="17.8" y="7.3" width="2.6" height="6.5" rx=".8" fill="var(--color-bus)"/><rect x="2" y="13.6" width="20" height="1" fill="var(--color-bus)" opacity=".45"/><circle cx="7" cy="17.4" r="2.3" fill="currentColor" stroke="var(--color-bus)" stroke-width="1.3"/><circle cx="17" cy="17.4" r="2.3" fill="currentColor" stroke="var(--color-bus)" stroke-width="1.3"/></svg>';
const PROPIO = "m-"; // prefijo de las fuentes y capas de Morlaco, para conservarlas al cambiar de estilo

// El bus de frente de los letreros de parada (relleno, para que se lea en tamaño pequeño).
const SVG_PARADA =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="15" rx="3.5" fill="currentColor"/><rect x="7.2" y="5.4" width="9.6" height="5.4" rx="1.4" fill="var(--fondo-parada)"/><circle cx="8.6" cy="14.3" r="1.2" fill="var(--fondo-parada)"/><circle cx="15.4" cy="14.3" r="1.2" fill="var(--fondo-parada)"/><rect x="6" y="18" width="3.4" height="3" rx="1" fill="currentColor"/><rect x="14.6" y="18" width="3.4" height="3" rx="1" fill="currentColor"/></svg>';
export const SVG_BICI =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l2 7M14 6h3"/></svg>';
// La cruz de las farmacias.
const SVG_CRUZ = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z" fill="currentColor"/></svg>';
const SVG_RAYO =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M13.5 2.5 5 13.5h6.2l-1 8 8.8-11h-6.3z"/></svg>';
const SVG_AMPLIAR =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg>';
const SVG_CERRAR =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19" /></svg>';
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

/**
 * El letrero de una parada, como los de la calle: un cuadro del color del sentido, con
 * borde y un bus de frente que contrastan con él (blancos en el modo claro, oscuros en el
 * oscuro). Se dibuja al doble para pantallas nítidas.
 */
function imagenParada(fondo, figura, borde) {
  const n = 44;
  const lienzo = document.createElement("canvas");
  lienzo.width = lienzo.height = n;
  const g = lienzo.getContext("2d");
  const cuadro = (x, y, ancho, alto, radio) => {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, ancho, alto, radio);
    else g.rect(x, y, ancho, alto);
    g.fill();
  };
  g.fillStyle = borde;
  cuadro(1, 1, n - 2, n - 2, 12);
  g.fillStyle = fondo;
  cuadro(4.5, 4.5, n - 9, n - 9, 8.5);
  // El bus: carrocería, parabrisas, faros y ruedas.
  g.fillStyle = figura;
  cuadro(12.5, 10, 19, 20, 4.5);
  cuadro(14, 30, 4.5, 4, 1.5);
  cuadro(25.5, 30, 4.5, 4, 1.5);
  g.fillStyle = fondo;
  cuadro(15, 13, 14, 7.5, 2);
  cuadro(15.5, 24, 3, 3, 1.5);
  cuadro(25.5, 24, 3, 3, 1.5);
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

const METODOS = ["agregarCapas", "mostrarCapa", "resaltar", "resaltarLinea", "dibujarRuta", "mostrar", "mostrarFarmacias", "verFarmacia", "marcarHoy", "olvidar"];

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

// Claro u oscuro: el modo elegido con el botón de la barra (tema.js) o, si no, el del dispositivo.
const modoSistema = window.matchMedia("(prefers-color-scheme: dark)");
const esOscuro = () => window.morlacoTema?.oscuro() ?? modoSistema.matches;
const estiloActual = () => (esOscuro() ? ESTILOS.oscuro : ESTILOS.claro);

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

async function montar(contenedor, zonas, alElegir, { cargarJson, sinMovimiento, centro = null }) {
  const SIN_MOVIMIENTO = sinMovimiento;
  const maplibregl = await cargarBiblioteca();
  const { sur, oeste, norte, este } = LIMITES_CUENCA;
  const mapa = new maplibregl.Map({
    container: contenedor,
    style: estiloActual(),
    // Al abrir con una calle ya elegida, el mapa nace en ella: sin pasar por la ciudad entera.
    center: centro ? [centro.lon, centro.lat] : [CENTRO_CUENCA.lon, CENTRO_CUENCA.lat],
    zoom: centro ? ZOOM_PUNTO : ZOOM_INICIAL,
    minZoom: ZOOM_MINIMO,
    maxBounds: [
      [oeste, sur],
      [este, norte],
    ],
    attributionControl: { compact: true },
    // En el celular el mapa queda en medio de la página: con un dedo se sigue bajando por
    // ella y con dos se mueve el mapa (tocar para elegir un punto sigue igual). Para moverlo
    // con un dedo está "Ampliar", que lo pone a pantalla completa.
    locale: {
      "CooperativeGesturesHandler.WindowsHelpText": t("gestoTeclaWindows"),
      "CooperativeGesturesHandler.MacHelpText": t("gestoTeclaMac"),
      "CooperativeGesturesHandler.MobileHelpText": t("gestoDosDedos"),
    },
    dragRotate: false,
    pitchWithRotate: false,
    fadeDuration: SIN_MOVIMIENTO ? 0 : 300,
  });
  mapa.touchZoomRotate.disableRotation();
  const angosto = window.matchMedia("(max-width: 899px)");
  let amplio = false; // a pantalla completa (solo en el celular)
  // Cómo volver a encuadrar la línea o la ruta que se está mirando, si hay una.
  let reencuadre = null;
  const ajustarGestos = () =>
    angosto.matches && !amplio ? mapa.cooperativeGestures.enable() : mapa.cooperativeGestures.disable();
  ajustarGestos();
  angosto.addEventListener("change", ajustarGestos);
  // Los créditos empiezan plegados (se abren con la "i"): abiertos, en el celular tapaban
  // el aviso de los buses.
  // MapLibre los vuelve a abrir solo (al cambiar el tamaño o al llegar datos): quedan abiertos
  // únicamente si la persona tocó la "i".
  let creditosPedidos = false;
  const plegarCreditos = () => {
    const creditos = contenedor.querySelector(".maplibregl-ctrl-attrib");
    creditos?.classList.remove("maplibregl-compact-show");
    creditos?.removeAttribute("open");
  };
  contenedor.addEventListener(
    "click",
    (e) => {
      if (e.target.closest(".maplibregl-ctrl-attrib-button")) creditosPedidos = !creditosPedidos;
    },
    true,
  );
  mapa.once("load", () => {
    plegarCreditos();
    const creditos = contenedor.querySelector(".maplibregl-ctrl-attrib");
    if (!creditos) return;
    new MutationObserver(() => {
      const abiertos = creditos.hasAttribute("open") || creditos.classList.contains("maplibregl-compact-show");
      if (abiertos && !creditosPedidos) plegarCreditos();
    }).observe(creditos, { attributes: true, attributeFilter: ["open", "class"] });
  });
  mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

  // ---------- A pantalla completa (celular) ----------
  // Como en las apps de mapas: ampliado, el mapa ocupa toda la pantalla y se mueve con un
  // dedo. Se cierra con su botón, con Escape o con el botón "atrás" del teléfono (por eso se
  // anota en el historial).
  const seccion = contenedor.parentElement;
  const botonAmpliar = document.createElement("button");
  botonAmpliar.type = "button";
  botonAmpliar.className = "maplibregl-ctrl boton-ampliar";
  const pintarAmpliar = () => {
    botonAmpliar.innerHTML = `${amplio ? SVG_CERRAR : SVG_AMPLIAR}<span>${t(amplio ? "mapaCerrar" : "mapaAmpliar")}</span>`;
    botonAmpliar.setAttribute("aria-label", t(amplio ? "mapaCerrarAria" : "mapaAmpliarAria"));
  };
  const ponerAmplio = (si) => {
    if (si === amplio || !seccion) return;
    // Al cambiar de tamaño, la línea o la ruta elegida se vuelve a encuadrar para que llene
    // el mapa; sin ninguna, el punto que se estaba mirando sigue en el centro.
    const centroAntes = mapa.getCenter();
    amplio = si;
    seccion.classList.toggle("mapa-amplio", si);
    document.documentElement.classList.toggle("con-mapa-amplio", si);
    pintarAmpliar();
    ajustarGestos();
    mapa.resize();
    if (reencuadre) reencuadre();
    else mapa.setCenter(centroAntes);
  };
  const cerrarAmplio = () => {
    // Con la anotación en el historial, se vuelve atrás y el "popstate" lo cierra.
    if (history.state?.mapaAmplio) history.back();
    else ponerAmplio(false);
  };
  botonAmpliar.addEventListener("click", () => {
    if (amplio) return cerrarAmplio();
    ponerAmplio(true);
    history.pushState({ ...history.state, mapaAmplio: true }, "");
  });
  window.addEventListener("popstate", () => {
    if (!amplio) return;
    ponerAmplio(false);
    // La página deja en la dirección el punto de ahora (pudo cambiar con el mapa ampliado).
    window.dispatchEvent(new Event("morlaco:mapa-cerrado"));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && amplio) cerrarAmplio();
  });
  angosto.addEventListener("change", () => {
    if (!angosto.matches && amplio) cerrarAmplio();
  });
  pintarAmpliar();
  mapa.addControl({ onAdd: () => botonAmpliar, onRemove: () => botonAmpliar.remove() }, "top-left");

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
    tranvia: vacio(),
  };
  const transicion = { duration: SIN_MOVIMIENTO ? 0 : 450 };
  const visibles = new Set();
  const verCiclovias = () => (visibles.has("ciclovias") ? "visible" : "none");
  const verTranvia = () => (visibles.has("tranvia") ? "visible" : "none");

  // Ida en azul cúpula y retorno en púrpura punteado; se puede ver un solo sentido.
  const PRINCIPAL = ["!=", ["get", "tipo"], "alargue"];
  const IDA = ["all", PRINCIPAL, ["!=", ["get", "sentido"], "retorno"]];
  const RETORNO = ["all", PRINCIPAL, ["==", ["get", "sentido"], "retorno"]];
  const ALARGUE = ["==", ["get", "tipo"], "alargue"];
  let sentidoVisible = "ambos";
  const filtroLinea = (base) =>
    sentidoVisible === "ambos" ? base : ["all", base, ["==", ["get", "sentido"], sentidoVisible]];
  const colorSentido = () => ["match", ["get", "sentido"], "retorno", color("--sentido-retorno"), color("--sentido-ida")];

  // Con una ruta o una línea a la vista, las zonas de recolección quedan solo como contorno
  // gris discontinuo: su relleno le quitaba contraste al trazo.
  let zonasDiscretas = false;
  const aplicarZonas = () => {
    if (!mapa.getLayer(`${PROPIO}zonas-relleno`)) return;
    const normal = capasPropias();
    const de = (id) => normal.find((c) => c.id === `${PROPIO}${id}`).paint;
    mapa.setPaintProperty(`${PROPIO}zonas-relleno`, "fill-opacity", zonasDiscretas ? 0 : de("zonas-relleno")["fill-opacity"]);
    const borde = de("zonas-borde");
    mapa.setPaintProperty(`${PROPIO}zonas-borde`, "line-color", zonasDiscretas ? color("--linea-campo") : borde["line-color"]);
    mapa.setPaintProperty(`${PROPIO}zonas-borde`, "line-opacity", zonasDiscretas ? 0.4 : borde["line-opacity"]);
    mapa.setPaintProperty(`${PROPIO}zonas-borde`, "line-width", zonasDiscretas ? 1.2 : borde["line-width"]);
    mapa.setPaintProperty(`${PROPIO}zonas-borde`, "line-dasharray", zonasDiscretas ? [3, 3] : null);
    contenedor.classList.toggle("zonas-discretas", zonasDiscretas);
  };
  const discretas = (si) => {
    zonasDiscretas = si;
    aplicarZonas();
  };

  // Las paradas van encima de todos los trazos, también del de la ruta.
  const CAPAS_ENCIMA = ["linea-paradas", "linea-paradas-nombre", "linea-paradas-letrero"].map((c) => `${PROPIO}${c}`);
  const encimaAlFinal = (capas) => [
    ...capas.filter((c) => !CAPAS_ENCIMA.includes(c.id)),
    ...CAPAS_ENCIMA.map((id) => capas.find((c) => c.id === id)),
  ];
  // Se vuelven a pedir los colores cada vez: cambian con el modo oscuro.
  const capasPropias = () => encimaAlFinal([
    {
      id: `${PROPIO}zonas-relleno`,
      type: "fill",
      source: `${PROPIO}zonas`,
      paint: {
        "fill-color": ["case", ["get", "lmv"], color("--cupula"), color("--tomebamba")],
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "elegida"], false],
          0.18, /* el borde de 3 px ya la marca; así no tapa las calles */
          ["boolean", ["feature-state", "atenuada"], false],
          0.07,
          // Sin calle elegida, las zonas donde hoy pasa el recolector resaltan sobre las demás.
          ["boolean", ["feature-state", "hoy"], false],
          0.3,
          0.1,
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
      // El recorrido del tranvía, debajo de sus estaciones, cuando se pide esa capa.
      id: `${PROPIO}tranvia-borde`,
      type: "line",
      source: `${PROPIO}tranvia`,
      layout: { visibility: verTranvia(), "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color("--superficie"), "line-width": 7 },
    },
    {
      id: `${PROPIO}tranvia`,
      type: "line",
      source: `${PROPIO}tranvia`,
      layout: { visibility: verTranvia(), "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color("--tranvia"), "line-width": 4 },
    },
    {
      id: `${PROPIO}calles`,
      type: "line",
      source: `${PROPIO}calles`,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color("--cupula-hondo"), "line-width": 6, "line-opacity": 0.85 },
    },
    {
      // Un borde del color del fondo debajo de cada sentido: la línea se despega del mapa.
      id: `${PROPIO}linea-borde`,
      type: "line",
      source: `${PROPIO}linea`,
      filter: filtroLinea(PRINCIPAL),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color("--superficie"), "line-width": 7, "line-offset": SEPARACION_SENTIDOS },
    },
    {
      id: `${PROPIO}linea`,
      type: "line",
      source: `${PROPIO}linea`,
      filter: filtroLinea(IDA),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": colorSentido(), "line-width": 4, "line-opacity": 0.9, "line-offset": SEPARACION_SENTIDOS },
    },
    {
      id: `${PROPIO}linea-retorno`,
      type: "line",
      source: `${PROPIO}linea`,
      filter: filtroLinea(RETORNO),
      layout: { "line-join": "round" },
      paint: {
        "line-color": colorSentido(),
        "line-width": 4,
        "line-opacity": 0.9,
        "line-offset": SEPARACION_SENTIDOS,
        "line-dasharray": [2, 1.2],
      },
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
      maxzoom: ZOOM_LETRERO,
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
        "text-offset": [0, 1.4],
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
      // Encima de las flechas, para que no tapen el letrero.
      id: `${PROPIO}linea-paradas-letrero`,
      type: "symbol",
      source: `${PROPIO}paradasLinea`,
      minzoom: ZOOM_LETRERO,
      filter: filtroLinea(["has", "sentido"]),
      layout: {
        "icon-image": ["match", ["get", "sentido"], "retorno", `${PROPIO}parada-retorno`, `${PROPIO}parada-ida`],
        "icon-size": ["interpolate", ["linear"], ["zoom"], ZOOM_LETRERO, 0.95, 17, 1.2],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    },
    {
      id: `${PROPIO}ruta-pie`,
      type: "line",
      source: `${PROPIO}rutaPie`,
      layout: { "line-cap": "round" },
      paint: { "line-color": color("--tinta-suave"), "line-width": 3, "line-dasharray": [0.1, 2.4] },
    },
    {
      id: `${PROPIO}ruta-bus-borde`,
      type: "line",
      source: `${PROPIO}rutaBus`,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color("--superficie"), "line-width": ["interpolate", ["linear"], ["zoom"], 12, 7, 17, 11] },
    },
    {
      id: `${PROPIO}ruta-bus`,
      type: "line",
      source: `${PROPIO}rutaBus`,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["case", ["==", ["get", "tipo"], "tranvia"], color("--tranvia"), color("--cupula-hondo")],
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 4.5, 17, 7],
      },
    },
  ]);
  const fuentesDelEstilo = () =>
    Object.fromEntries(
      Object.entries(fuentes).map(([nombre, datos]) => [
        `${PROPIO}${nombre}`,
        { type: "geojson", data: datos, ...(nombre === "zonas" ? { promoteId: "zona" } : {}) },
      ]),
    );

  let estadoZonas = { elegida: null };
  let zonasDeHoy = new Set(); // donde hoy pasa el recolector: se ven más llenas en la portada
  const aplicarEstadoZonas = () => {
    if (!mapa.getSource(`${PROPIO}zonas`)) return;
    for (const z of zonas.features) {
      const id = z.properties.zona;
      mapa.setFeatureState(
        { source: `${PROPIO}zonas`, id },
        {
          elegida: id === estadoZonas.elegida,
          atenuada: estadoZonas.elegida !== null && id !== estadoZonas.elegida,
          hoy: zonasDeHoy.has(String(id)),
        },
      );
    }
  };
  // Las separadas van llenas y los carriles punteados.
  const ajustarCiclovias = () => {
    for (const id of ["ciclovias", "ciclovias-carril"]) {
      if (mapa.getLayer(`${PROPIO}${id}`)) mapa.setLayoutProperty(`${PROPIO}${id}`, "visibility", verCiclovias());
    }
    for (const id of ["tranvia", "tranvia-borde"]) {
      if (mapa.getLayer(`${PROPIO}${id}`)) mapa.setLayoutProperty(`${PROPIO}${id}`, "visibility", verTranvia());
    }
  };

  /**
   * Parques, iglesias, mercados, hospitales y otros sitios conocidos, con su nombre al acercar:
   * así uno se ubica ("a dos cuadras de San Blas") sin leer cada calle. Vienen en las mismas
   * teselas del mapa base (OpenStreetMap).
   */
  const capasDeLugares = () => {
    const base = mapa.getStyle().sources;
    const fuente = Object.keys(base).find((nombre) => base[nombre].type === "vector");
    if (!fuente) return [];
    const c = esOscuro() ? PALETA_BASE.oscuro : PALETA_BASE.claro;
    const tipo = [
      "case",
      ["==", ["get", "subclass"], "marketplace"], "mercado",
      ["match", ["get", "class"], ["place_of_worship"], true, false], "iglesia",
      ["match", ["get", "class"], ["hospital", "doctors", "pharmacy"], true, false], "salud",
      ["match", ["get", "class"], ["park", "garden"], true, false], "verde",
      "otro",
    ];
    const colorTipo = ["match", tipo, "mercado", c.mercado, "iglesia", c.iglesia, "salud", c.salud, "verde", c.verde, c.otro];
    // Solo lugares que sirven de referencia; los consultorios y tiendas llenarían el mapa.
    const filtro = [
      "all",
      ["has", "name"],
      [
        "any",
        ["==", ["get", "subclass"], "marketplace"],
        ["match", ["get", "class"], ["place_of_worship", "park", "museum", "town_hall", "stadium"], true, false],
        ["all", ["==", ["get", "class"], "hospital"], ["==", ["get", "subclass"], "hospital"]],
      ],
    ];
    // El punto va dentro del mismo texto: si el nombre no cabe, no queda un punto suelto.
    return [
      {
        id: `${PROPIO}lugares-nombre`,
        type: "symbol",
        source: fuente,
        "source-layer": "poi",
        minzoom: 15,
        filter: filtro,
        layout: {
          "text-field": ["format", "● ", { "font-scale": 0.9 }, ["get", "name"], {}],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 15, 11, 18, 13],
          "text-anchor": "left",
          "text-offset": [-0.4, 0],
          "text-max-width": 10,
          "text-padding": 4,
        },
        paint: { "text-color": colorTipo, "text-halo-color": c.halo, "text-halo-width": 1.4 },
      },
    ];
  };

  /**
   * Lo que el mapa base deja en blanco: el verde de los parques de la ciudad (Parque Calderón,
   * El Paraíso, las orillas de los ríos), las canchas y, en tonos apenas visibles, escuelas,
   * universidades, hospitales y cementerios. Va debajo de calles y edificios.
   */
  const capasDeSuelo = () => {
    const base = mapa.getStyle().sources;
    const fuente = Object.keys(base).find((nombre) => base[nombre].type === "vector");
    if (!fuente) return [];
    const c = esOscuro() ? PALETA_BASE.oscuro : PALETA_BASE.claro;
    return [
      {
        id: `${PROPIO}suelo-usos`,
        type: "fill",
        source: fuente,
        "source-layer": "landuse",
        filter: ["match", ["get", "class"], ["school", "university", "college", "kindergarten", "hospital", "cemetery", "pitch", "playground", "stadium", "grass"], true, false],
        paint: {
          "fill-color": [
            "match",
            ["get", "class"],
            ["school", "university", "college", "kindergarten"], c.educacion,
            "hospital", c.hospital,
            "cemetery", c.cementerio,
            ["pitch", "playground", "stadium"], c.cancha,
            c.pasto,
          ],
        },
      },
      {
        id: `${PROPIO}suelo-verde`,
        type: "fill",
        source: fuente,
        "source-layer": "landcover",
        filter: ["==", ["get", "class"], "grass"],
        paint: { "fill-color": c.pasto },
      },
    ];
  };

  /** Pinta el mapa base con la paleta de Morlaco, capa por capa según lo que dibuja cada una. */
  const pintarBase = () => {
    const c = esOscuro() ? PALETA_BASE.oscuro : PALETA_BASE.claro;
    const pintar = (id, propiedad, valor) => {
      try {
        mapa.setPaintProperty(id, propiedad, valor);
      } catch {
        // Una capa que el estilo ya no trae: se deja como viene.
      }
    };
    for (const capa of mapa.getStyle().layers) {
      const { id, type } = capa;
      const fuente = capa["source-layer"];
      if (type === "background") pintar(id, "background-color", c.fondo);
      else if (type === "fill") {
        if (fuente === "park" || id.includes("park")) pintar(id, "fill-color", c.parque);
        else if (id.includes("wood")) pintar(id, "fill-color", c.bosque);
        else if (fuente === "water") pintar(id, "fill-color", c.agua);
        else if (id.includes("residential") || id === "aeroway-area") pintar(id, "fill-color", c.residencial);
        else if (fuente === "building") {
          pintar(id, "fill-color", c.edificio);
          pintar(id, "fill-outline-color", c.edificioBorde);
        } else if (id.includes("pier")) pintar(id, "fill-color", c.fondo);
      } else if (type === "line") {
        if (fuente === "waterway") {
          pintar(id, "line-color", c.rio);
          pintar(id, "line-width", ["interpolate", ["exponential", 1.4], ["zoom"], 11, 0.8, 14, 2, 17, 6]);
        } else if (fuente === "aeroway") {
          // La pista del aeropuerto, como una avenida: en el estilo oscuro venía negra.
          pintar(id, "line-color", id.includes("casing") ? c.avenidaBorde : id.includes("taxiway") ? c.calle : c.avenida);
        } else if (fuente === "transportation") {
          if (id.includes("pier")) pintar(id, "line-color", c.fondo);
          else if (id.includes("dashline")) pintar(id, "line-color", c.fondo);
          else if (id.includes("railway")) pintar(id, "line-color", c.tren);
          else if (id.includes("casing")) pintar(id, "line-color", id.includes("motorway") ? c.autopistaBorde : c.avenidaBorde);
          else if (id.includes("subtle")) pintar(id, "line-color", c.tenue);
          else if (id.includes("motorway")) pintar(id, "line-color", c.autopista);
          else if (id.includes("major")) pintar(id, "line-color", c.avenida);
          else if (id.includes("minor")) {
            pintar(id, "line-color", c.calle);
            // De lejos casi no se ven (la ciudad se lee por sus avenidas); de cerca, anchas.
            pintar(id, "line-width", ["interpolate", ["exponential", 1.55], ["zoom"], 12, 0.5, 14, 1.8, 17, 8, 20, 20]);
          } else if (id.includes("path")) pintar(id, "line-color", c.tenue);
        }
      } else if (type === "symbol") {
        const texto = fuente === "transportation_name" ? c.textoCalle : fuente === "water_name" || fuente === "waterway" ? c.textoAgua : fuente === "place" ? c.textoLugar : null;
        if (texto) {
          pintar(id, "text-color", texto);
          pintar(id, "text-halo-color", c.halo);
        }
        // Los barrios pequeños salen al acercar: de lejos tapaban la ciudad con letras.
        if (fuente === "place" && /other|suburb|neighbourhood/.test(id)) mapa.setLayerZoomRange(id, 13, 24);
      }
    }
  };

  // Se añaden sobre el mapa base, debajo de sus nombres de calles para que se sigan leyendo.
  let reintentoEstilo = false;
  const anadirPropias = () => {
    // Si el modo claro u oscuro cambió mientras cargaba el mapa, puede llegar el estilo del
    // otro modo: se pide el que toca y se espera a que llegue.
    const fondo = mapa.getStyle().layers.find((capa) => capa.type === "background");
    const rojo = /rgb\(\s*(\d+)/.exec(String(fondo ? mapa.getPaintProperty(fondo.id, "background-color") : ""))?.[1];
    if (rojo !== undefined && Number(rojo) < 100 !== esOscuro() && !reintentoEstilo) {
      reintentoEstilo = true; // una sola vez: si el estilo cambia de colores, no se queda en bucle
      mapa.setStyle(estiloActual(), { diff: false });
      return;
    }
    reintentoEstilo = false;
    pintarBase();
    for (const [id, fuente] of Object.entries(fuentesDelEstilo())) {
      if (!mapa.getSource(id)) mapa.addSource(id, fuente);
    }
    // Encima de todo lo dibujado (edificios incluidos) y debajo de los nombres que vienen después.
    const capas = mapa.getStyle().layers;
    const ultimaDibujada = capas.findLastIndex((c) => c.type !== "symbol");
    const nombres = capas.slice(ultimaDibujada + 1).find((c) => c.type === "symbol")?.id;
    if (!mapa.hasImage(`${PROPIO}flecha`)) mapa.addImage(`${PROPIO}flecha`, imagenFlecha(), { sdf: true, pixelRatio: 2 });
    // Los letreros llevan el color de cada sentido, que cambia con el modo oscuro.
    for (const [sentido, variable] of [["ida", "--sentido-ida"], ["retorno", "--sentido-retorno"]]) {
      const id = `${PROPIO}parada-${sentido}`;
      if (mapa.hasImage(id)) mapa.removeImage(id);
      mapa.addImage(id, imagenParada(color(variable), color("--sobre-accion"), color("--superficie")), { pixelRatio: 2 });
    }
    const primeraLinea = mapa.getStyle().layers.find((capa) => capa.type === "line")?.id;
    for (const capa of capasDeSuelo()) if (!mapa.getLayer(capa.id)) mapa.addLayer(capa, primeraLinea);
    for (const capa of capasDeLugares()) if (!mapa.getLayer(capa.id)) mapa.addLayer(capa, nombres);
    for (const capa of capasPropias()) if (!mapa.getLayer(capa.id)) mapa.addLayer(capa, nombres);
    aplicarEstadoZonas();
    ajustarCiclovias();
    aplicarZonas();
  };
  // Al llegar el estilo (no hace falta esperar a las teselas) y cada vez que cambia: en modo
  // oscuro hay otro mapa base, y las capas propias se vuelven a poner con los colores nuevos.
  mapa.on("style.load", anadirPropias);
  // De lejos, los buses estimados son puntos; con zoom se lee su número.
  const ZOOM_NUMEROS = 13;
  const ajustarLejos = () => contenedor.classList.toggle("mapa-lejos", mapa.getZoom() < ZOOM_NUMEROS);
  mapa.on("zoomend", ajustarLejos);
  ajustarLejos();
  // tema.js avisa cuando cambia el modo, por el botón o porque cambió el del dispositivo.
  const alCambiarModo = () => mapa.setStyle(estiloActual(), { diff: false });
  if (window.morlacoTema) window.addEventListener("morlaco:tema", alCambiarModo);
  else modoSistema.addEventListener("change", alCambiarModo);

  const poner = (nombre, datos) => {
    fuentes[nombre] = datos;
    mapa.getSource(`${PROPIO}${nombre}`)?.setData(datos);
  };

  // ---------- Recorridos que se dibujan solos ----------
  const animaciones = new Map();
  /** Dibuja los trazos de a poco; `luego` corre cuando terminan (para encadenar tramos). */
  function trazar(nombre, features, luego = null) {
    cancelAnimationFrame(animaciones.get(nombre));
    if (SIN_MOVIMIENTO || !features.length) {
      poner(nombre, coleccion(features));
      luego?.();
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
      else luego?.();
    };
    animaciones.set(nombre, requestAnimationFrame(paso));
  }

  // Sube cada vez que se quita o cambia la ruta: lo que quedaba por dibujar de la anterior se descarta.
  let vezRuta = 0;
  /**
   * Dibuja los tramos de una ruta uno tras otro, cada uno sobre su fuente (a pie o en bus).
   * Usa la animación de "rutaBus", así que cancelarla detiene toda la secuencia.
   */
  function trazarEnOrden(pasos, alTerminar) {
    cancelAnimationFrame(animaciones.get("rutaBus"));
    cancelAnimationFrame(animaciones.get("rutaPie"));
    const hechos = { rutaPie: [], rutaBus: [] };
    const generacion = vezRuta;
    let i = 0;
    const siguiente = () => {
      if (generacion !== vezRuta) return; // se quitó la ruta o empezó otra
      if (i >= pasos.length) {
        alTerminar?.();
        return;
      }
      const paso = pasos[i++];
      paso.antes?.();
      const terminar = () => {
        hechos[paso.fuente].push(paso.feature);
        poner(paso.fuente, coleccion(hechos[paso.fuente]));
        paso.despues?.();
        siguiente();
      };
      if (SIN_MOVIMIENTO) return terminar();
      const inicio = performance.now();
      const cuadro = (ahora) => {
        if (generacion !== vezRuta) return;
        const f = suave(Math.min(1, (ahora - inicio) / paso.duracion));
        if (f >= 1) return terminar();
        const parcial = { ...paso.feature, geometry: { type: "MultiLineString", coordinates: lineasDe(paso.feature).map((c) => cortar(c, f)) } };
        poner(paso.fuente, coleccion([...hechos[paso.fuente], parcial]));
        animaciones.set("rutaBus", requestAnimationFrame(cuadro));
      };
      animaciones.set("rutaBus", requestAnimationFrame(cuadro));
    };
    siguiente();
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
      // Con el teclado también: se llega con Tab y Enter o Espacio muestran qué es.
      nodo.tabIndex = 0;
      nodo.setAttribute("role", "button");
      nodo.setAttribute("aria-label", texto);
      nodo.addEventListener("focus", ver);
      nodo.addEventListener("blur", () => etiquetaFlotante.remove());
      nodo.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
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
  const CAPAS_PARADA = [`${PROPIO}linea-paradas`, `${PROPIO}linea-paradas-letrero`];
  for (const capa of CAPAS_PARADA) {
    mapa.on("mousemove", capa, (e) => {
      mapa.getCanvas().style.cursor = "pointer";
      etiquetaFlotante.setLngLat(e.features[0].geometry.coordinates).setText(textoParada(e.features[0])).addTo(mapa);
    });
    mapa.on("mouseleave", capa, () => {
      mapa.getCanvas().style.cursor = "";
      etiquetaFlotante.remove();
    });
  }
  // Con una calle ya elegida, un toque en el mapa no la cambia: al moverlo o al acercarlo
  // es fácil tocarlo sin querer. El primer toque pregunta ahí mismo ("Ver esta calle") y el
  // segundo, sobre ese botón, la elige. Sin calle elegida todavía, basta un toque.
  const propuesta = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    className: "propuesta-gl",
    offset: 6,
    maxWidth: "none",
  });
  let puntoPropuesto = null;
  const botonPropuesta = document.createElement("button");
  botonPropuesta.type = "button";
  botonPropuesta.className = "boton-propuesta";
  botonPropuesta.textContent = t("mapaVerCalle");
  botonPropuesta.addEventListener("click", () => {
    const punto = puntoPropuesto;
    propuesta.remove();
    if (punto) alElegir(punto);
  });
  propuesta.setDOMContent(botonPropuesta);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && propuesta.isOpen()) propuesta.remove();
  });

  mapa.on("click", (e) => {
    etiquetaFlotante.remove();
    propuesta.remove();
    // Tocar una parada (en el teléfono) muestra su nombre en vez de elegir ese punto.
    const capas = CAPAS_PARADA.filter((c) => mapa.getLayer(c));
    const [parada] = capas.length ? mapa.queryRenderedFeatures(e.point, { layers: capas }) : [];
    if (parada) {
      etiquetaFlotante.setLngLat(parada.geometry.coordinates).setText(textoParada(parada)).addTo(mapa);
      return;
    }
    const punto = { lat: e.lngLat.lat, lon: e.lngLat.lng };
    if (!contenedor.classList.contains("con-punto")) return alElegir(punto);
    puntoPropuesto = punto;
    propuesta.setLngLat(e.lngLat).addTo(mapa);
  });

  let paradas = [];
  let farmacias = []; // las de turno más cercanas, en su esquina aproximada
  let vezFarmacia = 0; // sube con cada "Ver en el mapa": solo la última muestra su nombre
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
            .join(", "),
        }),
      );
    }
    pendientes.set("ciclovias", async () => poner("ciclovias", await cargarJson("movilidad/ciclovias.geojson")));
    if (estaciones) {
      // Los dos sentidos: en el centro el tranvía va por la Gran Colombia y vuelve por la Mariscal Lamar.
      pendientes.set("tranvia", async () => {
        const lineas = await cargarJson("buses/lineas.geojson");
        poner("tranvia", coleccion(lineas.features.filter((f) => f.properties.tipo === "tranvia")));
      });
    }
    pendientes.set("carga", async () => {
      const carga = await cargarJson("movilidad/carga.geojson");
      grupos.carga = carga.features.map((f) =>
        marcador(`<span class="marca-capa carga">${SVG_RAYO}</span>`, f.geometry.coordinates, {
          texto: [f.properties.nombre, textoAcceso(f.properties.acceso)].filter(Boolean).join(", "),
        }),
      );
    });

    // Cada capa con la misma marca que tiene en el mapa, qué muestra y un interruptor.
    const opciones = [
      ...(estaciones ? [["tranvia", t("capaTranvia"), t("capaTranviaQue"), '<span class="marca-capa tranvia">T</span>']] : []),
      ["bicis", t("capaBicis"), t("capaBicisQue"), `<span class="marca-capa bici">${SVG_BICI}</span>`],
      ["ciclovias", t("capaCiclovias"), t("capaCicloviasQue"), '<span class="muestra-ciclovia"><i></i><i></i></span>'],
      ["carga", t("capaCarga"), t("capaCargaQue"), `<span class="marca-capa carga">${SVG_RAYO}</span>`],
    ];
    const control = document.createElement("details");
    control.className = "maplibregl-ctrl control-capas";
    // Cerrado, solo el ícono; abierto, el título al lado (el mismo botón cierra el panel).
    control.innerHTML = `<summary aria-label="${t("capasMapa")}" title="${t("capasMapa")}"><span class="capas-titulo" aria-hidden="true">${t("capasMapa")}</span>${SVG_CAPAS}</summary>`;
    const panelCapas = document.createElement("div");
    panelCapas.className = "panel-capas";
    for (const [clave, texto, que, marca] of opciones) {
      const fila = document.createElement("label");
      fila.className = "capa-fila";
      fila.innerHTML = `${marca}<span class="capa-texto"><span class="capa-nombre">${texto}</span><span class="capa-que">${que}</span></span><input type="checkbox" role="switch" class="interruptor" data-capa="${clave}">`;
      panelCapas.append(fila);
    }
    control.append(panelCapas);
    panelCapas.addEventListener("change", (e) => cambiarCapa(e.target.dataset.capa, e.target.checked));
    // Se cierra al tocar fuera del panel o con Escape, como cualquier menú.
    document.addEventListener("pointerdown", (e) => {
      if (control.open && !control.contains(e.target)) control.open = false;
    });
    control.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && control.open) {
        control.open = false;
        control.querySelector("summary").focus();
      }
    });
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
    if (clave === "ciclovias" || clave === "tranvia") ajustarCiclovias();
    if (clave !== "ciclovias") grupos[clave].forEach((m) => (visibles.has(clave) ? m.addTo(mapa) : m.remove()));
  }

  // ---------- Línea elegida: puntas, sentido y buses estimados ----------
  const panel = document.createElement("div");
  panel.className = "panel-linea";
  panel.hidden = true;
  // Va junto al mapa, no dentro: en el celular queda debajo, para no taparlo; en pantallas
  // anchas flota sobre su esquina (estilos.css). Solo entonces ocupa sitio del encuadre.
  (contenedor.parentElement ?? contenedor).append(panel);
  const altoPanel = () => (!panel.hidden && getComputedStyle(panel).position === "absolute" ? panel.offsetHeight : 0);
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
    datosLinea = null;
    varianteActual = null;
    enRuta = false;
    reencuadre = null;
    panel.hidden = true;
    contenedor.classList.remove("con-linea", "trazando");
    discretas(false);
    elegirSentido("ambos");
  }

  function elegirSentido(sentido) {
    sentidoVisible = sentido;
    if (mapa.getLayer(`${PROPIO}linea`)) {
      mapa.setFilter(`${PROPIO}linea-borde`, filtroLinea(PRINCIPAL));
      mapa.setFilter(`${PROPIO}linea`, filtroLinea(IDA));
      mapa.setFilter(`${PROPIO}linea-retorno`, filtroLinea(RETORNO));
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

  let datosLinea = null; // la línea elegida: ruta normal, variantes y paradas
  let varianteActual = null;

  /** Dibuja un recorrido (la ruta normal o una variante): trazo, paradas y puntas A y B. */
  function dibujarRecorrido(trazos, [nombreA, nombreB]) {
    trazar("linea", trazos);
    poner(
      "paradasLinea",
      coleccion(
        trazos.flatMap((f) =>
          paradasDeRecorrido(f, datosLinea.paradas).map((p) => ({
            type: "Feature",
            properties: { nombre: p.nombre, sentido: f.properties.sentido, hacia: f.properties.hacia },
            geometry: { type: "Point", coordinates: [p.lon, p.lat] },
          })),
        ),
      ),
    );
    puntas = quitar(puntas);
    // A es donde empieza la ida (y termina el retorno); B, a donde va la ida.
    const ida = trazos.find((f) => f.properties.sentido === "ida");
    const retorno = trazos.find((f) => f.properties.sentido === "retorno");
    const extremos = ida ? puntosDeTrazado(ida.geometry) : retorno ? [...puntosDeTrazado(retorno.geometry)].reverse() : [];
    if (extremos.length < 2) return;
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

  /** Muestra la ruta normal (null) o una variante, con su encuadre y sus buses. */
  function elegirVariante(variante) {
    varianteActual = variante;
    const { principales, variantes } = datosLinea;
    const normalA = principales.find((f) => f.properties.sentido === "retorno")?.properties.hacia;
    const normalB = principales.find((f) => f.properties.sentido === "ida")?.properties.hacia;
    let trazos = principales;
    let nombres = [normalA, normalB];
    if (variante) {
      trazos = variantes.filter((v) => v.properties.variante === variante);
      const guia = trazos.find((v) => v.properties.sentido === "ida");
      const p = guia?.properties;
      nombres = [p?.empiezaEnAlargue ? variante : normalA, p?.terminaEnAlargue ? variante : normalB];
      if (!guia) {
        // Solo hay variante de retorno: sus puntas, al revés.
        const r = trazos[0].properties;
        nombres = [r.terminaEnAlargue ? variante : normalA, r.empiezaEnAlargue ? variante : normalB];
      }
    }
    dibujarRecorrido(trazos, nombres);
    // Si la variante va y vuelve al barrio, el barrio lleva su propia etiqueta.
    const barrio = trazos.find((v) => !v.properties.empiezaEnAlargue && !v.properties.terminaEnAlargue)?.properties.barrio;
    if (variante && barrio) {
      puntas.push(
        marcador(`<span class="punta-linea barrio"><b aria-hidden="true">•</b> ${escapar(variante)}</span>`, barrio, {
          clase: "aparece",
        }).addTo(mapa),
      );
    }
    const nota = panel.querySelector(".nota-buses");
    // Los buses estimados van por la ruta normal: no hay datos de cuáles hacen cada variante.
    clearInterval(reloj);
    cancelAnimationFrame(reloj);
    if (variante) {
      busesMarcas.forEach((bus) => {
        bus.marca.remove();
        bus.puesta = false;
      });
      nota.hidden = false;
      nota.textContent = t("varianteNota");
    } else if (datosLinea.tipo === "tranvia") {
      nota.hidden = true; // del tranvía no hay horario de salidas para estimar
    } else {
      nota.hidden = false;
      arrancarBuses();
    }
    reencuadre = () => encuadrar(caja(trazos), { ...MARGEN_TRAZO, bottom: altoPanel() + 40 });
    reencuadre();
  }

  function mostrarLinea(principales, { linea, horarios, tipo, paradas, variantes = [] }) {
    lineaActual = { linea, tipo, horarios };
    datosLinea = { principales, variantes, paradas, tipo };
    const de = (sentido) => principales.find((f) => f.properties.sentido === sentido);
    recorridos = [de("ida"), de("retorno")].filter(Boolean).map((f) => {
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

    // El selector: los dos sentidos con su color, las variantes y la nota de los buses.
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
    panel.append(grupo);
    const nombresVariantes = [...new Set(variantes.map((v) => v.properties.variante))];
    if (nombresVariantes.length) {
      const etiqueta = document.createElement("label");
      etiqueta.className = "variante-linea";
      const lista = document.createElement("select");
      for (const [valor, texto] of [["", t("rutaNormal")], ...nombresVariantes.map((v) => [v, t("varianteHasta", { lugar: v })])]) {
        lista.append(new Option(texto, valor));
      }
      lista.addEventListener("change", () => elegirVariante(lista.value || null));
      etiqueta.append(t("recorridoLinea"), lista);
      panel.append(etiqueta);
    }
    const nota = document.createElement("p");
    nota.className = "nota-buses";
    panel.append(nota);
    panel.hidden = false;
    contenedor.classList.add("con-linea");
    elegirVariante(null);
  }

  /**
   * Los buses de una opción de ruta: los de cada línea que se toma, en su sentido, desde
   * que salen hasta donde uno se baja, y cuánto falta para que el próximo llegue a la parada.
   */
  function mostrarBusesDeRuta(tramos) {
    recorridos = tramos.map((tramo) => ({
      linea: tramo.linea,
      sentido: tramo.sentido,
      color: "ida", // del azul de la ruta dibujada
      hacia: tramo.hacia,
      horario: tramo.horario,
      medida: medirRecorrido(tramo.trazado),
      largo: tramo.largo,
      desde: tramo.metrosSubida / tramo.largo,
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
    nodo.innerHTML = `${SVG_GOTA}${SVG_GLIFO}<span class="bus-numero"></span>`;
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
    if (!enRuta && (!lineaActual || lineaActual.tipo === "tranvia" || varianteActual)) return;
    const ahora = new Date();
    const posiciones = [];
    for (const r of recorridos) {
      if (!enRuta && sentidoVisible !== "ambos" && sentidoVisible !== r.sentido) continue;
      for (const metros of busesEnCamino(r.horario, r.largo, ahora)) {
        const fraccion = metros / r.largo;
        // En una ruta solo cuentan los buses que todavía vienen hacia tu parada: los que ya
        // pasaron no te sirven y harían dudar del "ya no pasan".
        if (enRuta && fraccion > r.desde) continue;
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
            : faltan > 60
              ? // Falta más de una hora (de madrugada, por ejemplo): se dice la hora, no los minutos.
                t("rutaPrimerBus", { linea: primero.linea, hora: horaDentroDe(faltan, ahora) })
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
      cancelAnimationFrame(animaciones.get("rutaPie"));
      poner("rutaPie", vacio());
      cancelAnimationFrame(animaciones.get("rutaBus"));
      vezRuta++;
      poner("rutaBus", vacio());
      rutaMarcas = quitar(rutaMarcas);
      paradas = quitar(paradas);
      farmacias = quitar(farmacias);
      elegido?.remove();
      elegido = null;
      estadoZonas = { elegida: null };
      contenedor.classList.remove("con-punto");
      aplicarEstadoZonas();
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
      // Sin restos de una ruta buscada antes: se ve solo la línea.
      rutaMarcas = quitar(rutaMarcas);
      cancelAnimationFrame(animaciones.get("rutaPie"));
      poner("rutaPie", vacio());
      cancelAnimationFrame(animaciones.get("rutaBus"));
      vezRuta++;
      poner("rutaBus", vacio());
      if (!trazados) return;
      discretas(true);
      // La ruta normal y, en el selector, sus variantes (cada alargue como ruta completa).
      const principales = trazados.filter((t) => t.properties.tipo !== "alargue");
      mostrarLinea(principales, { linea, horarios, tipo, paradas, variantes: variantesDeLinea(trazados) });
    },
    /**
     * Dibuja una opción de "¿qué bus me lleva?": tramos a pie punteados, en bus llenos y
     * las paradas registradas de cada tramo en bus (las cercanas se esconden con la ruta).
     */
    dibujarRuta(opcion, destino, paradasRegistradas = null) {
      etiquetaFlotante.remove();
      rutaMarcas = quitar(rutaMarcas);
      limpiarLinea();
      cancelAnimationFrame(animaciones.get("rutaPie"));
      poner("rutaPie", vacio());
      cancelAnimationFrame(animaciones.get("rutaBus"));
      vezRuta++;
      poner("rutaBus", vacio());
      if (!opcion) return;
      // El viaje se dibuja en el orden en que se hace: la caminata hasta la parada, el bus y
      // la caminata hasta el destino. Cada marcador aparece cuando el trazo llega a él.
      const pasos = [];
      const paradasRuta = [];
      const todos = [];
      const ponerMarca = (html, lugar, opciones) => rutaMarcas.push(marcador(html, lugar, { clase: "aparece", ...opciones }).addTo(mapa));
      opcion.tramos.forEach((tramo, i) => {
        if (tramo.modo === "caminar") {
          if (tramo.metros < 5) return;
          const feature = {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [[tramo.desde.lon, tramo.desde.lat], [tramo.hasta.lon, tramo.hasta.lat]] },
          };
          todos.push(feature);
          pasos.push({ fuente: "rutaPie", feature, duracion: Math.min(700, Math.max(300, tramo.metros * 1.2)) });
          return;
        }
        const feature = { type: "Feature", properties: { tipo: tramo.tipo }, geometry: { type: "LineString", coordinates: tramo.coords } };
        todos.push(feature);
        // El tranvía tiene su propia capa de estaciones.
        if (tramo.tipo !== "tranvia" && paradasRegistradas) {
          for (const p of paradasDeRecorrido(feature, paradasRegistradas)) {
            paradasRuta.push({
              type: "Feature",
              // Del color de la ida, como el trazo de la ruta.
              properties: { nombre: p.nombre, sentido: "ida", hacia: tramo.hacia },
              geometry: { type: "Point", coordinates: [p.lon, p.lat] },
            });
          }
        }
        const siguiente = opcion.tramos[i + 1];
        const enLaPuerta = siguiente?.modo === "caminar" && siguiente.metros < 30 && i + 1 === opcion.tramos.length - 1;
        pasos.push({
          fuente: "rutaBus",
          feature,
          duracion: DURACION_TRAZO,
          antes: () =>
            ponerMarca(`<span class="etiqueta-ruta">${tramo.tipo === "tranvia" ? "T" : tramo.linea}</span>`, [tramo.subida.lon, tramo.subida.lat], {
              texto: tramo.tipo === "tranvia" ? t("rutaSubeTranvia") : t("rutaSube", { linea: tramo.linea }),
            }),
          // Dónde bajarse: un aro del color del trazo, para no pasarse de parada. Si el bus
          // deja en la puerta, ya está el alfiler del destino.
          despues: () => !enLaPuerta && ponerMarca('<span class="punto-bajada"></span>', [tramo.bajada.lon, tramo.bajada.lat], { texto: t("rutaBaja") }),
        });
      });
      discretas(true);
      // Los buses estimados, solo en rutas normales: no se sabe qué buses hacen cada variante.
      // Esperan a que el trazo termine, para no aparecer sobre la nada.
      const conHorario = opcion.tramos.filter(
        (t) => t.modo === "bus" && t.tipo !== "tranvia" && !t.variante && t.horario && t.largo > 0,
      );
      contenedor.classList.add("trazando");
      if (conHorario.length) mostrarBusesDeRuta(conHorario);
      let seMueve = false;
      const alMoverse = () => (seMueve = true);
      mapa.once("movestart", alMoverse);
      reencuadre = () =>
        encuadrar(caja(todos, [[destino.lon, destino.lat]]), {
          ...MARGEN_TRAZO,
          bottom: altoPanel() + 40,
        });
      reencuadre();
      // Se empieza a dibujar cuando el mapa termina de moverse hasta la ruta (o enseguida).
      let empezado = false;
      const miVez = vezRuta;
      const empezar = () => {
        mapa.off("moveend", empezar);
        mapa.off("movestart", alMoverse);
        if (empezado || miVez !== vezRuta) return;
        empezado = true;
        trazarEnOrden(pasos, () => {
          contenedor.classList.remove("trazando");
          ponerMarca('<span class="punto-destino"></span>', [destino.lon, destino.lat], { encima: true });
          poner("paradasLinea", coleccion(paradasRuta));
        });
      };
      // Si el mapa ya estaba encuadrado no hay movimiento que esperar: se empieza enseguida.
      mapa.once("moveend", empezar);
      requestAnimationFrame(() => requestAnimationFrame(() => !seMueve && empezar()));
      setTimeout(empezar, SIN_MOVIMIENTO ? 0 : 950);
    },
    mostrar(punto, zona, cercanas) {
      etiquetaFlotante.remove();
      propuesta.remove();
      poner("calles", vacio());
      limpiarLinea();
      cancelAnimationFrame(animaciones.get("rutaPie"));
      poner("rutaPie", vacio());
      cancelAnimationFrame(animaciones.get("rutaBus"));
      vezRuta++;
      poner("rutaBus", vacio());
      rutaMarcas = quitar(rutaMarcas);
      estadoZonas = { elegida: zona ? zona.properties.zona : null };
      // Con una calle elegida (dentro o fuera de las zonas), la leyenda solo sale al alejar.
      contenedor.classList.add("con-punto");
      aplicarEstadoZonas();
      paradas = quitar(paradas);
      farmacias = quitar(farmacias);
      cercanas.forEach((parada, i) => {
        const m = marcador(`<span class="etiqueta-parada">${SVG_PARADA}${i + 1}</span>`, [parada.lon, parada.lat], {
          texto: nombreParada(parada),
          clase: "aparece",
        });
        paradas.push(m.addTo(mapa));
      });
      const destino = [punto.lon, punto.lat];
      moverElegido(destino);
      const zoom = Math.max(mapa.getZoom(), ZOOM_PUNTO);
      if (SIN_MOVIMIENTO) mapa.jumpTo({ center: destino, zoom });
      else mapa.flyTo({ center: destino, zoom, speed: 1.4, curve: 1.42, essential: false });
    },
    /** Las farmacias de turno más cercanas: una cruz verde en la esquina de su dirección. */
    mostrarFarmacias(lista) {
      farmacias = quitar(farmacias);
      for (const f of lista) {
        farmacias.push(
          marcador(`<span class="etiqueta-farmacia">${SVG_CRUZ}</span>`, [f.lon, f.lat], {
            texto: t("farmaciaMapa", { nombre: f.nombre }),
            clase: "aparece",
          }).addTo(mapa),
        );
      }
    },
    /** Lleva el mapa a una farmacia de la lista, con su cruz y su nombre a la vista. */
    verFarmacia(f) {
      const lugar = [f.lon, f.lat];
      let marca = farmacias.find((m) => {
        const p = m.getLngLat();
        return Math.abs(p.lng - f.lon) < 1e-7 && Math.abs(p.lat - f.lat) < 1e-7;
      });
      if (!marca) {
        marca = marcador(`<span class="etiqueta-farmacia">${SVG_CRUZ}</span>`, lugar, {
          texto: t("farmaciaMapa", { nombre: f.nombre }),
          clase: "aparece",
        }).addTo(mapa);
        farmacias.push(marca);
      }
      // La pedida se ve aunque haya una ruta o una línea dibujada (que esconden las demás).
      for (const m of farmacias) m.getElement().classList.toggle("pedida", m === marca);
      // El nombre sale al llegar; si mientras tanto se pidió otra farmacia, otro punto o se
      // borró la dirección (la cruz ya no está), no sale.
      const miVez = ++vezFarmacia;
      const mostrarNombre = () => {
        if (miVez !== vezFarmacia || !farmacias.includes(marca)) return;
        etiquetaFlotante.setLngLat(lugar).setText(t("farmaciaMapa", { nombre: f.nombre })).addTo(mapa);
      };
      const zoom = Math.max(mapa.getZoom(), 15.5);
      if (SIN_MOVIMIENTO) {
        mapa.jumpTo({ center: lugar, zoom });
        mostrarNombre();
      } else {
        mapa.once("moveend", mostrarNombre);
        mapa.flyTo({ center: lugar, zoom, speed: 1.4, curve: 1.42, essential: false });
      }
    },
    /** Las zonas donde hoy pasa el recolector (se ven más llenas mientras no haya calle elegida). */
    marcarHoy(zonasHoy) {
      zonasDeHoy = new Set(zonasHoy.map(String));
      aplicarEstadoZonas();
    },
    /** Sin punto elegido: quita todo lo dibujado y vuelve a la vista de la ciudad. */
    olvidar() {
      etiquetaFlotante.remove();
      poner("calles", vacio());
      limpiarLinea();
      cancelAnimationFrame(animaciones.get("rutaPie"));
      poner("rutaPie", vacio());
      cancelAnimationFrame(animaciones.get("rutaBus"));
      vezRuta++;
      poner("rutaBus", vacio());
      rutaMarcas = quitar(rutaMarcas);
      paradas = quitar(paradas);
      farmacias = quitar(farmacias);
      cancelAnimationFrame(movimiento);
      elegido?.remove();
      elegido = null;
      estadoZonas = { elegida: null };
      contenedor.classList.remove("con-punto");
      aplicarEstadoZonas();
      discretas(false);
      const vista = { center: [CENTRO_CUENCA.lon, CENTRO_CUENCA.lat], zoom: ZOOM_INICIAL };
      if (SIN_MOVIMIENTO) mapa.jumpTo(vista);
      else mapa.flyTo({ ...vista, speed: 1.4, curve: 1.42, essential: false });
    },
  };
}
