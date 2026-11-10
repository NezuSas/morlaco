import json
import urllib.error
from datetime import date
from pathlib import Path

import pymupdf
import pytest

from morlaco.fuentes import centrosur

PDF = (Path(__file__).parent / "fixtures" / "centrosur_2026_julio_08PF.pdf").read_bytes()
BASE = "https://www.centrosur.gob.ec/wp-content/uploads/documentospdf/SuspensionesProgramadas"


def test_listar_pdfs_sin_repetir_y_sin_fragmentos():
    html = f"""
      <iframe src="{BASE}/2026_julio_06PF.pdf#scrollbar=1&amp;toolbar=1"></iframe>
      <iframe src="{BASE}/2026_julio_06PF.pdf#scrollbar=1"></iframe>
      <a href="/wp-content/uploads/documentospdf/SuspensionesProgramadas/2026_julio_07PF.pdf">
      <a href="{BASE.replace("Suspensiones", "Otras")}/nada.pdf">
    """
    assert centrosur.listar_pdfs(html) == [
        f"{BASE}/2026_julio_06PF.pdf",
        f"{BASE}/2026_julio_07PF.pdf",
    ]


def test_fechas():
    assert centrosur.fecha_desde_nombre(f"{BASE}/2026_julio_08PF.pdf") == date(2026, 7, 8)
    assert centrosur.fecha_desde_nombre(f"{BASE}/2026_setiembre_1PF.pdf") == date(2026, 9, 1)
    assert centrosur.fecha_desde_nombre(f"{BASE}/2026_julio_32PF.pdf") is None
    assert centrosur.fecha_desde_texto("Miércoles 08 de julio de 2026") == date(2026, 7, 8)
    assert centrosur.fecha_desde_texto("sin fecha") is None


def test_parsear_pdf_real():
    publicacion = centrosur.parsear_pdf(PDF)
    assert publicacion["fecha"] == "2026-07-08"
    cortes = publicacion["cortes"]
    assert len(cortes) == 11
    assert cortes[0] == {
        "alimentador": "1423",
        "direccion": "SANTA MARIANITA",
        "desde": "10:00",
        "hasta": "13:00",
        "trabajo": "Gestion de vegetacion y recalibrado",
    }
    # Los saltos de línea dentro de una celda se unen en un solo texto.
    assert all("\n" not in c["trabajo"] for c in cortes)
    assert all(c["desde"] and c["hasta"] for c in cortes)


def test_obtener_ordena_por_fecha_y_marca_la_ultima():
    html = f'<iframe src="{BASE}/2026_julio_08PF.pdf"></iframe>'.encode()

    def falso(url):
        return html if url == centrosur.PAGINA else PDF

    resultado = centrosur.obtener(falso)
    datos = resultado.archivos["luz/suspensiones.json"]
    assert datos["metadata"]["ultima_publicacion"] == "2026-07-08"
    assert datos["publicaciones"][0]["pdf"] == f"{BASE}/2026_julio_08PF.pdf"
    assert resultado.resumen == {
        "publicaciones": 1,
        "cortes": 11,
        "ultima_publicacion": "2026-07-08",
        "pdfs_no_disponibles": 0,
        "otras_publicaciones": 0,
        "otras_mencionan_cuenca": 0,
    }
    # Sin la página nueva ni la API (aquí devuelven un PDF), se anota el error y se sigue.
    assert datos["otras_publicaciones"] == []
    assert datos["metadata"]["otras_publicaciones_error"]


def _error_http(url, codigo):
    return urllib.error.HTTPError(url, codigo, "error", None, None)


def test_obtener_salta_pdfs_que_ya_no_existen():
    roto = f"{BASE}/2026_marzo_22PF.pdf"
    html = f'<a href="{roto}"></a><a href="{BASE}/2026_julio_08PF.pdf"></a>'.encode()

    def falso(url):
        if url == centrosur.PAGINA:
            return html
        if url == roto:
            raise _error_http(url, 404)
        return PDF

    resultado = centrosur.obtener(falso)
    datos = resultado.archivos["luz/suspensiones.json"]
    assert datos["metadata"]["pdfs_no_disponibles"] == [roto]
    assert resultado.resumen["publicaciones"] == 1


def test_obtener_no_oculta_errores_del_servidor():
    html = f'<a href="{BASE}/2026_julio_08PF.pdf"></a>'.encode()

    def falso(url):
        if url == centrosur.PAGINA:
            return html
        raise _error_http(url, 503)

    with pytest.raises(urllib.error.HTTPError):
        centrosur.obtener(falso)


