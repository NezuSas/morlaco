"""Zonas y horarios de recolección de basura de EMAC EP.

EMAC publica un mapa de Google ("Mapa Zonas de Recolección") con un polígono por
zona y su frecuencia en la descripción, por ejemplo
"Lunes - Miércoles - Viernes HORARIO: 20h00 a 24h00". Ese mapa se puede exportar
como KML, que es lo que leemos aquí.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from typing import Any

from morlaco import calendario, red
from morlaco.comun import DIAS_SEMANA, NOMBRE_DIA, Resultado, limpiar, sin_tildes

PAGINA = "https://emac.gob.ec/mapa-zonas-de-recoleccion/"
MAPA_ID = "1pEmUUwoPnYQ9kcz8_V5rmIn0O6iGpQI"
KML_URL = f"https://www.google.com/maps/d/kml?mid={MAPA_ID}&forcekml=1"

# Según la página de servicio de EMAC, la recolección diferenciada (funda celeste,
# reciclables) se hace los miércoles y los jueves.
DIAS_RECICLAJE = (3, 4)

_NS = "{http://www.opengis.net/kml/2.2}"
_HORARIO = re.compile(r"(\d{1,2})\s*h\s*(\d{2})\s*a\s*(\d{1,2})\s*h\s*(\d{2})", re.IGNORECASE)
_DIA = re.compile(r"lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo", re.IGNORECASE)
_ZONA = re.compile(r"zona\s*(\d+)", re.IGNORECASE)
_ETIQUETA_HTML = re.compile(r"<[^>]+>")


def parsear_frecuencia(texto: str) -> dict[str, Any]:
    """'Martes - Jueves - Sábado HORARIO: 08h00 a 12h00' -> días y horario."""
    horario = _HORARIO.search(texto)
    if not horario:
        raise ValueError(f"No se reconoce el horario en {texto!r}")
    dias_iso = sorted(
        {DIAS_SEMANA[sin_tildes(d.lower())] for d in _DIA.findall(texto[: horario.start()])}
    )
    if not dias_iso:
        raise ValueError(f"No se reconocen los días en {texto!r}")
    h1, m1, h2, m2 = horario.groups()
    reciclaje = next((d for d in dias_iso if d in DIAS_RECICLAJE), None)
    return {
        "dias": [NOMBRE_DIA[d] for d in dias_iso],
        "dias_iso": dias_iso,
        "desde": f"{int(h1):02d}:{m1}",
        "hasta": f"{int(h2):02d}:{m2}",
        "dia_reciclaje": NOMBRE_DIA[reciclaje] if reciclaje else None,
    }


def _anillo(texto: str | None) -> list[list[float]]:
    puntos = []
    for tupla in (texto or "").split():
        lon, lat = tupla.split(",")[:2]
        puntos.append([round(float(lon), 6), round(float(lat), 6)])
    if len(puntos) < 3:
        raise ValueError("Polígono con menos de 3 puntos")
    if puntos[0] != puntos[-1]:
        puntos.append(puntos[0])
    return puntos


def _poligono(elemento: ET.Element) -> list[list[list[float]]]:
    camino = f"{_NS}LinearRing/{_NS}coordinates"
    anillos = [_anillo(elemento.findtext(f"{_NS}outerBoundaryIs/{camino}"))]
    for interior in elemento.findall(f"{_NS}innerBoundaryIs"):
        anillos.append(_anillo(interior.findtext(camino)))
    return anillos


def _geometria(placemark: ET.Element) -> dict[str, Any]:
    poligonos = [_poligono(p) for p in placemark.iter(f"{_NS}Polygon")]
    if not poligonos:
        raise ValueError("La zona no tiene polígono")
    if len(poligonos) == 1:
        return {"type": "Polygon", "coordinates": poligonos[0]}
    return {"type": "MultiPolygon", "coordinates": poligonos}


def parsear_kml(contenido: bytes) -> dict[str, Any]:
    """Convierte el KML del mapa de EMAC en una FeatureCollection GeoJSON."""
    raiz = ET.fromstring(contenido)
    entidades = []
    for placemark in raiz.iter(f"{_NS}Placemark"):
        extra = {
            d.get("name"): limpiar(d.findtext(f"{_NS}value")) for d in placemark.iter(f"{_NS}Data")
        }
        # Algunas zonas no tienen nombre y lo traen en los datos extendidos (DESCRIPCIO).
        nombre = limpiar(placemark.findtext(f"{_NS}name")) or extra.get("DESCRIPCIO", "")
        zona = _ZONA.search(nombre)
        if not zona:
            raise ValueError(f"No se reconoce el número de zona en {nombre!r}")
        descripcion = limpiar(
            _ETIQUETA_HTML.sub(" ", placemark.findtext(f"{_NS}description") or "")
        )
        texto = extra.get("FRECUENCIA") or descripcion
        numero = int(zona.group(1))
        entidades.append(
            {
                "type": "Feature",
                "properties": {
                    "zona": numero,
                    "nombre": f"Zona {numero}",
                    **parsear_frecuencia(texto),
                    "texto_original": texto,
                },
                "geometry": _geometria(placemark),
            }
        )
    if not entidades:
        raise ValueError("El KML no tiene zonas")
    entidades.sort(key=lambda e: e["properties"]["zona"])
    return {
        "type": "FeatureCollection",
        "metadata": {
            "titulo": "Zonas y horarios de recolección de basura",
            "fuente": "EMAC EP",
            "pagina": PAGINA,
            "datos": KML_URL,
            # Así figura el conjunto "Mapa Zonas de Recolección" en el portal Cuenca en Datos.
            "licencia": "Creative Commons Non-Commercial (Cualquiera)",
            "nota": "La funda celeste (reciclables) se recoge los miércoles o los jueves, "
            "según la zona; dia_reciclaje indica cuál.",
        },
        "features": entidades,
    }


def obtener(descargar: red.Descargador = red.descargar) -> Resultado:
    zonas = parsear_kml(descargar(KML_URL))
    numeros = [e["properties"]["zona"] for e in zonas["features"]]
    calendarios = {
        calendario.nombre_archivo(e["properties"]["zona"]): calendario.calendario_zona(
            e["properties"]
        )
        for e in zonas["features"]
    }
    return Resultado(
        archivos={"recoleccion/zonas.geojson": zonas, **calendarios},
        resumen={"zonas": len(numeros), "numeros": numeros, "calendarios": len(calendarios)},
    )
