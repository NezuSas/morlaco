"""Páginas fijas que los buscadores pueden leer: una por zona de basura, las farmacias
de turno de la semana y los cortes de agua, en español e inglés, más el mapa del sitio.

La página principal arma todo en el navegador, así que un buscador solo ve la portada.
Estas páginas dicen lo mismo en HTML simple, con el texto que la gente busca ("horario
de basura zona 4 Cuenca", "farmacias de turno hoy Cuenca"), y llevan a Morlaco. Las
regenera el bot en cada actualización; no llevan la fecha del día para que solo cambien
cuando cambian los datos.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from html import escape
from pathlib import Path
from typing import Any

SITIO = "https://nezusas.github.io/morlaco/"
WEB = SITIO + "web/"
DIAS_EN = {
    "lunes": "Monday", "martes": "Tuesday", "miércoles": "Wednesday", "jueves": "Thursday",
    "viernes": "Friday", "sábado": "Saturday", "domingo": "Sunday",
}  # fmt: skip
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]  # fmt: skip
MESES_EN = ["January", "February", "March", "April", "May", "June", "July", "August",
            "September", "October", "November", "December"]  # fmt: skip
DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]

T = {
    "es": {
        "inicio": "Abrir Morlaco",
        "volver": "Busca tu calle en Morlaco",
        "otro": "English",
        "y": "y",
        "medianoche": "medianoche",
        "zona_titulo": "Horario de la basura en la zona {zona} de Cuenca",
        "zona_desc": "El recolector de EMAC pasa por la zona {zona} de Cuenca {dias}, de {desde} a {hasta}. La funda celeste va el {reciclaje}.",
        "zona_cuando": "El recolector pasa {dias}, de {desde} a {hasta}.",
        "zona_celeste": "La funda celeste, con reciclables, va solo el {reciclaje}.",
        "zona_fundas": "Funda negra: restos de comida y todo lo que no se recicla. Funda celeste: papel, cartón, plásticos, latas y tetrapak, limpios y secos.",
        "zona_antes": "Deja las fundas antes de que empiece el horario.",
        "zona_calendario": "Recibe un aviso antes de cada recolección: suscríbete al calendario de la zona {zona}.",
        "zona_saber": "¿No sabes en qué zona estás? Escribe tu esquina en Morlaco y te lo dice, junto con los cortes de luz y agua, las farmacias de turno y los buses de tu calle.",
        "zona_otras": "Otras zonas",
        "faq_p": "¿A qué hora pasa la basura en la zona {zona} de Cuenca?",
        "far_titulo": "Farmacias de turno en Cuenca",
        "far_desc": "Las farmacias de turno de Cuenca, abiertas las 24 horas, con dirección y teléfono. Según el calendario de ARCSA.",
        "far_turno": "Del {inicio} al {fin} a las 06:00",
        "far_sin": "ARCSA todavía no ha publicado el turno de esta semana.",
        "far_siguiente": "La semana siguiente",
        "far_aviso": "Datos de ARCSA, que pueden tener errores: llama antes de ir. En Morlaco las ves ordenadas por cercanía a tu calle.",
        "agua_titulo": "Cortes de agua en Cuenca",
        "agua_desc": "Cortes de agua anunciados por ETAPA EP en Cuenca, con sus sectores y horario.",
        "agua_sin": "No hay cortes de agua anunciados para los próximos días.",
        "agua_nota": "ETAPA EP anuncia sus cortes en redes sociales y en su línea 188; Morlaco los toma de la prensa que cita a ETAPA, así que puede haber cortes que no estén aquí.",
        "agua_corte": "{dia}, de {desde} a {hasta}",
        "fuente": "Fuente",
        "hub_titulo": "Servicios de Cuenca, hoy",
        "hub_desc": "Horario de la basura por zona, farmacias de turno y cortes de agua en Cuenca, Ecuador.",
        "hub_basura": "Horario de la basura por zona",
        "pie": "Morlaco no es un servicio oficial. Datos de EMAC EP, ARCSA, ETAPA EP y el portal Cuenca en Datos. Hecho en Cuenca por Nezu S.A.S.",
    },
    "en": {
        "inicio": "Open Morlaco",
        "volver": "Find your street in Morlaco",
        "otro": "Español",
        "y": "and",
        "medianoche": "midnight",
        "zona_titulo": "Garbage collection schedule in zone {zona}, Cuenca",
        "zona_desc": "EMAC's garbage truck comes by zone {zona} of Cuenca on {dias}, {desde} to {hasta}. The light-blue recycling bag goes out on {reciclaje}.",
        "zona_cuando": "The truck comes by on {dias}, {desde} to {hasta}.",
        "zona_celeste": "The light-blue bag, with recyclables, only goes out on {reciclaje}.",
        "zona_fundas": "Black bag: food scraps and anything that isn’t recycled. Light-blue bag: paper, cardboard, plastics, cans and Tetra Pak, clean and dry.",
        "zona_antes": "Put the bags out before the collection window starts.",
        "zona_calendario": "Get a reminder before every collection: subscribe to the zone {zona} calendar.",
        "zona_saber": "Not sure which zone you’re in? Type your corner in Morlaco and it will tell you, along with power and water cuts, on-duty pharmacies and buses on your street.",
        "zona_otras": "Other zones",
        "faq_p": "What time is garbage collected in zone {zona} of Cuenca?",
        "far_titulo": "On-duty pharmacies in Cuenca",
        "far_desc": "Cuenca's on-duty pharmacies, open 24 hours, with address and phone. From ARCSA's schedule.",
        "far_turno": "From {inicio} to {fin} at 06:00",
        "far_sin": "ARCSA hasn’t published this week’s schedule yet.",
        "far_siguiente": "The following week",
        "far_aviso": "ARCSA data, which may contain errors: call before you go. In Morlaco they’re sorted by distance from your street.",
        "agua_titulo": "Water cuts in Cuenca",
        "agua_desc": "Water cuts announced by ETAPA EP in Cuenca, with their sectors and hours.",
        "agua_sin": "No water cuts announced for the coming days.",
        "agua_nota": "ETAPA EP announces its cuts on social media and on its 188 line; Morlaco takes them from press articles that quote ETAPA, so there may be cuts that aren’t listed here.",
        "agua_corte": "{dia}, {desde} to {hasta}",
        "fuente": "Source",
        "hub_titulo": "Cuenca services today",
        "hub_desc": "Garbage schedule by zone, on-duty pharmacies and water cuts in Cuenca, Ecuador.",
        "hub_basura": "Garbage schedule by zone",
        "pie": "Morlaco is not an official service. Data from EMAC EP, ARCSA, ETAPA EP and the Cuenca en Datos portal. Made in Cuenca by Nezu S.A.S.",
    },
}


def _t(idioma: str, clave: str, **variables: Any) -> str:
    return T[idioma][clave].format(**variables)


def _listar(elementos: list[str], idioma: str) -> str:
    if len(elementos) <= 1:
        return "".join(elementos)
    return ", ".join(elementos[:-1]) + f" {_t(idioma, 'y')} " + elementos[-1]


def _hora(hhmm: str, idioma: str) -> str:
    return _t(idioma, "medianoche") if hhmm in ("24:00", "00:00") else hhmm


def _dia(dia: str, idioma: str) -> str:
    return DIAS_EN.get(dia, dia) if idioma == "en" else dia


def _dias(dias: list[str], idioma: str) -> str:
    """ "los lunes, miércoles y viernes" o "Mondays, Wednesdays and Fridays"."""
    if idioma == "en":
        return _listar([DIAS_EN.get(d, d) + "s" for d in dias], idioma)
    plurales = [d + "s" if d in ("sábado", "domingo") else d for d in dias]
    return "los " + _listar(plurales, idioma)


def _fecha(iso: str, idioma: str) -> str:
    d = date.fromisoformat(iso)
    if idioma == "en":
        return f"{d.strftime('%A')} {MESES_EN[d.month - 1]} {d.day}"
    return f"{DIAS_SEMANA[d.weekday()]} {d.day} de {MESES[d.month - 1]}"


def _ruta(idioma: str, nombre: str) -> str:
    """Ruta del archivo dentro de web/ ("info/x.html" o "info/en/x.html")."""
    return f"info/{nombre}" if idioma == "es" else f"info/en/{nombre}"


def _documento(
    idioma: str,
    nombre: str,
    titulo: str,
    descripcion: str,
    cuerpo: str,
    *,
    imagen: str = "compartir.png",
    datos_estructurados: dict[str, Any] | None = None,
) -> str:
    """Una página completa con el estilo de Morlaco, su versión en el otro idioma y sus metadatos."""
    raiz = "../" if idioma == "es" else "../../"
    otro = "en" if idioma == "es" else "es"
    url = WEB + _ruta(idioma, nombre)
    url_otro = WEB + _ruta(otro, nombre)
    href_otro = f"en/{nombre}" if idioma == "es" else f"../{nombre}"
    ld = (
        f'\n    <script type="application/ld+json">{json.dumps(datos_estructurados, ensure_ascii=False)}</script>'
        if datos_estructurados
        else ""
    )
    return f"""<!doctype html>
