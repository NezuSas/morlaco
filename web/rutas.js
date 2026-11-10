// "¿Qué bus me lleva?": busca cómo ir de un punto a otro en bus por Cuenca. Sin DOM ni red.
//
// Usa el recorrido de cada línea en cada sentido (datos/buses/lineas.geojson) y su
// frecuencia del día (datos/buses/rutas.json). Las opciones son:
//   - directas: una línea que pasa cerca del origen y, más adelante en su recorrido,
//     cerca del destino;
//   - con un transbordo: dos líneas cuyos recorridos se acercan entre sí;
//   - a pie, si el destino está cerca.
// Los tiempos son estimados: el municipio no publica tiempos de viaje.

import { horarioDeHoy } from "./buses.js";
import { aMinutos, horaCuenca } from "./logica.js";

const METROS_POR_GRADO = 111_320;
const COS_CUENCA = Math.cos((-2.9 * Math.PI) / 180);

export const AJUSTES = {
  caminarMaximo: 500, // metros hasta una línea, al subir o al bajar
  transbordoMaximo: 200, // metros entre dos líneas para cambiar
  aPieMaximo: 1500, // por debajo de esto se ofrece ir caminando
  velocidadBus: 15, // km/h, la misma media que el GTFS
  velocidadPie: 4.5, // km/h
  esperaSinDatos: 10, // minutos de espera si no hay frecuencia publicada
  candidatosTransbordo: 12,
  maximoOpciones: 3,
};

const aMetros = ([lon, lat]) => [lon * METROS_POR_GRADO * COS_CUENCA, lat * METROS_POR_GRADO];
const aGrados = ([x, y]) => [x / (METROS_POR_GRADO * COS_CUENCA), y / METROS_POR_GRADO];
const distancia = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Prepara cada recorrido (línea y sentido) en metros, con la distancia acumulada. */
export function prepararLineas(lineas, rutas = [], fecha = new Date()) {
  return lineas.features
    .filter((f) => f.properties.tipo !== "alargue")
    .map((f) => {
      const coords = f.geometry.type === "LineString" ? f.geometry.coordinates : f.geometry.coordinates.flat();
      const puntos = coords.map(aMetros);
      const acumulado = [0];
      for (let i = 1; i < puntos.length; i++) acumulado.push(acumulado[i - 1] + distancia(puntos[i - 1], puntos[i]));
      const p = f.properties;
      return {
        linea: p.linea,
        tipo: p.tipo,
        hacia: p.hacia,
        sentido: p.sentido,
        puntos,
        acumulado,
        horario: p.tipo === "tranvia" ? undefined : horarioDeHoy(p.linea, rutas, fecha),
      };
    });
}

/** El punto del recorrido más cercano: metros desde el inicio, distancia y coordenadas. */
export function proyectar(punto, recorrido, desde = 0, hasta = Infinity) {
  const p = aMetros([punto.lon, punto.lat]);
  let mejor = { metros: Infinity, a: 0, q: null };
  const { puntos, acumulado } = recorrido;
  for (let i = 1; i < puntos.length; i++) {
    if (acumulado[i] < desde || acumulado[i - 1] > hasta) continue;
    const [a, b] = [puntos[i - 1], puntos[i]];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const largo2 = dx * dx + dy * dy;
    const largo = acumulado[i] - acumulado[i - 1];
    // Solo la parte del segmento que queda entre `desde` y `hasta`.
    const tMin = largo ? Math.max(0, (desde - acumulado[i - 1]) / largo) : 0;
    const tMax = largo ? Math.min(1, (hasta - acumulado[i - 1]) / largo) : 1;
    let t = largo2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / largo2 : 0;
    t = Math.max(tMin, Math.min(tMax, t));
    const enRecorrido = acumulado[i - 1] + t * largo;
    const q = [a[0] + t * dx, a[1] + t * dy];
    const metros = distancia(p, q);
    if (metros < mejor.metros) mejor = { metros, a: enRecorrido, q };
  }
  if (!mejor.q) return null;
  const [lon, lat] = aGrados(mejor.q);
  return { distancia: mejor.metros, recorrido: mejor.a, punto: { lat, lon } };
}

