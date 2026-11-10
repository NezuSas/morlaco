"""Suspensiones programadas del servicio eléctrico de Centro Sur.

Centro Sur publica en su página de suspensiones programadas un PDF por día con
una tabla: alimentador, dirección, hora de inicio, hora de fin y trabajo a
ejecutar. El PDF tiene texto real, así que la tabla se puede leer directamente.

Aviso: en noviembre de 2026 la página no se actualizaba desde el 6 de julio de
2026. Por eso el resultado incluye la fecha de la última publicación, para que
quien use los datos sepa si están al día.

Desde octubre de 2026 Centro Sur publica además cronogramas sueltos (carteles en
PDF, sin tabla) en su página "Programación de cortes" y en su biblioteca de
medios. Esos no se pueden leer corte por corte, pero sí saber de qué día son, de
qué provincias hablan y si mencionan Cuenca: van en "otras_publicaciones".
"""

from __future__ import annotations

import json
import re
import urllib.error
from datetime import date, timedelta
from typing import Any
from urllib.parse import urljoin

import pymupdf

from morlaco import red
from morlaco.comun import MESES, Resultado, decodificar, hora, limpiar, sin_tildes

# Sin esto, pymupdf imprime una sugerencia de instalar otro paquete en cada ejecución.
if hasattr(pymupdf, "no_recommend_layout"):
    pymupdf.no_recommend_layout()

PAGINA = "https://www.centrosur.gob.ec/suspensiones-programadas/"
PROGRAMACION = "https://www.centrosur.gob.ec/intermedia-programacion/"
# API de WordPress del sitio: los PDF subidos, del más nuevo al más viejo.
MEDIOS = (
    "https://www.centrosur.gob.ec/wp-json/wp/v2/media?mime_type=application/pdf"
    "&orderby=date&order=desc&per_page=30&_fields=date,source_url,title"
)
DIAS_RECIENTES = 60
MAXIMO_OTRAS = 6

_SUBIDA = re.compile(
    r"""https?://www\.centrosur\.gob\.ec/wp-content/uploads/(\d{4})/(\d{2})/[^"'\s<>#?]+\.pdf""",
    re.IGNORECASE,
)
_PALABRAS_CORTE = re.compile(r"mantenimiento|corte|suspensi|interrupci|trabajos programados", re.I)
_RANGO_HORAS = re.compile(r"\d{1,2}[:h]\d{2}\s*(?:a|-|–|hasta)\s*\d{1,2}[:h]\d{2}", re.I)
# Cantones del área de Centro Sur, para decir de qué provincia habla un cronograma.
PROVINCIAS = {
    "Azuay": [
        "cuenca", "gualaceo", "paute", "sigsig", "chordeleg", "giron", "santa isabel", "nabon",
        "san fernando", "pucara", "sevilla de oro", "guachapala", "ponce enriquez",
    ],
    # Sin "la troncal": choca con la vía Troncal Amazónica de los cronogramas de Morona.
    "Cañar": ["azogues", "biblian", "deleg", "el tambo", "suscal"],
    "Morona Santiago": [
        "morona", "macas", "gualaquiza", "limon indanza", "sucua", "logrono", "san juan bosco",
        "huamboya", "palora", "pablo sexto", "taisha", "tiwintza", "mendez",
    ],
}  # fmt: skip

_PDF = re.compile(r"""[^"'\s<>]*SuspensionesProgramadas/[^"'\s<>#?]+\.pdf""", re.IGNORECASE)
_FECHA_NOMBRE = re.compile(r"(\d{4})_([a-z]+)_(\d{1,2})", re.IGNORECASE)
_FECHA_TEXTO = re.compile(r"(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})", re.IGNORECASE)


def _fecha(anio: str, mes: str, dia: str) -> date | None:
    numero_mes = MESES.get(sin_tildes(mes.lower()))
    if not numero_mes:
        return None
    try:
        return date(int(anio), numero_mes, int(dia))
    except ValueError:
        return None


