"""Farmacias de turno de Cuenca, de los PDF mensuales de ARCSA.

ARCSA (la agencia de control sanitario) publica cada mes un PDF por provincia
con una tabla por cantón: farmacia, ciudad, dirección, teléfono y la semana de
turno (de 06:00 a 06:00). La tabla tiene celdas combinadas (las fechas aparecen
solo en la primera farmacia de cada semana), textos partidos en varias filas y
errores de la propia fuente: años mal escritos y farmacias de otros cantones
listadas como de Cuenca. Aquí se reconstruye cada farmacia, se corrigen los
años evidentes y se descartan las direcciones que nombran otro cantón.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any
from urllib.parse import urljoin

import pymupdf

from morlaco import red
from morlaco.comun import MESES, Resultado, decodificar, limpiar, sin_tildes
from morlaco.fuentes.trazados import nombre_propio

if hasattr(pymupdf, "no_recommend_layout"):
    pymupdf.no_recommend_layout()

PAGINA = "https://www.controlsanitario.gob.ec/turnos-de-farmacias/"
CIUDAD = "CUENCA"
_PDF = re.compile(
    r"""[^"'\s<>]*Turno-de-farmacia-AZUAY-([A-Za-z]+)-(\d{4})[^"'\s<>]*\.pdf""", re.IGNORECASE
)
_FECHA = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$")
_TELEFONO = re.compile(r"^\d{6,10}$")
_OTRO_CANTON = re.compile(r"\bCANT[OÓ]N\s+(?!CUENCA\b)\w", re.IGNORECASE)
_CABECERA = {
    "FARMACIA",
    "CIUDAD",
    "DIRECCION",
    "DIRECCIÓN",
    "TELEFONO",
    "TELÉFONO",
    "FECHA",
    "INICIO",
    "FINAL",
    "06:00 AM",
}


def listar_pdfs(html: str, base: str = PAGINA) -> list[tuple[int, int, str]]:
    """(año, mes, url) de los PDF de Azuay que enlaza la página, del más antiguo al más nuevo."""
    vistos: dict[str, tuple[int, int, str]] = {}
    for coincidencia in _PDF.finditer(html):
        mes = MESES.get(sin_tildes(coincidencia.group(1).lower()))
        if mes:
            url = urljoin(base, coincidencia.group(0))
            vistos.setdefault(url, (int(coincidencia.group(2)), mes, url))
    return sorted(vistos.values())


def _fecha(texto: str) -> tuple[int, int, int] | None:
    coincidencia = _FECHA.match(texto)
    if not coincidencia:
        return None
    dia, mes, anio = (int(x) for x in coincidencia.groups())
    return anio, mes, dia


def corregir_semana(
    inicio: tuple[int, int, int], fin: tuple[int, int, int], anio_esperado: int
) -> tuple[date, date] | None:
    """Corrige años mal escritos ('14/11/2023' en un PDF de 2026) usando el año del PDF
    y el mes: una semana que pasa de diciembre a enero cambia de año."""
    (_, mes_inicio, dia_inicio), (_, mes_fin, dia_fin) = inicio, fin
    anio_inicio = anio_esperado - (1 if mes_inicio == 12 and mes_fin == 1 and anio_esperado else 0)
    anio_fin = anio_inicio + (1 if mes_fin < mes_inicio else 0)
    try:
        semana = date(anio_inicio, mes_inicio, dia_inicio), date(anio_fin, mes_fin, dia_fin)
    except ValueError:
        return None
    if not 0 < (semana[1] - semana[0]).days <= 10:
        return None
    return semana


def telefono_para_llamar(texto: str) -> str | None:
    """Número en formato internacional para un enlace tel:, o None si no sirve."""
    digitos = re.sub(r"\D", "", texto or "")
    if not digitos or set(digitos) == {"0"} or len(digitos) < 7:
        return None
    if len(digitos) == 7:  # fijo de Azuay sin prefijo
        return f"+5937{digitos}"
    if digitos.startswith("0"):
        return f"+593{digitos[1:]}"
    if len(digitos) == 9 and digitos.startswith("9"):  # celular sin el 0
        return f"+593{digitos}"
    if len(digitos) == 8 and digitos[0] in "2345678":  # fijo con el prefijo sin 0
        return f"+593{digitos}"
    return None


