// Página de datos abiertos: pinta el catálogo (datos/indice.json) con la última
// actualización de cada fuente (datos/estado.json), en español o en inglés.

import { etiquetaIdioma, idioma, idiomaInicial, t, usarIdioma } from "./textos.js";

const CLAVE_IDIOMA = "morlaco:idioma"; // la misma que la página principal

const $ = (id) => document.getElementById(id);

function leer(clave) {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardar(clave, valor) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento (modo privado, por ejemplo): no pasa nada.
  }
}

function aplicarTextos() {
  document.documentElement.lang = etiquetaIdioma();
  document.title = t("dtTituloPagina");
  for (const nodo of document.querySelectorAll("[data-t]")) nodo.textContent = t(nodo.dataset.t);
  for (const nodo of document.querySelectorAll("[data-t-html]")) nodo.innerHTML = t(nodo.dataset.tHtml);
  for (const nodo of document.querySelectorAll("[data-t-aria-label]")) nodo.setAttribute("aria-label", t(nodo.dataset.tAriaLabel));
}

function elemento(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (clave === "class") nodo.className = valor;
    else nodo.setAttribute(clave, valor);
  }
  nodo.append(...hijos.filter((h) => h !== null && h !== undefined && h !== ""));
  return nodo;
}

/** "Actualizado el …" de un conjunto, si su fuente de Morlaco aparece en estado.json. */
function actualizado(conjunto, estado) {
  if (!conjunto.fuente_morlaco) return conjunto.frecuencia === "a mano" ? t("dtSeRevisaAMano") : null;
  const e = estado?.[conjunto.fuente_morlaco];
  if (!e?.actualizado) return null;
  const fecha = new Intl.DateTimeFormat(etiquetaIdioma(), { dateStyle: "long", timeStyle: "short", timeZone: "America/Guayaquil" });
  // "7:37 a. m." ya termina en punto: no se añade otro.
  const cuando = fecha.format(new Date(e.actualizado));
  const texto = t("dtActualizado", { fecha: `${cuando}${cuando.endsWith(".") ? "" : "."}` });
  return e.ok ? texto : `${texto} ${t("dtFallo")}`;
}

function pintarConjunto(c, estado) {
  // En inglés, la descripción del catálogo en inglés; los campos y las rutas no se traducen.
  const texto = idioma() === "en" && c.en ? { ...c, ...c.en } : c;
  const enlace = c.archivo.includes(",") || c.archivo.includes("zona-N") ? null : c.url;
  const campos = Object.entries(texto.campos ?? {});
  return elemento(
    "article",
    { class: "conjunto", id: c.id },
    elemento("h4", {}, texto.titulo),
    elemento("p", {}, texto.descripcion),
    elemento(
      "p",
      { class: "conjunto-url" },
      enlace ? elemento("a", { href: enlace }, elemento("code", {}, c.archivo)) : elemento("code", {}, c.archivo),
    ),
    elemento(
      "dl",
      { class: "conjunto-ficha" },
      elemento("dt", {}, t("dtFormato")),
      elemento("dd", {}, texto.formato),
      elemento("dt", {}, t("dtFrecuencia")),
      elemento("dd", {}, texto.frecuencia),
      elemento("dt", {}, t("fuente")),
      elemento("dd", {}, texto.fuente),
      elemento("dt", {}, t("dtLicencia")),
      elemento("dd", {}, texto.licencia),
    ),
    campos.length
      ? elemento(
          "details",
          { class: "conjunto-campos" },
          elemento("summary", {}, t("dtCampos", { n: campos.length })),
          elemento("dl", {}, ...campos.flatMap(([nombre, descripcion]) => [elemento("dt", {}, elemento("code", {}, nombre)), elemento("dd", {}, descripcion)])),
        )
      : null,
    elemento("p", { class: "detalle" }, actualizado(c, estado)),
  );
}

async function iniciar() {
  usarIdioma(idiomaInicial(leer(CLAVE_IDIOMA), navigator.languages ?? [navigator.language]));
  aplicarTextos();
  $("idioma").addEventListener("click", () => {
    guardar(CLAVE_IDIOMA, idioma() === "en" ? "es" : "en");
    location.reload();
  });

  try {
    const [indice, estado] = await Promise.all(
      ["../datos/indice.json", "../datos/estado.json"].map((r) => fetch(r).then((x) => (x.ok ? x.json() : null))),
    );
    if (!indice) throw new Error("sin catálogo");
    const porTema = new Map();
    for (const c of indice.conjuntos) {
      if (!porTema.has(c.tema)) porTema.set(c.tema, []);
      porTema.get(c.tema).push(c);
    }
    const temas = t("dtTemas");
    $("datos-lista").replaceChildren(
      ...[...porTema].map(([tema, conjuntos]) =>
        elemento("section", { class: "tema" }, elemento("h3", {}, temas[tema] ?? tema), ...conjuntos.map((c) => pintarConjunto(c, estado))),
      ),
    );
    $("datos-cargando").remove();
  } catch {
    $("datos-cargando").innerHTML = t("dtSinCatalogo");
  }
}

iniciar();
