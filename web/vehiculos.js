// Dónde va cada bus de una línea, estimado con su frecuencia: en Cuenca no hay GPS público
// de los buses. Un bus sale del inicio del recorrido cada `intervalo_min` minutos, desde la
// hora de inicio hasta la de fin, y avanza a una velocidad media. Sin DOM ni red.

import { aMinutos, distanciaMetros, horaCuenca } from "./logica.js";

// Velocidad media de un bus urbano en Cuenca, con paradas y tráfico.
export const VELOCIDAD_KMH = 15;

/** Los minutos del día en Cuenca, con fracción para que el movimiento sea continuo. */
export function minutosDelDia(fecha = new Date()) {
  return horaCuenca(fecha).minutos + (fecha.getUTCSeconds() + fecha.getUTCMilliseconds() / 1000) / 60;
}

/** Los puntos de un trazado en orden, sea LineString o MultiLineString. */
export function puntosDeTrazado(geometria) {
  if (!geometria) return [];
  if (geometria.type === "LineString") return geometria.coordinates;
  if (geometria.type === "MultiLineString") return geometria.coordinates.flat();
  return [];
}

/** Los metros acumulados en cada punto del recorrido y el largo total. */
export function medirRecorrido(coords) {
  const acumulado = [0];
  for (let i = 1; i < coords.length; i++) {
    const [a, b] = [coords[i - 1], coords[i]];
    acumulado.push(acumulado[i - 1] + distanciaMetros({ lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] }));
  }
  return { coords, acumulado, total: acumulado.at(-1) ?? 0 };
}

/**
 * El punto a `metros` del inicio del recorrido y su rumbo en grados (0 = norte, 90 = este),
 * para orientar la flecha del bus.
 */
export function puntoEnRecorrido({ coords, acumulado, total }, metros) {
  if (coords.length < 2) return coords.length ? { lon: coords[0][0], lat: coords[0][1], rumbo: 0 } : null;
  const m = Math.min(Math.max(metros, 0), total);
  let i = 1;
  while (i < acumulado.length - 1 && acumulado[i] < m) i++;
  const [a, b] = [coords[i - 1], coords[i]];
  const tramo = acumulado[i] - acumulado[i - 1];
  const r = tramo ? (m - acumulado[i - 1]) / tramo : 0;
  const lon = a[0] + (b[0] - a[0]) * r;
  const lat = a[1] + (b[1] - a[1]) * r;
  const este = (b[0] - a[0]) * Math.cos((lat * Math.PI) / 180);
  const norte = b[1] - a[1];
  const rumbo = ((Math.atan2(este, norte) * 180) / Math.PI + 360) % 360;
  return { lon, lat, rumbo };
}

/**
 * Los metros que lleva recorridos cada bus que está en camino a esta hora, según el horario
 * del día ({ inicio, fin, intervalo_min }). Vacío fuera del horario o sin frecuencia.
 */
export function busesEnCamino(horario, largoMetros, fecha = new Date(), velocidadKmH = VELOCIDAD_KMH) {
  if (!horario?.inicio || !horario?.fin || !horario?.intervalo_min || !(largoMetros > 0)) return [];
  const ahora = minutosDelDia(fecha);
  const inicio = aMinutos(horario.inicio);
  const fin = aMinutos(horario.fin);
  const cada = horario.intervalo_min;
  const duracion = (largoMetros / 1000 / velocidadKmH) * 60;
  const salida = (k) => inicio + k * cada;
  const primero = Math.max(0, Math.ceil((ahora - duracion - inicio) / cada));
  const ultimo = Math.floor((Math.min(ahora, fin) - inicio) / cada);
  const metros = [];
  for (let k = primero; k <= ultimo; k++) {
    const transcurrido = ahora - salida(k);
    if (transcurrido >= 0 && transcurrido <= duracion) metros.push((transcurrido / duracion) * largoMetros);
  }
  return metros;
}

/**
 * Minutos que faltan para que el próximo bus pase a `metros` del inicio del recorrido
 * (la parada donde se sube), o null si hoy ya no sale ninguno que llegue.
 */
export function minutosAlProximo(horario, largoMetros, metros, fecha = new Date(), velocidadKmH = VELOCIDAD_KMH) {
  if (!horario?.inicio || !horario?.fin || !horario?.intervalo_min || !(largoMetros > 0)) return null;
  const ahora = minutosDelDia(fecha);
  const viaje = (Math.min(Math.max(metros, 0), largoMetros) / 1000 / velocidadKmH) * 60;
  const inicio = aMinutos(horario.inicio);
  const cada = horario.intervalo_min;
  const k = Math.max(0, Math.ceil((ahora - viaje - inicio) / cada));
  const salida = inicio + k * cada;
  if (salida > aMinutos(horario.fin)) return null;
  return salida + viaje - ahora;
}