_ETIQUETAS = re.compile(
    r"\b(CALLE|BARRIO|CARRETERO|KIL[OÓ]METRO|MANZANA|CONJUNTO|BLOQUE|EDIFICIO|PISO|LOCAL|AV\.?ENIDA)\s*:\s*",
    re.IGNORECASE,
)
_SIN_DATO = re.compile(r"\b(S/N|S/I|SIN INTERSECCI[OÓ]N)\b|(?<!\w)SN(?!\w)", re.IGNORECASE)
_NUMERO_CASA = re.compile(r"^(.*?\D)\s+(\d+\s*-\s*\d+)\s+(.+)$")


def direccion_legible(texto: str) -> str:
    """'CALLE: VEGA MUÑOZ 6-72 BORRERO' -> 'Vega Muñoz 6-72 y Borrero'.

    Quita las etiquetas del sistema de ARCSA ("CALLE:", "BARRIO:") y los "S/N"; si hay
    un número de casa al estilo de Cuenca (o "S/N" en su lugar), lo que sigue es la
    calle que cruza."""
    limpio = limpiar(_ETIQUETAS.sub(" ", texto or ""))
    limpio = re.sub(r"\bAV\.(?=\w)", "AV. ", limpio, flags=re.IGNORECASE)
    # "MARISCAL SUCRE SN HERMANO MIGUEL": el S/N ocupa el lugar del número.
    limpio = re.sub(r"^(.*?\w)\s+(?:S/N|SN)\s+(?!S/N|SN|S/I|SIN\b)(\w.*)$", r"\1 y \2", limpio)
    limpio = limpiar(_SIN_DATO.sub(" ", limpio))
    coincide = _NUMERO_CASA.match(limpio)
    if coincide and " y " not in limpio:
        calle, numero, cruce = coincide.groups()
        limpio = f"{calle} {numero.replace(' ', '')} y {cruce}"
    return nombre_propio(limpio)


_CODIGO_SUCURSAL = re.compile(r"\b(?:[A-Za-z]{2,4}\d{2,}|CUE)(?=\s|$)|\bN:\s*", re.IGNORECASE)


def nombre_farmacia(texto: str) -> str:
    """'FARMACIAS MIA MCU01' -> 'Farmacias Mia'; quita códigos internos de sucursal y erratas."""
    limpio = _CODIGO_SUCURSAL.sub(" ", texto or "")
    limpio = re.sub(r"\bFARMCIA\b", "FARMACIA", limpio, flags=re.IGNORECASE)
    return nombre_propio(limpio)


def _celdas(fila: list[Any]) -> list[str]:
    return [limpiar(c) for c in fila]


def _es_cabecera(celdas: list[str]) -> bool:
    llenas = [c.upper() for c in celdas if c]
    return bool(llenas) and all(c in _CABECERA for c in llenas)


