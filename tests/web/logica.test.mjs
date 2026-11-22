import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  describirRecoleccion,
  direccionLegible,
  horaLegible,
  nombreParada,
  cercanosPorTipo,
  avisosAguaPorConfirmar,
  cortesAgua,
  enlaceCorreoAviso,
  enlaceReporteDireccion,
  enlaceWhatsApp,
  enlacesCalendario,
  estadoLuz,
  faltaRecoleccion,
  franjasDeHoy,
  recoleccionDeHoy,
  filtrarCortes,
  distanciaParada,
  formatoDistancia,
  minutosAPie,
  telefono,
  hashDesdePunto,
  masCercano,
  filtrarFarmacias,
  turnoActual,
  horaCuenca,
  horaDentroDe,
  paradasCercanas,
  proximaRecoleccion,
  proximoFeriado,
  puntoDesdeHash,
  puntoEnGeometria,
  revisarUbicacion,
  VERSION_CALENDARIOS,
  zonaDe,
} from "../../web/logica.js";

// Hora de Cuenca = UTC-5. Esta fecha es el lunes 9 de noviembre de 2026 a las 10:00 en Cuenca.
const lunes10h = new Date("2026-11-09T15:00:00Z");
const enCuenca = (iso) => new Date(`${iso}-05:00`);

const zonaLMV = {
  dias: ["lunes", "miércoles", "viernes"],
  dias_iso: [1, 3, 5],
  desde: "20:00",
  hasta: "24:00",
  dia_reciclaje: "miércoles",
};

test("horaCuenca usa UTC-5 aunque el equipo esté en otra zona horaria", () => {
  assert.deepEqual(horaCuenca(lunes10h), { diaIso: 1, minutos: 600, fecha: "2026-11-09" });
  // Domingo 23:30 en Cuenca ya es lunes en UTC.
  assert.deepEqual(horaCuenca(new Date("2026-11-09T04:30:00Z")), {
    diaIso: 7,
    minutos: 1410,
    fecha: "2026-11-08",
  });
});

test("proximaRecoleccion: hoy más tarde, pasando ahora y otro día", () => {
  assert.equal(proximaRecoleccion(zonaLMV, lunes10h).estado, "hoy");
  assert.equal(proximaRecoleccion(zonaLMV, enCuenca("2026-11-09T21:00")).estado, "ahora");

  const despues = proximaRecoleccion(zonaLMV, enCuenca("2026-11-09T23:59:30"));
  assert.equal(despues.estado, "ahora");

  const martes = proximaRecoleccion(zonaLMV, enCuenca("2026-11-10T09:00"));
  assert.deepEqual(
    { estado: martes.estado, diaIso: martes.diaIso, enDias: martes.enDias },
    { estado: "proxima", diaIso: 3, enDias: 1 },
  );
});

test("proximaRecoleccion salta el fin de semana y marca el día de reciclaje", () => {
  const sabado = proximaRecoleccion(zonaLMV, enCuenca("2026-11-14T12:00"));
  assert.equal(sabado.diaIso, 1);
  assert.equal(sabado.enDias, 2);
  assert.equal(sabado.conReciclaje, false);
  assert.equal(proximaRecoleccion(zonaLMV, enCuenca("2026-11-11T08:00")).conReciclaje, true);
});

test("describirRecoleccion", () => {
  const base = { desde: "08:00", hasta: "12:00" };
  assert.equal(describirRecoleccion({ ...base, estado: "hoy", enDias: 0 }), "Hoy, de 08:00 a 12:00");
  assert.equal(
    describirRecoleccion({ ...base, estado: "ahora", enDias: 0 }),
    "Pasando ahora, hasta las 12:00",
  );
  assert.equal(
    describirRecoleccion({ ...base, estado: "proxima", enDias: 1, diaIso: 2 }),
    "Mañana, de 08:00 a 12:00",
  );
  assert.equal(
    describirRecoleccion({ ...base, estado: "proxima", enDias: 3, diaIso: 6 }),
    "El sábado, de 08:00 a 12:00",
  );
  const noche = { desde: "20:00", hasta: "24:00" };
  assert.equal(describirRecoleccion({ ...noche, estado: "hoy", enDias: 0 }), "Hoy, de 20:00 a medianoche");
  assert.equal(describirRecoleccion({ ...noche, estado: "ahora", enDias: 0 }), "Pasando ahora, hasta la medianoche");
});

