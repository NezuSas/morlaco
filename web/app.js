// Conecta la página con los datos de Morlaco y el mapa (Leaflet, cargado como global L).

import {
  CENTRO_CUENCA,
  describirRecoleccion,
  direccionLegible,
  enlaceReporteDireccion,
  enlacesCalendario,
  estadoLuz,
  filtrarCortes,
  formatoDistancia,
  hashDesdePunto,
  horaCuenca,
  nombreDia,
  paradasCercanas,
  proximaRecoleccion,
  puntoDesdeHash,
  puntoEnGeometria,
  zonaDe,
} from "./logica.js";
import {
  buscarCalles,
  cruceDeCalles,
  interpretarBusqueda,
  longitudMetros,
  prepararIndice,
  puntoMedio,
} from "./calles.js";
import { describirDestinos, describirFrecuencia, lineasCercanas } from "./buses.js";
import { etiquetaIdioma, idioma, idiomaInicial, listar, t, usarIdioma } from "./textos.js";

const DATOS = "../datos/";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
// Rectángulo de la ciudad para que la búsqueda no devuelva otra Cuenca.
const CAJA_CUENCA = "-79.10,-2.82,-78.92,-2.98";
const CLAVE_ULTIMO_PUNTO = "morlaco:ultimo-punto";
const CLAVE_IDIOMA = "morlaco:idioma";
const SIN_MOVIMIENTO = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = (id) => document.getElementById(id);
// El idioma se decide antes de pintar nada: lo guardado, o el del navegador.
usarIdioma(idiomaInicial(leer(CLAVE_IDIOMA), navigator.languages ?? [navigator.language]));

const fechaLarga = () => new Intl.DateTimeFormat(etiquetaIdioma(), { dateStyle: "long", timeZone: "UTC" });

/** Pone los textos del HTML en el idioma actual (atributos data-t*). */
function aplicarTextos() {
  document.documentElement.lang = etiquetaIdioma();
  document.title = t("titulo");
  for (const nodo of document.querySelectorAll("[data-t]")) nodo.textContent = t(nodo.dataset.t);
  for (const nodo of document.querySelectorAll("[data-t-html]")) nodo.innerHTML = t(nodo.dataset.tHtml);
  for (const nodo of document.querySelectorAll("[data-t-placeholder]")) {
    nodo.placeholder = t(nodo.dataset.tPlaceholder);
  }
  for (const nodo of document.querySelectorAll("[data-t-aria-label]")) {
    nodo.setAttribute("aria-label", t(nodo.dataset.tAriaLabel));
  }
}

/** Convierte "Saca la [negra]funda negra..." en nodos, con la muestra de color de cada funda. */
function conFundas(texto, fundas) {
  return texto
    .split(/(\[negra\]|\[celeste\])/)
    .filter(Boolean)
    .map((parte) => (parte === "[negra]" ? fundas.negra : parte === "[celeste]" ? fundas.celeste : parte));
}

function color(nombre) {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

function mensaje(texto, esError = false) {
  const p = $("mensaje");
  p.textContent = texto;
  p.classList.toggle("error", esError);
}

function elemento(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (clave === "class") nodo.className = valor;
    else nodo.setAttribute(clave, valor);
  }
  nodo.append(...hijos.filter((h) => h !== null && h !== undefined));
  return nodo;
}

function leer(clave) {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardar(clave, valor) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento (modo privado, por ejemplo): no pasa nada.
  }
}

async function cargarJson(ruta) {
  const respuesta = await fetch(DATOS + ruta);
  if (!respuesta.ok) throw new Error(`${ruta}: ${respuesta.status}`);
  return respuesta.json();
}

// ---------- Mapa ----------

const esLmv = (zona) => zona.properties.dias_iso.includes(1);

