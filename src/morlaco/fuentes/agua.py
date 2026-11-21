"""Avisos de cortes de agua en Cuenca, detectados en la prensa.

ETAPA EP no publica sus cortes en un formato legible: la sección de su web está
abandonada desde febrero de 2025 y los anuncia en redes sociales. El Mercurio sí
publica cada aviso, con sectores, fecha y horario, y su web tiene una API pública
(WordPress). Aquí se buscan las notas recientes cuyo título habla de un corte de
agua y se guardan como avisos *por confirmar*. La página muestra enseguida los que
citan a ETAPA, marcados "por confirmar" y con el enlace a la nota (un corte anunciado
por la tarde para la mañana siguiente no puede esperar a que alguien lo lea); cuando
una persona lo revisa, lo copia a datos/manual/agua.json o lo descarta.
"""

from __future__ import annotations

import html
import json
import re
from datetime import date, timedelta
from typing import Any
from urllib.parse import urlencode

from morlaco import red
from morlaco.comun import DIAS_SEMANA, MESES, Resultado, decodificar, sin_tildes

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
# "20 de noviembre de 2026", "este viernes" y "entre las 09:00 y las 18:00" (o "de 08h00 a 16h00").
_FECHA = re.compile(rf"\b(\d{{1,2}}) de ({'|'.join(MESES)})(?: del? (\d{{4}}))?\b")
_ESTE_DIA = re.compile(rf"\beste ({'|'.join(DIAS_SEMANA)})\b")
_FRANJA = re.compile(r"\b(\d{1,2})[:h](\d{2})\D{1,20}?(\d{1,2})[:h](\d{2})\b")
# Un corte se anuncia con pocos días: una fecha más lejana es de otra cosa (una obra, un plazo).
_MAXIMO_DIAS = 14


def texto(fragmento: str) -> str:
    """El texto plano de un fragmento HTML de WordPress."""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragmento or ""))).strip()


def leer_notas(contenido: bytes) -> list[dict[str, Any]]:
    """Las notas de una página de la API de El Mercurio."""
    notas = json.loads(decodificar(contenido))
    if not isinstance(notas, list):
        raise ValueError("La API de El Mercurio no devolvió una lista")
    return notas


def es_aviso_de_corte(titulo: str, contenido: str = "") -> bool:
    """¿La nota anuncia un corte de agua en Cuenca? Se decide por el título."""
    t = sin_tildes(titulo.lower())
    if not (_AGUA.search(t) and _CORTE.search(t)) or _OTRO_CANTON.search(t):
        return False
    # Una nota de Cuenca nombra a ETAPA o a la ciudad.
    resto = sin_tildes(contenido.lower())
    return "etapa" in resto or "cuenca" in resto or "cuenca" in t


def cuando(cuerpo: str, publicado: str) -> dict[str, str | None]:
    """El día y el horario del corte según la nota, o None en lo que no se pueda leer.

    Se toma la primera fecha escrita ("20 de noviembre") que caiga entre el día de la nota y
    dos semanas después; si no hay, el "este viernes" siguiente a la nota. El horario es la
    primera franja ("entre las 09:00 y las 18:00"). Es una lectura automática: sirve para
    saber hasta cuándo mostrar el aviso, y la página la presenta como "por confirmar".
    """
    plano = sin_tildes(cuerpo.lower())
    try:
        dia_nota = date.fromisoformat(publicado)
    except ValueError:
        return {"fecha": None, "desde": None, "hasta": None}
    fecha = None
    for dia, mes, anio in _FECHA.findall(plano):
        for a in [int(anio)] if anio else [dia_nota.year, dia_nota.year + 1]:
            try:
                candidata = date(a, MESES[mes], int(dia))
            except ValueError:
                continue
            if 0 <= (candidata - dia_nota).days <= _MAXIMO_DIAS:
                fecha = candidata
                break
        if fecha:
            break
    if not fecha and (este := _ESTE_DIA.search(plano)):
        fecha = dia_nota + timedelta(days=(DIAS_SEMANA[este.group(1)] - dia_nota.isoweekday()) % 7)
    desde = hasta = None
    for h1, m1, h2, m2 in _FRANJA.findall(plano):
        a, b = f"{int(h1):02d}:{m1}", f"{int(h2):02d}:{m2}"
        if int(h1) < 24 and int(h2) <= 24 and int(m1) < 60 and int(m2) < 60 and a < b:
            desde, hasta = a, b
            break
    return {"fecha": fecha.isoformat() if fecha else None, "desde": desde, "hasta": hasta}