test("horaLegible y nombreParada", () => {
  assert.equal(horaLegible("24:00"), "medianoche");
  assert.equal(horaLegible("18:30"), "18:30");
  assert.equal(nombreParada({ nombre: "Av. España y Sevilla", ubicacion: "AV ESPANA INTERSECCION SEVILLA" }), "Av. España y Sevilla");
  assert.equal(nombreParada({ ubicacion: "CALLE AV. LOJA INTERSECCION ROTARY" }), "Av. Loja y Rotary");
});

test("puntoEnGeometria respeta los huecos y los multipolígonos", () => {
  const exterior = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const hueco = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
  const poligono = { type: "Polygon", coordinates: [exterior, hueco] };
  assert.equal(puntoEnGeometria(1, 1, poligono), true);
  assert.equal(puntoEnGeometria(5, 5, poligono), false);
  assert.equal(puntoEnGeometria(11, 5, poligono), false);
  const multi = { type: "MultiPolygon", coordinates: [[hueco], [exterior.map(([x, y]) => [x + 20, y])]] };
  assert.equal(puntoEnGeometria(25, 5, multi), true);
});

test("zonaDe con los datos reales: el Parque Calderón está en la zona 4", () => {
  const zonas = JSON.parse(readFileSync(new URL("../../datos/recoleccion/zonas.geojson", import.meta.url)));
  assert.equal(zonaDe(-79.00454, -2.89733, zonas).properties.zona, 4);
  assert.equal(zonaDe(-78.5, -0.2, zonas), null); // Quito
});

test("estadoLuz informa cuántos días lleva Centro Sur sin publicar", () => {
  const suspensiones = {
    metadata: { ultima_publicacion: "2026-11-07" },
    publicaciones: [{ fecha: "2026-11-07", cortes: [{ direccion: "X" }] }],
  };
  const estado = estadoLuz(suspensiones, lunes10h);
  assert.equal(estado.hoy, "2026-11-09");
  assert.equal(estado.diasSinPublicar, 2);
  assert.equal(estado.publicadoHoy, false);
  assert.deepEqual(estado.cortesHoy, []);

  const hoy = estadoLuz({ ...suspensiones, publicaciones: [{ fecha: "2026-11-09", cortes: [1] }] }, lunes10h);
  assert.equal(hoy.publicadoHoy, true);
  assert.deepEqual(hoy.cortesHoy, [1]);
  assert.equal(estadoLuz(null, lunes10h).ultima, null);
});

test("estadoLuz distingue los cronogramas sueltos que mencionan Cuenca", () => {
  const morona = { pdf: "m.pdf", fecha: "2026-10-28", provincias: ["Morona Santiago"], menciona_cuenca: false };
  const pasado = { pdf: "p.pdf", fecha: "2026-11-02", provincias: ["Azuay"], menciona_cuenca: true };
  const proximo = { pdf: "c.pdf", fecha: "2026-11-12", provincias: ["Azuay"], menciona_cuenca: true };
  const base = { metadata: { ultima_publicacion: "2026-07-08", programacion: "prog" }, publicaciones: [] };

  const soloMorona = estadoLuz({ ...base, otras_publicaciones: [morona] }, lunes10h);
  assert.equal(soloMorona.cronograma, null);
  assert.equal(soloMorona.otraReciente, morona);
  assert.equal(soloMorona.programacion, "prog");
  // Uno que ya pasó no cuenta; uno de los próximos días, sí.
  assert.equal(estadoLuz({ ...base, otras_publicaciones: [pasado, morona] }, lunes10h).cronograma, null);
  assert.equal(estadoLuz({ ...base, otras_publicaciones: [proximo, pasado] }, lunes10h).cronograma, proximo);
});

test("filtrarCortes ignora tildes y mayúsculas", () => {
  const cortes = [{ direccion: "AV. DE LAS AMÉRICAS Y NICANOR MERCHÁN" }, { direccion: "SANTA MARIANITA" }];
  assert.equal(filtrarCortes(cortes, "americas").length, 1);
  assert.equal(filtrarCortes(cortes, "  ").length, 2);
});

test("paradasCercanas ordena por distancia y descarta las lejanas", () => {
  const parada = (id, lon, lat) => ({ properties: { id }, geometry: { coordinates: [lon, lat] } });
  const paradas = {
    features: [parada(1, -79.01, -2.9), parada(2, -79.0046, -2.8974), parada(3, -78.9, -2.8)],
  };
  const cercanas = paradasCercanas({ lat: -2.8975, lon: -79.0045 }, paradas);
  assert.deepEqual(cercanas.map((p) => p.id), [2, 1]);
  assert.ok(cercanas[0].metros < 30);
});

