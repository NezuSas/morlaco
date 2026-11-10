import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  avisosDeLinea,
  describirDestinos,
  dolares,
  estacionCercana,
  frecuenciaTranvia,
  pasajeDeOpcion,
  describirFrecuencia,
  horarioDeHoy,
  lineasCercanas,
  tipoDeDia,
} from "../../web/buses.js";

const enCuenca = (iso) => new Date(`${iso}-05:00`);
const lunes10h = enCuenca("2026-11-09T10:00");

const tramo = (linea, tipo, hacia, sentido, coords) => ({
  type: "Feature",
  properties: { linea, tipo, hacia, sentido },
  geometry: { type: "LineString", coordinates: coords },
});

const lineas = {
  features: [
    tramo("7", "linea", "Mall del Rio", "ida", [[-79.01, -2.9], [-79.0, -2.9]]),
    tramo("7", "linea", "Trigales Altos", "retorno", [[-79.0, -2.9005], [-79.01, -2.9005]]),
    tramo("7", "alargue", "Capulies", "ida", [[-79.0, -2.9], [-78.99, -2.89]]),
    tramo("12", "linea", "Banos", "ida", [[-79.05, -2.95], [-79.04, -2.95]]),
    tramo("Tranvía", "tranvia", "Parque Industrial", "ida", [[-79.006, -2.902], [-79.0, -2.902]]),
  ],
};

const rutas = [
  {
    linea: "7",
    sentido: "ida",
    horarios: {
      lunes_viernes: { inicio: "05:50", fin: "21:15", intervalo_min: 9 },
      sabados: { inicio: "06:00", fin: "20:30", intervalo_min: 12 },
      domingos: null,
    },
  },
];

test("tipoDeDia según el día en Cuenca", () => {
  assert.equal(tipoDeDia(lunes10h), "lunes_viernes");
  assert.equal(tipoDeDia(enCuenca("2026-11-14T10:00")), "sabados");
  assert.equal(tipoDeDia(enCuenca("2026-11-15T10:00")), "domingos");
});

test("horarioDeHoy distingue sin servicio de sin datos", () => {
  assert.deepEqual(horarioDeHoy("7", rutas, lunes10h), { inicio: "05:50", fin: "21:15", intervalo_min: 9 });
  assert.equal(horarioDeHoy("7", rutas, enCuenca("2026-11-15T10:00")), null);
  assert.equal(horarioDeHoy("99", rutas, lunes10h), undefined);
});

test("describirFrecuencia", () => {
  const h = { inicio: "05:50", fin: "21:15", intervalo_min: 9 };
  assert.equal(describirFrecuencia(h, lunes10h), "Cada 9 min, de 05:50 a 21:15");
  assert.equal(describirFrecuencia(h, enCuenca("2026-11-09T22:00")), "Hoy de 05:50 a 21:15; a esta hora ya no pasa");
  assert.equal(describirFrecuencia(h, enCuenca("2026-11-09T05:00")), "Empieza a las 05:50; hoy de 05:50 a 21:15");
  assert.equal(describirFrecuencia(null, lunes10h), "Hoy no tiene servicio");
  assert.equal(describirFrecuencia(undefined, lunes10h), "Sin horario publicado");
});

test("lineasCercanas agrupa por línea, ordena por distancia y omite las lejanas", () => {
  const cercanas = lineasCercanas({ lat: -2.9001, lon: -79.005 }, lineas, rutas, { fecha: lunes10h });
  assert.deepEqual(cercanas.map((l) => l.linea), ["7", "Tranvía"]);
  const siete = cercanas[0];
  assert.deepEqual(siete.destinos, ["Mall del Rio", "Trigales Altos"]);
  assert.equal(siete.trazados.length, 3); // los dos sentidos y el alargue
  assert.ok(siete.metros < 20);
  assert.equal(siete.horario.intervalo_min, 9);
  assert.equal(cercanas[1].horario, undefined); // el tranvía no está en el CSV de buses
});

