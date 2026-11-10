"""Conversión de coordenadas UTM (WGS 84) a latitud y longitud.

Algunos datos del municipio vienen en UTM zona 17 Sur (EPSG:32717). Esta es la
fórmula estándar inversa de Transverse Mercator (serie de Krüger, la misma que
usan las bibliotecas SIG), con precisión de milímetros en la zona de Cuenca.
"""

from __future__ import annotations

import math

_A = 6_378_137.0  # semieje mayor de WGS 84
_F = 1 / 298.257223563
_K0 = 0.9996
_E0 = 500_000.0
_N0_SUR = 10_000_000.0

_N = _F / (2 - _F)
_A_RECT = _A / (1 + _N) * (1 + _N**2 / 4 + _N**4 / 64)
_BETA = (
    _N / 2 - 2 * _N**2 / 3 + 37 * _N**3 / 96,
    _N**2 / 48 + _N**3 / 15,
    17 * _N**3 / 480,
)
_DELTA = (
    2 * _N - 2 * _N**2 / 3 - 2 * _N**3,
    7 * _N**2 / 3 - 8 * _N**3 / 5,
    56 * _N**3 / 15,
)


def utm_a_geograficas(
    este: float, norte: float, zona: int = 17, sur: bool = True
) -> tuple[float, float]:
    """(este, norte) en metros -> (longitud, latitud) en grados."""
    xi = (norte - (_N0_SUR if sur else 0.0)) / (_K0 * _A_RECT)
    eta = (este - _E0) / (_K0 * _A_RECT)
    xi_p = xi - sum(
        b * math.sin(2 * j * xi) * math.cosh(2 * j * eta) for j, b in enumerate(_BETA, 1)
    )
    eta_p = eta - sum(
        b * math.cos(2 * j * xi) * math.sinh(2 * j * eta) for j, b in enumerate(_BETA, 1)
    )
    chi = math.asin(math.sin(xi_p) / math.cosh(eta_p))
    latitud = chi + sum(d * math.sin(2 * j * chi) for j, d in enumerate(_DELTA, 1))
    meridiano = math.radians(zona * 6 - 183)
    longitud = meridiano + math.atan2(math.sinh(eta_p), math.cos(xi_p))
    return math.degrees(longitud), math.degrees(latitud)
