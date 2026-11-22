// Lógica pura de la página: sin DOM ni red, para poder probarla con `node --test`.

import { idioma, t } from "./textos.js";

export const CENTRO_CUENCA = { lat: -2.8975, lon: -79.0045 };
// Hasta dónde se mueve el mapa: la ciudad y sus parroquias, con margen alrededor de todos los
// datos (zonas de EMAC, paradas y líneas de bus, lugares cercanos).
export const LIMITES_CUENCA = { sur: -3.14, oeste: -79.22, norte: -2.72, este: -78.8 };


// Cuenca está en UTC-5 todo el año (Ecuador no cambia la hora).
const DESFASE_CUENCA_MS = -5 * 60 * 60 * 1000;

/** Nombre del día en el idioma actual (1 = lunes). */
export function nombreDia(diaIso) {
  return t("dias")[diaIso - 1];
}

/** Día de la semana (1 = lunes), minutos desde medianoche y fecha, en hora de Cuenca. */
export function horaCuenca(fecha = new Date()) {
  const local = new Date(fecha.getTime() + DESFASE_CUENCA_MS);
  const diaSemana = local.getUTCDay();
  return {
    diaIso: diaSemana === 0 ? 7 : diaSemana,
    minutos: local.getUTCHours() * 60 + local.getUTCMinutes(),
    fecha: local.toISOString().slice(0, 10),
  };
}

/**
 * La hora de Cuenca ("06:05") dentro de `minutos`, redondeada a cinco minutos: para decir
 * "hacia las 06:05" cuando falta tanto que una cuenta en minutos no se entiende.
 */