test("paradasCercanas cuenta una vez las paradas con el mismo nombre", () => {
  const parada = (id, lat) => ({
    properties: { id, ubicacion: id < 3 ? "AV SOLANO" : "OTRA" },
    geometry: { coordinates: [-79.0045, lat] },
  });
  const paradas = { features: [parada(1, -2.8976), parada(2, -2.8977), parada(3, -2.898)] };
  assert.deepEqual(
    paradasCercanas({ lat: -2.8975, lon: -79.0045 }, paradas).map((p) => p.id),
    [1, 3],
  );
});

test("direccionLegible pasa de mayúsculas a nombre propio", () => {
  assert.equal(
    direccionLegible("CALLE GASPAR SANGURIMA INTERSECCION LUIS CORDERO"),
    "Calle Gaspar Sangurima y Luis Cordero",
  );
  assert.equal(
    direccionLegible("AV. DE LAS AMÉRICAS Y NICANOR MERCHÁN"),
    "Av. de las Américas y Nicanor Merchán",
  );
  assert.equal(direccionLegible("12 DE ABRIL 5-99"), "12 de Abril 5-99");
  assert.equal(direccionLegible(undefined), "");
});

test("enlacesCalendario apunta al .ics de la zona y lo ofrece por webcal y Google", () => {
  const enlaces = enlacesCalendario(4, "https://nezusas.github.io/morlaco/web/#-2.9,-79.0");
  const ruta = `nezusas.github.io/morlaco/datos/recoleccion/calendarios/zona-4.ics?v=${VERSION_CALENDARIOS}`;
  assert.equal(enlaces.archivo, `https://${ruta}`);
  assert.equal(enlaces.webcal, `webcal://${ruta}`);
  assert.equal(
    enlaces.google,
    `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(`webcal://${ruta}`)}`,
  );
  // El parámetro de versión se mantiene dentro del cid y no rompe la dirección de Google.
  assert.ok(enlaces.google.includes("zona-4.ics%3Fv%3D"));
});

test("cercanosPorTipo: lo más cercano de cada tipo, dentro de su alcance", () => {
  const punto = (tipo, nombre, lon, lat) => ({ type: "Feature", properties: { tipo, nombre }, geometry: { type: "Point", coordinates: [lon, lat] } });
  const coleccion = {
    features: [
      punto("wifi", "lejos", -79.0, -2.92),
      punto("wifi", "cerca", -79.0, -2.9005),
      punto("mercado", "10 de Agosto", -79.0075, -2.8999),
      punto("guardia", "Barranco", -79.0052, -2.9016),
      punto("pilas", "en Ricaurte", -78.96, -2.86), // a más de 2 km: no cuenta
    ],
  };
  const cerca = cercanosPorTipo({ lat: -2.9, lon: -79.0 }, coleccion);
  assert.deepEqual(cerca.map((c) => `${c.tipo}:${c.nombre}`), ["wifi:cerca", "mercado:10 de Agosto", "guardia:Barranco"]);
  assert.ok(cerca[0].metros < 100);
  assert.deepEqual(cercanosPorTipo({ lat: -2.9, lon: -79.0 }, null), []);
});

test("cortesAgua: los de hoy hasta su hora de fin y los próximos, en orden", () => {
  const corte = (fecha, desde, hasta) => ({ fecha, desde, hasta, es: { sectores: fecha }, fuente: {} });
  const datos = { cortes: [corte("2026-11-12", "09:00", "17:00"), corte("2026-11-10", "08:00", "12:00"), corte("2026-11-09", "09:00", "17:00"), corte("2026-11-10", "13:00", "18:00")] };
  const a_las_10 = new Date("2026-11-10T10:00:00-05:00");
  assert.deepEqual(cortesAgua(datos, a_las_10).map((c) => `${c.fecha} ${c.desde}`), ["2026-11-10 08:00", "2026-11-10 13:00", "2026-11-12 09:00"]);
  const a_las_14 = new Date("2026-11-10T14:00:00-05:00");
  assert.deepEqual(cortesAgua(datos, a_las_14).map((c) => `${c.fecha} ${c.desde}`), ["2026-11-10 13:00", "2026-11-12 09:00"]);
  assert.deepEqual(cortesAgua(null), []);
});

test("enlaceCorreoAviso abre un correo con el asunto y el cuerpo ya escritos", () => {
  const enlace = enlaceCorreoAviso({ asunto: "Morlaco no encuentra: Sucre & Borrero", cuerpo: "Escribí “Sucre”.\n¿Dónde queda?" });
  const url = new URL(enlace);
  assert.equal(url.protocol, "mailto:");
  assert.equal(url.pathname, "nezu.ec@nezuecuador.com");
  // Sin "+" en lugar de espacios: algunos programas de correo los muestran tal cual.
  assert.ok(!enlace.includes("+"), enlace);
  assert.equal(url.searchParams.get("subject"), "Morlaco no encuentra: Sucre & Borrero");
  assert.equal(url.searchParams.get("body"), "Escribí “Sucre”.\n¿Dónde queda?");
});

