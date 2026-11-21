"""Avisos de la prensa que no publica nadie en formato abierto: cierres de vías y cortes de luz.

Igual que los cortes de agua (agua.py), salen de El Mercurio, que tiene una API pública
(WordPress): se buscan las notas recientes cuyo título anuncia un cierre de vías o un corte
de energía en Cuenca y se guardan con su enlace. Son avisos *sin revisar*: la página los
muestra como tales, con el título y el enlace a la nota, y no afirma nada por su cuenta.

- Cierres de vías y desvíos: el municipio y la EMOV los anuncian por desfiles, obras y
  eventos, en comunicados que recoge la prensa.
- Cortes de luz: la Centro Sur dejó de publicar su cronograma de Cuenca en julio de 2026;
  mientras tanto, la prensa es donde se anuncian.

Estos avisos se descargan junto con los del agua (misma API, misma pasada).
"""

from __future__ import annotations

import re
from collections.abc import Callable
from datetime import date, timedelta
from typing import Any

from morlaco import red
from morlaco.comun import sin_tildes
from morlaco.fuentes import agua

DIAS = 21
# Ciudades y cantones de los que también habla el diario: su cierre o su corte no es de Cuenca.
_OTRO_LUGAR = re.compile(
    r"\b(guayaquil|quito|loja|azogues|machala|ambato|manta|gualaceo|paute|canar|galapagos)\b"
)

BUSQUEDAS_CIERRES = ("cierre vías", "cierre vial", "cierres viales", "vías cerradas", "desvíos")
_CIERRE = re.compile(
    r"\b(cierre|cierres|cierran|cerrara|cerraran|cerrado|cerrada|cerrados|cerradas|"
    r"desvio|desvios|restriccion vehicular)\b"
)
_VIA = re.compile(
    r"\b(via|vias|vial|viales|calle|calles|avenida|av|transito|tramo|puente|buses|circulacion)\b"
)

BUSQUEDAS_LUZ = ("cortes energía", "corte luz", "cortes luz", "suspensión energía", "Centro Sur")
_CORTE = re.compile(
    r"\b(corte|cortes|suspension|suspensiones|apagon|apagones|sin luz|sin energia)\b"
)
_LUZ = re.compile(r"\b(luz|energia|electrico|electrica|electricos|electricas)\b")
# "No habrá cortes": la nota desmiente, no anuncia.
_DESMIENTE = re.compile(r"\b(no habra|descarta|descartan|niega|niegan)\b")


def es_cierre_de_vias(titulo: str, contenido: str = "") -> bool:
    """¿La nota anuncia un cierre de vías o un desvío en Cuenca? Se decide por el título."""
    t = sin_tildes(titulo.lower())
    if not (_CIERRE.search(t) and _VIA.search(t)) or _OTRO_LUGAR.search(t):
        return False
    return "cuenca" in t or "cuenca" in sin_tildes(contenido.lower())


def es_corte_de_luz(titulo: str, contenido: str = "") -> bool:
    """¿La nota anuncia cortes de energía que tocan a Cuenca? Se decide por el título."""
    t = sin_tildes(titulo.lower())
    if not (_CORTE.search(t) and _LUZ.search(t)) or _OTRO_LUGAR.search(t) or _DESMIENTE.search(t):
        return False
    resto = sin_tildes(contenido.lower())
    return any(lugar in t or lugar in resto for lugar in ("cuenca", "azuay", "centro sur"))


def parsear_notas(
    contenido: bytes, es_aviso: Callable[[str, str], bool], marca: tuple[str, str]
) -> list[dict[str, Any]]:
    """Los avisos de una página de la API. `marca` es (campo, texto): si el cuerpo de la nota
    nombra ese texto (la empresa que hace el corte, por ejemplo), el campo queda en true."""
    campo, nombre = marca
    avisos = []
    for nota in agua.leer_notas(contenido):
        titulo = agua.texto(nota.get("title", {}).get("rendered", ""))
        cuerpo = agua.texto(nota.get("content", {}).get("rendered", ""))
        if not es_aviso(titulo, cuerpo):
            continue
        publicado = str(nota.get("date", ""))[:10]
        avisos.append(
            {
                "publicado": publicado,
                "titulo": titulo,
                "enlace": nota.get("link"),
                "resumen": agua.texto(nota.get("excerpt", {}).get("rendered", ""))[:400],
                # "CentroSur" y "Centro Sur" son la misma empresa.
                campo: nombre in sin_tildes(cuerpo.lower()).replace("centrosur", "centro sur"),
                **agua.cuando(cuerpo, publicado),
            }
        )
    return avisos


def reunir(
    descargar: red.Descargador,
    busquedas: tuple[str, ...],
    es_aviso: Callable[[str, str], bool],
    marca: tuple[str, str],
    desde: date,
) -> list[dict[str, Any]]:
    """Todas las búsquedas de un tema, sin notas repetidas, de la más nueva a la más vieja."""
    vistos: dict[str, dict[str, Any]] = {}
    for busqueda in busquedas:
        pagina = descargar(agua.url_busqueda(desde, busqueda))
        for aviso in parsear_notas(pagina, es_aviso, marca):
            vistos.setdefault(aviso["enlace"], aviso)
    return sorted(vistos.values(), key=lambda a: (a["publicado"], a["enlace"]), reverse=True)


def _archivo(titulo: str, nota: str, avisos: list[dict[str, Any]], desde: date) -> dict[str, Any]:
    return {
        "metadata": {
            "titulo": titulo,
            "fuente": "El Mercurio (Cuenca)",
            "pagina": "https://elmercurio.com.ec/cuenca/",
            "datos": agua.API,
            "desde": desde.isoformat(),
            "nota": nota,
        },
        "avisos": avisos,
    }


def obtener(descargar: red.Descargador = red.descargar, hoy: date | None = None) -> dict[str, Any]:
    """Los dos archivos de avisos de prensa: {ruta: contenido}. Si un tema falla, el otro sale."""
    hoy = hoy or date.today()
    desde = hoy - timedelta(days=DIAS)
    archivos: dict[str, Any] = {}
    temas = (
        (
            "movilidad/cierres.json",
            "Cierres de vías y desvíos anunciados en la prensa",
            "Notas cuyo título anuncia un cierre de vías o un desvío en Cuenca. Sin revisar: la "
            "página las muestra con su título y su enlace. La fecha y el horario se leen de la "
            "nota automáticamente y pueden faltar.",
            BUSQUEDAS_CIERRES,
            es_cierre_de_vias,
            ("menciona_emov", "emov"),
        ),
        (
            "luz/avisos.json",
            "Avisos de cortes de luz en la prensa",
            "Notas cuyo título anuncia cortes de energía que tocan a Cuenca o al Azuay. Sin "
            "revisar: la página muestra las que citan a la Centro Sur, con su enlace. La fecha y "
            "el horario se leen de la nota automáticamente y pueden faltar.",
            BUSQUEDAS_LUZ,
            es_corte_de_luz,
            ("menciona_centrosur", "centro sur"),
        ),
    )
    for ruta, titulo, nota, busquedas, es_aviso, marca in temas:
        try:
            avisos = reunir(descargar, busquedas, es_aviso, marca, desde)
        except Exception:  # noqa: BLE001, S112 (un tema que falla no detiene al otro ni al agua)
            continue
        archivos[ruta] = _archivo(titulo, nota, avisos, desde)
    return archivos