/** Un punto dentro de la zona para poner su número (el centro de una zona cóncava puede caer fuera). */
function puntoInterior(zona) {
  const anillos =
    zona.geometry.type === "Polygon"
      ? [zona.geometry.coordinates[0]]
      : zona.geometry.coordinates.map((p) => p[0]);
  const anillo = anillos.reduce((a, b) => (b.length > a.length ? b : a));
  const lons = anillo.map((p) => p[0]);
  const lats = anillo.map((p) => p[1]);
  const media = { lon: lons.reduce((s, v) => s + v, 0) / lons.length, lat: lats.reduce((s, v) => s + v, 0) / lats.length };
  if (puntoEnGeometria(media.lon, media.lat, zona.geometry)) return media;
  // Si no, el punto interior de una rejilla que quede más cerca de la media.
  const [oeste, este, sur, norte] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
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

function crearMapa(zonas, alElegir) {
  const mapa = L.map("mapa", { zoomControl: true }).setView(
    [CENTRO_CUENCA.lat, CENTRO_CUENCA.lon],
    13,
  );
  // Mapa de OpenStreetMap; la hoja de estilos lo pasa a grises (y lo invierte en modo oscuro).
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapa);

  const estilo = (zona, elegida = false, hayElegida = false) => {
    const tono = esLmv(zona) ? color("--cupula") : color("--tomebamba");
    return {
      color: tono,
      weight: elegida ? 3 : 1.5,
      opacity: hayElegida && !elegida ? 0.5 : 0.9,
      fillColor: tono,
      fillOpacity: elegida ? 0.3 : hayElegida ? 0.07 : 0.16,
    };
  };

  const capas = new Map();
  L.geoJSON(zonas, {
    style: (zona) => estilo(zona),
    onEachFeature: (zona, capa) => {
      const p = zona.properties;
      const dias = listar(p.dias_iso.map(nombreDia));
      capa.bindTooltip(t("zonaTooltip", { zona: p.zona, dias, desde: p.desde, hasta: p.hasta }), {
        sticky: true,
      });
      capas.set(p.zona, { zona, capa });
    },
  }).addTo(mapa);

  for (const zona of zonas.features) {
    const { lat, lon } = puntoInterior(zona);
    L.marker([lat, lon], {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: "",
        html: `<span class="etiqueta-zona ${esLmv(zona) ? "lmv" : "mjs"}">${zona.properties.zona}</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    }).addTo(mapa);
  }

  mapa.on("click", (evento) => alElegir({ lat: evento.latlng.lat, lon: evento.latlng.lng }));

  let marcador = null;
  const marcasParadas = L.layerGroup().addTo(mapa);
  const callesResaltadas = L.layerGroup().addTo(mapa);
  const lineaResaltada = L.layerGroup().addTo(mapa);

  return {
    /** Dibuja una o varias calles y encuadra el mapa en ellas. */
    resaltar(calles) {
      callesResaltadas.clearLayers();
      lineaResaltada.clearLayers();
      marcasParadas.clearLayers();
      if (marcador) {
        marcador.remove();
        marcador = null;
      }
      const capa = L.geoJSON(
        { type: "FeatureCollection", features: calles },
        { style: { color: color("--cupula-hondo"), weight: 6, opacity: 0.85 }, interactive: false },
      ).addTo(callesResaltadas);
      mapa.fitBounds(capa.getBounds(), { padding: [30, 30], animate: !SIN_MOVIMIENTO });
    },
    /** Dibuja el recorrido de una línea (o lo quita con null) y encuadra el mapa. */
    resaltarLinea(trazados) {
      lineaResaltada.clearLayers();
      if (!trazados) return;
      const principales = trazados.filter((t) => t.properties.tipo !== "alargue");
      const capa = L.geoJSON(
        { type: "FeatureCollection", features: trazados },
        {
          interactive: false,
          style: (t) => ({
            color: color("--tinta"),
            weight: t.properties.tipo === "alargue" ? 3 : 4,
            opacity: 0.85,
            dashArray: t.properties.tipo === "alargue" ? "6 6" : null,
          }),
        },
      ).addTo(lineaResaltada);
      const encuadre = principales.length ? L.geoJSON({ type: "FeatureCollection", features: principales }) : capa;
      mapa.fitBounds(encuadre.getBounds(), { padding: [30, 30], animate: !SIN_MOVIMIENTO });
    },
    mostrar(punto, zona, paradas) {
      callesResaltadas.clearLayers();
      lineaResaltada.clearLayers();
      for (const { zona: z, capa } of capas.values()) {
        capa.setStyle(estilo(z, zona && z.properties.zona === zona.properties.zona, Boolean(zona)));
      }
      marcasParadas.clearLayers();
      paradas.forEach((parada, i) => {
        L.marker([parada.lat, parada.lon], {
          icon: L.divIcon({
            className: "",
            html: `<span class="etiqueta-parada">${i + 1}</span>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
        })
          .bindTooltip(direccionLegible(parada.ubicacion))
          .addTo(marcasParadas);
      });
      if (!marcador) {
        // Por encima de las paradas, para que no lo tapen.
        marcador = L.marker([punto.lat, punto.lon], {
          interactive: false,
          keyboard: false,
          zIndexOffset: 1000,
          icon: L.divIcon({
            className: "",
            html: '<span class="punto-elegido"></span>',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
        }).addTo(mapa);
      } else {
        marcador.setLatLng([punto.lat, punto.lon]);
      }
      const destino = [punto.lat, punto.lon];
      const zoom = Math.max(mapa.getZoom(), 15);
      if (SIN_MOVIMIENTO) mapa.setView(destino, zoom);
      else mapa.flyTo(destino, zoom, { duration: 0.6 });
    },
  };
}

