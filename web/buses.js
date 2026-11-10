// Líneas de bus cercanas a un punto y su frecuencia del día. Sin DOM ni red.

import { distanciaALinea } from "./calles.js";
import { aMinutos, horaCuenca } from "./logica.js";
import { t } from "./textos.js";

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
 * servicio a esta hora, "Hoy de 05:50 a 21:15; a esta hora ya no pasa".
 */
export function describirFrecuencia(horario, fecha = new Date()) {
  if (horario === undefined) return t("frecuenciaSinHorario");
  if (horario === null) return t("frecuenciaSinServicio");
  const { inicio, fin } = horario;
  const franja = inicio && fin ? t("frecuenciaFranja", { inicio, fin }) : "";
  const { minutos } = horaCuenca(fecha);
  if (inicio && fin) {
    if (minutos > aMinutos(fin)) return t("frecuenciaYaNo", { franja });
    if (minutos < aMinutos(inicio)) return t("frecuenciaEmpieza", { inicio, franja });
  }
  const cada = horario.intervalo_min ? t("frecuenciaCada", { minutos: horario.intervalo_min }) : t("frecuenciaPasa");
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
  if (destinos.length >= 2) return t("destinosEntre", { a: destinos[0], b: destinos[1] });
  if (destinos.length === 1) return t("destinosHacia", { a: destinos[0] });
  return "";
}
