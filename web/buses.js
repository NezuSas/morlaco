// Líneas de bus cercanas a un punto y su frecuencia del día. Sin DOM ni red.

import { distanciaALinea, puntosALoLargo } from "./calles.js";
import { aMinutos, horaCuenca, masCercano } from "./logica.js";
import { etiquetaIdioma, t } from "./textos.js";

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

const cajas = new WeakMap();

/** La caja [oeste, sur, este, norte] de un trazado, calculada una vez. */
function cajaDeTrazado(feature) {
  let caja = cajas.get(feature);
  if (!caja) {
    caja = [Infinity, Infinity, -Infinity, -Infinity];
    const g = feature.geometry;
    for (const linea of g.type === "LineString" ? [g.coordinates] : g.coordinates) {
      for (const [lon, lat] of linea) {
        caja = [Math.min(caja[0], lon), Math.min(caja[1], lat), Math.max(caja[2], lon), Math.max(caja[3], lat)];
      }
    }
    cajas.set(feature, caja);
  }
  return caja;
}

/**
 * Las líneas que recorren una calle: su trazado va pegado a ella (a menos de `tolerancia`
 * metros) durante un buen tramo, no solo la cruza. Devuelve cada línea con los metros de
 * la calle que recorre, de la que más a la que menos.
 */
export function lineasPorCalle(calle, lineas, rutas = [], { tolerancia = 22, minimoMetros = 150, fecha = new Date() } = {}) {
  const puntos = puntosALoLargo(calle);
  if (!puntos.length) return [];
  const largo = puntos.reduce((total, p) => total + p.metros, 0);
  const margen = 0.0004; // unos 45 m, para descartar pronto los trazados lejanos
  const oeste = Math.min(...puntos.map((p) => p.lon)) - margen;
  const este = Math.max(...puntos.map((p) => p.lon)) + margen;
  const sur = Math.min(...puntos.map((p) => p.lat)) - margen;
  const norte = Math.max(...puntos.map((p) => p.lat)) + margen;

  const porLinea = new Map();
  for (const feature of lineas.features) {
    const p = feature.properties;
    const grupo = porLinea.get(p.linea) ?? { linea: p.linea, tipo: p.tipo, metros: 0, destinos: [], trazados: [] };
    grupo.trazados.push(feature);
    if (p.tipo !== "alargue") {
      if (!grupo.destinos.includes(p.hacia)) grupo.destinos.push(p.hacia);
      grupo.tipo = p.tipo;
    }
    porLinea.set(p.linea, grupo);
    const caja = cajaDeTrazado(feature);
    if (caja[0] > este || caja[2] < oeste || caja[1] > norte || caja[3] < sur) continue;
    let recorre = 0;
    for (const punto of puntos) {
      if (distanciaALinea(punto, feature.geometry) <= tolerancia) recorre += punto.metros;
    }
    grupo.metros = Math.max(grupo.metros, recorre);
  }
  // En una calle corta basta con recorrer la mitad.
  const minimo = Math.min(minimoMetros, largo / 2);
  return [...porLinea.values()]
    .filter((g) => g.metros >= minimo)
    .sort((a, b) => ordenLinea(a.linea) - ordenLinea(b.linea))
    .map((g) => ({
      ...g,
      metros: Math.round(g.metros),
      horario: g.tipo === "tranvia" ? undefined : horarioDeHoy(g.linea, rutas, fecha),
    }));
}

/**
 * Los avisos de cambios recientes de una línea (datos/manual/transporte.json) que
 * siguen vigentes hoy: se dejan de mostrar después de su fecha "hasta".
 */
export function avisosDeLinea(avisos, linea, fecha = new Date()) {
  const hoy = horaCuenca(fecha).fecha;
  return (avisos ?? []).filter((a) => a.lineas.includes(linea) && hoy <= a.hasta);
}

/** Cada cuántos minutos pasa hoy el tranvía, según la frecuencia publicada. */
export function frecuenciaTranvia(tranvia, fecha = new Date()) {
  const frecuencia = tranvia?.frecuencia_min;
  if (!frecuencia) return null;
  return tipoDeDia(fecha) === "lunes_viernes" ? frecuencia.lunes_viernes : frecuencia.fin_de_semana;
}

/** La estación del tranvía más cercana (hasta 800 m), con su distancia. */
export function estacionCercana(punto, estaciones) {
  return masCercano(punto, estaciones, 800);
}

/**
 * Lo que cuesta una opción de ruta con tarjeta personalizada: cada bus se paga
 * (el subsidio vuelve a aplicarse al cambiar de bus) y el tranvía tiene su tarifa.
 * null si no hay tarifas o si se va a pie.
 */
export function pasajeDeOpcion(opcion, tarifas) {
  if (!tarifas?.bus || !tarifas?.tranvia) return null;
  const tramos = opcion.tramos.filter((tramo) => tramo.modo === "bus");
  if (!tramos.length) return null;
  const total = tramos.reduce(
    (suma, tramo) => suma + (tramo.tipo === "tranvia" ? tarifas.tranvia.normal : tarifas.bus.personalizada),
    0,
  );
  return Math.round(total * 100) / 100;
}

/** "$0,30" en español, "$0.30" en inglés. */
export function dolares(valor) {
  return new Intl.NumberFormat(etiquetaIdioma(), { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol" }).format(valor);
}

/** "Entre Mall del Rio y Trigales Altos" o, con un solo destino, "Hacia Banos". */
export function describirDestinos(destinos) {
  if (destinos.length >= 2) return t("destinosEntre", { a: destinos[0], b: destinos[1] });
  if (destinos.length === 1) return t("destinosHacia", { a: destinos[0] });
  return "";
}
