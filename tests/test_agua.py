import json
from datetime import date

from morlaco.fuentes import agua


def nota(titulo, contenido, fecha="2026-10-13T08:18:48", enlace=None):
    return {
        "date": fecha,
        "link": enlace or f"https://elmercurio.com.ec/cuenca/{titulo[:10]}/",
        "title": {"rendered": titulo},
        "excerpt": {"rendered": f"<p>{contenido[:80]}</p>"},
        "content": {"rendered": f"<p>{contenido}</p>"},
    }


# Títulos reales de El Mercurio entre agosto y octubre de 2026.
NOTAS = [
    nota(
        "Turi tendr&#225; suspensi&#243;n del servicio de agua potable este martes",
        "ETAPA EP informó que el sector de Turi no tendrá agua de 09:00 a 17:00.",
        enlace="https://elmercurio.com.ec/cuenca/2026/10/13/agua-turi-corte-etapa-cuenca/",
    ),
    nota(
        "Azogues enfrenta racionamientos de agua de 14 horas debido a estiaje",
        "La EMAPAL de Azogues…",
    ),
    nota(
        "Cuenca pide al Gobierno agilizar USD 93 millones para proteger el agua",
        "ETAPA y el Municipio…",
    ),
    nota("15 provincias enfrentaron cortes de energía por mantenimiento", "Centro Sur y CNEL…"),
    nota(
        "Tres sectores de Paccha tendrán corte de agua este jueves",
        "La empresa ETAPA anunció trabajos en la red de Paccha, en Cuenca.",
        fecha="2026-09-03T10:00:00",
    ),
]


def test_es_aviso_de_corte():
    assert agua.es_aviso_de_corte("Tres sectores de Paccha tendrán corte de agua", "ETAPA informó")
    assert agua.es_aviso_de_corte(
        "Este 1 de septiembre habrá cortes de agua en seis sectores de Cuenca"
    )
    # Otro cantón, otro tema o sin relación con Cuenca.
    assert not agua.es_aviso_de_corte("Azogues enfrenta racionamientos de agua", "ETAPA")
    assert not agua.es_aviso_de_corte("Cuenca pide fondos para proteger el agua", "ETAPA")
    assert not agua.es_aviso_de_corte("Cortes de energía por mantenimiento", "Cuenca")
    assert not agua.es_aviso_de_corte("Corte de agua en un barrio", "Una nota sin ciudad")


def test_parsear_notas_solo_avisos_del_mas_nuevo_al_mas_viejo():
    avisos = agua.parsear_notas(json.dumps(NOTAS).encode())
    assert [a["publicado"] for a in avisos] == ["2026-10-13", "2026-09-03"]
    turi = avisos[0]
    assert turi["titulo"] == "Turi tendrá suspensión del servicio de agua potable este martes"
    assert turi["enlace"].endswith("/agua-turi-corte-etapa-cuenca/")
    assert turi["menciona_etapa"] is True
    assert "<" not in turi["resumen"]


def test_obtener_une_las_busquedas_sin_repetir():
    pedidas = []

    def descargar(url):
        pedidas.append(url)
        return json.dumps(NOTAS).encode()

    resultado = agua.obtener(descargar, hoy=date(2026, 11, 10))
    assert len(pedidas) == len(agua.BUSQUEDAS)
    assert all("after=2026-10-20" in url for url in pedidas)
    datos = resultado.archivos["agua/avisos.json"]
    assert len(datos["avisos"]) == 2  # las mismas notas en cada búsqueda cuentan una vez
    assert resultado.resumen == {"avisos": 2}


def test_pendientes_quita_los_confirmados_y_los_descartados():
    avisos = {"avisos": [{"enlace": "a"}, {"enlace": "b"}, {"enlace": "c"}]}
    confirmados = {
        "cortes": [{"fuente": {"url": "a"}}],
        "descartados": [{"enlace": "b", "motivo": "otro cantón"}],
    }
    assert agua.pendientes(avisos, confirmados) == [{"enlace": "c"}]
    assert agua.pendientes({}, {}) == []
