// Búsqueda de calles e intersecciones de Cuenca en el índice local de Morlaco
// (datos/calles/calles.geojson, de OpenStreetMap). Sin DOM ni red.

// Palabras que no ayudan a distinguir una calle de otra.
const GENERICAS = new Set([
  "avenida",
  "av",
  "avda",
  "calle",
  "c",
  "cl",
  "pasaje",
  "psje",
  "pje",
  "via",
  "de",
  "del",
  "la",
  "las",
  "los",
  "el",
  "y",
  "e",
]);

// Separadores de intersección: "Solano y Remigio Crespo", "Sucre & Borrero",
// "Bolívar esquina Benigno Malo", "Larga / Hermano Miguel".
const SEPARADOR = /\s+(?:y|e|con|esq\.?|esquina(?:\s+con)?)\s+|\s*[&/]\s*/i;

const METROS_POR_GRADO = 111_320;
const COS_CUENCA = Math.cos((-2.9 * Math.PI) / 180);

function normalizar(texto) {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function palabras(texto) {
  return normalizar(texto)
    .replace(/[^a-z0-9ñ]+/g, " ")
    .split(" ")
    .filter((p) => p && !GENERICAS.has(p));
}

/**
 * Separa lo que escribió la persona en una o dos calles y quita los números de
 * casa al estilo de Cuenca ("7-45", "s/n"), que no están en el mapa.
 */
export function interpretarBusqueda(texto) {
  let limpio = (texto ?? "").trim();
  const numero = /\b\d+\s*-\s*\d+\b|\bs\s*\/\s*n\b|#\s*\d+/i;
  const tieneNumero = numero.test(limpio);
  limpio = limpio.replace(new RegExp(numero.source, "gi"), " ").replace(/[,;]+/g, " ").trim();
  const calles = limpio
    .split(SEPARADOR)
    .map((c) => c.trim())
    .filter((c) => palabras(c).length > 0)
    .slice(0, 2);
  return { calles, tieneNumero };
}

function distanciaEdicion(a, b) {
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const arriba = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = arriba;
    }
  }
  return fila[b.length];
}

/** 0 = igual, 1 = parecida (prefijo o una letra de diferencia), null = distinta. */
function parecido(buscada, palabra) {
  if (buscada === palabra) return 0;
  if (buscada.length >= 3 && palabra.startsWith(buscada)) return 1;
  if (buscada.length >= 4 && Math.abs(buscada.length - palabra.length) <= 1) {
    return distanciaEdicion(buscada, palabra) <= 1 ? 1 : null;
  }
  return null;
}

/** Cómo de bien encaja una búsqueda con un nombre; null si falta alguna palabra. */
function encaje(buscadas, nombre) {
  const libres = [...nombre];
  let inexactas = 0;
  for (const buscada of buscadas) {
    let mejor = -1;
    let mejorParecido = null;
    libres.forEach((palabra, i) => {
      const p = parecido(buscada, palabra);
      if (p !== null && (mejorParecido === null || p < mejorParecido)) {
        mejor = i;
        mejorParecido = p;
      }
    });
    if (mejor === -1) return null;
    inexactas += mejorParecido;
    libres.splice(mejor, 1);
  }
  return { sobrantes: libres.length, inexactas };
}

export function prepararIndice(calles) {
  return calles.features.map((feature) => ({
    feature,
    nombre: feature.properties.nombre,
    rango: feature.properties.rango ?? 0,
    largo: longitudMetros(feature),
    variantes: [feature.properties.nombre, ...(feature.properties.otros_nombres ?? [])].map(palabras),
  }));
}

/**
 * Las calles que mejor encajan con el texto, de mejor a peor: primero las que no
 * tienen palabras de más, luego las escritas igual y, a igualdad, la vía más
 * importante y la más larga, que suele ser la que la gente conoce ("Borrero" es
 * Presidente Borrero, en el centro, antes que un callejón Ramón Borrero).
 */
