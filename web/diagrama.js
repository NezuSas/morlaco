// El diagrama de una línea: sus paradas en orden, como el letrero de una línea de metro, con
// los buses estimados avanzando entre ellas y tu parada marcada. Es una estimación por
// frecuencia (no hay GPS público de los buses en Cuenca), igual que los buses del mapa.
// Sin DOM ni red: aquí solo se calcula qué va en cada fila.

import { paradasDeRecorrido } from "./rutas.js";
import { VELOCIDAD_KMH, busesEnCamino, lugarEnRecorrido, medirRecorrido, minutosAlProximo, minutosDelDia, puntosDeTrazado } from "./vehiculos.js";

// Más lejos que esto del recorrido, el punto no está "en" la línea: no hay tu parada. Es más
// que los 350 m con que una línea cuenta como cercana porque, en calles de un solo sentido,
// la vuelta suele ir por una paralela a dos o tres cuadras.
export const TU_PARADA_MAXIMO_M = 600;
// Si una parada registrada queda a menos de esto (por el recorrido) del lugar donde tomas el
// bus, esa es tu parada; si no, se añade una fila "Cerca de ti" en ese lugar.
export const TU_PARADA_JUNTO_M = 200;
// Las paradas que se ven alrededor de la tuya antes de pedir la lista entera.
export const ANTES_DE_TI = 5;
export const DESPUES_DE_TI = 3;
export const SIN_TI = 6;
// Dos paradas seguidas con el mismo nombre y a menos de esto son una sola (el registro pone a
// veces una a cada lado de la misma esquina, a 170-310 m por el recorrido).
export const MISMA_PARADA_M = 350;

/**
 * Las filas del diagrama de un sentido de la línea, del inicio al final del recorrido:
 * [{ nombre, metros, tipo }] con tipo "inicio", "parada", "tu" o "final". El inicio y el
 * final llevan el nombre de las puntas (`desde`, `hacia`); en medio van las paradas
 * registradas que quedan sobre el recorrido. `punto` (donde está la persona) marca su
 * parada: la registrada más cercana o, si no hay ninguna junto, una fila propia. El tranvía
 * solo para en sus estaciones: con `juntoMetros` en Infinity, tu parada es siempre una de ellas.
 */
export function filasDeLinea(trazado, paradas, { desde, hacia, punto = null, distanciaParada, juntoMetros = TU_PARADA_JUNTO_M } = {}) {
  const medida = medirRecorrido(puntosDeTrazado(trazado?.geometry));
  if (medida.total <= 0) return null;
  const enMedio = paradasDeRecorrido(trazado, paradas, distanciaParada)
    // Una parada con el nombre de una punta y pegada a ella es la punta misma.
    .filter((p) => !((p.nombre === desde && p.metros < 150) || (p.nombre === hacia && medida.total - p.metros < 150)))
    .map((p) => ({ nombre: p.nombre, metros: p.metros, tipo: "parada" }));
  // El registro tiene a veces la misma parada dos veces, a pocos metros (una a cada lado de la
  // esquina): en el diagrama va una sola. Más lejos, con el mismo nombre, es otra pasada.
  const unicas = [];
  for (const p of enMedio) {
    const anterior = unicas.at(-1);
    if (anterior && anterior.nombre === p.nombre && p.metros - anterior.metros < MISMA_PARADA_M) continue;
    unicas.push(p);
  }
  const filas = [{ nombre: desde ?? null, metros: 0, tipo: "inicio" }, ...unicas, { nombre: hacia ?? null, metros: medida.total, tipo: "final" }];

  const lugar = punto ? lugarEnRecorrido(punto, medida) : null;
  if (lugar && lugar.distancia <= TU_PARADA_MAXIMO_M) {
    let cerca = null;
    for (const [i, f] of filas.entries()) {
      const d = Math.abs(f.metros - lugar.metros);
      if (d <= juntoMetros && (cerca === null || d < Math.abs(filas[cerca].metros - lugar.metros))) cerca = i;
    }
    if (cerca !== null) {
      filas[cerca] = { ...filas[cerca], tu: true };
    } else {
      const despues = filas.findIndex((f) => f.metros > lugar.metros);
      filas.splice(despues > 0 ? despues : filas.length - 1, 0, { nombre: null, metros: lugar.metros, tipo: "tu", tu: true });
    }
  }
  return { filas, largo: medida.total };
}

/**
 * Dónde va un bus entre las filas: el índice de la fila de la que salió más la fracción del
 * camino hacia la siguiente (2.5 = a mitad entre la tercera y la cuarta). Las filas se dibujan
 * a la misma distancia, aunque en la calle estén más lejos o más cerca.
 */
export function posicionEntreFilas(metros, filas) {
  if (!filas.length) return 0;
  if (metros <= filas[0].metros) return 0;
  for (let i = 1; i < filas.length; i++) {
    if (metros <= filas[i].metros) {
      const tramo = filas[i].metros - filas[i - 1].metros;
      return i - 1 + (tramo > 0 ? (metros - filas[i - 1].metros) / tramo : 0);
    }
  }
  return filas.length - 1;
}

/**
 * Lo que cambia con la hora: los buses en camino ({ posicion, pasado, salida }, pasado = ya
 * dejó atrás tu parada; salida = el minuto del día en que salió, que lo identifica de un
 * momento al siguiente aunque otro bus termine o salga), cuánto falta para el próximo en tu parada y cuánto se tarda desde ella hasta
 * cada fila que sigue (minutos por fila, null en las de antes).
 */
export function estadoDeLinea({ filas, largo }, horario, { fecha = new Date(), velocidadKmH = VELOCIDAD_KMH } = {}) {
  const tu = filas.find((f) => f.tu) ?? null;
  const ahora = minutosDelDia(fecha);
  const buses = busesEnCamino(horario, largo, fecha, velocidadKmH).map((metros) => ({
    posicion: posicionEntreFilas(metros, filas),
    pasado: tu ? metros > tu.metros + 20 : false,
    salida: Math.round(ahora - (metros / 1000 / velocidadKmH) * 60),
  }));
  const proximo = tu ? minutosAlProximo(horario, largo, tu.metros, fecha, velocidadKmH) : null;
  const viaje = filas.map((f) => (tu && f.metros > tu.metros ? ((f.metros - tu.metros) / 1000 / velocidadKmH) * 60 : null));
  return { buses, proximo, viaje };
}

/**
 * Qué filas se ven antes de pedir la lista entera: las puntas siempre y, con tu parada, unas
 * cuantas antes (por donde viene el bus) y después; sin ella, las primeras. Devuelve tramos
 * [{ desde, hasta }] (índices incluidos) y, entre tramo y tramo, queda un salto plegado.
 */
export function tramosVisibles(filas) {
  const ultimo = filas.length - 1;
  const tu = filas.findIndex((f) => f.tu);
  let centro;
  if (tu >= 0) centro = { desde: Math.max(0, tu - ANTES_DE_TI), hasta: Math.min(ultimo, tu + DESPUES_DE_TI) };
  else centro = { desde: 0, hasta: Math.min(ultimo, SIN_TI - 1) };
  // Un salto de una sola fila no ahorra nada: mejor mostrarla.
  if (centro.desde <= 2) centro.desde = 0;
  if (centro.hasta >= ultimo - 2) centro.hasta = ultimo;
  const tramos = [];
  if (centro.desde > 0) tramos.push({ desde: 0, hasta: 0 });
  tramos.push(centro);
  if (centro.hasta < ultimo) tramos.push({ desde: ultimo, hasta: ultimo });
  return tramos;
}
