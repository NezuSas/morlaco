// Cartel para imprimir: el código QR de Morlaco y, si se elige, el horario de la basura
// de una zona. Se imprime en español o en inglés, siempre con una línea en el otro idioma.

import { horaLegible, nombreDia } from "./logica.js";
import { etiquetaIdioma, idioma, idiomaInicial, listar, t, usarIdioma } from "./textos.js";

const CLAVE_IDIOMA = "morlaco:idioma"; // la misma que la página principal
const $ = (id) => document.getElementById(id);
let zonas = [];
const ZONA_PEDIDA = new URLSearchParams(location.search).get("zona");

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

function pintarZona() {
  const numero = Number($("zona").value);
  const zona = zonas.find((z) => z.properties.zona === numero)?.properties;
  $("zona-cartel").hidden = !zona;
  const url = new URL(location.href);
  if (zona) url.searchParams.set("zona", numero);
  else url.searchParams.delete("zona");
  history.replaceState(null, "", url);
  if (!zona) return;
  $("zona-titulo").textContent = t("cartelZona", { zona: zona.zona });
  const reciclaje = zona.dia_reciclaje ? zona.dias_iso[zona.dias.indexOf(zona.dia_reciclaje)] : null;
  $("zona-texto").textContent = [
    t("cartelZonaDias", { dias: listar(zona.dias_iso.map(nombreDia)), desde: zona.desde, hasta: horaLegible(zona.hasta) }),
    reciclaje ? t("cartelZonaCeleste", { dia: nombreDia(reciclaje) }) : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function aplicarTextos() {
  document.documentElement.lang = etiquetaIdioma();
  document.title = t("cartelTituloPagina");
  for (const nodo of document.querySelectorAll("[data-t]")) nodo.textContent = t(nodo.dataset.t);
  const otro = idioma() === "es" ? "en" : "es";
  $("otro-idioma").textContent = t("cartelOtroIdioma");
  $("otro-idioma").lang = otro;
  $("idioma").textContent = otro === "en" ? "English" : "Español";
  $("idioma").lang = otro;
  const elegida = $("zona").value;
  $("zona").replaceChildren(
    new Option(t("cartelSinZona"), ""),
    ...zonas.map((z) => new Option(t("cartelZona", { zona: z.properties.zona }), z.properties.zona)),
  );
  $("zona").value = elegida;
  pintarZona();
}

// En pantallas angostas la hoja se reduce para verse entera.
function ajustarEscala() {
  const ancho = document.querySelector(".marco").clientWidth;
  const hoja = 210 * (96 / 25.4);
  document.documentElement.style.setProperty("--escala", Math.min(1, ancho / hoja).toFixed(3));
}

usarIdioma(idiomaInicial(new URLSearchParams(location.search).get("lang") ?? leer(CLAVE_IDIOMA), navigator.languages));
aplicarTextos();
ajustarEscala();
addEventListener("resize", ajustarEscala);

$("idioma").addEventListener("click", () => {
  usarIdioma(idioma() === "es" ? "en" : "es");
  guardar(CLAVE_IDIOMA, idioma());
  aplicarTextos();
});
$("zona").addEventListener("change", pintarZona);
$("imprimir").addEventListener("click", () => print());

try {
  const respuesta = await fetch("../datos/recoleccion/zonas.geojson");
  zonas = (await respuesta.json()).features.sort((a, b) => a.properties.zona - b.properties.zona);
  if (zonas.some((z) => String(z.properties.zona) === ZONA_PEDIDA)) {
    $("zona").replaceChildren(new Option("", ZONA_PEDIDA));
    $("zona").value = ZONA_PEDIDA;
  }
  aplicarTextos();
} catch {
  // Sin las zonas, el cartel sale igual, solo sin horario.
}
