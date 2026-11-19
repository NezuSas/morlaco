"""Comprobaciones del feed GTFS publicado, para la revisión diaria.

El validador oficial (MobilityData) necesita Java y una descarga en cada ejecución.
Esto no lo sustituye: revisa en Python lo que más se rompe cuando cambian los datos
del portal o de la IDE. Revisa que estén los archivos y que cada referencia apunte
a algo que existe, que no haya rutas, viajes ni recorridos vacíos, que el orden y
las distancias de las paradas avancen, que las paradas caigan en Cuenca y que el
feed no esté por vencer.
"""

from __future__ import annotations

import csv
import io
import zipfile
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from typing import Any

ARCHIVOS = (
    "agency.txt",
    "routes.txt",
    "trips.txt",
    "stops.txt",
    "stop_times.txt",
    "frequencies.txt",
    "shapes.txt",
    "calendar.txt",
    "feed_info.txt",
)
# Un rectángulo holgado alrededor del cantón Cuenca.
LATITUD = (-3.35, -2.5)
LONGITUD = (-79.65, -78.7)
DIAS_VIGENCIA = 60  # aviso si el feed vence en menos de esto
EJEMPLOS = 3


def _tablas(contenido: bytes) -> dict[str, list[dict[str, str]]]:
    with zipfile.ZipFile(io.BytesIO(contenido)) as z:
        return {
            nombre: list(csv.DictReader(io.StringIO(z.read(nombre).decode("utf-8-sig"))))
            for nombre in z.namelist()
            if nombre.endswith(".txt")
        }


def _lista(problema: str, casos: list[str]) -> str:
    unicos = list(dict.fromkeys(casos))
    muestra = ", ".join(unicos[:EJEMPLOS])
    resto = f" y {len(unicos) - EJEMPLOS} más" if len(unicos) > EJEMPLOS else ""
    return f"{problema}: {muestra}{resto}."


def _numero(texto: str) -> float | None:
    try:
        return float(texto)
    except (TypeError, ValueError):
        return None


def _segundos(hora: str) -> int | None:
    try:
        h, m, s = (int(x) for x in hora.split(":"))
    except (AttributeError, ValueError):
        return None
    return h * 3600 + m * 60 + s


def _ids_repetidos(filas: list[dict[str, str]], campo: str) -> list[str]:
    return [k for k, n in Counter(f.get(campo, "") for f in filas).items() if n > 1]


