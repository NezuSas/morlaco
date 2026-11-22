// Calidad del aire, de la Red de Monitoreo de la EMOV EP (caire.emov.gob.ec). Sin DOM ni red.
//
// La EMOV publica cada hora un índice (ICA) de 0 a 500 por estación: es el más alto de los
// subíndices de los contaminantes que mide esa estación. Las estaciones no miden lo mismo
// (una solo CO y SO2), así que se prefiere la más cercana que mida partículas, que es lo
// que más afecta a la salud en la ciudad.

import { distanciaMetros, horaCuenca } from "./logica.js";

export const URL_AIRE = "https://caire.emov.gob.ec/datos/ica/obtener";
// El índice UV y la temperatura salen de la misma web, de su estación del Centro Histórico.
export const URL_UV = "https://caire.emov.gob.ec/datos/iuv/obtenerUltimoIuv";
export const URL_CLIMA = "https://caire.emov.gob.ec/datos/datos/obtenerUltimosMeteorologico";
export const PAGINA_AIRE = "https://caire.emov.gob.ec/";
// La lluvia de las próximas horas y el índice UV del día, del pronóstico abierto de Open-Meteo
// (CC BY 4.0), en una sola consulta. Se pide siempre para el mismo punto, el centro de Cuenca:
// no se le envía la ubicación de nadie.
export const URL_LLUVIA =
  "https://api.open-meteo.com/v1/forecast?latitude=-2.9&longitude=-79.0&hourly=precipitation_probability,precipitation,uv_index&forecast_days=2&timezone=America%2FGuayaquil";
export const PAGINA_LLUVIA = "https://open-meteo.com/";

/** Un dato más viejo que esto no se muestra: ya no dice cómo está el aire ahora. */
const MAXIMO_HORAS = 4;
const PARTICULAS = new Set(["PM25", "PM10"]);

/** El nivel de la escala (1 buena … 6 peligrosa) que corresponde a un índice. */
export function nivelAire(valor) {
  if (valor <= 50) return 1;
  if (valor <= 100) return 2;
  if (valor <= 150) return 3;
  if (valor <= 200) return 4;
  if (valor <= 300) return 5;
  return 6;
}

/**
 * Las estaciones de la respuesta de la EMOV que tienen un dato reciente y completo.
 * Cualquier cosa rara (sin índice, sin coordenadas, sin contaminantes o con un dato viejo)
 * se descarta: es mejor no mostrar el aire que mostrarlo mal.
 */
export function leerAire(respuesta, ahora = new Date()) {
  const lista = respuesta?.icaEstacionWeb;
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((estacion) => {
    const ica = estacion?.icaEstacion;
    const lugar = estacion?.estacionObjeto;
    const fecha = new Date(estacion?.fecha);
    const parametros = (estacion?.icaParametros ?? [])
      .filter((p) => p?.parametro && Number.isFinite(p.valor))
      .map((p) => ({ nombre: p.parametro, valor: p.valor }));
    if (!Number.isFinite(ica?.valor) || !Number.isFinite(lugar?.latitud) || !Number.isFinite(lugar?.longitud)) return [];
    if (Number.isNaN(fecha.getTime()) || !parametros.length) return [];
    const horas = (ahora - fecha) / 3_600_000;
    if (horas > MAXIMO_HORAS || horas < -1) return [];
    return [
      {
        nombre: estacion.estacion ?? lugar.nombre,
        direccion: lugar.direccion ?? null,
        lat: lugar.latitud,
        lon: lugar.longitud,
        valor: ica.valor,
        nivel: nivelAire(ica.valor),
        fecha,
        parametros,
        // El contaminante que marca el índice: el de subíndice más alto.
        dominante: parametros.reduce((a, b) => (b.valor > a.valor ? b : a)).nombre,
        mideParticulas: parametros.some((p) => PARTICULAS.has(p.nombre)),
        recomendacion: ica.recomendaciones?.[0] ?? null,
      },
    ];
  });
}

/** El nivel del índice UV (1 bajo … 5 extremo), con la escala de la OMS que usa la EMOV. */
export function nivelUv(valor) {
  if (valor <= 2) return 1;
  if (valor <= 5) return 2;
  if (valor <= 7) return 3;
  if (valor <= 10) return 4;
  return 5;
}

const reciente = (fecha, ahora, horas) => {
  const t = new Date(fecha).getTime();
  return Number.isFinite(t) && ahora - t <= horas * 3_600_000 && t - ahora <= 3_600_000;
};

/** El último índice UV, o null si falta o tiene más de dos horas (cambia mucho en poco tiempo). */
export function leerUv(respuesta, ahora = new Date()) {
  const valor = respuesta?.iuvValor;
  if (!Number.isFinite(valor) || valor < 0 || !reciente(respuesta?.fecha, ahora, 2)) return null;
  return { valor: Math.round(valor), nivel: nivelUv(valor), fecha: new Date(respuesta.fecha) };
}

