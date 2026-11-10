// Conecta la página con los datos de Morlaco y el mapa (Leaflet, cargado como global L).

import {
  CENTRO_CUENCA,
  describirRecoleccion,
  direccionLegible,
  estadoLuz,
  filtrarCortes,
  formatoDistancia,
  hashDesdePunto,
  horaCuenca,
  nombreDia,
  paradasCercanas,
  proximaRecoleccion,
  puntoDesdeHash,
  zonaDe,
} from "./logica.js";

const DATOS = "../datos/";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
// Rectángulo de la ciudad para que la búsqueda no devuelva otra Cuenca.
const CAJA_CUENCA = "-79.10,-2.82,-78.92,-2.98";
const CLAVE_ULTIMO_PUNTO = "morlaco:ultimo-punto";
const SIN_MOVIMIENTO = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = (id) => document.getElementById(id);
const fechaLarga = new Intl.DateTimeFormat("es-EC", { dateStyle: "long", timeZone: "UTC" });

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

function crearMapa(zonas, alElegir) {
  const mapa = L.map("mapa", { zoomControl: true }).setView(
    [CENTRO_CUENCA.lat, CENTRO_CUENCA.lon],
    13,
  );
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapa);

  const estilo = (zona, elegida = false) => {
    const tono = zona.properties.dias_iso.includes(1) ? color("--cupula") : color("--tomebamba");
    return {
      color: tono,
      weight: elegida ? 3 : 1,
      fillColor: tono,
      fillOpacity: elegida ? 0.32 : 0.12,
    };
  };

  const capas = new Map();
  L.geoJSON(zonas, {
    style: (zona) => estilo(zona),
    onEachFeature: (zona, capa) => {
      const p = zona.properties;
      capa.bindTooltip(`${p.nombre}: ${p.dias.join(", ")}, de ${p.desde} a ${p.hasta}`, {
        sticky: true,
      });
      capas.set(p.zona, { zona, capa });
    },
  }).addTo(mapa);

  mapa.on("click", (evento) => alElegir({ lat: evento.latlng.lat, lon: evento.latlng.lng }));

  let marcador = null;
  let marcasParadas = L.layerGroup().addTo(mapa);

  return {
    mostrar(punto, zona, paradas) {
      for (const { zona: z, capa } of capas.values()) {
        capa.setStyle(estilo(z, zona && z.properties.zona === zona.properties.zona));
      }
      marcasParadas.clearLayers();
      for (const parada of paradas) {
        L.circleMarker([parada.lat, parada.lon], {
          radius: 5,
          color: color("--tinta"),
          weight: 2,
          fillColor: "#fff",
          fillOpacity: 1,
        })
          .bindTooltip(direccionLegible(parada.ubicacion))
          .addTo(marcasParadas);
      }
      if (!marcador) {
        marcador = L.circleMarker([punto.lat, punto.lon], {
          radius: 9,
          color: "#fff",
          weight: 3,
          fillColor: color("--cupula"),
          fillOpacity: 1,
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
    cuando.textContent = "Fuera de las zonas urbanas";
    cuando.classList.remove("ahora");
    fundas.textContent =
      "Ese punto no está en ninguna de las 8 zonas urbanas de EMAC. En el área rural la recolección " +
      "tiene otros horarios: consulta con EMAC EP.";
    detalle.textContent = "";
    return;
  }

  const p = zona.properties;
  const proxima = proximaRecoleccion(p);
  cuando.textContent = describirRecoleccion(proxima);
  cuando.classList.toggle("ahora", proxima.estado === "ahora");

  const hoy = horaCuenca().diaIso;
  const reciclaje = p.dia_reciclaje ? p.dias_iso[p.dias.indexOf(p.dia_reciclaje)] : null;
  const iniciales = ["L", "M", "M", "J", "V", "S", "D"];
  for (let dia = 1; dia <= 7; dia++) {
    const toca = p.dias_iso.includes(dia);
    const clases = ["azulejo", toca && "toca", dia === reciclaje && "reciclaje", dia === hoy && "hoy"];
    const descripcion = [
      nombreDia(dia),
      dia === hoy ? "hoy" : null,
      toca ? (dia === reciclaje ? "recolección, con funda celeste" : "recolección") : "sin recolección",
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

  const negra = elemento("i", { class: "funda negra", "aria-hidden": "true" });
  const celeste = elemento("i", { class: "funda celeste", "aria-hidden": "true" });
  if (proxima.conReciclaje) {
    fundas.replaceChildren(
      "Ese día saca la ",
      negra,
      "funda negra y también la ",
      celeste,
      "funda celeste con los reciclables.",
    );
  } else if (p.dia_reciclaje) {
    fundas.replaceChildren(
      "Saca la ",
      negra,
      `funda negra. La `,
      celeste,
      `funda celeste, con reciclables, va el ${p.dia_reciclaje}.`,
    );
  } else {
    fundas.replaceChildren("Saca la ", negra, "funda negra antes de la hora.");
  }
  detalle.textContent = `Zona ${p.zona} de EMAC. Deja las fundas antes de que empiece el horario.`;
}

function pintarLuz(suspensiones) {
  const caja = $("luz-estado");
  if (!suspensiones) {
    caja.replaceChildren(
      elemento("p", { class: "aviso" }, "No se pudieron cargar los cortes de luz. Prueba de nuevo más tarde."),
    );
    return;
  }
  const estado = estadoLuz(suspensiones);
  const fuente = elemento(
    "a",
    { href: "https://www.centrosur.gob.ec/suspensiones-programadas/" },
    "página de Centro Sur",
  );

  if (!estado.publicadoHoy) {
    const partes =
      estado.diasSinPublicar !== null && estado.diasSinPublicar > 2
        ? [
            elemento("strong", {}, `Centro Sur no publica cortes programados desde el ${fechaLarga.format(new Date(estado.ultima))}.`),
            " Puede que no haya cortes, o que no los esté anunciando en su web. Revisa también sus redes sociales o la ",
            fuente,
            ".",
          ]
        : ["No hay cortes programados publicados para hoy. Fuente: ", fuente, "."];
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
              elemento("span", { class: "horario" }, `De ${c.desde} a ${c.hasta}`),
              direccionLegible(c.direccion),
            ),
          )
        : [elemento("li", {}, "Ningún corte de hoy coincide con esa calle o sector.")]),
    );
  };
  const filtro = elemento("input", {
    type: "search",
    id: "filtro-cortes",
    placeholder: "Filtra por calle o sector",
    "aria-label": "Filtrar cortes por calle o sector",
  });
  filtro.addEventListener("input", () => pintarLista(filtro.value));
  pintarLista("");
  caja.replaceChildren(
    elemento("p", { class: "luz-resumen" }, `Hoy hay ${cortes.length} ${cortes.length === 1 ? "corte programado" : "cortes programados"} en la zona de Centro Sur.`),
    elemento("p", { class: "detalle" }, "Centro Sur no publica coordenadas: busca tu calle o sector en la lista."),
    elemento("div", { class: "filtro-cortes" }, filtro),
    lista,
  );
}

function pintarParadas(cercanas) {
  const lista = $("paradas");
  const nota = $("paradas-nota");
  if (!cercanas.length) {
    lista.replaceChildren(elemento("li", {}, "No hay paradas registradas a menos de 1,5 km."));
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
  nota.textContent =
    "Según el registro de paradas del municipio, que no incluye todas. Las distancias son en línea recta.";
}

// ---------- Ubicar al usuario ----------

async function buscarDireccion(texto) {
  const parametros = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "ec",
    viewbox: CAJA_CUENCA,
    bounded: "1",
    "accept-language": "es",
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
      rechazar(new Error("Este navegador no permite compartir la ubicación."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolver({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (error) =>
        rechazar(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? "El navegador no dio permiso para usar tu ubicación. Escribe tu dirección o toca el mapa."
              : "No se pudo obtener tu ubicación. Escribe tu dirección o toca el mapa.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

// ---------- Arranque ----------

async function iniciar() {
  let zonas;
  try {
    zonas = await cargarJson("recoleccion/zonas.geojson");
  } catch {
    mensaje("No se pudieron cargar los datos de Morlaco. Recarga la página para intentarlo de nuevo.", true);
    return;
  }
  const [suspensiones, paradas, estado] = await Promise.all(
    ["luz/suspensiones.json", "buses/paradas.geojson", "estado.json"].map((r) =>
      cargarJson(r).catch(() => null),
    ),
  );

  const fechas = Object.values(estado ?? {})
    .map((f) => f.actualizado)
    .filter(Boolean)
    .sort();
  if (fechas.length) {
    // estado.json guarda la hora en UTC; se muestra la fecha de Cuenca.
    const enCuenca = new Intl.DateTimeFormat("es-EC", {
      dateStyle: "long",
      timeZone: "America/Guayaquil",
    });
    $("actualizado").textContent = `Datos actualizados el ${enCuenca.format(new Date(fechas.at(-1)))}.`;
  }

  const elegir = (punto, origen) => {
    const zona = zonaDe(punto.lon, punto.lat, zonas);
    const cercanas = paradas ? paradasCercanas(punto, paradas) : [];
    $("respuesta").hidden = false;
    pintarBasura(zona);
    pintarLuz(suspensiones);
    pintarParadas(cercanas);
    mapa.mostrar(punto, zona, cercanas);
    history.replaceState(null, "", hashDesdePunto(punto));
    guardar(CLAVE_ULTIMO_PUNTO, hashDesdePunto(punto));
    if (origen) mensaje(origen);
  };

  const mapa = crearMapa(zonas, (punto) => elegir(punto, "Punto elegido en el mapa."));

  $("buscar").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const texto = $("direccion").value.trim();
    if (!texto) return;
    const boton = evento.submitter;
    if (boton) boton.disabled = true;
    mensaje("Buscando…");
    try {
      const lugar = await buscarDireccion(texto);
      if (!lugar) {
        mensaje("No encontré esa dirección en Cuenca. Prueba con una calle cercana o toca el mapa.", true);
        return;
      }
      elegir(lugar, `Encontrado: ${lugar.nombre.split(",").slice(0, 3).join(",")}.`);
    } catch {
      mensaje("La búsqueda de direcciones no respondió. Prueba de nuevo o toca el mapa.", true);
    } finally {
      if (boton) boton.disabled = false;
    }
  });

  $("ubicarme").addEventListener("click", async () => {
    const boton = $("ubicarme");
    boton.disabled = true;
    mensaje("Buscando tu ubicación…");
    try {
      elegir(await miUbicacion(), "Usando tu ubicación actual.");
    } catch (error) {
      mensaje(error.message, true);
    } finally {
      boton.disabled = false;
    }
  });

  const inicial = puntoDesdeHash(location.hash) ?? puntoDesdeHash(leer(CLAVE_ULTIMO_PUNTO));
  if (inicial) elegir(inicial);
}

iniciar();
