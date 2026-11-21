// Conecta la página con los datos de Morlaco y el mapa (mapa.js, con MapLibre).

import {
  describirRecoleccion,
  distanciaMetros,
  direccionLegible,
  horaLegible,
  nombreParada,
  CORREO_AVISOS,
  cercanosPorTipo,
  avisosAguaPorConfirmar,
  cortesAgua,
  enlaceCorreoAviso,
  enlaceReporteDireccion,
  enlaceWhatsApp,
  enlacesCalendario,
  enlacesCalendarioAgua,
  estadoLuz,
  faltaRecoleccion,
  franjasDeHoy,
  filtrarCortes,
  distanciaParada,
  formatoDistancia,
  minutosAPie,
  telefono,
  hashDesdePunto,
  horaCuenca,
  horaDentroDe,
  filtrarFarmacias,
  masCercano,
  turnoActual,
  nombreDia,
  paradasCercanas,
  proximaRecoleccion,
  proximoFeriado,
  puntoDesdeHash,
  recoleccionDeHoy,
  revisarUbicacion,
  zonaDe,
} from "./logica.js";
import {
  buscarCalles,
  cruceDeCalles,
  esquinaCercana,
  interpretarBusqueda,
  longitudMetros,
  prepararIndice,
  puntoMedio,
  sugerirCalles,
  ubicarEsquina,
} from "./calles.js";
import {
  avisosDeLinea,
  describirDestinos,
  describirFrecuencia,
  dolares,
  estacionCercana,
  frecuenciaTranvia,
  horarioTranvia,
  lineasPorCalle,
  lineasCercanas,
  pasajeDeOpcion,
  trazadosTranvia,
} from "./buses.js";
import { alarguesUnidos, paradasDeRecorrido, planificar, prepararLineas } from "./rutas.js";
import { proximosDeLinea } from "./vehiculos.js";
import { SVG_BICI, crearMapa } from "./mapa.js";
import { minutosAlProximo } from "./vehiculos.js";
import { PAGINA_AIRE, URL_AIRE, URL_CLIMA, URL_UV, aireCercano, leerAire, leerClima, leerUv } from "./aire.js";
import {
  LUGARES,
  cambiarLugar,
  leerDestino,
  leerLugar,
  leerLugares,
  lugarDe,
  lugarPorNombre,
  sugerirLugares,
  textoDeDestino,
  textoDeLugar,
} from "./lugares.js";
import { etiquetaIdioma, idioma, idiomaInicial, listar, t, usarIdioma } from "./textos.js";

const DATOS = "../datos/";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
// Con más margen que esto, la ubicación del navegador se usa pero se avisa de que es aproximada.
const PRECISION_EXACTA_M = 150;
// Rectángulo de la ciudad para que la búsqueda no devuelva otra Cuenca.
const CAJA_CUENCA = "-79.10,-2.82,-78.92,-2.98";
const CLAVE_ULTIMO_PUNTO = "morlaco:ultimo-punto";
const CLAVE_LUGARES = "morlaco:lugares";
const CLAVE_IDIOMA = "morlaco:idioma";
const CLAVE_DESTINO = "morlaco:destino";
const SIN_MOVIMIENTO = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = (id) => document.getElementById(id);
// El idioma se decide antes de pintar nada: lo guardado, o el del navegador.
usarIdioma(idiomaInicial(leer(CLAVE_IDIOMA), navigator.languages ?? [navigator.language]));

const fechaLarga = () => new Intl.DateTimeFormat(etiquetaIdioma(), { dateStyle: "long", timeZone: "UTC" });
/** "2026-10-17" -> "sábado 17 de octubre". */
const fechaDia = (iso) => {
  const texto = new Intl.DateTimeFormat(etiquetaIdioma(), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );
  // En español se escribe "miércoles 28 de octubre", sin la coma que pone Intl.
  return idioma() === "es" ? texto.replace(",", "") : texto;
};

/** Pone los textos del HTML en el idioma actual (atributos data-t*). */
function aplicarTextos() {
  document.documentElement.lang = etiquetaIdioma();
  document.title = t("titulo");
  for (const nodo of document.querySelectorAll("[data-t]")) nodo.textContent = t(nodo.dataset.t);
  for (const nodo of document.querySelectorAll("[data-t-html]")) nodo.innerHTML = t(nodo.dataset.tHtml);
  for (const nodo of document.querySelectorAll("[data-t-placeholder]")) {
    nodo.placeholder = t(nodo.dataset.tPlaceholder);
  }
  for (const nodo of document.querySelectorAll("[data-t-aria-label]")) {
    nodo.setAttribute("aria-label", t(nodo.dataset.tAriaLabel));
  }
}

function mensaje(texto, esError = false) {
  const p = $("mensaje");
  p.textContent = texto;
  p.classList.toggle("error", esError);
}

function elemento(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (clave === "class") nodo.className = valor;
    else nodo.setAttribute(clave, valor);
  }
  nodo.append(...hijos.filter((h) => h !== null && h !== undefined));
  return nodo;
}

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

function borrar(clave) {
  try {
    localStorage.removeItem(clave);
  } catch {
    // Igual que al guardar.
  }
}

async function cargarJson(ruta) {
  const respuesta = await fetch(DATOS + ruta);
  if (!respuesta.ok) throw new Error(`${ruta}: ${respuesta.status}`);
  return respuesta.json();
}

/**
 * El botón para llamar: un teléfono dibujado y el número siempre con el mismo formato
 * ("07 283 6686"); al tocarlo, el celular marca. Sin número que sirva, no hay botón.
 */
function botonLlamar(crudo, quien) {
  const numero = telefono(crudo);
  const digitos = String(crudo ?? "").replace(/\D/g, "");
  if (!numero && digitos.length < 7) return null;
  const texto = numero?.texto ?? String(crudo);
  const etiqueta = t("llamarA", { quien, telefono: texto });
  return elemento(
    "a",
    { class: "llamar", href: `tel:${numero?.marcar ?? digitos}`, "aria-label": etiqueta, title: etiqueta },
    icono("#i-telefono"),
    texto,
  );
}

function pintarBici(estacion) {
  const caja = $("bici");
  if (!estacion) {
    caja.textContent = t("bicicletaNinguna");
    return;
  }
  const detalle = [
    formatoDistancia(estacion.metros),
    estacion.capacidad ? t("bicicletaAnclajes", { n: estacion.capacidad }) : null,
  ]
    .filter(Boolean)
    .join(", ");
  caja.replaceChildren(
    elemento("span", { class: "marca-capa bici", "aria-hidden": "true" }),
    elemento("span", {}, elemento("strong", {}, estacion.nombre), elemento("span", { class: "frecuencia" }, detalle)),
  );
  caja.firstChild.innerHTML = SVG_BICI;
}

// ---------- Respuesta ----------

// La zona cuya recolección se está contando (null fuera de las zonas urbanas).
let zonaConFalta = null;
// Todas las zonas, para dibujar el recorrido del día.
let zonasDeCuenca = null;

/**
 * El día del recolector, dibujado: una fila por cada zona que tiene recolección hoy, con su
 * franja sobre una regla de 06:00 a medianoche y una raya en la hora actual. La que ya pasó va
 * tenue; la que está pasando, llena. `miZona` la resalta con "tu zona".
 * Devuelve null si hoy no hay recolección (domingo).
 */
function lineaDelDia(zonas, { miZona = null } = {}) {
  const franjas = franjasDeHoy(zonas);
  if (!franjas.length) return null;
  const INICIO = 6 * 60;
  const FIN = 24 * 60;
  const x = (minutos) => `${(Math.min(Math.max(minutos, INICIO), FIN) - INICIO) / (FIN - INICIO) * 100}%`;
  const { minutos: ahora } = horaCuenca();
  const hora = `${String(Math.floor(ahora / 60)).padStart(2, "0")}:${String(ahora % 60).padStart(2, "0")}`;
  const filas = franjas.map((f) => {
    const mia = miZona !== null && String(f.zona) === String(miZona);
    const franja = elemento("span", { class: `dia-franja ${f.estado} ${f.lmv ? "lmv" : "mjs"}` });
    franja.style.left = x(f.inicio);
    franja.style.width = `${(f.fin - f.inicio) / (FIN - INICIO) * 100}%`;
    return elemento(
      "div",
      { class: `dia-fila${mia ? " mia" : ""}` },
      elemento(
        "span",
        { class: "dia-zona" },
        elemento("strong", {}, t("cartelZona", { zona: f.zona }), mia ? elemento("em", {}, t("tuZona")) : null),
        // En el dibujo, "24:00" y no "medianoche": cabe en la columna y coincide con la regla.
        elemento("span", {}, t("franjaHoras", { desde: f.desde, hasta: f.hasta })),
      ),
      elemento("span", { class: "dia-pista" }, franja),
    );
  });
  const regla = elemento(
    "div",
    { class: "dia-regla", "aria-hidden": "true" },
    elemento("span", {}),
    elemento("span", { class: "dia-horas" }, ...[6, 9, 12, 15, 18, 21, 24].map((h) => {
      const marca = elemento("span", {}, String(h));
      marca.style.left = x(h * 60);
      return marca;
    })),
  );
  const caja = elemento("div", { class: "dia", role: "img", "aria-label": t("recorridoAria") }, ...filas, regla);
  // Antes de las 06:00 no hay raya: el día del recolector todavía no empieza.
  if (ahora >= INICIO) {
    caja.style.setProperty("--ahora", x(ahora));
    caja.classList.add("con-ahora");
    regla.querySelector(".dia-horas").append(
      (() => {
        const marca = elemento("b", { class: "dia-ahora" }, `${t("ahora")} ${hora}`);
        marca.style.setProperty("--x", x(ahora));
        return marca;
      })(),
    );
  }
  return caja;
}

/** Pone (o quita) el recorrido del día en una caja, con su título. */
function pintarRecorrido(caja, opciones) {
  const dibujo = zonasDeCuenca ? lineaDelDia(zonasDeCuenca, opciones) : null;
  if (!dibujo) {
    caja.replaceChildren();
    return;
  }
  caja.replaceChildren(elemento("h3", { class: "subtitulo" }, t("recolectorHoy")), dibujo);
}

/**
 * Cuánto falta para que empiece o termine la recolección de hoy, en la pestaña Basura y en el
 * resumen. Se repasa cada medio minuto: cuando el recolector empieza o termina, cambia también
 * el titular ("Hoy, de 20:00…" pasa a "Pasando ahora…").
 */
function actualizarFalta() {
  const caja = $("basura-falta");
  const proxima = zonaConFalta ? proximaRecoleccion(zonaConFalta) : null;
  const minutos = faltaRecoleccion(proxima);
  // La cuenta regresiva sirve cuando falta poco: con más de tres horas basta la hora del titular.
  const lejos = proxima?.estado === "hoy" && minutos > 180;
  const texto = minutos === null || lejos ? "" : t(proxima.estado === "hoy" ? "faltaEmpieza" : "faltaTermina", { tiempo: tiempoQueFalta(minutos) });
  caja.hidden = !texto;
  caja.textContent = texto;
  // El recorrido del día, con tu zona resaltada (fuera de las zonas urbanas no se dibuja).
  if (zonaConFalta) pintarRecorrido($("basura-recorrido"), { miZona: zonaConFalta.zona });
  else $("basura-recorrido").replaceChildren();
  // Bajo el nombre de la calle, la respuesta a "¿cuándo pasa el recolector?" sin bajar la página.
  const arriba = $("punto-hoy");
  arriba.hidden = !zonaConFalta || !proxima;
  if (!zonaConFalta || !proxima) return;
  const titular = describirRecoleccion(proxima);
  arriba.replaceChildren(
    icono("#i-funda"),
    elemento("span", {}, elemento("strong", {}, titular), texto ? elemento("span", { class: "punto-hoy-falta" }, texto) : null),
  );
  arriba.classList.toggle("ahora", proxima.estado === "ahora");
  const cuando = $("basura-cuando");
  if (cuando.textContent !== titular) cuando.textContent = titular;
  cuando.classList.toggle("ahora", proxima.estado === "ahora");
  const enResumen = $("resumen").querySelector(".ficha.servicio-basura");
  if (!enResumen) return;
  const valor = enResumen.querySelector(".ficha-valor");
  valor.textContent = titular;
  valor.className = proxima.estado === "ahora" ? "ficha-valor pastilla estado-ok" : proxima.estado === "hoy" ? "ficha-valor pastilla estado-atencion" : "ficha-valor";
  enResumen.querySelector(".ficha-detalle").textContent = texto || t("zonaRecoleccion", { zona: zonaConFalta.zona });
}
setInterval(() => !document.hidden && actualizarFalta(), 30_000);

function pintarBasura(zona, rural) {
  const cuando = $("basura-cuando");
  const semana = $("semana");
  const fundas = $("basura-fundas");
  const detalle = $("basura-zona");
  semana.replaceChildren();

  zonaConFalta = zona ? zona.properties : null;
  if (!zona) {
    cuando.textContent = t("fueraZonas");
    cuando.classList.remove("ahora");
    $("basura-falta").hidden = true;
    $("punto-hoy").hidden = true;
    $("basura-recorrido").replaceChildren();
    if (rural) {
      fundas.replaceChildren(
        rural[idioma()] ?? rural.es,
        " ",
        elemento("a", { href: rural.fuente.url, target: "_blank", rel: "noopener" }, rural.fuente.nombre),
        ".",
      );
    } else {
      fundas.textContent = t("fueraZonasDetalle");
    }
    detalle.textContent = "";
    $("calendario").replaceChildren();
    return;
  }

  const p = zona.properties;
  const proxima = proximaRecoleccion(p);
  cuando.textContent = describirRecoleccion(proxima);
  cuando.classList.toggle("ahora", proxima.estado === "ahora");

  const hoy = horaCuenca().diaIso;
  const reciclaje = p.dia_reciclaje ? p.dias_iso[p.dias.indexOf(p.dia_reciclaje)] : null;
  const iniciales = t("iniciales");
  for (let dia = 1; dia <= 7; dia++) {
    const toca = p.dias_iso.includes(dia);
    const clases = ["azulejo", toca && "toca", dia === reciclaje && "reciclaje", dia === hoy && "hoy"];
    const descripcion = [
      nombreDia(dia),
      dia === hoy ? t("hoy") : null,
      toca ? (dia === reciclaje ? t("diaConCeleste") : t("diaRecoleccion")) : t("diaSinRecoleccion"),
    ]
      .filter(Boolean)
      .join(", ");
    semana.append(
      elemento(
        "li",
        { class: clases.filter(Boolean).join(" ") },
        elemento("span", { "aria-hidden": "true" }, iniciales[dia - 1]),
        elemento("span", { class: "oculto-accesible" }, descripcion),
      ),
    );
  }

  // Qué va en cada funda y si la celeste sale en la próxima recolección (la de arriba).
  const linea = (color, nombre, ...texto) =>
    elemento(
      "span",
      { class: "funda-linea" },
      elemento("i", { class: `funda ${color}`, "aria-hidden": "true" }),
      elemento("strong", {}, t(nombre)),
      " ",
      ...texto,
    );
  const lineas = [linea("negra", "fundaNegra", t("fundaNegraQue"))];
  if (reciclaje) {
    const cuando = proxima.conReciclaje
      ? t("fundaCelesteVa")
      : t("fundaCelesteGuarda", { dia: nombreDia(reciclaje) });
    // "Esta vez sí / esta vez no" solo vale hoy: en la hoja impresa va el día.
    lineas.push(
      linea(
        "celeste",
        "fundaCeleste",
        t("fundaCelesteQue"),
        " ",
        elemento("strong", { class: "solo-pantalla" }, cuando),
        elemento("strong", { class: "solo-impresion-linea" }, t("fundaCelesteDia", { dia: nombreDia(reciclaje) })),
      ),
    );
  }
  fundas.replaceChildren(...lineas);
  $("basura-dias").textContent = t("basuraDias", {
    zona: p.zona,
    dias: listar(p.dias_iso.map(nombreDia)),
    desde: p.desde,
    hasta: horaLegible(p.hasta),
  });
  detalle.textContent = t("zonaDetalle", { zona: p.zona });
  pintarCalendario(p.zona);
}


