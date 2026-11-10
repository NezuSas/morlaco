import assert from "node:assert/strict";
import { test } from "node:test";

import { cambiarLugar, leerLugar, leerLugares, lugarDe, textoDeLugar } from "../../web/lugares.js";

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