/** El tramo del recorrido entre dos distancias, como coordenadas [lon, lat]. */
export function tramo(recorrido, desde, hasta) {
  const { puntos, acumulado } = recorrido;
  const interpolar = (metros) => {
    for (let i = 1; i < puntos.length; i++) {
      if (acumulado[i] >= metros) {
        const largo = acumulado[i] - acumulado[i - 1];
        const t = largo ? (metros - acumulado[i - 1]) / largo : 0;
        return [puntos[i - 1][0] + t * (puntos[i][0] - puntos[i - 1][0]), puntos[i - 1][1] + t * (puntos[i][1] - puntos[i - 1][1])];
      }
    }
    return puntos.at(-1);
  };
  const medio = puntos.filter((_, i) => acumulado[i] > desde && acumulado[i] < hasta);
  return [interpolar(desde), ...medio, interpolar(hasta)].map(aGrados);
}

/** Minutos de espera: media frecuencia si pasa a esta hora; null si hoy ya no pasa (o aún no empieza). */
function espera(horario, fecha, ajustes) {
  if (horario === null) return null; // hoy no tiene servicio
  if (!horario) return ajustes.esperaSinDatos; // sin horario publicado (tranvía, por ejemplo)
  const { minutos } = horaCuenca(fecha);
  if (horario.inicio && horario.fin && (minutos < aMinutos(horario.inicio) || minutos > aMinutos(horario.fin))) {
    return null;
  }
  return horario.intervalo_min ? horario.intervalo_min / 2 : ajustes.esperaSinDatos;
}

const minutosPie = (metros, ajustes) => metros / ((ajustes.velocidadPie * 1000) / 60);
const minutosBus = (metros, ajustes) => metros / ((ajustes.velocidadBus * 1000) / 60);

function tramoBus(recorrido, subida, bajada, fecha, ajustes) {
  return {
    modo: "bus",
    linea: recorrido.linea,
    tipo: recorrido.tipo,
    hacia: recorrido.hacia,
    horario: recorrido.horario,
    espera: espera(recorrido.horario, fecha, ajustes),
    metros: bajada.recorrido - subida.recorrido,
    subida: subida.punto,
    bajada: bajada.punto,
    coords: tramo(recorrido, subida.recorrido, bajada.recorrido),
  };
}

function tramoPie(desde, hasta, metros) {
  return { modo: "caminar", metros, desde, hasta };
}

/** Minutos totales; las opciones con un bus que ya no pasa a esta hora quedan al final. */
function totalizar(tramos, ajustes) {
  let minutos = 0;
  let fueraDeHorario = false;
  for (const t of tramos) {
    if (t.modo === "caminar") minutos += minutosPie(t.metros, ajustes);
    else {
      minutos += minutosBus(t.metros, ajustes);
      if (t.espera === null) fueraDeHorario = true;
      else minutos += t.espera;
    }
  }
  return { minutos: Math.round(minutos), fueraDeHorario };
}

function directas(origen, destino, recorridos, fecha, ajustes) {
  const recta = distancia(aMetros([origen.lon, origen.lat]), aMetros([destino.lon, destino.lat]));
  const opciones = [];
  for (const r of recorridos) {
    const subida = proyectar(origen, r);
    if (!subida || subida.distancia > ajustes.caminarMaximo) continue;
    const bajada = proyectar(destino, r, subida.recorrido + 1);
    if (!bajada || bajada.distancia > ajustes.caminarMaximo) continue;
    const enBus = bajada.recorrido - subida.recorrido;
    // Descarta vueltas absurdas (una línea que da toda la vuelta a la ciudad).
    if (enBus < 150 || enBus > 2.5 * recta + 1500) continue;
    const tramos = [
      tramoPie(origen, subida.punto, subida.distancia),
      tramoBus(r, subida, bajada, fecha, ajustes),
      tramoPie(bajada.punto, destino, bajada.distancia),
    ];
    opciones.push({ tipo: "directa", tramos, ...totalizar(tramos, ajustes) });
  }
  return opciones;
}