def reconstruir(
    filas: list[list[str]], anio: int, estado: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    """Convierte las filas de las tablas en farmacias.

    Una farmacia empieza en la fila que trae la ciudad; las filas siguientes sin
    ciudad completan su nombre o su dirección según la columna. Las fechas se
    heredan de la última farmacia que las tenía (celdas combinadas). `estado`
    conserva la ciudad y la semana entre páginas.
    """
    estado = {} if estado is None else estado
    farmacias: list[dict[str, Any]] = []
    actual: dict[str, Any] | None = None
    for fila in filas:
        celdas = _celdas(fila)
        if not any(celdas) or _es_cabecera(celdas):
            continue
        ciudades = [
            i
            for i, c in enumerate(celdas)
            if c and c.isupper() and i > 0 and _parece_ciudad(c, celdas, i)
        ]
        if ciudades:
            i_ciudad = ciudades[0]
            ciudad = celdas[i_ciudad]
            fechas = [_fecha(c) for c in celdas if _fecha(c)]
            i_tel = next(
                (i for i, c in enumerate(celdas) if i > i_ciudad and _TELEFONO.match(c)), None
            )
            fin_direccion = i_tel if i_tel is not None else len(celdas)
            if ciudad != estado.get("ciudad"):
                estado["semana"] = None
                estado["ciudad"] = ciudad
            if len(fechas) >= 2:
                estado["semana"] = corregir_semana(fechas[0], fechas[1], anio)
            actual = {
                "ciudad": ciudad,
                "nombre": [c for c in celdas[:i_ciudad] if c],
                "direccion": [
                    c for c in celdas[i_ciudad + 1 : fin_direccion] if c and not _fecha(c)
                ],
                "telefono": celdas[i_tel] if i_tel is not None else "",
                "semana": estado.get("semana"),
                "_columnas": (i_ciudad, fin_direccion),
            }
            farmacias.append(actual)
        elif actual:
            i_ciudad, fin_direccion = actual["_columnas"]
            for i, c in enumerate(celdas):
                if not c or _fecha(c):
                    continue
                if i < i_ciudad:
                    actual["nombre"].append(c)
                elif i < fin_direccion:
                    actual["direccion"].append(c)
    for f in farmacias:
        f.pop("_columnas")
        f["nombre"] = limpiar(" ".join(f["nombre"]))
        f["direccion"] = limpiar(" ".join(f["direccion"]))
    return farmacias


_CANTONES_AZUAY = {
    "CUENCA", "GIRON", "GIRÓN", "GUALACEO", "NABON", "NABÓN", "PAUTE", "PUCARA", "PUCARÁ",
    "SAN FERNANDO", "SANTA ISABEL", "SIGSIG", "OÑA", "ONA", "CHORDELEG", "EL PAN", "SEVILLA DE ORO",
    "GUACHAPALA", "CAMILO PONCE ENRIQUEZ", "CAMILO PONCE ENRÍQUEZ",
}  # fmt: skip


def _parece_ciudad(texto: str, celdas: list[str], indice: int) -> bool:
    return sin_tildes(texto).upper() in {sin_tildes(c) for c in _CANTONES_AZUAY}


def parsear_pdf(contenido: bytes, anio: int) -> list[dict[str, Any]]:
    """Todas las farmacias del PDF (de todos los cantones), con su semana de turno."""
    documento = pymupdf.open(stream=contenido, filetype="pdf")
    estado: dict[str, Any] = {}
    farmacias: list[dict[str, Any]] = []
    try:
        for pagina in documento:
            for tabla in pagina.find_tables().tables:
                farmacias += reconstruir(tabla.extract(), anio, estado)
    finally:
        documento.close()
    return farmacias


def agrupar_cuenca(farmacias: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """Las farmacias de Cuenca agrupadas por semana, y cuántas se descartaron."""
    semanas: dict[tuple[date, date], list[dict[str, Any]]] = {}
    descartadas = 0
    for f in farmacias:
        if sin_tildes(f["ciudad"]).upper() != CIUDAD:
            continue
        if not f["semana"] or not f["nombre"] or _OTRO_CANTON.search(f["direccion"]):
            descartadas += 1
            continue
        lista = semanas.setdefault(f["semana"], [])
        if any(
            x["nombre"] == nombre_farmacia(f["nombre"])
            and x["direccion"] == direccion_legible(f["direccion"])
            for x in lista
        ):
            continue
        lista.append(
            {
                "nombre": nombre_farmacia(f["nombre"]),
                "direccion": direccion_legible(f["direccion"]),
                "telefono": f["telefono"] if telefono_para_llamar(f["telefono"]) else None,
                "tel": telefono_para_llamar(f["telefono"]),
            }
        )
    turnos = [
        {"inicio": inicio.isoformat(), "fin": fin.isoformat(), "farmacias": lista}
        for (inicio, fin), lista in sorted(semanas.items())
    ]
    return turnos, descartadas


def obtener(descargar: red.Descargador = red.descargar) -> Resultado:
    pdfs = listar_pdfs(decodificar(descargar(PAGINA)))
    if not pdfs:
        raise ValueError("ARCSA no enlaza ningún PDF de turnos de Azuay")
    # El PDF del mes más reciente y, si ya está, el siguiente.
    usados = pdfs[-2:]
    farmacias: list[dict[str, Any]] = []
    for anio, _mes, url in usados:
        farmacias += parsear_pdf(descargar(url), anio)
    turnos, descartadas = agrupar_cuenca(farmacias)
    datos = {
        "metadata": {
            "titulo": "Farmacias de turno de Cuenca",
            "fuente": "ARCSA, Coordinación Zonal 6",
            "pagina": PAGINA,
            "pdfs": [url for *_, url in usados],
            "horario": "Cada turno va de las 06:00 del día de inicio a las 06:00 del día final.",
            "descartadas": descartadas,
            "nota": "Datos tal como los publica ARCSA, que pueden tener errores. Se descartan las "
            "farmacias cuya dirección nombra otro cantón y se corrigen los años mal escritos. "
            "Llama antes de ir.",
        },
        "turnos": turnos,
    }
    return Resultado(
        archivos={"farmacias/turnos.json": datos},
        resumen={
            "semanas": len(turnos),
            "farmacias": sum(len(t["farmacias"]) for t in turnos),
            "descartadas": descartadas,
        },
    )