test("enlaceWhatsApp lleva el texto y el enlace completo, con su punto", () => {
  const enlace = enlaceWhatsApp("Mira qué pasa hoy en Sucre y Borrero.", "https://nezusas.github.io/morlaco/web/#-2.89826,-79.00314");
  const url = new URL(enlace);
  assert.equal(url.origin + url.pathname, "https://wa.me/");
  // El "#" va codificado: si no, WhatsApp recibiría el enlace cortado, sin el punto.
  assert.equal(url.hash, "");
  assert.equal(
    url.searchParams.get("text"),
    "Mira qué pasa hoy en Sucre y Borrero.\nhttps://nezusas.github.io/morlaco/web/#-2.89826,-79.00314",
  );
});

test("enlaceReporteDireccion rellena la plantilla con lo escrito", () => {
  const url = new URL(enlaceReporteDireccion("Sucre y Borrero"));
  assert.equal(url.origin + url.pathname, "https://github.com/NezuSas/morlaco/issues/new");
  assert.equal(url.searchParams.get("template"), "direccion.yml");
  assert.equal(url.searchParams.get("escribi"), "Sucre y Borrero");
  assert.equal(url.searchParams.get("title"), "Dirección: Sucre y Borrero");
});

test("masCercano devuelve el punto más próximo dentro del límite", () => {
  const punto = (nombre, lon, lat) => ({ properties: { nombre }, geometry: { coordinates: [lon, lat] } });
  const estaciones = { features: [punto("Lejos", -79.05, -2.95), punto("Cerca", -79.0046, -2.8976)] };
  const cercana = masCercano({ lat: -2.8975, lon: -79.0045 }, estaciones);
  assert.equal(cercana.nombre, "Cerca");
  assert.ok(cercana.metros < 30);
  assert.equal(masCercano({ lat: -2.8, lon: -78.9 }, estaciones), null);
  assert.equal(masCercano({ lat: -2.8, lon: -78.9 }, null), null);
});

test("formatoDistancia", () => {
  assert.equal(formatoDistancia(347), "350 m");
  assert.equal(formatoDistancia(1240), "1,2 km");
});

test("hash de la URL ida y vuelta", () => {
  const punto = { lat: -2.89733, lon: -79.00454 };
  assert.deepEqual(puntoDesdeHash(hashDesdePunto(punto)), punto);
  assert.equal(puntoDesdeHash("#hola"), null);
  assert.equal(puntoDesdeHash("#100,0"), null);
});

test("turnoActual cambia a las 06:00 de Cuenca", () => {
  const turnos = [
    { inicio: "2026-11-07", fin: "2026-11-14", farmacias: ["a"] },
    { inicio: "2026-11-14", fin: "2026-11-21", farmacias: ["b"] },
  ];
  const enCuencaHora = (iso) => new Date(`${iso}-05:00`);
  assert.equal(turnoActual(turnos, enCuencaHora("2026-11-09T22:00")).farmacias[0], "a");
  assert.equal(turnoActual(turnos, enCuencaHora("2026-11-14T05:59")).farmacias[0], "a");
  assert.equal(turnoActual(turnos, enCuencaHora("2026-11-14T06:00")).farmacias[0], "b");
  assert.equal(turnoActual(turnos, enCuencaHora("2026-11-21T07:00")), null);
  assert.equal(turnoActual(null), null);
});

test("filtrarFarmacias busca en el nombre y la dirección", () => {
  const lista = [
    { nombre: "Farmacia Rey David", direccion: "Av. Ordóñez Lazo 4-113" },
    { nombre: "Soy Formulador", direccion: "Vega Muñoz 6-72 y Borrero" },
  ];
  assert.equal(filtrarFarmacias(lista, "ordonez").length, 1);
  assert.equal(filtrarFarmacias(lista, "MUNOZ")[0].nombre, "Soy Formulador");
  assert.equal(filtrarFarmacias(lista, "").length, 2);
});

test("revisarUbicacion descarta la ubicación por internet y la muy imprecisa", () => {
  // En el Parque Calderón, con el margen de un celular o un wifi.
  assert.equal(revisarUbicacion({ lat: -2.8974, lon: -79.0045, precision: 25 }), null);
  // Baños, a unos 7 km del centro, sigue siendo Cuenca.
  assert.equal(revisarUbicacion({ lat: -2.9196, lon: -79.0661, precision: 60 }), null);
  // Quito: lo que da el navegador cuando solo se basa en la conexión a internet.
  const quito = revisarUbicacion({ lat: -0.2201, lon: -78.5123, precision: 20000 });
  assert.equal(quito.problema, "lejos");
  assert.ok(quito.km > 290 && quito.km < 310, String(quito.km));
  // En Cuenca, pero con varios kilómetros de margen: no sirve para saber la calle.
  assert.deepEqual(revisarUbicacion({ lat: -2.9, lon: -79.0, precision: 5000 }), {
    problema: "imprecisa",
    metros: 5000,
  });
});

