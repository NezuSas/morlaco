"""Avisos de cortes de agua en Cuenca, detectados en la prensa.

ETAPA EP no publica sus cortes en un formato legible: la sección de su web está
abandonada desde febrero de 2025 y los anuncia en redes sociales. El Mercurio sí
publica cada aviso, con sectores, fecha y horario, y su web tiene una API pública
(WordPress). Aquí se buscan las notas recientes cuyo título habla de un corte de
agua y se guardan como avisos *por confirmar*: no se muestran en la página hasta
que una persona lee la nota y copia el corte a datos/manual/agua.json.
"""

from __future__ import annotations

import html
import json
import re
from datetime import date, timedelta
from typing import Any
from urllib.parse import urlencode

from morlaco import red
from morlaco.comun import Resultado, decodificar, sin_tildes

API = "https://elmercurio.com.ec/wp-json/wp/v2/posts"
DIAS = 21
# WordPress exige todas las palabras de la búsqueda: varias búsquedas precisas cubren más que
# una sola por "agua", que trae cien notas de cualquier tema y no llega a tres semanas atrás.
BUSQUEDAS = ("corte agua", "cortes agua", "suspensión agua", "racionamiento agua", "ETAPA agua")
# El título habla de agua y de quedarse sin ella.
_AGUA = re.compile(r"\bagua\b")
_CORTE = re.compile(
    r"\b(corte|cortes|suspension|suspenden|suspendera|racionamiento|sin servicio|sin agua)\b"
)
# Otros cantones con su propio servicio de agua: no son de ETAPA ni de Cuenca.
_OTRO_CANTON = re.compile(
    r"\b(azogues|gualaceo|paute|giron|sigsig|biblian|canar|loja|quito|guayaquil)\b"
)


def _texto(fragmento: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragmento or ""))).strip()


def es_aviso_de_corte(titulo: str, contenido: str = "") -> bool:
    """¿La nota anuncia un corte de agua en Cuenca? Se decide por el título."""
    t = sin_tildes(titulo.lower())
    if not (_AGUA.search(t) and _CORTE.search(t)) or _OTRO_CANTON.search(t):
        return False
    # Una nota de Cuenca nombra a ETAPA o a la ciudad.
    resto = sin_tildes(contenido.lower())
    return "etapa" in resto or "cuenca" in resto or "cuenca" in t


def parsear_notas(contenido: bytes) -> list[dict[str, Any]]:
    """Los avisos de corte de agua de una página de la API, del más nuevo al más viejo."""
    notas = json.loads(decodificar(contenido))
    if not isinstance(notas, list):
        raise ValueError("La API de El Mercurio no devolvió una lista")
    avisos = []
    for nota in notas:
        titulo = _texto(nota.get("title", {}).get("rendered", ""))
        cuerpo = _texto(nota.get("content", {}).get("rendered", ""))
        if not es_aviso_de_corte(titulo, cuerpo):
            continue
        avisos.append(
            {
                "publicado": str(nota.get("date", ""))[:10],
                "titulo": titulo,
                "enlace": nota.get("link"),
                "resumen": _texto(nota.get("excerpt", {}).get("rendered", ""))[:400],
                "menciona_etapa": "etapa" in sin_tildes(cuerpo.lower()),
            }
        )
    return sorted(avisos, key=lambda a: a["publicado"], reverse=True)


def pendientes(avisos: dict[str, Any], confirmados: dict[str, Any]) -> list[dict[str, Any]]:
    """Los avisos que nadie ha revisado: ni copiados como corte ni descartados."""
    revisados = {c.get("fuente", {}).get("url") for c in confirmados.get("cortes", [])}
    revisados |= {d.get("enlace") for d in confirmados.get("descartados", [])}
    return [a for a in avisos.get("avisos", []) if a.get("enlace") not in revisados]


def url_busqueda(desde: date, busqueda: str = "corte agua") -> str:
    parametros = {
        "search": busqueda,
        "after": f"{desde.isoformat()}T00:00:00",
        "per_page": 100,
        "orderby": "date",
        "_fields": "date,link,title,excerpt,content",
    }
    return f"{API}?{urlencode(parametros)}"


def obtener(descargar: red.Descargador = red.descargar, hoy: date | None = None) -> Resultado:
    hoy = hoy or date.today()
    desde = hoy - timedelta(days=DIAS)
    vistos: dict[str, dict[str, Any]] = {}
    for busqueda in BUSQUEDAS:
        for aviso in parsear_notas(descargar(url_busqueda(desde, busqueda))):
            vistos.setdefault(aviso["enlace"], aviso)
    avisos = sorted(vistos.values(), key=lambda a: (a["publicado"], a["enlace"]), reverse=True)
    datos = {
        "metadata": {
            "titulo": "Avisos de cortes de agua por confirmar",
            "fuente": "El Mercurio (Cuenca)",
            "pagina": "https://elmercurio.com.ec/cuenca/",
            "datos": API,
            "desde": desde.isoformat(),
            "nota": "Notas cuyo título anuncia un corte de agua. No se muestran en la página: "
            "una persona las lee y copia los cortes confirmados a datos/manual/agua.json.",
        },
        "avisos": avisos,
    }
    return Resultado(archivos={"agua/avisos.json": datos}, resumen={"avisos": len(avisos)})