/** "Cerca de ti": la WiFi gratis, el mercado, el punto de pilas y la Guardia Ciudadana más cercanos. */
function pintarCerca(punto, coleccion) {
  const lista = $("cerca-lista");
  const nota = $("cerca-nota");
  if (!coleccion) {
    lista.replaceChildren(elemento("li", { class: "sin-lineas" }, t("cercaError")));
    nota.textContent = "";
    return;
  }
  const cercanos = cercanosPorTipo(punto, coleccion);
  if (!cercanos.length) {
    lista.replaceChildren(elemento("li", { class: "sin-lineas" }, t("cercaNinguno")));
    nota.textContent = t("cercaNota");
    return;
  }
  lista.replaceChildren(
    ...cercanos.map((c) => {
      const horario = c.horario?.[idioma()] ?? c.horario?.es;
      return elemento(
        "li",
        {},
        elemento(
          "span",
          { class: "cerca-texto" },
          elemento("span", { class: "cerca-tipo" }, t("cercaTipos")[c.tipo]),
          elemento("strong", {}, c.nombre),
          c.direccion && c.direccion !== c.nombre ? elemento("span", { class: "frecuencia" }, c.direccion) : null,
          horario ? elemento("span", { class: "frecuencia" }, horario) : null,
          c.red ? elemento("span", { class: "frecuencia" }, t("cercaRed", { red: c.red })) : null,
        ),
        elemento(
          "span",
          { class: "cerca-acciones" },
          elemento("span", { class: "metros" }, formatoDistancia(c.metros)),
          // A quién se llama: la Guardia por su nombre de servicio; lo demás, por su nombre.
          botonLlamar(c.telefono, c.tipo === "guardia" ? `${t("cercaTipos").guardia} (${c.nombre})` : c.nombre),
        ),
      );
    }),
  );
  // De cuándo es cada archivo del municipio, para que se vea si un dato es viejo.
  const mes = new Intl.DateTimeFormat(etiquetaIdioma(), { month: "long", year: "numeric", timeZone: "UTC" });
  const fechas = Object.entries(coleccion.metadata?.fuentes ?? {})
    .filter(([, f]) => f.fecha)
    .map(([clave, f]) => t("cercaFecha", { que: t("cercaFuentes")[clave] ?? clave, fecha: mes.format(new Date(`${f.fecha}T12:00:00Z`)) }));
  nota.textContent = [t("cercaNota"), fechas.length ? t("cercaFechas", { lista: listar(fechas) }) : null].filter(Boolean).join(" ");
}

/** Cuándo es el corte de un aviso por confirmar, con lo que se haya podido leer de la nota. */
function cuandoAviso(aviso) {
  if (aviso.fecha && aviso.desde && aviso.hasta) return t("aguaHorario", { dia: fechaDia(aviso.fecha), desde: aviso.desde, hasta: horaLegible(aviso.hasta) });
  if (aviso.fecha) return fechaDia(aviso.fecha);
  return t("aguaPublicado", { dia: fechaDia(aviso.publicado) });
}

/** Los avisos que citan a ETAPA y nadie ha revisado: se muestran, pero diciendo que falta confirmarlos. */
function bloquePorConfirmar(posibles) {
  return [
    elemento("p", { class: "luz-resumen" }, t("aguaPosibleTitulo", { n: posibles.length })),
    elemento(
      "ul",
      { class: "cortes" },
      ...posibles.map((a) =>
        elemento(
          "li",
          {},
          elemento("span", { class: "horario" }, cuandoAviso(a)),
          a.titulo,
          a.resumen ? elemento("span", { class: "frecuencia" }, a.resumen) : null,
          elemento("span", { class: "frecuencia" }, elemento("a", { href: a.enlace, target: "_blank", rel: "noopener" }, t("aguaLeerNota"))),
        ),
      ),
    ),
    elemento("p", { class: "aviso" }, t("aguaPosibleNota")),
  ];
}

/**
 * Los cortes de agua confirmados de hoy y de los próximos días, con su fuente, y debajo los
 * avisos de la prensa que aún nadie revisó. Devuelve los confirmados.
 */
function pintarAgua(datos, posibles = []) {
  const caja = $("agua-estado");
  const enlaceEtapa = () => elemento("a", { href: "https://www.etapa.net.ec/", target: "_blank", rel: "noopener" }, "ETAPA EP");
  if (!datos) {
    caja.replaceChildren(elemento("p", { class: "aviso" }, t("aguaError"), " ", enlaceEtapa(), "."));
    return [];
  }
  const cortes = cortesAgua(datos);
  if (!cortes.length && posibles.length) {
    caja.replaceChildren(...bloquePorConfirmar(posibles), elemento("p", { class: "detalle" }, t("aguaSinCortesNota")));
    return [];
  }
  if (!cortes.length) {
    caja.replaceChildren(
      elemento("p", { class: "luz-resumen" }, t("aguaSinCortes")),
      elemento("p", { class: "detalle" }, t("aguaSinCortesNota")),
    );
    return [];
  }
  caja.replaceChildren(
    elemento("p", { class: "luz-resumen" }, t("aguaResumen", { n: cortes.length })),
    elemento(
      "ul",
      { class: "cortes" },
      ...cortes.map((c) => {
        const texto = c[idioma()] ?? c.es;
        return elemento(
          "li",
          {},
          elemento(
            "span",
            { class: "horario" },
            t("aguaHorario", { dia: fechaDia(c.fecha), desde: c.desde, hasta: horaLegible(c.hasta) }),
          ),
          texto.sectores,
          texto.motivo ? elemento("span", { class: "frecuencia" }, texto.motivo) : null,
          elemento(
            "span",
            { class: "frecuencia" },
            t("fuente"),
            ": ",
            elemento("a", { href: c.fuente.url, target: "_blank", rel: "noopener" }, c.fuente.nombre),
          ),
        );
      }),
    ),
    elemento("p", { class: "detalle" }, t("aguaNota")),
    ...(posibles.length ? bloquePorConfirmar(posibles) : []),
  );
  return cortes;
}

/**
 * El próximo día de descanso (datos/manual/feriados.json), qué pasa con la recolección en
 * feriados y dónde llevar lo que no va en las fundas (datos/manual/basura.json).
 */
function pintarBasuraManual(basura, diasFeriado) {
  const feriados = basura?.feriados;
  const hoy = horaCuenca().fecha;
  const vigente = feriados && feriados.desde <= hoy && hoy <= feriados.hasta;
  const proximo = proximoFeriado(diasFeriado);
  const aviso = $("basura-feriados");
  aviso.hidden = !vigente && !proximo;
  aviso.replaceChildren();
  if (proximo) {
    const nombre = proximo.dia[idioma()] ?? proximo.dia.es;
    const fecha =
      proximo.hasta === proximo.dia.fecha
        ? fechaDia(proximo.dia.fecha)
        : t("feriadoVariosDias", { desde: fechaDia(proximo.dia.fecha), hasta: fechaDia(proximo.hasta) });
    const clave = proximo.faltan === 0 ? "feriadoHoy" : proximo.faltan === 1 ? "feriadoManana" : "feriadoProximo";
    // Lo que importa va primero y en negrita: que el recolector pasa igual (la regla de EMAC).
    const regla = vigente ? (feriados[idioma()] ?? feriados.es) : "";
    const corte = regla.indexOf(". ");
    const [primera, resto] = corte > 0 ? [regla.slice(0, corte + 1), regla.slice(corte + 2)] : [regla, ""];
    if (primera) aviso.append(elemento("strong", {}, primera), " ");
    aviso.append(t(clave, { fecha, nombre }), resto ? ` ${resto}` : "");
  } else if (vigente) {
    aviso.append(feriados[idioma()] ?? feriados.es);
  }

  const destinos = basura?.donde_llevar ?? [];
  const caja = $("donde-llevar");
  caja.hidden = !destinos.length;
  if (!destinos.length) return;
  caja.querySelector("dl").replaceChildren(
    ...destinos.flatMap((d) => {
      const texto = d[idioma()] ?? d.es;
      return [
        elemento("dt", {}, texto.que),
        elemento("dd", {}, texto.donde, " ", elemento("a", { href: d.fuente.url, target: "_blank", rel: "noopener" }, d.fuente.nombre), "."),
      ];
    }),
  );
  const fecha = fechaLarga().format(new Date(`${basura.metadata.revisado}T12:00:00Z`));
  caja.querySelector("p").textContent = t("dondeLlevarNota", { fecha, linea: basura.contacto.linea, telefono: basura.contacto.telefono });
}

/** Botones para suscribirse al calendario de recolección de la zona. */
function pintarCalendario(zona) {
  const enlaces = enlacesCalendario(zona, location.href);
  const externo = { target: "_blank", rel: "noopener" };
  $("calendario").replaceChildren(
    elemento("p", { class: "calendario-titulo" }, t("calendarioTitulo")),
    elemento(
      "div",
      { class: "calendario-botones" },
      elemento("a", { class: "boton-claro", href: enlaces.google, ...externo }, "Google Calendar"),
      elemento("a", { class: "boton-claro", href: enlaces.webcal }, t("calendarioApple")),
      elemento("a", { class: "enlace-claro", href: enlaces.archivo, download: `basura-zona-${zona}.ics` }, t("calendarioDescargar")),
    ),
    elemento("p", { class: "detalle" }, t("calendarioNota")),
  );
}

/** Botones para suscribirse al calendario de cortes de agua: el aviso llega sin abrir la página. */
function pintarCalendarioAgua() {
  const enlaces = enlacesCalendarioAgua(location.href);
  const externo = { target: "_blank", rel: "noopener" };
  $("agua-calendario").replaceChildren(
    elemento("p", { class: "calendario-titulo" }, t("aguaCalendarioTitulo")),
    elemento(
      "div",
      { class: "calendario-botones" },
      elemento("a", { class: "boton-claro", href: enlaces.google, ...externo }, "Google Calendar"),
      elemento("a", { class: "boton-claro", href: enlaces.webcal }, t("calendarioApple")),
      elemento("a", { class: "enlace-claro", href: enlaces.archivo, download: "cortes-de-agua-cuenca.ics" }, t("calendarioDescargar")),
    ),
    elemento("p", { class: "detalle" }, t("aguaCalendarioNota")),
  );
}

function pintarLuz(suspensiones) {
  const caja = $("luz-estado");
  if (!suspensiones) {
    caja.replaceChildren(
      elemento("p", { class: "aviso" }, t("luzError")),
    );
    return;
  }
  const estado = estadoLuz(suspensiones);
  const fuente = elemento(
    "a",
    { href: "https://www.centrosur.gob.ec/suspensiones-programadas/" },
    t("luzFuente"),
  );

  if (estado.cronograma) {
    // Centro Sur anunció cortes que mencionan Cuenca en un cartel (PDF sin tabla).
    caja.replaceChildren(
      elemento(
        "p",
        { class: "aviso" },
        elemento("strong", {}, t("luzCronograma", { fecha: fechaDia(estado.cronograma.fecha) })),
        " ",
        elemento("a", { href: estado.cronograma.pdf }, t("luzVerCronograma")),
        ".",
      ),
    );
    return;
  }

  if (!estado.publicadoHoy) {
    const programacion = elemento(
      "a",
      { href: estado.programacion ?? "https://www.centrosur.gob.ec/intermedia-programacion/" },
      t("luzPaginaProgramacion"),
    );
    const otra = estado.otraReciente;
    const partes =
      estado.diasSinPublicar !== null && estado.diasSinPublicar > 2
        ? [
            elemento("strong", {}, t("luzSinPublicarCuenca", { fecha: fechaLarga().format(new Date(estado.ultima)) })),
            otra?.provincias?.length
              ? t("luzOtraZona", { fecha: fechaDia(otra.fecha), zonas: listar(otra.provincias) })
              : "",
            t("luzRevisa"),
            programacion,
            t("luzRevisaFin"),
          ]
        : [t("luzNoHayHoy"), fuente, "."];
    caja.replaceChildren(elemento("p", { class: "aviso" }, ...partes));
    return;
  }

  const cortes = estado.cortesHoy;
  const lista = elemento("ul", { class: "cortes" });
  const pintarLista = (texto) => {
    const visibles = filtrarCortes(cortes, texto);
    lista.replaceChildren(
      ...(visibles.length
        ? visibles.map((c) =>
            elemento(
              "li",
              {},
              elemento("span", { class: "horario" }, t("corteHorario", { desde: c.desde, hasta: horaLegible(c.hasta) })),
              direccionLegible(c.direccion),
            ),
          )
        : [elemento("li", {}, t("cortesNinguno"))]),
    );
  };
  const filtro = elemento("input", {
    type: "search",
    id: "filtro-cortes",
    name: "filtro-cortes",
    autocomplete: "off",
    placeholder: t("filtroCortes"),
    "aria-label": t("filtroCortesAria"),
  });
  filtro.addEventListener("input", () => pintarLista(filtro.value));
  pintarLista("");
  caja.replaceChildren(
    elemento("p", { class: "luz-resumen" }, t("luzResumen", { n: cortes.length })),
    elemento("p", { class: "detalle" }, t("luzSinCoordenadas")),
    elemento("div", { class: "filtro-cortes" }, filtro),
    lista,
  );
}

/**
 * Farmacias de turno de esta semana. Si el índice de calles ya está cargado (o se carga),
 * las que tienen dirección de esquina se ordenan por cercanía aproximada al punto.
 */