export function buscarCalles(texto, indice, maximo = 6) {
  const buscadas = palabras(texto);
  if (!buscadas.length) return [];
  const encontradas = [];
  for (const calle of indice) {
    let mejor = null;
    for (const variante of calle.variantes) {
      const e = encaje(buscadas, variante);
      if (e && (!mejor || e.sobrantes + e.inexactas < mejor.sobrantes + mejor.inexactas)) mejor = e;
    }
    if (mejor) encontradas.push({ ...calle, ...mejor });
  }
  encontradas.sort(
    (a, b) =>
      a.sobrantes - b.sobrantes ||
      a.inexactas - b.inexactas ||
      b.rango - a.rango ||
      b.largo - a.largo ||
      a.nombre.localeCompare(b.nombre),
  );
  return encontradas.slice(0, maximo);
}

// ---------- Geometría (en metros, con una proyección plana válida para Cuenca) ----------

const aMetros = ([lon, lat]) => [lon * METROS_POR_GRADO * COS_CUENCA, lat * METROS_POR_GRADO];
const aGrados = ([x, y]) => ({ lon: x / (METROS_POR_GRADO * COS_CUENCA), lat: y / METROS_POR_GRADO });

function segmentos(feature) {
  const lista = [];
  for (const linea of feature.geometry.coordinates) {
    const puntos = linea.map(aMetros);
    for (let i = 1; i < puntos.length; i++) lista.push([puntos[i - 1], puntos[i]]);
  }
  return lista;
}

function puntoMasCercano(p, [a, b]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const largo2 = dx * dx + dy * dy;
  const t = largo2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / largo2)) : 0;
  return [a[0] + t * dx, a[1] + t * dy];
}

function cruceDeSegmentos([a, b], [c, d]) {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const denominador = r[0] * s[1] - r[1] * s[0];
  if (denominador === 0) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / denominador;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / denominador;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a[0] + t * r[0], a[1] + t * r[1]];
}

/** El punto donde más se acercan dos calles y a cuántos metros están. */
export function encuentroDeCalles(featureA, featureB) {
  return encuentroDeSegmentos(segmentos(featureA), segmentos(featureB));
}

function encuentroDeSegmentos(segA, segB) {
  let mejor = { metros: Infinity, punto: null };
  for (const sa of segA) {
    for (const sb of segB) {
      const cruce = cruceDeSegmentos(sa, sb);
      if (cruce) return { metros: 0, punto: aGrados(cruce) };
      for (const [p, segmento] of [
        [sa[0], sb],
        [sa[1], sb],
        [sb[0], sa],
        [sb[1], sa],
      ]) {
        const q = puntoMasCercano(p, segmento);
        const metros = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (metros < mejor.metros) {
          mejor = { metros, punto: aGrados([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]) };
        }
      }
    }
  }
  return mejor;
}

/**
 * Entre los candidatos de cada calle, la pareja que se cruza (o casi, hasta
 * `maximoMetros`, porque en el mapa dos calles pueden quedar a unos metros, por
 * ejemplo separadas por una redondel). Gana la pareja que mejor encaja con lo
 * escrito; a igualdad, la que se cruza más de cerca. Así "Solano y Remigio
 * Crespo" da la Av. Remigio Crespo Toral, aunque Remigio Tamariz Crespo también
 * cruce la Solano.
 */
export function cruceDeCalles(candidatosA, candidatosB, maximoMetros = 40) {
  let mejor = null;
  candidatosA.forEach((a, i) => {
    candidatosB.forEach((b, j) => {
      if (a.feature === b.feature) return;
      const encuentro = encuentroDeCalles(a.feature, b.feature);
      if (encuentro.metros > maximoMetros) return;
      const orden = i + j;
      if (!mejor || orden < mejor.orden || (orden === mejor.orden && encuentro.metros < mejor.metros)) {
        mejor = { ...encuentro, a, b, orden };
      }
    });
  });
  if (!mejor) return null;
  const { orden, ...cruce } = mejor;
  return cruce;
}

/** Distancia en metros de un punto {lat, lon} a una LineString o MultiLineString. */
export function distanciaALinea(punto, geometria) {
  const p = aMetros([punto.lon, punto.lat]);
  const lineas = geometria.type === "LineString" ? [geometria.coordinates] : geometria.coordinates;
  let minima = Infinity;
  for (const linea of lineas) {
    const puntos = linea.map(aMetros);
    for (let i = 1; i < puntos.length; i++) {
      const q = puntoMasCercano(p, [puntos[i - 1], puntos[i]]);
      minima = Math.min(minima, Math.hypot(p[0] - q[0], p[1] - q[1]));
    }
  }
  return minima;
}

