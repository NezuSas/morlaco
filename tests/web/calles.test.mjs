import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  buscarCalles,
  cruceDeCalles,
  encuentroDeCalles,
  esquinaCercana,
  sugerirCalles,
  interpretarBusqueda,
  longitudMetros,
  palabras,
  prepararIndice,
  puntoMedio,
  ubicarEsquina,
} from "../../web/calles.js";

const calle = (nombre, rango, lineas, otros = []) => ({
  type: "Feature",
  properties: { nombre, rango, otros_nombres: otros },
  geometry: { type: "MultiLineString", coordinates: lineas },
});

const indice = prepararIndice({
  features: [
    calle("Avenida Remigio Crespo Toral", 6, [[[-79.02, -2.905], [-79.0, -2.905]]]),
    calle("Remigio Tamariz Crespo", 3, [[[-79.03, -2.91], [-79.029, -2.91]]]),
    calle("Avenida Fray Vicente Solano", 7, [[[-79.01, -2.9], [-79.01, -2.92]]]),
    calle("Avenida Ordóñez Lasso", 6, [[[-79.05, -2.89], [-79.03, -2.89]]]),
    calle("Simón Bolívar", 5, [[[-79.006, -2.897], [-79.001, -2.897]]], ["Calle Bolívar"]),
    calle("Avenida Simon Bolivar", 3, [[[-79.1, -2.95], [-79.09, -2.95]]]),
    calle("Benigno Malo", 3, [[[-79.0045, -2.895], [-79.0045, -2.9]]]),
  ],
});

test("palabras quita tildes y palabras genéricas", () => {
  assert.deepEqual(palabras("Av. de las Américas"), ["americas"]);
  assert.deepEqual(palabras("Calle Simón Bolívar"), ["simon", "bolivar"]);
});

test("interpretarBusqueda separa intersecciones y quita números de casa", () => {
  assert.deepEqual(interpretarBusqueda("Av. Solano y Remigio Crespo"), {
    calles: ["Av. Solano", "Remigio Crespo"],
    tieneNumero: false,
  });
  assert.deepEqual(interpretarBusqueda("Gran Colombia 7-45").calles, ["Gran Colombia"]);
  assert.equal(interpretarBusqueda("Gran Colombia 7-45").tieneNumero, true);
  assert.deepEqual(interpretarBusqueda("Sucre & Borrero").calles, ["Sucre", "Borrero"]);
  assert.deepEqual(interpretarBusqueda("Bolívar esquina Benigno Malo").calles, [
    "Bolívar",
    "Benigno Malo",
  ]);
  // "Convención" contiene "con", pero no es un separador.
  assert.deepEqual(interpretarBusqueda("Convención del 45").calles, ["Convención del 45"]);
});

test("buscarCalles prefiere la vía principal cuando dos nombres encajan igual", () => {
  assert.equal(buscarCalles("Remigio Crespo", indice)[0].nombre, "Avenida Remigio Crespo Toral");
  assert.equal(buscarCalles("av solano", indice)[0].nombre, "Avenida Fray Vicente Solano");
});

test("buscarCalles tolera tildes, mayúsculas y una letra de diferencia", () => {
  assert.equal(buscarCalles("ORDONEZ LASO", indice)[0].nombre, "Avenida Ordóñez Lasso");
  assert.equal(buscarCalles("simon bolivar", indice)[0].nombre, "Simón Bolívar");
  assert.equal(buscarCalles("Benig Malo", indice)[0].nombre, "Benigno Malo");
  assert.deepEqual(buscarCalles("Calle que no existe", indice), []);
});

test("buscarCalles desempata por la calle más larga", () => {
  const ix = prepararIndice({
    features: [
      calle("Ramón Borrero", 3, [[[-79.03, -2.89], [-79.0295, -2.89]]]),
      calle("Presidente Borrero", 3, [[[-79.003, -2.89], [-79.003, -2.91]]]),
    ],
  });
  assert.equal(buscarCalles("Borrero", ix)[0].nombre, "Presidente Borrero");
});

test("buscarCalles también busca en los nombres alternativos", () => {
  assert.ok(buscarCalles("Bolívar", indice).some((c) => c.nombre === "Simón Bolívar"));
});

