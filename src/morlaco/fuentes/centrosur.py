"""Suspensiones programadas del servicio eléctrico de Centro Sur.

Centro Sur publica en su página de suspensiones programadas un PDF por día con
una tabla: alimentador, dirección, hora de inicio, hora de fin y trabajo a
ejecutar. El PDF tiene texto real, así que la tabla se puede leer directamente.

Aviso: en noviembre de 2026 la página no se actualizaba desde el 6 de julio de
2026. Por eso el resultado incluye la fecha de la última publicación, para que
quien use los datos sepa si están al día.
"""

from __future__ import annotations

import re
import urllib.error
from datetime import date
from typing import Any
from urllib.parse import urljoin

import pymupdf

from morlaco import red
from morlaco.comun import MESES, Resultado, decodificar, hora, limpiar, sin_tildes

# Sin esto, pymupdf imprime una sugerencia de instalar otro paquete en cada ejecución.
if hasattr(pymupdf, "no_recommend_layout"):
    pymupdf.no_recommend_layout()

PAGINA = "https://www.centrosur.gob.ec/suspensiones-programadas/"

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


def obtener(descargar: red.Descargador = red.descargar) -> Resultado:
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
    datos = {
        "metadata": {
            "titulo": "Suspensiones programadas del servicio eléctrico",
            "fuente": "Centro Sur C.A.",
            "pagina": PAGINA,
            "ultima_publicacion": ultima,
            "nota": "Las direcciones son texto tal como lo publica Centro Sur; no traen "
            "coordenadas. Revise ultima_publicacion: la página no siempre se actualiza.",
            "pdfs_no_disponibles": no_disponibles,
        },
        "publicaciones": publicaciones,
    }
    return Resultado(
        archivos={"luz/suspensiones.json": datos},
        resumen={
            "publicaciones": len(publicaciones),
            "cortes": sum(len(p["cortes"]) for p in publicaciones),
            "ultima_publicacion": ultima,
            "pdfs_no_disponibles": len(no_disponibles),
        },
    )
