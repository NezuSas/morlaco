import assert from "node:assert/strict";
import { test } from "node:test";

import {
  busesEnCamino,
  lugarEnRecorrido,
  medirRecorrido,
  minutosAlProximo,
  minutosDelDia,
  proximosDeLinea,
  puntoEnRecorrido,
  puntosDeTrazado,
} from "../../web/vehiculos.js";
import { horariosDeHoy } from "../../web/buses.js";

// 10:00 en Cuenca (UTC-5) de un miércoles.
const DIEZ = new Date("2026-11-18T15:00:00Z");
const HORARIO = { inicio: "06:00", fin: "20:00", intervalo_min: 10 };

test("los minutos del día van en hora de Cuenca y con segundos", () => {
  assert.equal(minutosDelDia(DIEZ), 600);
  assert.equal(minutosDelDia(new Date("2026-11-18T15:00:30Z")), 600.5);
});

test("a media mañana hay un bus por cada intervalo a lo largo del recorrido", () => {
  // 15 km a 15 km/h: una hora de viaje, así que con salidas cada 10 min hay 6 o 7 en camino.
  const metros = busesEnCamino(HORARIO, 15_000, DIEZ);
  assert.equal(metros.length, 7);
  assert.deepEqual(
    metros.map((m) => Math.round(m)),
    [15_000, 12_500, 10_000, 7500, 5000, 2500, 0],
  );
});

test("antes de la primera salida no hay buses, y al final del día solo los que van llegando", () => {
  assert.deepEqual(busesEnCamino(HORARIO, 15_000, new Date("2026-11-18T10:30:00Z")), []); // 05:30
  // 20:30: el último salió a las 20:00 y va por la mitad; después no sale ninguno más.
  const tarde = busesEnCamino(HORARIO, 15_000, new Date("2026-11-19T01:30:00Z"));
  assert.deepEqual(
    tarde.map((m) => Math.round(m)),
    [15_000, 12_500, 10_000, 7500],
  );
  // 21:31: ya llegaron todos.
  assert.deepEqual(busesEnCamino(HORARIO, 15_000, new Date("2026-11-19T02:31:00Z")), []);
});

test("sin horario, sin frecuencia o sin recorrido no se estima nada", () => {
  assert.deepEqual(busesEnCamino(undefined, 15_000, DIEZ), []);
  assert.deepEqual(busesEnCamino(null, 15_000, DIEZ), []);
  assert.deepEqual(busesEnCamino({ inicio: "06:00", fin: "20:00" }, 15_000, DIEZ), []);
  assert.deepEqual(busesEnCamino(HORARIO, 0, DIEZ), []);
});

test("el punto a cierta distancia del inicio cae sobre el recorrido, con su rumbo", () => {
  const recorrido = medirRecorrido([
    [-79.0, -2.9],
    [-79.0, -2.89], // hacia el norte, unos 1112 m
    [-78.99, -2.89], // hacia el este
  ]);
  assert.ok(Math.abs(recorrido.acumulado[1] - 1112) < 2);
  const mitad = puntoEnRecorrido(recorrido, recorrido.acumulado[1] / 2);
  assert.ok(Math.abs(mitad.lat - -2.895) < 1e-9 && mitad.lon === -79.0);
  assert.equal(Math.round(mitad.rumbo), 0);
  const despues = puntoEnRecorrido(recorrido, recorrido.acumulado[1] + 100);
  assert.equal(Math.round(despues.rumbo), 90);
  // Más allá del final se queda en el final.
  const final = puntoEnRecorrido(recorrido, 1e9);
  assert.deepEqual([final.lon, final.lat], [-78.99, -2.89]);
});

test("los trazados de varias partes se recorren en orden", () => {
  const multi = { type: "MultiLineString", coordinates: [[[0, 0], [0, 1]], [[0, 1], [1, 1]]] };
  assert.deepEqual(puntosDeTrazado(multi), [[0, 0], [0, 1], [0, 1], [1, 1]]);
  assert.deepEqual(puntosDeTrazado({ type: "Point", coordinates: [0, 0] }), []);
});