test("cruceDeCalles elige, entre homónimas, la que de verdad se cruza", () => {
  const cruce = cruceDeCalles(buscarCalles("Simón Bolívar", indice), buscarCalles("Benigno Malo", indice));
  assert.equal(cruce.a.nombre, "Simón Bolívar");
  assert.equal(cruce.metros, 0);
  assert.ok(Math.abs(cruce.punto.lon - -79.0045) < 1e-6);
  assert.ok(Math.abs(cruce.punto.lat - -2.897) < 1e-6);
});

test("cruceDeCalles prefiere la calle que mejor encaja aunque otra también cruce", () => {
  const ix = prepararIndice({
    features: [
      calle("Avenida Fray Vicente Solano", 7, [[[-79.01, -2.9], [-79.01, -2.92]]]),
      // La principal llega a 15 m de la Solano (una redondel en medio).
      calle("Avenida Remigio Crespo Toral", 6, [[[-79.0098, -2.905], [-79.0, -2.905]]]),
      calle("Remigio Tamariz Crespo", 3, [[[-79.02, -2.91], [-79.0, -2.91]]]),
    ],
  });
  const cruce = cruceDeCalles(buscarCalles("Solano", ix), buscarCalles("Remigio Crespo", ix));
  assert.equal(cruce.b.nombre, "Avenida Remigio Crespo Toral");
  assert.ok(cruce.metros > 10 && cruce.metros < 40);
});

test("cruceDeCalles devuelve null si las calles no se tocan", () => {
  assert.equal(cruceDeCalles(buscarCalles("Ordóñez Lasso", indice), buscarCalles("Benigno Malo", indice)), null);
});

test("encuentroDeCalles mide calles que casi se tocan", () => {
  const a = calle("A", 3, [[[-79.0, -2.9], [-79.001, -2.9]]]);
  const b = calle("B", 3, [[[-79.0012, -2.9001], [-79.0012, -2.902]]]);
  const { metros } = encuentroDeCalles(a, b);
  assert.ok(metros > 20 && metros < 30, `metros = ${metros}`);
});

test("longitud y punto medio", () => {
  const recta = calle("R", 3, [[[-79.0, -2.9], [-79.0, -2.91]]]);
  assert.ok(Math.abs(longitudMetros(recta) - 1113) < 5);
  assert.ok(Math.abs(puntoMedio(recta).lat - -2.905) < 1e-6);
});

test("con las calles reales de Cuenca", (t) => {
  let datos;
  try {
    datos = JSON.parse(readFileSync(new URL("../../datos/calles/calles.geojson", import.meta.url)));
  } catch {
    t.skip("falta datos/calles/calles.geojson (morlaco actualizar calles)");
    return;
  }
  const real = prepararIndice(datos);
  const cruce = (a, b) => cruceDeCalles(buscarCalles(a, real), buscarCalles(b, real));

  // Esquina del Parque Calderón.
  const calderon = cruce("Simón Bolívar", "Benigno Malo");
  assert.ok(calderon, "Simón Bolívar y Benigno Malo deberían cruzarse");
  assert.ok(Math.abs(calderon.punto.lat - -2.897) < 0.002 && Math.abs(calderon.punto.lon - -79.0045) < 0.002);

  const solano = cruce("Av. Solano", "Remigio Crespo");
  assert.ok(solano, "Solano y Remigio Crespo deberían cruzarse");
  assert.equal(solano.b.nombre, "Avenida Remigio Crespo Toral");

  // "Borrero" a secas es Presidente Borrero, la del Centro Histórico.
  const sucre = cruce("Sucre", "Borrero");
  assert.equal(sucre.b.nombre, "Presidente Borrero");
  assert.ok(Math.abs(sucre.punto.lat - -2.898) < 0.002 && Math.abs(sucre.punto.lon - -79.003) < 0.002);
  assert.equal(buscarCalles("Ordoñez Lasso", real)[0].nombre, "Avenida Ordoñez Lasso");
});

test("ubicarEsquina ubica direcciones de esquina y descarta las demás", () => {
  const punto = ubicarEsquina("Simón Bolívar 9-77 y Benigno Malo", indice);
  assert.ok(Math.abs(punto.lat - -2.897) < 1e-6 && Math.abs(punto.lon - -79.0045) < 1e-6);
  assert.equal(ubicarEsquina("Vía a San Fermín km 5", indice), null);
  assert.equal(ubicarEsquina("Ordóñez Lasso y Benigno Malo", indice), null); // no se cruzan
});