function pintarFarmacias(datos, punto, alUbicar = () => {}, alMapa = () => {}, verEnMapa = null) {
  const caja = $("farmacias-estado");
  if (!datos) {
    caja.replaceChildren(elemento("p", { class: "aviso" }, t("farmaciasError")));
    return;
  }
  const pdf = datos.metadata?.pdfs?.at(-1) ?? datos.metadata?.pagina;
  const enlacePdf = elemento("a", { href: pdf, target: "_blank", rel: "noopener" }, t("farmaciasPdf"));
  const turno = turnoActual(datos.turnos);
  if (!turno) {
    caja.replaceChildren(elemento("p", { class: "aviso" }, t("farmaciasSinTurno"), enlacePdf, "."));
    return;
  }

  let lista = turno.farmacias.map((f) => ({ ...f, metros: null }));
  const contenedor = elemento("ul", { class: "farmacias-lista" });
  const orden = elemento("p", { class: "detalle", hidden: "" }, t("farmaciasOrden"));
  const filtro = elemento("input", {
    type: "search",
    name: "filtro-farmacias",
    autocomplete: "off",
    placeholder: t("farmaciasFiltro"),
    "aria-label": t("farmaciasFiltroAria"),
  });

  // Lleva el mapa a la farmacia (en el celular, baja hasta el mapa).
  const botonVerEnMapa = (f) => {
    const boton = elemento("button", { type: "button", class: "secundario ver-en-mapa" }, t("verEnMapa"));
    boton.addEventListener("click", () => {
      verEnMapa({ nombre: f.nombre, lat: f.lugar.lat, lon: f.lugar.lon });
      verMapaEnCelular();
    });
    return boton;
  };

  const pintarLista = () => {
    const visibles = filtrarFarmacias(lista, filtro.value);
    if (!visibles.length) {
      contenedor.replaceChildren(elemento("li", { class: "sin-lineas" }, t("farmaciasNinguna")));
      return;
    }
    const filas = visibles.map((f) =>
      elemento(
        "li",
        {},
        elemento(
          "div",
          { class: "farmacia-texto" },
          elemento("strong", {}, f.nombre),
          elemento("span", {}, f.direccion),
          f.metros !== null
            ? elemento("span", { class: "frecuencia" }, t("aproximado", { distancia: formatoDistancia(f.metros) }))
            : null,
          f.lugar
            ? elemento(
                "span",
                { class: "farmacia-enlaces" },
                verEnMapa ? botonVerEnMapa(f) : null,
                // Indicaciones en Google Maps hasta la esquina de la farmacia (solo al tocar).
                elemento(
                  "a",
                  { href: `https://www.google.com/maps/dir/?api=1&destination=${f.lugar.lat},${f.lugar.lon}`, target: "_blank", rel: "noopener" },
                  t("comoLlegar"),
                ),
              )
            : null,
        ),
        botonLlamar(f.tel ?? f.telefono, f.nombre),
      ),
    );
    // Las que no se pudieron ubicar van al final, separadas: su orden no es por cercanía.
    const primeraSinLugar = visibles.findIndex((f) => !f.lugar);
    if (primeraSinLugar > 0) {
      filas.splice(primeraSinLugar, 0, elemento("li", { class: "farmacias-sin-lugar" }, t("farmaciasSinLugar")));
    }
    contenedor.replaceChildren(...filas);
    // Las más cercanas primero; el resto, a un toque (salvo al filtrar).
    const VISIBLES = 6;
    const ocultas = filtro.value ? [] : filas.slice(VISIBLES);
    if (ocultas.length) {
      for (const li of ocultas) li.hidden = true;
      const ver = elemento("button", { type: "button", class: "secundario ver-mas" }, t("verMasFarmacias", { n: ocultas.length }));
      ver.addEventListener("click", () => {
        for (const li of ocultas) li.hidden = false;
        ver.parentElement.remove();
      });
      contenedor.append(elemento("li", { class: "ver-mas-fila" }, ver));
    }
  };
  filtro.addEventListener("input", pintarLista);
  pintarLista();

  const fin = new Date(`${turno.fin}T12:00:00Z`);
  const fecha = new Intl.DateTimeFormat(etiquetaIdioma(), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(fin);
  caja.replaceChildren(
    elemento("p", { class: "luz-resumen" }, t("farmaciasResumen", { n: turno.farmacias.length, fecha })),
    elemento("p", { class: "aviso" }, t("farmaciasAviso"), " ", t("farmaciasFuente"), enlacePdf, "."),
    elemento("div", { class: "filtro-cortes" }, filtro),
    orden,
    contenedor,
  );

  // Orden por cercanía: necesita el índice de calles (se descarga una vez y queda guardado).
  if (punto) {
    cargarIndiceCalles()
      .then((indice) => {
        lista = lista
          .map((f) => {
            const lugar = ubicarEsquina(f.direccion, indice);
            return { ...f, lugar, metros: lugar ? Math.round(distanciaMetros(punto, lugar)) : null };
          })
          .sort((a, b) => (a.metros ?? Infinity) - (b.metros ?? Infinity));
        if (lista.some((f) => f.metros !== null)) orden.hidden = false;
        pintarLista();
        if (lista[0]?.metros !== null && lista[0]?.metros !== undefined) alUbicar(lista[0]);
        // Las tres más cercanas, también en el mapa (si su esquina está a menos de 3 km).
        alMapa(
          lista
            .filter((f) => f.lugar && f.metros <= 3000)
            .slice(0, 3)
            .map((f) => ({ nombre: f.nombre, lat: f.lugar.lat, lon: f.lugar.lon })),
        );
      })
      .catch(() => {
        // Sin índice de calles, la lista queda en el orden de ARCSA.
      });
  }
}

function pintarParadas(cercanas) {
  const lista = $("paradas");
  if (!cercanas.length) {
    lista.replaceChildren(
      elemento("li", { class: "sin-numero" }, t("paradasNinguna")),
    );
  } else {
    lista.replaceChildren(
      ...cercanas.map((p) =>
        elemento(
          "li",
          {},
          elemento("span", {}, nombreParada(p)),
          elemento("span", { class: "metros" }, formatoDistancia(p.metros)),
        ),
      ),
    );
  }
}

let recorridosOficiales = null;
let datosTranvia = null; // el tranvía en datos/manual/transporte.json: frecuencia y horario
let estacionesDelTranvia = null; // datos/buses/tranvia.geojson, con el orden de cada sentido
let paradasRegistradas = null; // datos/buses/paradas.geojson, para dibujar las de cada línea

/**
 * Bajo la fila de una línea: cuántas de sus paradas se ven en el mapa y, plegada, la lista
 * de lugares por los que pasa según el recorrido oficial (larga: más de 60 en algunas).
 */
async function pintarPasaPor(nodo, linea) {
  const principales = linea.trazados.filter((f) => f.properties.tipo !== "alargue");
  const nombres = new Set(principales.flatMap((f) => paradasDeRecorrido(f, paradasRegistradas).map((p) => p.id)));
  const partes = nombres.size ? [elemento("p", {}, t("paradasEnMapa", { n: nombres.size }))] : [];
  nodo.replaceChildren(...partes);
  nodo.hidden = !partes.length;
  try {
    recorridosOficiales ??= cargarJson("buses/recorridos.json");
    const { recorridos } = await recorridosOficiales;
    const puntos = recorridos.find((r) => r.linea === linea.linea)?.pasa_por?.ida;
    if (!puntos?.length) return;
    nodo.append(
      elemento(
        "details",
        {},
        elemento("summary", {}, t("pasaPorVer", { n: puntos.length })),
        elemento("p", {}, `${puntos.join(", ")}.`),
      ),
    );
    nodo.hidden = false;
  } catch {
    recorridosOficiales = null; // sin conexión: se intenta de nuevo al tocar otra línea
  }
}

/** En el celular el mapa queda abajo: al elegir una ruta o una línea, se baja a verlo. */
/**
 * En el celular el mapa va arriba, justo debajo de tu calle (antes de "Hoy en tu calle"),
 * y no al final de una página larga. En pantallas anchas vuelve a su columna, a la derecha.
 */
function colocarMapa() {
  const mapa = document.querySelector(".mapa-contenedor");
  const muro = document.querySelector(".muro");
  const principal = document.querySelector(".disposicion");
  if (!mapa || !muro || !principal) return;
  const angosto = window.matchMedia("(max-width: 899px)");
  const ubicar = () => {
    if (angosto.matches) muro.after(mapa);
    else principal.append(mapa);
  };
  ubicar();
  angosto.addEventListener("change", ubicar);
}

function verMapaEnCelular() {
  if (!window.matchMedia("(max-width: 899px)").matches) return;
  document.querySelector(".mapa-contenedor")?.scrollIntoView({ behavior: SIN_MOVIMIENTO ? "auto" : "smooth", block: "start" });
}

/**
 * Entre qué puntas va una línea. Las del tranvía son sus estaciones finales (el archivo del
 * municipio llama "Control Sur" a la de Río Tarqui).
 */
function destinosDe(linea) {
  const trazos = linea.tipo === "tranvia" ? trazadosTranvia(estacionesDelTranvia) : null;
  return trazos ? trazos.map((f) => f.properties.hacia) : linea.destinos;
}

/** Tocar una línea la dibuja en el mapa y muestra por dónde pasa; tocarla otra vez lo quita. */
function alTocarLinea(boton, botones, linea, mapa) {
  const activa = boton.getAttribute("aria-pressed") === "true";
  for (const b of botones) {
    b.setAttribute("aria-pressed", "false");
    b.nextElementSibling.hidden = true;
  }
  if (activa) {
    mapa.resaltarLinea(null);
    return;
  }
  boton.setAttribute("aria-pressed", "true");
  // El tranvía se dibuja uniendo sus estaciones en orden (el trazado del municipio está
  // incompleto) y no está en el horario de los buses: el suyo sale de su frecuencia y de sus
  // horas de servicio, igual para los dos sentidos. Sin ese recorrido no se estima nada.
  const trazosTranvia = linea.tipo === "tranvia" ? trazadosTranvia(estacionesDelTranvia) : null;
  const delTranvia = trazosTranvia ? horarioTranvia(datosTranvia) : null;
  mapa.resaltarLinea(trazosTranvia ?? alarguesUnidos(linea.trazados), {
    linea: linea.linea,
    horarios: delTranvia ? { ida: delTranvia, retorno: delTranvia } : linea.horarios,
    velocidad: delTranvia ? datosTranvia.velocidad_kmh : undefined,
    tipo: linea.tipo,
    paradas: paradasRegistradas,
  });
  if (linea.tipo === "tranvia") mapa.mostrarCapa("tranvia");
  pintarPasaPor(boton.nextElementSibling, linea);
  verMapaEnCelular();
}

/** Las líneas que recorren una calle, cuando se busca la calle sola. */
function pintarBusesDeCalle(calle, lineas, rutas, mapa) {
  const caja = $("buses-calle");
  if (!calle || !lineas) {
    caja.hidden = true;
    caja.replaceChildren();
    return;
  }
  const encontradas = lineasPorCalle(calle.feature, lineas, rutas);
  const titulo = elemento("h2", {}, t("busesCalleTitulo", { calle: calle.nombre }));
  if (!encontradas.length) {
    caja.replaceChildren(titulo, elemento("p", { class: "detalle" }, t("busesCalleNinguno")));
    caja.hidden = false;
    return;
  }
  const botones = [];
  const lista = elemento(
    "ul",
    { class: "lineas" },
    ...encontradas.map((l) => {
      const esTranvia = l.tipo === "tranvia";
      const boton = elemento(
        "button",
        { type: "button", class: "linea", "aria-pressed": "false" },
        elemento("span", { class: `numero-linea${esTranvia ? " tranvia" : ""}`, "aria-hidden": "true" }, esTranvia ? "T" : l.linea),
        elemento(
          "span",
          { class: "linea-texto" },
          elemento("strong", {}, esTranvia ? t("tranvia") : t("linea", { linea: l.linea }), " ", elemento("span", { class: "destinos" }, describirDestinos(destinosDe(l)))),
          elemento("span", { class: "frecuencia" }, esTranvia ? t("tranviaDetalle") : describirFrecuencia(l.horario)),
          elemento("span", { class: "frecuencia" }, t("busesCalleRecorre", { distancia: formatoDistancia(l.metros) })),
        ),
      );
      boton.addEventListener("click", () => alTocarLinea(boton, botones, l, mapa));
      botones.push(boton);
      return elemento("li", {}, boton, elemento("div", { class: "pasa-por", hidden: "" }));
    }),
  );
  caja.replaceChildren(titulo, lista, elemento("p", { class: "detalle" }, t("busesCalleNota")));
  caja.hidden = false;
}

// "Hacia Ricaurte: en unos 4 min": cuánto falta para el próximo bus de cada sentido. Los
// minutos envejecen, así que la lista los vuelve a calcular cada medio minuto.
let ponerProximos = [];
setInterval(() => !document.hidden && ponerProximos.forEach((poner) => poner()), 30_000);

function cuandoPasa(minutos) {
  if (minutos === null) return t("proximoNoHoy");
  if (minutos < 1.5) return t("proximoYa");
  // Falta más de una hora (de madrugada, por ejemplo): se dice la hora, no los minutos.
  if (minutos > 60) return t("proximoHora", { hora: horaDentroDe(minutos) });
  return t("proximoMin", { minutos: Math.round(minutos) });
}

/** El renglón de los próximos buses de una línea, o null si no hay con qué estimarlos. */
function proximosDe(punto, trazados, horarios, velocidadKmH) {
  if (!punto || !trazados || !horarios) return null;
  const calcular = () => proximosDeLinea(punto, trazados, horarios, { velocidadKmH });
  if (!calcular().length) return null;
  const caja = elemento("span", { class: "proximos" });
  const poner = () =>
    caja.replaceChildren(
      ...calcular().map((p) =>
        elemento("span", { class: "proximo" }, t("sentidoHacia", { destino: p.hacia }), ": ", elemento("strong", {}, cuandoPasa(p.minutos))),
      ),
    );
  poner();
  ponerProximos.push(poner);
  return caja;
}

/** Lista de líneas cercanas; al tocar una se resalta su recorrido en el mapa. */
function pintarLineas(cercanas, mapa, { punto, transporte, estaciones } = {}) {
  const lista = $("lineas");
  const nota = $("lineas-nota");
  if (cercanas === null) {
    lista.replaceChildren(elemento("li", { class: "sin-lineas" }, t("lineasError")));
    nota.textContent = "";
    return;
  }
  if (!cercanas.length) {
    lista.replaceChildren(elemento("li", { class: "sin-lineas" }, t("lineasNinguna")));
    nota.textContent = "";
    return;
  }
  const botones = [];
  ponerProximos = [];
  // El tranvía, con su recorrido por estaciones y su propio horario.
  const trazosTranvia = trazadosTranvia(estaciones);
  const delTranvia = horarioTranvia(transporte?.tranvia);
  lista.replaceChildren(
    ...cercanas.map((l) => {
      const esTranvia = l.tipo === "tranvia";
      let detalle = esTranvia ? t("tranviaDetalle") : describirFrecuencia(l.horario);
      const proximos = esTranvia
        ? proximosDe(punto, trazosTranvia, delTranvia && { ida: delTranvia, retorno: delTranvia }, transporte?.tranvia?.velocidad_kmh)
        : proximosDe(punto, l.trazados, l.horarios);
      // Del tranvía cuenta la estación (donde se sube), no la vía: una sola distancia.
      let metros = l.metros;
      if (esTranvia) {
        const minutos = frecuenciaTranvia(transporte?.tranvia);
        const estacion = punto && estaciones ? estacionCercana(punto, estaciones) : null;
        if (estacion) metros = estacion.metros;
        if (estacion && minutos) {
          detalle = t("tranviaEstacion", { estacion: estacion.nombre, minutos });
        } else if (minutos) {
          detalle = t("tranviaCada", { minutos });
        }
      }
      const avisos = esTranvia ? [] : avisosDeLinea(transporte?.avisos, l.linea);
      const boton = elemento(
        "button",
        { type: "button", class: "linea", "aria-pressed": "false" },
        elemento("span", { class: `numero-linea${esTranvia ? " tranvia" : ""}`, "aria-hidden": "true" }, esTranvia ? "T" : l.linea),
        elemento(
          "span",
          { class: "linea-texto" },
          elemento("strong", {}, esTranvia ? t("tranvia") : t("linea", { linea: l.linea }), " ", elemento("span", { class: "destinos" }, describirDestinos(destinosDe(l)))),
          elemento("span", { class: "frecuencia" }, detalle),
          proximos,
          ...avisos.map((a) =>
            elemento("span", { class: "aviso-linea" }, elemento("strong", {}, t("avisoLinea"), ": "), a[idioma()] ?? a.es),
          ),
        ),
        elemento(
          "span",
          { class: "metros" },
          distanciaParada(metros),
          elemento("span", { class: "minutos-pie" }, t("minutosPie", { n: minutosAPie(metros) })),
        ),
      );
      const pasaPor = elemento("div", { class: "pasa-por", hidden: "" });
      boton.addEventListener("click", () => alTocarLinea(boton, botones, l, mapa));
      botones.push(boton);
      return elemento("li", {}, boton, pasaPor);
    }),
  );
  // Las más cercanas primero; el resto, a un toque.
  const VISIBLES = 6;
  const ocultas = [...lista.children].slice(VISIBLES);
  if (ocultas.length) {
    for (const li of ocultas) li.hidden = true;
    const ver = elemento(
      "button",
      { type: "button", class: "secundario ver-mas" },
      t("verMas", { n: ocultas.length }),
    );
    ver.addEventListener("click", () => {
      for (const li of ocultas) li.hidden = false;
      ver.parentElement.remove();
    });
    lista.append(elemento("li", { class: "ver-mas-fila" }, ver));
  }
  nota.textContent = t("lineasNota");
}

// ---------- Hoy en tu calle ----------

const SVG_NS = "http://www.w3.org/2000/svg";
const ICONO_SERVICIO = { basura: "#i-funda", luz: "#i-rayo", agua: "#i-gota", farmacias: "#i-cruz", buses: "#i-bus", aire: "#i-aire" };

/** Un icono del sprite de la página (#i-...). */
function icono(href) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "icono");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", href);
  svg.append(use);
  return svg;
}

