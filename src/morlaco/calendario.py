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


def _evento(zona: dict[str, Any], dias: list[int], con_reciclaje: bool) -> list[str]:
    numero = zona["zona"]
    primer_dia = LUNES_INICIAL + timedelta(days=min(dias) - 1)
    if con_reciclaje:
        titulo = "Recolección de basura: funda negra y funda celeste"
        que_sacar = "Saca la funda negra y la funda celeste (reciclables)"
        clave = "reciclaje"
    else:
        titulo = "Recolección de basura: funda negra"
        que_sacar = "Saca la funda negra"
        clave = "basura"
    desde, hasta = zona["desde"], zona["hasta"]
    descripcion = (
        f"Zona {numero} de EMAC: {_lista(zona['dias'])}, de {desde} a {hasta}.\n"
        f"{que_sacar} antes de las {desde}.\n"
        f"Datos de EMAC EP publicados por Morlaco ({PAGINA}). No es un servicio oficial."
    )
    aviso = f"{que_sacar}: el recolector pasa a las {desde}."
    return [
        "BEGIN:VEVENT",
        f"UID:morlaco-zona-{numero}-{clave}@nezusas.github.io",
        f"DTSTAMP:{SELLO}",
        f"DTSTART;TZID={ZONA_HORARIA}:{_fecha_hora(primer_dia, zona['desde'])}",
        f"DTEND;TZID={ZONA_HORARIA}:{_fecha_hora(primer_dia, zona['hasta'])}",
        f"RRULE:FREQ=WEEKLY;BYDAY={','.join(DIAS_ICAL[d] for d in sorted(dias))}",
        f"SUMMARY:{escapar(titulo)}",
        f"DESCRIPTION:{escapar(descripcion)}",
        f"URL:{PAGINA}",
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
    nombre = f"Basura en Cuenca (zona {zona['zona']})"
    # Sin comas: algunas apps muestran tal cual la coma escapada de estos campos X-WR.
    resumen = "Días y horas de recolección de EMAC EP para tu zona. Publicado por Morlaco."

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
        *_ZONA_HORARIA_ICAL,
    ]
    if normales:
        lineas += _evento(zona, normales, con_reciclaje=False)
    if reciclaje:
        lineas += _evento(zona, [reciclaje], con_reciclaje=True)
    lineas.append("END:VCALENDAR")

    plegadas = [trozo for linea in lineas for trozo in plegar(linea)]
    return "\r\n".join(plegadas) + "\r\n"
