import urllib.error
from datetime import date
from pathlib import Path

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
    }


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
