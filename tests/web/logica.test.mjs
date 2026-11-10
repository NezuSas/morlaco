import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  describirRecoleccion,
  direccionLegible,
  horaLegible,
  nombreParada,
  enlaceReporteDireccion,
  enlacesCalendario,
  estadoLuz,
  filtrarCortes,
  formatoDistancia,
  hashDesdePunto,
  masCercano,
  filtrarFarmacias,
  turnoActual,
  horaCuenca,
  paradasCercanas,
  proximaRecoleccion,
  puntoDesdeHash,
  puntoEnGeometria,
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
