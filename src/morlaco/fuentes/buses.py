"""Rutas, recorridos y paradas de buses urbanos, del portal Cuenca en Datos.

El portal del GAD Municipal de Cuenca es un CKAN con API. Se toma el CSV más
reciente de cada conjunto de datos:

- Rutas de transporte público: línea, compañía, origen, destino, hora de inicio,
  hora de fin e intervalo entre buses, para lunes a viernes, sábados y domingos.
- Recorrido de las rutas: los puntos por los que pasa cada línea, en orden.
- Paradas de transporte público: ubicación y coordenadas. En el CSV publicado las
  coordenadas vienen con puntos de miles ("-2.895.956" en vez de "-2.895956");
  aquí se corrigen y se descartan las que caen fuera de Cuenca.
"""

from __future__ import annotations

import csv
import io
import json
import re
from typing import Any
from urllib.parse import urlencode

from morlaco import red
from morlaco.comun import Resultado, decodificar, hora, limpiar

CKAN = "https://cuencaendatos.cuenca.gob.ec"
DATASETS = {
    "rutas": "f15c8808-0d12-4f97-bfd4-3b2f85ea84d1",
    "recorridos": "4c727738-890e-445c-9b20-32df271db766",
    "paradas": "d98292ca-7c70-422a-ac6f-1b43194ff5ba",
}
DIAS_SERVICIO = {
    "lunes_viernes": "LUNES_VIERNES",
    "sabados": "SABADOS",
    "domingos": "DOMINGOS",
}
# Rectángulo amplio alrededor del cantón Cuenca, para descartar coordenadas erróneas.
LATITUD = (-3.25, -2.6)
LONGITUD = (-79.45, -78.75)


def _filas(texto: str) -> list[dict[str, str]]:
    lector = csv.DictReader(io.StringIO(texto))
    return [{limpiar(k).upper(): limpiar(v) for k, v in fila.items() if k} for fila in lector]


def _orden_linea(linea: str) -> tuple[int, str]:
    numero = re.match(r"\d+", linea)
    return (int(numero.group()) if numero else 10**6, linea)


def intervalo_minutos(texto: str) -> int | None:
    """'0:09' -> 9, '1:00' -> 60, '' -> None."""
    texto = texto.strip()
    if not texto:
        return None
    try:
        if ":" not in texto:
            return int(texto)
        horas, minutos = texto.split(":")[:2]
        return int(horas) * 60 + int(minutos)
    except ValueError:
        return None


def parsear_rutas(texto: str) -> list[dict[str, Any]]:
    rutas = []
    for fila in _filas(texto):
        if not fila.get("LINEA"):
            continue
        horarios: dict[str, Any] = {}
        for clave, prefijo in DIAS_SERVICIO.items():
            inicio = hora(fila.get(f"{prefijo}_INICIO"))
            fin = hora(fila.get(f"{prefijo}_FIN"))
            intervalo = intervalo_minutos(fila.get(f"{prefijo}_INTERVALO", ""))
            sin_servicio = inicio is None and fin is None and intervalo is None
            horarios[clave] = (
                None if sin_servicio else {"inicio": inicio, "fin": fin, "intervalo_min": intervalo}
            )
        rutas.append(
            {
                "linea": fila["LINEA"],
                "compania": fila.get("COMPANIA", ""),
                "sentido": fila.get("SENTIDO", "").lower(),
                "origen": fila.get("ORIGEN", ""),
                "destino": fila.get("DESTINO", ""),
                "horarios": horarios,
            }
        )
    rutas.sort(key=lambda r: (_orden_linea(r["linea"]), r["sentido"]))
    return rutas


def parsear_recorridos(texto: str) -> list[dict[str, Any]]:
    """Agrupa los puntos de recorrido por línea y sentido, conservando el orden."""
    lineas: dict[str, dict[str, list[str]]] = {}
    for fila in _filas(texto):
        linea, punto = fila.get("LINEA"), fila.get("PUNTO_RECORRIDO")
        if not linea or not punto:
            continue
        sentido = fila.get("SENTIDO", "").lower() or "sin_sentido"
        lineas.setdefault(linea, {}).setdefault(sentido, []).append(punto)
    return [
        {"linea": linea, "sentidos": lineas[linea]} for linea in sorted(lineas, key=_orden_linea)
    ]


