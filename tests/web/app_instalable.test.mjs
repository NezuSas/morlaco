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
