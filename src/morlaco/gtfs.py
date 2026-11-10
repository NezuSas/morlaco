"""Feed GTFS de los buses urbanos de Cuenca, a partir de los datos del municipio.

GTFS es el formato estándar de horarios de transporte público que usan las apps
de transporte. Este feed es de frecuencias ("cada 9 minutos de 05:50 a 21:15"),
porque es lo que publica el municipio: no hay horarios exactos por parada.

Cómo se arma, con lo que hay:

- Rutas, sentidos, horarios y frecuencias: CSV de rutas del portal (2025).
- Recorrido (shapes.txt): shapefile de rutas del portal (septiembre de 2022).
- Paradas: las terminales de cada recorrido más las paradas registradas por el
  municipio que quedan a menos de 25 m del recorrido, en orden.
- Tiempos entre paradas: estimados con una velocidad media de 15 km/h, porque el
  municipio no publica tiempos de viaje.

El tranvía, los alimentadores y los alargues no tienen horarios publicados en
el CSV, así que no entran en el feed.
"""

from __future__ import annotations

import csv
import hashlib
import io
import math
import re
import zipfile
from typing import Any

from morlaco.comun import limpiar, sin_tildes
from morlaco.fuentes.trazados import nombre_propio

PAGINA = "https://nezusas.github.io/morlaco/web/"
REPORTES = "https://github.com/NezuSas/morlaco/issues/new/choose"
URL_AGENCIA = "https://www.emov.gob.ec/"
ZONA_HORARIA = "America/Guayaquil"
# Vigencia del feed. Se revisa cada año (las apps descartan feeds vencidos).
INICIO = "20260101"
FIN = "20271231"
VELOCIDAD_KMH = 15
DISTANCIA_PARADA_M = 25
SERVICIOS = {
    "lunes_viernes": ("LV", (1, 1, 1, 1, 1, 0, 0)),
    "sabados": ("SA", (0, 0, 0, 0, 0, 1, 0)),
    "domingos": ("DO", (0, 0, 0, 0, 0, 0, 1)),
}
_METROS_POR_GRADO = 111_320
_COS_CUENCA = math.cos(math.radians(-2.9))


def _a_metros(lon: float, lat: float) -> tuple[float, float]:
    return lon * _METROS_POR_GRADO * _COS_CUENCA, lat * _METROS_POR_GRADO


def _distancia(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def recorrido_acumulado(puntos: list[list[float]]) -> list[float]:
    """Metros recorridos hasta cada punto de la línea."""
    acumulado = [0.0]
    metros = [_a_metros(lon, lat) for lon, lat in puntos]
    for anterior, actual in zip(metros, metros[1:], strict=False):
        acumulado.append(acumulado[-1] + _distancia(anterior, actual))
    return acumulado


def proyectar(
    punto: list[float], linea: list[list[float]], acumulado: list[float]
) -> tuple[float, float]:
    """(metros desde el inicio de la línea, distancia a la línea) del punto más cercano."""
    p = _a_metros(*punto)
    mejor = (math.inf, 0.0)
    metros = [_a_metros(lon, lat) for lon, lat in linea]
    for i in range(1, len(metros)):
        a, b = metros[i - 1], metros[i]
        dx, dy = b[0] - a[0], b[1] - a[1]
        largo2 = dx * dx + dy * dy
        t = (
            0.0
            if largo2 == 0
            else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / largo2))
        )
        q = (a[0] + t * dx, a[1] + t * dy)
        distancia = _distancia(p, q)
        if distancia < mejor[0]:
            mejor = (distancia, acumulado[i - 1] + t * (acumulado[i] - acumulado[i - 1]))
    return mejor[1], mejor[0]


def hora_gtfs(segundos: float) -> str:
    segundos = round(segundos)
    return f"{segundos // 3600:02d}:{segundos % 3600 // 60:02d}:{segundos % 60:02d}"


def _segundos(hhmm: str) -> int:
    horas, minutos = (int(x) for x in hhmm.split(":")[:2])
    return horas * 3600 + minutos * 60