// ---------- Respuesta ----------

function pintarBasura(zona) {
  const cuando = $("basura-cuando");
  const semana = $("semana");
  const fundas = $("basura-fundas");
  const detalle = $("basura-zona");
  semana.replaceChildren();

  if (!zona) {
    cuando.textContent = t("fueraZonas");
    cuando.classList.remove("ahora");
    fundas.textContent = t("fueraZonasDetalle");
    detalle.textContent = "";
    $("calendario").replaceChildren();
    return;
  }

  const p = zona.properties;
  const proxima = proximaRecoleccion(p);
  cuando.textContent = describirRecoleccion(proxima);
  cuando.classList.toggle("ahora", proxima.estado === "ahora");

  const hoy = horaCuenca().diaIso;
  const reciclaje = p.dia_reciclaje ? p.dias_iso[p.dias.indexOf(p.dia_reciclaje)] : null;
  const iniciales = t("iniciales");
  for (let dia = 1; dia <= 7; dia++) {
    const toca = p.dias_iso.includes(dia);
    const clases = ["azulejo", toca && "toca", dia === reciclaje && "reciclaje", dia === hoy && "hoy"];
    const descripcion = [
      nombreDia(dia),
      dia === hoy ? t("hoy") : null,
      toca ? (dia === reciclaje ? t("diaConCeleste") : t("diaRecoleccion")) : t("diaSinRecoleccion"),
    ]
      .filter(Boolean)
      .join(", ");
    semana.append(
      elemento(
        "li",
        { class: clases.filter(Boolean).join(" "), "aria-label": descripcion, title: descripcion },
        elemento("span", { "aria-hidden": "true" }, iniciales[dia - 1]),
      ),
    );
  }

  const muestras = {
    negra: elemento("i", { class: "funda negra", "aria-hidden": "true" }),
    celeste: elemento("i", { class: "funda celeste", "aria-hidden": "true" }),
  };
  const texto = proxima.conReciclaje
    ? t("fundasConCeleste")
    : reciclaje
      ? t("fundasNormal", { dia: nombreDia(reciclaje) })
      : t("fundasSoloNegra");
  fundas.replaceChildren(...conFundas(texto, muestras));
  detalle.textContent = t("zonaDetalle", { zona: p.zona });
  pintarCalendario(p.zona);
}

/** Botones para suscribirse al calendario de recolección de la zona. */
function pintarCalendario(zona) {
  const enlaces = enlacesCalendario(zona, location.href);
  const externo = { target: "_blank", rel: "noopener" };
  $("calendario").replaceChildren(
    elemento("p", { class: "calendario-titulo" }, t("calendarioTitulo")),
    elemento(
      "div",
      { class: "calendario-botones" },
      elemento("a", { class: "boton-claro", href: enlaces.google, ...externo }, "Google Calendar"),
      elemento("a", { class: "boton-claro", href: enlaces.webcal }, t("calendarioApple")),
      elemento("a", { class: "enlace-claro", href: enlaces.archivo, download: `basura-zona-${zona}.ics` }, t("calendarioDescargar")),
    ),
    elemento("p", { class: "detalle" }, t("calendarioNota")),
  );
}