def listar_pdfs(html: str, base: str = PAGINA) -> list[str]:
    """Las URLs de los PDF de suspensiones que enlaza la página, sin repetir."""
    vistas: dict[str, None] = {}
    for coincidencia in _PDF.findall(html):
        vistas.setdefault(urljoin(base, coincidencia), None)
    return list(vistas)


def fecha_desde_nombre(url: str) -> date | None:
    """'.../2026_julio_08PF.pdf' -> 2026-07-08."""
    coincidencia = _FECHA_NOMBRE.search(url.rsplit("/", 1)[-1])
    if not coincidencia:
        return None
    anio, mes, dia = coincidencia.groups()
    return _fecha(anio, mes, dia)


def fecha_desde_texto(texto: str) -> date | None:
    """'Miércoles 08 de julio de 2026' -> 2026-07-08."""
    coincidencia = _FECHA_TEXTO.search(texto)
    if not coincidencia:
        return None
    dia, mes, anio = coincidencia.groups()
    return _fecha(anio, mes, dia)


def _es_cabecera(celdas: list[str]) -> bool:
    return sin_tildes(celdas[0].lower()).startswith("alimentador")


def parsear_pdf(contenido: bytes) -> dict[str, Any]:
    """Lee la tabla de suspensiones de un PDF de Centro Sur."""
    documento = pymupdf.open(stream=contenido, filetype="pdf")
    try:
        texto = "\n".join(pagina.get_text() for pagina in documento)
        cortes = []
        for pagina in documento:
            for tabla in pagina.find_tables().tables:
                for fila in tabla.extract():
                    celdas = [limpiar(c) for c in fila]
                    if len(celdas) < 5 or _es_cabecera(celdas) or not any(celdas[:2]):
                        continue
                    alimentador, direccion, desde, hasta, trabajo = celdas[:5]
                    cortes.append(
                        {
                            "alimentador": alimentador,
                            "direccion": direccion,
                            "desde": hora(desde),
                            "hasta": hora(hasta),
                            "trabajo": trabajo,
                        }
                    )
    finally:
        documento.close()
    fecha = fecha_desde_texto(texto)
    return {"fecha": fecha.isoformat() if fecha else None, "cortes": cortes}


def _texto_pdf(contenido: bytes) -> str:
    documento = pymupdf.open(stream=contenido, filetype="pdf")
    try:
        return "\n".join(pagina.get_text() for pagina in documento)
    finally:
        documento.close()


def candidatas(html_programacion: str, medios: list[dict[str, Any]], hoy: date) -> list[str]:
    """PDF recientes que pueden ser cronogramas de cortes, del más nuevo al más viejo.

    Entran los que enlaza la página "Programación de cortes" y los de la biblioteca
    de medios cuyo título habla de cortes o mantenimientos, subidos en los últimos
    DIAS_RECIENTES días.
    """
    desde = hoy - timedelta(days=DIAS_RECIENTES)
    encontradas: dict[str, str] = {}
    for medio in medios:
        url = medio.get("source_url") or ""
        titulo = (medio.get("title") or {}).get("rendered") or ""
        subido = (medio.get("date") or "")[:10]
        if subido >= desde.isoformat() and _PALABRAS_CORTE.search(f"{titulo} {url}"):
            encontradas.setdefault(url, subido)
    for coincidencia in _SUBIDA.finditer(html_programacion):
        anio, mes = int(coincidencia.group(1)), int(coincidencia.group(2))
        if date(anio, mes, 1) >= desde.replace(day=1):
            encontradas.setdefault(coincidencia.group(0), f"{anio:04d}-{mes:02d}")
    ordenadas = sorted(encontradas, key=lambda u: encontradas[u], reverse=True)
    return ordenadas[:MAXIMO_OTRAS]


