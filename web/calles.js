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
  let mejor = { metros: Infinity, punto: null };
  const segB = segmentos(featureB);
  for (const sa of segmentos(featureA)) {
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