function pintarLuz(suspensiones) {
  const caja = $("luz-estado");
  if (!suspensiones) {
    caja.replaceChildren(
      elemento("p", { class: "aviso" }, t("luzError")),
    );
    return;
  }
  const estado = estadoLuz(suspensiones);
  const fuente = elemento(
    "a",
    { href: "https://www.centrosur.gob.ec/suspensiones-programadas/" },
    t("luzFuente"),
  );

  if (!estado.publicadoHoy) {
    const partes =
      estado.diasSinPublicar !== null && estado.diasSinPublicar > 2
        ? [
            elemento("strong", {}, t("luzSinPublicar", { fecha: fechaLarga().format(new Date(estado.ultima)) })),
            t("luzSinPublicarResto"),
            fuente,
            ".",
          ]
        : [t("luzNoHayHoy"), fuente, "."];
    caja.replaceChildren(elemento("p", { class: "aviso" }, ...partes));
    return;
  }

  const cortes = estado.cortesHoy;
  const lista = elemento("ul", { class: "cortes" });
  const pintarLista = (texto) => {
    const visibles = filtrarCortes(cortes, texto);
    lista.replaceChildren(
      ...(visibles.length
        ? visibles.map((c) =>
            elemento(
              "li",
              {},
              elemento("span", { class: "horario" }, t("corteHorario", { desde: c.desde, hasta: c.hasta })),
              direccionLegible(c.direccion),
            ),
          )
        : [elemento("li", {}, t("cortesNinguno"))]),
    );
  };
  const filtro = elemento("input", {
    type: "search",
    id: "filtro-cortes",
    placeholder: t("filtroCortes"),
    "aria-label": t("filtroCortesAria"),
  });
  filtro.addEventListener("input", () => pintarLista(filtro.value));
  pintarLista("");
  caja.replaceChildren(
    elemento("p", { class: "luz-resumen" }, t("luzResumen", { n: cortes.length })),
    elemento("p", { class: "detalle" }, t("luzSinCoordenadas")),
    elemento("div", { class: "filtro-cortes" }, filtro),
    lista,
  );
}

function pintarParadas(cercanas) {
  const lista = $("paradas");
  const nota = $("paradas-nota");
  if (!cercanas.length) {
    lista.replaceChildren(
      elemento("li", { class: "sin-numero" }, t("paradasNinguna")),
    );
  } else {
    lista.replaceChildren(
      ...cercanas.map((p) =>
        elemento(
          "li",
          {},
          elemento("span", {}, direccionLegible(p.ubicacion)),
          elemento("span", { class: "metros" }, formatoDistancia(p.metros)),
        ),
      ),
    );
  }
  nota.textContent = t("paradasNota");
}

/** Lista de líneas cercanas; al tocar una se resalta su recorrido en el mapa. */
function pintarLineas(cercanas, mapa) {
  const lista = $("lineas");
  const nota = $("lineas-nota");
  if (cercanas === null) {
    lista.replaceChildren(elemento("li", { class: "sin-lineas" }, t("lineasError")));
    nota.textContent = "";
    return;
  }
  if (!cercanas.length) {
    lista.replaceChildren(elemento("li", { class: "sin-lineas" }, t("lineasNinguna")));
    nota.textContent = "";
    return;
  }
  const botones = [];
  lista.replaceChildren(
    ...cercanas.map((l) => {
      const esTranvia = l.tipo === "tranvia";
      const detalle = esTranvia ? t("tranviaDetalle") : describirFrecuencia(l.horario);
      const boton = elemento(
        "button",
        { type: "button", class: "linea", "aria-pressed": "false" },
        elemento("span", { class: `numero-linea${esTranvia ? " tranvia" : ""}`, "aria-hidden": "true" }, esTranvia ? "T" : l.linea),
        elemento(
          "span",
          { class: "linea-texto" },
          elemento("strong", {}, esTranvia ? t("tranvia") : t("linea", { linea: l.linea }), " ", elemento("span", { class: "destinos" }, describirDestinos(l.destinos))),
          elemento("span", { class: "frecuencia" }, detalle),
        ),
        elemento("span", { class: "metros" }, formatoDistancia(l.metros)),
      );
      boton.addEventListener("click", () => {
        const activa = boton.getAttribute("aria-pressed") === "true";
        for (const b of botones) b.setAttribute("aria-pressed", "false");
        if (activa) {
          mapa.resaltarLinea(null);
        } else {
          boton.setAttribute("aria-pressed", "true");
          mapa.resaltarLinea(l.trazados);
        }
      });
      botones.push(boton);
      return elemento("li", {}, boton);
    }),
  );
  // Las más cercanas primero; el resto, a un toque.
  const VISIBLES = 6;
  const ocultas = [...lista.children].slice(VISIBLES);
  if (ocultas.length) {
    for (const li of ocultas) li.hidden = true;
    const ver = elemento(
      "button",
      { type: "button", class: "secundario ver-mas" },
      t("verMas", { n: ocultas.length }),
    );
    ver.addEventListener("click", () => {
      for (const li of ocultas) li.hidden = false;
      ver.parentElement.remove();
    });
    lista.append(elemento("li", { class: "ver-mas-fila" }, ver));
  }
  nota.textContent = t("lineasNota");
}

