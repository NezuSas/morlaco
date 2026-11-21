import json
from datetime import date

from morlaco.fuentes import agua, prensa


def nota(titulo, cuerpo, fecha="2026-11-13T09:00:00", enlace=None):
    return {
        "date": fecha,
        "link": enlace or f"https://elmercurio.com.ec/{abs(hash(titulo))}/",
        "title": {"rendered": titulo},
        "excerpt": {"rendered": f"<p>{cuerpo[:80]}</p>"},
        "content": {"rendered": f"<p>{cuerpo}</p>"},
    }


def test_es_cierre_de_vias():
    si = prensa.es_cierre_de_vias
    assert si("Este fin de semana habrá cierres de vías en Cuenca")
    assert si("Varias vías de Cuenca se cerrarán este fin de semana")
    assert si(
        "Un tramo de la avenida de las Américas se cerrará esta tarde", "La EMOV de Cuenca informó…"
    )
    assert si("Estos son los cierres viales por el desfile estudiantil en Cuenca")
    # De otra ciudad, o sin vías, o sin Cuenca en ningún lado.
    assert not si(
        "Ecuador vs Bolivia: así serán los accesos al estadio y cierres viales en Guayaquil"
    )
    assert not si("Gobernador justifica cierres temporales del UPC de Turi", "En Cuenca…")
    assert not si("Habrá cierres de vías por el desfile", "En la capital…")


def test_es_corte_de_luz():
    si = prensa.es_corte_de_luz
    assert si(
        "Anuncian nuevos cortes de energía por mantenimiento",
        "La Centro Sur informó que en Cuenca…",
    )
    assert si("Cortes de luz complican el tránsito en el centro de Cuenca")
    assert si("Bajos caudales provocan cortes de energía en Azuay y varios sectores de Ecuador")
    # Desmiente, es de otra ciudad, no habla de luz o no toca a Cuenca.
    assert not si("Noboa ratifica que no habrá cortes de energía en los hogares", "En Cuenca…")
    assert not si("Cortes de luz en Guayaquil por las lluvias", "También en Cuenca…")
    assert not si("Corte Suprema permite reanudar el muro", "La luz verde…")
    assert not si(
        "15 provincias enfrentaron cortes de energía por mantenimiento", "En Pichincha y Guayas…"
    )


def test_obtener_guarda_cierres_y_luz_sin_repetir():
    cierre = nota(
        "Este fin de semana habrá cierres de vías en Cuenca",
        "La EMOV informó que el sábado 14 de noviembre de 2026, entre las 08:00 y las 13:00, "
        "se cerrará la avenida Solano.",
    )
    luz = nota(
        "Anuncian nuevos cortes de energía por mantenimiento",
        "La CentroSur suspenderá el servicio en Cuenca este viernes de 09h00 a 15h00.",
        fecha="2026-11-12T18:00:00",
    )
    otra = nota("El Deportivo Cuenca ganó en casa", "Fútbol.")

    def falso(url):
        return json.dumps([cierre, luz, otra]).encode()

    archivos = prensa.obtener(falso, hoy=date(2026, 11, 13))
    assert list(archivos) == ["movilidad/cierres.json", "luz/avisos.json"]
    (un_cierre,) = archivos["movilidad/cierres.json"]["avisos"]
    assert un_cierre["titulo"].startswith("Este fin de semana")
    assert (un_cierre["fecha"], un_cierre["desde"], un_cierre["hasta"]) == (
        "2026-11-14",
        "08:00",
        "13:00",
    )
    assert un_cierre["menciona_emov"] is True
    (un_corte,) = archivos["luz/avisos.json"]["avisos"]
    assert un_corte["menciona_centrosur"] is True
    assert (un_corte["fecha"], un_corte["desde"]) == ("2026-11-13", "09:00")


def test_un_tema_que_falla_no_detiene_al_otro_ni_al_agua():
    def falso(url):
        if "energ" in url or "luz" in url or "Centro" in url:
            raise OSError("sin respuesta")
        return b"[]"

    archivos = prensa.obtener(falso, hoy=date(2026, 11, 13))
    assert list(archivos) == ["movilidad/cierres.json"]
    # Y desde el agua, los tres archivos salen juntos.
    resultado = agua.obtener(lambda url: b"[]", hoy=date(2026, 11, 13))
    assert list(resultado.archivos) == [
        "agua/avisos.json",
        "movilidad/cierres.json",
        "luz/avisos.json",
    ]
