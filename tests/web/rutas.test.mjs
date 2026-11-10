import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { planificar, prepararLineas, proyectar, tramo } from "../../web/rutas.js";

const enCuenca = (iso) => new Date(`${iso}-05:00`);
const lunes10h = enCuenca("2026-11-09T10:00");

const recorrido = (linea, sentido, hacia, coords, tipo = "linea") => ({
  type: "Feature",
  properties: { linea, tipo, hacia, sentido },
  geometry: { type: "LineString", coordinates: coords },
});

// Línea 7 de oeste a este (y de vuelta) y línea 12 de norte a sur, que se cruzan.
const OESTE_ESTE = [[-79.03, -2.9], [-79.01, -2.9], [-78.99, -2.9], [-78.97, -2.9]];
const NORTE_SUR = [[-78.99, -2.88], [-78.99, -2.9], [-78.99, -2.92], [-78.99, -2.94]];
const lineas = {
  features: [
    recorrido("7", "ida", "Este", OESTE_ESTE),
    recorrido("7", "retorno", "Oeste", [...OESTE_ESTE].reverse()),
    recorrido("12", "ida", "Sur", NORTE_SUR),
    recorrido("7", "ida", "Alargue", [[-78.97, -2.9], [-78.96, -2.91]], "alargue"),
  ],
};
const rutas = [
  { linea: "7", sentido: "ida", horarios: { lunes_viernes: { inicio: "06:00", fin: "21:00", intervalo_min: 10 } } },
  { linea: "12", sentido: "ida", horarios: { lunes_viernes: { inicio: "06:00", fin: "21:00", intervalo_min: 20 } } },
];
const recorridos = prepararLineas(lineas, rutas, lunes10h);

test("prepararLineas omite los alargues y trae el horario de hoy", () => {
  assert.equal(recorridos.length, 3);
  assert.equal(recorridos[0].horario.intervalo_min, 10);
  assert.ok(Math.abs(recorridos[0].acumulado.at(-1) - 6670) < 20);
});

test("proyectar da la distancia a la línea y cuánto se lleva recorrido", () => {
  const p = proyectar({ lat: -2.9009, lon: -79.01 }, recorridos[0]);
  assert.ok(Math.abs(p.distancia - 100) < 3);
  assert.ok(Math.abs(p.recorrido - 2223) < 10);
  // Limitado a partir de los 3000 m, el punto más cercano ya no puede ser el de los 2223 m.
  const despues = proyectar({ lat: -2.9, lon: -79.01 }, recorridos[0], 3000);
  assert.ok(Math.abs(despues.recorrido - 3000) < 1);
});

test("tramo recorta el recorrido entre dos distancias", () => {
  const coords = tramo(recorridos[0], 1000, 3000);
  assert.ok(Math.abs(coords[0][0] - (-79.03 + 1000 / (111320 * Math.cos((-2.9 * Math.PI) / 180)))) < 1e-4);
  assert.equal(coords.length, 3); // inicio, el vértice de -79.01 y el final
});

test("una línea directa en el sentido correcto", () => {
  const [mejor] = planificar({ lat: -2.9005, lon: -79.025 }, { lat: -2.8995, lon: -78.975 }, recorridos, { fecha: lunes10h });
  assert.equal(mejor.tipo, "directa");
  const bus = mejor.tramos.find((t) => t.modo === "bus");
  assert.equal(bus.linea, "7");
  assert.equal(bus.hacia, "Este"); // no el retorno, que va al revés
  assert.equal(bus.espera, 5); // media frecuencia de 10 min
  assert.ok(mejor.minutos > 20 && mejor.minutos < 35, `${mejor.minutos} min`);
});

test("con un transbordo cuando no hay directa", () => {
  const opciones = planificar({ lat: -2.9005, lon: -79.025 }, { lat: -2.935, lon: -78.9905 }, recorridos, { fecha: lunes10h });
  const transbordo = opciones.find((o) => o.tipo === "transbordo");
  assert.ok(transbordo, "debería haber una opción con transbordo");
  const buses = transbordo.tramos.filter((t) => t.modo === "bus").map((t) => t.linea);
  assert.deepEqual(buses, ["7", "12"]);
});

test("a pie si el destino está cerca, y fuera de horario al final", () => {
  const cerca = planificar({ lat: -2.9, lon: -79.02 }, { lat: -2.9, lon: -79.015 }, recorridos, { fecha: lunes10h });
  assert.ok(cerca.some((o) => o.tipo === "pie"));
  const deNoche = planificar({ lat: -2.9005, lon: -79.025 }, { lat: -2.8995, lon: -78.975 }, recorridos, {
    fecha: enCuenca("2026-11-09T23:00"),
  });
  assert.ok(deNoche.every((o) => o.fueraDeHorario));
});

test("con los recorridos reales: del Parque Calderón al Mall del Río hay bus", (t) => {
  let datos;
  try {
    datos = JSON.parse(readFileSync(new URL("../../datos/buses/lineas.geojson", import.meta.url)));
  } catch {
    t.skip("falta datos/buses/lineas.geojson");
    return;
  }
  const reales = prepararLineas(datos, [], lunes10h);
  const inicio = performance.now();
  const opciones = planificar({ lat: -2.89733, lon: -79.00454 }, { lat: -2.91905, lon: -79.01571 }, reales, { fecha: lunes10h });
  const ms = performance.now() - inicio;
  assert.ok(opciones.some((o) => o.tipo !== "pie"), "debería haber al menos una opción en bus");
  assert.ok(opciones[0].minutos < 60, `${opciones[0].minutos} min`);
  assert.ok(ms < 1500, `tardó ${Math.round(ms)} ms`);
});