def parsear_notas(contenido: bytes) -> list[dict[str, Any]]:
    """Los avisos de corte de agua de una página de la API, del más nuevo al más viejo."""
    avisos = []
    for nota in leer_notas(contenido):
        titulo = texto(nota.get("title", {}).get("rendered", ""))
        cuerpo = texto(nota.get("content", {}).get("rendered", ""))
        if not es_aviso_de_corte(titulo, cuerpo):
            continue
        publicado = str(nota.get("date", ""))[:10]
        avisos.append(
            {
                "publicado": publicado,
                "titulo": titulo,
                "enlace": nota.get("link"),
                "resumen": texto(nota.get("excerpt", {}).get("rendered", ""))[:400],
                "menciona_etapa": "etapa" in sin_tildes(cuerpo.lower()),
                **cuando(cuerpo, publicado),
            }
        )
    return sorted(avisos, key=lambda a: a["publicado"], reverse=True)


def pendientes(avisos: dict[str, Any], confirmados: dict[str, Any]) -> list[dict[str, Any]]:
    """Los avisos que nadie ha revisado: ni copiados como corte ni descartados."""
    revisados = {c.get("fuente", {}).get("url") for c in confirmados.get("cortes", [])}
    revisados |= {d.get("enlace") for d in confirmados.get("descartados", [])}
    return [a for a in avisos.get("avisos", []) if a.get("enlace") not in revisados]


def por_confirmar(
    avisos: dict[str, Any], confirmados: dict[str, Any], hoy: date
) -> list[dict[str, Any]]:
    """Los avisos que la página muestra sin esperar a nadie: citan a ETAPA, siguen pendientes
    y su corte no ha pasado. Sin fecha leída, valen hasta dos días después de publicarse."""
    limite = (hoy - timedelta(days=2)).isoformat()
    vigentes = [
        a
        for a in pendientes(avisos, confirmados)
        if a.get("menciona_etapa")
        and (a["fecha"] >= hoy.isoformat() if a.get("fecha") else a.get("publicado", "") >= limite)
    ]
    return sorted(vigentes, key=lambda a: (a.get("fecha") or a.get("publicado", ""), a["enlace"]))


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
            "nota": "Notas cuyo título anuncia un corte de agua. Las que citan a ETAPA se "
            "muestran en la página como 'por confirmar' hasta que pasa su fecha; una persona las "
            "lee y copia los cortes confirmados a datos/manual/agua.json o las descarta. La fecha "
            "y el horario se leen de la nota automáticamente y pueden faltar.",
        },
        "avisos": avisos,
    }
    archivos: dict[str, Any] = {"agua/avisos.json": datos}
    # En la misma pasada, los otros avisos de prensa (cierres de vías y cortes de luz): son la
    # misma API y así se revisan tan seguido como el agua. Se importa aquí porque prensa.py
    # usa las funciones de este módulo.
    from morlaco.fuentes import prensa

    otros = prensa.obtener(descargar, hoy)
    archivos.update(otros)
    resumen = {"avisos": len(avisos)}
    resumen.update(
        {
            ruta.split("/")[1].removesuffix(".json") + "_" + ruta.split("/")[0]: len(a["avisos"])
            for ruta, a in otros.items()
        }
    )
    return Resultado(archivos=archivos, resumen=resumen)
