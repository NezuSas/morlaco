"""Escritura de los archivos de datos.

Los archivos no llevan la fecha de generación (esa va solo en estado.json), así
que si los datos de la fuente no cambian, el archivo tampoco cambia y git no
muestra diferencias.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _json(objeto: Any, **opciones: Any) -> str:
    return json.dumps(objeto, ensure_ascii=False, **opciones)


def a_texto(objeto: Any) -> str:
    """JSON legible. Las FeatureCollection se escriben con una entidad por línea."""
    if isinstance(objeto, dict) and objeto.get("type") == "FeatureCollection":
        cabecera = {k: v for k, v in objeto.items() if k != "features"}
        cuerpo = _json(cabecera, indent=2)[:-2]  # sin el cierre "\n}"
        entidades = ",\n".join("    " + _json(f, separators=(",", ":")) for f in objeto["features"])
        return f'{cuerpo},\n  "features": [\n{entidades}\n  ]\n}}\n'
    return _json(objeto, indent=2) + "\n"


def escribir_json(ruta: Path, objeto: Any) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(a_texto(objeto), encoding="utf-8", newline="\n")


def escribir(ruta: Path, contenido: Any) -> None:
    """Un texto se escribe tal cual (con sus saltos de línea, p. ej. CRLF en .ics), los
    bytes como binario (p. ej. el ZIP del GTFS) y cualquier otra cosa, como JSON."""
    if isinstance(contenido, str):
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_text(contenido, encoding="utf-8", newline="")
    elif isinstance(contenido, bytes):
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_bytes(contenido)
    else:
        escribir_json(ruta, contenido)
