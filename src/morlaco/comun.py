"""Utilidades compartidas por las fuentes: texto, horas, días y resultados."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any

DIAS_SEMANA: dict[str, int] = {
    "lunes": 1,
    "martes": 2,
    "miercoles": 3,
    "jueves": 4,
    "viernes": 5,
    "sabado": 6,
    "domingo": 7,
}
NOMBRE_DIA: dict[int, str] = {
    1: "lunes",
    2: "martes",
    3: "miércoles",
    4: "jueves",
    5: "viernes",
    6: "sábado",
    7: "domingo",
}
MESES: dict[str, int] = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "setiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}

_HORA = re.compile(r"(\d{1,2}):(\d{2})")


@dataclass
class Resultado:
    """Lo que produce una fuente: archivos a escribir y un resumen para estado.json."""

    archivos: dict[str, Any]
    resumen: dict[str, Any] = field(default_factory=dict)


def decodificar(contenido: bytes) -> str:
    """Decodifica UTF-8 (con o sin BOM) y, si falla, Windows-1252."""
    try:
        return contenido.decode("utf-8-sig")
    except UnicodeDecodeError:
        return contenido.decode("cp1252")


def limpiar(texto: str | None) -> str:
    """Quita espacios y saltos de línea sobrantes."""
    return " ".join((texto or "").split())


def sin_tildes(texto: str) -> str:
    descompuesto = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in descompuesto if not unicodedata.combining(c))


def hora(texto: str | None) -> str | None:
    """Normaliza una hora a HH:MM ('5:50' -> '05:50'). Devuelve None si no hay hora."""
    coincidencia = _HORA.search(texto or "")
    if not coincidencia:
        return None
    horas, minutos = coincidencia.groups()
    return f"{int(horas):02d}:{minutos}"


# Palabras que en los datos vienen abreviadas, sin tilde o en minúsculas.
ABREVIATURAS = {
    "sta": "Santa", "sta.": "Santa", "sto": "Santo", "sto.": "Santo", "gral": "General",
    "gral.": "General", "pdte": "Presidente", "pdte.": "Presidente", "cdla": "Ciudadela",
    "cdla.": "Ciudadela", "univ": "Universidad", "univ.": "Universidad", "av": "Av.",
}  # fmt: skip
SIGLAS = {"iess", "ups", "sit", "etapa", "emac", "sas", "uda", "ucuenca", "gad", "ii", "iii"}
TILDES = {
    "banos": "Baños", "rio": "Río", "rios": "Ríos", "sayausi": "Sayausí", "joaquin": "Joaquín",
    "jose": "José", "tomas": "Tomás", "ordonez": "Ordóñez", "ordoniez": "Ordóñez",
    "maria": "María",
    "roldos": "Roldós", "tixan": "Tixán", "corazon": "Corazón", "tablon": "Tablón",
    "duran": "Durán",
    "politecnica": "Politécnica", "rocio": "Rocío", "llatcon": "Llatcón", "daran": "Darán",
    "capulies": "Capulíes", "orquideas": "Orquídeas", "carcel": "Cárcel",
    "economicas": "Económicas",
    "davila": "Dávila", "ramirez": "Ramírez", "davalos": "Dávalos", "ines": "Inés", "sion": "Sión",
    "victor": "Víctor", "bolivar": "Bolívar", "simon": "Simón", "cordova": "Córdova",
    "panama": "Panamá", "ramon": "Ramón", "garcia": "García", "martinez": "Martínez",
    "fermin": "Fermín", "union": "Unión", "via": "Vía", "paraiso": "Paraíso", "huayna": "Huayna",
    "capac": "Cápac", "canaris": "Cañaris", "espana": "España", "mexico": "México",
    "americas": "Américas", "heroes": "Héroes", "cesar": "César", "proano": "Proaño",
    "monsenor": "Monseñor", "leon": "León", "batallon": "Batallón",
}  # fmt: skip
_MINUSCULAS = {"de", "del", "la", "las", "los", "el", "y", "e", "a", "al", "en"}


def arreglar_codificacion(texto: str) -> str:
    """Repara textos con la codificación rota ('BaÃ±os' -> 'Baños', 'PROA?O' -> 'PROAÑO')."""
    # Un "?" entre dos letras es una Ñ que se perdió al exportar.
    texto = re.sub(r"(?<=[A-Z])\?(?=[A-Z])", "Ñ", texto)
    texto = re.sub(r"(?<=[a-z])\?(?=[a-z])", "ñ", texto)
    if "Ã" in texto or "Â" in texto:
        try:
            return texto.encode("cp1252").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return texto
    return texto


def pulir_palabra(palabra: str, primera: bool) -> str:
    """Una palabra en nombre propio, con su abreviatura expandida, su tilde y sus siglas."""
    if "-" in palabra and len(palabra) > 2:
        return "-".join(
            pulir_palabra(p, primera or i > 0) for i, p in enumerate(palabra.split("-"))
        )
    clave = palabra.lower()
    if clave in ABREVIATURAS:
        return ABREVIATURAS[clave]
    if clave in SIGLAS:
        return clave.upper()
    if clave in TILDES:
        return TILDES[clave]
    if not primera and clave in _MINUSCULAS:
        return clave
    return clave[:1].upper() + clave[1:]


def nombre_propio(texto: str) -> str:
    """'STA. MARIA DEL VERGEL' -> 'Santa María del Vergel'; 'IESS' se queda en siglas."""
    palabras = limpiar(arreglar_codificacion(texto or "")).split()
    return " ".join(pulir_palabra(p, i == 0) for i, p in enumerate(palabras))
