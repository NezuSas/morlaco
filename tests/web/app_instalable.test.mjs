import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const web = new URL("../../web/", import.meta.url);

test("el manifiesto tiene lo que piden los navegadores para instalar la app", () => {
  const manifiesto = JSON.parse(readFileSync(new URL("manifest.webmanifest", web), "utf8"));
  for (const campo of ["name", "short_name", "start_url", "display", "icons", "theme_color", "background_color"]) {
    assert.ok(manifiesto[campo], `falta ${campo}`);
  }
  assert.equal(manifiesto.display, "standalone");
  const tamanos = manifiesto.icons.map((i) => i.sizes);
  assert.ok(tamanos.includes("192x192") && tamanos.includes("512x512"));
  assert.ok(manifiesto.icons.some((i) => i.purpose === "maskable"));
  for (const icono of manifiesto.icons) {
    assert.ok(existsSync(new URL(icono.src, web)), `no existe ${icono.src}`);
  }
});

test("los atajos del ícono llevan a lo que la página sabe abrir", () => {
  const manifiesto = JSON.parse(readFileSync(new URL("manifest.webmanifest", web), "utf8"));
  assert.ok(manifiesto.shortcuts.length >= 3 && manifiesto.shortcuts.length <= 4);
  const pestanas = readFileSync(new URL("index.html", web), "utf8");
  for (const atajo of manifiesto.shortcuts) {
    assert.ok(atajo.name && atajo.url.startsWith("./?"), atajo.name);
    const parametros = new URLSearchParams(atajo.url.slice(2));
    const ver = parametros.get("ver");
    if (ver) assert.match(pestanas, new RegExp(`href="#s-${ver}"`), `no hay pestaña ${ver}`);
    const lugar = parametros.get("lugar");
    if (lugar) assert.ok(["casa", "trabajo"].includes(lugar), lugar);
    for (const icono of atajo.icons ?? []) assert.ok(existsSync(new URL(icono.src, web)), `no existe ${icono.src}`);
  }
});

test("todos los archivos que precarga el service worker existen", () => {
  const sw = readFileSync(new URL("sw.js", web), "utf8");
  const lista = /const PRECARGA = \[([\s\S]*?)\];/.exec(sw)[1];
  const rutas = [...lista.matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((r) => r !== "./");
  assert.ok(rutas.length > 10);
  for (const ruta of rutas) assert.ok(existsSync(new URL(ruta, web)), `no existe ${ruta}`);
});

test("index.html enlaza el manifiesto y el icono para iPhone", () => {
  const html = readFileSync(new URL("index.html", web), "utf8");
  assert.match(html, /<link rel="manifest" href="manifest.webmanifest"/);
  assert.match(html, /<link rel="apple-touch-icon" href="iconos\/apple-touch-icon.png"/);
});

test("index.html carga MapLibre con versión fija e integridad, sin bloquear la página", () => {
  const html = readFileSync(new URL("index.html", web), "utf8");
  assert.doesNotMatch(html, /leaflet/i);
  const guion = /<script\s+id="maplibre"([\s\S]*?)><\/script>/.exec(html)?.[1] ?? "";
  const version = /maplibre-gl@(\d+\.\d+\.\d+)\/dist\/maplibre-gl\.js/.exec(guion)?.[1];
  assert.ok(version, "falta el guion de MapLibre con versión fija");
  assert.match(guion, /integrity="sha384-/);
  assert.match(guion, /\sasync\b/);
  const hoja = /maplibre-gl@(\d+\.\d+\.\d+)\/dist\/maplibre-gl\.css/.exec(html)?.[1];
  assert.equal(hoja, version, "la hoja y el guion deben ser de la misma versión");
});

test("el service worker guarda los mapas de OpenFreeMap y precarga el módulo del mapa", () => {
  const sw = readFileSync(new URL("sw.js", web), "utf8");
  assert.match(sw, /tiles\.openfreemap\.org/);
  assert.doesNotMatch(sw, /tile\.openstreetmap\.org/);
  assert.match(sw, /"mapa\.js"/);
});