// ---------- Sugerencias mientras se escribe ----------

const MARGEN_CRUCE_GRADOS = 0.0004; // unos 45 m
const crucesCalculados = new WeakMap();

/** Las calles del índice que cruzan (o casi, a 40 m) la de esta entrada. Se calcula una vez. */
function callesQueCruzan(entrada, indice) {
  if (crucesCalculados.has(entrada)) return crucesCalculados.get(entrada);
  entrada.caja ??= cajaDe(entrada.feature);
  const [oeste, sur, este, norte] = entrada.caja;
  const m = MARGEN_CRUCE_GRADOS;
  const propios = segmentos(entrada.feature);
  // Solo se comparan los tramos que quedan cerca de la caja de la otra calle: una
  // avenida larga tiene cientos de tramos y casi todos están lejos de cada cruce.
  const cerca = (segs, [o, s, e, n]) => {
    const [x0, y0] = aMetros([o, s]);
    const [x1, y1] = aMetros([e, n]);
    const margen = 45;
    return segs.filter(
      ([a, b]) =>
        Math.max(a[0], b[0]) >= x0 - margen &&
        Math.min(a[0], b[0]) <= x1 + margen &&
        Math.max(a[1], b[1]) >= y0 - margen &&
        Math.min(a[1], b[1]) <= y1 + margen,
    );
  };
  const cruces = indice.filter((otra) => {
    if (otra === entrada || otra.nombre === entrada.nombre) return false;
    otra.caja ??= cajaDe(otra.feature);
    const [o, s, e, n] = otra.caja;
    if (e < oeste - m || o > este + m || n < sur - m || s > norte + m) return false;
    const segA = cerca(propios, otra.caja);
    if (!segA.length) return false;
    const segB = cerca(segmentos(otra.feature), entrada.caja);
    return segB.length > 0 && encuentroDeSegmentos(segA, segB).metros <= 40;
  });
  crucesCalculados.set(entrada, cruces);
  return cruces;
}

/** ¿Cada palabra escrita es el comienzo de alguna palabra del nombre (o casi igual)? */
function empiezaComo(buscadas, entrada) {
  return entrada.variantes.some((variante) =>
    buscadas.every((b) => variante.some((p) => p.startsWith(b) || parecido(b, p) !== null)),
  );
}

function sinRepetir(entradas) {
  const vistos = new Set();
  return entradas.filter((e) => !vistos.has(e.nombre) && vistos.add(e.nombre));
}

/**
 * Sugerencias para el buscador mientras se escribe. Completa la calle que se está
 * escribiendo; después de "y" (o "&", "esquina"...) solo sugiere las calles que
 * cruzan la primera, para que la intersección exista. Devuelve [{nombre, texto}],
 * donde `texto` es lo que queda en el campo al elegirla.
 */
export function sugerirCalles(texto, indice, maximo = 6) {
  let entrada = (texto ?? "").replace(/^\s+/, "");
  // "Sucre y" (sin espacio final) ya anuncia la segunda calle.
  if (/\s(?:y|e|&)$/i.test(entrada)) entrada += " ";
  const separadores = [...entrada.matchAll(new RegExp(SEPARADOR.source, "gi"))];
  if (separadores.length > 1) return [];

  if (!separadores.length) {
    const buscadas = palabras(entrada);
    if (buscadas.join("").length < 3) return [];
    return sinRepetir(buscarCalles(entrada, indice, maximo * 3))
      .slice(0, maximo)
      .map((c) => ({ nombre: c.nombre, texto: c.nombre }));
  }

  const [separador] = separadores;
  const primera = entrada.slice(0, separador.index);
  const prefijo = entrada.slice(0, separador.index + separador[0].length);
  const buscadas = palabras(entrada.slice(prefijo.length));
  // Las que mejor encajan con la primera calle (puede haber tramos con el mismo nombre).
  const [mejor, ...resto] = buscarCalles(primera, indice, 4);
  if (!mejor) return [];
  const candidatas = [mejor, ...resto.filter((c) => c.sobrantes === mejor.sobrantes && c.inexactas === mejor.inexactas)];
  const nombresPrimera = new Set(candidatas.map((c) => c.nombre));
  const cruces = sinRepetir(candidatas.flatMap((c) => callesQueCruzan(c, indice)))
    .filter((c) => !nombresPrimera.has(c.nombre) && (!buscadas.length || empiezaComo(buscadas, c)))
    .sort((a, b) => b.rango - a.rango || b.largo - a.largo || a.nombre.localeCompare(b.nombre));
  return cruces.slice(0, maximo).map((c) => ({ nombre: c.nombre, texto: `${prefijo}${c.nombre}` }));
}