test("describirDestinos", () => {
  assert.equal(describirDestinos(["Mall del Rio", "Trigales Altos"]), "Entre Mall del Rio y Trigales Altos");
  assert.equal(describirDestinos(["Banos"]), "Hacia Banos");
  assert.equal(describirDestinos([]), "");
});

test("con los trazados reales: por el Parque Calderón pasan varias líneas", (t) => {
  let datos;
  try {
    datos = JSON.parse(readFileSync(new URL("../../datos/buses/lineas.geojson", import.meta.url)));
  } catch {
    t.skip("falta datos/buses/lineas.geojson (morlaco actualizar buses)");
    return;
  }
  const cercanas = lineasCercanas({ lat: -2.89733, lon: -79.00454 }, datos, [], { fecha: lunes10h });
  assert.ok(cercanas.length >= 3, `solo ${cercanas.length} líneas`);
  assert.ok(cercanas.every((l) => l.metros <= 350));
});

test("avisosDeLinea muestra los vigentes y oculta los vencidos", () => {
  const avisos = [
    { lineas: ["14"], desde: "2026-08-20", hasta: "2027-03-31", es: "Hasta el hospital" },
    { lineas: ["11", "11B"], desde: "2026-10-19", hasta: "2026-11-25", es: "Desvío" },
  ];
  assert.deepEqual(avisosDeLinea(avisos, "14", lunes10h).map((a) => a.es), ["Hasta el hospital"]);
  assert.equal(avisosDeLinea(avisos, "11B", lunes10h).length, 1);
  assert.equal(avisosDeLinea(avisos, "11B", enCuenca("2026-11-26T08:00")).length, 0);
  assert.deepEqual(avisosDeLinea(avisos, "7", lunes10h), []);
  assert.deepEqual(avisosDeLinea(undefined, "7", lunes10h), []);
});

test("frecuenciaTranvia: 8 min entre semana y 15 el fin de semana", () => {
  const tranvia = { frecuencia_min: { lunes_viernes: 8, fin_de_semana: 15 } };
  assert.equal(frecuenciaTranvia(tranvia, lunes10h), 8);
  assert.equal(frecuenciaTranvia(tranvia, enCuenca("2026-11-14T10:00")), 15); // sábado
  assert.equal(frecuenciaTranvia(null, lunes10h), null);
});

test("pasajeDeOpcion suma cada bus y el tranvía", () => {
  const tarifas = { bus: { personalizada: 0.3 }, tranvia: { normal: 0.35 } };
  const opcion = (...tipos) => ({
    tramos: [{ modo: "pie" }, ...tipos.map((tipo) => ({ modo: "bus", tipo })), { modo: "pie" }],
  });
  assert.equal(pasajeDeOpcion(opcion("linea"), tarifas), 0.3);
  assert.equal(pasajeDeOpcion(opcion("linea", "tranvia"), tarifas), 0.65);
  assert.equal(pasajeDeOpcion(opcion("linea", "linea"), tarifas), 0.6);
  assert.equal(pasajeDeOpcion(opcion(), tarifas), null); // a pie
  assert.equal(pasajeDeOpcion(opcion("linea"), null), null);
  assert.equal(dolares(0.3), "$0,30");
});

test("estacionCercana usa las estaciones del tranvía", () => {
  const estaciones = {
    features: [
      { properties: { nombre: "Padre Aguirre" }, geometry: { coordinates: [-79.00599, -2.89442] } },
      { properties: { nombre: "Aeropuerto" }, geometry: { coordinates: [-78.98774, -2.8895] } },
    ],
  };
  assert.equal(estacionCercana({ lat: -2.8955, lon: -79.0055 }, estaciones).nombre, "Padre Aguirre");
  assert.equal(estacionCercana({ lat: -2.95, lon: -79.05 }, estaciones), null);
});