/** La última temperatura y humedad, o null si faltan o tienen más de dos horas. */
export function leerClima(respuesta, ahora = new Date()) {
  const { temperatura, humedad } = respuesta ?? {};
  if (!Number.isFinite(temperatura) || temperatura < -10 || temperatura > 40) return null;
  if (!reciente(respuesta?.fecha, ahora, 2)) return null;
  return {
    temperatura: Math.round(temperatura),
    humedad: Number.isFinite(humedad) ? Math.round(humedad) : null,
    fecha: new Date(respuesta.fecha),
  };
}

/** La estación más cercana al punto, prefiriendo las que miden partículas; null si no hay. */
export function aireCercano(punto, estaciones) {
  const conParticulas = estaciones.filter((e) => e.mideParticulas);
  const candidatas = conParticulas.length ? conParticulas : estaciones;
  let mejor = null;
  for (const estacion of candidatas) {
    const metros = distanciaMetros(punto, estacion);
    if (!mejor || metros < mejor.metros) mejor = { ...estacion, metros: Math.round(metros) };
  }
  return mejor;
}

// Desde cuánto se dice "lluvia probable": la mitad de probabilidad, o que el modelo ya dé agua.
const LLUVIA_PROBABLE = 50;
const LLUVIA_MM = 0.5;

/**
 * La lluvia de las próximas `horas` según el pronóstico por horas: { desde, probabilidad,
 * ahora }. `desde` es la primera hora ("15:00") en que la lluvia es probable, o null si no se
 * espera; `probabilidad`, la de esa hora (o la más alta del tramo); `ahora`, si es esta misma
 * hora. null si la respuesta no trae las horas de hoy.
 */
export function leerLluvia(respuesta, fecha = new Date(), horas = 8) {
  const { time, precipitation_probability: probabilidades, precipitation: milimetros } = respuesta?.hourly ?? {};
  if (!Array.isArray(time) || !Array.isArray(probabilidades)) return null;
  const { fecha: hoy, minutos } = horaCuenca(fecha);
  const inicio = time.indexOf(`${hoy}T${String(Math.floor(minutos / 60)).padStart(2, "0")}:00`);
  if (inicio < 0) return null;
  let maxima = 0;
  for (let i = inicio; i < Math.min(inicio + horas, time.length); i++) {
    const probabilidad = probabilidades[i];
    if (!Number.isFinite(probabilidad)) continue;
    maxima = Math.max(maxima, probabilidad);
    if (probabilidad >= LLUVIA_PROBABLE || (milimetros?.[i] ?? 0) >= LLUVIA_MM) {
      return { desde: time[i].slice(11, 16), probabilidad: Math.round(probabilidad), ahora: i === inicio };
    }
  }
  return { desde: null, probabilidad: Math.round(maxima), ahora: false };
}

/** Desde este índice el sol pide cuidado (la escala de la OMS lo llama "alto"). */
const UV_ALTO = 6;

/**
 * El sol de hoy según el pronóstico por horas: { maximo, nivel, hora, desde, hasta }. `hora`
 * es cuándo llega a su máximo y `desde`-`hasta`, las horas con UV alto o más (null si no las
 * hay). null si la respuesta no trae el día de hoy o si las horas de sol fuerte ya pasaron
 * (de noche no hay nada que advertir).
 */
export function leerUvPronostico(respuesta, fecha = new Date()) {
  const { time, uv_index: indices } = respuesta?.hourly ?? {};
  if (!Array.isArray(time) || !Array.isArray(indices)) return null;
  const { fecha: hoy, minutos } = horaCuenca(fecha);
  const deHoy = time.map((t, i) => ({ t, uv: indices[i] })).filter((h) => h.t.startsWith(hoy) && Number.isFinite(h.uv));
  if (!deHoy.length) return null;
  const pico = deHoy.reduce((a, b) => (b.uv > a.uv ? b : a));
  const altas = deHoy.filter((h) => h.uv >= UV_ALTO);
  const hora = (h) => h.t.slice(11, 16);
  // La franja termina al final de su última hora: "hasta las 14:00" si la última alta es la de las 13.
  const hasta = altas.length ? `${String(Number(hora(altas.at(-1)).slice(0, 2)) + 1).padStart(2, "0")}:00` : null;
  const finDelSol = hasta ?? `${String(Number(hora(pico).slice(0, 2)) + 1).padStart(2, "0")}:00`;
  const [hh, mm] = finDelSol.split(":").map(Number);
  if (minutos >= hh * 60 + mm) return null;
  const maximo = Math.round(pico.uv);
  return { maximo, nivel: nivelUv(maximo), hora: hora(pico), desde: altas.length ? hora(altas[0]) : null, hasta };
}
