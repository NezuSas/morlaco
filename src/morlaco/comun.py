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