export function horaDentroDe(minutos, fecha = new Date()) {
  const total = Math.round((horaCuenca(fecha).minutos + minutos) / 5) * 5;
  const delDia = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(delDia / 60)).padStart(2, "0")}:${String(delDia % 60).padStart(2, "0")}`;
}

export function aMinutos(hhmm) {
  const [horas, minutos] = hhmm.split(":").map(Number);
  return horas * 60 + minutos;
}

function dentroDeAnillo(lon, lat, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    const cruza = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

function dentroDePoligono(lon, lat, anillos) {
  const [exterior, ...huecos] = anillos;
  return dentroDeAnillo(lon, lat, exterior) && !huecos.some((h) => dentroDeAnillo(lon, lat, h));
}

export function puntoEnGeometria(lon, lat, geometria) {
  if (!geometria) return false;
  if (geometria.type === "Polygon") return dentroDePoligono(lon, lat, geometria.coordinates);
  if (geometria.type === "MultiPolygon") {
    return geometria.coordinates.some((p) => dentroDePoligono(lon, lat, p));
  }
  return false;
}

/** La zona de recolección que contiene el punto, o null si cae fuera de todas. */
export function zonaDe(lon, lat, zonas) {
  return zonas.features.find((z) => puntoEnGeometria(lon, lat, z.geometry)) ?? null;
}

/**
 * Cuándo toca la próxima recolección en una zona.
 * estado: "ahora" (está pasando), "hoy" (más tarde hoy) o "proxima" (otro día).
 */
export function proximaRecoleccion(zona, fecha = new Date()) {
  const { diaIso, minutos } = horaCuenca(fecha);
  const desde = aMinutos(zona.desde);
  const hasta = aMinutos(zona.hasta);
  const dias = zona.dias_iso;
  const reciclaje = zona.dia_reciclaje ? dias[zona.dias.indexOf(zona.dia_reciclaje)] : null;
  const resultado = (estado, dia, enDias) => ({
    estado,
    diaIso: dia,
    enDias,
    desde: zona.desde,
    hasta: zona.hasta,
    conReciclaje: dia === reciclaje,
  });

  if (dias.includes(diaIso)) {
    if (minutos < desde) return resultado("hoy", diaIso, 0);
    if (minutos < hasta) return resultado("ahora", diaIso, 0);
  }
  for (let enDias = 1; enDias <= 7; enDias++) {
    const dia = ((diaIso - 1 + enDias) % 7) + 1;
    if (dias.includes(dia)) return resultado("proxima", dia, enDias);
  }
  return null;
}

/**
 * Minutos que faltan para que empiece la recolección de hoy (estado "hoy") o para que termine
 * (estado "ahora"). null si la próxima no es hoy.
 */
export function faltaRecoleccion(proxima, fecha = new Date()) {
  if (!proxima || (proxima.estado !== "hoy" && proxima.estado !== "ahora")) return null;
  const limite = aMinutos(proxima.estado === "hoy" ? proxima.desde : proxima.hasta);
  return Math.max(0, limite - horaCuenca(fecha).minutos);
}

/**
 * La recolección de hoy en toda la ciudad: por qué zonas pasa ahora, en cuáles falta (con la
 * hora a la que empieza la primera) y en cuáles ya pasó. `todas` son las que tienen recolección hoy.
 */
export function recoleccionDeHoy(zonas, fecha = new Date()) {
  const { diaIso, minutos } = horaCuenca(fecha);
  const hoy = (zonas?.features ?? [])
    .map((f) => f.properties)
    .filter((p) => p.dias_iso.includes(diaIso))
    .sort((a, b) => Number(a.zona) - Number(b.zona));
  const ahora = hoy.filter((p) => minutos >= aMinutos(p.desde) && minutos < aMinutos(p.hasta));
  const luego = hoy.filter((p) => minutos < aMinutos(p.desde));
  return {
    todas: hoy.map((p) => p.zona),
    ahora: ahora.map((p) => p.zona),
    luego: luego.map((p) => p.zona),
    empieza: luego.length ? luego.map((p) => p.desde).sort()[0] : null,
    ya: hoy.filter((p) => minutos >= aMinutos(p.hasta)).map((p) => p.zona),
  };
}

/**
 * Las franjas de recolección de hoy, en el orden en que el recolector recorre la ciudad:
 * { zona, desde, hasta, inicio, fin (minutos del día), estado: "ya" | "ahora" | "luego", lmv }.
 */
export function franjasDeHoy(zonas, fecha = new Date()) {
  const { diaIso, minutos } = horaCuenca(fecha);
  return (zonas?.features ?? [])
    .map((f) => f.properties)
    .filter((p) => p.dias_iso.includes(diaIso))
    .map((p) => {
      const inicio = aMinutos(p.desde);
      const fin = aMinutos(p.hasta);
      return { zona: p.zona, desde: p.desde, hasta: p.hasta, inicio, fin, estado: minutos >= fin ? "ya" : minutos >= inicio ? "ahora" : "luego", lmv: p.dias_iso.includes(1) };
    })
    .sort((a, b) => a.inicio - b.inicio || Number(a.zona) - Number(b.zona));
}

/** "24:00" (o "00:00" como final de una franja) se lee mejor como "medianoche". */
export function horaLegible(hora) {
  return hora === "24:00" || hora === "00:00" ? t("medianoche") : hora;
}

/** "Hoy, de 20:00 a medianoche", "Mañana, de 08:00 a 12:00", "El viernes, de ...". */
export function describirRecoleccion(proxima) {
  const desde = proxima.desde;
  const hasta = horaLegible(proxima.hasta);
  if (proxima.estado === "ahora") {
    return hasta === proxima.hasta ? t("recoleccionAhora", { hasta }) : t("recoleccionAhoraMedianoche");
  }
  if (proxima.estado === "hoy") return t("recoleccionHoy", { desde, hasta });
  if (proxima.enDias === 1) return t("recoleccionManana", { desde, hasta });
  return t("recoleccionDia", { dia: nombreDia(proxima.diaIso), desde, hasta });
}

function normalizar(texto) {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function diasEntre(fechaA, fechaB) {
  return Math.round((Date.parse(fechaB) - Date.parse(fechaA)) / 86_400_000);
}

/**
 * Situación de los cortes de luz programados para hoy.
 * Centro Sur no siempre actualiza su página, así que se informa cuántos días
 * lleva sin publicar para no dar por bueno un "no hay cortes" que puede ser falso.
 */
export function estadoLuz(suspensiones, fecha = new Date()) {
  const hoy = horaCuenca(fecha).fecha;
  const ultima = suspensiones?.metadata?.ultima_publicacion ?? null;
  const publicacionHoy = (suspensiones?.publicaciones ?? []).find((p) => p.fecha === hoy);
  // Cronogramas sueltos (carteles en PDF), del más nuevo al más viejo.
  const otras = (suspensiones?.otras_publicaciones ?? []).filter((o) => o.fecha);
  return {
    hoy,
    ultima,
    diasSinPublicar: ultima ? diasEntre(ultima, hoy) : null,
    publicadoHoy: Boolean(publicacionHoy),
    cortesHoy: publicacionHoy?.cortes ?? [],
    // Un cronograma de hoy o de los próximos días que menciona Cuenca.
    cronograma: otras.find((o) => o.menciona_cuenca && o.fecha >= hoy) ?? null,
    otraReciente: otras[0] ?? null,
    programacion: suspensiones?.metadata?.programacion ?? null,
  };
}

/** Cortes cuya dirección contiene el texto buscado, sin importar tildes ni mayúsculas. */
export function filtrarCortes(cortes, texto) {
  const buscado = normalizar(texto);
  if (!buscado) return cortes;
  return cortes.filter((c) => normalizar(c.direccion).includes(buscado));
}

export function distanciaMetros(a, b) {
  const radio = 6_371_000;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * radio * Math.asin(Math.sqrt(h));
}

/** A más de esto del centro, una ubicación no es de Cuenca (el cantón llega a unos 30 km). */
export const LEJOS_DE_CUENCA_KM = 40;
/** Con un margen mayor, la ubicación no sirve para saber en qué calle está alguien. */
export const PRECISION_MAXIMA_M = 1000;

/**
 * Revisa lo que dio el navegador ({lat, lon, precision} en metros). Devuelve null si sirve,
 * o el problema: muy lejos de Cuenca (típico de la ubicación por la conexión a internet,
 * que en Ecuador suele caer en Quito o Guayaquil) o con demasiado margen de error.
 */
export function revisarUbicacion(lectura) {
  const km = distanciaMetros(lectura, CENTRO_CUENCA) / 1000;
  if (km > LEJOS_DE_CUENCA_KM) return { problema: "lejos", km: Math.round(km) };
  if (lectura.precision > PRECISION_MAXIMA_M) return { problema: "imprecisa", metros: lectura.precision };
  return null;
}

/** El elemento (punto GeoJSON) más cercano, con su distancia en metros, o null si está a más de `maximoMetros`. */
export function masCercano(punto, coleccion, maximoMetros = 1500) {
  let mejor = null;
  for (const f of coleccion?.features ?? []) {
    const [lon, lat] = f.geometry.coordinates;
    const metros = distanciaMetros(punto, { lat, lon });
    if (metros <= maximoMetros && (!mejor || metros < mejor.metros)) {
      mejor = { ...f.properties, lat, lon, metros: Math.round(metros) };
    }
  }
  return mejor;
}

/** Hasta dónde se busca cada tipo de "Cerca de ti": más lejos lo que hay menos. */
export const ALCANCE_CERCA = { wifi: 1500, mercado: 3000, pilas: 2000, guardia: 4000 };

/** Lo más cercano de cada tipo (WiFi, mercado, pilas, Guardia), en ese orden; omite lo que queda lejos. */
export function cercanosPorTipo(punto, coleccion) {
  return Object.entries(ALCANCE_CERCA).flatMap(([tipo, maximo]) => {
    const deTipo = { features: (coleccion?.features ?? []).filter((f) => f.properties.tipo === tipo) };
    const cercano = masCercano(punto, deTipo, maximo);
    return cercano ? [cercano] : [];
  });
}

/**
 * Las paradas más cercanas a un punto, con su distancia en metros. Las paradas
 * con el mismo nombre (una a cada lado de la calle) cuentan una sola vez.
 */
export function paradasCercanas(punto, paradas, cantidad = 3, maximoMetros = 1500) {
  const vistas = new Set();
  return paradas.features
    .map((p) => {
      const [lon, lat] = p.geometry.coordinates;
      return { ...p.properties, lon, lat, metros: Math.round(distanciaMetros(punto, { lat, lon })) };
    })
    .filter((p) => p.metros <= maximoMetros)
    .sort((a, b) => a.metros - b.metros)
    .filter((p) => {
      const nombre = normalizar(p.ubicacion);
      if (nombre && vistas.has(nombre)) return false;
      vistas.add(nombre);
      return true;
    })
    .slice(0, cantidad);
}

const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "a", "en"]);
const SIGLAS = new Set(["av", "av.", "cdla", "cdla."]);

/**
 * Las fuentes escriben las direcciones en mayúsculas. Esto las deja legibles:
 * "CALLE GASPAR SANGURIMA INTERSECCION LUIS CORDERO" -> "Calle Gaspar Sangurima y Luis Cordero".
 */
export function direccionLegible(texto) {
  return (texto ?? "")
    .trim()
    .replace(/\s+INTERSECCI[OÓ]N\s+/gi, " y ")
    .replace(/\bCALLE\s+(?=AV\b|AVENIDA\b)/gi, "")
    .toLowerCase()
    .split(/\s+/)
    .map((palabra, i) => {
      if (i > 0 && MINUSCULAS.has(palabra)) return palabra;
      if (SIGLAS.has(palabra)) return palabra[0].toUpperCase() + palabra.slice(1);
      return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    })
    .join(" ");
}

/** El nombre de una parada: el que viene pulido en los datos o, si no, su dirección. */
export function nombreParada(parada) {
  return parada.nombre || direccionLegible(parada.ubicacion);
}

export const VERSION_CALENDARIOS = 2;

const REPORTES = "https://github.com/NezuSas/morlaco/issues/new";

/** A este correo llegan los avisos de quien no tiene cuenta de GitHub. */
export const CORREO_AVISOS = "nezu.ec@nezuecuador.com";

/**
 * Enlace que abre el correo de la persona con el aviso ya empezado: el asunto dice qué
 * falla y el cuerpo, qué escribió o en qué página estaba. Nada se envía hasta que ella lo mande.
 */
export function enlaceCorreoAviso({ asunto, cuerpo }) {
  const parametros = [`subject=${encodeURIComponent(asunto)}`, `body=${encodeURIComponent(cuerpo)}`];
  return `mailto:${CORREO_AVISOS}?${parametros.join("&")}`;
}

/**
 * Enlace que abre WhatsApp con el mensaje ya escrito, para elegir a quién mandarlo.
 * Así el enlace pasa por la caja de escritura, donde WhatsApp arma la tarjeta con la imagen
 * (por el menú de compartir del teléfono lo envía directo, sin tarjeta).
 */
export function enlaceWhatsApp(texto, enlace) {
  return `https://wa.me/?text=${encodeURIComponent(`${texto}\n${enlace}`)}`;
}

