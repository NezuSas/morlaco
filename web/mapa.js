// El mapa de Morlaco, vectorial, con MapLibre GL: lo dibuja la tarjeta gráfica, así que el
// zoom es continuo y los recorridos se trazan con una animación (sin movimiento si la persona
// lo pidió así). app.js solo usa lo que devuelve `crearMapa`: mostrar, resaltar,
// resaltarLinea, dibujarRuta, agregarCapas y mostrarCapa.

import { CENTRO_CUENCA, LIMITES_CUENCA, horaLegible, nombreDia, nombreParada, puntoEnGeometria } from "./logica.js";
import { listar, t } from "./textos.js";

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
    ciclovias: vacio(),
  };
  const transicion = { duration: SIN_MOVIMIENTO ? 0 : 450 };
  const visibles = new Set();
  const verCiclovias = () => (visibles.has("ciclovias") ? "visible" : "none");

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
      filter: ["!=", ["get", "tipo"], "alargue"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color("--tinta"), "line-width": 4, "line-opacity": 0.85 },
    },
    {
      id: `${PROPIO}linea-alargue`,
      type: "line",
      source: `${PROPIO}linea`,
      filter: ["==", ["get", "tipo"], "alargue"],
      paint: { "line-color": color("--tinta"), "line-width": 3, "line-opacity": 0.85, "line-dasharray": [2, 2] },
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
    for (const capa of capasPropias()) if (!mapa.getLayer(capa.id)) mapa.addLayer(capa, nombres);
    aplicarEstadoZonas();
    ajustarCiclovias();
  };
  // Al llegar el estilo (no hace falta esperar a las teselas) y cada vez que cambia: en modo
  // oscuro hay otro mapa base, y las capas propias se vuelven a poner con los colores nuevos.
  mapa.on("style.load", anadirPropias);
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
  mapa.on("click", (e) => {
    etiquetaFlotante.remove();
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
      poner("linea", vacio());
      paradas = quitar(paradas);
      elegido?.remove();
      elegido = null;
      trazar("calles", calles);
      encuadrar(caja(calles), 30);
    },
    /** Dibuja el recorrido de una línea (o lo quita con null) y encuadra el mapa. */
    resaltarLinea(trazados) {
      etiquetaFlotante.remove();
      if (!trazados) {
        cancelAnimationFrame(animaciones.get("linea"));
        poner("linea", vacio());
        return;
      }
      const principales = trazados.filter((t) => t.properties.tipo !== "alargue");
      trazar("linea", trazados);
      encuadrar(caja(principales.length ? principales : trazados), 30);
    },
    /** Dibuja una opción de "¿qué bus me lleva?": tramos a pie punteados y en bus llenos. */
    dibujarRuta(opcion, destino) {
      etiquetaFlotante.remove();
      rutaMarcas = quitar(rutaMarcas);
      poner("linea", vacio());
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
      encuadrar(caja([...pie, ...bus], [[destino.lon, destino.lat]]), 40);
    },
    mostrar(punto, zona, cercanas) {
      etiquetaFlotante.remove();
      poner("calles", vacio());
      poner("linea", vacio());
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