def _cartel(texto):
    """Un PDF de una página con ese texto, como los carteles de Centro Sur."""
    documento = pymupdf.open()
    pagina = documento.new_page()
    pagina.insert_text((40, 60), texto, fontsize=9)
    contenido = documento.tobytes()
    documento.close()
    return contenido


SUBIDAS = "https://www.centrosur.gob.ec/wp-content/uploads"
CARTEL_MORONA = _cartel(
    "CANTON: SANTIAGO / MENDEZ\nSABADO 17 DE OCTUBRE DE 2026\n"
    "MANTENIMIENTOS DE CONTINGENCIA\n03:00 a 06:00 MANTENIMIENTO DE ESTRUCTURAS\n"
    "A LO LARGO DE LA TRONCAL AMAZONICA"
)
CARTEL_CUENCA = _cartel(
    "CANTON: CUENCA\nMARTES 17 DE NOVIEMBRE DE 2026\nCORTES PROGRAMADOS\n"
    "08:00 a 12:00 BARRIO TOTORACOCHA"
)
LISTA_INDUSTRIAS = _cartel("NOMBRE DEL ABONADO CUENTA CONTRATO\nCERAMICA RIALTO S.A. 200003841232")


def test_leer_cronograma():
    assert centrosur.leer_cronograma(CARTEL_MORONA) == {
        "fecha": "2026-10-17",
        "provincias": ["Morona Santiago"],
        "menciona_cuenca": False,
    }
    cuenca = centrosur.leer_cronograma(CARTEL_CUENCA)
    assert cuenca["menciona_cuenca"] and cuenca["provincias"] == ["Azuay"]
    # Una lista sin horarios no es un cronograma de cortes.
    assert centrosur.leer_cronograma(LISTA_INDUSTRIAS) is None


def test_candidatas_recientes_de_la_pagina_y_de_la_api():
    html = (
        f'<a href="{SUBIDAS}/2026/10/Mesa-de-trabajo-1.pdf">Mantenimientos</a>'
        f'<a href="{SUBIDAS}/2026/05/Politicas-BID.pdf">Menú</a>'
    )
    medios = [
        {"date": "2026-11-09T14:30:48", "source_url": f"{SUBIDAS}/2026/11/Informe.pdf",
         "title": {"rendered": "Informe CentroSur 2026"}},
        {"date": "2026-10-16T20:00:14", "source_url": f"{SUBIDAS}/2026/10/Mantenimientos-17.pdf",
         "title": {"rendered": "Mantenimientos-17-de-octubre"}},
    ]  # fmt: skip
    assert centrosur.candidatas(html, medios, date(2026, 11, 10)) == [
        f"{SUBIDAS}/2026/10/Mantenimientos-17.pdf",
        f"{SUBIDAS}/2026/10/Mesa-de-trabajo-1.pdf",
    ]


def test_obtener_incluye_los_cronogramas_sueltos():
    html_viejo = f'<a href="{BASE}/2026_julio_08PF.pdf"></a>'.encode()
    html_nuevo = (
        f'<a href="{SUBIDAS}/2026/11/Cortes-17-noviembre.pdf"></a>'
        f'<a href="{SUBIDAS}/2026/10/Clientes-Industriales.pdf"></a>'
    ).encode()
    medios = [{"date": "2026-10-16T20:00:14", "source_url": f"{SUBIDAS}/2026/10/Mantenimientos.pdf",
               "title": {"rendered": "Mantenimientos-17-de-octubre"}}]  # fmt: skip
    respuestas = {
        centrosur.PAGINA: html_viejo,
        centrosur.PROGRAMACION: html_nuevo,
        centrosur.MEDIOS: "﻿".encode() + json.dumps(medios).encode(),  # con BOM, como la real
        f"{SUBIDAS}/2026/11/Cortes-17-noviembre.pdf": CARTEL_CUENCA,
        f"{SUBIDAS}/2026/10/Clientes-Industriales.pdf": LISTA_INDUSTRIAS,
        f"{SUBIDAS}/2026/10/Mantenimientos.pdf": CARTEL_MORONA,
    }
    resultado = centrosur.obtener(lambda url: respuestas.get(url, PDF), hoy=date(2026, 11, 10))
    datos = resultado.archivos["luz/suspensiones.json"]
    assert [(o["fecha"], o["menciona_cuenca"]) for o in datos["otras_publicaciones"]] == [
        ("2026-11-17", True),
        ("2026-10-17", False),
    ]
    assert datos["metadata"]["otras_publicaciones_error"] is None
    assert resultado.resumen["otras_mencionan_cuenca"] == 1
