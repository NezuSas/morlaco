// Prueba la página como se ve en un celular: abre cada pestaña, menú y panel a 320, 360 y 412 px
// (y en escritorio) y avisa si algo se sale de la pantalla o queda cortado en su contenedor.
//
// Usa Chrome o Edge sin ventana, con su protocolo de depuración, y un servidor propio de la
// carpeta del repositorio. Necesita conexión: el mapa pide su biblioteca y sus teselas.
//
//   node tests/ui/celular.mjs            (o, desde web/, npm run test:celular)
//   NAVEGADOR=/ruta/a/chrome node tests/ui/celular.mjs
//
// No corre con las demás pruebas (`node --test`) porque necesita un navegador instalado.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(fileURLToPath(import.meta.url), "../../..");
const PUNTO = "#-2.8974,-79.0045"; // el Parque Calderón: pasan buses, tranvía y hay farmacias
const PANTALLAS = [
  { nombre: "320 px", ancho: 320, alto: 640, movil: true, oscuro: true },
  // Con el botón "Aa": todo crece un 19 % y es donde más fácil se desborda algo.
  { nombre: "320 px con letra grande", ancho: 320, alto: 640, movil: true, letra: true },
  { nombre: "360 px", ancho: 360, alto: 760, movil: true },
  { nombre: "412 px", ancho: 412, alto: 900, movil: true },
  { nombre: "escritorio", ancho: 1280, alto: 800, movil: false },
];

// ---------- Servidor de la carpeta ----------
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".geojson": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".ics": "text/calendar" };
const servidor = createServer((peticion, respuesta) => {
  let ruta = normalize(join(RAIZ, decodeURIComponent(new URL(peticion.url, "http://x").pathname)));
  if (existsSync(ruta) && statSync(ruta).isDirectory()) ruta = join(ruta, "index.html");
  if (!ruta.startsWith(RAIZ) || !existsSync(ruta)) {
    respuesta.writeHead(404).end();
    return;
  }
  respuesta.writeHead(200, { "content-type": TIPOS[extname(ruta)] ?? "application/octet-stream" });
  respuesta.end(readFileSync(ruta));
});
await new Promise((listo) => servidor.listen(0, "127.0.0.1", listo));
const BASE = `http://127.0.0.1:${servidor.address().port}/web/`;

