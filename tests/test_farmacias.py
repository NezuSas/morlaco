from datetime import date

import pytest

from morlaco.fuentes import farmacias

BASE = "https://www.controlsanitario.gob.ec/wp-content/uploads/downloads/2026"

# Filas como las devuelve la tabla del PDF de ARCSA: cabecera repetida, celdas combinadas
# (las fechas solo en la primera farmacia de la semana) y textos partidos en dos filas.
FILAS = [
    ["FARMACIA", "", "", "CIUDAD", "DIRECCION", "", "", "TELEFONO", "", "FECHA", "", "", "FECHA", ""],
    ["", "", "", "", "", "", "", "", "", "INICIO", "", "", "FINAL", ""],
    ["", "", "", "", "", "", "", "", "", "06:00 AM", "", "", "06:00 AM", ""],
    ["FARMACIAS ECONOMAX", "", "", "CUENCA", "", "CARRETERO: VIA AL VALLE BARRIO:", "", "04222222", "31/10/2026", "", "", "7/11/2023", "", ""],
    ["", "", "", "", "", "VALLE CALLE: CAMINO DEL VALLE SN", "", "", "", "", "", "", "", ""],
    ["FARMACIA SUIZA", "", "", "CUENCA", "CALLE: 1RO DE SEPTIEMBRE S/N CANTON EL PAN", "", "", "968357616", "", "", "", "", "", ""],
    ["", "FARMACIA POPULAR UNIDAS", "", "CUENCA", "", "CALLE: AV RICARDO DURAN S/N 24", "", "072857540", "", "", "", "", "", ""],
    ["", "29", "", "", "", "DE DICIEMBRE", "", "", "", "", "", "", "", ""],
    ["FARMACIA REY DAVID", "", "", "CUENCA", "", "CALLE: AV. ORDOÑEZ LAZO 4-113 EL", "", "4191011", "7/11/2026", "14/11/2026", "", "", "", ""],
    ["", "", "", "", "", "HUANDO", "", "", "", "", "", "", "", ""],
    ["FARMACIA AMIGA", "", "", "PAUTE", "CALLE: SUCRE S/N", "", "", "00000000", "7/11/2026", "14/11/2026", "", "", "", ""],
]  # fmt: skip


def test_listar_pdfs_solo_azuay_ordenados():
    html = f"""
      <a href="{BASE}/10/11.-ARCSA-CZ6-Turno-de-farmacia-AZUAY-NOVIEMBRE-2026.pdf">Azuay</a>
      <a href="{BASE}/09/10.-ARCSA-CZ6-Turno-de-farmacia-AZUAY-OCTUBRE-2026.pdf">Azuay</a>
      <a href="{BASE}/10/11.-ARCSA-CZ6-Turno-de-farmacia-CANAR-NOVIEMBRE-2026.pdf">Cañar</a>
    """
    assert [(a, m) for a, m, _ in farmacias.listar_pdfs(html)] == [(2026, 10), (2026, 11)]


def test_corregir_semana():
    assert farmacias.corregir_semana((2026, 10, 31), (2023, 11, 7), 2026) == (
        date(2026, 10, 31),
        date(2026, 11, 7),
    )
    # Una semana que cruza de año.
    assert farmacias.corregir_semana((2026, 12, 26), (2026, 1, 2), 2027) == (
        date(2026, 12, 26),
        date(2027, 1, 2),
    )
    assert (
        farmacias.corregir_semana((2026, 11, 7), (2026, 12, 30), 2026) is None
    )  # no es una semana


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("4191011", "+59374191011"),
        ("072857540", "+59372857540"),
        ("981137440", "+593981137440"),
        ("0981137440", "+593981137440"),
        ("00000000", None),
        ("", None),
        ("123", None),
    ],
)
def test_telefono_para_llamar(texto, esperado):
    assert farmacias.telefono_para_llamar(texto) == esperado


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("CALLE: VEGA MUÑOZ 6-72 BORRERO", "Vega Muñoz 6-72 y Borrero"),
        ("CALLE: MARISCAL SUCRE SN HERMANO MIGUEL", "Mariscal Sucre y Hermano Miguel"),
        ("CALLE: AV.HURTADO DE MENDOZA 11-73 AV. PASEO DE LOS CANARIS", "Av. Hurtado de Mendoza 11-73 y Av. Paseo de los Cañaris"),
        ("CALLE: BELLA UNION S/N SIN INTERSECCION", "Bella Unión"),
    ],
)  # fmt: skip
def test_direccion_legible(texto, esperado):
    assert farmacias.direccion_legible(texto) == esperado


def test_reconstruir_une_filas_y_hereda_las_fechas():
    lista = farmacias.reconstruir(FILAS, 2026)
    nombres = [f["nombre"] for f in lista]
    assert nombres == [
        "FARMACIAS ECONOMAX",
        "FARMACIA SUIZA",
        "FARMACIA POPULAR UNIDAS 29",
        "FARMACIA REY DAVID",
        "FARMACIA AMIGA",
    ]
    economax, suiza, popular, rey, amiga = lista
    assert (
        economax["direccion"] == "CARRETERO: VIA AL VALLE BARRIO: VALLE CALLE: CAMINO DEL VALLE SN"
    )
    assert economax["semana"] == (date(2026, 10, 31), date(2026, 11, 7))  # año 2023 corregido
    assert popular["semana"] == economax["semana"]  # hereda la semana (celda combinada)
    assert popular["direccion"] == "CALLE: AV RICARDO DURAN S/N 24 DE DICIEMBRE"
    assert rey["semana"] == (date(2026, 11, 7), date(2026, 11, 14))
    assert rey["direccion"].endswith("EL HUANDO")
    assert amiga["ciudad"] == "PAUTE"


def test_agrupar_cuenca_descarta_otros_cantones():
    turnos, descartadas = farmacias.agrupar_cuenca(farmacias.reconstruir(FILAS, 2026))
    assert descartadas == 1  # la dirección de Farmacia Suiza dice "CANTON EL PAN"
    assert [(t["inicio"], len(t["farmacias"])) for t in turnos] == [
        ("2026-10-31", 2),
        ("2026-11-07", 1),
    ]
    rey = turnos[1]["farmacias"][0]
    assert rey == {
        "nombre": "Farmacia Rey David",
        "direccion": "Av. Ordoñez Lazo 4-113 y el Huando",
        "telefono": "4191011",
        "tel": "+59374191011",
    }
    # Paute no es Cuenca.
    assert all(f["nombre"] != "Farmacia Amiga" for t in turnos for f in t["farmacias"])


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("FARMACIAS MIA MCU01", "Farmacias Mia"),
        ("FARMCIA CRUZ AZUL CUE TURUHUAYCO", "Farmacia Cruz Azul Turuhuayco"),
        ("POPULAR UNIDAS N:16", "Popular Unidas 16"),
        ("FARMACIA FARMA7", "Farmacia Farma7"),
        ("FARMACIA SANTA INES 2", "Farmacia Santa Inés 2"),
    ],
)
def test_nombre_farmacia(texto, esperado):
    assert farmacias.nombre_farmacia(texto) == esperado
