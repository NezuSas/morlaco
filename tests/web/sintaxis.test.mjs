import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { test } from "node:test";

// app.js y mapa.js necesitan el navegador y no los cargan las otras pruebas: aquí al menos se
// comprueba que todos los archivos de la página se pueden leer (un paréntesis de más la deja en blanco).
const carpeta = new URL("../../web/", import.meta.url);
for (const archivo of readdirSync(carpeta).filter((nombre) => nombre.endsWith(".js"))) {
  test(`${archivo} no tiene errores de sintaxis`, () => {
    assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", new URL(archivo, carpeta).pathname.replace(/^\/(\w:)/, "$1")], { stdio: "pipe" }));
  });
}
