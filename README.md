<h1 align="center">
  <img src="web/icono.svg" alt="" width="72" height="72"><br>
  Morlaco
</h1>

<h3 align="center">¿Qué pasa hoy en tu calle? Basura, cortes de luz y buses de Cuenca, Ecuador.</h3>

<p align="center">
  <a href="https://nezusas.github.io/morlaco/web/"><b>Abrir Morlaco</b></a> ·
  <a href="#qué-datos-hay">Los datos</a> ·
  <a href="CONTRIBUTING.md">Colaborar</a> ·
  <a href="https://github.com/NezuSas/morlaco/issues/new/choose">Avisar de un error</a>
</p>

<p align="center">
  <a href="https://nezusas.github.io/morlaco/web/">
    <img src="docs/imagenes/busqueda.gif" alt="Se escribe «Calle Larga y Her» en Morlaco, se elige la sugerencia «Hermano Miguel» y aparece el letrero de la esquina, el resumen de hoy, cuándo pasa el recolector, las farmacias de turno y los buses, con el mapa al lado" width="880">
  </a>
</p>

Escribe tu esquina como se dan las direcciones en Cuenca ("Sucre y Borrero") y Morlaco te dice:

- **Cuándo pasa el recolector** por tu calle, qué funda sacar y qué día va la funda celeste. Con un toque te
  suscribes al **calendario de tu zona** y recibes un aviso antes de cada recolección.
- **Si hay cortes de luz programados** por Centro Sur para hoy, y si publicó cronogramas nuevos (y para qué
  provincias).
- **Qué farmacias están de turno** esta semana (abiertas las 24 horas), ordenadas por cercanía y con su teléfono
  para llamar.
- **Qué líneas de bus pasan cerca**, cada cuánto pasan hoy, su recorrido en el mapa y sus **cambios
  recientes**; las paradas más cercanas, la estación del tranvía más cercana y cada cuánto pasa, y el
  **pasaje** vigente.
- **Qué bus te lleva a donde vas**: escribe el destino y te propone líneas directas, con un transbordo o ir a
  pie, con los pasos y el tiempo estimado, y la dibuja en el mapa.
- **Dónde está la BiciPública más cercana**, y en el mapa las ciclovías y los puntos de carga para autos
  eléctricos.

Todo sale de **fuentes oficiales y públicas** (EMAC EP, Centro Sur, el portal Cuenca en Datos del municipio y
OpenStreetMap), y los datos limpios quedan aquí, abiertos, para que cualquiera construya encima: una web, un bot,
una app o un análisis.

<table>
  <tr>
    <td width="68%"><img src="docs/imagenes/escritorio.webp" alt="Morlaco en el escritorio: la esquina Mariscal Sucre y Presidente Borrero en un letrero de cerámica sobre un muro de azulejo azul, el resumen «Hoy en tu calle» y el mapa de la zona 4 de recolección"></td>
    <td width="32%"><img src="docs/imagenes/movil-oscuro.webp" alt="Morlaco en el móvil con el modo oscuro: el letrero de la esquina y el resumen de basura, farmacias y buses"></td>
  </tr>
</table>

> Morlaco **no es un servicio oficial** ni está afiliado a EMAC EP, Centro Sur, ETAPA EP ni al GAD
> Municipal de Cuenca. Cada archivo indica de dónde salió. Ante cualquier duda, manda la fuente oficial.

## Qué datos hay

