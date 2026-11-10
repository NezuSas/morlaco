"""El catálogo (datos/indice.json) tiene que describir exactamente lo que se publica."""

import json
from pathlib import Path

from morlaco import catalogo, cli

DATOS = Path(__file__).parent.parent / "datos"


def _archivos(conjunto):
    """Las rutas de un conjunto: varias separadas por comas comparten carpeta."""
    partes = [p.strip() for p in conjunto["archivo"].split(",")]
    carpeta = partes[0].rsplit("/", 1)[0] + "/" if "/" in partes[0] else ""
    return [p if "/" in p else carpeta + p for p in partes]


def test_cada_conjunto_esta_completo():
    ids = [c["id"] for c in catalogo.CONJUNTOS]
    assert len(ids) == len(set(ids))
    for c in catalogo.CONJUNTOS:
        for clave in ("titulo", "descripcion", "formato", "frecuencia", "fuente", "licencia"):
            assert c[clave].strip(), (c["id"], clave)
        assert c["fuente_morlaco"] is None or c["fuente_morlaco"] in cli.FUENTES, c["id"]


def test_los_archivos_del_catalogo_existen():
    for c in catalogo.CONJUNTOS:
        for archivo in _archivos(c):
            if "zona-N" in archivo:
                assert (DATOS / "recoleccion" / "calendarios" / "zona-1.ics").exists()
                continue
            assert (DATOS / archivo).exists(), archivo


def test_todo_lo_que_escribe_la_cli_esta_en_el_catalogo():
    estado = json.loads((DATOS / "estado.json").read_text(encoding="utf-8"))
    descritos = {a for c in catalogo.CONJUNTOS for a in _archivos(c)}
    for nombre, e in estado.items():
        for archivo in e.get("archivos", []):
            if archivo.startswith("recoleccion/calendarios/"):
                continue  # descritos juntos como zona-N.ics
            assert archivo in descritos, f"{nombre}: {archivo} no está en el catálogo"


def test_indice_publicado_al_dia():
    publicado = json.loads((DATOS / "indice.json").read_text(encoding="utf-8"))
    assert publicado == json.loads(json.dumps(catalogo.indice())), (
        "datos/indice.json no coincide con catalogo.py: corre `morlaco actualizar` o "
        "escribe el índice con catalogo.escribir_indice"
    )
    assert publicado["version"] == 1
    assert all(c["url"].startswith(catalogo.BASE) for c in publicado["conjuntos"])