/**
 * La calle más cercana a un punto y, si hay otra a pocos metros, la que la cruza:
 * sirve para nombrar un punto del mapa o del GPS ("Sucre y Presidente Borrero").
 * Devuelve null si no hay ninguna calle a `maximo` metros.
 */
export function esquinaCercana(punto, indice, { maximo = 120, cruce = 45 } = {}) {
  // Un recorte rápido por coordenadas antes de medir con cuidado (0,002° son unos 220 m).
  const margen = 0.002;
  const candidatas = [];
  for (const entrada of indice) {
    entrada.caja ??= cajaDe(entrada.feature);
    const [oeste, sur, este, norte] = entrada.caja;
    if (punto.lon < oeste - margen || punto.lon > este + margen || punto.lat < sur - margen || punto.lat > norte + margen) {
      continue;
    }
    const metros = distanciaALinea(punto, entrada.feature.geometry);
    if (metros <= maximo) candidatas.push({ nombre: entrada.nombre, metros, rango: entrada.rango });
  }
  if (!candidatas.length) return null;
  candidatas.sort((a, b) => a.metros - b.metros || b.rango - a.rango);
  const [primera] = candidatas;
  const segunda = candidatas.find(
    (c) => c.metros <= cruce && palabras(c.nombre).join(" ") !== palabras(primera.nombre).join(" "),
  );
  return { calle: primera.nombre, cruce: segunda?.nombre ?? null, metros: Math.round(primera.metros) };
}

function cajaDe(feature) {
  let oeste = Infinity;
  let sur = Infinity;
  let este = -Infinity;
  let norte = -Infinity;
  const lineas = feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  for (const linea of lineas) {
    for (const [lon, lat] of linea) {
      oeste = Math.min(oeste, lon);
      este = Math.max(este, lon);
      sur = Math.min(sur, lat);
      norte = Math.max(norte, lat);
    }
  }
  return [oeste, sur, este, norte];
}

export function longitudMetros(feature) {
  return segmentos(feature).reduce((total, [a, b]) => total + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
}

/** El punto a mitad de recorrido del tramo más largo de la calle. */
export function puntoMedio(feature) {
  let mejor = null;
  for (const linea of feature.geometry.coordinates) {
    const puntos = linea.map(aMetros);
    let largo = 0;
    for (let i = 1; i < puntos.length; i++) {
      largo += Math.hypot(puntos[i][0] - puntos[i - 1][0], puntos[i][1] - puntos[i - 1][1]);
    }
    if (!mejor || largo > mejor.largo) mejor = { puntos, largo };
  }
  let recorrido = mejor.largo / 2;
  for (let i = 1; i < mejor.puntos.length; i++) {
    const [a, b] = [mejor.puntos[i - 1], mejor.puntos[i]];
    const tramo = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (recorrido <= tramo) {
      const t = tramo ? recorrido / tramo : 0;
      return aGrados([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
    recorrido -= tramo;
  }
  return aGrados(mejor.puntos.at(-1));
}

/**
 * Ubica una dirección escrita como esquina ("Vega Muñoz 6-72 y Borrero") en el índice
 * de calles. Devuelve {lat, lon} o null si no es una esquina reconocible.
 */
export function ubicarEsquina(texto, indice) {
  const { calles } = interpretarBusqueda(texto);
  if (calles.length !== 2) return null;
  const cruce = cruceDeCalles(buscarCalles(calles[0], indice), buscarCalles(calles[1], indice));
  return cruce ? cruce.punto : null;
}
