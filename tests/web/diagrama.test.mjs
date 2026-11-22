import assert from "node:assert/strict";
import { test } from "node:test";

import { estadoDeLinea, filasDeLinea, posicionEntreFilas, tramosVisibles } from "../../web/diagrama.js";

// Un recorrido recto hacia el este por el ecuador: 0.009° de longitud son unos 1000 m.
const GRADO_KM = 0.009;
const trazado = (km) => ({
  type: "Feature",
  properties: { sentido: "ida", hacia: "Final" },
  geometry: { type: "LineString", coordinates: [[0, 0], [km * GRADO_KM, 0]] },
});
const parada = (id, nombre, km) => ({ type: "Feature", properties: { id, nombre }, geometry: { type: "Point", coordinates: [km * GRADO_KM, 0] } });
const paradas = (...lista) => ({ type: "FeatureCollection", features: lista });

// 10:00 en Cuenca (UTC-5).
const DIEZ = new Date("2026-11-18T15:00:00Z");

test("las filas van de punta a punta con las paradas en orden", () => {
  const { filas, largo } = filasDeLinea(trazado(5), paradas(parada(2, "B", 3), parada(1, "A", 1)), { desde: "Inicio", hacia: "Final" });
  assert.deepEqual(
    filas.map((f) => [f.nombre, f.tipo]),
    [["Inicio", "inicio"], ["A", "parada"], ["B", "parada"], ["Final", "final"]],
  );
  assert.ok(Math.abs(largo - 5000) < 20);
});

test("una parada pegada a una punta y con su nombre no se repite", () => {
  const { filas } = filasDeLinea(trazado(5), paradas(parada(1, "Final", 4.95), parada(2, "A", 2)), { desde: "Inicio", hacia: "Final" });
  assert.deepEqual(filas.map((f) => f.nombre), ["Inicio", "A", "Final"]);
});

test("tu parada es la registrada más cercana si está junto a donde tomas el bus", () => {
  const { filas } = filasDeLinea(trazado(5), paradas(parada(1, "A", 1), parada(2, "B", 2)), {
    desde: "Inicio",
    hacia: "Final",
    punto: { lat: 0.0005, lon: 2.1 * GRADO_KM },
  });
  assert.deepEqual(filas.filter((f) => f.tu).map((f) => f.nombre), ["B"]);
});

test("sin parada registrada junto a ti, se añade una fila en tu lugar", () => {
  const { filas } = filasDeLinea(trazado(5), paradas(parada(1, "A", 1), parada(2, "B", 4)), {
    desde: "Inicio",
    hacia: "Final",
    punto: { lat: 0, lon: 2.5 * GRADO_KM },
  });
  assert.deepEqual(filas.map((f) => f.tipo), ["inicio", "parada", "tu", "parada", "final"]);
});

test("lejos del recorrido no hay tu parada", () => {
  const { filas } = filasDeLinea(trazado(5), paradas(parada(1, "A", 1)), { punto: { lat: 0.01, lon: 0.01 } });
  assert.equal(filas.some((f) => f.tu), false);
});

test("un bus entre dos filas queda en la fracción de su tramo", () => {
  const filas = [{ metros: 0 }, { metros: 1000 }, { metros: 4000 }];
  assert.equal(posicionEntreFilas(500, filas), 0.5);
  assert.equal(posicionEntreFilas(2500, filas), 1.5);
  assert.equal(posicionEntreFilas(9000, filas), 2);
  assert.equal(posicionEntreFilas(-5, filas), 0);
});

