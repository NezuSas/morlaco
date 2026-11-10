import json
from datetime import date
from pathlib import Path

from morlaco import cambios, paginas


def _datos(tmp_path, cortes=()):
    for carpeta in ("recoleccion", "farmacias", "manual"):
        (tmp_path / carpeta).mkdir(parents=True, exist_ok=True)
    zonas = [
        {"properties": {"zona": 2, "dias": ["martes", "jueves", "sábado"], "desde": "08:00",
                        "hasta": "12:00", "dia_reciclaje": "jueves"}},
        {"properties": {"zona": 1, "dias": ["lunes", "miércoles", "viernes"], "desde": "20:00",
                        "hasta": "24:00", "dia_reciclaje": "miércoles"}},
    ]  # fmt: skip
    turno = lambda inicio, fin, nombre: {  # noqa: E731
        "inicio": inicio,
        "fin": fin,
        "farmacias": [{"nombre": nombre, "direccion": "Bolívar y Borrero",
                       "telefono": "072222222", "tel": "+59372222222"}],
    }  # fmt: skip
    escribir = lambda ruta, obj: (tmp_path / ruta).write_text(json.dumps(obj), encoding="utf-8")  # noqa: E731
    escribir("recoleccion/zonas.geojson", {"features": zonas})
    escribir("farmacias/turnos.json", {
        "metadata": {"pdfs": ["https://www.controlsanitario.gob.ec/turnos.pdf"]},
        "turnos": [turno("2026-11-07", "2026-11-14", "Farmacia Uno"),
                   turno("2026-11-14", "2026-11-21", "Farmacia Dos")],
    })  # fmt: skip
    escribir("manual/agua.json", {"cortes": list(cortes)})
    return tmp_path


def test_paginas_por_zona_en_los_dos_idiomas(tmp_path):
    hechas = paginas.generar(_datos(tmp_path), date(2026, 11, 10))
    es = hechas["info/basura-zona-1.html"]
    assert "los lunes, miércoles y viernes, de 20:00 a medianoche" in es
    assert "<title>Horario de la basura en la zona 1 de Cuenca | Morlaco</title>" in es
    assert '"@type": "FAQPage"' in es
    assert 'href="basura-zona-2.html"' in es and 'href="basura-zona-1.html"' not in es
    assert "info/img/zona-1.png" in es
    assert (
        'hreflang="en" href="https://nezusas.github.io/morlaco/web/info/en/basura-zona-1.html"'
        in es
    )
    assert "los martes, jueves y sábados" in hechas["info/basura-zona-2.html"]
    en = hechas["info/en/basura-zona-1.html"]
    assert "Mondays, Wednesdays and Fridays, 20:00 to midnight" in en
    assert "info/img/zona-1-en.png" in en
    assert '<html lang="en">' in en and 'href="../../estilos.css"' in en


def test_farmacias_del_turno_de_hoy_y_el_siguiente(tmp_path):
    hechas = paginas.generar(_datos(tmp_path), date(2026, 11, 10))
    es = hechas["info/farmacias-de-turno.html"]
    assert "Del sábado 7 de noviembre al sábado 14 de noviembre" in es
    assert "Farmacia Uno" in es and "Farmacia Dos" in es
    assert 'href="tel:+59372222222"' in es
    sin_turno = paginas.generar(tmp_path, date(2026, 12, 1))
    assert "todavía no ha publicado" in sin_turno["info/farmacias-de-turno.html"]
    assert "Farmacia Uno" not in sin_turno["info/farmacias-de-turno.html"]


def test_cortes_de_agua_solo_los_que_vienen(tmp_path):
    corte = {"fecha": "2026-11-12", "desde": "08:00", "hasta": "16:00",
             "es": {"sectores": "Totoracocha"}, "en": {"sectores": "Totoracocha area"},
             "fuente": {"nombre": "El Mercurio", "url": "https://elmercurio.com.ec/x"}}  # fmt: skip
    viejo = {**corte, "fecha": "2026-11-01", "es": {"sectores": "Yanuncay"}}
    hechas = paginas.generar(_datos(tmp_path, [corte, viejo]), date(2026, 11, 10))
    assert "jueves 12 de noviembre, de 08:00 a 16:00" in hechas["info/cortes-de-agua.html"]
    assert "Yanuncay" not in hechas["info/cortes-de-agua.html"]
    assert "Totoracocha area" in hechas["info/en/cortes-de-agua.html"]
    vacio = paginas.generar(_datos(tmp_path), date(2026, 11, 10))
    assert "No hay cortes de agua anunciados" in vacio["info/cortes-de-agua.html"]


def test_mapa_del_sitio(tmp_path):
    mapa = paginas.generar(_datos(tmp_path), date(2026, 11, 10))["../sitemap.xml"]
    assert "<loc>https://nezusas.github.io/morlaco/web/</loc>" in mapa
    assert "<loc>https://nezusas.github.io/morlaco/web/info/</loc>" in mapa
    assert "<loc>https://nezusas.github.io/morlaco/web/info/en/basura-zona-2.html</loc>" in mapa
    assert mapa.count("<url>") == 2 + 2 * (1 + 2 + 2)


def test_escribir_deja_el_mapa_junto_a_web(tmp_path):
    datos = _datos(tmp_path / "datos")
    web = tmp_path / "web"
    paginas.escribir(datos, web, date(2026, 11, 10))
    assert (web / "info" / "en" / "cortes-de-agua.html").exists()
    assert (tmp_path / "sitemap.xml").exists()


def test_el_titulo_del_commit_si_solo_cambian_las_paginas():
    mensaje = cambios.mensaje_commit(["../web/info/index.html"], {}, date(2026, 11, 10))
    assert mensaje.splitlines()[0] == "Páginas al día (2026-11-10)"


def test_cada_zona_tiene_su_imagen_para_compartir():
    raiz = Path(__file__).resolve().parents[1]
    zonas = json.loads((raiz / "datos/recoleccion/zonas.geojson").read_text(encoding="utf-8"))
    for zona in zonas["features"]:
        for sufijo in ("", "-en"):
            imagen = raiz / f"web/info/img/zona-{zona['properties']['zona']}{sufijo}.png"
            assert imagen.exists(), imagen