function iconoServicio(servicio) {
  return icono(ICONO_SERVICIO[servicio]);
}

/**
 * Una ficha del resumen; tocarla lleva a su sección. Con `estado` ("ok", "atencion" o
 * "alerta") el valor va en una pastilla de su color; un aviso sin estado es una alerta.
 * Devuelve el nodo del detalle para actualizarlo.
 */
function ficha(servicio, valor, detalle, { aviso = false, estado = null, href = `#s-${servicio}` } = {}) {
  const nodoDetalle = elemento("span", { class: "ficha-detalle" }, detalle ?? "");
  const tono = estado ?? (aviso ? "alerta" : null);
  const clase = `ficha servicio-${servicio}${aviso ? " con-aviso" : ""}`;
  // Sin enlace (en "Hoy en Cuenca" no hay sección a la que ir), la ficha es solo un renglón.
  const enlace = elemento(
    href ? "a" : "div",
    href ? { href, class: clase } : { class: clase },
    elemento("span", { class: "ficha-cabecera" }, iconoServicio(servicio), elemento("span", {}, t(`nav${servicio[0].toUpperCase()}${servicio.slice(1)}`))),
    elemento("strong", { class: tono ? `ficha-valor pastilla estado-${tono}` : "ficha-valor" }, valor),
    nodoDetalle,
  );
  return { li: elemento("li", {}, enlace), detalle: nodoDetalle };
}

/**
 * Qué decir de la luz en una ficha. Sin datos al día dice "Sin datos recientes": una nota gris
 * con "no ha publicado cortes" se leía como "no hay cortes".
 */
function datosLuz(suspensiones) {
  const luz = suspensiones ? estadoLuz(suspensiones) : null;
  if (!luz) return { valor: t("sinDatos"), detalle: t("resumenLuzError"), estado: "neutro", sinDatos: true };
  const vieja = !luz.cronograma && !luz.publicadoHoy && luz.diasSinPublicar !== null && luz.diasSinPublicar > 2;
  if (vieja) {
    return { valor: t("resumenLuzSinDatos"), detalle: t("resumenLuzDesde", { fecha: fechaLarga().format(new Date(luz.ultima)) }), estado: "neutro", sinDatos: true };
  }
  if (luz.cronograma) return { valor: t("resumenLuzCronograma"), detalle: fechaDia(luz.cronograma.fecha), aviso: true, estado: "atencion" };
  if (luz.publicadoHoy) {
    const hay = luz.cortesHoy.length > 0;
    return { valor: t("resumenLuzHoy", { n: luz.cortesHoy.length }), detalle: t("resumenLuzFuente"), aviso: hay, estado: hay ? "alerta" : "ok" };
  }
  return { valor: t("resumenLuzSinCortes"), detalle: t("resumenLuzFuente"), estado: "ok" };
}

/** "3 h 10 min", "45 min". */
function tiempoQueFalta(minutos) {
  return t("duracion", { h: Math.floor(minutos / 60), m: minutos % 60 });
}

/** El primer aviso por confirmar que es de hoy o de mañana (o que no dice cuándo). */
function avisoCercano(posibles) {
  const manana = horaCuenca(new Date(Date.now() + 86_400_000)).fecha;
  return posibles.find((a) => !a.fecha || a.fecha <= manana) ?? null;
}

/**
 * "Hoy en Cuenca", en la portada: un par de frases sobre el día, antes de buscar una calle. El
 * recolector se dice con el color de las zonas en el mapa (nadie sabe de memoria su número de
 * zona); de lo demás, solo lo que hay: farmacias de turno y, si existen, cortes de luz o de agua.
 */
function pintarHoyEnCuenca({ zonas, suspensiones, turnos, agua, avisosAgua, diasFeriado }) {
  const fecha = new Intl.DateTimeFormat(etiquetaIdioma(), { weekday: "long", day: "numeric", month: "long", timeZone: "America/Guayaquil" }).format(new Date());
  const feriado = proximoFeriado(diasFeriado, new Date(), 7);
  let nota = "";
  if (feriado) {
    const nombre = feriado.dia[idioma()] ?? feriado.dia.es;
    const clave = feriado.faltan === 0 ? "feriadoHoy" : feriado.faltan === 1 ? "feriadoManana" : "feriadoProximo";
    nota = ` ${t(clave, { fecha: fechaDia(feriado.dia.fecha), nombre })}`;
  }
  $("hoy-fecha").textContent = `${fecha[0].toUpperCase()}${fecha.slice(1)}.${nota}`;

  const hoy = franjasDeHoy(zonas);
  $("hoy-recolector").replaceChildren(
    elemento("strong", {}, hoy.length ? t("hoyRecolector", { lmv: hoy[0].lmv }) : t("hoyRecolectorNo")),
    " ",
    t("hoyTuCalle"),
  );

  const frases = [];
  const turno = turnoActual(turnos?.turnos);
  if (turno) frases.push(elemento("a", { href: "info/farmacias-de-turno.html" }, t("hoyFarmacias", { n: turno.farmacias.length })));
  const luz = suspensiones ? estadoLuz(suspensiones) : null;
  if (luz?.publicadoHoy && luz.cortesHoy.length) frases.push(t("hoyLuz", { n: luz.cortesHoy.length }));
  const corte = agua ? cortesAgua(agua)[0] : null;
  if (corte && corte.fecha <= horaCuenca(new Date(Date.now() + 86_400_000)).fecha) {
    frases.push(elemento("a", { href: "info/cortes-de-agua.html" }, t("hoyAgua")));
  } else if (avisoCercano(avisosAguaPorConfirmar(avisosAgua, agua))) {
    frases.push(elemento("a", { href: "info/cortes-de-agua.html" }, t("hoyAguaPosible")));
  }
  // El aire llega aparte (se pide a la EMOV): su frase se conserva al repintar.
  const aire = $("hoy-otros").querySelector(".hoy-aire");
  $("hoy-otros").replaceChildren(...frases.flatMap((f) => [f, " "]), ...(aire ? [aire] : []));
  $("hoy-cuenca").hidden = false;
}

/** El aire del Centro Histórico (o de la primera estación con dato), en una frase de la portada. */
function pintarAireCuenca(estaciones, { clima = null } = {}) {
  $("hoy-otros").querySelector(".hoy-aire")?.remove();
  const estacion = estaciones.find((e) => /centro/i.test(e.nombre)) ?? estaciones[0];
  if (!estacion) return;
  const nivel = t("aireNiveles")[estacion.nivel - 1].toLowerCase();
  const frase = clima ? t("hoyAireClima", { nivel, temperatura: clima.temperatura }) : t("hoyAire", { nivel });
  $("hoy-otros").append(elemento("span", { class: "hoy-aire" }, frase));
}

const enMayuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** Las cuatro fichas de "Hoy en tu calle". Devuelve cómo actualizar la de farmacias. */
function pintarResumen({ zona, suspensiones, turnos, cercanas }) {
  const fichas = [];

  const p = zona?.properties;
  const proxima = p ? proximaRecoleccion(p) : null;
  fichas.push(
    ficha(
      "basura",
      p ? describirRecoleccion(proxima) : t("fueraZonas"),
      p ? t("zonaRecoleccion", { zona: p.zona }) : "",
      // Pasando ahora, en verde; hoy más tarde (hay que sacar la funda), en ámbar.
      { estado: proxima?.estado === "ahora" ? "ok" : proxima?.estado === "hoy" ? "atencion" : null },
    ),
  );

  const luz = datosLuz(suspensiones);
  // Sin datos al día, la luz no ocupa una ficha (no hay nada que decir): va en una línea, abajo.
  const notaLuz = $("resumen-nota");
  notaLuz.hidden = !luz.sinDatos;
  if (luz.sinDatos) {
    notaLuz.replaceChildren(
      icono(ICONO_SERVICIO.luz),
      elemento("span", {}, elemento("a", { href: "#s-luz" }, t("resumenLuzNota")), " ", `${luz.detalle}.`),
    );
  } else {
    fichas.push(ficha("luz", luz.valor, luz.detalle, { aviso: luz.aviso, estado: luz.estado }));
  }

  const turno = turnoActual(turnos?.turnos);
  let fichaFarmacias;
  if (turno) {
    const fecha = new Intl.DateTimeFormat(etiquetaIdioma(), { weekday: "long", day: "numeric", timeZone: "UTC" }).format(
      new Date(`${turno.fin}T12:00:00Z`),
    );
    fichaFarmacias = ficha("farmacias", t("resumenFarmacias", { n: turno.farmacias.length }), t("resumenFarmaciasHasta", { fecha }));
  } else {
    fichaFarmacias = ficha("farmacias", turnos ? t("resumenFarmaciasSin") : t("sinDatos"), "");
  }
  fichas.push(fichaFarmacias);

  if (!cercanas) {
    fichas.push(ficha("buses", t("sinDatos"), ""));
  } else if (!cercanas.length) {
    fichas.push(ficha("buses", t("resumenSinLineas"), ""));
  } else {
    // Las que pasan a la misma distancia que la más cercana (con 20 m de margen) van juntas:
    // destacar solo la primera parecía una preferencia sin motivo.
    const primera = cercanas[0];
    const distancia = distanciaParada(primera.metros);
    const juntas = cercanas.filter((l) => l.tipo !== "tranvia" && l.metros - primera.metros < 20);
    // La respuesta es cuáles pasan más cerca, no cuántas hay: el conteo queda de detalle.
    const otras = cercanas.length - (primera.tipo === "tranvia" ? 1 : juntas.length);
    const yMas = otras > 0 ? t("resumenLineasMas", { n: otras }) : "";
    if (primera.tipo === "tranvia") {
      fichas.push(ficha("buses", t("resumenTranvia"), enMayuscula(t("resumenADistancia", { distancia })) + yMas));
    } else if (juntas.length > 4) {
      fichas.push(ficha("buses", t("resumenLineasEnParada", { n: juntas.length, distancia }), yMas ? t("resumenLineas", { n: cercanas.length }) : ""));
    } else {
      fichas.push(
        ficha("buses", t("resumenLineasValor", { n: juntas.length, lista: listar(juntas.map((l) => l.linea)) }), enMayuscula(t("resumenADistancia", { distancia })) + yMas),
      );
    }
  }

  $("resumen").replaceChildren(...fichas.map((f) => f.li));
  return {
    farmaciaCercana(farmacia) {
      // Cuál es la más cercana, con su nombre: "13 de turno" no dice a dónde ir.
      const valor = fichaFarmacias.li.querySelector(".ficha-valor");
      if (farmacia.nombre) {
        valor.textContent = farmacia.nombre;
        fichaFarmacias.detalle.textContent = t("resumenFarmaciaCercaDe", { n: turno.farmacias.length, distancia: formatoDistancia(farmacia.metros) });
      } else {
        fichaFarmacias.detalle.textContent = t("resumenFarmaciaCerca", { distancia: formatoDistancia(farmacia.metros) });
      }
    },
  };
}

const CONTAMINANTES = { CO: "CO", OZONE: "O₃", NO2: "NO₂", SO2: "SO₂", PM25: "PM2,5", PM10: "PM10" };
const nombreContaminante = (clave) => {
  const nombre = CONTAMINANTES[clave] ?? clave;
  return idioma() === "en" ? nombre.replace(",", ".") : nombre;
};

/**
 * "Aire hoy": un renglón en el resumen y su sección, con la estación de la EMOV más cercana.
 * Sin dato reciente (o sin conexión con la EMOV) no se muestra nada.
 */