test("el estado dice qué buses ya pasaron, cuánto falta y cuánto se tarda desde tu parada", () => {
  const diagrama = filasDeLinea(trazado(6), paradas(parada(1, "A", 1.5), parada(2, "B", 3), parada(3, "C", 4.5)), {
    desde: "Inicio",
    hacia: "Final",
    punto: { lat: 0, lon: 3 * GRADO_KM },
  });
  // Cada 10 minutos desde las 06:00, a 15 km/h: un bus recorre 2.5 km en 10 min.
  const { buses, proximo, viaje } = estadoDeLinea(diagrama, { inicio: "06:00", fin: "20:00", intervalo_min: 10 }, { fecha: DIEZ });
  // A las 10:00 hay uno a 5 km (ya pasó por B, tu parada), uno a 2.5 km y otro saliendo.
  assert.deepEqual(
    buses.map((b) => b.pasado),
    [true, false, false],
  );
  // El que va a 2.5 km llega a B (3 km) en 2 min.
  assert.ok(Math.abs(proximo - 2) < 0.2, String(proximo));
  // De B a C (1.5 km) son 6 min; al final (3 km), 12. Antes de tu parada no hay viaje.
  assert.deepEqual(viaje.map((v) => (v === null ? null : Math.round(v))), [null, null, null, 6, 12]);
});

test("sin horario no hay buses ni próximo", () => {
  const diagrama = filasDeLinea(trazado(6), paradas(), { punto: { lat: 0, lon: 0.01 } });
  const { buses, proximo } = estadoDeLinea(diagrama, null, { fecha: DIEZ });
  assert.deepEqual(buses, []);
  assert.equal(proximo, null);
});

test("se ven las puntas y unas paradas alrededor de la tuya; el resto, plegado", () => {
  const filas = Array.from({ length: 30 }, (_, i) => ({ metros: i * 100, tu: i === 15 }));
  assert.deepEqual(tramosVisibles(filas), [
    { desde: 0, hasta: 0 },
    { desde: 10, hasta: 18 },
    { desde: 29, hasta: 29 },
  ]);
  // Sin tu parada, las primeras.
  const sinTi = filas.map((f) => ({ ...f, tu: false }));
  assert.deepEqual(tramosVisibles(sinTi), [
    { desde: 0, hasta: 5 },
    { desde: 29, hasta: 29 },
  ]);
  // Una línea corta se ve entera.
  assert.deepEqual(tramosVisibles(filas.slice(0, 7).map((f) => ({ ...f, tu: false }))), [{ desde: 0, hasta: 6 }]);
});

test("en el tranvía tu parada es siempre una estación, aunque quede lejos", () => {
  const { filas } = filasDeLinea(trazado(5), paradas(parada(1, "A", 1), parada(2, "B", 4)), {
    desde: "Inicio",
    hacia: "Final",
    punto: { lat: 0, lon: 2.4 * GRADO_KM },
    juntoMetros: Infinity,
  });
  assert.deepEqual(filas.map((f) => f.tipo), ["inicio", "parada", "parada", "final"]);
  assert.deepEqual(filas.filter((f) => f.tu).map((f) => f.nombre), ["A"]);
});

test("la misma parada registrada dos veces a pocos metros va una sola vez", () => {
  const { filas } = filasDeLinea(trazado(5), paradas(parada(1, "A", 1), parada(2, "A", 1.3), parada(3, "B", 2), parada(4, "A", 3)), { desde: "Inicio", hacia: "Final" });
  // La tercera "A", 2 km después, es otra pasada por la misma calle: se queda.
  assert.deepEqual(filas.map((f) => f.nombre), ["Inicio", "A", "B", "A", "Final"]);
});

test("cada bus se reconoce de un momento al siguiente por la hora en que salió", () => {
  const diagrama = filasDeLinea(trazado(6), paradas(), {});
  const horario = { inicio: "06:00", fin: "20:00", intervalo_min: 10 };
  const antes = estadoDeLinea(diagrama, horario, { fecha: new Date("2026-11-18T15:09:00Z") }).buses.map((b) => b.salida);
  // 6 km a 15 km/h son 24 min: a las 10:09 van los de las 09:50 y las 10:00. A las 10:15 el de
  // las 09:50 ya llegó y salieron los de las 10:10: el de las 10:00 conserva su hora.
  const despues = estadoDeLinea(diagrama, horario, { fecha: new Date("2026-11-18T15:15:00Z") }).buses.map((b) => b.salida);
  assert.deepEqual(antes, [9 * 60 + 50, 10 * 60]);
  assert.deepEqual(despues, [10 * 60, 10 * 60 + 10]);
});
