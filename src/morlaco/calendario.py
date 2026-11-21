"""Calendarios de recolección en formato iCalendar (RFC 5545), uno por zona.

Cada zona tiene un archivo .ics al que la gente se puede suscribir desde Google
Calendar, el calendario del iPhone o Outlook. Como la suscripción se vuelve a
leer cada cierto tiempo, si EMAC cambia los horarios, el calendario de cada
persona se actualiza solo.

Cada zona tiene dos eventos semanales: los días de funda negra y el día en que
además va la funda celeste (reciclables). El contenido no depende de la fecha
en que se genera, así que el archivo solo cambia cuando cambian los horarios.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from morlaco.comun import NOMBRE_DIA

PAGINA = "https://nezusas.github.io/morlaco/web/"
ZONA_HORARIA = "America/Guayaquil"
# Lunes de referencia para la primera aparición de cada evento.
LUNES_INICIAL = date(2026, 1, 5)
# Fija para que el archivo no cambie en cada ejecución.
SELLO = "20260101T000000Z"
DIAS_ICAL = {1: "MO", 2: "TU", 3: "WE", 4: "TH", 5: "FR", 6: "SA", 7: "SU"}
AVISO_MINUTOS = 60

_ZONA_HORARIA_ICAL = [
    "BEGIN:VTIMEZONE",
    f"TZID:{ZONA_HORARIA}",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0500",
    "TZNAME:-05",
    "END:STANDARD",
    "END:VTIMEZONE",
]


def nombre_archivo(zona: int) -> str:
    return f"recoleccion/calendarios/zona-{zona}.ics"


def escapar(texto: str) -> str:
    """Escapa un valor de texto de iCalendar."""
    return texto.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def plegar(linea: str, maximo: int = 75) -> list[str]:
    """Parte una línea en trozos de como mucho 75 bytes, sin cortar caracteres UTF-8."""
    trozos: list[str] = []
    actual = ""
    limite = maximo
    for caracter in linea:
        if len((actual + caracter).encode("utf-8")) > limite:
            trozos.append(actual)
            actual = caracter
            limite = maximo - 1  # las continuaciones empiezan con un espacio
        else:
            actual += caracter
    trozos.append(actual)
    return [trozos[0], *(" " + t for t in trozos[1:])]


def _fecha_hora(dia: date, hhmm: str) -> str:
    horas, minutos = (int(x) for x in hhmm.split(":"))
    # "24:00" es la medianoche del día siguiente.
    dia += timedelta(days=horas // 24)
    return f"{dia:%Y%m%d}T{horas % 24:02d}{minutos:02d}00"


def _lista(nombres: list[str]) -> str:
    return nombres[0] if len(nombres) == 1 else f"{', '.join(nombres[:-1])} y {nombres[-1]}"


def _evento(zona: dict[str, Any], dias: list[int], reciclaje: int | None) -> list[str]:
    """Un evento semanal. Con `reciclaje` igual a sus días, es el de la funda celeste."""
    numero = zona["zona"]
    con_reciclaje = reciclaje in dias
    primer_dia = LUNES_INICIAL + timedelta(days=min(dias) - 1)
    desde, hasta = zona["desde"], zona["hasta"]
    hasta_texto = "la medianoche" if hasta == "24:00" else f"las {hasta}"

    if con_reciclaje:
        clave = "reciclaje"
        titulo = "♻️ Recolección: funda negra y celeste"
        que_sacar = "Saca la funda negra y la funda celeste (reciclables)"
        lineas_fundas = [
            f"🖤💙 Hoy saca la funda negra y la funda celeste (reciclables) antes de las {desde}."
        ]
        color = "skyblue"
    else:
        clave = "basura"
        titulo = "🗑️ Recolección: funda negra"
        que_sacar = "Saca la funda negra"
        lineas_fundas = [f"🖤 Saca la funda negra antes de las {desde}."]
        if reciclaje:
            lineas_fundas.append(
                f"💙 La funda celeste (reciclables) va el {NOMBRE_DIA[reciclaje]}."
            )
        color = "royalblue"

    descripcion = "\n".join(
        [
            f"🕐 El recolector pasa entre las {desde} y {hasta_texto}.",
            *lineas_fundas,
            f"📍 Zona {numero} de EMAC: {_lista(zona['dias'])}.",
            "",
            "🏛️ Cuenca es Patrimonio Cultural de la Humanidad: ayudemos a mantenerla limpia.",
            f"Consulta tu calle en Morlaco: {PAGINA}",
            "Datos de EMAC EP. Morlaco no es un servicio oficial.",
        ]
    )
    aviso = f"{que_sacar}: el recolector pasa desde las {desde}."
    return [
        "BEGIN:VEVENT",
        f"UID:morlaco-zona-{numero}-{clave}@nezusas.github.io",
        f"DTSTAMP:{SELLO}",
        f"DTSTART;TZID={ZONA_HORARIA}:{_fecha_hora(primer_dia, desde)}",
        f"DTEND;TZID={ZONA_HORARIA}:{_fecha_hora(primer_dia, hasta)}",
        f"RRULE:FREQ=WEEKLY;BYDAY={','.join(DIAS_ICAL[d] for d in sorted(dias))}",
        f"SUMMARY:{escapar(titulo)}",
        f"DESCRIPTION:{escapar(descripcion)}",
        f"LOCATION:{escapar(f'Zona {numero} de recolección, Cuenca, Ecuador')}",
        f"URL:{PAGINA}",
        f"COLOR:{color}",
        "TRANSP:TRANSPARENT",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        f"TRIGGER:-PT{AVISO_MINUTOS}M",
        f"DESCRIPTION:{escapar(aviso)}",
        "END:VALARM",
        "END:VEVENT",
    ]


def calendario_zona(zona: dict[str, Any]) -> str:
    """El archivo .ics de una zona, a partir de sus propiedades en zonas.geojson."""
    dias = list(zona["dias_iso"])
    reciclaje = (
        dias[zona["dias"].index(zona["dia_reciclaje"])] if zona.get("dia_reciclaje") else None
    )
    normales = [d for d in dias if d != reciclaje]
    nombre = f"♻️ Cuenca limpia (zona {zona['zona']})"
    # Sin comas: algunas apps muestran tal cual la coma escapada de estos campos X-WR.
    resumen = (
        "Días y horas en que pasa el recolector de EMAC EP por tu zona de Cuenca. "
        "Publicado por Morlaco."
    )

    lineas = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Morlaco//Recoleccion de basura de Cuenca//ES",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escapar(nombre)}",
        f"X-WR-CALDESC:{escapar(resumen)}",
        f"X-WR-TIMEZONE:{ZONA_HORARIA}",
        "REFRESH-INTERVAL;VALUE=DURATION:P1D",
        "X-PUBLISHED-TTL:P1D",
        # Color del calendario: lo respetan Apple y las apps que siguen el RFC 7986.
        # Google Calendar lo ignora y deja que cada persona elija el suyo.
        "COLOR:royalblue",
        "X-APPLE-CALENDAR-COLOR:#2D63A8",
        *_ZONA_HORARIA_ICAL,
    ]
    if normales:
        lineas += _evento(zona, normales, reciclaje)
    if reciclaje:
        lineas += _evento(zona, [reciclaje], reciclaje)
    lineas.append("END:VCALENDAR")

    plegadas = [trozo for linea in lineas for trozo in plegar(linea)]
    return "\r\n".join(plegadas) + "\r\n"


# ---------- Cortes de agua ----------

ARCHIVO_AGUA = "agua/cortes.ics"
# El aviso llega la tarde anterior: da tiempo de llenar un balde.
AVISO_AGUA_HORAS = 12


def _evento_agua(corte: dict[str, Any], uid: str) -> list[str]:
    fecha = date.fromisoformat(corte["fecha"])
    texto = corte.get("es", {})
    desde, hasta = corte.get("desde"), corte.get("hasta")
    fuente = corte.get("fuente", {})
    if desde and hasta:
        cuando = [
            f"DTSTART;TZID={ZONA_HORARIA}:{_fecha_hora(fecha, desde)}",
            f"DTEND;TZID={ZONA_HORARIA}:{_fecha_hora(fecha, hasta)}",
        ]
        horario = f"🕐 De {desde} a {hasta}."
    else:  # sin horario publicado: todo el día
        cuando = [
            f"DTSTART;VALUE=DATE:{fecha:%Y%m%d}",
            f"DTEND;VALUE=DATE:{fecha + timedelta(days=1):%Y%m%d}",
        ]
        horario = "🕐 Sin horario publicado."
    del_corte = [
        horario,
        f"📍 Sectores: {texto['sectores']}." if texto.get("sectores") else "",
        f"🔧 {texto['motivo']}." if texto.get("motivo") else "",
    ]
    de_donde = [
        f"Fuente: {fuente['nombre']}. {fuente.get('url', '')}".strip() if fuente else "",
        "ETAPA EP anuncia sus cortes en redes sociales y en su línea 188; Morlaco los toma "
        "de la prensa, así que puede haber cortes que no estén aquí.",
        f"Consulta tu calle en Morlaco: {PAGINA}",
    ]
    descripcion = "\n".join([*filter(None, del_corte), "", *filter(None, de_donde)])
    return [
        "BEGIN:VEVENT",
        f"UID:{uid}@nezusas.github.io",
        f"DTSTAMP:{SELLO}",
        *cuando,
        "SUMMARY:💧 Corte de agua en Cuenca",
        f"DESCRIPTION:{escapar(descripcion)}",
        f"LOCATION:{escapar(texto.get('sectores') or 'Cuenca, Ecuador')}",
        f"URL:{PAGINA}?ver=cortes",
        "TRANSP:TRANSPARENT",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        f"TRIGGER:-PT{AVISO_AGUA_HORAS}H",
        f"DESCRIPTION:{escapar('Corte de agua programado en Cuenca: revisa si es en tu sector.')}",
        "END:VALARM",
        "END:VEVENT",
    ]


def calendario_agua(agua: dict[str, Any]) -> str:
    """El .ics de los cortes de agua confirmados (datos/manual/agua.json), uno por evento.

    Como el de la basura, es una suscripción: cuando se anota un corte nuevo, aparece solo en
    el calendario de cada persona, con un aviso la tarde anterior. Sin cortes es un
    calendario vacío, que sigue siendo válido."""
    lineas = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Morlaco//Cortes de agua de Cuenca//ES",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escapar('💧 Cortes de agua (Cuenca)')}",
        "X-WR-CALDESC:"
        + escapar(
            "Cortes de agua programados en Cuenca que la prensa publica citando a ETAPA EP. "
            "Publicado por Morlaco."
        ),
        f"X-WR-TIMEZONE:{ZONA_HORARIA}",
        "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
        "X-PUBLISHED-TTL:PT6H",
        "COLOR:steelblue",
        "X-APPLE-CALENDAR-COLOR:#2F7FB8",
        *_ZONA_HORARIA_ICAL,
    ]
    vistos: dict[str, int] = {}
    for corte in sorted(agua.get("cortes", []), key=lambda c: (c["fecha"], c.get("desde") or "")):
        base = f"morlaco-agua-{corte['fecha']}-{(corte.get('desde') or 'dia').replace(':', '')}"
        vistos[base] = vistos.get(base, 0) + 1
        uid = base if vistos[base] == 1 else f"{base}-{vistos[base]}"
        lineas += _evento_agua(corte, uid)
    lineas.append("END:VCALENDAR")
    plegadas = [trozo for linea in lineas for trozo in plegar(linea)]
    return "\r\n".join(plegadas) + "\r\n"