function pintarAire(estacion, { uv = null, clima = null } = {}) {
  $("resumen").querySelector(".ficha-aire")?.remove();
  // De noche el índice UV es 0 y no dice nada: se deja solo la temperatura.
  if (uv && !(uv.valor > 0)) uv = null;
  const hay = Boolean(estacion || uv || clima);
  $("s-aire").hidden = !hay;
  $("nav-aire").hidden = !hay;
  if (!hay) return;

  const horaDe = (fecha) =>
    new Intl.DateTimeFormat(etiquetaIdioma(), { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Guayaquil" }).format(fecha);
  const nivelUv = uv ? t("uvNiveles")[uv.nivel - 1] : null;
  // En el resumen: el aire y, al lado, el sol y la temperatura.
  const extras = [uv ? t("resumenUv", { valor: uv.valor, nivel: nivelUv.toLowerCase() }) : null, clima ? `${clima.temperatura} °C` : null]
    .filter(Boolean)
    .join(", ");
  const textoUv = uv ? t("resumenUv", { valor: uv.valor, nivel: nivelUv.toLowerCase() }) : "";
  const temperatura = clima ? `${clima.temperatura} °C` : null;
  // Verde, ámbar o rojo según lo peor de los dos. El sol alto o muy alto, que en Cuenca es
  // cosa de casi todos los mediodías, va en ámbar: el rojo queda para el sol extremo y el aire
  // malo, o nadie lo miraría. El titular dice siempre lo que le da el color a la ficha.
  const gravedadAire = estacion ? Math.min(estacion.nivel, 3) : 0;
  const gravedadUv = uv ? (uv.nivel <= 2 ? 1 : uv.nivel <= 4 ? 2 : 3) : 0;
  const mandaElSol = !estacion || gravedadUv > gravedadAire;
  const valorFicha = mandaElSol ? textoUv || temperatura : t("aireNiveles")[estacion.nivel - 1];
  const detalleFicha = !estacion
    ? uv ? temperatura : null
    : mandaElSol
      ? [t("resumenAireCon", { nivel: t("aireNiveles")[estacion.nivel - 1].toLowerCase(), valor: estacion.valor, estacion: estacion.nombre }), temperatura].filter(Boolean).join(". ")
      : [t("resumenAire", { valor: estacion.valor, estacion: estacion.nombre }), extras].filter(Boolean).join(". ");
  const gravedad = Math.max(gravedadAire, gravedadUv);
  const estado = gravedad === 1 ? "ok" : gravedad === 2 ? "atencion" : gravedad >= 3 ? "alerta" : null;
  const { li } = ficha("aire", valorFicha, detalleFicha, { aviso: gravedad >= 3, estado });
  li.classList.add("ficha-aire");
  $("resumen").append(li);

  const bloquesSol = [];
  if (uv) {
    bloquesSol.push(
      elemento("h3", { class: "subtitulo" }, t("uvTitulo")),
      elemento(
        "p",
        { class: "luz-resumen" },
        elemento("i", { class: `nivel-uv n${uv.nivel}`, "aria-hidden": "true" }),
        t("uvResumen", { valor: uv.valor, nivel: nivelUv.toLowerCase() }),
      ),
      elemento("p", { class: "aire-recomendacion" }, t("uvRecomendaciones")[uv.nivel - 1]),
    );
  }
  if (clima) {
    bloquesSol.push(
      elemento(
        "p",
        { class: uv ? "detalle" : "luz-resumen" },
        clima.humedad === null ? t("climaSinHumedad", { temperatura: clima.temperatura }) : t("clima", { temperatura: clima.temperatura, humedad: clima.humedad }),
      ),
    );
  }
  if (uv || clima) {
    // De noche no hay índice UV: la frase sobre el sol de altura ya no viene al caso.
    bloquesSol.push(elemento("p", { class: "detalle" }, t(uv ? "uvFuente" : "climaFuente", { hora: horaDe((uv ?? clima).fecha) })));
  }

  if (!estacion) {
    $("aire-estado").replaceChildren(...bloquesSol);
    return;
  }

  const nivel = t("aireNiveles")[estacion.nivel - 1];
  const hora = horaDe(estacion.fecha);

  // Texto propio para cada nivel, en el mismo tono que el resto de la página.
  const recomendacion = t("aireRecomendaciones")[estacion.nivel - 1];
  $("aire-estado").replaceChildren(
    elemento(
      "p",
      { class: "luz-resumen" },
      elemento("i", { class: `nivel-aire n${estacion.nivel}`, "aria-hidden": "true" }),
      t("aireResumen", { nivel, valor: estacion.valor }),
    ),
    elemento("p", { class: "aire-recomendacion" }, recomendacion),
    elemento(
      "p",
      { class: "detalle" },
      t("aireEstacion", {
        estacion: estacion.nombre,
        direccion: estacion.direccion ? ` (${direccionLegible(estacion.direccion)})` : "",
        distancia: formatoDistancia(estacion.metros),
        hora,
      }),
      " ",
      t("aireMide", {
        dominante: t("aireContaminantes")[estacion.dominante] ?? nombreContaminante(estacion.dominante),
        lista: listar(estacion.parametros.map((p) => nombreContaminante(p.nombre))),
      }),
    ),
    elemento(
      "p",
      { class: "detalle" },
      t("aireFuente"),
      " ",
      elemento("a", { href: PAGINA_AIRE, target: "_blank", rel: "noopener" }, t("aireFuenteEnlace")),
      ".",
    ),
    ...bloquesSol,
  );
}

/** En la barra de secciones, marca la que se está viendo (aria-current). */
/**
 * Las pestañas de la respuesta: cada una muestra solo su sección (Resumen, Basura, Luz...).
 * Si la barra de pestañas quedó arriba, fuera de la vista, se vuelve a ella para que la sección
 * empiece a leerse desde su título.
 */
// La pestaña que pedía el enlace al abrir la página (se lee antes de que nada la cambie).
const PESTANA_PEDIDA = new URLSearchParams(location.search).get("ver");

/** La pestaña "Cortes" muestra dos secciones (luz y agua); sus enlaces viejos llevan a ella. */
const SECCIONES_DE = { "s-cortes": ["s-luz", "s-agua"] };
const PESTANA_DE = { "s-luz": "s-cortes", "s-agua": "s-cortes" };

function elegirPestana(id, { desplazar = true, foco = false } = {}) {
  const enlaces = [...document.querySelectorAll(".secciones a")];
  // Una ficha o un enlace antiguo (?ver=agua) pide una sección que vive dentro de una pestaña.
  const pedida = id;
  id = PESTANA_DE[id] ?? id;
  if (!enlaces.some((a) => a.getAttribute("href") === `#${id}`)) id = "s-resumen";
  for (const a of enlaces) {
    const activa = a.getAttribute("href") === `#${id}`;
    a.setAttribute("aria-selected", String(activa));
    a.tabIndex = activa ? 0 : -1;
    if (activa && foco) a.focus();
    // La pestaña elegida, a la vista dentro de la barra (en el celular se desliza de lado).
    if (activa) a.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  for (const seccion of document.querySelectorAll(".respuesta > section")) {
    seccion.classList.toggle("fuera-de-pestana", !(SECCIONES_DE[id] ?? [id]).includes(seccion.id));
  }
  // La pestaña queda en la dirección (?ver=buses), junto al punto (#lat,lon): así el enlace
  // que se comparte o se recarga abre donde uno estaba. El resumen no se anota.
  const direccion = new URL(location.href);
  if (id === "s-resumen") direccion.searchParams.delete("ver");
  else direccion.searchParams.set("ver", id.slice(2));
  history.replaceState(history.state, "", direccion);
  // Si se estaba leyendo más abajo (la barra quedó fija arriba), la nueva sección empieza
  // desde su título y no a media página.
  const barra = document.querySelector(".secciones");
  const panel = document.getElementById((SECCIONES_DE[id] ?? [id])[0]);
  if (desplazar && barra && panel && panel.getBoundingClientRect().top < barra.getBoundingClientRect().bottom) {
    panel.scrollIntoView({ behavior: "auto", block: "start" });
  }
  // Si se pidió la segunda sección de la pestaña (el agua), se baja hasta ella.
  if (desplazar && pedida !== id && pedida !== (SECCIONES_DE[id] ?? [])[0]) {
    document.getElementById(pedida)?.scrollIntoView({ behavior: "auto", block: "nearest" });
  }
}

/** Tocar una pestaña o una ficha del resumen abre esa sección, sin tocar la dirección (#lat,lon). */
function irASeccion(evento) {
  const enlace = evento.target.closest('a[href^="#s-"]');
  if (!enlace) return;
  evento.preventDefault();
  elegirPestana(enlace.getAttribute("href").slice(1));
}

/** Con el teclado, las flechas pasan de una pestaña a otra (como en cualquier lista de pestañas). */
function pestanasConTeclado(evento) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
  const enlaces = [...document.querySelectorAll(".secciones a")].filter((a) => !a.hidden);
  const actual = enlaces.indexOf(document.activeElement);
  if (actual < 0) return;
  evento.preventDefault();
  const destino =
    evento.key === "Home" ? 0 : evento.key === "End" ? enlaces.length - 1 : (actual + (evento.key === "ArrowRight" ? 1 : -1) + enlaces.length) % enlaces.length;
  elegirPestana(enlaces[destino].getAttribute("href").slice(1), { foco: true, desplazar: false });
}

// ---------- ¿Qué bus me lleva? ----------

/** Los pasos de una opción, en palabras. */
function pasosDeOpcion(opcion, paradas) {
  const cerca = (punto) => {
    const parada = paradas ? masCercano(punto, paradas, 250) : null;
    return parada ? t("pasoCerca", { parada: nombreParada(parada) }) : "";
  };
  const pasos = [];
  const { tramos } = opcion;
  if (opcion.tipo === "pie") return [t("pasoSoloPie", { distancia: formatoDistancia(tramos[0].metros) })];
  tramos.forEach((tramo, i) => {
    if (tramo.modo === "bus") {
      const datos = { linea: tramo.linea, hacia: tramo.hacia, distancia: formatoDistancia(tramo.metros) };
      const variante = tramo.variante ? t("pasoVariante", { lugar: tramo.variante }) : "";
      pasos.push((tramo.tipo === "tranvia" ? t("pasoTomarTranvia", datos) : t("pasoTomar", datos)) + variante);
      return;
    }
    const siguiente = tramos[i + 1];
    const distancia = formatoDistancia(tramo.metros);
    if (i === 0) {
      const texto =
        siguiente.tipo === "tranvia"
          ? t("pasoCaminarATranvia", { distancia })
          : t("pasoCaminarA", { distancia, linea: siguiente.linea });
      pasos.push(texto + cerca(tramo.hasta));
    } else if (siguiente) {
      pasos.push(t("pasoCambiar", { distancia, linea: siguiente.linea }) + cerca(tramo.hasta));
    } else {
      pasos.push(tramo.metros < 30 ? t("pasoLlegarAhi") : t("pasoLlegar", { distancia }));
    }
  });
  return pasos;
}

const SVG_PIE =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><circle cx="13" cy="4" r="2"/><path d="M10.6 8.2 8 10.4V14h2v-2.6l1.3-1-.9 4.4-2.9 5.7 1.8.9 2.7-5.3 1.9 1.9V22h2v-5l-2.2-2.2.6-3 1 1.7H17v-2h-1.6l-1.6-2.8a2 2 0 0 0-1.7-1z"/></svg>';

/** Un tramo de la tira de la opción: a pie (con sus metros) o en bus (su número). */
function piezaDeTramo(tramo, esUltimo) {
  if (tramo.modo === "caminar") {
    const texto = esUltimo && tramo.metros < 30 ? t("rutaEnDestino") : formatoDistancia(tramo.metros);
    const pieza = elemento("span", { class: "tira-pie" }, texto);
    pieza.insertAdjacentHTML("afterbegin", SVG_PIE);
    return pieza;
  }
  const esTranvia = tramo.tipo === "tranvia";
  return elemento(
    "span",
    { class: "tira-bus" },
    elemento("span", { class: `numero-linea${esTranvia ? " tranvia" : ""}` }, esTranvia ? "T" : tramo.linea),
    tramo.variante ? elemento("span", { class: "tira-variante" }, tramo.variante) : null,
  );
}

let relojOpciones = 0;

/** Cuándo pasa el primer bus de una opción, con las mismas cuentas que el panel del mapa. */
function textoCuando(opcion, transporte) {
  const buses = opcion.tramos.filter((tramo) => tramo.modo === "bus");
  const primero = buses[0];
  const minutosTranvia = frecuenciaTranvia(transporte?.tranvia);
  const cuando = [];
  if (opcion.fueraDeHorario) {
    cuando.push(t("rutaFueraHorario"));
    // De madrugada, antes del primer bus: se dice a qué hora empieza a pasar.
    const faltan = primero && primero.tipo !== "tranvia" && !primero.variante ? minutosAlProximo(primero.horario, primero.largo, primero.metrosSubida) : null;
    if (faltan !== null && faltan > 1.5) cuando.push(t("rutaPrimeroHora", { hora: horaDentroDe(faltan) }));
  } else if (primero?.tipo === "tranvia") {
    cuando.push(minutosTranvia ? t("rutaTranviaCada", { minutos: minutosTranvia }) : t("rutaTranviaHorario"));
  } else if (primero) {
    const faltan = primero.variante ? null : minutosAlProximo(primero.horario, primero.largo, primero.metrosSubida);
    if (faltan !== null) {
      cuando.push(
        faltan < 1.5 ? t("rutaProximoYa") : faltan > 60 ? t("rutaProximoHora", { hora: horaDentroDe(faltan) }) : t("rutaProximo", { minutos: Math.round(faltan) }),
      );
    }
    if (primero.horario?.intervalo_min) cuando.push(t("rutaCada", { minutos: primero.horario.intervalo_min }));
  }
  if (buses.length > 1) cuando.push(t("rutaTransbordo"));
  return cuando.join(", ");
}

/**
 * Las opciones de "¿qué bus me lleva?". Cada una se resume en una línea que se lee de un
 * vistazo (a pie › bus › a pie), lo que la distingue de las otras y cuándo pasa el bus; los
 * pasos detallados se abren solo en la opción elegida, para no repetir lo mismo en todas.
 */
function pintarOpciones(opciones, destino, mapa, paradas, transporte) {
  const lista = $("ruta-opciones");
  const botones = [];
  clearInterval(relojOpciones);
  lista.replaceChildren(
    ...opciones.map((opcion, i) => {
      const buses = opcion.tramos.filter((tramo) => tramo.modo === "bus");
      // Los tramos de menos de 30 m a pie al inicio o en un transbordo no se dibujan.
      const visibles = opcion.tramos.filter(
        (tramo, j) => tramo.modo === "bus" || tramo.metros >= 30 || j === opcion.tramos.length - 1,
      );
      const tira = elemento("span", { class: "opcion-tira", "aria-hidden": "true" });
      // Lo mismo que la tira, dicho con palabras para el lector de pantalla.
      const tiraTexto = (buses.length ? visibles : [opcion.tramos[0]])
        .map((tramo) =>
          tramo.modo === "caminar"
            ? t("rutaTiraPie", { distancia: formatoDistancia(tramo.metros) })
            : tramo.tipo === "tranvia"
              ? t("tranvia")
              : tramo.variante
                ? t("rutaTiraVariante", { linea: tramo.linea, lugar: tramo.variante })
                : t("rutaTiraLinea", { linea: tramo.linea }),
        )
        .join(", ");
      visibles.forEach((tramo, j) => {
        if (j) tira.append(elemento("span", { class: "tira-flecha" }, "›"));
        tira.append(piezaDeTramo(tramo, j === visibles.length - 1 && visibles.length > 1));
      });
      if (!buses.length) tira.replaceChildren(piezaDeTramo(opcion.tramos[0], false));

      // Cuándo pasa: del primer bus de la opción (estimado con su horario).
      const cuando = textoCuando(opcion, transporte);

      // Lo que la distingue de las otras opciones.
      const ultimo = opcion.tramos.at(-1);
      const etiquetas = [
        buses.length && ultimo.modo === "caminar" && ultimo.metros < 30 ? ["puerta", t("rutaALaPuerta")] : null,
        ...buses.filter((b) => b.variante).map((b) => ["variante", t("rutaVariante", { lugar: b.variante })]),
      ].filter(Boolean);

      const pasaje = pasajeDeOpcion(opcion, transporte?.tarifas);
      const boton = elemento(
        "button",
        { type: "button", class: "opcion-ruta", "aria-pressed": i === 0 ? "true" : "false" },
        elemento(
          "span",
          { class: "opcion-cabecera" },
          elemento("strong", { class: "opcion-minutos" }, t("rutaMinutos", { n: opcion.minutos })),
          tira,
          elemento("span", { class: "oculto-accesible" }, tiraTexto),
          pasaje !== null ? elemento("span", { class: "opcion-pasaje" }, dolares(pasaje)) : null,
        ),
        cuando ? elemento("span", { class: "opcion-cuando" }, cuando) : null,
        opcion.variante
          ? elemento(
              "span",
              { class: "opcion-variante" },
              opcion.variante.metrosAlFinal < 30
                ? t("rutaTambienVariante", { lugar: opcion.variante.lugar })
                : t("rutaTambienVarianteCerca", { lugar: opcion.variante.lugar, distancia: formatoDistancia(opcion.variante.metrosAlFinal) }),
            )
          : null,
        etiquetas.length
          ? elemento(
              "span",
              { class: "opcion-etiquetas" },
              ...etiquetas.map(([clase, texto]) => elemento("span", { class: `etiqueta-opcion ${clase}` }, texto)),
            )
          : null,
        // Spans y no <ol>: un botón solo admite contenido de frase.
        elemento(
          "span",
          { class: "opcion-pasos", role: "list" },
          ...pasosDeOpcion(opcion, paradas).map((paso) => elemento("span", { role: "listitem" }, paso)),
        ),
      );
      boton.addEventListener("click", () => {
        for (const b of botones) b.setAttribute("aria-pressed", "false");
        boton.setAttribute("aria-pressed", "true");
        mapa.dibujarRuta(opcion, destino, paradasRegistradas);
        verMapaEnCelular();
      });
      botones.push(boton);
      return elemento("li", {}, boton);
    }),
  );
  $("ruta-nota").hidden = !opciones.length;
  if (opciones.length) mapa.dibujarRuta(opciones[0], destino, paradasRegistradas);
  // Los minutos al próximo bus se ponen al día, igual que el panel del mapa.
  relojOpciones = setInterval(() => {
    if (!botones[0]?.isConnected) {
      clearInterval(relojOpciones); // otra búsqueda o otro punto: estas tarjetas ya no están
      return;
    }
    if (document.hidden) return;
    botones.forEach((boton, i) => {
      const nodo = boton.querySelector(".opcion-cuando");
      const texto = textoCuando(opciones[i], transporte);
      if (nodo && nodo.textContent !== texto) nodo.textContent = texto;
    });
  }, 15_000);
}

/** El pasaje vigente, bajo el buscador de rutas. */
function pintarPasaje(tarifas, revisado) {
  const caja = $("pasaje");
  if (!tarifas?.bus || !tarifas?.tranvia) {
    caja.hidden = true;
    return;
  }
  const { bus, tranvia } = tarifas;
  caja.replaceChildren(
    elemento("h3", { class: "subtitulo" }, t("pasajeTitulo")),
    elemento(
      "p",
      {},
      t("pasajeBus", { personalizada: dolares(bus.personalizada), preferencial: dolares(bus.personalizada_preferencial) }),
      " ",
      t("pasajeBusSin", { sin: dolares(bus.sin_subsidio) }),
    ),
    elemento("p", {}, t("pasajeTranvia", { normal: dolares(tranvia.normal) })),
    revisado ? elemento("p", { class: "detalle" }, t("revisadoEl", { fecha: fechaLarga().format(new Date(`${revisado}T12:00:00Z`)) })) : null,
  );
  caja.hidden = false;
}

// ---------- Ubicar al usuario ----------

// El índice de calles pesa unos cientos de KB: se descarga la primera vez que se busca.
let indiceCalles = null;
function cargarIndiceCalles() {
  indiceCalles ??= cargarJson("calles/calles.geojson")
    .then(prepararIndice)
    .catch((error) => {
      indiceCalles = null;
      throw error;
    });
  return indiceCalles;
}

// ---------- Autocompletado de calles ----------

/**
 * Sugerencias de calles bajo un campo de búsqueda (un combobox accesible: flechas,
 * Enter y Esc). Al elegir la segunda calle de una esquina, se busca directamente.
 */
function autocompletar(campo, lista, alCompletar) {
  let sugerencias = [];
  let activa = -1;
  let espera = null;
  let version = 0;

  const cerrar = () => {
    version++;
    sugerencias = [];
    activa = -1;
    lista.hidden = true;
    lista.replaceChildren();
    campo.setAttribute("aria-expanded", "false");
    campo.removeAttribute("aria-activedescendant");
  };

  const marcar = (i) => {
    activa = i;
    [...lista.children].forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
    const elegida = lista.children[i];
    if (!elegida) return campo.removeAttribute("aria-activedescendant");
    campo.setAttribute("aria-activedescendant", elegida.id);
    elegida.scrollIntoView({ block: "nearest" });
  };

  const usar = (sugerencia) => {
    campo.value = sugerencia.texto;
    cerrar();
    campo.focus();
    // Un lugar o dos calles ya se pueden buscar; con una sola, se sigue escribiendo ("y ...").
    if (sugerencia.lugar || interpretarBusqueda(sugerencia.texto).calles.length === 2) alCompletar();
  };

  const pintar = () => {
    if (!sugerencias.length) return cerrar();
    lista.replaceChildren(
      ...sugerencias.map((sugerencia, i) => {
        const li = elemento(
          "li",
          { id: `${lista.id}-${i}`, role: "option", "aria-selected": "false" },
          sugerencia.nombre,
          sugerencia.lugar ? elemento("span", { class: "tipo-sugerencia" }, t("sugerenciaLugar")) : null,
        );
        // mousedown sin efecto: así el campo no pierde el foco antes del clic.
        li.addEventListener("mousedown", (evento) => evento.preventDefault());
        li.addEventListener("click", () => usar(sugerencia));
        return li;
      }),
    );
    activa = -1;
    lista.hidden = false;
    campo.setAttribute("aria-expanded", "true");
  };

  const actualizar = async () => {
    const pedido = ++version;
    let indice;
    try {
      indice = await cargarIndiceCalles();
    } catch {
      return;
    }
    if (pedido !== version || document.activeElement !== campo) return;
    const texto = campo.value;
    const lugares = await cargarLugaresConocidos();
    if (pedido !== version || document.activeElement !== campo) return;
    // Primero los lugares (terminal, mercados, hospitales...) y después las calles.
    const deLugares = sugerirLugares(texto, lugares).map((l) => ({ nombre: l.nombre, texto: l.nombre, lugar: l }));
    sugerencias = [...deLugares, ...sugerirCalles(texto, indice)].slice(0, 7);
    // Si lo escrito ya es la única sugerencia, no hace falta mostrarla.
    if (sugerencias.length === 1 && sugerencias[0].texto === texto) sugerencias = [];
    pintar();
  };

  // El índice de calles se pide al entrar en el campo, antes de la primera letra.
  campo.addEventListener("focus", () => cargarIndiceCalles().catch(() => {}));
  campo.addEventListener("input", () => {
    clearTimeout(espera);
    espera = setTimeout(actualizar, 120);
  });
  campo.addEventListener("keydown", (evento) => {
    if (lista.hidden) return;
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      marcar((activa + 1) % sugerencias.length);
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      marcar(activa <= 0 ? sugerencias.length - 1 : activa - 1);
    } else if (evento.key === "Enter" && activa >= 0) {
      evento.preventDefault();
      usar(sugerencias[activa]);
    } else if (evento.key === "Escape") {
      // Sin esto, Esc en un campo de búsqueda también borra lo escrito.
      evento.preventDefault();
      cerrar();
    } else if (evento.key === "Tab") {
      cerrar();
    }
  });
  campo.addEventListener("blur", () => setTimeout(cerrar, 150));
  campo.form.addEventListener("submit", () => {
    clearTimeout(espera);
    cerrar();
  });
}

/** Un nombre para un punto sin nombre (del mapa o del GPS): la esquina más cercana. */
async function nombreDeEsquina(punto) {
  const esquina = esquinaCercana(punto, await cargarIndiceCalles());
  if (!esquina) return null;
  return esquina.cruce
    ? t("esquinaNombre", { calle: esquina.calle, cruce: esquina.cruce })
    : t("cercaDe", { calle: esquina.calle });
}

const LARGO_MAXIMO_SIN_CRUCE = 600;

/**
 * Convierte lo escrito en un punto. Primero busca en el índice local de calles
 * (intersecciones o calles cortas); si no encuentra ninguna calle, prueba con
 * Nominatim, que conoce lugares como "Mall del Río" o "Parque Calderón".
 * Devuelve { punto, texto } o { error, resaltar? }.
 */
let lugaresConocidos = null;

/** La lista de lugares conocidos, pedida una vez; vacía si no se puede leer. */
async function cargarLugaresConocidos() {
  lugaresConocidos ??= cargarJson("manual/lugares.json")
    .then((d) => d.lugares ?? [])
    .catch(() => {
      lugaresConocidos = null; // se reintenta la próxima vez
      return [];
    });
  return lugaresConocidos;
}

async function ubicarTexto(texto) {
  // Un lugar conocido se ubica aquí mismo, sin preguntar a Nominatim.
  const conocido = lugarPorNombre(texto, await cargarLugaresConocidos());
  if (conocido) return { punto: { lat: conocido.lat, lon: conocido.lon }, texto: conocido.nombre };

  const { calles, tieneNumero } = interpretarBusqueda(texto);
  let indice = null;
  try {
    indice = await cargarIndiceCalles();
  } catch {
    // Sin índice, queda Nominatim.
  }

  if (indice && calles.length === 2) {
    const [a, b] = calles.map((c) => buscarCalles(c, indice));
    const falta = !a.length ? calles[0] : !b.length ? calles[1] : null;
    if (falta) {
      return { error: t("noCalle", { calle: falta }), reportable: true };
    }
    const cruce = cruceDeCalles(a, b);
    if (!cruce) {
      return {
        error: t("noSeCruzan", { a: a[0].nombre, b: b[0].nombre }),
        resaltar: [a[0].feature, b[0].feature],
        reportable: true,
      };
    }
    return { punto: cruce.punto, texto: t("cruce", { a: cruce.a.nombre, b: cruce.b.nombre }) };
  }

  if (indice && calles.length === 1) {
    const [calle] = buscarCalles(calles[0], indice);
    if (calle) {
      if (longitudMetros(calle.feature) <= LARGO_MAXIMO_SIN_CRUCE && !tieneNumero) {
        return { punto: puntoMedio(calle.feature), texto: calle.nombre };
      }
      const motivo = tieneNumero ? t("numerosCasa") : t("calleLarga", { calle: calle.nombre });
      return {
        error: `${motivo} ${t("escribeCruce", { calle: calles[0] })}`,
        resaltar: [calle.feature],
        calle,
      };
    }
  }

  const lugar = await buscarDireccion(texto);
  if (!lugar) {
    return {
      error: t("noLugar"),
      reportable: true,
    };
  }
  return { punto: lugar, texto: lugar.nombre.split(",").slice(0, 3).join(",") };
}

async function buscarDireccion(texto) {
  const parametros = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "ec",
    viewbox: CAJA_CUENCA,
    bounded: "1",
    "accept-language": idioma(),
    q: texto,
  });
  const respuesta = await fetch(`${NOMINATIM}?${parametros}`);
  if (!respuesta.ok) throw new Error(`Nominatim: ${respuesta.status}`);
  const [lugar] = await respuesta.json();
  return lugar ? { lat: Number(lugar.lat), lon: Number(lugar.lon), nombre: lugar.display_name } : null;
}