// ---------- Navegador ----------
const CANDIDATOS = [
  process.env.NAVEGADOR,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const navegador = CANDIDATOS.find((ruta) => existsSync(ruta));
if (!navegador) {
  console.error("No se encontró Chrome ni Edge. Indica uno con NAVEGADOR=/ruta/al/navegador.");
  servidor.close();
  process.exit(2);
}
const perfil = mkdtempSync(join(tmpdir(), "morlaco-ui-"));
const PUERTO = 9300 + Math.floor(Math.random() * 500);
const proceso = spawn(navegador, [
  "--headless=new",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--hide-scrollbars",
  "--no-first-run",
  `--remote-debugging-port=${PUERTO}`,
  `--user-data-dir=${perfil}`,
  "about:blank",
]);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

let destino;
for (let i = 0; i < 60 && !destino; i++) {
  await espera(500);
  try {
    destino = (await (await fetch(`http://127.0.0.1:${PUERTO}/json`)).json()).find((d) => d.type === "page");
  } catch {
    // todavía arrancando
  }
}
if (!destino) {
  console.error("El navegador no respondió.");
  proceso.kill();
  servidor.close();
  process.exit(2);
}
const ws = new WebSocket(destino.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let numero = 0;
const esperando = new Map();
const erroresConsola = [];
ws.onmessage = (mensaje) => {
  const dato = JSON.parse(mensaje.data);
  if (dato.id && esperando.has(dato.id)) {
    esperando.get(dato.id)(dato);
    esperando.delete(dato.id);
  }
  if (dato.method === "Runtime.exceptionThrown") erroresConsola.push(dato.params.exceptionDetails?.exception?.description ?? dato.params.exceptionDetails?.text);
};
const pedir = (method, params = {}) =>
  new Promise((resolver) => {
    const id = ++numero;
    esperando.set(id, resolver);
    ws.send(JSON.stringify({ id, method, params }));
  });
const js = async (codigo) => {
  const r = await pedir("Runtime.evaluate", { expression: `(async () => { ${codigo} })()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const esperarQue = async (condicion, ms = 15000) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try {
      if (await js(`return Boolean(${condicion});`)) return true;
    } catch {
      // la página todavía está cambiando
    }
    await espera(250);
  }
  return false;
};
await pedir("Runtime.enable");

// ---------- Lo que se revisa en la página ----------
// Se inyecta una vez por carga: busca lo que se sale de la pantalla (sin contar lo que un
// contenedor recorta o desliza a propósito) y lo que no cabe en su contenedor.
const AYUDAS = `
// El ancho es el del teléfono que se emula: si algo se desborda, el navegador agranda su
// pantalla virtual (innerWidth) hasta abarcarlo, y compararse con ella no detectaría nada.
window.__revisar = (nombre, w) => {
  const problemas = [];
  if (document.documentElement.scrollWidth > w + 1) problemas.push(nombre + ": la página mide " + document.documentElement.scrollWidth + " px de ancho en una pantalla de " + w);
  const recorta = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const x = getComputedStyle(a).overflowX;
      if (x !== "visible") return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest(".maplibregl-canvas-container, .maplibregl-marker, .maplibregl-popup, svg")) continue;
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if ((r.right > w + 1 || r.left < -1) && !recorta(el)) {
      problemas.push(nombre + ": se sale de la pantalla " + (el.id ? "#" + el.id : el.className || el.tagName) + " (" + Math.round(r.left) + " a " + Math.round(r.right) + " px)");
    }
  }
  return [...new Set(problemas)].slice(0, 6);
};
window.__dentro = (nombre, selector, contenedor) => {
  const el = document.querySelector(selector);
  const caja = contenedor ? document.querySelector(contenedor)?.getBoundingClientRect() : { left: 0, top: 0, right: window.__ancho, bottom: window.__alto };
  if (!el || !caja) return [nombre + ": no se encontró " + selector];
  const r = el.getBoundingClientRect();
  const fuera = r.left < caja.left - 1 || r.right > caja.right + 1 || r.top < caja.top - 1 || r.bottom > caja.bottom + 1;
  return fuera ? [nombre + ": " + selector + " no cabe en " + (contenedor ?? "la pantalla") + " (ocupa " + Math.round(r.top) + "-" + Math.round(r.bottom) + " de " + Math.round(caja.top) + "-" + Math.round(caja.bottom) + ")"] : [];
};
`;

const problemas = [];
const anotar = (lista) => problemas.push(...(lista ?? []));
let pantallaActual = null;
const revisar = async (nombre) => anotar(await js(`return __revisar(${JSON.stringify(nombre)}, ${pantallaActual.ancho});`));
const dentro = async (nombre, selector, contenedor = null) =>
  anotar(await js(`return __dentro(${JSON.stringify(nombre)}, ${JSON.stringify(selector)}, ${JSON.stringify(contenedor)});`));

const abrir = async (url, listo) => {
  await pedir("Page.navigate", { url: "about:blank" });
  await espera(200);
  await pedir("Page.navigate", { url });
  if (!(await esperarQue(listo, 20000))) {
    const estado = await js("return JSON.stringify({ url: location.href, listo: document.readyState, inicio: document.querySelector('#inicio')?.hidden, respuesta: document.querySelector('#respuesta')?.hidden, titulo: document.title });");
    throw new Error(`No terminó de cargar ${url}: ${estado}`);
  }
  await js(AYUDAS + `window.__ancho = ${pantallaActual.ancho}; window.__alto = ${pantallaActual.alto};`);
  await espera(1200); // el mapa y los datos que llegan después
};

for (const p of PANTALLAS) {
  const de = (texto) => `${p.nombre}: ${texto}`;
  pantallaActual = p;
  await pedir("Emulation.setDeviceMetricsOverride", { width: p.ancho, height: p.alto, deviceScaleFactor: 1, mobile: p.movil });
  await pedir("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: p.oscuro ? "dark" : "light" }] });
  console.log(`· ${p.nombre}${p.oscuro ? " (oscuro)" : ""}`);

  // La portada, sin nada guardado (ni la última calle, ni la copia sin conexión).
  await pedir("Storage.clearDataForOrigin", { origin: new URL(BASE).origin, storageTypes: "local_storage,service_workers,cache_storage" });
  if (p.letra) {
    await abrir(`${BASE}?ui=${Date.now()}`, "document.querySelector('#inicio')");
    await js("localStorage.setItem('morlaco:letra', 'grande');");
  }
  await abrir(`${BASE}?ui=${Date.now()}`, "document.querySelector('#inicio') && !document.querySelector('#inicio').hidden");
  await revisar(de("portada"));

  // Con una calle: la barra con "Instalar" (que en el teléfono sí aparece) y cada pestaña.
  await abrir(`${BASE}?ui=${Date.now()}${PUNTO}`, "!document.querySelector('#respuesta').hidden && document.querySelectorAll('#lineas button.linea').length");
  await js("document.getElementById('instalar').hidden = false;");
  await revisar(de("barra con Instalar"));
  const pestanas = await js("return [...document.querySelectorAll('.secciones a')].filter((a) => !a.hidden).map((a) => a.getAttribute('href'));");
  for (const pestana of pestanas) {
    await js(`document.querySelector('.secciones a[href="${pestana}"]').click();`);
    await espera(350);
    await revisar(de(`pestaña ${pestana.slice(3)}`));
  }
  await js("document.querySelector('.secciones a[href=\"#s-resumen\"]').click(); scrollTo(0, 0);");

  // "Más", abierto.
  await js("document.getElementById('mas-acciones').open = true;");
  await espera(200);
  await revisar(de("menú Más"));
  await dentro(de("menú Más"), ".mas-acciones-panel");
  await js("document.getElementById('mas-acciones').open = false;");

  // Capas del mapa: debe caber dentro del mapa.
  await js("document.getElementById('mapa').scrollIntoView({ block: 'center' }); document.querySelector('.control-capas summary').click();");
  await espera(400);
  await dentro(de("capas del mapa"), ".control-capas", "#mapa");
  await revisar(de("capas del mapa"));
  await js("document.querySelector('.control-capas summary').click();");

  // Una línea de bus elegida: su panel no tapa ni se sale.
  await js("document.querySelector('.secciones a[href=\"#s-buses\"]').click(); document.querySelectorAll('#lineas button.linea')[1].click();");
  await espera(1800);
  await revisar(de("línea elegida"));
  await dentro(de("panel de la línea"), ".panel-linea");

  // El mapa ampliado (solo en el celular): la barra con la X y las capas dentro.
  if (p.movil) {
    await js("document.querySelector('.boton-ampliar').click();");
    await espera(1500);
    await dentro(de("mapa ampliado"), ".mapa-cerrar");
    await revisar(de("mapa ampliado"));
    await js("document.querySelector('.control-capas summary').click();");
    await espera(400);
    await dentro(de("capas en el mapa ampliado"), ".control-capas", "#mapa");
    await js("document.querySelector('.control-capas summary').click(); document.querySelector('.mapa-cerrar').click();");
    await espera(800);
  }

  // Las sugerencias del buscador.
  await js("document.querySelector('.secciones a[href=\"#s-resumen\"]').click(); scrollTo(0, 0); document.getElementById('cambiar-punto').click();");
  await espera(300);
  await js("const c = document.getElementById('direccion'); c.focus(); c.value = 'sucre'; c.dispatchEvent(new Event('input', { bubbles: true }));");
  if (await esperarQue("document.querySelector('#sugerencias li, .sugerencias:not([hidden]) li')", 8000)) {
    await revisar(de("sugerencias del buscador"));
    await dentro(de("sugerencias del buscador"), ".sugerencias:not([hidden])");
  } else {
    problemas.push(de("las sugerencias del buscador no aparecieron"));
  }
}

ws.close();
proceso.kill();
servidor.close();
try {
  rmSync(perfil, { recursive: true, force: true });
} catch {
  // el navegador puede tardar en soltar su carpeta
}

const errores = [...new Set(erroresConsola.filter(Boolean))];
if (errores.length) problemas.push(...errores.map((e) => `error en la consola: ${e.split("\n")[0]}`));
if (problemas.length) {
  console.error(`\n${problemas.length} problema(s):`);
  for (const problema of problemas) console.error(`  ✗ ${problema}`);
  process.exit(1);
}
console.log("\nTodo cabe: nada se sale de la pantalla ni queda cortado.");
