"""¿Hay algo que publicar después de `morlaco actualizar`?

Las fuentes dan el mismo archivo si sus datos no cambian, así que basta con mirar
qué archivos de datos/ cambiaron. estado.json cambia siempre (lleva la hora de
cada actualización), por eso solo cuenta si una fuente pasó de funcionar a fallar
o al revés, o si se pide publicar de todos modos (la revisión semanal, que deja
constancia de que los datos se revisaron aunque no hayan cambiado).
"""

from __future__ import annotations

import json
import subprocess
from collections.abc import Iterable
from datetime import date
from pathlib import Path

ESTADO = "estado.json"


# Fuera de datos/, lo que también genera la actualización: las páginas para buscadores.
GENERADOS = ("../web/info", "../sitemap.xml")


def archivos_cambiados(datos: Path) -> list[str]:
    """Rutas, relativas a datos/, de lo que git ve cambiado o nuevo, sin estado.json."""
    salida = subprocess.run(
        ["git", "status", "--porcelain", "--untracked-files=all", "--", ".", *GENERADOS],
        cwd=datos,
        capture_output=True,
        encoding="utf-8",
        check=True,
    ).stdout
    raiz = subprocess.run(
        ["git", "rev-parse", "--show-prefix"],
        cwd=datos,
        capture_output=True,
        encoding="utf-8",
        check=True,
    ).stdout.strip()
    rutas = []
    carpeta = raiz.rstrip("/")
    padre = carpeta.rsplit("/", 1)[0] + "/" if "/" in carpeta else ""
    for linea in salida.splitlines():
        ruta = linea[3:].strip().strip('"').split(" -> ")[-1]
        if ruta.startswith(raiz):
            relativa = ruta.removeprefix(raiz)
        else:
            relativa = "../" + ruta.removeprefix(padre)
        if relativa != ESTADO:
            rutas.append(relativa)
    return sorted(rutas)


def _situacion(estado: dict) -> dict[str, tuple[bool, str | None]]:
    return {nombre: (bool(e.get("ok")), e.get("error")) for nombre, e in estado.items()}


def fuentes_de(archivos: Iterable[str], estado: dict) -> list[str]:
    """Las fuentes que escribieron alguno de esos archivos."""
    archivos = set(archivos)
    return sorted(n for n, e in estado.items() if archivos & set(e.get("archivos", [])))


def hay_que_publicar(
    archivos: list[str], estado_antes: dict, estado_ahora: dict, siempre: bool = False
) -> bool:
    return siempre or bool(archivos) or _situacion(estado_antes) != _situacion(estado_ahora)


def mensaje_commit(archivos: list[str], estado: dict, hoy: date) -> str:
    """Título con las fuentes que cambiaron y, en el cuerpo, el resumen de cada una."""
    cambiadas = fuentes_de(archivos, estado)
    rotas = sorted(n for n, e in estado.items() if not e.get("ok"))
    if cambiadas:
        titulo = f"Datos al día ({hoy.isoformat()}): {', '.join(cambiadas)}"
    elif any(a.startswith("../") for a in archivos):
        titulo = f"Páginas al día ({hoy.isoformat()})"
    else:
        titulo = f"Datos revisados ({hoy.isoformat()}): sin cambios"
    cuerpo = []
    for nombre in cambiadas:
        resumen = json.dumps(estado[nombre].get("resumen", {}), ensure_ascii=False)
        cuerpo.append(f"- {nombre}: {resumen}")
    for nombre in rotas:
        cuerpo.append(f"- {nombre} falló: {estado[nombre].get('error', 'error desconocido')}")
    return titulo + ("\n\n" + "\n".join(cuerpo) if cuerpo else "") + "\n"


def estado_en_git(datos: Path) -> dict:
    """estado.json tal como está en el último commit (vacío si aún no existe)."""
    resultado = subprocess.run(
        ["git", "show", f"HEAD:./{ESTADO}"], cwd=datos, capture_output=True, encoding="utf-8"
    )
    return json.loads(resultado.stdout) if resultado.returncode == 0 else {}
