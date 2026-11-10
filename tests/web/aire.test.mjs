import assert from "node:assert/strict";
import { test } from "node:test";

import { aireCercano, leerAire, leerClima, leerUv, nivelAire, nivelUv } from "../../web/aire.js";

// Recorte de una respuesta real de caire.emov.gob.ec/datos/ica/obtener (10 de noviembre de 2026).
const estacion = (nombre, lat, lon, valor, parametros, fecha = "2026-11-10T13:00:00.000+00:00") => ({
  fecha,
  estacion: nombre,
  estacionObjeto: { id: 1, direccion: "Bolívar 7-77 y Borrero", latitud: lat, longitud: lon, nombre },
  icaEstacion: {
    idEscala: 1,
    valor,
    escala: "BUENA",
    recomendaciones: ["¡Es un día excelente para realizar actividades al aire libre!"],
    fechaString: "2026/11/10 08:00",
  },
  icaParametros: parametros.map(([parametro, v]) => ({ parametro, valor: v })),
  direccionViento: null,
});

const RESPUESTA = {
  icaEstacionWeb: [
    estacion("Centro Histórico", -2.897, -79.003, 32, [["CO", 0], ["OZONE", 32], ["SO2", 3], ["PM25", 21], ["PM10", 19]]),
    estacion("Sector Parque Industrial", -2.879789, -78.980213, 26, [["PM25", 26]]),
    estacion("Sector Control Sur", -2.91641226, -79.03393596, 2, [["CO", 0], ["SO2", 2]]),
  ],
};

const a_las_0930 = new Date("2026-11-10T14:30:00Z"); // 09:30 en Cuenca

test("nivelAire sigue la escala de la EMOV", () => {
  assert.deepEqual([0, 50, 51, 100, 150, 151, 200, 201, 300, 301, 500].map(nivelAire), [1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6]);
});

test("leerAire: estaciones con su índice, su contaminante dominante y lo que miden", () => {
  const estaciones = leerAire(RESPUESTA, a_las_0930);
  assert.equal(estaciones.length, 3);
  const [centro, industrial, sur] = estaciones;
  assert.equal(centro.nombre, "Centro Histórico");
  assert.equal(centro.valor, 32);
  assert.equal(centro.nivel, 1);
  assert.equal(centro.dominante, "OZONE");
  assert.equal(centro.mideParticulas, true);
  assert.equal(centro.fecha.toISOString(), "2026-11-10T13:00:00.000Z");
  assert.equal(industrial.dominante, "PM25");
  assert.equal(sur.mideParticulas, false);
});

test("leerAire descarta los datos viejos, incompletos o con otra forma", () => {
  // Ayer a la misma hora: ya no dice cómo está el aire.
  assert.deepEqual(leerAire(RESPUESTA, new Date("2026-11-11T14:30:00Z")), []);
  assert.deepEqual(leerAire(null), []);
  assert.deepEqual(leerAire({ icaEstacionWeb: "error" }), []);
  const rota = structuredClone(RESPUESTA);
  rota.icaEstacionWeb[0].icaEstacion = null; // la web de la EMOV asume que nunca falta
  rota.icaEstacionWeb[1].icaParametros = [];
  delete rota.icaEstacionWeb[2].estacionObjeto.latitud;
  assert.deepEqual(leerAire(rota, a_las_0930), []);
});

test("aireCercano prefiere la estación más cercana que mide partículas", () => {
  const estaciones = leerAire(RESPUESTA, a_las_0930);
  // Junto al Control Sur: su estación solo mide CO y SO2, así que se usa la del Centro.
  const cercaDelSur = aireCercano({ lat: -2.9165, lon: -79.034 }, estaciones);
  assert.equal(cercaDelSur.nombre, "Centro Histórico");
  assert.ok(cercaDelSur.metros > 3000 && cercaDelSur.metros < 5000, String(cercaDelSur.metros));
  // En Ricaurte, la del Parque Industrial.
  assert.equal(aireCercano({ lat: -2.875, lon: -78.975 }, estaciones).nombre, "Sector Parque Industrial");
  // Si ninguna mide partículas, la más cercana de las que haya.
  const soloSur = estaciones.filter((e) => !e.mideParticulas);
  assert.equal(aireCercano({ lat: -2.9, lon: -79.0 }, soloSur).nombre, "Sector Control Sur");
  assert.equal(aireCercano({ lat: -2.9, lon: -79.0 }, []), null);
});

test("nivelUv sigue la escala de la OMS", () => {
  assert.deepEqual([0, 2, 3, 5, 6, 7, 8, 10, 11, 14].map(nivelUv), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test("leerUv y leerClima: el último dato si es reciente; si no, nada", () => {
  // Respuestas reales de la EMOV (10 de noviembre de 2026).
  const uv = { fecha: "2026-11-10T16:53:00.000+00:00", fechaString: "2026/11/10 11:53", iuvValor: 5, escalaIuv: { condicion: "MODERADO" } };
  const clima = { fecha: "2026-11-10T17:00:00.000+00:00", fechaString: null, temperatura: 18.1, humedad: 51.0 };
  const a_las_1230 = new Date("2026-11-10T17:30:00Z");
  assert.deepEqual(leerUv(uv, a_las_1230), { valor: 5, nivel: 2, fecha: new Date(uv.fecha) });
  assert.deepEqual(leerClima(clima, a_las_1230), { temperatura: 18, humedad: 51, fecha: new Date(clima.fecha) });
  // Tres horas después ya no dice cómo está el sol.
  const tarde = new Date("2026-11-10T20:30:00Z");
  assert.equal(leerUv(uv, tarde), null);
  assert.equal(leerClima(clima, tarde), null);
  // Respuestas rotas.
  assert.equal(leerUv(null), null);
  assert.equal(leerUv({ ...uv, iuvValor: "5" }, a_las_1230), null);
  assert.equal(leerClima({ ...clima, temperatura: 99 }, a_las_1230), null);
  assert.deepEqual(leerClima({ ...clima, humedad: null }, a_las_1230).humedad, null);
});