def corregir_coordenada(texto: str, digitos_enteros: int) -> float:
    """Recupera una coordenada con puntos de miles: '-2.895.956' -> -2.895956.

    Se quitan todos los separadores y se pone el punto decimal después de los
    dígitos enteros esperados (1 para la latitud de Cuenca, 2 para la longitud).
    """
    limpio = texto.strip()
    digitos = re.sub(r"\D", "", limpio)
    if len(digitos) <= digitos_enteros:
        raise ValueError(f"Coordenada sin decimales: {texto!r}")
    valor = float(f"{digitos[:digitos_enteros]}.{digitos[digitos_enteros:]}")
    return -valor if limpio.startswith("-") else valor


def parsear_paradas(texto: str) -> tuple[dict[str, Any], int]:
    """Devuelve las paradas como FeatureCollection y cuántas se descartaron."""
    entidades = []
    descartadas = 0
    for fila in _filas(texto):
        try:
            latitud = corregir_coordenada(fila.get("LATITUD", ""), 1)
            longitud = corregir_coordenada(fila.get("LONGITUD", ""), 2)
        except ValueError:
            descartadas += 1
            continue
        if not (LATITUD[0] <= latitud <= LATITUD[1] and LONGITUD[0] <= longitud <= LONGITUD[1]):
            descartadas += 1
            continue
        identificador = fila.get("N", "")
        entidades.append(
            {
                "type": "Feature",
                "properties": {
                    "id": int(identificador) if identificador.isdigit() else identificador,
                    "ubicacion": fila.get("UBICACION", ""),
                    "tiene_paleta": fila.get("PALETA", "").upper() == "SI",
                },
                "geometry": {"type": "Point", "coordinates": [longitud, latitud]},
            }
        )
    return {"type": "FeatureCollection", "features": entidades}, descartadas


def csv_mas_reciente(paquete: dict[str, Any]) -> dict[str, Any]:
    """El recurso CSV más reciente de un conjunto de datos de CKAN."""
    csvs = [r for r in paquete.get("resources", []) if (r.get("format") or "").upper() == "CSV"]
    if not csvs:
        raise ValueError(f"El conjunto {paquete.get('name')!r} no tiene CSV")
    return max(csvs, key=lambda r: r.get("created") or "")


def _metadata(paquete: dict[str, Any], recurso: dict[str, Any]) -> dict[str, Any]:
    return {
        "titulo": paquete.get("title"),
        "fuente": "GAD Municipal del cantón Cuenca, portal Cuenca en Datos",
        "pagina": f"{CKAN}/dataset/{paquete.get('name') or paquete.get('id')}",
        "datos": recurso.get("url"),
        "archivo": recurso.get("name"),
        "licencia": paquete.get("license_title") or "No indicada en el portal",
    }


def _paquete(descargar: red.Descargador, identificador: str) -> dict[str, Any]:
    url = f"{CKAN}/api/3/action/package_show?{urlencode({'id': identificador})}"
    respuesta = json.loads(decodificar(descargar(url)))
    if not respuesta.get("success"):
        raise ValueError(f"CKAN no devolvió el conjunto {identificador}")
    return respuesta["result"]


def obtener(descargar: red.Descargador = red.descargar) -> Resultado:
    fuentes = {}
    for clave, identificador in DATASETS.items():
        paquete = _paquete(descargar, identificador)
        recurso = csv_mas_reciente(paquete)
        fuentes[clave] = (_metadata(paquete, recurso), decodificar(descargar(recurso["url"])))

    meta_rutas, texto_rutas = fuentes["rutas"]
    meta_recorridos, texto_recorridos = fuentes["recorridos"]
    meta_paradas, texto_paradas = fuentes["paradas"]

    rutas = parsear_rutas(texto_rutas)
    recorridos = parsear_recorridos(texto_recorridos)
    paradas, descartadas = parsear_paradas(texto_paradas)
    meta_paradas["descartadas"] = descartadas
    paradas = {"type": "FeatureCollection", "metadata": meta_paradas, **paradas}

    return Resultado(
        archivos={
            "buses/rutas.json": {"metadata": meta_rutas, "rutas": rutas},
            "buses/recorridos.json": {"metadata": meta_recorridos, "recorridos": recorridos},
            "buses/paradas.geojson": paradas,
        },
        resumen={
            "rutas": len(rutas),
            "lineas": len({r["linea"] for r in rutas}),
            "lineas_con_recorrido": len(recorridos),
            "paradas": len(paradas["features"]),
            "paradas_descartadas": descartadas,
        },
    )