test("cada sentido tiene su horario del día", () => {
  const rutas = [
    { linea: "3", sentido: "ida", horarios: { lunes_viernes: HORARIO, domingos: null } },
    { linea: "3", sentido: "retorno", horarios: { lunes_viernes: { ...HORARIO, intervalo_min: 12 } } },
  ];
  assert.deepEqual(horariosDeHoy("3", rutas, DIEZ), { ida: HORARIO, retorno: { ...HORARIO, intervalo_min: 12 } });
  // Domingo: la ida no tiene servicio y del retorno no hay dato.
  assert.deepEqual(horariosDeHoy("3", rutas, new Date("2026-11-22T15:00:00Z")), { ida: null, retorno: null });
  assert.equal(horariosDeHoy("99", rutas, DIEZ), undefined);
});

test("cuánto falta para que el próximo bus llegue a la parada", () => {
  // A las 10:00, con salidas cada 10 min y una parada a 2,5 km (10 min de viaje a 15 km/h):
  // el que salió a las 09:50 pasa justo ahora.
  assert.equal(Math.round(minutosAlProximo(HORARIO, 15_000, 2500, DIEZ)), 0);
  // A las 10:01 ya pasó: el siguiente salió a las 10:00 y llega a las 10:10.
  assert.equal(Math.round(minutosAlProximo(HORARIO, 15_000, 2500, new Date("2026-11-18T15:01:00Z"))), 9);
  // Antes de la primera salida, el primero del día: 06:00 + 10 min de viaje.
  assert.equal(Math.round(minutosAlProximo(HORARIO, 15_000, 2500, new Date("2026-11-18T10:30:00Z"))), 40);
  // Después de la última salida que llega a la parada, ninguno.
  assert.equal(minutosAlProximo(HORARIO, 15_000, 2500, new Date("2026-11-19T01:30:00Z")), null);
  assert.equal(minutosAlProximo(undefined, 15_000, 2500, DIEZ), null);
});

test("lugarEnRecorrido: los metros hasta el lugar del recorrido más cercano al punto", () => {
  // Un recorrido recto hacia el este por el ecuador de Cuenca: unos 1.112 m por centésima.
  const medida = medirRecorrido([[-79.02, -2.9], [-79.01, -2.9], [-79.0, -2.9]]);
  const lugar = lugarEnRecorrido({ lon: -79.005, lat: -2.899 }, medida);
  assert.ok(Math.abs(lugar.metros - medida.total * 0.75) < 5);
  assert.ok(Math.abs(lugar.distancia - 110) < 5); // una milésima de grado al norte
  // Antes del inicio, el lugar más cercano es el propio inicio.
  assert.equal(lugarEnRecorrido({ lon: -79.03, lat: -2.9 }, medida).metros, 0);
});

test("proximosDeLinea: el próximo bus de cada sentido que pasa cerca", () => {
  const trazo = (sentido, hacia, coords, tipo = "linea") => ({ properties: { sentido, hacia, tipo }, geometry: { type: "LineString", coordinates: coords } });
  const trazados = [
    trazo("ida", "Norte", [[-79.02, -2.9], [-79.0, -2.9]]),
    trazo("retorno", "Sur", [[-79.0, -2.95], [-79.02, -2.95]]), // a más de 5 km: no cuenta
    trazo("ida", "Alargue", [[-79.02, -2.9], [-79.0, -2.9]], "alargue"),
  ];
  const punto = { lon: -79.01, lat: -2.9 }; // a mitad del recorrido de ida (unos 1.112 m)
  const proximos = proximosDeLinea(punto, trazados, { ida: HORARIO, retorno: HORARIO }, { fecha: DIEZ });
  assert.equal(proximos.length, 1);
  assert.equal(proximos[0].hacia, "Norte");
  // Sale uno a las 10:00 y tarda unos 4,4 min en recorrer 1.112 m a 15 km/h.
  assert.ok(Math.abs(proximos[0].minutos - 4.45) < 0.1);
  // De noche ya no pasa; y sin horario del sentido no se estima nada.
  assert.equal(proximosDeLinea(punto, trazados, { ida: HORARIO }, { fecha: new Date("2026-11-19T02:00:00Z") })[0].minutos, null);
  assert.deepEqual(proximosDeLinea(punto, trazados, { ida: null }, { fecha: DIEZ }), []);
  assert.deepEqual(proximosDeLinea(punto, undefined, undefined), []);
});
