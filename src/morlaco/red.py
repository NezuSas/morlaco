"""Descargas HTTP con reintentos. Es la única parte que toca la red."""

from __future__ import annotations

import time
import urllib.error
import urllib.request
from collections.abc import Callable

from morlaco import __version__

USER_AGENT = f"Morlaco/{__version__} (datos abiertos de Cuenca)"

Descargador = Callable[[str], bytes]


def descargar(url: str, *, timeout: float = 30, intentos: int = 3) -> bytes:
    """Descarga una URL y devuelve su contenido.

    Reintenta ante fallos de red o errores 5xx; un error 4xx se lanza enseguida.
    """
    ultimo_error: Exception | None = None
    for intento in range(intentos):
        peticion = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(peticion, timeout=timeout) as respuesta:
                return respuesta.read()
        except urllib.error.HTTPError as error:
            if error.code < 500:
                raise
            ultimo_error = error
        except (urllib.error.URLError, TimeoutError) as error:
            ultimo_error = error
        if intento < intentos - 1:
            time.sleep(2**intento)
    assert ultimo_error is not None
    raise ultimo_error