def leer_cronograma(contenido: bytes) -> dict[str, Any] | None:
    """Fecha, provincias y si menciona Cuenca; None si el PDF no es un cronograma."""
    texto = _texto_pdf(contenido)
    if not (_PALABRAS_CORTE.search(texto) and _RANGO_HORAS.search(texto)):
        return None
    palabras = f" {' '.join(re.findall(r'[a-zñ]+', sin_tildes(texto.lower())))} "
    provincias = [
        provincia
        for provincia, cantones in PROVINCIAS.items()
        if any(f" {canton} " in palabras for canton in cantones)
    ]
    fecha = fecha_desde_texto(texto)
    return {
        "fecha": fecha.isoformat() if fecha else None,
        "provincias": provincias,
        "menciona_cuenca": " cuenca " in palabras,
    }


def otras_publicaciones(descargar: red.Descargador, hoy: date) -> list[dict[str, Any]]:
    """Los cronogramas sueltos de los últimos días (ver el docstring del módulo)."""
    html = decodificar(descargar(PROGRAMACION))
    medios = json.loads(decodificar(descargar(MEDIOS)))
    resultado = []
    for url in candidatas(html, medios if isinstance(medios, list) else [], hoy):
        try:
            cronograma = leer_cronograma(descargar(url))
        except urllib.error.HTTPError as error:
            if error.code >= 500:
                raise
            continue
        if cronograma:
            resultado.append({"pdf": url, **cronograma})
    resultado.sort(key=lambda p: p["fecha"] or "", reverse=True)
    return resultado


def obtener(descargar: red.Descargador = red.descargar, hoy: date | None = None) -> Resultado:
    hoy = hoy or date.today()
    pdfs = listar_pdfs(decodificar(descargar(PAGINA)))
    publicaciones = []
    no_disponibles = []
    for url in pdfs:
        try:
            contenido = descargar(url)
        except urllib.error.HTTPError as error:
            # La página a veces enlaza PDFs que ya no existen; se anotan y se sigue.
            if error.code >= 500:
                raise
            no_disponibles.append(url)
            continue
        publicacion = parsear_pdf(contenido)
        if publicacion["fecha"] is None:
            fecha = fecha_desde_nombre(url)
            publicacion["fecha"] = fecha.isoformat() if fecha else None
        publicaciones.append({"pdf": url, **publicacion})
    publicaciones.sort(key=lambda p: p["fecha"] or "")
    fechas = [p["fecha"] for p in publicaciones if p["fecha"]]
    ultima = fechas[-1] if fechas else None
    # Los cronogramas sueltos son un extra: si fallan, se anota y se sigue.
    error_otras = None
    try:
        otras = otras_publicaciones(descargar, hoy)
    except (urllib.error.URLError, ValueError, RuntimeError) as error:
        otras, error_otras = [], f"{type(error).__name__}: {error}"
    datos = {
        "metadata": {
            "titulo": "Suspensiones programadas del servicio eléctrico",
            "fuente": "Centro Sur C.A.",
            "pagina": PAGINA,
            "ultima_publicacion": ultima,
            "nota": "Las direcciones son texto tal como lo publica Centro Sur; no traen "
            "coordenadas. Revise ultima_publicacion: la página no siempre se actualiza.",
            "pdfs_no_disponibles": no_disponibles,
            "programacion": PROGRAMACION,
            "otras_publicaciones_error": error_otras,
        },
        "publicaciones": publicaciones,
        "otras_publicaciones": otras,
    }
    return Resultado(
        archivos={"luz/suspensiones.json": datos},
        resumen={
            "publicaciones": len(publicaciones),
            "cortes": sum(len(p["cortes"]) for p in publicaciones),
            "ultima_publicacion": ultima,
            "pdfs_no_disponibles": len(no_disponibles),
            "otras_publicaciones": len(otras),
            "otras_mencionan_cuenca": sum(o["menciona_cuenca"] for o in otras),
        },
    )