// ---------- Ubicar al usuario ----------

// El índice de calles pesa unos cientos de KB: se descarga la primera vez que se busca.
let indiceCalles = null;
function cargarIndiceCalles() {
  indiceCalles ??= cargarJson("calles/calles.geojson")
    .then(prepararIndice)
    .catch((error) => {
      indiceCalles = null;
      throw error;
    });
  return indiceCalles;
}

const LARGO_MAXIMO_SIN_CRUCE = 600;

/**
 * Convierte lo escrito en un punto. Primero busca en el índice local de calles
 * (intersecciones o calles cortas); si no encuentra ninguna calle, prueba con
 * Nominatim, que conoce lugares como "Mall del Río" o "Parque Calderón".
 * Devuelve { punto, texto } o { error, resaltar? }.
 */
async function ubicarTexto(texto) {
  const { calles, tieneNumero } = interpretarBusqueda(texto);
  let indice = null;
  try {
    indice = await cargarIndiceCalles();
  } catch {
    // Sin índice, queda Nominatim.
  }

  if (indice && calles.length === 2) {
    const [a, b] = calles.map((c) => buscarCalles(c, indice));
    const falta = !a.length ? calles[0] : !b.length ? calles[1] : null;
    if (falta) {
      return { error: t("noCalle", { calle: falta }), reportable: true };
    }
    const cruce = cruceDeCalles(a, b);
    if (!cruce) {
      return {
        error: t("noSeCruzan", { a: a[0].nombre, b: b[0].nombre }),
        resaltar: [a[0].feature, b[0].feature],
        reportable: true,
      };
    }
    return { punto: cruce.punto, texto: t("cruce", { a: cruce.a.nombre, b: cruce.b.nombre }) };
  }

  if (indice && calles.length === 1) {
    const [calle] = buscarCalles(calles[0], indice);
    if (calle) {
      if (longitudMetros(calle.feature) <= LARGO_MAXIMO_SIN_CRUCE && !tieneNumero) {
        return { punto: puntoMedio(calle.feature), texto: calle.nombre };
      }
      const motivo = tieneNumero ? t("numerosCasa") : t("calleLarga", { calle: calle.nombre });
      return {
        error: `${motivo} ${t("escribeCruce", { calle: calles[0] })}`,
        resaltar: [calle.feature],
      };
    }
  }

  const lugar = await buscarDireccion(texto);
  if (!lugar) {
    return {
      error: t("noLugar"),
      reportable: true,
    };
  }
  return { punto: lugar, texto: lugar.nombre.split(",").slice(0, 3).join(",") };
}

async function buscarDireccion(texto) {
  const parametros = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "ec",
    viewbox: CAJA_CUENCA,
    bounded: "1",
    "accept-language": idioma(),
    q: texto,
  });
  const respuesta = await fetch(`${NOMINATIM}?${parametros}`);
  if (!respuesta.ok) throw new Error(`Nominatim: ${respuesta.status}`);
  const [lugar] = await respuesta.json();
  return lugar ? { lat: Number(lugar.lat), lon: Number(lugar.lon), nombre: lugar.display_name } : null;
}