def problemas(contenido: bytes, hoy: date) -> list[str]:
    """Los problemas del feed, en frases para una persona. Vacío si todo está bien."""
    try:
        t = _tablas(contenido)
    except (zipfile.BadZipFile, UnicodeDecodeError, csv.Error) as error:
        return [f"El ZIP del feed no se puede leer ({error})."]

    faltan = [a for a in ARCHIVOS if a not in t]
    if faltan:
        return [_lista("Faltan archivos en el feed", faltan)]

    salida: list[str] = []
    vacios = [a for a in ARCHIVOS if not t[a]]
    if vacios:
        salida.append(_lista("Archivos del feed sin filas", vacios))

    agencias = {f["agency_id"] for f in t["agency.txt"]}
    rutas = {f["route_id"] for f in t["routes.txt"]}
    servicios = {f["service_id"] for f in t["calendar.txt"]}
    formas = {f["shape_id"] for f in t["shapes.txt"]}
    paradas = {f["stop_id"] for f in t["stops.txt"]}
    viajes = {f["trip_id"] for f in t["trips.txt"]}

    for archivo, campo in (
        ("agency.txt", "agency_id"),
        ("routes.txt", "route_id"),
        ("trips.txt", "trip_id"),
        ("stops.txt", "stop_id"),
        ("calendar.txt", "service_id"),
    ):
        if repetidos := _ids_repetidos(t[archivo], campo):
            salida.append(_lista(f"`{campo}` repetido en {archivo}", repetidos))

    # Referencias que no llevan a nada.
    for archivo, campo, validos in (
        ("routes.txt", "agency_id", agencias),
        ("trips.txt", "route_id", rutas),
        ("trips.txt", "service_id", servicios),
        ("trips.txt", "shape_id", formas),
        ("stop_times.txt", "trip_id", viajes),
        ("stop_times.txt", "stop_id", paradas),
        ("frequencies.txt", "trip_id", viajes),
    ):
        if rotos := [f.get(campo, "") for f in t[archivo] if f.get(campo, "") not in validos]:
            salida.append(_lista(f"{archivo} usa un `{campo}` que no existe", rotos))

    # Cosas que existen pero nadie usa, o que no sirven.
    con_viajes = {f["route_id"] for f in t["trips.txt"]}
    if sin := sorted(rutas - con_viajes):
        salida.append(_lista("Rutas sin viajes", sin))
    usadas = {f["stop_id"] for f in t["stop_times.txt"]}
    if sin := sorted(paradas - usadas):
        salida.append(_lista("Paradas que ningún viaje usa", sin))
    con_frecuencia = {f["trip_id"] for f in t["frequencies.txt"]}
    if sin := sorted(viajes - con_frecuencia):
        salida.append(_lista("Viajes sin frecuencia", sin))

    # Paradas de cada viaje: al menos dos, en orden, con hora y distancia que avanzan.
    por_viaje: dict[str, list[dict[str, str]]] = defaultdict(list)
    for f in t["stop_times.txt"]:
        por_viaje[f["trip_id"]].append(f)
    cortos, desordenados = [], []
    for viaje in sorted(viajes):
        filas = sorted(por_viaje.get(viaje, []), key=lambda f: _numero(f["stop_sequence"]) or 0)
        if len(filas) < 2:
            cortos.append(viaje)
            continue
        horas = [_segundos(f["arrival_time"]) for f in filas]
        metros = [_numero(f.get("shape_dist_traveled", "")) for f in filas]
        if (
            None in horas
            or None in metros
            or any(b < a for a, b in zip(horas, horas[1:], strict=False))
            or any(b <= a for a, b in zip(metros, metros[1:], strict=False))
        ):
            desordenados.append(viaje)
    if cortos:
        salida.append(_lista("Viajes con menos de dos paradas", cortos))
    if desordenados:
        salida.append(_lista("Viajes cuya hora o distancia retrocede entre paradas", desordenados))

    # Recorridos: al menos dos puntos y distancia que no retrocede.
    puntos: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for f in t["shapes.txt"]:
        puntos[f["shape_id"]].append(
            (_numero(f["shape_pt_sequence"]) or 0, _numero(f.get("shape_dist_traveled")) or 0)
        )
    malos = [
        forma
        for forma, filas in sorted(puntos.items())
        if len(filas) < 2
        or any(b[1] < a[1] for a, b in zip(sorted(filas), sorted(filas)[1:], strict=False))
    ]
    if malos:
        salida.append(_lista("Recorridos con menos de dos puntos o distancia que retrocede", malos))

    # Paradas fuera de Cuenca o sin coordenadas.
    def en_cuenca(f: dict[str, str]) -> bool:
        lat, lon = _numero(f.get("stop_lat", "")), _numero(f.get("stop_lon", ""))
        return (
            lat is not None
            and lon is not None
            and LATITUD[0] <= lat <= LATITUD[1]
            and LONGITUD[0] <= lon <= LONGITUD[1]
        )

    if fuera := [f["stop_id"] for f in t["stops.txt"] if not en_cuenca(f)]:
        salida.append(_lista("Paradas fuera de Cuenca o sin coordenadas", fuera))

    # Frecuencias que no tienen sentido.
    def frecuencia_mala(f: dict[str, Any]) -> bool:
        inicio, fin = _segundos(f["start_time"]), _segundos(f["end_time"])
        intervalo = _numero(f["headway_secs"])
        return inicio is None or fin is None or fin <= inicio or not intervalo or intervalo <= 0

    if malas := [f["trip_id"] for f in t["frequencies.txt"] if frecuencia_mala(f)]:
        salida.append(_lista("Frecuencias con horas o intervalo imposibles", malas))

    # Vigencia: las apps descartan los feeds vencidos.
    fines = []
    for f in t["calendar.txt"]:
        try:
            fines.append(datetime.strptime(f["end_date"], "%Y%m%d").date())
        except ValueError:
            salida.append(f"El servicio `{f['service_id']}` tiene una fecha de fin ilegible.")
    if fines and (fin := min(fines)) - hoy <= timedelta(days=DIAS_VIGENCIA):
        cuando = "venció" if fin < hoy else "vence"
        salida.append(
            f"El calendario del feed {cuando} el {fin.isoformat()}: alarga `FIN` en "
            "`src/morlaco/gtfs.py`."
        )
    return salida
