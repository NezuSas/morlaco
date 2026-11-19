"""Avisos de días de descanso por decreto, detectados en la prensa.

Los feriados de la Ley de Feriados se conocen con meses de antelación, pero el
Gobierno decreta además días de descanso o traslados con dos o tres semanas de
aviso (por ejemplo, el viernes 20 de noviembre de 2026, Decreto Ejecutivo 507).
No hay un registro oficial legible: se publican en el Registro Oficial y en la
prensa. Aquí se buscan en El Mercurio las notas recientes cuyo título anuncia un
día de descanso, un feriado decretado o un traslado, y se guardan como avisos *por
revisar*: no cambian la página. La revisión diaria los lista hasta que una persona
añade el día a datos/manual/feriados.json o descarta la nota.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any

from morlaco import red
from morlaco.comun import Resultado, sin_tildes
from morlaco.fuentes import agua

DIAS = 30
# WordPress exige todas las palabras: búsquedas precisas. "día de descanso" o "suspensión
# jornada" devuelven cualquier nota, porque la API ignora las palabras cortas.
BUSQUEDAS = (
    "feriado decreto",
    "feriado nacional",
    "feriado traslado",
    "descanso obligatorio",
    "jornada laboral",
)
# El título habla de un día sin trabajo…
_TEMA = re.compile(r"\b(feriados?|descanso|jornada laboral)\b")
# …y de una decisión sobre él, no de turismo o de qué abre ese día.
_DECISION = re.compile(
    r"\b(decret\w*|descanso|suspension|suspende\w*|traslad\w*|tendra|habra|nacional|"
    r"recuperable|obligatorio)\b"
)


def es_aviso_de_descanso(titulo: str) -> bool:
    """¿El título anuncia un día de descanso, un feriado decretado o un traslado?"""
    t = sin_tildes(titulo.lower())
    return bool(_TEMA.search(t) and _DECISION.search(t))


def parsear_notas(contenido: bytes) -> list[dict[str, Any]]:
    """Las notas de una página de la API que anuncian un día de descanso."""
    avisos = []
    for nota in agua.leer_notas(contenido):
        titulo = agua.texto(nota.get("title", {}).get("rendered", ""))
        if not es_aviso_de_descanso(titulo):
            continue
        avisos.append(
            {
                "publicado": str(nota.get("date", ""))[:10],
                "titulo": titulo,
                "enlace": nota.get("link"),
                "resumen": agua.texto(nota.get("excerpt", {}).get("rendered", ""))[:400],
            }
        )
    return avisos


def pendientes(avisos: dict[str, Any], feriados: dict[str, Any]) -> list[dict[str, Any]]:
    """Las notas que nadie ha revisado: publicadas desde la última revisión de la lista de
    feriados, que no son la fuente de ningún día y que no están descartadas."""
    revisados = {d.get("fuente", {}).get("url") for d in feriados.get("dias", [])}
    revisados |= {d.get("enlace") for d in feriados.get("descartados", [])}
    desde = str(feriados.get("metadata", {}).get("revisado", ""))
    return [
        a
        for a in avisos.get("avisos", [])
        if a.get("enlace") not in revisados and a.get("publicado", "") >= desde
    ]


def obtener(descargar: red.Descargador = red.descargar, hoy: date | None = None) -> Resultado:
    hoy = hoy or date.today()
    desde = hoy - timedelta(days=DIAS)
    vistos: dict[str, dict[str, Any]] = {}
    for busqueda in BUSQUEDAS:
        for aviso in parsear_notas(descargar(agua.url_busqueda(desde, busqueda))):
            vistos.setdefault(aviso["enlace"], aviso)
    avisos = sorted(vistos.values(), key=lambda a: (a["publicado"], a["enlace"]), reverse=True)
    datos = {
        "metadata": {
            "titulo": "Avisos de días de descanso por revisar",
            "fuente": "El Mercurio (Cuenca)",
            "pagina": "https://elmercurio.com.ec/",
            "datos": agua.API,
            "desde": desde.isoformat(),
            "nota": "Notas cuyo título anuncia un día de descanso, un feriado decretado o un "
            "traslado. No cambian la página: una persona las lee y añade el día a "
            "datos/manual/feriados.json, o descarta la nota.",
        },
        "avisos": avisos,
    }
    return Resultado(archivos={"feriados/avisos.json": datos}, resumen={"avisos": len(avisos)})