test("esquinaCercana nombra la calle más cercana y la que la cruza", () => {
  // Cerca del cruce de la Solano (vertical en -79.01) con la Remigio Crespo (horizontal en -2.905).
  const esquina = esquinaCercana({ lat: -2.9051, lon: -79.0101 }, indice);
  assert.deepEqual(
    [esquina.calle, esquina.cruce].sort(),
    ["Avenida Fray Vicente Solano", "Avenida Remigio Crespo Toral"],
  );
  // A mitad de cuadra, solo una calle.
  const tramo = esquinaCercana({ lat: -2.9152, lon: -79.0101 }, indice);
  assert.equal(tramo.calle, "Avenida Fray Vicente Solano");
  assert.equal(tramo.cruce, null);
  // Lejos de todo, nada.
  assert.equal(esquinaCercana({ lat: -2.7, lon: -78.8 }, indice), null);
});

test("esquinaCercana con las calles reales: el Parque Calderón", (t) => {
  let datos;
  try {
    datos = JSON.parse(readFileSync(new URL("../../datos/calles/calles.geojson", import.meta.url)));
  } catch {
    t.skip("falta datos/calles/calles.geojson (morlaco actualizar calles)");
    return;
  }
  const real = prepararIndice(datos);
  const inicio = performance.now();
  const esquina = esquinaCercana({ lat: -2.89735, lon: -79.00445 }, real);
  assert.ok(performance.now() - inicio < 500, "debería ser rápido");
  const nombres = [esquina.calle, esquina.cruce];
  assert.ok(nombres.includes("Simón Bolívar") || nombres.includes("Benigno Malo"), nombres.join(" / "));
});

test("sugerirCalles completa la calle que se escribe", () => {
  assert.deepEqual(sugerirCalles("Bo", indice), []); // muy poco escrito
  const nombres = sugerirCalles("boli", indice).map((s) => s.nombre);
  assert.deepEqual(nombres.slice(0, 2), ["Simón Bolívar", "Avenida Simon Bolivar"]);
  assert.equal(sugerirCalles("boli", indice)[0].texto, "Simón Bolívar");
});

test("sugerirCalles, después de «y», solo sugiere calles que se cruzan", () => {
  // La Solano cruza la Remigio Crespo, pero no la Ordóñez Lasso ni Tamariz.
  const todas = sugerirCalles("Solano y ", indice);
  assert.deepEqual(todas.map((s) => s.nombre), ["Avenida Remigio Crespo Toral"]);
  assert.equal(todas[0].texto, "Solano y Avenida Remigio Crespo Toral");
  // Sin el espacio final también vale, y lo escrito filtra por el comienzo de las palabras.
  assert.deepEqual(sugerirCalles("Solano y", indice).map((s) => s.nombre), ["Avenida Remigio Crespo Toral"]);
  assert.deepEqual(sugerirCalles("Solano y Re", indice).map((s) => s.nombre), ["Avenida Remigio Crespo Toral"]);
  assert.deepEqual(sugerirCalles("Solano y Ord", indice), []);
  assert.deepEqual(sugerirCalles("Bolívar & Ben", indice).map((s) => s.texto), ["Bolívar & Benigno Malo"]);
  assert.deepEqual(sugerirCalles("Calle que no existe y ", indice), []);
});

test("sugerirCalles con las calles reales es rápido", (t) => {
  let datos;
  try {
    datos = JSON.parse(readFileSync(new URL("../../datos/calles/calles.geojson", import.meta.url)));
  } catch {
    t.skip("falta datos/calles/calles.geojson (morlaco actualizar calles)");
    return;
  }
  const real = prepararIndice(datos);
  let inicio = performance.now();
  const sucre = sugerirCalles("Sucre y ", real, 50).map((s) => s.nombre);
  const primera = performance.now() - inicio;
  assert.ok(sucre.includes("Presidente Borrero"), sucre.join(", "));
  assert.ok(primera < 800, `tardó ${Math.round(primera)} ms`);
  inicio = performance.now();
  assert.equal(sugerirCalles("Sucre y Borr", real)[0].nombre, "Presidente Borrero");
  assert.ok(performance.now() - inicio < 100, "la segunda vez usa lo ya calculado");
  inicio = performance.now();
  sugerirCalles("Av. de las Américas y ", real);
  assert.ok(performance.now() - inicio < 1500, "una avenida larga tampoco tarda mucho");
});
