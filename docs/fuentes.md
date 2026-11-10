# Dónde está cada dato de Cuenca

Este documento dice, servicio por servicio, dónde se publica hoy la información, qué tan al día está, si
Morlaco la puede leer sola y qué no tiene fuente. Sirve para mantener Morlaco y para saber dónde buscar cuando
un dato parece viejo.

**Revisado el 10 de noviembre de 2026.** Las fuentes cambian: antes de fiarte de una fila, mira la fecha de
lo último que publicó.

Cómo leer las tablas:

- **Al día**: publicó algo en las últimas semanas y lo publicado sigue vigente.
- **Atrasada**: existe, pero lo último que publicó tiene meses o ya no refleja la realidad.
- **Muerta**: la página existe, pero no publica nada desde hace más de un año.
- **Automática**: Morlaco la lee sola (cada día, cada lunes o en vivo). **A mano**: alguien tiene que leerla y
  copiar el dato.

## Resumen

| Servicio | Mejor fuente hoy | Estado | En Morlaco |
|---|---|---|---|
| Recolección urbana | Mapa de zonas de EMAC EP | Al día | Automática, diaria |
| Recolección rural | Texto general de EMAC EP | Sin detalle | No está |
| Feriados y dónde llevar cada cosa | Páginas de EMAC y ETAPA, y El Mercurio | Al día | A mano |
| Cortes de luz programados | Ninguna web publica los de Cuenca | Sin fuente regular | Automática, avisa del vacío |
| Cortes de agua | El Mercurio | Al día | No está |
| Farmacias de turno | PDF mensual de ARCSA | Al día | Automática, diaria |
| Buses: horarios y recorridos | Cuenca en Datos (abril de 2026) | Atrasada | Automática, semanal |
| Buses: cambios de 2026 y pasaje | El Mercurio | Al día | A mano |
| Tranvía | API de su web | Al día | Automática, diaria |
| Calidad del aire | API de la EMOV | Al día (cada hora) | En vivo |
| Calles, BiciPública, ciclovías | OpenStreetMap | Al día | Automática, semanal |

## Recolección de basura (EMAC EP)