test("todos los datos del mapa caen dentro de los límites de Cuenca", async () => {
  const { LIMITES_CUENCA: l } = await import("../../web/logica.js");
  const archivos = [
    "recoleccion/zonas.geojson",
    "buses/paradas.geojson",
    "buses/lineas.geojson",
    "buses/tranvia.geojson",
    "ciudad/cerca.geojson",
    "movilidad/bicicletas.geojson",
    "movilidad/ciclovias.geojson",
    "movilidad/carga.geojson",
  ];
  const puntos = (c) => (typeof c[0] === "number" ? [c] : c.flatMap(puntos));
  for (const archivo of archivos) {
    const datos = JSON.parse(readFileSync(new URL(`../../datos/${archivo}`, import.meta.url), "utf8"));
    for (const f of datos.features) {
      if (!f.geometry) continue;
      for (const [lon, lat] of puntos(f.geometry.coordinates)) {
        assert.ok(lon > l.oeste && lon < l.este && lat > l.sur && lat < l.norte, `${archivo}: ${lon},${lat}`);
      }
    }
  }
  assert.ok(l.sur < -2.8975 && l.norte > -2.8975, "el centro queda dentro");
});

test("proximoFeriado: el próximo día de descanso si está cerca, y Carnaval como un solo feriado", () => {
  const dia = (fecha, es) => ({ fecha, es, en: es, fuente: {} });
  const datos = { dias: [dia("2027-02-09", "Carnaval"), dia("2026-11-20", "Decreto"), dia("2027-02-08", "Carnaval"), dia("2027-02-10", "Otro")] };
  const resultado = proximoFeriado(datos, new Date("2026-11-17T09:00:00-05:00"));
  assert.deepEqual([resultado.dia.fecha, resultado.hasta, resultado.faltan], ["2026-11-20", "2026-11-20", 3]);
  // A las 23:00 del 19 en Cuenca ya es 20 en UTC, pero todavía falta un día.
  assert.equal(proximoFeriado(datos, new Date("2026-11-19T23:00:00-05:00")).faltan, 1);
  assert.equal(proximoFeriado(datos, new Date("2026-11-20T08:00:00-05:00")).faltan, 0);
  // Demasiado lejos: no se muestra.
  assert.equal(proximoFeriado(datos, new Date("2026-11-21T08:00:00-05:00")), null);
  const carnaval = proximoFeriado(datos, new Date("2027-02-01T08:00:00-05:00"));
  assert.deepEqual([carnaval.dia.fecha, carnaval.hasta, carnaval.faltan], ["2027-02-08", "2027-02-09", 7]);
  assert.equal(proximoFeriado(null), null);
});

test("telefono: cada número de las fuentes sale con el mismo formato y se puede marcar", () => {
  assert.deepEqual(telefono("4081739"), { texto: "07 408 1739", marcar: "+59374081739" }); // fijo sin código
  assert.deepEqual(telefono("072812332"), { texto: "07 281 2332", marcar: "+59372812332" });
  assert.deepEqual(telefono("73702200"), { texto: "07 370 2200", marcar: "+59373702200" }); // sin el 0
  assert.deepEqual(telefono("996428652"), { texto: "099 642 8652", marcar: "+593996428652" }); // celular sin el 0
  assert.deepEqual(telefono("+593 4 2446520"), { texto: "04 244 6520", marcar: "+59342446520" });
  assert.equal(telefono("123"), null);
  assert.equal(telefono(undefined), null);
});

test("distanciaParada y minutosAPie", () => {
  assert.equal(distanciaParada(0), "menos de 20 m");
  assert.equal(distanciaParada(19), "menos de 20 m");
  assert.equal(distanciaParada(240), "240 m");
  assert.equal(minutosAPie(0), 1);
  assert.equal(minutosAPie(240), 3);
});

