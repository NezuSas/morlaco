import json
from datetime import date

from morlaco.fuentes import agua, feriados


def nota(titulo, fecha="2026-09-22T10:00:00", enlace=None):
    return {
        "date": fecha,
        "link": enlace or f"https://elmercurio.com.ec/{abs(hash(titulo))}/",
        "title": {"rendered": titulo},
        "excerpt": {"rendered": "<p>Resumen</p>"},
    }


# Títulos reales de El Mercurio entre septiembre y noviembre de 2026.
SI = [
    "Presidente Noboa decreta feriado nacional para el viernes 20 de noviembre",
    "Ecuador tendr&#225; tres d&#237;as de descanso obligatorio en noviembre por feriados y "
    "suspensi&#243;n de la jornada laboral",
    "Feriado por la Independencia de Guayaquil: Ecuador tendr&#225; tres d&#237;as de descanso",
    "Noviembre tendr&#225; tres feriados &#191;por qu&#233;?",
]
NO = [
    "IVA baja al 8 % para servicios tur&#237;sticos durante el feriado de noviembre en Ecuador",
    "Cuenca recibe miles de visitantes durante el feriado de noviembre 2026",
    "&#191;C&#243;mo funcionar&#225;n los servicios en Cuenca durante el feriado?",
    "Diabetes: acept&#233; que me amputaran la pierna",
]


def test_reconoce_los_avisos_de_descanso_por_el_titulo():
    for titulo in SI:
        assert feriados.es_aviso_de_descanso(agua.texto(titulo)), titulo
    for titulo in NO:
        assert not feriados.es_aviso_de_descanso(agua.texto(titulo)), titulo


def test_parsear_notas_se_queda_con_los_avisos():
    contenido = json.dumps([nota(t) for t in SI + NO]).encode()
    avisos = feriados.parsear_notas(contenido)
    assert len(avisos) == len(SI)
    assert avisos[0]["titulo"].startswith("Presidente Noboa decreta")
    assert avisos[0]["publicado"] == "2026-09-22"


def test_pendientes_sin_revisar_ni_descartar():
    avisos = {"avisos": [
        {"publicado": "2026-11-18", "enlace": "https://a/nuevo"},
        {"publicado": "2026-11-18", "enlace": "https://a/fuente"},
        {"publicado": "2026-11-19", "enlace": "https://a/descartado"},
        {"publicado": "2026-11-10", "enlace": "https://a/viejo"},
    ]}  # fmt: skip
    lista = {
        "metadata": {"revisado": "2026-11-17"},
        "dias": [{"fuente": {"url": "https://a/fuente"}}],
        "descartados": [{"enlace": "https://a/descartado"}],
    }
    assert [a["enlace"] for a in feriados.pendientes(avisos, lista)] == ["https://a/nuevo"]


def test_obtener_junta_las_busquedas_sin_repetir():
    pedidas = []

    def falso(url):
        pedidas.append(url)
        return json.dumps([nota(SI[0], enlace="https://elmercurio.com.ec/decreto/")]).encode()

    resultado = feriados.obtener(falso, hoy=date(2026, 11, 19))
    assert len(pedidas) == len(feriados.BUSQUEDAS)
    assert "after=2026-10-20" in pedidas[0]
    datos = resultado.archivos["feriados/avisos.json"]
    assert [a["enlace"] for a in datos["avisos"]] == ["https://elmercurio.com.ec/decreto/"]
    assert resultado.resumen == {"avisos": 1}