| Archivo | Qué contiene | Fuente |
|---|---|---|
| [`datos/recoleccion/zonas.geojson`](datos/recoleccion/zonas.geojson) | Las 8 zonas de recolección de basura (polígonos) con sus días, horario y día de recolección de reciclables | [EMAC EP, mapa de zonas](https://emac.gob.ec/mapa-zonas-de-recoleccion/) |
| [`datos/recoleccion/calendarios/zona-N.ics`](datos/recoleccion/calendarios/) | Un calendario por zona (iCalendar) con los días de recolección, el día de la funda celeste y un aviso una hora antes, para suscribirse desde Google Calendar, el iPhone u Outlook | Generado a partir de las zonas de EMAC EP |
| [`datos/luz/suspensiones.json`](datos/luz/suspensiones.json) | Suspensiones programadas del servicio eléctrico: alimentador, dirección, hora de inicio y de fin, trabajo. En `otras_publicaciones`, los cronogramas sueltos recientes: fecha, provincias y si mencionan Cuenca | [Centro Sur, suspensiones programadas](https://www.centrosur.gob.ec/suspensiones-programadas/) y [programación de cortes](https://www.centrosur.gob.ec/intermedia-programacion/) |
| [`datos/buses/rutas.json`](datos/buses/rutas.json) | Líneas de bus con compañía, origen, destino, horario e intervalo entre buses (lunes a viernes, sábados, domingos) | [Cuenca en Datos](https://cuencaendatos.cuenca.gob.ec/dataset/f15c8808-0d12-4f97-bfd4-3b2f85ea84d1) |
| [`datos/buses/recorridos.json`](datos/buses/recorridos.json) | Puntos por los que pasa cada línea, en orden, de ida y de retorno | [Cuenca en Datos](https://cuencaendatos.cuenca.gob.ec/dataset/4c727738-890e-445c-9b20-32df271db766) |
| [`datos/buses/lineas.geojson`](datos/buses/lineas.geojson) | Recorrido de las 38 líneas de bus, los alimentadores y el tranvía en cada sentido, con sus alargues | [Cuenca en Datos](https://cuencaendatos.cuenca.gob.ec/dataset/f15c8808-0d12-4f97-bfd4-3b2f85ea84d1) |
| [`datos/gtfs/cuenca-buses.zip`](datos/gtfs/cuenca-buses.zip) | **Feed GTFS** de los buses urbanos (38 líneas, frecuencias de lunes a viernes, sábados y domingos), validado sin errores con el validador oficial de MobilityData | Generado a partir de los datos del municipio |
| [`datos/buses/paradas.geojson`](datos/buses/paradas.geojson) | Paradas de bus con coordenadas corregidas y si tienen señal (paleta) | [Cuenca en Datos](https://cuencaendatos.cuenca.gob.ec/dataset/d98292ca-7c70-422a-ac6f-1b43194ff5ba) |
| [`datos/buses/tranvia.geojson`](datos/buses/tranvia.geojson) | Las 20 estaciones del tranvía, con un punto por andén y el sentido en que para en cada una | [Tranvía de Cuenca](https://tranvia.cuenca.gob.ec/) |
| [`datos/manual/transporte.json`](datos/manual/transporte.json) | **Mantenido a mano**: pasaje del bus y del tranvía, cambios de líneas de 2026 (con fecha de caducidad) y frecuencia del tranvía, cada dato con su fuente | Comunicados del municipio publicados en [El Mercurio](https://elmercurio.com.ec/cuenca/) |
| [`datos/calles/calles.geojson`](datos/calles/calles.geojson) | Las calles de Cuenca con nombre (unas 2.800), con su trazado simplificado y sus nombres alternativos, para buscar direcciones e intersecciones | [OpenStreetMap](https://www.openstreetmap.org) |
| [`datos/farmacias/turnos.json`](datos/farmacias/turnos.json) | Farmacias de turno de Cuenca por semana (de 06:00 a 06:00), con dirección legible y teléfono para llamar | [ARCSA, turnos de farmacias](https://www.controlsanitario.gob.ec/turnos-de-farmacias/) |
| [`datos/movilidad/`](datos/movilidad/) | Estaciones de BiciPública (BiciCuenca) con su capacidad, ciclovías (separadas o carriles pintados) y puntos de carga para autos eléctricos (públicos, para clientes o privados) | [OpenStreetMap](https://www.openstreetmap.org) |
| [`datos/estado.json`](datos/estado.json) | Cuándo se actualizó cada fuente por última vez y si hubo errores | — |

Todos los archivos se pueden descargar directamente desde
`https://nezusas.github.io/morlaco/datos/...`, por ejemplo
<https://nezusas.github.io/morlaco/datos/recoleccion/zonas.geojson>.

### Ejemplo: una zona de recolección

```json
{
  "zona": 4,
  "nombre": "Zona 4",
  "dias": ["lunes", "miércoles", "viernes"],
  "dias_iso": [1, 3, 5],
  "desde": "20:00",
  "hasta": "24:00",
  "dia_reciclaje": "miércoles"
}
```

Para saber la zona de una dirección, basta con comprobar en qué polígono cae su coordenada. Por ejemplo, el
Parque Calderón está en la zona 4.

### Lo que hay que saber de cada fuente

- **Recolección (EMAC).** Viene del mapa de Google que EMAC publica en su web. Según EMAC, la funda
  celeste (reciclables) se recoge los miércoles o los jueves; `dia_reciclaje` indica cuál toca en cada zona.
  Con las mismas zonas se generan los calendarios `.ics`: quien se suscribe recibe los cambios de horario
  sin hacer nada, porque su app vuelve a leer el archivo cada día.
- **Cortes de luz (Centro Sur).** Se leen de los PDF diarios que Centro Sur publica. Las direcciones son texto
  tal como lo escribe Centro Sur, sin coordenadas. **En noviembre de 2026 la página no se actualizaba desde
  julio**: revisa `metadata.ultima_publicacion` antes de fiarte de estos datos. Desde octubre de 2026 Centro
  Sur publica además cronogramas sueltos (carteles en PDF, sin tabla) en su página "Programación de cortes";
  Morlaco los busca allí y en la biblioteca de medios del sitio (API de WordPress) y anota de qué día son, de
  qué provincias hablan y si mencionan Cuenca. Si uno menciona Cuenca, la página lo avisa y enlaza el PDF.
- **Tranvía.** Las estaciones salen de la API pública que usa su web. El horario en vivo de la web llega por un
  canal no documentado y no se usa; se muestra la frecuencia publicada (cada 8 minutos entre semana y 15 los
  fines de semana, desde octubre de 2025).
- **Pasaje y cambios de líneas (a mano).** El municipio no publica en datos abiertos el pasaje ni las
  ampliaciones de rutas de 2026, así que [`datos/manual/transporte.json`](datos/manual/transporte.json) se
  edita a mano a partir de comunicados publicados en prensa. Cada aviso tiene fecha `hasta` y deja de mostrarse
  después; `tests/test_manual.py` comprueba que el archivo esté completo antes de publicarlo.
- **Buses (municipio).** Se toma siempre el CSV más reciente del portal. En el CSV de paradas las coordenadas
  vienen mal formateadas (`-2.895.956` en vez de `-2.895956`); Morlaco las corrige y descarta las que caen
  fuera de Cuenca (`metadata.descartadas`). No hay posiciones de buses en tiempo real: no son públicas.
  El recorrido de cada línea sale del shapefile del mismo conjunto (en UTM 17 Sur, convertido a
  latitud y longitud). **El último publicado es de septiembre de 2022**, así que algunas líneas pueden haber
  cambiado; los horarios y frecuencias sí son de 2025.
- **Calles (OpenStreetMap).** Se descargan con la API Overpass todas las vías con nombre de la ciudad, se
  agrupan por nombre y se simplifica su trazado con 4 m de tolerancia. Overpass a veces está saturado; si
  falla, basta con volver a correr `morlaco actualizar calles`.
- **BiciPública, ciclovías y carga eléctrica (OpenStreetMap).** El portal municipal también las publica, pero sus
  versiones actuales vienen en archivos RAR (que necesitan un programa aparte) y los puntos de carga solo como
  enlace a un mapa externo. OpenStreetMap las tiene en un formato abierto y al día.
- **Farmacias de turno (ARCSA).** Se leen del PDF mensual de Azuay. La tabla tiene celdas combinadas y textos
  partidos que Morlaco reconstruye, y **errores de la propia fuente**: años mal escritos (que se corrigen),
  farmacias de otros cantones listadas como de Cuenca (se descartan las que nombran otro cantón) y teléfonos
  de otras provincias o de relleno. La página pide **llamar antes de ir** y enlaza el PDF oficial. Las
  direcciones de esquina se ubican con el índice de calles para ordenar por cercanía.
- **Cortes de agua (ETAPA).** Todavía no están. ETAPA los anuncia en redes sociales y en prensa, no en un
  formato que se pueda leer de forma fiable.

## Buses en formato GTFS

[`datos/gtfs/cuenca-buses.zip`](https://nezusas.github.io/morlaco/datos/gtfs/cuenca-buses.zip) es un feed
[GTFS](https://gtfs.org/es/), el formato estándar de horarios que usan las apps de transporte, con las 38 líneas
de bus urbano de Cuenca. Pasa el [validador oficial de MobilityData](https://gtfs-validator.mobilitydata.org/)
sin errores ni avisos.

Cómo está hecho, con lo que publica el municipio:

- **Rutas, sentidos y frecuencias** ("cada 9 min de 05:50 a 21:15"), del CSV de rutas (2025). Es un feed de
  frecuencias (`frequencies.txt`): el municipio no publica horarios exactos por parada.
- **Recorridos** (`shapes.txt`), del shapefile de rutas (septiembre de 2022).
- **Paradas**: las terminales de cada recorrido y las paradas registradas por el municipio que quedan a menos
  de 25 m del recorrido, en orden.
- **Tiempos entre paradas**: estimados a 15 km/h de media, porque no hay tiempos de viaje publicados.

No incluye el tranvía, los alimentadores ni los alargues, que no tienen horarios en el CSV. Los nombres de las
empresas vienen del CSV; como `agency_url` se usa la web de la EMOV, que regula el transporte.

Para que estas rutas aparezcan en Google Maps, Google pide que el feed lo envíe el operador o la autoridad de
transporte: este archivo puede servir de base para proponérselo a la EMOV o al municipio.

## ¿Qué bus me lleva?

Desde la respuesta de la página se escribe un destino y Morlaco busca, con los recorridos y las frecuencias
del municipio:

- **líneas directas**: pasan a menos de 500 m del origen y, más adelante en su recorrido (en el sentido
  correcto), a menos de 500 m del destino;
- **con un transbordo**, si no hay al menos dos directas: dos líneas cuyos recorridos se acercan a menos de
  200 m;
- **a pie**, si el destino está a menos de 1,5 km (se prefiere caminar si tarda casi lo mismo).

El tiempo suma lo que se camina (4,5 km/h), lo que se va en bus (15 km/h) y la espera (media frecuencia de
hoy). Las opciones con un bus que ya no pasa a esa hora quedan al final y lo dicen. El tranvía no tiene horario
publicado: se remite a su web. Todo se calcula en el navegador, en milisegundos (`web/rutas.js`).

## La página web

En [`web/`](web/) hay una página que usa estos datos, publicada en
<https://nezusas.github.io/morlaco/web/>: escribes tu dirección, compartes tu ubicación o tocas
el mapa, y te dice cuándo pasa el recolector (y si toca funda celeste), si hay cortes de luz programados y
qué paradas de bus tienes cerca. El punto elegido queda en la dirección de la página
(`web/#-2.89733,-79.00454`), así que se puede compartir. Desde la respuesta te puedes suscribir al
calendario de recolección de tu zona.

Mientras escribes, **sugiere calles** del índice; después de "y" solo propone las que cruzan la primera, así que
la esquina siempre existe. La página abre con el último punto que consultaste y puedes guardar dos lugares,
**Casa** y **Trabajo**, para volver a ellos con un toque; se guardan solo en tu navegador. Si tocas el mapa o
usas tu ubicación, el punto toma el nombre de la esquina más cercana.

**Se puede instalar como app** en el móvil o el computador: en Android y en Chrome o Edge aparece el botón
"Instalar"; en el iPhone, desde Safari con Compartir → "Añadir a pantalla de inicio". Funciona **sin conexión**
con los últimos datos descargados (útil en un corte de luz o sin datos): el service worker (`web/sw.js`) pide
primero la página y los datos a la red y, si no hay conexión, usa la copia guardada. Guarda también las
teselas del mapa ya vistas (hasta 300) y nunca las búsquedas de lugares.

La página está en **español e inglés**: elige el idioma del navegador y tiene un botón para cambiarlo. Lo que
viene de las fuentes (nombres de calles, paradas y destinos) se queda como se dice en Cuenca.

Las direcciones se escriben como se dan en Cuenca, con dos calles que se cruzan: "Sucre y Borrero",
"Av. Solano y Remigio Crespo", "Bolívar esquina Benigno Malo". La búsqueda se hace dentro de la página con el
índice de calles: no importan las tildes ni las mayúsculas, tolera una letra de más o de menos y entre calles
con nombre parecido elige la que de verdad cruza a la otra. Si escribes una sola calle larga, la marca en el
mapa y te pide la calle que la cruza. Solo cuando lo escrito no es una calle (un parque, un centro
comercial) se pregunta a Nominatim de OpenStreetMap.

Para verla en tu computadora, sirve la carpeta del proyecto (no solo `web/`, porque lee los datos de
`datos/`) y abre <http://127.0.0.1:8765/web/>:

```bash
.venv/Scripts/python -m http.server 8765 --bind 127.0.0.1
```

Usa [Leaflet](https://leafletjs.com) y los mapas de OpenStreetMap. Los lugares que no son calles se ubican
con [Nominatim](https://nominatim.org), limitado a la ciudad de Cuenca; la página lo avisa al pie. No usa
cookies ni analítica: solo recuerda en el navegador el último punto elegido.

## Uso

Requiere Python 3.10 o superior.

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"     # en Linux o macOS: .venv/bin/python
```

Actualizar todos los datos (escribe en `datos/`):

```bash
.venv/Scripts/python -m morlaco actualizar
```

O solo algunas fuentes: `recoleccion`, `luz`, `buses`, `calles`, `movilidad`, `farmacias`, `tranvia`.

```bash
.venv/Scripts/python -m morlaco actualizar recoleccion buses
```

Si una fuente falla, las demás se actualizan igual, el comando termina con código 1 y el error queda en
`datos/estado.json` junto con la fecha de la última actualización buena. Los archivos de datos no llevan la
fecha de generación, así que solo cambian cuando cambia la fuente.

### Actualización automática

El workflow [`actualizar-datos.yml`](.github/workflows/actualizar-datos.yml) lo hace solo en GitHub:

- **Todos los días a las 06:00** de Cuenca revisa las fuentes que cambian seguido: `recoleccion`, `luz`,
  `farmacias` y `tranvia`.
- **Los lunes a las 06:30** revisa todas y publica aunque no haya cambios, para que conste la revisión.
- Antes de publicar pasa todas las pruebas con los datos nuevos. Si alguna falla, no publica nada.
- Publica en `main` solo si algún archivo de datos cambió o si una fuente empezó a fallar o se recuperó. Eso lo
  decide `morlaco cambios`.
- Si una fuente falla, publica el resto y la ejecución queda en rojo, así que GitHub avisa por correo.
- También se puede lanzar a mano desde la pestaña *Actions*, con todas las fuentes o solo algunas.

## Desarrollo

```bash
.venv/Scripts/python -m pytest
.venv/Scripts/python -m ruff check .
.venv/Scripts/python -m ruff format --check .
node --test "tests/web/*.test.mjs"
```

Las pruebas no usan la red: el parseo de cada fuente son funciones puras que se prueban con ejemplos (el PDF
de Centro Sur de `tests/fixtures` es uno real). En la web pasa lo mismo: `web/logica.js` y `web/calles.js` no
tocan el DOM ni la red, y sus pruebas corren con Node 20 o superior.

```
src/morlaco/
  red.py              descargas HTTP con reintentos (lo único que toca la red)
  comun.py            texto, horas, días y meses
  salida.py           escritura de JSON, GeoJSON y texto
  calendario.py       calendarios .ics de recolección por zona
  gtfs.py             feed GTFS de los buses (rutas, frecuencias, paradas y recorridos)
  geo.py              conversión de UTM a latitud y longitud
  cli.py              comandos "morlaco actualizar" y "morlaco cambios"
  cambios.py          decide si hay algo que publicar tras actualizar
  fuentes/
    emac.py           zonas de recolección (KML)
    centrosur.py      suspensiones de luz (PDF) y cronogramas sueltos (API de WordPress)
    buses.py          rutas, recorridos y paradas (API CKAN del portal municipal)
    trazados.py       recorrido de las líneas (shapefile del municipio)
    movilidad.py      BiciPública, ciclovías y carga eléctrica (API Overpass)
    farmacias.py      farmacias de turno (PDF mensual de ARCSA)
    tranvia.py        estaciones del tranvía (API de su web)
    calles.py         índice de calles (API Overpass de OpenStreetMap)
web/
  index.html          la página
  logica.js           zonas, próxima recolección, cortes de hoy, paradas cercanas (sin DOM)
  textos.js           textos de la interfaz en español e inglés
  sw.js               service worker: la página y los datos sin conexión
  manifest.webmanifest  datos para instalar la página como app
  calles.js           búsqueda de calles e intersecciones (sin DOM)
  buses.js            líneas cercanas y su frecuencia del día (sin DOM)
  rutas.js            "¿qué bus me lleva?": directas, con transbordo o a pie (sin DOM)
  app.js              mapa, búsqueda y pintado de la respuesta
  estilos.css
```

Para añadir una fuente: crea un módulo en `fuentes/` con una función `obtener(descargar) -> Resultado`,
regístrala en `FUENTES` de `cli.py` y añade sus pruebas.

## Próximos pasos

- Cortes de agua de ETAPA y un bot de Telegram.

## Colaborar

Puedes ayudar sin programar: [avisa si no encuentra tu esquina](https://github.com/NezuSas/morlaco/issues/new?template=direccion.yml),
[si un dato está mal](https://github.com/NezuSas/morlaco/issues/new?template=dato.yml) o
[propón una idea](https://github.com/NezuSas/morlaco/issues/new?template=idea.yml). Si programas, la
[guía para colaborar](CONTRIBUTING.md) explica cómo preparar el proyecto y tiene tareas para empezar.

Las universidades de Cuenca piden horas de vinculación con la sociedad: Morlaco es un buen lugar para hacerlas.

## Licencia de los datos

El código es software libre bajo la [licencia MIT](LICENSE).

Los datos mantienen la licencia de su fuente. Los conjuntos del portal Cuenca en Datos (rutas, recorridos,
paradas y el mapa de zonas de recolección) están publicados bajo **Creative Commons No Comercial**: se
pueden usar y compartir citando la fuente, pero no con fines comerciales. Los PDF de Centro Sur son
información pública de su web.

El índice de calles (`datos/calles/`) es una base de datos derivada de OpenStreetMap y se distribuye bajo la
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/): © colaboradores de
OpenStreetMap. Quien lo reutilice debe citar a OpenStreetMap y compartir sus mejoras bajo la misma licencia.
