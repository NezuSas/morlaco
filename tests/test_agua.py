import json
from datetime import date

from morlaco.fuentes import agua, prensa


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
    # Las búsquedas del agua y, en la misma pasada, las de cierres de vías y cortes de luz.
    otras = len(prensa.BUSQUEDAS_CIERRES) + len(prensa.BUSQUEDAS_LUZ)
    assert len(pedidas) == len(agua.BUSQUEDAS) + otras
    assert all("after=2026-10-20" in url for url in pedidas)
    datos = resultado.archivos["agua/avisos.json"]
    assert len(datos["avisos"]) == 2  # las mismas notas en cada búsqueda cuentan una vez
    assert resultado.resumen["avisos"] == 2


def test_pendientes_quita_los_confirmados_y_los_descartados():
    avisos = {"avisos": [{"enlace": "a"}, {"enlace": "b"}, {"enlace": "c"}]}
    confirmados = {
        "cortes": [{"fuente": {"url": "a"}}],
        "descartados": [{"enlace": "b", "motivo": "otro cantón"}],
    }
    assert agua.pendientes(avisos, confirmados) == [{"enlace": "c"}]
    assert agua.pendientes({}, {}) == []


def test_cuando_lee_el_dia_y_el_horario_de_la_nota():
    nota = (
        "ETAPA EP suspenderá el servicio de agua potable este viernes 20 de noviembre de 2026, "
        "entre las 09:00 y las 18:00, por trabajos de interconexión de una nueva tubería."
    )
    assert agua.cuando(nota, "2026-11-19") == {
        "fecha": "2026-11-20",
        "desde": "09:00",
        "hasta": "18:00",
    }
    # Sin fecha escrita vale el "este martes" siguiente a la nota; el horario con "h".
    turi = "El sector de Turi no tendrá agua este martes, de 08h00 a 16h30."
    assert agua.cuando(turi, "2026-10-12") == {
        "fecha": "2026-10-13",
        "desde": "08:00",
        "hasta": "16:30",
    }
    # Una fecha lejana o pasada no es la del corte; sin nada que leer, todo queda en None.
    assert agua.cuando("La obra empezó el 3 de marzo de 2025.", "2026-11-19")["fecha"] is None
    assert agua.cuando("ETAPA anunció un corte.", "2026-11-19") == {
        "fecha": None,
        "desde": None,
        "hasta": None,
    }
    # A fin de año, "2 de enero" es del año siguiente.
    assert agua.cuando("Corte el 2 de enero.", "2026-12-30")["fecha"] == "2027-01-02"


def test_por_confirmar_solo_los_de_etapa_pendientes_y_vigentes():
    aviso = lambda enlace, **mas: {"enlace": enlace, "menciona_etapa": True, **mas}  # noqa: E731
    avisos = {
        "avisos": [
            aviso("manana", publicado="2026-11-19", fecha="2026-11-21"),
            aviso("hoy", publicado="2026-11-19", fecha="2026-11-20"),
            aviso("ayer", publicado="2026-11-18", fecha="2026-11-19"),
            aviso("sin-fecha-nuevo", publicado="2026-11-19", fecha=None),
            aviso("sin-fecha-viejo", publicado="2026-11-15", fecha=None),
            aviso("confirmado", publicado="2026-11-19", fecha="2026-11-21"),
            aviso("descartado", publicado="2026-11-19", fecha="2026-11-21"),
            {"enlace": "otro", "menciona_etapa": False, "publicado": "2026-11-19", "fecha": None},
        ]
    }
    confirmados = {
        "cortes": [{"fuente": {"url": "confirmado"}}],
        "descartados": [{"enlace": "descartado"}],
    }
    vigentes = agua.por_confirmar(avisos, confirmados, date(2026, 11, 20))
    assert [a["enlace"] for a in vigentes] == ["sin-fecha-nuevo", "hoy", "manana"]
