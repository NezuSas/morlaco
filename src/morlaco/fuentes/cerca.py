"""Servicios cerca de tu calle, del portal Cuenca en Datos: WiFi gratis, mercados,
puntos para dejar pilas usadas y destacamentos de la Guardia Ciudadana.

Los CSV del municipio traen las coordenadas con distintos formatos y errores:
"-291,509" por -2.91509, "-2.899.263" por -2.899263, coordenadas UTM con puntos
de miles ("722.710.848") y, en algunos mercados, longitudes que caen fuera de la
ciudad. Se recupera lo que se puede y se descarta, contándolo, lo que no cae en
Cuenca: es mejor no mostrar un punto que mostrarlo en otro lugar.
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
from typing import Any

from morlaco import geo, red
from morlaco.comun import Resultado, decodificar, limpiar, nombre_propio, sin_tildes
from morlaco.fuentes.buses import _metadata, _paquete, corregir_coordenada, csv_mas_reciente

# El área urbana y sus alrededores: un punto fuera de aquí está mal ubicado.
CAJA = (-79.12, -3.05, -78.90, -2.80)  # oeste, sur, este, norte
# Los mercados municipales están todos en la ciudad: una caja más justa atrapa las longitudes
# a las que les falta una cifra (-79.105738 por -79.0105738).
CAJA_MERCADOS = (-79.07, -2.95, -78.94, -2.84)
CONJUNTOS = {
    "wifi": "76ae0314-b80e-4177-8d02-f130d95fc6a0",
    "mercados": "4cf73282-4aaf-4224-bf78-6712b4598ebe",
    "pilas": "b6bd3be3-aaea-47b2-b746-4eb7ae3caf12",
    "guardia": "30fc3976-acd1-439b-9184-45043eec6c41",
}
_SIN_DATO = {"", "ND", "N/D", "S/N", "0"}
# El índice de calles de Morlaco, para ubicar por su esquina lo que trae coordenadas rotas.
CALLES = "https://nezusas.github.io/morlaco/datos/calles/calles.geojson"
_GENERICAS = {"calle", "av", "avenida", "pasaje", "via", "de", "del", "la", "las", "los", "el", "y"}


def _filas(texto: str) -> list[dict[str, str]]:
    primera = texto.splitlines()[0] if texto.strip() else ""
    separador = ";" if primera.count(";") > primera.count(",") else ","
    lector = csv.DictReader(io.StringIO(texto), delimiter=separador)
    return [{limpiar(k).lower(): limpiar(v or "") for k, v in fila.items() if k} for fila in lector]


def _dato(valor: str | None) -> str | None:
    valor = limpiar(valor or "")
    return None if valor.upper() in _SIN_DATO else valor


def _en_cuenca(lon: float, lat: float, caja: tuple[float, ...] = CAJA) -> bool:
    return caja[0] <= lon <= caja[2] and caja[1] <= lat <= caja[3]


def geograficas(lat: str, lon: str, caja: tuple[float, ...] = CAJA) -> tuple[float, float] | None:
    """(lon, lat) de dos textos en grados, con o sin separadores rotos; None si no es Cuenca."""
    for convertir in (lambda t, n: float(t.replace(",", ".")), corregir_coordenada):
        try:
            punto = (convertir(lon, 2), convertir(lat, 1))
        except (ValueError, TypeError):
            continue
        if _en_cuenca(*punto, caja):
            return punto
    return None


_DIAS = re.compile(
    r"(?i)^(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo) a (\w+)\s*/?\s*"
)
_DIAS_EN = {
    "lunes": "Monday", "martes": "Tuesday", "miercoles": "Wednesday", "jueves": "Thursday",
    "viernes": "Friday", "sabado": "Saturday", "domingo": "Sunday",
}  # fmt: skip


def horario(texto: str | None) -> dict[str, str] | None:
    """El horario de la fuente, legible y en los dos idiomas: '08H00-18H00' -> '08:00 a 18:00'."""
    texto = limpiar(texto or "")
    if not texto or texto.upper() in _SIN_DATO:
        return None
    t = texto.upper()
    if "24/7" in t:
        return {"es": "Todos los días, las 24 horas", "en": "Every day, 24 hours"}
    conexion = re.search(r"(\d+) HORAS CADA (\d+) HORAS", t)
    if conexion:
        n, cada = conexion.groups()
        return {
            "es": f"Conexión de {n} horas cada {cada} horas",
            "en": f"{n} hours of connection every {cada} hours",
        }
    horas = re.findall(r"(\d{1,2})[H:](\d{2})", t)
    franja_es = franja_en = ""
    if len(horas) >= 2:
        (h1, m1), (h2, m2) = horas[:2]
        franja_es = f"de {int(h1):02d}:{m1} a {int(h2):02d}:{m2}"
        franja_en = f"{int(h1):02d}:{m1} to {int(h2):02d}:{m2}"
    dias = _DIAS.match(texto)
    if dias:
        desde, hasta = (sin_tildes(d.lower()) for d in dias.groups())
        if desde in _DIAS_EN and hasta in _DIAS_EN:
            es = f"{desde.capitalize()} a {dias.group(2).lower()}"
            es = (
                es.replace("Miercoles", "Miércoles")
                .replace("Sabado", "Sábado")
                .replace("sabado", "sábado")
                .replace("miercoles", "miércoles")
            )
            en = f"{_DIAS_EN[desde]} to {_DIAS_EN[hasta]}"
            return {"es": f"{es}, {franja_es}".strip(", "), "en": f"{en}, {franja_en}".strip(", ")}
    if franja_es:
        return {"es": franja_es[0].upper() + franja_es[1:], "en": franja_en}
    return {"es": texto[0].upper() + texto[1:].lower(), "en": texto[0].upper() + texto[1:].lower()}


def _direccion(texto: str | None) -> str | None:
    """La dirección legible, sin los "ND" y "S/N" de relleno."""
    texto = re.sub(r"(?i)\b(nd|s/?n)\b", " ", _dato(texto) or "")
    # "PADRE AGUIRRE AGUIRRE": la fuente repite a veces la última palabra.
    texto = re.sub(r"(?i)\b(\w+)(\s+\1\b)+", r"\1", limpiar(texto))
    return nombre_propio(texto) if texto else None


def desde_utm(este: str, norte: str) -> tuple[float, float] | None:
    """(lon, lat) de coordenadas UTM 17 Sur escritas con o sin puntos de miles."""
    try:
        e = float(
            re.sub(r"\D", "", este.split(",")[0])[:6] + "." + re.sub(r"\D", "", este)[6:] or "0"
        )
        n = float(re.sub(r"\D", "", norte)[:7] + "." + re.sub(r"\D", "", norte)[7:] or "0")
    except ValueError:
        return None
    if not (600_000 < e < 800_000 and 9_600_000 < n < 9_750_000):
        return None
    lon, lat = geo.utm_a_geograficas(e, n)
    return (lon, lat) if _en_cuenca(lon, lat) else None


def _palabras(texto: str) -> list[str]:
    palabras = re.findall(r"[a-z0-9]+", sin_tildes(texto.lower()))
    # "PADRE AGUIRRE AGUIRRE": la fuente repite a veces la última palabra.
    sin_repetir = [p for i, p in enumerate(palabras) if i == 0 or p != palabras[i - 1]]
    return [p for p in sin_repetir if p not in _GENERICAS]


def _segmentos(geometria: dict[str, Any]) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    lineas = (
        geometria["coordinates"]
        if geometria["type"] == "MultiLineString"
        else [geometria["coordinates"]]
    )
    return [(a, b) for linea in lineas for a, b in zip(linea, linea[1:], strict=False)]


def _a_metros(p: tuple[float, float]) -> tuple[float, float]:
    return (p[0] * 111_320 * math.cos(math.radians(-2.9)), p[1] * 110_574)


def _de_metros(p: tuple[float, float]) -> tuple[float, float]:
    return (p[0] / (111_320 * math.cos(math.radians(-2.9))), p[1] / 110_574)


def _punto_en_segmento(p, a, b) -> tuple[float, float]:
    dx, dy = b[0] - a[0], b[1] - a[1]
    largo2 = dx * dx + dy * dy
    t = (
        0.0
        if largo2 == 0
        else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / largo2))
    )
    return (a[0] + t * dx, a[1] + t * dy)


def _cerca_entre(s1, s2) -> tuple[float, tuple[float, float]]:
    """La distancia en metros entre dos segmentos y el punto donde se cruzan (o se acercan más)."""
    a, b = _a_metros(s1[0]), _a_metros(s1[1])
    c, d = _a_metros(s2[0]), _a_metros(s2[1])
    r = (b[0] - a[0], b[1] - a[1])
    s = (d[0] - c[0], d[1] - c[1])
    denominador = r[0] * s[1] - r[1] * s[0]
    if denominador:
        t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / denominador
        u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / denominador
        if 0 <= t <= 1 and 0 <= u <= 1:
            return 0.0, _de_metros((a[0] + t * r[0], a[1] + t * r[1]))
    # No se cruzan: el par de puntos más cercano, desde los extremos de cada uno.
    mejor = (math.inf, a)
    for p, q in ((a, _punto_en_segmento(a, c, d)), (b, _punto_en_segmento(b, c, d)),
                 (_punto_en_segmento(c, a, b), c), (_punto_en_segmento(d, a, b), d)):  # fmt: skip
        distancia = math.hypot(p[0] - q[0], p[1] - q[1])
        if distancia < mejor[0]:
            mejor = (distancia, ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2))
    return mejor[0], _de_metros(mejor[1])


def _calles_que_encajan(nombre: str, calles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Las calles cuyo nombre tiene las palabras buscadas (admite una errata: "MARICAL LAMAR")."""
    buscadas = _palabras(nombre)
    if not buscadas:
        return []
    exactas, con_errata = [], []
    for calle in calles:
        nombres = [calle["properties"]["nombre"], *calle["properties"].get("otros_nombres", [])]
        aciertos = max(sum(p in set(_palabras(n)) for p in buscadas) for n in nombres)
        if aciertos == len(buscadas):
            exactas.append(calle)
        elif len(buscadas) > 1 and aciertos >= len(buscadas) - 1:
            con_errata.append(calle)
    # La errata vale solo si ninguna calle encaja del todo: "Mariscal Sucre" no es "Mariscal Lamar".
    return exactas or con_errata