def _clave(texto: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", sin_tildes(texto.lower())).strip("-")


def nombre_parada(ubicacion: str) -> str:
    """'CALLE SANGURIMA INTERSECCION LUIS CORDERO' -> 'Calle Sangurima y Luis Cordero'."""
    return nombre_propio(
        re.sub(r"\s+INTERSECCI[OÓ]N\s+", " y ", limpiar(ubicacion), flags=re.IGNORECASE)
    )


def _parecido(a: str, b: str) -> int:
    return len(set(_clave(a).split("-")) & set(_clave(b).split("-")))


def elegir_trazados(
    lineas: list[dict[str, Any]], rutas: list[dict[str, Any]]
) -> dict[tuple[str, str], dict]:
    """El trazado de cada (línea, sentido). Si una línea tiene dos trazados con el mismo
    sentido (pasa con la 11B), el que mejor coincide con el destino de ida pasa a ser la ida."""
    por_linea: dict[str, list[dict]] = {}
    for f in lineas:
        if f["properties"]["tipo"] == "linea":
            por_linea.setdefault(f["properties"]["linea"], []).append(f)
    elegidos: dict[tuple[str, str], dict] = {}
    for linea, formas in por_linea.items():
        for f in formas:
            elegidos.setdefault((linea, f["properties"]["sentido"]), f)
        sobrantes = [f for f in formas if f not in elegidos.values()]
        falta = next((s for s in ("ida", "retorno") if (linea, s) not in elegidos), None)
        if sobrantes and falta:
            destino = next(
                (r["destino"] for r in rutas if r["linea"] == linea and r["sentido"] == falta), ""
            )
            candidatos = [*sobrantes, elegidos[(linea, "retorno" if falta == "ida" else "ida")]]
            mejor = max(candidatos, key=lambda f: _parecido(f["properties"]["hacia"], destino))
            otro_sentido = "retorno" if falta == "ida" else "ida"
            if mejor is elegidos[(linea, otro_sentido)]:
                elegidos[(linea, otro_sentido)] = sobrantes[0]
            elegidos[(linea, falta)] = mejor
    return elegidos


def _linea_principal(geometria: dict[str, Any]) -> list[list[float]]:
    if geometria["type"] == "LineString":
        return geometria["coordinates"]
    return max(geometria["coordinates"], key=len)


def _terminal(
    paradas: dict[str, list[Any]], ruta_id: str, nombre: str, punto: list[float]
) -> list[Any]:
    """La parada de una terminal. La llegada de un sentido y la salida del otro comparten
    parada solo si están a menos de 150 m; si no, son paradas distintas con el mismo nombre."""
    base = f"T-{ruta_id}-{_clave(nombre)}"
    for n in range(1, 10):
        parada_id = base if n == 1 else f"{base}-{n}"
        existente = paradas.get(parada_id)
        if existente is None:
            return [parada_id, f"{nombre_propio(nombre)} (terminal)", punto[1], punto[0]]
        cerca = (
            _distancia(_a_metros(punto[0], punto[1]), _a_metros(existente[3], existente[2])) < 150
        )
        if cerca:
            return existente
    raise ValueError(f"Demasiadas terminales distintas llamadas {nombre!r} en {ruta_id}")


SIGLAS_EMPRESA = {"SIT"}


def nombre_empresa(texto: str) -> str:
    """'TURISMO BANIOS' -> 'Turismo Baños' (en los datos la ñ viene escrita como 'NI').
    Las siglas conocidas se dejan en mayúsculas."""
    if limpiar(texto).upper() in SIGLAS_EMPRESA:
        return limpiar(texto).upper()
    return re.sub(r"Banios\b", "Baños", nombre_propio(texto))


def extremos(
    linea: str, sentido: str, fila: dict[str, Any], trazados: dict[tuple[str, str], dict]
) -> tuple[str, str]:
    """Origen y destino de un sentido. Algunas filas del CSV vienen sin origen o sin destino;
    entonces se toman del trazado: su destino, o el destino del otro sentido."""

    def hacia(s: str) -> str:
        forma = trazados.get((linea, s))
        return forma["properties"]["hacia"] if forma else ""

    otro = "retorno" if sentido == "ida" else "ida"
    return fila["origen"] or hacia(otro) or "Inicio", fila["destino"] or hacia(sentido) or "Final"


def _csv(encabezado: list[str], filas: list[list[Any]]) -> str:
    salida = io.StringIO()
    escritor = csv.writer(salida, lineterminator="\n")
    escritor.writerow(encabezado)
    escritor.writerows(filas)
    return salida.getvalue()


def construir(
    rutas: list[dict[str, Any]], lineas: list[dict[str, Any]], paradas: list[dict[str, Any]]
) -> tuple[dict[str, str], dict[str, Any]]:
    """Los archivos del feed (nombre -> contenido CSV) y un resumen."""
    trazados = elegir_trazados(lineas, rutas)
    agencias: dict[str, str] = {}
    rutas_gtfs, viajes, frecuencias, formas, horarios_parada = [], [], [], [], []
    paradas_gtfs: dict[str, list[Any]] = {}
    servicios_usados: set[str] = set()
    sin_trazado: list[str] = []

    def numero(linea: str) -> tuple[int, str]:
        coincide = re.match(r"\d+", linea)
        return (int(coincide.group()) if coincide else 10**6, linea)

    for linea in sorted({r["linea"] for r in rutas}, key=numero):
        filas = {r["sentido"]: r for r in rutas if r["linea"] == linea}
        if not any((linea, s) in trazados for s in filas):
            sin_trazado.append(linea)
            continue

        sentido_ida = "ida" if "ida" in filas else next(iter(filas))
        ida = filas[sentido_ida]
        origen_ida, destino_ida = extremos(linea, sentido_ida, ida, trazados)
        agencia = _clave(ida["compania"]) or "sin-empresa"
        agencias[agencia] = nombre_empresa(ida["compania"]) if ida["compania"] else "Sin empresa"
        ruta_id = f"L{linea}"
        rutas_gtfs.append(
            [
                ruta_id,
                agencia,
                linea,
                f"{nombre_propio(origen_ida)} - {nombre_propio(destino_ida)}",
                3,
                PAGINA,
            ]
        )
        for sentido, fila in filas.items():
            forma = trazados.get((linea, sentido))
            if not forma:
                continue
            puntos = _linea_principal(forma["geometry"])
            origen, destino = extremos(linea, sentido, fila, trazados)
            acumulado = recorrido_acumulado(puntos)
            forma_id = f"{ruta_id}-{sentido}"
            formas += [
                [forma_id, lat, lon, i + 1, round(d, 1)]
                for i, ((lon, lat), d) in enumerate(zip(puntos, acumulado, strict=True))
            ]

            # Paradas: terminal de salida, paradas registradas cercanas, terminal de llegada.
            total = acumulado[-1]
            candidatas: list[tuple[float, str, list[Any]]] = []
            for extremo, metros, nombre in (
                (puntos[0], 0.0, origen),
                (puntos[-1], total, destino),
            ):
                parada = _terminal(paradas_gtfs, ruta_id, nombre, extremo)
                candidatas.append((metros, parada[0], parada))
            for p in paradas:
                lon, lat = p["geometry"]["coordinates"]
                metros, distancia = proyectar([lon, lat], puntos, acumulado)
                if distancia <= DISTANCIA_PARADA_M and 30 < metros < total - 30:
                    parada_id = f"P{p['properties']['id']}"
                    nombre = nombre_parada(p["properties"]["ubicacion"])
                    candidatas.append((metros, parada_id, [parada_id, nombre, lat, lon]))
            candidatas.sort(key=lambda c: c[0])
            # Cada parada una vez y con distancias estrictamente crecientes (ya redondeadas).
            vistas: set[str] = set()
            ordenadas: list[tuple[float, str]] = []
            for metros, parada_id, fila_parada in candidatas:
                metros = round(metros, 1)
                if parada_id in vistas or (ordenadas and metros <= ordenadas[-1][0]):
                    continue
                vistas.add(parada_id)
                ordenadas.append((metros, parada_id))
                paradas_gtfs.setdefault(parada_id, fila_parada)

            direccion = 0 if sentido == "ida" else 1
            for dia, (servicio, _) in SERVICIOS.items():
                horario = fila["horarios"].get(dia)
                if (
                    not horario
                    or not horario.get("inicio")
                    or not horario.get("fin")
                    or not horario.get("intervalo_min")
                ):
                    continue
                servicios_usados.add(servicio)
                viaje_id = f"{ruta_id}-{sentido}-{servicio}"
                viajes.append(
                    [
                        ruta_id,
                        servicio,
                        viaje_id,
                        nombre_propio(destino),
                        direccion,
                        forma_id,
                    ]
                )
                inicio = _segundos(horario["inicio"])
                fin = _segundos(horario["fin"])
                if fin <= inicio:
                    fin += 24 * 3600
                frecuencias.append(
                    [viaje_id, hora_gtfs(inicio), hora_gtfs(fin), horario["intervalo_min"] * 60, 0]
                )
                velocidad = VELOCIDAD_KMH * 1000 / 3600
                for orden, (metros, parada_id) in enumerate(ordenadas, 1):
                    hora = hora_gtfs(inicio + metros / velocidad)
                    horarios_parada.append(
                        [viaje_id, hora, hora, parada_id, orden, round(metros, 1)]
                    )

    archivos = {
        "agency.txt": _csv(
            ["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang"],
            [[k, v, URL_AGENCIA, ZONA_HORARIA, "es"] for k, v in sorted(agencias.items())],
        ),
        "routes.txt": _csv(
            [
                "route_id",
                "agency_id",
                "route_short_name",
                "route_long_name",
                "route_type",
                "route_url",
            ],
            rutas_gtfs,
        ),
        "trips.txt": _csv(
            ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id", "shape_id"],
            viajes,
        ),
        "stops.txt": _csv(
            ["stop_id", "stop_name", "stop_lat", "stop_lon"],
            [paradas_gtfs[k] for k in sorted(paradas_gtfs)],
        ),
        "stop_times.txt": _csv(
            [
                "trip_id",
                "arrival_time",
                "departure_time",
                "stop_id",
                "stop_sequence",
                "shape_dist_traveled",
            ],
            horarios_parada,
        ),
        "frequencies.txt": _csv(
            ["trip_id", "start_time", "end_time", "headway_secs", "exact_times"], frecuencias
        ),
        "shapes.txt": _csv(
            [
                "shape_id",
                "shape_pt_lat",
                "shape_pt_lon",
                "shape_pt_sequence",
                "shape_dist_traveled",
            ],
            formas,
        ),
        "calendar.txt": _csv(
            [
                "service_id",
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday",
                "saturday",
                "sunday",
                "start_date",
                "end_date",
            ],
            [
                [sid, *dias, INICIO, FIN]
                for sid, dias in SERVICIOS.values()
                if sid in servicios_usados
            ],
        ),
    }
    huella = hashlib.sha256("".join(archivos[k] for k in sorted(archivos)).encode()).hexdigest()[
        :12
    ]
    archivos["feed_info.txt"] = _csv(
        [
            "feed_publisher_name",
            "feed_publisher_url",
            "feed_lang",
            "feed_start_date",
            "feed_end_date",
            "feed_version",
            "feed_contact_url",
        ],
        [["Morlaco", PAGINA, "es", INICIO, FIN, huella, REPORTES]],
    )
    resumen = {
        "rutas": len(rutas_gtfs),
        "viajes": len(viajes),
        "paradas": len(paradas_gtfs),
        "paradas_registradas": sum(1 for k in paradas_gtfs if k.startswith("P")),
        "sin_trazado": sin_trazado,
        "version": huella,
    }
    return archivos, resumen


def a_zip(archivos: dict[str, str]) -> bytes:
    """Empaqueta el feed. Fecha fija en cada entrada: el ZIP solo cambia si cambian los datos."""
    salida = io.BytesIO()
    with zipfile.ZipFile(salida, "w", zipfile.ZIP_DEFLATED) as archivo:
        for nombre in sorted(archivos):
            info = zipfile.ZipInfo(nombre, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archivo.writestr(info, archivos[nombre].encode("utf-8"))
    return salida.getvalue()
