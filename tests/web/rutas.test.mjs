import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { alarguesUnidos, paradasDeRecorrido, variantesDeLinea, planificar, prepararLineas, proyectar, tramo } from "../../web/rutas.js";

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

test("prepararLineas trae las rutas normales, cada alargue como variante y el horario de hoy", () => {
  assert.equal(recorridos.length, 4);
  assert.deepEqual(recorridos.map((r) => r.variante), [null, null, null, "Alargue"]);
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

test("cada tramo en bus trae su sentido y el recorrido entero para estimar sus buses", () => {
  const recorridos = prepararLineas(lineas, rutas, lunes10h);
  const [mejor] = planificar({ lat: -2.9005, lon: -79.025 }, { lat: -2.8995, lon: -78.975 }, recorridos, { fecha: lunes10h });
  const bus = mejor.tramos.find((t) => t.modo === "bus");
  assert.equal(bus.sentido, "ida");
  assert.ok(bus.largo > 6000 && bus.metrosSubida < bus.metrosBajada && bus.metrosBajada <= bus.largo);
  assert.deepEqual(bus.trazado[0].map((x) => Math.round(x * 1000)), [-79030, -2900]);
  assert.deepEqual(bus.trazado.at(-1).map((x) => Math.round(x * 1000)), [-78970, -2900]);
});

test("las paradas de un recorrido: a menos de 25 m, en orden y sin las de los extremos", () => {
  const parada = (id, lon, lat) => ({ type: "Feature", properties: { id, nombre: `P${id}` }, geometry: { type: "Point", coordinates: [lon, lat] } });
  const paradas = {
    features: [
      parada(1, -78.99, -2.9001), // sobre la línea, a unos 11 m
      parada(2, -79.02, -2.9), // sobre la línea, antes que la 1
      parada(3, -79.0, -2.901), // a unos 110 m: no
      parada(4, -79.03, -2.9), // en la terminal de salida: no
    ],
  };
  const ida = lineas.features[0]; // 7 de oeste a este
  assert.deepEqual(paradasDeRecorrido(ida, paradas).map((p) => p.id), [2, 1]);
  const retorno = lineas.features[1]; // al revés: el mismo par, en el otro orden
  assert.deepEqual(paradasDeRecorrido(retorno, paradas).map((p) => p.id), [1, 2]);
  assert.deepEqual(paradasDeRecorrido(ida, null), []);
});

test("los alargues que no tocan su línea no se dibujan", () => {
  const unido = recorrido("7", "ida", "Alargue", [[-78.97, -2.9], [-78.96, -2.91]], "alargue"); // sale del final
  const suelto = recorrido("7", "ida", "Lejos", [[-78.95, -2.95], [-78.94, -2.96]], "alargue"); // a varios km
  const trazados = [lineas.features[0], lineas.features[1], unido, suelto];
  assert.deepEqual(alarguesUnidos(trazados).map((f) => f.properties.hacia), ["Este", "Oeste", "Alargue"]);
});

test("cada alargue unido a la línea es una variante con la ruta completa", () => {
  // Sigue más allá del final de la ida: la variante es la ruta normal entera y el alargue.
  const sigue = recorrido("7", "ida", "Barrio", [[-78.97, -2.9], [-78.96, -2.91]], "alargue");
  // Un desvío que sale en -79.01 y vuelve en -78.99.
  const desvio = recorrido("7", "ida", "Desvío", [[-79.01, -2.9], [-79.0, -2.91], [-78.99, -2.9]], "alargue");
  const suelto = recorrido("7", "ida", "Lejos", [[-78.95, -2.95], [-78.94, -2.96]], "alargue");
  const variantes = variantesDeLinea([lineas.features[0], lineas.features[1], sigue, desvio, suelto]);
  assert.deepEqual(variantes.map((v) => v.properties.variante), ["Barrio", "Desvío"]);

  const [aBarrio, conDesvio] = variantes;
  const redondo = (c) => c.map((x) => Math.round(x * 1000));
  assert.deepEqual(redondo(aBarrio.geometry.coordinates[0]), [-79030, -2900]);
  assert.deepEqual(redondo(aBarrio.geometry.coordinates.at(-1)), [-78960, -2910]);
  assert.equal(aBarrio.properties.terminaEnAlargue, true);
  assert.equal(aBarrio.properties.hacia, "Barrio");

  assert.ok(conDesvio.geometry.coordinates.some((c) => Math.round(c[1] * 1000) === -2910), "pasa por el desvío");
  assert.deepEqual(redondo(conDesvio.geometry.coordinates.at(-1)), [-78970, -2900]); // y vuelve a la ruta
  assert.equal(conDesvio.properties.terminaEnAlargue, false);
  assert.equal(conDesvio.properties.hacia, "Este");
});

test("un alargue de terminal en dos piezas es una ida y vuelta desde esa terminal", () => {
  // Las dos piezas salen y vuelven a la terminal oeste (-79.03), donde empieza la ida y
  // termina el retorno; el rótulo de sentido de cada pieza no importa.
  const salida = recorrido("7", "ida", "Barrio Oeste", [[-79.03, -2.9], [-79.04, -2.89]], "alargue");
  const llegada = recorrido("7", "retorno", "Barrio Oeste", [[-79.04, -2.89], [-79.03, -2.9]], "alargue");
  const variantes = variantesDeLinea([lineas.features[0], lineas.features[1], salida, llegada]);
  const de = (s) => variantes.find((v) => v.properties.sentido === s);
  assert.equal(variantes.length, 2);
  for (const v of variantes) assert.deepEqual(v.properties.barrio, [-79.04, -2.89]);
  // La ida va primero al barrio y luego sigue hacia el este.
  const ida = de("ida").geometry.coordinates;
  assert.ok(ida.findIndex(([lon]) => lon === -79.04) < ida.length / 2);
  assert.equal(Math.round(ida.at(-1)[0] * 1000), -78970);
  // El retorno llega a la terminal oeste, va al barrio y vuelve.
  const retorno = de("retorno").geometry.coordinates;
  const pasaPorElCentro = retorno.findIndex(([lon]) => Math.round(lon * 1000) === -79010);
  assert.ok(retorno.findIndex(([lon]) => lon === -79.04) > pasaPorElCentro);
  assert.equal(Math.round(retorno.at(-1)[0] * 1000), -79030);
});

test("dos piezas de un barrio que se continúan son un desvío de ida y vuelta", () => {
  // Sale de la ruta en -79.01, va al barrio (-79.01, -2.92) y vuelve al mismo punto.
  const va = recorrido("7", "ida", "Rosal", [[-79.01, -2.9], [-79.01, -2.92]], "alargue");
  const vuelve = recorrido("7", "retorno", "Rosal", [[-79.01, -2.92], [-79.01, -2.9]], "alargue");
  const [ida] = variantesDeLinea([lineas.features[0], va, vuelve]);
  assert.equal(ida.properties.sentido, "ida");
  assert.equal(ida.properties.empiezaEnAlargue || ida.properties.terminaEnAlargue, false);
  assert.deepEqual(ida.properties.barrio, [-79.01, -2.92]);
  const c = ida.geometry.coordinates;
  assert.deepEqual(c[0].map((x) => Math.round(x * 1000)), [-79030, -2900]); // empieza en su terminal
  assert.deepEqual(c.at(-1).map((x) => Math.round(x * 1000)), [-78970, -2900]); // y termina en la otra
  assert.ok(c.some(([, lat]) => lat === -2.92), "pasa por el barrio");
});

test("el planificador usa las variantes cuando la ruta normal no llega", () => {
  // La 7 va de oeste a este por -2.9; su variante sigue desde el final hasta (-78.96, -2.93).
  const conVariante = {
    features: [...lineas.features, recorrido("7", "ida", "Barrio", [[-78.97, -2.9], [-78.96, -2.93]], "alargue")],
  };
  const recorridosConVariante = prepararLineas(conVariante, rutas, lunes10h);
  assert.ok(recorridosConVariante.some((r) => r.variante === "Barrio"));
  const [mejor] = planificar({ lat: -2.9005, lon: -79.025 }, { lat: -2.9295, lon: -78.9603 }, recorridosConVariante, {
    fecha: lunes10h,
  });
  const bus = mejor.tramos.find((t) => t.modo === "bus");
  assert.equal(bus.linea, "7");
  assert.equal(bus.variante, "Barrio");
  assert.equal(bus.espera, 10); // la frecuencia entera: no todos los buses hacen la variante
});

test("con la ruta normal a mano, la variante de la misma línea no sale aparte", () => {
  const conVariante = {
    features: [...lineas.features, recorrido("7", "ida", "Barrio", [[-78.97, -2.9], [-78.96, -2.903]], "alargue")],
  };
  const opciones = planificar({ lat: -2.9005, lon: -79.025 }, { lat: -2.9012, lon: -78.968 }, prepararLineas(conVariante, rutas, lunes10h), {
    fecha: lunes10h,
  });
  const variantes = opciones.map((o) => o.tramos.find((t) => t.modo === "bus")?.variante ?? null);
  assert.ok(opciones.some((o) => o.tramos.some((t) => t.linea === "7" && !t.variante)), "sale la ruta normal de la 7");
  assert.ok(!variantes.includes("Barrio"), JSON.stringify(variantes));
  // La tarjeta de la 7 avisa que algunos buses siguen por una variante junto al destino
  // (la que más acerca: aquí el alargue de siempre, que pasa aún más cerca que el barrio).
  const normal = opciones.find((o) => o.tramos.some((t) => t.linea === "7"));
  assert.ok(["Barrio", "Alargue"].includes(normal.variante?.lugar), JSON.stringify(normal.variante));
  assert.ok(normal.variante.metrosAlFinal < 100, `${normal.variante.metrosAlFinal} m`);
});

test("una variante que no ahorra caminar no se ofrece", () => {
  // La variante sale del final de la 7 hacia el noreste, lejos del destino: no ayuda.
  const conVariante = {
    features: [...lineas.features, recorrido("7", "ida", "Otro lado", [[-78.97, -2.9], [-78.96, -2.89]], "alargue")],
  };
  const opciones = planificar({ lat: -2.9005, lon: -79.025 }, { lat: -2.9012, lon: -78.99 }, prepararLineas(conVariante, rutas, lunes10h), {
    fecha: lunes10h,
  });
  assert.ok(!opciones.some((o) => o.tramos.some((t) => t.variante === "Otro lado")));
});

test("si el bus pasa dos veces junto a tu punto, se sube en la segunda pasada", () => {
  // La 9 va al este hasta un barrio y vuelve por la misma calle hacia el oeste, donde está el destino.
  const vaYVuelve = { features: [recorrido("9", "ida", "Oeste", [[-79.03, -2.95], [-79.0, -2.95], [-79.0, -2.9501], [-79.06, -2.9501]])] };
  const [opcion] = planificar({ lat: -2.9502, lon: -79.02 }, { lat: -2.9502, lon: -79.055 }, prepararLineas(vaYVuelve, [], lunes10h), {
    fecha: lunes10h,
  });
  const bus = opcion.tramos.find((t) => t.modo === "bus");
  // Sin ir y volver: unos 3,9 km en bus en vez de 7,8 km.
  assert.ok(bus.metros < 4500, `recorre ${Math.round(bus.metros)} m`);
});

test("pasada la última salida, el último bus todavía cuenta si no ha llegado a tu parada", () => {
  // La 7 sale por última vez a las 21:00; a 2,2 km del inicio llega unos 9 minutos después.
  const tarde = enCuenca("2026-11-09T21:05");
  const opciones = planificar({ lat: -2.9005, lon: -79.01 }, { lat: -2.9005, lon: -78.975 }, prepararLineas(lineas, rutas, tarde), { fecha: tarde });
  const bus = opciones[0].tramos.find((t) => t.modo === "bus");
  assert.equal(bus.linea, "7");
  assert.ok(bus.espera > 0 && bus.espera < 6, `espera ${bus.espera}`);
  assert.equal(opciones[0].fueraDeHorario, false);
});