/** Dónde se acercan más el recorrido A (después de `desdeA`) y el B (antes de `hastaB`). */
function encuentro(a, b, desdeA, hastaB) {
  let mejor = null;
  for (let i = 0; i < a.puntos.length; i++) {
    if (a.acumulado[i] <= desdeA + 100) continue;
    const [lon, lat] = aGrados(a.puntos[i]);
    const enB = proyectar({ lat, lon }, b, 0, hastaB - 100);
    if (enB && (!mejor || enB.distancia < mejor.enB.distancia)) {
      mejor = { enA: { distancia: 0, recorrido: a.acumulado[i], punto: { lat, lon } }, enB };
    }
  }
  return mejor;
}

function conTransbordo(origen, destino, recorridos, fecha, ajustes) {
  const cerca = (punto) =>
    recorridos
      .map((r) => ({ r, p: proyectar(punto, r) }))
      .filter((x) => x.p && x.p.distancia <= ajustes.caminarMaximo)
      .sort((x, y) => x.p.distancia - y.p.distancia)
      .slice(0, ajustes.candidatosTransbordo);
  const desdeOrigen = cerca(origen);
  const hastaDestino = cerca(destino);
  const opciones = [];
  for (const { r: a, p: subida } of desdeOrigen) {
    for (const { r: b, p: bajada } of hastaDestino) {
      if (a.linea === b.linea) continue;
      const cruce = encuentro(a, b, subida.recorrido, bajada.recorrido);
      if (!cruce || cruce.enB.distancia > ajustes.transbordoMaximo) continue;
      const tramos = [
        tramoPie(origen, subida.punto, subida.distancia),
        tramoBus(a, subida, cruce.enA, fecha, ajustes),
        tramoPie(cruce.enA.punto, cruce.enB.punto, cruce.enB.distancia),
        tramoBus(b, cruce.enB, bajada, fecha, ajustes),
        tramoPie(bajada.punto, destino, bajada.distancia),
      ];
      if (tramos[1].metros < 150 || tramos[3].metros < 150) continue;
      opciones.push({ tipo: "transbordo", tramos, ...totalizar(tramos, ajustes) });
    }
  }
  return opciones;
}

/**
 * Las mejores formas de ir de `origen` a `destino` ({lat, lon}), de la más rápida a la más
 * lenta. Las opciones con un bus que ya no pasa a esta hora van al final.
 */
export function planificar(origen, destino, recorridos, { fecha = new Date(), ajustes: propios = {} } = {}) {
  const ajustes = { ...AJUSTES, ...propios };
  const recta = distancia(aMetros([origen.lon, origen.lat]), aMetros([destino.lon, destino.lat]));
  let opciones = directas(origen, destino, recorridos, fecha, ajustes);
  if (opciones.length < 2) opciones = opciones.concat(conTransbordo(origen, destino, recorridos, fecha, ajustes));
  if (recta <= ajustes.aPieMaximo) {
    const tramos = [tramoPie(origen, destino, recta * 1.3)]; // las calles no van en línea recta
    opciones.push({ tipo: "pie", tramos, ...totalizar(tramos, ajustes) });
  }
  // Una sola opción por línea (o pareja de líneas): la más rápida.
  const clave = (o) => o.tramos.filter((t) => t.modo === "bus").map((t) => t.linea).join(">") || "pie";
  const mejores = new Map();
  for (const o of opciones) {
    const actual = mejores.get(clave(o));
    if (!actual || o.minutos < actual.minutos) mejores.set(clave(o), o);
  }
  // Si caminar tarda casi lo mismo que el bus (3 minutos de diferencia), mejor caminar.
  const orden = (o) => o.minutos - (o.tipo === "pie" ? 3 : 0);
  return [...mejores.values()]
    .sort((a, b) => a.fueraDeHorario - b.fueraDeHorario || orden(a) - orden(b))
    .slice(0, ajustes.maximoOpciones);
}
