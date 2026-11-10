// Lugares guardados en este navegador: el último punto consultado, "Casa" y "Trabajo".
// Lógica pura (sin localStorage ni DOM), para poder probarla con `node --test`.

import { distanciaMetros, puntoDesdeHash } from "./logica.js";

export const LUGARES = ["casa", "trabajo"];

function puntoValido(p) {
  return (
    p !== null &&
    typeof p === "object" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180
  );
}

function limpio(p) {
  return { lat: p.lat, lon: p.lon, nombre: typeof p.nombre === "string" && p.nombre.trim() ? p.nombre.trim() : null };
}

/**
 * Un lugar guardado. Se guarda como JSON {lat, lon, nombre}; las versiones anteriores
 * guardaban solo "#lat,lon", que también se lee (sin nombre).
 */
export function leerLugar(texto) {
  if (!texto) return null;
  try {
    const dato = JSON.parse(texto);
    if (puntoValido(dato)) return limpio(dato);
  } catch {
    // No es JSON: puede ser el formato antiguo.
  }
  const punto = puntoDesdeHash(texto);
  return punto ? { ...punto, nombre: null } : null;
}

export function textoDeLugar(punto, nombre) {
  return JSON.stringify({
    lat: Number(punto.lat.toFixed(5)),
    lon: Number(punto.lon.toFixed(5)),
    nombre: nombre ?? null,
  });
}

/** {casa, trabajo}, cada uno con {lat, lon, nombre} o null. Ignora lo que no sea válido. */
export function leerLugares(texto) {
  let dato = null;
  try {
    dato = JSON.parse(texto ?? "null");
  } catch {
    dato = null;
  }
  return Object.fromEntries(
    LUGARES.map((clave) => [clave, puntoValido(dato?.[clave]) ? limpio(dato[clave]) : null]),
  );
}

/** Una copia de los lugares con `clave` cambiado (o borrado, si `punto` es null). */
export function cambiarLugar(lugares, clave, punto, nombre = null) {
  if (!LUGARES.includes(clave)) throw new Error(`Lugar desconocido: ${clave}`);
  return {
    ...lugares,
    [clave]: punto
      ? limpio({ lat: Number(punto.lat.toFixed(5)), lon: Number(punto.lon.toFixed(5)), nombre })
      : null,
  };
}

/** Qué lugar guardado es este punto (a `maximo` metros o menos), o null. */
export function lugarDe(punto, lugares, maximo = 40) {
  let mejor = null;
  for (const clave of LUGARES) {
    const lugar = lugares?.[clave];
    if (!lugar) continue;
    const metros = distanciaMetros(punto, lugar);
    if (metros <= maximo && (!mejor || metros < mejor.metros)) mejor = { clave, metros };
  }
  return mejor?.clave ?? null;
}