<html lang="{"es-EC" if idioma == "es" else "en"}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{escape(titulo)} | Morlaco</title>
    <meta name="description" content="{escape(descripcion)}" />
    <link rel="canonical" href="{url}" />
    <link rel="alternate" hreflang="{idioma}" href="{url}" />
    <link rel="alternate" hreflang="{otro}" href="{url_otro}" />
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" content="#1d4489" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Morlaco" />
    <meta property="og:locale" content="{"es_EC" if idioma == "es" else "en_US"}" />
    <meta property="og:title" content="{escape(titulo)}" />
    <meta property="og:description" content="{escape(descripcion)}" />
    <meta property="og:url" content="{url}" />
    <meta property="og:image" content="{WEB}{imagen}" />
    <meta property="og:image:width" content="1280" />
    <meta property="og:image:height" content="640" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="{raiz}icono.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="{raiz}estilos.css" />{ld}
  </head>
  <body class="pagina-datos">
    <header class="barra">
      <a class="marca" href="{raiz}" aria-label="Morlaco">
        <img src="{raiz}icono.svg" alt="" width="30" height="30" />
        <span>Morlaco</span>
      </a>
      <div class="barra-acciones">
        <a class="enlace-datos" href="{href_otro}" hreflang="{otro}" lang="{otro}">{_t(idioma, "otro")}</a>
      </div>
    </header>
    <div class="muro muro-datos">
      <h1>{escape(titulo)}</h1>
      <p class="entrada">{escape(descripcion)}</p>
    </div>
    <main class="datos-contenido">
{cuerpo}
      <p class="info-accion"><a class="boton-claro" href="{raiz}">{_t(idioma, "volver")}</a></p>
      <p class="detalle autoria">{_t(idioma, "pie")}</p>
    </main>
  </body>