/**
 * Pide la ubicación al navegador y escucha unos segundos: la primera lectura suele ser la
 * aproximada (por la red) y el GPS o el wifi afinan después. Se queda con la más precisa.
 */
function miUbicacion({ suficiente = 100, espera = 8000 } = {}) {
  return new Promise((resolver, rechazar) => {
    if (!navigator.geolocation) {
      rechazar(new Error(t("geoNoSoportado")));
      return;
    }
    let mejor = null;
    let listo = false;
    let vigilancia = null;
    const terminar = (error) => {
      if (listo) return;
      listo = true;
      clearTimeout(reloj);
      if (vigilancia !== null) navigator.geolocation.clearWatch(vigilancia);
      if (mejor && !error) resolver(mejor);
      else rechazar(error ?? new Error(t("geoError")));
    };
    const reloj = setTimeout(() => terminar(), espera);
    vigilancia = navigator.geolocation.watchPosition(
      (pos) => {
        const lectura = { lat: pos.coords.latitude, lon: pos.coords.longitude, precision: pos.coords.accuracy };
        if (!mejor || lectura.precision < mejor.precision) mejor = lectura;
        if (lectura.precision <= suficiente) terminar();
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) terminar(new Error(t("geoSinPermiso")));
        else if (!mejor) terminar(new Error(t("geoError")));
      },
      { enableHighAccuracy: true, timeout: espera, maximumAge: 0 },
    );
  });
}

/** El aviso cuando la ubicación del navegador no sirve. */
function textoProblemaUbicacion({ problema, km, metros }) {
  return problema === "lejos"
    ? t("geoLejos", { km: km.toLocaleString(etiquetaIdioma()) })
    : t("geoImprecisa", { margen: formatoDistancia(metros) });
}

// ---------- Arranque ----------

