// Lógica pura de la página: sin DOM ni red, para poder probarla con `node --test`.

export const CENTRO_CUENCA = { lat: -2.8975, lon: -79.0045 };

const NOMBRES_DIA = {
  1: "lunes",
  2: "martes",
  3: "miércoles",
  4: "jueves",
  5: "viernes",
  6: "sábado",
  7: "domingo",
};

// Cuenca está en UTC-5 todo el año (Ecuador no cambia la hora).
const DESFASE_CUENCA_MS = -5 * 60 * 60 * 1000;

export function nombreDia(diaIso) {
  return NOMBRES_DIA[diaIso];
}

/** Día de la semana (1 = lunes), minutos desde medianoche y fecha, en hora de Cuenca. */
export function horaCuenca(fecha = new Date()) {
  const local = new Date(fecha.getTime() + DESFASE_CUENCA_MS);
  const diaSemana = local.getUTCDay();
  return {
    diaIso: diaSemana === 0 ? 7 : diaSemana,
    minutos: local.getUTCHours() * 60 + local.getUTCMinutes(),
    fecha: local.toISOString().slice(0, 10),
  };
}

export function aMinutos(hhmm) {
  const [horas, minutos] = hhmm.split(":").map(Number);
  return horas * 60 + minutos;
}

function dentroDeAnillo(lon, lat, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    const cruza = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

function dentroDePoligono(lon, lat, anillos) {
  const [exterior, ...huecos] = anillos;
  return dentroDeAnillo(lon, lat, exterior) && !huecos.some((h) => dentroDeAnillo(lon, lat, h));
}

export function puntoEnGeometria(lon, lat, geometria) {
  if (!geometria) return false;
  if (geometria.type === "Polygon") return dentroDePoligono(lon, lat, geometria.coordinates);
  if (geometria.type === "MultiPolygon") {
    return geometria.coordinates.some((p) => dentroDePoligono(lon, lat, p));
  }
  return false;
}

/** La zona de recolección que contiene el punto, o null si cae fuera de todas. */
export function zonaDe(lon, lat, zonas) {
  return zonas.features.find((z) => puntoEnGeometria(lon, lat, z.geometry)) ?? null;
}

/**
 * Cuándo toca la próxima recolección en una zona.
 * estado: "ahora" (está pasando), "hoy" (más tarde hoy) o "proxima" (otro día).
 */
export function proximaRecoleccion(zona, fecha = new Date()) {
  const { diaIso, minutos } = horaCuenca(fecha);
  const desde = aMinutos(zona.desde);
  const hasta = aMinutos(zona.hasta);
  const dias = zona.dias_iso;
  const reciclaje = zona.dia_reciclaje ? dias[zona.dias.indexOf(zona.dia_reciclaje)] : null;
  const resultado = (estado, dia, enDias) => ({
    estado,
    diaIso: dia,
    enDias,
    desde: zona.desde,
    hasta: zona.hasta,
    conReciclaje: dia === reciclaje,
  });

  if (dias.includes(diaIso)) {
    if (minutos < desde) return resultado("hoy", diaIso, 0);
    if (minutos < hasta) return resultado("ahora", diaIso, 0);
  }
  for (let enDias = 1; enDias <= 7; enDias++) {
    const dia = ((diaIso - 1 + enDias) % 7) + 1;
    if (dias.includes(dia)) return resultado("proxima", dia, enDias);
  }
  return null;
}

/** "Hoy, de 20:00 a 24:00", "Mañana, de 08:00 a 12:00", "El viernes, de ...". */
export function describirRecoleccion(proxima) {
  const franja = `de ${proxima.desde} a ${proxima.hasta}`;
  if (proxima.estado === "ahora") return `Pasando ahora, hasta las ${proxima.hasta}`;
  if (proxima.estado === "hoy") return `Hoy, ${franja}`;
  if (proxima.enDias === 1) return `Mañana, ${franja}`;
  return `El ${nombreDia(proxima.diaIso)}, ${franja}`;
}

function normalizar(texto) {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function diasEntre(fechaA, fechaB) {
  return Math.round((Date.parse(fechaB) - Date.parse(fechaA)) / 86_400_000);
}

/**
 * Situación de los cortes de luz programados para hoy.
 * Centro Sur no siempre actualiza su página, así que se informa cuántos días
 * lleva sin publicar para no dar por bueno un "no hay cortes" que puede ser falso.
 */
export function estadoLuz(suspensiones, fecha = new Date()) {
  const hoy = horaCuenca(fecha).fecha;
  const ultima = suspensiones?.metadata?.ultima_publicacion ?? null;
  const publicacionHoy = (suspensiones?.publicaciones ?? []).find((p) => p.fecha === hoy);
  return {
    hoy,
    ultima,
    diasSinPublicar: ultima ? diasEntre(ultima, hoy) : null,
    publicadoHoy: Boolean(publicacionHoy),
    cortesHoy: publicacionHoy?.cortes ?? [],
  };
}

/** Cortes cuya dirección contiene el texto buscado, sin importar tildes ni mayúsculas. */
export function filtrarCortes(cortes, texto) {
  const buscado = normalizar(texto);
  if (!buscado) return cortes;
  return cortes.filter((c) => normalizar(c.direccion).includes(buscado));
}

export function distanciaMetros(a, b) {
  const radio = 6_371_000;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * radio * Math.asin(Math.sqrt(h));
}

/**
 * Las paradas más cercanas a un punto, con su distancia en metros. Las paradas
 * con el mismo nombre (una a cada lado de la calle) cuentan una sola vez.
 */
export function paradasCercanas(punto, paradas, cantidad = 3, maximoMetros = 1500) {
  const vistas = new Set();
  return paradas.features
    .map((p) => {
      const [lon, lat] = p.geometry.coordinates;
      return { ...p.properties, lon, lat, metros: Math.round(distanciaMetros(punto, { lat, lon })) };
    })
    .filter((p) => p.metros <= maximoMetros)
    .sort((a, b) => a.metros - b.metros)
    .filter((p) => {
      const nombre = normalizar(p.ubicacion);
      if (nombre && vistas.has(nombre)) return false;
      vistas.add(nombre);
      return true;
    })
    .slice(0, cantidad);
}

const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "a", "en"]);
const SIGLAS = new Set(["av", "av.", "cdla", "cdla."]);