test("recoleccionDeHoy: por dónde pasa ahora, dónde falta y dónde ya pasó", () => {
  const zona = (n, dias_iso, desde, hasta) => ({ properties: { zona: n, dias_iso, desde, hasta } });
  const zonas = { features: [zona(4, [1, 3, 5], "20:00", "24:00"), zona(1, [1, 3, 5], "08:00", "12:00"), zona(2, [1, 3, 5], "13:00", "17:00"), zona(5, [2, 4, 6], "08:00", "12:00")] };
  // Viernes 20 de noviembre de 2026, 14:30 en Cuenca.
  const viernes = new Date("2026-11-20T14:30:00-05:00");
  assert.deepEqual(recoleccionDeHoy(zonas, viernes), { todas: [1, 2, 4], ahora: [2], luego: [4], empieza: "20:00", ya: [1] });
  // Domingo: no hay recolección.
  assert.deepEqual(recoleccionDeHoy(zonas, new Date("2026-11-22T10:00:00-05:00")).todas, []);
});

test("faltaRecoleccion: minutos para que empiece o termine la de hoy", () => {
  const zona = { dias_iso: [1, 3, 5], dias: ["lunes", "miércoles", "viernes"], desde: "20:00", hasta: "24:00" };
  const tarde = new Date("2026-11-20T16:50:00-05:00");
  assert.equal(faltaRecoleccion(proximaRecoleccion(zona, tarde), tarde), 190);
  const noche = new Date("2026-11-20T22:40:00-05:00");
  assert.equal(faltaRecoleccion(proximaRecoleccion(zona, noche), noche), 80);
  const sabado = new Date("2026-11-21T09:00:00-05:00");
  assert.equal(faltaRecoleccion(proximaRecoleccion(zona, sabado), sabado), null);
});

test("franjasDeHoy: las zonas de hoy en el orden del día, con lo que ya pasó, lo que pasa y lo que falta", () => {
  const zona = (n, dias_iso, desde, hasta) => ({ properties: { zona: n, dias_iso, desde, hasta } });
  const zonas = { features: [zona(8, [2, 4, 6], "20:00", "24:00"), zona(5, [2, 4, 6], "08:00", "12:00"), zona(7, [2, 4, 6], "15:00", "19:00"), zona(1, [1, 3, 5], "08:00", "12:00")] };
  const sabado = new Date("2026-11-21T15:40:00-05:00");
  assert.deepEqual(
    franjasDeHoy(zonas, sabado).map((f) => [f.zona, f.estado, f.inicio, f.fin, f.lmv]),
    [[5, "ya", 480, 720, false], [7, "ahora", 900, 1140, false], [8, "luego", 1200, 1440, false]],
  );
  assert.deepEqual(franjasDeHoy(zonas, new Date("2026-11-22T10:00:00-05:00")), []);
});

test("horaDentroDe: la hora de Cuenca a la que llega algo, redondeada a cinco minutos", () => {
  const madrugada = new Date("2026-11-21T00:40:00-05:00");
  assert.equal(horaDentroDe(348, madrugada), "06:30");
  assert.equal(horaDentroDe(62, madrugada), "01:40");
  // Pasa de medianoche sin salirse del día.
  assert.equal(horaDentroDe(90, new Date("2026-11-21T23:10:00-05:00")), "00:40");
});

test("avisosAguaPorConfirmar: los de ETAPA sin revisar, hasta que pasa su corte", () => {
  const aviso = (enlace, mas) => ({ enlace, menciona_etapa: true, publicado: "2026-11-19", ...mas });
  const avisos = {
    avisos: [
      aviso("manana", { fecha: "2026-11-21", desde: "08:00", hasta: "12:00" }),
      aviso("hoy", { fecha: "2026-11-20", desde: "09:00", hasta: "18:00" }),
      aviso("ayer", { fecha: "2026-11-19", desde: "09:00", hasta: "18:00" }),
      aviso("sin-fecha", { fecha: null }),
      aviso("sin-fecha-viejo", { fecha: null, publicado: "2026-11-15" }),
      aviso("confirmado", { fecha: "2026-11-21" }),
      aviso("descartado", { fecha: "2026-11-21" }),
      { enlace: "sin-etapa", menciona_etapa: false, publicado: "2026-11-19", fecha: "2026-11-21" },
    ],
  };
  const confirmados = { cortes: [{ fuente: { url: "confirmado" } }], descartados: [{ enlace: "descartado" }] };
  const enlaces = (cuando) => avisosAguaPorConfirmar(avisos, confirmados, new Date(cuando)).map((a) => a.enlace);
  assert.deepEqual(enlaces("2026-11-20T10:00:00-05:00"), ["sin-fecha", "hoy", "manana"]);
  // Pasada la hora de fin, el de hoy ya no se muestra.
  assert.deepEqual(enlaces("2026-11-20T18:30:00-05:00"), ["sin-fecha", "manana"]);
  assert.deepEqual(avisosAguaPorConfirmar(null, null), []);
});

