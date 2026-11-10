// Página de datos abiertos: pinta el catálogo (datos/indice.json) con la última
// actualización de cada fuente (datos/estado.json).

const TEMAS = {
  basura: "Basura",
  luz: "Luz",
  agua: "Agua",
  salud: "Farmacias",
  transporte: "Buses y tranvía",
  ciudad: "Calles y movilidad",
  control: "Control",
};

const $ = (id) => document.getElementById(id);

function elemento(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (clave === "class") nodo.className = valor;
    else nodo.setAttribute(clave, valor);
  }
  nodo.append(...hijos.filter((h) => h !== null && h !== undefined && h !== ""));
  return nodo;
}

const fecha = new Intl.DateTimeFormat("es-EC", { dateStyle: "long", timeStyle: "short", timeZone: "America/Guayaquil" });

/** "Actualizado el …" de un conjunto, si su fuente de Morlaco aparece en estado.json. */
function actualizado(conjunto, estado) {
  if (!conjunto.fuente_morlaco) return conjunto.frecuencia === "a mano" ? "Se revisa a mano." : null;
  const e = estado?.[conjunto.fuente_morlaco];
  if (!e?.actualizado) return null;
  const texto = `Actualizado el ${fecha.format(new Date(e.actualizado))}.`;
  return e.ok ? texto : `${texto} El último intento falló: se muestran los datos anteriores.`;
}

function pintarConjunto(c, estado) {
  const enlace = c.archivo.includes(",") || c.archivo.includes("zona-N") ? null : c.url;
  const campos = Object.entries(c.campos ?? {});
  return elemento(
    "article",
    { class: "conjunto", id: c.id },
    elemento("h4", {}, c.titulo),
    elemento("p", {}, c.descripcion),
    elemento(
      "p",
      { class: "conjunto-url" },
      enlace ? elemento("a", { href: enlace }, elemento("code", {}, c.archivo)) : elemento("code", {}, c.archivo),
    ),
    elemento(
      "dl",
      { class: "conjunto-ficha" },
      elemento("dt", {}, "Formato"),
      elemento("dd", {}, c.formato),
      elemento("dt", {}, "Se actualiza"),
      elemento("dd", {}, c.frecuencia),
      elemento("dt", {}, "Fuente"),
      elemento("dd", {}, c.fuente),
      elemento("dt", {}, "Licencia"),
      elemento("dd", {}, c.licencia),
    ),
    campos.length
      ? elemento(
          "details",
          { class: "conjunto-campos" },
          elemento("summary", {}, `Campos principales (${campos.length})`),
          elemento("dl", {}, ...campos.flatMap(([nombre, texto]) => [elemento("dt", {}, elemento("code", {}, nombre)), elemento("dd", {}, texto)])),
        )
      : null,
    elemento("p", { class: "detalle" }, actualizado(c, estado)),
  );
}

async function iniciar() {
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
    $("datos-lista").replaceChildren(
      ...[...porTema].map(([tema, conjuntos]) =>
        elemento("section", { class: "tema" }, elemento("h3", {}, TEMAS[tema] ?? tema), ...conjuntos.map((c) => pintarConjunto(c, estado))),
      ),
    );
    $("datos-cargando").remove();
  } catch {
    $("datos-cargando").textContent = "No se pudo cargar el catálogo. Está en ";
    $("datos-cargando").append(elemento("a", { href: "../datos/indice.json" }, "indice.json"), ".");
  }
}

iniciar();
