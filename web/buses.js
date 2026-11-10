// Líneas de bus cercanas a un punto y su frecuencia del día. Sin DOM ni red.

import { distanciaALinea } from "./calles.js";
import { aMinutos, horaCuenca } from "./logica.js";

/** Qué columna de horarios aplica: lunes a viernes, sábados o domingos (hora de Cuenca). */
export function tipoDeDia(fecha = new Date()) {
  const { diaIso } = horaCuenca(fecha);
  return diaIso <= 5 ? "lunes_viernes" : diaIso === 6 ? "sabados" : "domingos";
}

/** El horario de hoy de una línea según rutas.json (se toma el sentido de ida). */
export function horarioDeHoy(linea, rutas, fecha = new Date()) {
  const filas = rutas.filter((r) => r.linea === linea);
  if (!filas.length) return undefined; // la línea no está en el CSV de horarios
  const fila = filas.find((r) => r.sentido === "ida") ?? filas[0];
  return fila.horarios?.[tipoDeDia(fecha)] ?? null; // null: hoy no tiene servicio
}

/**
 * Cómo leer la frecuencia de hoy: "Cada 9 min, de 05:50 a 21:15", o si ya no hay
 * servicio a esta hora, "Hoy, de 05:50 a 21:15 (ya no pasa)".
 */
export function describirFrecuencia(horario, fecha = new Date()) {
  if (horario === undefined) return "Sin horario publicado";
  if (horario === null) return "Hoy no tiene servicio";
  const franja = horario.inicio && horario.fin ? `de ${horario.inicio} a ${horario.fin}` : "";
  const { minutos } = horaCuenca(fecha);
  if (horario.inicio && horario.fin) {
    if (minutos > aMinutos(horario.fin)) return `Hoy ${franja}; a esta hora ya no pasa`;
    if (minutos < aMinutos(horario.inicio)) return `Empieza a las ${horario.inicio}; hoy ${franja}`;
  }
  const cada = horario.intervalo_min ? `Cada ${horario.intervalo_min} min` : "Pasa";
  return [cada, franja].filter(Boolean).join(", ");
}

function ordenLinea(linea) {
  const numero = /^\d+/.exec(linea);
  return numero ? Number(numero[0]) : linea === "Tranvía" ? -1 : 10_000;
}

/**
 * Las líneas cuyo trazado pasa a menos de `maximoMetros` del punto, de la más cercana a la
 * más lejana. Cada una trae sus destinos (de los recorridos principales, no de los alargues),
 * los trazados para dibujarla y su horario de hoy.
 */
export function lineasCercanas(punto, lineas, rutas = [], { maximoMetros = 350, fecha = new Date() } = {}) {
  const porLinea = new Map();
  for (const feature of lineas.features) {
    const p = feature.properties;
    const metros = distanciaALinea(punto, feature.geometry);
    const grupo = porLinea.get(p.linea) ?? { linea: p.linea, tipo: p.tipo, metros: Infinity, destinos: [], trazados: [] };
    grupo.trazados.push(feature);
    if (p.tipo !== "alargue") {
      if (!grupo.destinos.includes(p.hacia)) grupo.destinos.push(p.hacia);
      grupo.tipo = p.tipo;
    }
    grupo.metros = Math.min(grupo.metros, metros);
    porLinea.set(p.linea, grupo);
  }
  return [...porLinea.values()]
    .filter((g) => g.metros <= maximoMetros)
    .sort((a, b) => a.metros - b.metros || ordenLinea(a.linea) - ordenLinea(b.linea))
    .map((g) => ({
      ...g,
      metros: Math.round(g.metros),
      horario: g.tipo === "tranvia" ? undefined : horarioDeHoy(g.linea, rutas, fecha),
    }));
}

/** "Entre Mall del Rio y Trigales Altos" o, con un solo destino, "Hacia Banos". */
export function describirDestinos(destinos) {
  if (destinos.length >= 2) return `Entre ${destinos[0]} y ${destinos[1]}`;
  if (destinos.length === 1) return `Hacia ${destinos[0]}`;
  return "";
}