def ubicar_esquina(
    direccion: str, calles: list[dict[str, Any]], lat_aprox: float | None = None
) -> tuple[float, float] | None:
    """(lon, lat) del cruce de las dos calles de una dirección "A Y B", o None si no se cruzan.

    Si se conoce una latitud aproximada (la de la fuente suele estar bien aunque la longitud
    no), se descartan los cruces que quedan lejos de ella.
    """
    partes = re.split(r"(?i)\s+(?:y|e|esquina)\s+", limpiar(direccion), maxsplit=1)
    if len(partes) != 2:
        return None
    candidatas_a = _calles_que_encajan(partes[0], calles)
    candidatas_b = _calles_que_encajan(partes[1], calles)
    mejor: tuple[float, tuple[float, float]] | None = None
    for a in candidatas_a:
        for b in candidatas_b:
            if a is b:
                continue
            for sa in _segmentos(a["geometry"]):
                for sb in _segmentos(b["geometry"]):
                    # Descarte rápido: segmentos a más de unos 300 m no se cruzan.
                    if abs(sa[0][0] - sb[0][0]) > 0.01 or abs(sa[0][1] - sb[0][1]) > 0.01:
                        continue
                    d, punto = _cerca_entre(sa, sb)
                    if lat_aprox is not None and abs(punto[1] - lat_aprox) > 0.004:
                        continue
                    if mejor is None or d < mejor[0]:
                        mejor = (d, punto)
    if mejor is None or mejor[0] > 40:
        return None
    return mejor[1]


