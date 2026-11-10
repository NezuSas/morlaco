"""Línea de comandos: `morlaco actualizar` descarga las fuentes y escribe datos/."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable, Sequence
from datetime import datetime, timezone
from pathlib import Path

from morlaco import red
from morlaco.comun import Resultado
from morlaco.fuentes import buses, calles, centrosur, emac, movilidad
from morlaco.salida import escribir, escribir_json

Fuente = Callable[[red.Descargador], Resultado]

FUENTES: dict[str, Fuente] = {
    "recoleccion": emac.obtener,
    "luz": centrosur.obtener,
    "buses": buses.obtener,
    "calles": calles.obtener,
    "movilidad": movilidad.obtener,
}


def _ahora() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _leer_estado(ruta: Path) -> dict:
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def actualizar(
    nombres: Sequence[str],
    salida: Path,
    descargar: red.Descargador = red.descargar,
    fuentes: dict[str, Fuente] | None = None,
) -> int:
    """Actualiza las fuentes pedidas. Un fallo en una no impide las demás.

    Devuelve 0 si todas salieron bien y 1 si alguna falló. En estado.json queda,
    por fuente, cuándo se actualizó por última vez y el último error, si lo hubo.
    """
    fuentes = fuentes or FUENTES
    ruta_estado = salida / "estado.json"
    estado = _leer_estado(ruta_estado)
    fallos = 0
    for nombre in nombres:
        try:
            resultado = fuentes[nombre](descargar)
            for ruta, contenido in resultado.archivos.items():
                escribir(salida / ruta, contenido)
            estado[nombre] = {
                "ok": True,
                "actualizado": _ahora(),
                "archivos": sorted(resultado.archivos),
                "resumen": resultado.resumen,
            }
            print(f"[ok] {nombre}: {json.dumps(resultado.resumen, ensure_ascii=False)}")
        except Exception as error:  # se informa y se sigue con la siguiente fuente
            fallos += 1
            anterior = estado.get(nombre, {})
            estado[nombre] = {
                **anterior,
                "ok": False,
                "ultimo_intento": _ahora(),
                "error": f"{type(error).__name__}: {error}",
            }
            print(f"[error] {nombre}: {type(error).__name__}: {error}", file=sys.stderr)
    escribir_json(ruta_estado, dict(sorted(estado.items())))
    return 1 if fallos else 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="morlaco", description="Datos abiertos de servicios públicos de Cuenca, Ecuador."
    )
    sub = parser.add_subparsers(dest="comando", required=True)
    act = sub.add_parser("actualizar", help="Descarga las fuentes y escribe los datos limpios.")
    act.add_argument(
        "fuentes",
        nargs="*",
        help=f"Fuentes a actualizar (por defecto, todas: {', '.join(FUENTES)}).",
    )
    act.add_argument(
        "--salida", type=Path, default=Path("datos"), help="Carpeta de salida (por defecto, datos)."
    )
    args = parser.parse_args(argv)
    desconocidas = [f for f in args.fuentes if f not in FUENTES]
    if desconocidas:
        parser.error(
            f"fuente desconocida: {', '.join(desconocidas)} (opciones: {', '.join(FUENTES)})"
        )
    return actualizar(args.fuentes or list(FUENTES), args.salida)
