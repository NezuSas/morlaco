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

/**
 * Prepara cada recorrido (línea y sentido) en metros, con la distancia acumulada. Además de
 * la ruta normal, cada variante (un alargue unido a la ruta) es un recorrido más: así una
 * ruta hasta el Camino del Tejar puede ir en la 8 que sigue a Dolorosa.
 */
export function prepararLineas(lineas, rutas = [], fecha = new Date()) {
  const porLinea = new Map();
  for (const f of lineas.features) {
    if (!porLinea.has(f.properties.linea)) porLinea.set(f.properties.linea, []);
    porLinea.get(f.properties.linea).push(f);
  }
  const variantes = [...porLinea.values()].flatMap((trazados) =>
    trazados.some((f) => f.properties.tipo === "alargue") ? variantesDeLinea(trazados) : [],
  );
  return [...lineas.features.filter((f) => f.properties.tipo !== "alargue"), ...variantes]
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
        variante: p.variante ?? null,
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

function esperaVariante(horario, fecha, ajustes) {
  const media = espera(horario, fecha, ajustes);
  return media === null ? null : media * 2;
}

const minutosPie = (metros, ajustes) => metros / ((ajustes.velocidadPie * 1000) / 60);
const minutosBus = (metros, ajustes) => metros / ((ajustes.velocidadBus * 1000) / 60);

function tramoBus(recorrido, subida, bajada, fecha, ajustes) {
  return {
    modo: "bus",
    linea: recorrido.linea,
    tipo: recorrido.tipo,
    hacia: recorrido.hacia,
    variante: recorrido.variante,
    horario: recorrido.horario,
    // En una variante no se sabe cuántos buses la hacen: se espera la frecuencia entera.
    espera: recorrido.variante ? esperaVariante(recorrido.horario, fecha, ajustes) : espera(recorrido.horario, fecha, ajustes),
    metros: bajada.recorrido - subida.recorrido,
    subida: subida.punto,
    bajada: bajada.punto,
    coords: tramo(recorrido, subida.recorrido, bajada.recorrido),
    // Para estimar dónde van sus buses: el recorrido entero y dónde se sube y se baja.
    sentido: recorrido.sentido,
    largo: recorrido.acumulado.at(-1),
    metrosSubida: subida.recorrido,
    metrosBajada: bajada.recorrido,
    get trazado() {
      return tramo(recorrido, 0, recorrido.acumulado.at(-1));
    },
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
  // Una sola opción por línea (o pareja de líneas): la más rápida. Una variante cuenta aparte:
  // es otro viaje (te deja en otro lado, pero solo la hacen algunos buses).
  const clave = (o) =>
    o.tramos
      .filter((t) => t.modo === "bus")
      .map((t) => (t.variante ? `${t.linea}~${t.variante}` : t.linea))
      .join(">") || "pie";
  const mejores = new Map();
  for (const o of opciones) {
    const actual = mejores.get(clave(o));
    if (!actual || o.minutos < actual.minutos) mejores.set(clave(o), o);
  }
  // Una variante solo vale si te hace caminar bastante menos que la ruta normal de su línea.
  const aPie = (o) => o.tramos.filter((t) => t.modo === "caminar").reduce((s, t) => s + t.metros, 0);
  const lineas = (o) => o.tramos.filter((t) => t.modo === "bus").map((t) => t.linea).join(">");
  const conVariante = (o) => o.tramos.some((t) => t.variante);
  const normales = [...mejores.values()].filter((o) => !conVariante(o));
  const utiles = [...mejores.values()].filter(
    (o) =>
      !conVariante(o) ||
      !normales.some((n) => lineas(n) === lineas(o) && aPie(n) <= aPie(o) + AHORRO_VARIANTE_M),
  );
  // Si caminar tarda casi lo mismo que el bus (3 minutos de diferencia), mejor caminar; a
  // igual tiempo, primero la que menos se camina.
  const orden = (o) => o.minutos - (o.tipo === "pie" ? 3 : 0);
  return utiles
    .sort((a, b) => a.fueraDeHorario - b.fueraDeHorario || orden(a) - orden(b) || aPie(a) - aPie(b))
    .slice(0, ajustes.maximoOpciones);
}

const AHORRO_VARIANTE_M = 150;

export const DISTANCIA_PARADA_M = 25; // la misma regla que usa el GTFS (src/morlaco/gtfs.py)

/**
 * Las paradas registradas por las que pasa un recorrido: a menos de 25 m de él y lejos de
 * sus dos extremos (las terminales van aparte), en el orden en que el bus llega a ellas.
 */
/** Un trazado (LineString o MultiLineString) en metros, con la distancia acumulada. */
function enMetros(feature) {
  const coords = feature.geometry.type === "LineString" ? feature.geometry.coordinates : feature.geometry.coordinates.flat();
  const puntos = coords.map(aMetros);
  const acumulado = [0];
  for (let i = 1; i < puntos.length; i++) acumulado.push(acumulado[i - 1] + distancia(puntos[i - 1], puntos[i]));
  return { coords, puntos, acumulado };
}

export const ALARGUE_UNIDO_M = 150;

/**
 * Los trazados de una línea sin los alargues que no tocan su recorrido: algunos del trazado
 * municipal de 2022 ya no empiezan ni terminan cerca de la línea (8 a Dolorosa, 18 a Yunga),
 * y dibujados sueltos no se entiende por dónde llega el bus hasta ahí.
 */
export function alarguesUnidos(trazados, maximo = ALARGUE_UNIDO_M) {
  const principales = trazados.filter((f) => f.properties.tipo !== "alargue").map(enMetros);
  return trazados.filter((f) => {
    if (f.properties.tipo !== "alargue") return true;
    const { coords } = enMetros(f);
    if (!coords.length) return false;
    return [coords[0], coords.at(-1)].some(([lon, lat]) =>
      principales.some((r) => (proyectar({ lat, lon }, r)?.distancia ?? Infinity) <= maximo),
    );
  });
}

export const EXTREMO_M = 1500; // cerca del comienzo o del final de una ruta

const enGrados = (a, b) => distancia(aMetros(a), aMetros(b));

/**
 * Las variantes de una línea: cada alargue unido a la ruta normal, como una ruta completa.
 *
 * El archivo municipal solo trae los tramos extra de cada alargue, a veces en dos piezas:
 * la 8 a El Rosal tiene una "ida" que sale de la línea hasta El Rosal y un "retorno" que
 * vuelve de El Rosal al mismo punto. Las piezas de un barrio que se continúan (una termina
 * donde empieza la otra) se juntan en un solo viaje de ida y vuelta. Luego cada viaje se
 * pega a la ruta donde encaja, en cualquiera de los dos sentidos:
 *   - un desvío: sale de la ruta y vuelve a ella (también al mismo punto);
 *   - una prolongación: sale cerca del final de una ruta y se queda en el barrio;
 *   - un comienzo: viene del barrio y entra cerca del comienzo de una ruta;
 *   - una rama: sale de la ruta de su sentido y se queda en el barrio.
 * Lo que no toca la línea (a más de 150 m) se deja fuera: no se sabe por dónde llega el bus.
 */
export function variantesDeLinea(trazados, maximo = ALARGUE_UNIDO_M) {
  const principales = trazados
    .filter((f) => f.properties.tipo !== "alargue")
    .map((f) => {
      const ruta = enMetros(f);
      return { f, ruta, total: ruta.acumulado.at(-1) ?? 0 };
    });
  const porBarrio = new Map();
  for (const alargue of trazados.filter((f) => f.properties.tipo === "alargue")) {
    const coords = enMetros(alargue).coords;
    if (coords.length < 2) continue;
    const { hacia } = alargue.properties;
    if (!porBarrio.has(hacia)) porBarrio.set(hacia, []);
    porBarrio.get(hacia).push({ coords, sentido: alargue.properties.sentido, barrio: coords.at(-1) });
  }

  const salida = [];
  for (const [hacia, piezas] of porBarrio) {
    // Primero los viajes de ida y vuelta (dos piezas que se continúan), después cada pieza.
    const viajes = [];
    for (const a of piezas) {
      for (const b of piezas) {
        if (a !== b && enGrados(a.coords.at(-1), b.coords[0]) <= maximo) {
          viajes.push({ coords: [...a.coords, ...b.coords], sentido: a.sentido, barrio: a.coords.at(-1) });
        }
      }
    }
    const linea = trazados[0].properties.linea;
    for (const c of principales) {
      const sentido = c.f.properties.sentido;
      const cerca = (punto) => {
        const [lon, lat] = punto;
        const q = proyectar({ lat, lon }, c.ruta);
        return q && q.distancia <= maximo ? q.recorrido : null;
      };
      let elegida = null;
      for (const viaje of [...viajes, ...piezas]) {
        const sale = cerca(viaje.coords[0]);
        const entra = cerca(viaje.coords.at(-1));
        const { coords } = viaje;
        if (sale !== null && entra !== null && entra >= sale - 300) {
          elegida = { coords: [...tramo(c.ruta, 0, sale), ...coords, ...tramo(c.ruta, Math.max(sale, entra), c.total)], empieza: false, termina: false };
        } else if (sale !== null && entra === null && c.total - sale <= EXTREMO_M) {
          elegida = { coords: [...tramo(c.ruta, 0, sale), ...coords], empieza: false, termina: true };
        } else if (entra !== null && sale === null && entra <= EXTREMO_M) {
          elegida = { coords: [...coords, ...tramo(c.ruta, entra, c.total)], empieza: true, termina: false };
        } else if (sale !== null && entra === null && viaje.sentido === sentido && viajes.length === 0) {
          elegida = { coords: [...tramo(c.ruta, 0, sale), ...coords], empieza: false, termina: true };
        }
        if (elegida) {
          elegida.barrio = viaje.barrio;
          break;
        }
      }
      if (!elegida) continue;
      salida.push({
        type: "Feature",
        properties: {
          linea,
          tipo: "linea",
          sentido,
          hacia: elegida.termina ? hacia : c.f.properties.hacia,
          variante: hacia,
          // Para las puntas: si empieza o termina en el barrio, y dónde queda el barrio.
          empiezaEnAlargue: elegida.empieza,
          terminaEnAlargue: elegida.termina,
          barrio: elegida.barrio,
        },
        geometry: { type: "LineString", coordinates: elegida.coords },
      });
    }
  }
  return salida;
}

export function paradasDeRecorrido(feature, paradas, maximo = DISTANCIA_PARADA_M) {
  const { puntos, acumulado } = enMetros(feature);
  const total = acumulado.at(-1) ?? 0;
  const recorrido = { puntos, acumulado };
  const salida = [];
  for (const p of paradas?.features ?? []) {
    const [lon, lat] = p.geometry.coordinates;
    const r = proyectar({ lat, lon }, recorrido);
    if (r && r.distancia <= maximo && r.recorrido > 30 && r.recorrido < total - 30) {
      salida.push({ id: p.properties.id, nombre: p.properties.nombre, lat, lon, metros: r.recorrido });
    }
  }
  return salida.sort((a, b) => a.metros - b.metros);
}