def _punto(tipo: str, lon: float, lat: float, **propiedades: Any) -> dict[str, Any]:
    return {
        "type": "Feature",
        "properties": {"tipo": tipo, **{k: v for k, v in propiedades.items() if v is not None}},
        "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
    }


def parsear_wifi(texto: str) -> tuple[list[dict[str, Any]], int]:
    puntos, descartados = [], 0
    for fila in _filas(texto):
        lugar = geograficas(fila.get("latitud", ""), fila.get("longitud", ""))
        if not lugar:
            descartados += 1
            continue
        # La red viene en "TIPO" (ZONA WIFI "AMOR POR CUENCA_ETAPA"); el lugar, en la dirección.
        red_wifi = re.sub(r"(?i)^zona wifi\s*", "", fila.get("tipo", "")).strip('" ')
        puntos.append(
            _punto(
                "wifi",
                *lugar,
                nombre=_direccion(fila.get("direccion")) or "Zona WiFi",
                red=nombre_propio(red_wifi.replace("_", " ")).replace(" Por ", " por ") or None,
                horario=horario(fila.get("horario")),
            )
        )
    return puntos, descartados


def parsear_mercados(
    texto: str, calles: list[dict[str, Any]] | None = None
) -> tuple[list[dict[str, Any]], int]:
    """Los mercados; los que traen la longitud rota se ubican por su esquina."""
    puntos, descartados = [], 0
    for fila in _filas(texto):
        lugar = geograficas(fila.get("latitud", ""), fila.get("longitud", ""), CAJA_MERCADOS)
        if not lugar and calles:
            try:
                lat_aprox = corregir_coordenada(fila.get("latitud", ""), 1)
            except ValueError:
                lat_aprox = None
            lugar = ubicar_esquina(fila.get("direccion", ""), calles, lat_aprox)
        if not lugar:
            descartados += 1
            continue
        puntos.append(
            _punto(
                "mercado",
                *lugar,
                nombre=nombre_propio(fila.get("nombre", "Mercado")),
                direccion=_direccion(fila.get("direccion")),
                horario=horario(fila.get("horario")),
            )
        )
    return puntos, descartados