test("avisosDePrensaVigentes: los de hoy en adelante o recién publicados", async () => {
  const { avisosDePrensaVigentes } = await import("../../web/logica.js");
  const viernes = new Date("2026-11-13T15:00:00Z"); // 10:00 en Cuenca
  const datos = {
    avisos: [
      { titulo: "pasado", fecha: "2026-11-12", publicado: "2026-11-11" },
      { titulo: "domingo", fecha: "2026-11-15", publicado: "2026-11-13", cita: true },
      { titulo: "hoy", fecha: "2026-11-13", publicado: "2026-11-12", cita: false },
      { titulo: "sin fecha, de ayer", fecha: null, publicado: "2026-11-12", cita: true },
      { titulo: "sin fecha, viejo", fecha: null, publicado: "2026-11-05", cita: true },
    ],
  };
  assert.deepEqual(avisosDePrensaVigentes(datos, viernes).map((a) => a.titulo), ["sin fecha, de ayer", "hoy", "domingo"]);
  assert.deepEqual(avisosDePrensaVigentes(datos, viernes, { campo: "cita" }).map((a) => a.titulo), ["sin fecha, de ayer", "domingo"]);
  assert.deepEqual(avisosDePrensaVigentes(null, viernes), []);
});

test("estadoHorario: abierto o cerrado según el horario escrito", async () => {
  const { estadoHorario } = await import("../../web/logica.js");
  const a_las_10 = new Date("2026-11-18T15:00:00Z");
  const a_las_19 = new Date("2026-11-19T00:00:00Z");
  assert.deepEqual(estadoHorario("De 08:00 a 18:00", a_las_10), { abierto: true, abre: "08:00", cierra: "18:00" });
  assert.equal(estadoHorario("De 08:00 a 18:00", a_las_19).abierto, false);
  assert.equal(estadoHorario("De 8h00 a 13h30", a_las_10).cierra, "13:30");
  // Sin horario reconocible no se adivina.
  assert.equal(estadoHorario("Lunes a domingo", a_las_10), null);
  assert.equal(estadoHorario(undefined, a_las_10), null);
});

test("estadoHorarioOsm: lee el horario de OpenStreetMap", async () => {
  const { estadoHorarioOsm } = await import("../../web/logica.js");
  // 2026-11-23 es lunes; Cuenca va en UTC-5.
  const lunes = (h, m = 0) => new Date(Date.UTC(2026, 10, 23, h + 5, m));
  const sabado = (h) => new Date(Date.UTC(2026, 10, 28, h + 5));
  const domingo = (h) => new Date(Date.UTC(2026, 10, 29, h + 5));
  assert.deepEqual(estadoHorarioOsm("Mo-Sa 08:00-20:00; Su 09:00-13:00", lunes(10)), { abierto: true, cierra: "20:00", siempre: false });
  assert.deepEqual(estadoHorarioOsm("Mo-Sa 08:00-20:00; Su 09:00-13:00", lunes(7, 30)), { abierto: false, abre: "08:00", manana: false });
  assert.deepEqual(estadoHorarioOsm("Mo-Sa 08:00-20:00; Su 09:00-13:00", sabado(21)), { abierto: false, abre: "09:00", manana: true });
  assert.equal(estadoHorarioOsm("Mo-Sa 08:00-20:00; Su 09:00-13:00", domingo(12)).cierra, "13:00");
  // Sin días, todos; reglas separadas por coma; la que pasa la medianoche.
  assert.equal(estadoHorarioOsm("08:00-21:00", domingo(20)).abierto, true);
  assert.equal(estadoHorarioOsm("Mo-Fr 08:30-22:15, Sa,Su 09:00-21:45", sabado(21)).cierra, "21:45");
  // El martes a las 3 sigue el turno del lunes; el lunes a las 3, el del domingo ya cerró a la 1.
  const martes3 = new Date(Date.UTC(2026, 10, 24, 8));
  assert.deepEqual(estadoHorarioOsm("Mo-Fr 20:00-08:00; Sa-Su 20:00-01:00", martes3), { abierto: true, cierra: "08:00", siempre: false });
  assert.deepEqual(estadoHorarioOsm("Mo-Fr 20:00-08:00; Sa-Su 20:00-01:00", lunes(3)), { abierto: false, abre: "20:00", manana: false });
  assert.equal(estadoHorarioOsm("Mo-Fr 09:00-18:00", sabado(10)).abierto, false);
  assert.equal(estadoHorarioOsm("Mo-Fr 09:00-18:00", sabado(10)).abre, null);
  assert.deepEqual(estadoHorarioOsm("24/7", lunes(3)), { abierto: true, cierra: null, siempre: true });
  // Lo que no se entiende, no se adivina.
  assert.equal(estadoHorarioOsm("Mo-Su 08:00+", lunes(10)), null);
  assert.equal(estadoHorarioOsm("Mo-Fr 08:00-18:00; PH off", lunes(10)), null);
  assert.equal(estadoHorarioOsm(null, lunes(10)), null);
});