function miUbicacion() {
  return new Promise((resolver, rechazar) => {
    if (!navigator.geolocation) {
      rechazar(new Error(t("geoNoSoportado")));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolver({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (error) =>
        rechazar(
          new Error(
            error.code === error.PERMISSION_DENIED ? t("geoSinPermiso") : t("geoError"),
          ),
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

// ---------- Arranque ----------

async function iniciar() {
  aplicarTextos();
  // Cambiar de idioma recarga la página: el punto elegido sigue en la dirección (#lat,lon).
  $("idioma").addEventListener("click", () => {
    guardar(CLAVE_IDIOMA, idioma() === "en" ? "es" : "en");
    location.reload();
  });

  let zonas;
  try {
    zonas = await cargarJson("recoleccion/zonas.geojson");
  } catch {
    mensaje(t("errorDatos"), true);
    return;
  }
  const [suspensiones, paradas, estado, lineas, rutas] = await Promise.all(
    [
      "luz/suspensiones.json",
      "buses/paradas.geojson",
      "estado.json",
      "buses/lineas.geojson",
      "buses/rutas.json",
    ].map((r) =>
      cargarJson(r).catch(() => null),
    ),
  );

  const fechas = Object.values(estado ?? {})
    .map((f) => f.actualizado)
    .filter(Boolean)
    .sort();
  if (fechas.length) {
    // estado.json guarda la hora en UTC; se muestra la fecha de Cuenca.
    const enCuenca = new Intl.DateTimeFormat(etiquetaIdioma(), {
      dateStyle: "long",
      timeZone: "America/Guayaquil",
    });
    $("actualizado").textContent = t("actualizado", { fecha: enCuenca.format(new Date(fechas.at(-1))) });
  }

  const elegir = (punto, origen) => {
    const zona = zonaDe(punto.lon, punto.lat, zonas);
    const cercanas = paradas ? paradasCercanas(punto, paradas) : [];
    $("respuesta").hidden = false;
    $("inicio").hidden = true;
    pintarBasura(zona);
    pintarLuz(suspensiones);
    pintarParadas(cercanas);
    pintarLineas(lineas ? lineasCercanas(punto, lineas, rutas?.rutas ?? []) : null, mapa);
    mapa.mostrar(punto, zona, cercanas);
    history.replaceState(null, "", hashDesdePunto(punto));
    guardar(CLAVE_ULTIMO_PUNTO, hashDesdePunto(punto));
    if (origen) {
      mensaje(origen);
      // Tras una acción de la persona, lleva la vista a la respuesta (queda bajo la portada).
      $("mensaje").scrollIntoView({ behavior: SIN_MOVIMIENTO ? "auto" : "smooth", block: "start" });
    }
  };

  const mapa = crearMapa(zonas, (punto) => elegir(punto, t("puntoMapa")));

  $("buscar").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const texto = $("direccion").value.trim();
    if (!texto) return;
    const boton = evento.submitter;
    if (boton) boton.disabled = true;
    mensaje(t("buscando"));
    try {
      const resultado = await ubicarTexto(texto);
      if (resultado.error) {
        // La respuesta anterior era de otro lugar: se oculta para no confundir.
        $("respuesta").hidden = true;
        $("inicio").hidden = false;
        if (resultado.resaltar) mapa.resaltar(resultado.resaltar);
        mensaje(resultado.error, true);
        if (resultado.reportable) {
          // Si la búsqueda falla con una dirección real, que la persona pueda avisar.
          $("mensaje").append(
            " ",
            elemento("a", { href: enlaceReporteDireccion(texto), target: "_blank", rel: "noopener" }, t("reportar")),
            ".",
          );
        }
        return;
      }
      elegir(resultado.punto, t("encontrado", { texto: resultado.texto }));
    } catch {
      mensaje(t("busquedaSinRespuesta"), true);
    } finally {
      if (boton) boton.disabled = false;
    }
  });

  $("ubicarme").addEventListener("click", async () => {
    const boton = $("ubicarme");
    boton.disabled = true;
    mensaje(t("buscandoUbicacion"));
    try {
      elegir(await miUbicacion(), t("usandoUbicacion"));
    } catch (error) {
      mensaje(error.message, true);
    } finally {
      boton.disabled = false;
    }
  });

  // Los ejemplos rellenan la búsqueda y la lanzan.
  for (const boton of document.querySelectorAll(".ejemplo")) {
    boton.addEventListener("click", () => {
      $("direccion").value = boton.dataset.busqueda;
      $("buscar").requestSubmit();
    });
  }

  // Un enlace compartido (#lat,lon) abierto con la página ya cargada.
  window.addEventListener("hashchange", () => {
    const punto = puntoDesdeHash(location.hash);
    if (punto) elegir(punto);
  });

  const inicial = puntoDesdeHash(location.hash) ?? puntoDesdeHash(leer(CLAVE_ULTIMO_PUNTO));
  if (inicial) elegir(inicial);
}

iniciar();
