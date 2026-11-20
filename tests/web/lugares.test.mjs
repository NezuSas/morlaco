import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cambiarLugar,
  leerLugar,
  leerLugares,
  lugarDe,
  leerDestino,
  lugarPorNombre,
  sugerirLugares,
  textoDeDestino,
  textoDeLugar,
} from "../../web/lugares.js";

const sucre = { lat: -2.89812, lon: -79.00301 };

test("leerLugar entiende el formato nuevo y el antiguo", () => {
  assert.deepEqual(leerLugar(textoDeLugar(sucre, "Sucre y Borrero")), { ...sucre, nombre: "Sucre y Borrero" });
  assert.deepEqual(leerLugar("#-2.89812,-79.00301"), { ...sucre, nombre: null });
  assert.equal(leerLugar(null), null);
  assert.equal(leerLugar("basura"), null);
  assert.equal(leerLugar('{"lat": 200, "lon": 0}'), null);
});

test("leerLugares ignora lo que no es válido", () => {
  assert.deepEqual(leerLugares(null), { casa: null, trabajo: null });
  assert.deepEqual(leerLugares("{roto"), { casa: null, trabajo: null });
  const guardado = JSON.stringify({ casa: { ...sucre, nombre: " Casa de mamá " }, trabajo: { lat: "x" } });
  assert.deepEqual(leerLugares(guardado), { casa: { ...sucre, nombre: "Casa de mamá" }, trabajo: null });
});

test("cambiarLugar guarda y borra sin tocar el original", () => {
  const vacio = leerLugares(null);
  const conCasa = cambiarLugar(vacio, "casa", { lat: -2.898123456, lon: -79.003009 }, "Sucre y Borrero");
  assert.deepEqual(conCasa.casa, { lat: -2.89812, lon: -79.00301, nombre: "Sucre y Borrero" });
  assert.equal(vacio.casa, null);
  assert.equal(cambiarLugar(conCasa, "casa", null).casa, null);
  assert.throws(() => cambiarLugar(vacio, "playa", sucre));
});

test("lugarDe reconoce un lugar guardado a pocos metros", () => {
  const lugares = cambiarLugar(leerLugares(null), "trabajo", sucre, "Oficina");
  assert.equal(lugarDe({ lat: -2.89815, lon: -79.00305 }, lugares), "trabajo");
  assert.equal(lugarDe({ lat: -2.9, lon: -79.01 }, lugares), null);
});

const CONOCIDOS = [
  { nombre: "Terminal Terrestre", lat: -2.892163, lon: -78.993195 },
  { nombre: "Parque Calderón", lat: -2.897394, lon: -79.004469 },
  { nombre: "Mercado 10 de Agosto", lat: -2.900114, lon: -79.005856 },
];

test("los lugares conocidos se sugieren con el comienzo de sus palabras, sin tildes", () => {
  assert.deepEqual(sugerirLugares("termin", CONOCIDOS).map((l) => l.nombre), ["Terminal Terrestre"]);
  assert.deepEqual(sugerirLugares("Terminal Terrestr", CONOCIDOS).map((l) => l.nombre), ["Terminal Terrestre"]);
  assert.deepEqual(sugerirLugares("calderon", CONOCIDOS).map((l) => l.nombre), ["Parque Calderón"]);
  assert.deepEqual(sugerirLugares("10 de ago", CONOCIDOS).map((l) => l.nombre), ["Mercado 10 de Agosto"]);
  assert.deepEqual(sugerirLugares("te", CONOCIDOS), []); // muy corto
  assert.deepEqual(sugerirLugares("aeropuerto", CONOCIDOS), []);
});

test("un lugar conocido se reconoce por su nombre exacto", () => {
  assert.equal(lugarPorNombre("terminal terrestre", CONOCIDOS)?.lat, -2.892163);
  assert.equal(lugarPorNombre("Parque Calderon", CONOCIDOS)?.nombre, "Parque Calderón");
  assert.equal(lugarPorNombre("Terminal", CONOCIDOS), null);
  assert.equal(lugarPorNombre("", CONOCIDOS), null);
});

test("el último destino se recuerda 12 horas", () => {
  const ahora = Date.parse("2026-11-20T15:00:00Z");
  const guardado = textoDeDestino("Terminal Terrestre", ahora);
  assert.equal(leerDestino(guardado, ahora + 60_000), "Terminal Terrestre");
  assert.equal(leerDestino(guardado, ahora + 11.9 * 3_600_000), "Terminal Terrestre");
  assert.equal(leerDestino(guardado, ahora + 12.1 * 3_600_000), null); // al día siguiente, no
  assert.equal(leerDestino(guardado, ahora - 60_000), null); // reloj cambiado hacia atrás
  assert.equal(leerDestino(textoDeDestino("   ", ahora), ahora), null);
  assert.equal(leerDestino("basura", ahora), null);
  assert.equal(leerDestino(null, ahora), null);
});
