import assert from "node:assert/strict";
import { test } from "node:test";

import { busesEnCamino, medirRecorrido, minutosDelDia, puntoEnRecorrido, puntosDeTrazado } from "../../web/vehiculos.js";
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
