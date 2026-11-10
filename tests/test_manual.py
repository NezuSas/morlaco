"""Comprueba los datos que se mantienen a mano (datos/manual/), para no publicar un error."""

import json
from datetime import date
from pathlib import Path

import pytest

MANUAL = Path(__file__).parent.parent / "datos" / "manual"


@pytest.fixture(scope="module")
def transporte():
    return json.loads((MANUAL / "transporte.json").read_text(encoding="utf-8"))


def _fecha(texto):
    return date.fromisoformat(texto)


def test_tarifas_con_fuente_y_valores_razonables(transporte):
    bus, tranvia = transporte["tarifas"]["bus"], transporte["tarifas"]["tranvia"]
    assert 0 < bus["personalizada_preferencial"] < bus["personalizada"] < bus["sin_subsidio"] < 1
    assert 0 < tranvia["normal"] < 1 and 0 < tranvia["descuento_preferencial"] < 1
    for tarifa in (bus, tranvia):
        assert tarifa["fuente"].startswith("https://")


def test_avisos_completos_en_los_dos_idiomas(transporte):
    assert transporte["avisos"]
    for aviso in transporte["avisos"]:
        assert aviso["lineas"] and all(isinstance(linea, str) for linea in aviso["lineas"])
        assert _fecha(aviso["desde"]) <= _fecha(aviso["hasta"])
        assert aviso["es"].strip() and aviso["en"].strip()
        assert aviso["fuente"].startswith("https://")


def test_avisos_de_lineas_que_existen():
    rutas = Path(__file__).parent.parent / "datos" / "buses" / "rutas.json"
    if not rutas.exists():
        pytest.skip("falta datos/buses/rutas.json (morlaco actualizar buses)")
    lineas = {r["linea"] for r in json.loads(rutas.read_text(encoding="utf-8"))["rutas"]}
    transporte = json.loads((MANUAL / "transporte.json").read_text(encoding="utf-8"))
    for aviso in transporte["avisos"]:
        assert set(aviso["lineas"]) <= lineas, aviso["lineas"]


def test_frecuencia_del_tranvia(transporte):
    frecuencia = transporte["tranvia"]["frecuencia_min"]
    assert 0 < frecuencia["lunes_viernes"] <= frecuencia["fin_de_semana"] <= 60
    assert transporte["tranvia"]["fuente"].startswith("https://")