/**
 * Las fuentes escriben las direcciones en mayúsculas. Esto las deja legibles:
 * "CALLE GASPAR SANGURIMA INTERSECCION LUIS CORDERO" -> "Calle Gaspar Sangurima y Luis Cordero".
 */
export function direccionLegible(texto) {
  return (texto ?? "")
    .trim()
    .replace(/\s+INTERSECCI[OÓ]N\s+/gi, " y ")
    .toLowerCase()
    .split(/\s+/)
    .map((palabra, i) => {
      if (i > 0 && MINUSCULAS.has(palabra)) return palabra;
      if (SIGLAS.has(palabra)) return palabra[0].toUpperCase() + palabra.slice(1);
      return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    })
    .join(" ");
}

/** "350 m", "1,2 km". */
export function formatoDistancia(metros) {
  if (metros < 1000) return `${Math.round(metros / 10) * 10} m`;
  return `${(metros / 1000).toFixed(1).replace(".", ",")} km`;
}

/** Lee "#-2.89733,-79.00454" (lat,lon). Devuelve null si no es un punto válido. */
export function puntoDesdeHash(hash) {
  const coincidencia = /^#?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(hash ?? "");
  if (!coincidencia) return null;
  const lat = Number(coincidencia[1]);
  const lon = Number(coincidencia[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function hashDesdePunto({ lat, lon }) {
  return `#${lat.toFixed(5)},${lon.toFixed(5)}`;
}