def parsear_pilas(texto: str) -> tuple[list[dict[str, Any]], int]:
    puntos, descartados = [], 0
    for fila in _filas(texto):
        if "PILAS" not in fila.get("programas", "").upper():
            continue
        lugar = desde_utm(fila.get("x", ""), fila.get("y", ""))
        if not lugar:
            descartados += 1
            continue
        puntos.append(
            _punto(
                "pilas",
                *lugar,
                nombre=nombre_propio(fila.get("establecimiento", "Punto de acopio")),
                direccion=_direccion(fila.get("direccion")),
                telefono=_dato(fila.get("telefono")),
            )
        )
    return puntos, descartados


def parsear_guardia(texto: str) -> tuple[list[dict[str, Any]], int]:
    """Un punto por destacamento: la fuente repite el mismo con varias unidades y horarios."""
    por_lugar: dict[tuple[str, float, float], dict[str, Any]] = {}
    descartados = 0
    for fila in _filas(texto):
        lugar = geograficas(fila.get("latitud", ""), fila.get("longitud", ""))
        if not lugar:
            descartados += 1
            continue
        nombre = nombre_propio(fila.get("destacamento", "Guardia Ciudadana"))
        nombre = re.sub(r"(?i)^ecu 911.*", "ECU 911", nombre)
        clave = (nombre, round(lugar[0], 4), round(lugar[1], 4))
        hora = horario(fila.get("horario"))
        if clave in por_lugar:
            # Si alguna unidad atiende las 24 horas, ese es el horario del destacamento.
            if hora and "24 horas" in hora["es"]:
                por_lugar[clave]["properties"]["horario"] = hora
            continue
        por_lugar[clave] = _punto(
            "guardia",
            *lugar,
            nombre=nombre,
            direccion=_direccion(fila.get("direccion")),
            telefono=_dato(fila.get("telefono")),
            horario=hora,
        )
    return list(por_lugar.values()), descartados


PARSERS = {
    "wifi": parsear_wifi,
    "mercados": parsear_mercados,
    "pilas": parsear_pilas,
    "guardia": parsear_guardia,
}


def obtener(descargar: red.Descargador = red.descargar) -> Resultado:
    puntos: list[dict[str, Any]] = []
    fuentes: dict[str, Any] = {}
    resumen: dict[str, Any] = {}
    calles = json.loads(decodificar(descargar(CALLES)))["features"]
    for clave, identificador in CONJUNTOS.items():
        paquete = _paquete(descargar, identificador)
        recurso = csv_mas_reciente(paquete)
        texto = decodificar(descargar(recurso["url"]))
        if clave == "mercados":
            nuevos, descartados = parsear_mercados(texto, calles)
        else:
            nuevos, descartados = PARSERS[clave](texto)
        if not nuevos:
            raise ValueError(f"{clave}: ningún punto quedó ubicado en Cuenca")
        puntos += nuevos
        fuentes[clave] = {**_metadata(paquete, recurso), "descartados": descartados}
        resumen[clave] = len(nuevos)
        if descartados:
            resumen[f"{clave}_descartados"] = descartados
    datos = {
        "type": "FeatureCollection",
        "metadata": {
            "titulo": "Servicios cerca de tu calle",
            "nota": "WiFi gratis, mercados, puntos para dejar pilas usadas y destacamentos de la "
            "Guardia Ciudadana. Los puntos cuyas coordenadas no caen en Cuenca se descartan "
            "(ver descartados en cada fuente).",
            "fuentes": fuentes,
        },
        "features": puntos,
    }
    return Resultado(archivos={"ciudad/cerca.geojson": datos}, resumen=resumen)