/** Enlace a la plantilla "No encuentra mi dirección", con lo escrito ya rellenado. */
export function enlaceReporteDireccion(texto) {
  const parametros = new URLSearchParams({ template: "direccion.yml", title: `Dirección: ${texto}`, escribi: texto });
  return `${REPORTES}?${parametros}`;
}


/**
 * Enlaces para suscribirse al calendario de recolección de una zona.
 * `base` es la dirección de la página; los .ics están en ../datos/ respecto a web/.
 */
/** Los enlaces para suscribirse a un calendario de datos/ (agua/cortes.ics, feriados/feriados.ics…). */
export function enlacesCalendarioAgua(base, ruta = "agua/cortes.ics") {
  const archivo = new URL(`../datos/${ruta}`, base).href;
  const webcal = archivo.replace(/^https?:/, "webcal:");
  return { archivo, webcal, google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}` };
}

export function enlacesCalendario(zona, base) {
  // Google Calendar guarda una copia de cada dirección durante horas. Al cambiar el
  // aspecto de los calendarios se sube esta versión para que las suscripciones nuevas
  // lean el archivo actual (GitHub Pages sirve el mismo archivo con o sin "?v=").
  const archivo = new URL(
    `../datos/recoleccion/calendarios/zona-${zona}.ics?v=${VERSION_CALENDARIOS}`,
    base,
  ).href;
  const webcal = archivo.replace(/^https?:/, "webcal:");
  return {
    archivo,
    webcal,
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
  };
}

/** "350 m", "1,2 km" (en inglés, "1.2 km"). */
export function formatoDistancia(metros) {
  if (metros < 1000) return `${Math.round(metros / 10) * 10} m`;
  const km = (metros / 1000).toFixed(1);
  return `${idioma() === "en" ? km : km.replace(".", ",")} km`;
}

/**
 * La distancia a una parada o una línea: por debajo de 20 m, "menos de 20 m" (no todas las
 * paradas están en la esquina exacta, y "0 m" parecía un error).
 */
export function distanciaParada(metros) {
  return metros < 20 ? t("menosDe20") : formatoDistancia(metros);
}

/** Minutos a pie, a 4,5 km/h (75 m por minuto, la misma cuenta de las rutas). Al menos 1. */
export function minutosAPie(metros) {
  return Math.max(1, Math.round(metros / 75));
}

/**
 * Un teléfono de Ecuador escrito siempre igual: "07 283 6686" (fijo, con su código) o
 * "099 642 8652" (celular), y el número para marcar (+593...). Acepta lo que publican las
 * fuentes: sin código de Cuenca, celular sin el 0, con +593. Si no lo reconoce, devuelve null.
 */
export function telefono(texto) {
  let d = String(texto ?? "").replace(/\D/g, "");
  if (d.startsWith("593")) d = `0${d.slice(3)}`;
  if (d.length === 7) d = `07${d}`; // fijo de Cuenca sin el código
  else if (d.length === 8 && /^[2-7]/.test(d)) d = `0${d}`; // fijo con código pero sin el 0
  else if (d.length === 9 && d.startsWith("9")) d = `0${d}`; // celular sin el 0
  if (/^0[2-7]\d{7}$/.test(d)) return { texto: `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`, marcar: `+593${d.slice(1)}` };
  if (/^09\d{8}$/.test(d)) return { texto: `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`, marcar: `+593${d.slice(1)}` };
  return null;
}

/** Lee "#-2.89733,-79.00454" (lat,lon). Devuelve null si no es un punto válido. */
export function puntoDesdeHash(hash) {
  const coincidencia = /^#?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(hash ?? "");
  if (!coincidencia) return null;
  const lat = Number(coincidencia[1]);
  const lon = Number(coincidencia[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function hashDesdePunto({ lat, lon }) {
  return `#${lat.toFixed(5)},${lon.toFixed(5)}`;
}