| Fuente | Qué tiene | Estado | Cómo se lee |
|---|---|---|---|
| [Mapa de zonas](https://emac.gob.ec/mapa-zonas-de-recoleccion/) (Google My Maps, KML) | Las 8 zonas urbanas con días y horario | Al día | Automática |
| [Servicio de recolección](https://emac.gob.ec/servicio-de-recoleccion-de-desechos-y-residuos-solidos/) | Funda celeste miércoles o jueves; zona rural: 2 días por semana entre 08:00 y 15:00 | Al día, sin cambios desde mayo de 2024 | A mano |
| [BIOEMAC](https://emac.gob.ec/bioemac/), [escombros](https://emac.gob.ec/gestion-de-escombros/), [obligaciones](https://emac.gob.ec/informacion-obligaciones-y-recomendaciones/) | Dónde llevar orgánicos, vidrio, escombros, agujas | Al día; algunas páginas son de 2024 | A mano |
| El Mercurio, 1 a 3 días antes de cada feriado | Si la recolección cambia (hasta ahora, nunca) y qué cierra | Al día | A mano |
| [Rendición de cuentas 2025](https://emac.gob.ec/wp-content/uploads/2026/05/Rendicion_2025_BC.pdf) | Qué programas siguen activos (Punto Limpio, trueque, funda verde) | Mayo de 2026 | Consulta |
| Línea 139, (07) 4134 801, info@emac.gob.ec | Dudas y denuncias | — | Remitir |

**Sin fuente:** días y horarios de cada parroquia rural (solo hay la regla general); servicio para muebles y
objetos grandes; aceite de cocina, focos y fluorescentes; lista oficial vigente de lo que va en la funda
celeste. Para los horarios rurales habría que pedirlos a EMAC con una solicitud de acceso a la información
pública o a cada junta parroquial.

**Contradicción conocida:** la web de EMAC dice que BIOEMAC abre todos los feriados; la prensa de 2026 lo
reporta cerrado en feriados. Manda la prensa reciente.

## Cortes de luz (Centro Sur)

| Fuente | Qué tiene | Estado | Cómo se lee |
|---|---|---|---|
| [Suspensiones programadas](https://www.centrosur.gob.ec/suspensiones-programadas/) | PDF diario con los cortes por sector | Muerta desde el 8 de julio de 2026 | Automática (Morlaco avisa que no publica) |
| [Programación de cortes](https://www.centrosur.gob.ec/intermedia-programacion/) | PDF sueltos desde octubre de 2026 | Activa, pero solo con cortes de Morona Santiago | Automática |
| [Trabajos programados](https://www.centrosur.gob.ec/trabajos-programados/) | Nada: la página está vacía | Vacía | — |
| API de WordPress de Centro Sur (`/wp-json/wp/v2/media`, `/pages`) | Avisa de cualquier PDF o página nueva | Pública | Automática |
| [Ministerio de Ambiente y Energía](https://www.ambienteyenergia.gob.ec/mantenimientoseedprogramados/) | Un PDF por empresa en las jornadas nacionales de mantenimiento | Ocasional; la última, 17 de octubre de 2026, sin Cuenca | Se podría vigilar |
| El Mercurio (API de WordPress pública) | Cortes no programados y avisos que Centro Sur no publica en su web | Al día | Señal, a mano |
| X y Facebook @centrosurec, WhatsApp 096 120 3354, línea 136 | Probablemente el canal más completo | Al día | No se puede leer automáticamente: remitir |

**Lo que pasa hoy:** ninguna web oficial publica de forma regular los cortes programados de Cuenca. Entre julio
y noviembre de 2026 los cortes en Cuenca fueron no programados (desconexiones pedidas por el CENACE el 13 y 14
de octubre, un corte en el Centro Histórico el 15). Para el mantenimiento de mediados de octubre, Centro Sur
avisó cortes de hasta cuatro horas diarias hasta el 19 de octubre, sin publicar los sectores en su web. Por eso
Morlaco no dice "no hay cortes": dice desde cuándo Centro Sur no publica y remite a sus redes y a su línea.

## Cortes de agua (ETAPA EP)

| Fuente | Qué tiene | Estado | Cómo se lee |
|---|---|---|---|
| [Cortes programados](https://www.etapa.net.ec/noticias/cortes-programados/) en la web de ETAPA | Avisos como imagen, sin texto | Muerta desde febrero de 2025 | — |
| Servicios ArcGIS de ETAPA (`geo.etapa.net.ec`) | Subsectores de agua potable (para dibujar un corte), puntos de pilas y aceite | Públicos, sin cortes | Automática para los mapas |
| El Mercurio | Cada aviso con fecha, sectores, horario y motivo; de 1 a 3 al mes | Al día; el último, Turi, 13 de octubre de 2026 | A mano (o detectar avisos en su API) |
| Redes de ETAPA y línea 188 | Canal original, según la prensa | Al día | No se puede leer automáticamente: remitir |

**Para añadirlo a Morlaco** habría que vigilar la API de El Mercurio, leer cada aviso y confirmarlo antes de
publicarlo, porque un corte de agua equivocado hace más daño que no tenerlo. No existe un canal oficial que
se pueda leer automáticamente.

## Farmacias de turno (ARCSA)

| Fuente | Qué tiene | Estado | Cómo se lee |
|---|---|---|---|
| [Turnos de farmacias](https://www.controlsanitario.gob.ec/turnos-de-farmacias/), PDF mensual de Azuay | Farmacias de turno por semana, con dirección y teléfono | Al día; el de noviembre llega al 28 | Automática, diaria |

**Ojo:** el PDF tiene errores de la propia fuente (años mal escritos, farmacias de otros cantones). Morlaco
corrige lo evidente y pide llamar antes de ir. Si un mes ARCSA tarda en publicar, la página se queda sin
turno y lo dice.

## Buses y tranvía

| Fuente | Qué tiene | Estado | Cómo se lee |
|---|---|---|---|
| [Cuenca en Datos](https://cuencaendatos.cuenca.gob.ec): recorridos | Puntos por los que pasa cada línea | Abril de 2026 | Automática, semanal |
| Cuenca en Datos: rutas y horarios | Horario e intervalo de cada línea | Marzo de 2025 | Automática, semanal |
| Cuenca en Datos: trazados (shapefile) | Geometría de cada línea | Septiembre de 2022 | Automática, semanal |
| Cuenca en Datos: paradas | Paradas con coordenadas | Abril de 2025 | Automática, semanal |
| [IDE del Municipio](https://ide.cuenca.gob.ec/geoserver/ows?service=WFS&request=GetCapabilities) (WFS, capas `ide:dmt_lineaN` y `dahp_movilidad:paradas_bus_total`) | 38 líneas con trazado, horario e intervalos; 1.303 paradas | Sin fecha; no tiene los cambios de septiembre de 2026 | Se podría leer (pendiente de comparar con lo actual) |
| [PDF de cada línea](https://www.cuenca.gob.ec/content/recorrido-linea-de-buses) en la web del Municipio | Mapa de cada recorrido | Abril de 2025 | Consulta |
| El Mercurio | Ampliaciones de septiembre de 2026, cambios de octubre, pasaje | Al día | A mano |
| [API del tranvía](https://tranvia.cuenca.gob.ec/) | Estaciones con coordenadas | Al día | Automática, diaria |

**Sin fuente abierta:** las ampliaciones de siete líneas desde el 1 de septiembre de 2026 y los cambios de
octubre (solo descritos en prensa); posiciones de buses en tiempo real; un feed GTFS oficial (no hay ninguno de
Ecuador en Mobility Database ni en Transitland). La app Movilízate es de la Cámara de Transporte y Moovit tiene
datos propios: ninguna los publica abiertos.

## Calidad del aire (EMOV EP)

| Fuente | Qué tiene | Estado | Cómo se lee |
|---|---|---|---|
| API de la [Red de Monitoreo](https://caire.emov.gob.ec/) (`/datos/ica/obtener`) | Índice horario de 3 estaciones, con coordenadas y recomendación | Al día, con 1 a 2 horas de retraso | En vivo desde el navegador |
| Microsensores (`/datos/ica/obtenerIcaMicro`) | 7 sensores de bajo costo | Al día | No se usa todavía |

**Ojo:** API sin documentar ni licencia explícita; el servidor envía el certificado sin el intermedio (falla en
Python y Node, funciona en los navegadores); el certificado vence el 24 de enero de 2027.

## Calles y movilidad (OpenStreetMap)

| Fuente | Qué tiene | Estado | Cómo se lee |
|---|---|---|---|
| API Overpass de OpenStreetMap | Calles con nombre, BiciPública, ciclovías, carga eléctrica | Al día | Automática, semanal |
| BiciCuenca (`bicicuenca.com`) | Disponibilidad de bicicletas | Certificado vencido desde el 13 de octubre de 2026 | No se usa |

## Prensa: cómo usarla

El Mercurio es hoy la fuente más completa para lo que las instituciones anuncian solo en redes: cortes de agua,
cortes de luz no programados, cambios de buses, pasaje y feriados. Su API de WordPress es pública
(`https://elmercurio.com.ec/wp-json/wp/v2/posts?search=…&after=…`).

Reglas para usarla en Morlaco:

1. Solo datos que la nota atribuye a la institución ("ETAPA informó…"), nunca opiniones ni estimaciones.
2. Citar la nota con su enlace y fecha.
3. Ponerle fecha de caducidad al dato.
4. Si dos notas se contradicen, manda la más reciente y se anota la duda.
