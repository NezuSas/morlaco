// Calidad del aire, de la Red de Monitoreo de la EMOV EP (caire.emov.gob.ec). Sin DOM ni red.
//
// La EMOV publica cada hora un índice (ICA) de 0 a 500 por estación: es el más alto de los
// subíndices de los contaminantes que mide esa estación. Las estaciones no miden lo mismo
// (una solo CO y SO2), así que se prefiere la más cercana que mida partículas, que es lo
// que más afecta a la salud en la ciudad.

import { distanciaMetros } from "./logica.js";

export const URL_AIRE = "https://caire.emov.gob.ec/datos/ica/obtener";
export const PAGINA_AIRE = "https://caire.emov.gob.ec/";

/** Un dato más viejo que esto no se muestra: ya no dice cómo está el aire ahora. */
const MAXIMO_HORAS = 4;
const PARTICULAS = new Set(["PM25", "PM10"]);

/** El nivel de la escala (1 buena … 6 peligrosa) que corresponde a un índice. */
export function nivelAire(valor) {
  if (valor <= 50) return 1;
  if (valor <= 100) return 2;
  if (valor <= 150) return 3;
  if (valor <= 200) return 4;
  if (valor <= 300) return 5;
  return 6;
}

/**
 * Las estaciones de la respuesta de la EMOV que tienen un dato reciente y completo.
 * Cualquier cosa rara (sin índice, sin coordenadas, sin contaminantes o con un dato viejo)
 * se descarta: es mejor no mostrar el aire que mostrarlo mal.
 */
export function leerAire(respuesta, ahora = new Date()) {
  const lista = respuesta?.icaEstacionWeb;
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((estacion) => {
    const ica = estacion?.icaEstacion;
    const lugar = estacion?.estacionObjeto;
    const fecha = new Date(estacion?.fecha);
    const parametros = (estacion?.icaParametros ?? [])
      .filter((p) => p?.parametro && Number.isFinite(p.valor))
      .map((p) => ({ nombre: p.parametro, valor: p.valor }));
    if (!Number.isFinite(ica?.valor) || !Number.isFinite(lugar?.latitud) || !Number.isFinite(lugar?.longitud)) return [];
    if (Number.isNaN(fecha.getTime()) || !parametros.length) return [];
    const horas = (ahora - fecha) / 3_600_000;
    if (horas > MAXIMO_HORAS || horas < -1) return [];
    return [
      {
        nombre: estacion.estacion ?? lugar.nombre,
        direccion: lugar.direccion ?? null,
        lat: lugar.latitud,
        lon: lugar.longitud,
        valor: ica.valor,
        nivel: nivelAire(ica.valor),
        fecha,
        parametros,
        // El contaminante que marca el índice: el de subíndice más alto.
        dominante: parametros.reduce((a, b) => (b.valor > a.valor ? b : a)).nombre,
        mideParticulas: parametros.some((p) => PARTICULAS.has(p.nombre)),
        recomendacion: ica.recomendaciones?.[0] ?? null,
      },
    ];
  });
}

/** La estación más cercana al punto, prefiriendo las que miden partículas; null si no hay. */
export function aireCercano(punto, estaciones) {
  const conParticulas = estaciones.filter((e) => e.mideParticulas);
  const candidatas = conParticulas.length ? conParticulas : estaciones;
  let mejor = null;
  for (const estacion of candidatas) {
    const metros = distanciaMetros(punto, estacion);
    if (!mejor || metros < mejor.metros) mejor = { ...estacion, metros: Math.round(metros) };
  }
  return mejor;
}