/**
 * El turno de farmacias vigente: cada turno va de las 06:00 del día de inicio a las
 * 06:00 del día final, en hora de Cuenca. Devuelve null si no hay ninguno publicado.
 */
export function turnoActual(turnos, fecha = new Date()) {
  const { fecha: hoy, minutos } = horaCuenca(fecha);
  const ahora = `${hoy}T${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
  return (turnos ?? []).find((t) => `${t.inicio}T06:00` <= ahora && ahora < `${t.fin}T06:00`) ?? null;
}

/**
 * Los cortes de agua confirmados (datos/manual/agua.json) que aún no terminan, del más
 * próximo al más lejano. Uno de hoy deja de contar cuando pasa su hora de fin.
 */
export function cortesAgua(datos, fecha = new Date()) {
  const { fecha: hoy, minutos } = horaCuenca(fecha);
  return (datos?.cortes ?? [])
    .filter((c) => c.fecha > hoy || (c.fecha === hoy && (!c.hasta || minutos < aMinutos(c.hasta))))
    .sort((a, b) => (a.fecha + (a.desde ?? "")).localeCompare(b.fecha + (b.desde ?? "")));
}

/**
 * Los avisos de corte de agua que se muestran sin esperar a que alguien los revise
 * (datos/agua/avisos.json): citan a ETAPA, nadie los ha confirmado ni descartado
 * (datos/manual/agua.json) y su corte no ha pasado. La fecha y el horario se leen de la nota
 * automáticamente; si no hay fecha, el aviso vale hasta dos días después de publicarse.
 */
export function avisosAguaPorConfirmar(avisos, confirmados, fecha = new Date()) {
  const { fecha: hoy, minutos } = horaCuenca(fecha);
  const limite = horaCuenca(new Date(fecha.getTime() - 2 * 86_400_000)).fecha;
  const revisados = new Set([
    ...(confirmados?.cortes ?? []).map((c) => c.fuente?.url),
    ...(confirmados?.descartados ?? []).map((d) => d.enlace),
  ]);
  return (avisos?.avisos ?? [])
    .filter((a) => a.menciona_etapa && a.enlace && !revisados.has(a.enlace))
    .filter((a) => (a.fecha ? a.fecha > hoy || (a.fecha === hoy && (!a.hasta || minutos < aMinutos(a.hasta))) : (a.publicado ?? "") >= limite))
    .sort((a, b) => (a.fecha ?? a.publicado ?? "").localeCompare(b.fecha ?? b.publicado ?? ""));
}

/**
 * El próximo día de descanso (datos/manual/feriados.json) desde hoy, en hora de Cuenca,
 * si cae dentro de los próximos `maximoDias`. Devuelve { dia, hasta, faltan } (faltan = 0 si es
 * hoy) o null. Los días seguidos con el mismo nombre (Carnaval) se cuentan como uno.
 */
export function proximoFeriado(datos, fecha = new Date(), maximoDias = 21) {
  const { fecha: hoy } = horaCuenca(fecha);
  const dias = (datos?.dias ?? []).filter((d) => d.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!dias.length) return null;
  const faltan = diasEntre(hoy, dias[0].fecha);
  if (faltan > maximoDias) return null;
  const seguidos = [dias[0]];
  for (const d of dias.slice(1)) {
    if (d.es !== dias[0].es || diasEntre(seguidos.at(-1).fecha, d.fecha) !== 1) break;
    seguidos.push(d);
  }
  return { dia: dias[0], hasta: seguidos.at(-1).fecha, faltan };
}

/** Farmacias cuyo nombre o dirección contiene el texto, sin importar tildes ni mayúsculas. */
export function filtrarFarmacias(farmacias, texto) {
  const buscado = normalizar(texto);
  if (!buscado) return farmacias;
  return farmacias.filter((f) => normalizar(`${f.nombre} ${f.direccion}`).includes(buscado));
}

/**
 * Los avisos de prensa (cierres de vías, cortes de luz) que todavía vienen al caso: los que
 * tienen fecha de hoy en adelante o, si la nota no la dice, los publicados en los últimos
 * `dias`. Con `campo`, solo los que lo traen en true (los que citan a la empresa, por ejemplo).
 * Del más próximo al más lejano.
 */
export function avisosDePrensaVigentes(datos, fecha = new Date(), { dias = 2, campo = null } = {}) {
  const hoy = horaCuenca(fecha).fecha;
  const limite = horaCuenca(new Date(fecha.getTime() - dias * 86_400_000)).fecha;
  return (datos?.avisos ?? [])
    .filter((a) => (!campo || a[campo]) && (a.fecha ? a.fecha >= hoy : (a.publicado ?? "") >= limite))
    .sort((a, b) => (a.fecha ?? a.publicado ?? "").localeCompare(b.fecha ?? b.publicado ?? ""));
}

const DIAS_OSM = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * El horario de OpenStreetMap (la etiqueta opening_hours: "Mo-Sa 08:00-20:00; Su 09:00-13:00")
 * como siete listas de tramos en minutos, de lunes a domingo; un tramo que pasa la medianoche
 * termina después de 1440. null si trae algo que no se entiende (feriados, "08:00+", meses…):
 * mejor no decir nada que equivocarse.
 */
function leerHorarioOsm(texto) {
  const limpio = (texto ?? "").trim();
  if (!limpio) return null;
  if (limpio === "24/7") return DIAS_OSM.map(() => [[0, 1440]]);
  const semana = DIAS_OSM.map(() => []);
  // Las reglas van separadas por ";" (o por ", " antes de otros días).
  const reglas = limpio.split(/\s*;\s*|,\s+(?=(?:Mo|Tu|We|Th|Fr|Sa|Su)\b)/).filter(Boolean);
  for (const regla of reglas) {
    const partes = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?,?)+)?\s*(.+)$/.exec(regla);
    if (!partes) return null;
    const dias = [];
    for (const grupo of (partes[1] ?? "Mo-Su").split(",").filter(Boolean)) {
      const [desde, hasta = desde] = grupo.split("-").map((d) => DIAS_OSM.indexOf(d));
      for (let i = desde; ; i = (i + 1) % 7) {
        dias.push(i);
        if (i === hasta) break;
      }
    }
    const horas = partes[2].trim();
    let tramos = [];
    if (!/^(off|closed)$/.test(horas)) {
      for (const tramo of horas.split(",")) {
        const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(tramo.trim());
        if (!m) return null;
        const inicio = Number(m[1]) * 60 + Number(m[2]);
        let fin = Number(m[3]) * 60 + Number(m[4]);
        if (fin <= inicio) fin += 1440;
        tramos.push([inicio, fin]);
      }
    }
    // Como en OpenStreetMap, una regla posterior reemplaza a la anterior en sus días.
    for (const d of dias) semana[d] = tramos;
    tramos = null;
  }
  return semana;
}

/**
 * ¿Está abierta ahora, según su horario de OpenStreetMap? { abierto: true, cierra, siempre } o
 * { abierto: false, abre, manana } (abre es null si no abre ni hoy ni mañana). null si no hay
 * horario o no se entiende.
 */
export function estadoHorarioOsm(texto, fecha = new Date()) {
  const semana = leerHorarioOsm(texto);
  if (!semana) return null;
  if (texto.trim() === "24/7") return { abierto: true, cierra: null, siempre: true };
  const { diaIso, minutos } = horaCuenca(fecha);
  const hoy = diaIso - 1;
  const ayer = (hoy + 6) % 7;
  const hora = (m) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const abiertoHoy = semana[hoy].find(([a, b]) => a <= minutos && minutos < b);
  if (abiertoHoy) return { abierto: true, cierra: hora(abiertoHoy[1]), siempre: false };
  const deAyer = semana[ayer].find(([, b]) => b > 1440 && minutos < b - 1440);
  if (deAyer) return { abierto: true, cierra: hora(deAyer[1]), siempre: false };
  const luego = semana[hoy].filter(([a]) => a > minutos).sort((x, y) => x[0] - y[0])[0];
  if (luego) return { abierto: false, abre: hora(luego[0]), manana: false };
  const manana = [...semana[(hoy + 1) % 7]].sort((x, y) => x[0] - y[0])[0];
  return { abierto: false, abre: manana ? hora(manana[0]) : null, manana: Boolean(manana) };
}

/**
 * De noche (de las 21:00 a las 07:00, hora de Cuenca) casi todas las farmacias cierran y las que
 * cuentan son las de turno; de día, cualquiera cercana sirve.
 */
export function esDeNoche(fecha = new Date()) {
  const { minutos } = horaCuenca(fecha);
  return minutos >= 21 * 60 || minutos < 7 * 60;
}

/**
 * Las farmacias de OpenStreetMap (datos/ciudad/farmacias.json) más cercanas al punto, con su
 * distancia y su estado de ahora si tienen horario: [{ ...farmacia, metros, estado }]. Las que
 * se sabe que están cerradas van al final. Con `soloAbiertas`, solo las que se sabe abiertas.
 */
export function farmaciasCerca(punto, datos, { maximo = 5, maximoMetros = 1500, soloAbiertas = false, fecha = new Date() } = {}) {
  return (datos?.farmacias ?? [])
    .map((f) => ({ ...f, metros: Math.round(distanciaMetros(punto, f)), estado: estadoHorarioOsm(f.horario, fecha) }))
    .filter((f) => f.metros <= maximoMetros && (!soloAbiertas || f.estado?.abierto))
    .sort((a, b) => Number(a.estado?.abierto === false) - Number(b.estado?.abierto === false) || a.metros - b.metros)
    .slice(0, maximo);
}

/**
 * ¿Es esta farmacia de OpenStreetMap una de las de turno? La de turno está en la esquina de su
 * dirección (aproximada), así que basta con que se llamen parecido y estén a menos de 200 m.
 * Conviene pasar solo las de turno ubicadas en su esquina exacta: con las cadenas, una ubicada
 * "por esa zona" podría confundirse con otro local.
 */
export function esLaDeTurno(farmacia, turno) {
  const clave = (n) => normalizar(n).replace(/\bfarmacias?\b|\bde\b|[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const nombre = clave(farmacia.nombre);
  if (!nombre) return false;
  return turno.some((f) => f.lugar && distanciaMetros(farmacia, f.lugar) < 200 && (clave(f.nombre).includes(nombre) || nombre.includes(clave(f.nombre))));
}

/**
 * ¿Está abierto ahora un lugar cuyo horario dice "De 08:00 a 18:00"? Devuelve { abierto, abre,
 * cierra } o null si el texto no trae un horario así (no se adivina).
 */
export function estadoHorario(texto, fecha = new Date()) {
  const horas = /(\d{1,2})[:h](\d{2})\D+(\d{1,2})[:h](\d{2})/.exec(texto ?? "");
  if (!horas) return null;
  const abre = `${horas[1].padStart(2, "0")}:${horas[2]}`;
  const cierra = `${horas[3].padStart(2, "0")}:${horas[4]}`;
  const { minutos } = horaCuenca(fecha);
  return { abierto: minutos >= aMinutos(abre) && minutos < aMinutos(cierra), abre, cierra };
}