test("farmaciasCerca y esLaDeTurno: las de OpenStreetMap junto al punto", async () => {
  const { farmaciasCerca, esLaDeTurno, esDeNoche } = await import("../../web/logica.js");
  const lunes10 = new Date(Date.UTC(2026, 10, 23, 15));
  const punto = { lat: -2.9, lon: -79.0 };
  const datos = {
    farmacias: [
      { nombre: "Lejana", lat: -2.95, lon: -79.0, horario: null },
      { nombre: "Cerrada", lat: -2.9001, lon: -79.0, horario: "Mo-Fr 18:00-21:00" },
      { nombre: "Farmacias Cruz Azul", lat: -2.902, lon: -79.0, horario: null },
      { nombre: "Abierta", lat: -2.903, lon: -79.0, horario: "Mo-Su 08:00-22:00" },
    ],
  };
  // Las cerradas, aunque estén más cerca, van al final; la lejana queda fuera.
  assert.deepEqual(farmaciasCerca(punto, datos, { fecha: lunes10 }).map((f) => f.nombre), ["Farmacias Cruz Azul", "Abierta", "Cerrada"]);
  assert.deepEqual(farmaciasCerca(punto, datos, { fecha: lunes10, soloAbiertas: true }).map((f) => f.nombre), ["Abierta"]);
  assert.equal(farmaciasCerca(punto, datos, { fecha: lunes10 })[0].metros, 222);
  // La de turno, con su esquina a 167 m y el nombre como lo escribe ARCSA; a 300 m ya no.
  const turno = [{ nombre: "FARMACIA CRUZ AZUL", lugar: { lat: -2.9035, lon: -79.0 } }];
  assert.equal(esLaDeTurno(datos.farmacias[2], turno), true);
  assert.equal(esLaDeTurno(datos.farmacias[2], [{ ...turno[0], lugar: { lat: -2.9047, lon: -79.0 } }]), false);
  assert.equal(esLaDeTurno(datos.farmacias[3], turno), false);
  assert.equal(esLaDeTurno({ nombre: null, lat: -2.902, lon: -79.0 }, turno), false);
  assert.equal(esDeNoche(new Date(Date.UTC(2026, 10, 24, 3))), true); // 22:00
  assert.equal(esDeNoche(lunes10), false);
});

test("cambiosDelFeriado: lo que cambia en un día de descanso", async () => {
  const { cambiosDelFeriado } = await import("../../web/logica.js");
  const fuente = { nombre: "El Mercurio", url: "https://elmercurio.com.ec/x" };
  const feriado = {
    dia: {
      fecha: "2026-12-25",
      tipo: "nacional",
      es: "Navidad",
      servicios: { lista: [{ es: "La escombrera abre de 08:00 a 12:00.", en: "The rubble dump opens 08:00-12:00." }], fuente },
    },
    hasta: "2026-12-25",
    faltan: 3,
  };
  const basura = { feriados: { es: "En feriados el recolector pasa igual.", desde: "2025-12-30", hasta: "2027-03-31", fuente } };
  const transporte = { tranvia: { horario: { nota: "Cambia en feriados y por mantenimiento.", fuente: "https://elmercurio.com.ec/t" } } };
  const turnos = { turnos: [{ inicio: "2026-12-19", fin: "2026-12-26", farmacias: [{}, {}, {}] }] };
  const cambios = cambiosDelFeriado(feriado, { basura, transporte, turnos });
  assert.deepEqual(cambios.map((c) => c.tema), ["basura", "anunciado", "farmacias", "tranvia", "oficinas", "emergencias"]);
  assert.match(cambios[2].texto, /Ese día son 3/);
  assert.equal(cambios[1].fuente, fuente);
  // Sin turnos para ese día, sin regla de basura vigente, sin anuncios; y una suspensión.
  const otro = cambiosDelFeriado({ ...feriado, dia: { fecha: "2027-06-01", tipo: "suspension", es: "Suspensión" } }, { basura, turnos });
  assert.deepEqual(otro.map((c) => c.tema), ["farmacias", "oficinas", "emergencias"]);
  assert.match(otro[0].texto, /todavía no publica/);
  assert.match(otro[1].texto, /decreto/);
  assert.deepEqual(cambiosDelFeriado(null), []);
});
