"""Línea de comandos: `morlaco actualizar` descarga las fuentes y escribe datos/."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable, Sequence
from datetime import datetime, timedelta, timezone
from pathlib import Path

from morlaco import cambios, catalogo, red
from morlaco.comun import Resultado
from morlaco.fuentes import (
    agua,
    buses,
    calles,
    centrosur,
    cerca,
    emac,
    farmacias,
    movilidad,
    tranvia,
)
from morlaco.salida import escribir, escribir_json

# Cuenca está en UTC-5 todo el año (Ecuador no cambia la hora).
ZONA_CUENCA = timezone(timedelta(hours=-5))

Fuente = Callable[[red.Descargador], Resultado]

FUENTES: dict[str, Fuente] = {
    "recoleccion": emac.obtener,
    "luz": centrosur.obtener,
    "buses": buses.obtener,
    "calles": calles.obtener,
    "movilidad": movilidad.obtener,
    "farmacias": farmacias.obtener,
    "tranvia": tranvia.obtener,
    "agua": agua.obtener,
    "cerca": cerca.obtener,
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
    # El catálogo no lleva fechas: solo cambia si cambia la descripción de los datos.
    catalogo.escribir_indice(salida)
    return 1 if fallos else 0


def avisos_de_agua(datos: Path) -> int:
    """Imprime, una por línea en JSON, las notas de cortes de agua que falta revisar."""
    avisos = _leer_estado(datos / "agua" / "avisos.json")
    confirmados = _leer_estado(datos / "manual" / "agua.json")
    for aviso in agua.pendientes(avisos, confirmados):
        print(json.dumps(aviso, ensure_ascii=False))
    return 0


def revisar_cambios(datos: Path, siempre: bool = False, mensaje: Path | None = None) -> int:
    archivos = cambios.archivos_cambiados(datos)
    estado = _leer_estado(datos / "estado.json")
    publicar = cambios.hay_que_publicar(archivos, cambios.estado_en_git(datos), estado, siempre)
    if publicar and mensaje:
        hoy = datetime.now(timezone.utc).astimezone(ZONA_CUENCA).date()
        mensaje.write_text(cambios.mensaje_commit(archivos, estado, hoy), encoding="utf-8")
    print("si" if publicar else "no")
    return 0


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
    rev = sub.add_parser(
        "cambios",
        help="Dice si hay algo que publicar tras actualizar (imprime si o no).",
    )
    rev.add_argument("--datos", type=Path, default=Path("datos"), help="Carpeta de datos.")
    rev.add_argument(
        "--siempre", action="store_true", help="Publicar aunque los datos no hayan cambiado."
    )
    rev.add_argument("--mensaje", type=Path, help="Archivo donde escribir el mensaje del commit.")
    pend = sub.add_parser(
        "avisos-agua",
        help="Lista las notas de cortes de agua que falta revisar (una por línea, JSON).",
    )
    pend.add_argument("--datos", type=Path, default=Path("datos"), help="Carpeta de datos.")
    args = parser.parse_args(argv)
    if args.comando == "avisos-agua":
        return avisos_de_agua(args.datos)
    if args.comando == "cambios":
        return revisar_cambios(args.datos, args.siempre, args.mensaje)
    desconocidas = [f for f in args.fuentes if f not in FUENTES]
    if desconocidas:
        parser.error(
            f"fuente desconocida: {', '.join(desconocidas)} (opciones: {', '.join(FUENTES)})"
        )
    return actualizar(args.fuentes or list(FUENTES), args.salida)
