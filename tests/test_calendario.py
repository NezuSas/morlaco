from morlaco import calendario

ZONA_4 = {
    "zona": 4,
    "nombre": "Zona 4",
    "dias": ["lunes", "miércoles", "viernes"],
    "dias_iso": [1, 3, 5],
    "desde": "20:00",
    "hasta": "24:00",
    "dia_reciclaje": "miércoles",
}


def desplegar(ics: str) -> list[str]:
    """Deshace el plegado de líneas de iCalendar."""
    return ics.replace("\r\n ", "").split("\r\n")


def eventos(ics: str) -> list[dict[str, str]]:
    lista, actual = [], None
    for linea in desplegar(ics):
        if linea == "BEGIN:VEVENT":
            actual = {}
        elif linea == "END:VEVENT":
            lista.append(actual)
            actual = None
        elif actual is not None and ":" in linea and "VALARM" not in linea:
            clave, valor = linea.split(":", 1)
            actual.setdefault(clave, valor)
    return lista


def test_estructura_y_saltos_de_linea_crlf():
    ics = calendario.calendario_zona(ZONA_4)
    assert ics.startswith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")
    assert ics.endswith("END:VCALENDAR\r\n")
    assert "\n" not in ics.replace("\r\n", "")
    assert "X-WR-CALNAME:♻️ Cuenca limpia (zona 4)" in desplegar(ics)
    assert "X-APPLE-CALENDAR-COLOR:#2D63A8" in ics
    assert "TZID:America/Guayaquil" in ics


def test_dos_eventos_funda_negra_y_dia_de_reciclaje():
    negra, celeste = eventos(calendario.calendario_zona(ZONA_4))
    assert negra["RRULE"] == "FREQ=WEEKLY;BYDAY=MO,FR"
    assert negra["SUMMARY"] == "🗑️ Recolección: funda negra"
    assert celeste["RRULE"] == "FREQ=WEEKLY;BYDAY=WE"
    assert celeste["SUMMARY"] == "♻️ Recolección: funda negra y celeste"
    assert negra["UID"] != celeste["UID"]


def test_horario_hasta_las_24_termina_a_medianoche_del_dia_siguiente():
    negra, celeste = eventos(calendario.calendario_zona(ZONA_4))
    # 5 de enero de 2026 es lunes; el miércoles es el 7.
    assert negra["DTSTART;TZID=America/Guayaquil"] == "20260105T200000"
    assert negra["DTEND;TZID=America/Guayaquil"] == "20260106T000000"
    assert celeste["DTSTART;TZID=America/Guayaquil"] == "20260107T200000"


def test_zona_de_martes_jueves_sabado_por_la_manana():
    zona = {
        **ZONA_4,
        "zona": 5,
        "dias": ["martes", "jueves", "sábado"],
        "dias_iso": [2, 4, 6],
        "desde": "08:00",
        "hasta": "12:00",
        "dia_reciclaje": "jueves",
    }
    negra, celeste = eventos(calendario.calendario_zona(zona))
    assert negra["RRULE"] == "FREQ=WEEKLY;BYDAY=TU,SA"
    assert negra["DTSTART;TZID=America/Guayaquil"] == "20260106T080000"
    assert negra["DTEND;TZID=America/Guayaquil"] == "20260106T120000"
    assert celeste["DTSTART;TZID=America/Guayaquil"] == "20260108T080000"


def test_sin_dia_de_reciclaje_hay_un_solo_evento():
    (unico,) = eventos(calendario.calendario_zona({**ZONA_4, "dia_reciclaje": None}))
    assert unico["RRULE"] == "FREQ=WEEKLY;BYDAY=MO,WE,FR"


def test_aviso_una_hora_antes():
    ics = calendario.calendario_zona(ZONA_4)
    assert ics.count("BEGIN:VALARM") == 2
    assert "TRIGGER:-PT60M" in ics


def test_no_depende_de_la_fecha_en_que_se_genera():
    assert calendario.calendario_zona(ZONA_4) == calendario.calendario_zona(dict(ZONA_4))
    assert "DTSTAMP:20260101T000000Z" in calendario.calendario_zona(ZONA_4)


def test_escapar():
    assert calendario.escapar("a, b; c\\d\ne") == "a\\, b\\; c\\\\d\\ne"


def test_plegar_lineas_largas_sin_romper_tildes():
    linea = "DESCRIPTION:" + "Recolección de basura en tu zona. " * 6
    trozos = calendario.plegar(linea)
    assert len(trozos) > 1
    assert all(len(t.encode("utf-8")) <= 75 for t in trozos)
    assert all(t.startswith(" ") for t in trozos[1:])
    assert "".join(t[1:] if i else t for i, t in enumerate(trozos)) == linea


def test_todas_las_lineas_del_archivo_caben_en_75_bytes():
    ics = calendario.calendario_zona(ZONA_4)
    assert all(len(linea.encode("utf-8")) <= 75 for linea in ics.split("\r\n"))


def test_descripcion_dice_que_sacar_y_cuando():
    negra, celeste = eventos(calendario.calendario_zona(ZONA_4))
    texto_negra = negra["DESCRIPTION"].replace("\\n", "\n").replace("\\,", ",")
    assert "entre las 20:00 y la medianoche" in texto_negra
    assert "Saca la funda negra antes de las 20:00" in texto_negra
    assert "La funda celeste (reciclables) va el miércoles" in texto_negra
    assert "Patrimonio Cultural de la Humanidad" in texto_negra
    assert "funda celeste (reciclables) antes de las 20:00" in celeste["DESCRIPTION"]
    assert negra["LOCATION"] == "Zona 4 de recolección\\, Cuenca\\, Ecuador"
