import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";

import { describirDestinos, describirFrecuencia } from "../../web/buses.js";
import { describirRecoleccion, formatoDistancia, nombreDia } from "../../web/logica.js";
import { clavesQueFaltan, idioma, idiomaInicial, listar, t, usarIdioma } from "../../web/textos.js";

const enCuenca = (iso) => new Date(`${iso}-05:00`);

afterEach(() => usarIdioma("es"));

test("los dos idiomas tienen las mismas claves", () => {
  assert.deepEqual(clavesQueFaltan(), []);
});

for (const pagina of ["index.html", "datos.html", "cartel.html"]) {
  test(`todas las claves que usa ${pagina} existen`, () => {
    const html = readFileSync(new URL(`../../web/${pagina}`, import.meta.url), "utf8");
    const claves = [...html.matchAll(/data-t(?:-html|-aria-label|-placeholder)?="(\w+)"/g)].map((m) => m[1]);
    assert.ok(claves.length > 8, `solo ${claves.length} textos marcados`);
    for (const idiomaPrueba of ["es", "en"]) {
      usarIdioma(idiomaPrueba);
      for (const clave of claves) assert.doesNotThrow(() => t(clave), `falta ${idiomaPrueba}:${clave}`);
    }
  });
}

test("datos.html no deja texto visible sin traducir", () => {
  const html = readFileSync(new URL("../../web/datos.html", import.meta.url), "utf8");
  const cuerpo = html.slice(html.indexOf("<body"), html.indexOf("<script"));
  // Cada párrafo, título, término o elemento de lista lleva su clave de texto (salvo el código).
  const sinClave = [...cuerpo.matchAll(/<(h1|h2|p|dt|li)\b(?![^>]*data-t)[^>]*>([^<]*[a-záéíóúñ][^<]*)</gi)]
    .map((m) => m[2].trim())
    .filter((texto) => texto && texto !== "Morlaco");
  assert.deepEqual(sinClave, []);
});

test("idiomaInicial: lo guardado manda; si no, el navegador; por defecto, español", () => {
  assert.equal(idiomaInicial("en", ["es-EC"]), "en");
  assert.equal(idiomaInicial(null, ["en-US", "es"]), "en");
  assert.equal(idiomaInicial(null, ["fr-FR", "es-EC"]), "es");
  assert.equal(idiomaInicial("xx", ["de-DE"]), "es");
  assert.equal(idiomaInicial(undefined, "en-GB"), "en");
});

test("usarIdioma ignora idiomas desconocidos", () => {
  usarIdioma("fr");
  assert.equal(idioma(), "es");
});

test("t sustituye variables y usa funciones para los plurales", () => {
  assert.equal(t("encontrado", { texto: "Sucre y Borrero" }), "Encontrado: Sucre y Borrero.");
  assert.equal(t("verMas", { n: 1 }), "Ver 1 línea más");
  usarIdioma("en");
  assert.equal(t("verMas", { n: 3 }), "Show 3 more lines");
  assert.equal(t("luzResumen", { n: 1 }), "Today there is 1 scheduled outage in Centro Sur’s area.");
  assert.throws(() => t("noExiste"));
});

test("listar une con y / and", () => {
  assert.equal(listar(["lunes", "miércoles", "viernes"]), "lunes, miércoles y viernes");
  usarIdioma("en");
  assert.equal(listar(["Monday", "Friday"]), "Monday and Friday");
  assert.equal(listar(["Monday"]), "Monday");
});

test("recolección y días en inglés", () => {
  usarIdioma("en");
  assert.equal(nombreDia(3), "Wednesday");
  const base = { desde: "08:00", hasta: "12:00" };
  assert.equal(describirRecoleccion({ ...base, estado: "ahora" }), "Passing now, until 12:00");
  assert.equal(describirRecoleccion({ ...base, estado: "proxima", enDias: 1, diaIso: 2 }), "Tomorrow, 08:00 to 12:00");
  assert.equal(describirRecoleccion({ ...base, estado: "proxima", enDias: 3, diaIso: 6 }), "On Saturday, 08:00 to 12:00");
});

test("frecuencias, destinos y distancias en inglés", () => {
  usarIdioma("en");
  const h = { inicio: "05:50", fin: "21:15", intervalo_min: 9 };
  assert.equal(describirFrecuencia(h, enCuenca("2026-11-09T10:00")), "Every 9 min, 05:50 to 21:15");
  assert.equal(describirFrecuencia(h, enCuenca("2026-11-09T22:00")), "Today 05:50 to 21:15; no more buses at this hour");
  assert.equal(describirFrecuencia(null), "No service today");
  assert.equal(describirDestinos(["Mall del Rio", "Trigales Altos"]), "Between Mall del Rio and Trigales Altos");
  assert.equal(formatoDistancia(1240), "1.2 km");
  usarIdioma("es");
  assert.equal(formatoDistancia(1240), "1,2 km");
});
