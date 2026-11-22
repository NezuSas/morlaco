import json
from datetime import date

from morlaco import cli, revision
from morlaco import vigilancia_farmacias as vigilancia

LUNES = date(2026, 11, 23)
OTRO_LUNES = date(2026, 11, 30)


def farmacia(i, nombre=None, **extra):
    return {
        "osm": f"node/{i}",
        "nombre": nombre or f"Farmacia {i}",
        "lat": -2.9 + i / 10000,
        "lon": -79.0,
        "direccion": None,
        "telefono": None,
        "horario": None,
        **extra,
    }


def lista(farmacias):
    return {"metadata": {"titulo": "Farmacias de Cuenca"}, "farmacias": farmacias}


def test_la_primera_vez_se_publica_tal_cual():
    nueva = lista([farmacia(1)])
    assert vigilancia.combinar(nueva, None, None, LUNES) == nueva


def test_anota_lo_nuevo_lo_quitado_y_lo_cambiado():
    anterior = lista([farmacia(1), farmacia(2), farmacia(3)])
    nueva = lista([farmacia(1), farmacia(3, horario="Mo-Su 08:00-20:00"), farmacia(4)])
    datos = vigilancia.combinar(nueva, anterior, None, LUNES)
    assert [f["osm"] for f in datos["farmacias"]] == ["node/1", "node/3", "node/4"]
    assert datos["metadata"]["cambios"] == [
        {
            "fecha": "2026-11-23",
            "nuevas": [{"osm": "node/4", "nombre": "Farmacia 4"}],
            "quitadas": [{"osm": "node/2", "nombre": "Farmacia 2"}],
            "cambiadas": [{"osm": "node/3", "nombre": "Farmacia 3", "campos": ["horario"]}],
        }
    ]
    assert "detenidas" not in datos["metadata"]
    # Sin revisar, la semana siguiente se suma a lo de la anterior; revisado, se olvida.
    otra = lista([*nueva["farmacias"], farmacia(5)])
    sin_revisar = vigilancia.combinar(otra, datos, None, OTRO_LUNES)["metadata"]["cambios"]
    assert [c["fecha"] for c in sin_revisar] == ["2026-11-23", "2026-11-30"]
    revisado = vigilancia.combinar(otra, datos, LUNES, OTRO_LUNES)["metadata"]["cambios"]
    assert [c["fecha"] for c in revisado] == ["2026-11-30"]


def test_el_tope_detiene_lo_que_llega_de_golpe_hasta_revisarlo():
    anterior = lista([farmacia(i) for i in range(30)])
    # 25 nuevas: no se publican; las otras siguen.
    nueva = lista([farmacia(i) for i in range(55)])
    datos = vigilancia.combinar(nueva, anterior, None, LUNES)
    assert len(datos["farmacias"]) == 30
    assert datos["metadata"]["detenidas"] == {"desde": "2026-11-23", "nuevas": 25, "quitadas": 0}
    assert datos["metadata"]["cambios"] == []
    # La semana siguiente siguen detenidas, desde la misma fecha.
    otra = vigilancia.combinar(nueva, datos, None, OTRO_LUNES)
    assert len(otra["farmacias"]) == 30
    assert otra["metadata"]["detenidas"]["desde"] == "2026-11-23"
    # Revisadas, se publican sin volver a avisarse.
    aceptada = vigilancia.combinar(nueva, otra, date(2026, 11, 24), OTRO_LUNES)
    assert len(aceptada["farmacias"]) == 55
    assert "detenidas" not in aceptada["metadata"] and aceptada["metadata"]["cambios"] == []


def test_un_borrado_masivo_tambien_se_detiene():
    anterior = lista([farmacia(i) for i in range(40)])
    nueva = lista([farmacia(i) for i in range(10)])
    datos = vigilancia.combinar(nueva, anterior, None, LUNES)
    assert len(datos["farmacias"]) == 40
    assert datos["metadata"]["detenidas"]["quitadas"] == 30


def test_los_avisos_de_la_revision():
    anterior = lista([farmacia(1), farmacia(2)])
    nueva = lista([farmacia(1, nombre="Farmacia Nueva Era"), farmacia(3)])
    datos = vigilancia.combinar(nueva, anterior, None, LUNES)
    [punto] = vigilancia.pendientes(datos, None)
    assert "desde el 2026-11-23" in punto
    assert "1 nueva: [Farmacia 3](https://www.openstreetmap.org/node/3/history)" in punto
    assert "1 quitada: [Farmacia 2]" in punto and "1 con cambios: [Farmacia Nueva Era]" in punto
    assert "`datos/manual/farmacias.json`" in punto
    # Al poner la fecha de revisión, deja de avisarse (aunque falte el lunes para descargar).
    assert vigilancia.pendientes(datos, LUNES) == []

    detenida = vigilancia.combinar(
        lista([farmacia(i) for i in range(30)]), lista([farmacia(1)]), None, LUNES
    )
    [punto] = vigilancia.pendientes(detenida, None)
    assert "29 farmacias nuevas" in punto and "no se publican desde el 2026-11-23" in punto
    assert vigilancia.pendientes(detenida, LUNES) == []


def test_la_revision_diaria_y_la_cli_usan_la_vigilancia(tmp_path, monkeypatch):
    (tmp_path / "ciudad").mkdir()
    (tmp_path / "manual").mkdir()
    anterior = lista([farmacia(i) for i in range(30)])
    (tmp_path / "ciudad" / "farmacias.json").write_text(json.dumps(anterior), encoding="utf-8")
    (tmp_path / "manual" / "farmacias.json").write_text('{"revisado": null}', encoding="utf-8")
    monkeypatch.setattr(revision, "hoy_en_cuenca", lambda: LUNES)
    publicada = cli._vigilar_farmacias(lista([farmacia(i) for i in range(60)]), tmp_path)
    assert len(publicada["farmacias"]) == 30
    (tmp_path / "ciudad" / "farmacias.json").write_text(json.dumps(publicada), encoding="utf-8")
    mensajes = [p["mensaje"] for p in revision.revisar(tmp_path, LUNES)]
    assert any("30 farmacias nuevas" in m for m in mensajes)