</html>
"""


def _seccion(*parrafos: str) -> str:
    return "      <section>\n" + "\n".join(f"        {p}" for p in parrafos) + "\n      </section>"


def pagina_zona(zona: dict[str, Any], todas: list[int], idioma: str) -> tuple[str, str]:
    p = zona["properties"]
    numero = p["zona"]
    dias = _dias(p["dias"], idioma)
    reciclaje = _dia(p["dia_reciclaje"], idioma)
    variables = {
        "zona": numero,
        "dias": dias,
        "desde": p["desde"],
        "hasta": _hora(p["hasta"], idioma),
        "reciclaje": reciclaje,
    }
    titulo = _t(idioma, "zona_titulo", **variables)
    descripcion = _t(idioma, "zona_desc", **variables)
    raiz = "../" if idioma == "es" else "../../"
    calendario = f"{raiz}../datos/recoleccion/calendarios/zona-{numero}.ics"
    otras = " · ".join(
        f'<a href="basura-zona-{n}.html">{"Zona" if idioma == "es" else "Zone"} {n}</a>'
        for n in todas
        if n != numero
    )
    cuerpo = "\n".join(
        [
            _seccion(
                f'<p class="luz-resumen">{escape(_t(idioma, "zona_cuando", **variables))}</p>',
                f"<p>{escape(_t(idioma, 'zona_celeste', **variables))}</p>",
                f"<p>{escape(_t(idioma, 'zona_fundas'))}</p>",
                f'<p class="detalle">{escape(_t(idioma, "zona_antes"))}</p>',
                f'<p><a href="{calendario}">{escape(_t(idioma, "zona_calendario", zona=numero))}</a></p>',
            ),
            _seccion(f"<p>{escape(_t(idioma, 'zona_saber'))}</p>"),
            _seccion(f"<h2>{_t(idioma, 'zona_otras')}</h2>", f"<p>{otras}</p>"),
        ]
    )
    faq = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": _t(idioma, "faq_p", zona=numero),
                "acceptedAnswer": {"@type": "Answer", "text": descripcion},
            }
        ],
    }
    nombre = f"basura-zona-{numero}.html"
    return nombre, _documento(
        idioma,
        nombre,
        titulo,
        descripcion,
        cuerpo,
        # Imágenes con el horario de cada zona, hechas a mano: si EMAC cambia un horario, hay que rehacerlas.
        imagen=f"info/img/zona-{numero}{'' if idioma == 'es' else '-en'}.png",
        datos_estructurados=faq,
    )


def _lista_farmacias(farmacias: list[dict[str, Any]]) -> str:
    filas = []
    for f in farmacias:
        tel = "".join(c for c in f.get("tel") or f.get("telefono") or "" if c.isdigit() or c == "+")
        telefono = f' <a class="llamar" href="tel:{tel}">{escape(f["telefono"])}</a>' if tel else ""
        filas.append(
            f'<li><span class="farmacia-texto"><strong>{escape(f["nombre"])}</strong>'
            f"<span>{escape(f.get('direccion') or '')}</span></span>{telefono}</li>"
        )
    return (
        '<ul class="farmacias-lista">\n          ' + "\n          ".join(filas) + "\n        </ul>"
    )


def pagina_farmacias(turnos: dict[str, Any], hoy: date, idioma: str) -> tuple[str, str]:
    lista = turnos.get("turnos", [])
    actual = next((t for t in lista if t["inicio"] <= hoy.isoformat() < t["fin"]), None)
    siguiente = next((t for t in lista if actual and t["inicio"] == actual["fin"]), None)
    partes = []
    if actual:
        partes.append(
            _seccion(
                f"<h2>{escape(_t(idioma, 'far_turno', inicio=_fecha(actual['inicio'], idioma), fin=_fecha(actual['fin'], idioma)))}</h2>",
                _lista_farmacias(actual["farmacias"]),
            )
        )
    else:
        partes.append(_seccion(f'<p class="aviso">{escape(_t(idioma, "far_sin"))}</p>'))
    if siguiente:
        partes.append(
            _seccion(
                f"<h2>{_t(idioma, 'far_siguiente')}: {escape(_t(idioma, 'far_turno', inicio=_fecha(siguiente['inicio'], idioma), fin=_fecha(siguiente['fin'], idioma)))}</h2>",
                _lista_farmacias(siguiente["farmacias"]),
            )
        )
    pdf = (
        turnos.get("metadata", {}).get("pdfs") or [turnos.get("metadata", {}).get("pagina", "")]
    )[-1]
    partes.append(
        _seccion(
            f'<p class="detalle">{escape(_t(idioma, "far_aviso"))} {_t(idioma, "fuente")}: <a href="{escape(pdf)}">ARCSA</a>.</p>'
        )
    )
    nombre = "farmacias-de-turno.html"
    return nombre, _documento(
        idioma, nombre, _t(idioma, "far_titulo"), _t(idioma, "far_desc"), "\n".join(partes)
    )


def pagina_agua(agua: dict[str, Any], hoy: date, idioma: str) -> tuple[str, str]:
    cortes = sorted(
        (c for c in agua.get("cortes", []) if c.get("fecha", "") >= hoy.isoformat()),
        key=lambda c: (c["fecha"], c.get("desde", "")),
    )
    if cortes:
        items = []
        for c in cortes:
            texto = c.get(idioma) or c.get("es", {})
            cuando = _t(
                idioma,
                "agua_corte",
                dia=_fecha(c["fecha"], idioma),
                desde=c["desde"],
                hasta=_hora(c["hasta"], idioma),
            )
            items.append(
                f'<li><span class="horario">{escape(cuando)}</span>{escape(texto.get("sectores", ""))}'
                f'<span class="frecuencia">{_t(idioma, "fuente")}: <a href="{escape(c["fuente"]["url"])}">{escape(c["fuente"]["nombre"])}</a></span></li>'
            )
        cuerpo = _seccion(
            '<ul class="cortes">\n          ' + "\n          ".join(items) + "\n        </ul>"
        )
    else:
        cuerpo = _seccion(f'<p class="luz-resumen">{escape(_t(idioma, "agua_sin"))}</p>')
    cuerpo += "\n" + _seccion(f'<p class="detalle">{escape(_t(idioma, "agua_nota"))}</p>')
    nombre = "cortes-de-agua.html"
    return nombre, _documento(
        idioma, nombre, _t(idioma, "agua_titulo"), _t(idioma, "agua_desc"), cuerpo
    )


def pagina_indice(zonas: list[int], idioma: str) -> tuple[str, str]:
    enlaces_zonas = " · ".join(
        f'<a href="basura-zona-{n}.html">{"Zona" if idioma == "es" else "Zone"} {n}</a>'
        for n in zonas
    )
    cuerpo = "\n".join(
        [
            _seccion(f"<h2>{_t(idioma, 'hub_basura')}</h2>", f"<p>{enlaces_zonas}</p>"),
            _seccion(f'<h2><a href="farmacias-de-turno.html">{_t(idioma, "far_titulo")}</a></h2>'),
            _seccion(f'<h2><a href="cortes-de-agua.html">{_t(idioma, "agua_titulo")}</a></h2>'),
        ]
    )
    return "index.html", _documento(
        idioma, "index.html", _t(idioma, "hub_titulo"), _t(idioma, "hub_desc"), cuerpo
    )


def generar(datos: Path, hoy: date) -> dict[str, str]:
    """Las páginas, como {ruta dentro de web/: html}, y el mapa del sitio en "../sitemap.xml"."""
    leer = lambda ruta: json.loads((datos / ruta).read_text(encoding="utf-8"))  # noqa: E731
    zonas = sorted(
        leer("recoleccion/zonas.geojson")["features"], key=lambda z: z["properties"]["zona"]
    )
    numeros = [z["properties"]["zona"] for z in zonas]
    turnos = leer("farmacias/turnos.json")
    agua = leer("manual/agua.json")
    paginas: dict[str, str] = {}
    for idioma in ("es", "en"):
        generadas = [pagina_indice(numeros, idioma)]
        generadas += [pagina_zona(z, numeros, idioma) for z in zonas]
        generadas += [pagina_farmacias(turnos, hoy, idioma), pagina_agua(agua, hoy, idioma)]
        for nombre, html in generadas:
            paginas[_ruta(idioma, nombre)] = html
    urls = [WEB, WEB + "datos.html"] + [
        WEB + ruta.removesuffix("index.html") for ruta in sorted(paginas)
    ]
    paginas["../sitemap.xml"] = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{u}</loc></url>\n" for u in urls)
        + "</urlset>\n"
    )
    return paginas


def escribir(datos: Path, web: Path, hoy: date | None = None) -> None:
    """Escribe las páginas en web/info/ y el mapa del sitio junto a web/."""
    hoy = hoy or (datetime.now(timezone.utc) - timedelta(hours=5)).date()
    for ruta, html in generar(datos, hoy).items():
        destino = (web / ruta).resolve()
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(html, encoding="utf-8", newline="\n")
