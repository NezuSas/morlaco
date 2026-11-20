// Lugares guardados en este navegador: el último punto consultado, "Casa" y "Trabajo".
// Lógica pura (sin localStorage ni DOM), para poder probarla con `node --test`.

import { palabras } from "./calles.js";
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

// ---------- Lugares conocidos (datos/manual/lugares.json) ----------

const clave = (texto) => palabras(texto).join(" ");

/**
 * Los lugares conocidos que encajan con lo escrito: cada palabra escrita es el comienzo
 * de alguna palabra del nombre ("termin terr" → Terminal Terrestre).
 */
export function sugerirLugares(texto, lugares, maximo = 4) {
  const buscadas = palabras(texto);
  if (!lugares?.length || buscadas.join("").length < 3) return [];
  return lugares
    .filter((l) => {
      const delNombre = palabras(l.nombre);
      return buscadas.every((b) => delNombre.some((p) => p.startsWith(b)));
    })
    .slice(0, maximo);
}

/** El lugar conocido con ese nombre exacto (sin tildes ni mayúsculas), o null. */
export function lugarPorNombre(texto, lugares) {
  const buscada = clave(texto);
  return (buscada && lugares?.find((l) => clave(l.nombre) === buscada)) || null;
}

// ---------- Último destino de "¿qué bus me lleva?" ----------

export const HORAS_DESTINO = 12;

/** El destino escrito, con la hora en que se buscó, para guardarlo en el navegador. */
export function textoDeDestino(texto, ahora = Date.now()) {
  return JSON.stringify({ texto, guardado: ahora });
}

/**
 * El último destino guardado, si se buscó hace menos de `horas`: así, al recargar la página
 * en la parada se ve otra vez la ruta, pero al día siguiente no sale la de ayer.
 */
export function leerDestino(guardado, ahora = Date.now(), horas = HORAS_DESTINO) {
  if (!guardado) return null;
  try {
    const { texto, guardado: cuando } = JSON.parse(guardado);
    if (typeof texto !== "string" || !texto.trim() || !Number.isFinite(cuando)) return null;
    if (cuando > ahora || ahora - cuando > horas * 3_600_000) return null;
    return texto.trim();
  } catch {
    return null;
  }
}