async function iniciar() {
  aplicarTextos();
  // El correo para avisar de un error, con el asunto ya puesto.
  for (const enlace of document.querySelectorAll("a[data-aviso]")) {
    enlace.href = enlaceCorreoAviso({ asunto: t("avisoAsunto"), cuerpo: t("avisoCuerpo", { pagina: location.href }) });
    enlace.textContent = CORREO_AVISOS;
  }
  window.morlacoTema?.boton($("tema"), { oscuro: t("temaOscuroAria"), claro: t("temaClaroAria") });
  // Cambiar de idioma recarga la página: el punto elegido sigue en la dirección (#lat,lon).
  $("idioma").addEventListener("click", () => {
    guardar(CLAVE_IDIOMA, idioma() === "en" ? "es" : "en");
    location.reload();
  });

  let zonas;
  try {
    zonas = await cargarJson("recoleccion/zonas.geojson");
  } catch {
    document.documentElement.classList.remove("abriendo-punto");
    mensaje(t("errorDatos"), true);
    return;
  }
  const [suspensiones, paradas, estado, lineas, rutas, bicicletas, turnosFarmacias, transporte, estacionesTranvia, basura, agua, cerca, diasFeriado, avisosAgua] = await Promise.all(
    [
      "luz/suspensiones.json",
      "buses/paradas.geojson",
      "estado.json",
      "buses/lineas.geojson",
      "buses/rutas.json",
      "movilidad/bicicletas.geojson",
      "farmacias/turnos.json",
      "manual/transporte.json",
      "buses/tranvia.geojson",
      "manual/basura.json",
      "manual/agua.json",
      "ciudad/cerca.geojson",
      "manual/feriados.json",
      "agua/avisos.json",
    ].map((r) =>
      cargarJson(r).catch(() => null),
    ),
  );
  paradasRegistradas = paradas;
  datosTranvia = transporte?.tranvia ?? null;
  estacionesDelTranvia = estacionesTranvia;

  const fechas = Object.values(estado ?? {})
    .map((f) => f.actualizado)
    .filter(Boolean)
    .sort();
  if (fechas.length) {
    // estado.json guarda la hora en UTC; se muestra la fecha de Cuenca.
    const enCuenca = new Intl.DateTimeFormat(etiquetaIdioma(), {
      dateStyle: "long",
      timeZone: "America/Guayaquil",
    });
    $("actualizado").textContent = t("actualizado", { fecha: enCuenca.format(new Date(fechas.at(-1))) });
  }

  let puntoActual = null;
  let zonaActual = null;
  let nombreActual = null;
  // Un nombre provisional ("Tu ubicación") se muestra, pero no se guarda.
  let nombreProvisional = false;
  let lugares = leerLugares(leer(CLAVE_LUGARES));
  let recorridos = null;

  // Calidad del aire: se pide en vivo a la EMOV (cambia cada hora) y, como mucho, cada media
  // hora. Si no responde a tiempo o el dato es viejo, "Aire" simplemente no aparece.
  let estacionesAire = [];
  let extrasAire = {};
  let aireLeido = 0;
  const actualizarAire = async () => {
    if (Date.now() - aireLeido < 30 * 60_000) return;
    aireLeido = Date.now();
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), 6000);
    try {
      // Las tres consultas van juntas; si una falla, las otras se muestran igual.
      const pedir = (url) => fetch(url, { signal: control.signal }).then((r) => (r.ok ? r.json() : null));
      const [ica, uv, clima] = await Promise.allSettled([URL_AIRE, URL_UV, URL_CLIMA].map(pedir));
      estacionesAire = ica.status === "fulfilled" ? leerAire(ica.value) : [];
      extrasAire = {
        uv: uv.status === "fulfilled" ? leerUv(uv.value) : null,
        clima: clima.status === "fulfilled" ? leerClima(clima.value) : null,
      };
      if (!estacionesAire.length && !extrasAire.uv && !extrasAire.clima) throw new Error("EMOV sin datos");
    } catch {
      estacionesAire = [];
      extrasAire = {};
      aireLeido = Date.now() - 25 * 60_000; // se reintenta a los cinco minutos
    } finally {
      clearTimeout(reloj);
    }
    if (puntoActual) pintarAire(aireCercano(puntoActual, estacionesAire), extrasAire);
    pintarAireCuenca(estacionesAire, extrasAire);
  };

  const nombreLugar = (clave) => t(clave === "casa" ? "lugarCasa" : "lugarTrabajo");

  const pintarPunto = () => {
    if (!puntoActual) return;
    const clave = lugarDe(puntoActual, lugares);
    const z = zonaActual?.properties.zona;
    $("punto-nombre").replaceChildren(
      clave ? elemento("span", { class: "punto-lugar" }, nombreLugar(clave)) : "",
      nombreActual ?? t("puntoGuardado"),
    );
    $("punto-zona").textContent = z ? t("zonaRecoleccion", { zona: z }) : t("fueraZonas");
    // El punto de la zona, azul o verde como su zona en el mapa y en la leyenda.
    const lmv = zonaActual?.properties.dias_iso.includes(1);
    $("punto-zona").style.setProperty("--color-zona", z ? (lmv ? "var(--cupula)" : "var(--tomebamba)") : "var(--oro-grafico)");
    for (const boton of document.querySelectorAll(".lugar-boton")) {
      boton.setAttribute("aria-pressed", String(boton.dataset.lugar === clave));
    }
    pintarAtajos();
  };

  /**
   * Los otros lugares guardados, a un toque: bajo el nombre de la calle, para pasar de Casa a
   * Trabajo sin buscar; y bajo "¿A dónde vas?", para pedir la ruta hasta allá.
   */
  const pintarAtajos = () => {
    const aqui = puntoActual ? lugarDe(puntoActual, lugares) : null;
    const otros = LUGARES.filter((clave) => lugares[clave] && clave !== aqui);
    const botones = (alTocar) =>
      otros.map((clave) => {
        const boton = elemento("button", { type: "button", class: "lugar atajo" }, nombreLugar(clave));
        boton.addEventListener("click", () => alTocar(clave));
        return boton;
      });
    $("otros-lugares").hidden = !otros.length;
    $("otros-lugares").replaceChildren(
      elemento("span", {}, t("atajoVer")),
      ...botones((clave) => elegir(lugares[clave], nombreLugar(clave), lugares[clave].nombre, { nombrar: !lugares[clave].nombre })),
    );
    $("ir-lugares").hidden = !otros.length;
    $("ir-lugares").replaceChildren(
      elemento("span", {}, t("atajoIr")),
      ...botones((clave) => {
        $("destino").value = nombreLugar(clave);
        $("ruta").requestSubmit();
      }),
    );
  };

  /** Los lugares guardados, junto al buscador, para volver a ellos con un toque. */
  const pintarLugares = () => {
    const guardados = LUGARES.filter((clave) => lugares[clave]);
    $("mis-lugares").hidden = !guardados.length;
    $("mis-lugares")
      .querySelector("ul")
      .replaceChildren(
        ...guardados.map((clave) => {
          const lugar = lugares[clave];
          const boton = elemento(
            "button",
            { type: "button", class: "lugar" },
            elemento("span", {}, nombreLugar(clave)),
            lugar.nombre ? elemento("span", { class: "lugar-nombre" }, lugar.nombre) : null,
          );
          boton.addEventListener("click", () => elegir(lugar, nombreLugar(clave), lugar.nombre, { nombrar: !lugar.nombre }));
          return elemento("li", {}, boton);
        }),
      );
  };

  /** Busca la esquina más cercana y, si la persona sigue en ese punto, la pone como nombre. */
  const nombrarPunto = async (punto) => {
    try {
      const nombre = await nombreDeEsquina(punto);
      if (!nombre || puntoActual !== punto) return;
      nombreActual = nombre;
      nombreProvisional = false;
      pintarPunto();
      guardar(CLAVE_ULTIMO_PUNTO, textoDeLugar(punto, nombre));
    } catch {
      // Sin índice de calles se queda el nombre provisional.
    }
  };

  const elegir = (punto, origen, nombre, { nombrar = false } = {}) => {
    puntoActual = punto;
    nombreActual = nombre ?? null;
    nombreProvisional = nombrar;
    $("ruta-opciones").replaceChildren();
    $("ruta-nota").hidden = true;
    mensaje("");
    $("ruta-mensaje").textContent = "";
    const zona = zonaDe(punto.lon, punto.lat, zonas);
    zonaActual = zona;
    const cercanas = paradas ? paradasCercanas(punto, paradas) : [];
    $("respuesta").hidden = false;
    $("inicio").hidden = true;
    // Con respuesta, el buscador se recoge tras el letrero hasta que se pida cambiar de lugar.
    document.querySelector(".consulta").classList.add("con-respuesta");
    document.querySelector(".consulta").classList.remove("cambiando");
    // Otra calle: se empieza por el resumen.
    elegirPestana("s-resumen", { desplazar: false });
    pintarBasura(zona, basura?.rural);
    pintarLuz(suspensiones);
    pintarParadas(cercanas);
    const cercanasLineas = lineas ? lineasCercanas(punto, lineas, rutas?.rutas ?? []) : null;
    pintarLineas(cercanasLineas, mapa, { punto, transporte, estaciones: estacionesTranvia });
    pintarPasaje(transporte?.tarifas, transporte?.metadata?.revisado);
    const resumen = pintarResumen({ zona, suspensiones, turnos: turnosFarmacias, cercanas: cercanasLineas });
    actualizarFalta();
    pintarFarmacias(turnosFarmacias, punto, (f) => resumen.farmaciaCercana(f), (lista) => {
      // Si mientras tanto se eligió otro punto, estas farmacias ya no corresponden.
      if (puntoActual === punto) mapa.mostrarFarmacias(lista);
    }, (farmacia) => mapa.verFarmacia(farmacia));
    // Un corte de agua de hoy o de mañana sale también en el resumen.
    const posibles = avisosAguaPorConfirmar(avisosAgua, agua);
    const proximo = pintarAgua(agua, posibles)[0];
    pintarCalendarioAgua();
    const posible = avisoCercano(posibles);
    $("resumen").querySelector(".ficha-agua")?.remove();
    if (proximo && proximo.fecha <= horaCuenca(new Date(Date.now() + 86_400_000)).fecha) {
      const texto = proximo[idioma()] ?? proximo.es;
      const { li } = ficha(
        "agua",
        t("aguaHorario", { dia: fechaDia(proximo.fecha), desde: proximo.desde, hasta: horaLegible(proximo.hasta) }),
        texto.sectores,
        { aviso: true },
      );
      li.classList.add("ficha-agua");
      $("resumen").append(li);
    } else if (posible) {
      // Un corte que la prensa anunció y nadie ha revisado: se avisa, diciendo que falta confirmarlo.
      const { li } = ficha("agua", t("aguaPosibleFicha"), enMayuscula(cuandoAviso(posible)), { estado: "atencion" });
      li.classList.add("ficha-agua");
      $("resumen").append(li);
    }
    pintarCerca(punto, cerca);
    pintarAire(aireCercano(punto, estacionesAire), extrasAire);
    actualizarAire();
    pintarPunto();
    pintarBici(masCercano(punto, bicicletas));
    mapa.mostrar(punto, zona, cercanas);
    // Se conserva el estado: ahí se anota si el mapa está ampliado (mapa.js).
    history.replaceState(history.state, "", hashDesdePunto(punto));
    guardar(CLAVE_ULTIMO_PUNTO, textoDeLugar(punto, nombrar ? null : nombreActual));
    if (nombrar) nombrarPunto(punto);
    if (origen) {
      // "Tu punto" ya dice dónde: el mensaje de la búsqueda sobra. Tras una acción de la
      // persona, la vista baja a la respuesta.
      mensaje("");
      $("tu-punto").scrollIntoView({ behavior: SIN_MOVIMIENTO ? "auto" : "smooth", block: "start" });
    }
  };

  colocarMapa();
  // La portada, viva: lo de hoy en la ciudad, al día cada minuto (el recolector avanza de zona).
  zonasDeCuenca = zonas;
  const hoyEnCuenca = () => pintarHoyEnCuenca({ zonas, suspensiones, turnos: turnosFarmacias, agua, avisosAgua, diasFeriado });
  hoyEnCuenca();
  setInterval(() => !document.hidden && hoyEnCuenca(), 60_000);
  actualizarAire();
  // En la leyenda del mapa, "hoy" junto a los días que tocan hoy.
  const diaDeHoy = horaCuenca().diaIso;
  const grupoHoy = [1, 3, 5].includes(diaDeHoy) ? "lmv" : [2, 4, 6].includes(diaDeHoy) ? "mjs" : null;
  if (grupoHoy) {
    document.querySelector(`.leyenda .muestra.${grupoHoy}`)?.parentElement.append(elemento("b", { class: "leyenda-hoy" }, t("leyendaHoy")));
  }
  const mapa = crearMapa(
    zonas,
    (punto) => elegir(punto, t("puntoMapa"), t("puntoMapaNombre"), { nombrar: true }),
    { cargarJson, sinMovimiento: SIN_MOVIMIENTO, centro: puntoDesdeHash(location.hash) ?? leerLugar(leer(CLAVE_ULTIMO_PUNTO)) },
  );
  mapa.marcarHoy(recoleccionDeHoy(zonas).todas);
  // Con la capa del tranvía prendida se ven también sus unidades en camino (estimadas).
  mapa.agregarCapas(bicicletas, estacionesTranvia, {
    trazos: trazadosTranvia(estacionesTranvia),
    horario: horarioTranvia(datosTranvia),
    velocidad: datosTranvia?.velocidad_kmh,
  });
  pintarBasuraManual(basura, diasFeriado);

  $("buscar").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const texto = $("direccion").value.trim();
    if (!texto) return;
    const boton = evento.submitter;
    if (boton) boton.disabled = true;
    mensaje(t("buscando"));
    pintarBusesDeCalle(null);
    try {
      const resultado = await ubicarTexto(texto);
      if (resultado.error) {
        // La respuesta anterior era de otro lugar: se oculta para no confundir.
        $("respuesta").hidden = true;
        $("inicio").hidden = false;
        document.querySelector(".consulta").classList.remove("con-respuesta", "cambiando");
        if (resultado.resaltar) mapa.resaltar(resultado.resaltar);
        mensaje(resultado.error, true);
        pintarBusesDeCalle(resultado.calle, lineas, rutas?.rutas ?? [], mapa);
        if (resultado.reportable) {
          // Si la búsqueda falla con una dirección real, que la persona pueda avisar.
          $("mensaje").append(
            " ",
            elemento(
              "a",
              { href: enlaceCorreoAviso({ asunto: t("avisoAsuntoDireccion", { texto }), cuerpo: t("avisoCuerpoDireccion", { texto }) }) },
              t("reportar"),
            ),
            " ",
            elemento("a", { href: enlaceReporteDireccion(texto), target: "_blank", rel: "noopener" }, t("reportarGithub")),
            ".",
          );
        }
        return;
      }
      elegir(resultado.punto, t("encontrado", { texto: resultado.texto }), resultado.texto);
    } catch {
      mensaje(t("busquedaSinRespuesta"), true);
    } finally {
      if (boton) boton.disabled = false;
    }
  });

  $("ubicarme").addEventListener("click", async () => {
    const boton = $("ubicarme");
    boton.disabled = true;
    mensaje(t("buscandoUbicacion"));
    try {
      const lectura = await miUbicacion();
      const problema = revisarUbicacion(lectura);
      if (problema) {
        mensaje(textoProblemaUbicacion(problema), true);
        return;
      }
      const punto = { lat: lectura.lat, lon: lectura.lon };
      elegir(punto, t("usandoUbicacion"), t("tuUbicacion"), { nombrar: true });
      // Sirve, pero puede no ser la calle exacta: se dice cuánto margen tiene.
      if (lectura.precision > PRECISION_EXACTA_M) {
        mensaje(t("geoAproximada", { margen: formatoDistancia(lectura.precision) }));
      }
    } catch (error) {
      mensaje(error.message, true);
    } finally {
      boton.disabled = false;
    }
  });

  // ¿Qué bus me lleva? Del punto elegido al destino que se escriba.
  $("ruta").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const texto = $("destino").value.trim();
    const aviso = $("ruta-mensaje");
    aviso.classList.remove("error");
    if (!texto || !puntoActual || !lineas) return;
    const boton = evento.submitter;
    if (boton) boton.disabled = true;
    aviso.textContent = t("rutaBuscando");
    try {
      // "Casa" o "Trabajo" son los lugares guardados: no hay que buscarlos.
      const mio = LUGARES.find((clave) => lugares[clave] && nombreLugar(clave).toLowerCase() === texto.toLowerCase());
      const destino = mio
        ? { punto: { lat: lugares[mio].lat, lon: lugares[mio].lon }, texto: lugares[mio].nombre ? `${nombreLugar(mio)} (${lugares[mio].nombre})` : nombreLugar(mio) }
        : await ubicarTexto(texto);
      if (destino.error) {
        // Sin destino válido no queda la ruta anterior dibujada ni su nota.
        quitarRuta();
        aviso.textContent = destino.error;
        aviso.classList.add("error");
        return;
      }
      recorridos ??= prepararLineas(lineas, rutas?.rutas ?? []);
      const opciones = planificar(puntoActual, destino.punto, recorridos);
      if (!opciones.length) {
        quitarRuta();
        aviso.textContent = t("rutaNinguna");
        aviso.classList.add("error");
        return;
      }
      aviso.textContent = t("rutaDestino", { texto: destino.texto });
      pintarOpciones(opciones, destino.punto, mapa, paradas, transporte);
      // Para volver a verla si la página se recarga (en la parada, con el teléfono en el bolsillo).
      guardar(CLAVE_DESTINO, textoDeDestino(texto));
    } catch {
      aviso.textContent = t("busquedaSinRespuesta");
      aviso.classList.add("error");
    } finally {
      if (boton) boton.disabled = false;
    }
  });

  // Navegación por secciones y fichas del resumen.
  $("respuesta").addEventListener("click", irASeccion);
  document.querySelector(".secciones").addEventListener("keydown", pestanasConTeclado);
  // En el celular las pestañas se deslizan de lado: un desvanecido avisa de que hay más.
  const barraPestanas = document.querySelector(".secciones");
  const avisarDeMas = () => {
    const resto = barraPestanas.scrollWidth - barraPestanas.clientWidth - barraPestanas.scrollLeft;
    barraPestanas.classList.toggle("mas-a-la-derecha", resto > 4);
    barraPestanas.classList.toggle("mas-a-la-izquierda", barraPestanas.scrollLeft > 4);
  };
  barraPestanas.addEventListener("scroll", avisarDeMas, { passive: true });
  window.addEventListener("resize", avisarDeMas);
  new ResizeObserver(avisarDeMas).observe(barraPestanas);

  // "Más": se cierra al tocar fuera, con Escape o al usar una de sus acciones que salen de ahí.
  const masAcciones = $("mas-acciones");
  document.addEventListener("pointerdown", (e) => {
    if (masAcciones.open && !masAcciones.contains(e.target)) masAcciones.open = false;
  });
  masAcciones.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !masAcciones.open) return;
    masAcciones.open = false;
    masAcciones.querySelector("summary").focus();
  });
  for (const id of ["whatsapp", "borrar-punto"]) $(id).addEventListener("click", () => (masAcciones.open = false));
  elegirPestana("s-resumen", { desplazar: false });
  $("cambiar-punto").addEventListener("click", () => {
    document.querySelector(".consulta").classList.add("cambiando");
    $("buscar").scrollIntoView({ behavior: SIN_MOVIMIENTO ? "auto" : "smooth", block: "center" });
    $("direccion").focus({ preventScroll: true });
    $("direccion").select();
  });

  // Por WhatsApp, con el mensaje ya escrito: ahí sí sale la tarjeta con la imagen.
  $("whatsapp").addEventListener("click", () => {
    const nombre = nombreProvisional ? null : nombreActual;
    const texto = nombre ? t("compartirTexto", { calle: nombre }) : t("compartirTextoSinCalle");
    window.open(enlaceWhatsApp(texto, location.href), "_blank", "noopener");
  });

  // Compartir tu calle: el menú del teléfono (otras apps) o, si no hay, copiar el enlace.
  let relojCompartir = 0;
  $("compartir").addEventListener("click", async () => {
    const nombre = nombreProvisional ? null : nombreActual;
    const texto = nombre ? t("compartirTexto", { calle: nombre }) : t("compartirTextoSinCalle");
    try {
      // El menú de compartir del sistema, solo donde sirve: en teléfonos y tabletas (pantalla
      // táctil). En una computadora ese menú suele salir vacío; ahí se copia el enlace.
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        // Solo el enlace: si se manda con un texto, WhatsApp lo envía como mensaje normal
        // y no muestra la tarjeta con la imagen.
        await navigator.share({ title: nombre ? `Morlaco: ${nombre}` : "Morlaco", url: location.href });
        return;
      }
      await navigator.clipboard.writeText(`${texto} ${location.href}`);
      // La confirmación, también en el propio botón: es donde se está mirando.
      const rotulo = $("compartir").querySelector("span");
      rotulo.textContent = t("compartirListo");
      $("compartir").classList.add("hecho");
      clearTimeout(relojCompartir);
      relojCompartir = setTimeout(() => {
        rotulo.textContent = t("compartir");
        $("compartir").classList.remove("hecho");
      }, 2500);
    } catch (error) {
      // Cerrar el menú de compartir no es un error.
      if (error?.name !== "AbortError") mensaje(t("compartirError", { enlace: location.href }));
    }
  });

  $("imprimir").addEventListener("click", () => {
    const fecha = new Intl.DateTimeFormat(etiquetaIdioma(), { dateStyle: "long", timeZone: "America/Guayaquil" }).format(new Date());
    $("pie-impresion").textContent = t("pieImpresion", { fecha });
    window.print();
  });

  autocompletar($("direccion"), $("sug-direccion"), () => $("buscar").requestSubmit());
  autocompletar($("destino"), $("sug-destino"), () => $("ruta").requestSubmit());
  // Borrar el destino (con la × del campo o a mano) también lo olvida.
  $("destino").addEventListener("input", () => {
    if (!$("destino").value.trim()) borrar(CLAVE_DESTINO);
  });

  /** La × de un campo: aparece cuando hay algo escrito y lo borra de un toque. */
  const prepararLimpiar = (campo, alLimpiar) => {
    const boton = campo.parentElement.querySelector(".limpiar-campo");
    const actualizar = () => {
      boton.hidden = !campo.value;
    };
    campo.addEventListener("input", actualizar);
    boton.addEventListener("click", () => {
      campo.value = "";
      campo.dispatchEvent(new Event("input", { bubbles: true }));
      alLimpiar?.();
      campo.focus();
    });
    return actualizar;
  };
  const limpiarDireccion = prepararLimpiar($("direccion"));
  // Sin destino, la ruta que se veía también se va, del panel y del mapa.
  const quitarRuta = () => {
    $("ruta-opciones").replaceChildren();
    $("ruta-nota").hidden = true;
    $("ruta-mensaje").textContent = "";
    $("ruta-mensaje").classList.remove("error");
    mapa.dibujarRuta(null);
  };
  const limpiarDestino = prepararLimpiar($("destino"), quitarRuta);

  // "Borrar dirección": olvida el punto, la ruta y el enlace, y vuelve a la portada.
  $("borrar-punto").addEventListener("click", () => {
    // Lo que se va a borrar, por si se toca "Deshacer".
    const antes = { punto: puntoActual, nombre: nombreProvisional ? null : nombreActual, destino: leer(CLAVE_DESTINO) };
    borrar(CLAVE_ULTIMO_PUNTO);
    borrar(CLAVE_DESTINO);
    puntoActual = null;
    zonaActual = null;
    nombreActual = null;
    history.replaceState(history.state, "", location.pathname);
    $("direccion").value = "";
    $("destino").value = "";
    limpiarDireccion();
    limpiarDestino();
    quitarRuta();
    pintarBusesDeCalle(null);
    $("respuesta").hidden = true;
    $("inicio").hidden = false;
    document.querySelector(".consulta").classList.remove("con-respuesta", "cambiando");
    mapa.olvidar();
    mensaje(t("puntoBorrado"));
    // Borrar es definitivo: durante unos segundos se puede volver atrás.
    if (antes.punto) {
      const deshacer = elemento("button", { type: "button", class: "secundario deshacer" }, t("deshacer"));
      deshacer.addEventListener("click", () => {
        if (antes.destino) guardar(CLAVE_DESTINO, antes.destino);
        mensaje("");
        elegir(antes.punto, null, antes.nombre ?? t("puntoGuardado"), { nombrar: !antes.nombre });
      });
      $("mensaje").append(" ", deshacer);
      setTimeout(() => deshacer.remove(), 12_000);
    }
    $("contenido").scrollIntoView({ behavior: SIN_MOVIMIENTO ? "auto" : "smooth", block: "start" });
    $("direccion").focus({ preventScroll: true });
  });

  // "Guardar como Casa / Trabajo": tocar el botón marcado lo quita.
  for (const boton of document.querySelectorAll(".lugar-boton")) {
    boton.addEventListener("click", () => {
      if (!puntoActual) return;
      const clave = boton.dataset.lugar;
      const quitar = lugarDe(puntoActual, lugares) === clave;
      const nombre = nombreProvisional ? null : nombreActual;
      lugares = cambiarLugar(lugares, clave, quitar ? null : puntoActual, nombre);
      guardar(CLAVE_LUGARES, JSON.stringify(lugares));
      pintarPunto();
      pintarLugares();
      pintarAtajos();
    });
  }

  // Los ejemplos rellenan la búsqueda y la lanzan.
  for (const boton of document.querySelectorAll(".ejemplo")) {
    boton.addEventListener("click", () => {
      $("direccion").value = boton.dataset.busqueda;
      limpiarDireccion();
      $("buscar").requestSubmit();
    });
  }

  // Un enlace compartido (#lat,lon) abierto con la página ya cargada.
  // Al abrir, el último punto consultado (con su nombre) o el del enlace.
  const ultimo = leerLugar(leer(CLAVE_ULTIMO_PUNTO));
  const nombreConocido = (punto) => {
    if (ultimo?.nombre && distanciaMetros(punto, ultimo) < 15) return ultimo.nombre;
    const clave = lugarDe(punto, lugares);
    return clave ? lugares[clave].nombre : null;
  };
  const abrir = (punto, provisional) => {
    const nombre = nombreConocido(punto);
    elegir(punto, null, nombre ?? provisional, { nombrar: !nombre });
  };
  window.addEventListener("hashchange", () => {
    const punto = puntoDesdeHash(location.hash);
    if (!punto || (puntoActual && distanciaMetros(punto, puntoActual) < 1)) return;
    abrir(punto, t("puntoEnlace"));
  });
  // Al cerrar el mapa ampliado con "atrás", el historial vuelve a la dirección de cuando se
  // amplió: se deja la del punto de ahora, para no saltar a la calle anterior.
  // El nombre de la calle, también sobre el mapa ampliado: al tocar otra calle ahí, se ve cuál es.
  // "Casa: Cerca de Benigno Malo": la etiqueta del lugar guardado y la calle, separadas.
  const copiarLugar = () =>
    ($("mapa-lugar").textContent = [...$("punto-nombre").childNodes]
      .map((nodo) => nodo.textContent.trim())
      .filter(Boolean)
      .join(": "));
  new MutationObserver(copiarLugar).observe($("punto-nombre"), { childList: true, characterData: true, subtree: true });
  copiarLugar();
  window.addEventListener("morlaco:mapa-cerrado", () => {
    history.replaceState(history.state, "", puntoActual ? hashDesdePunto(puntoActual) : location.pathname);
  });

  pintarLugares();
  const enlace = puntoDesdeHash(location.hash);
  if (enlace) abrir(enlace, ultimo && distanciaMetros(enlace, ultimo) < 15 ? t("puntoGuardado") : t("puntoEnlace"));
  else if (ultimo) abrir({ lat: ultimo.lat, lon: ultimo.lon }, t("puntoGuardado"));
  // Si el enlace pedía una pestaña (?ver=farmacias), se abre esa.
  if (PESTANA_PEDIDA && puntoActual) elegirPestana(`s-${PESTANA_PEDIDA}`, { desplazar: false });
  // Ya se sabe qué mostrar: fuera la espera que puso index.html (sin portada de un instante).
  document.documentElement.classList.remove("abriendo-punto");

  // Y la ruta que se estaba mirando, si fue hace menos de 12 horas.
  const destinoGuardado = leerDestino(leer(CLAVE_DESTINO));
  if (destinoGuardado && puntoActual) {
    $("destino").value = destinoGuardado;
    limpiarDestino();
    $("ruta").requestSubmit();
  } else if (!destinoGuardado) {
    borrar(CLAVE_DESTINO);
  }
}

/** Aviso sin conexión, registro del service worker y botón "Instalar". */
function prepararApp() {
  const aviso = $("sin-conexion");
  const actualizarConexion = () => {
    aviso.hidden = navigator.onLine;
  };
  window.addEventListener("online", actualizarConexion);
  window.addEventListener("offline", actualizarConexion);
  actualizarConexion();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Sin service worker la página funciona igual, solo que no sin conexión.
    });
  }

  // Chrome y Edge ofrecen instalar la app; el botón aparece solo cuando se puede.
  let solicitud = null;
  const boton = $("instalar");
  window.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();
    solicitud = evento;
    boton.hidden = false;
  });
  boton.addEventListener("click", async () => {
    if (!solicitud) return;
    solicitud.prompt();
    await solicitud.userChoice;
    solicitud = null;
    boton.hidden = true;
  });
  window.addEventListener("appinstalled", () => {
    boton.hidden = true;
  });
}

prepararApp();
iniciar();
