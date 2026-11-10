import pytest

from morlaco.comun import nombre_propio


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("STA. MARIA DEL VERGEL", "Santa María del Vergel"),
        ("Iess", "IESS"),
        ("Universidad Ups", "Universidad UPS"),
        ("Baguanchi-paccha", "Baguanchi-Paccha"),
        ("TOMAS ORDONIEZ", "Tomás Ordóñez"),
        ("Paccha de BaÃ‘os", "Paccha de Baños"),  # codificación rota
        ("MALL DEL RIO", "Mall del Río"),
        ("el vergel", "El Vergel"),
        ("FEDERICO PROA?O", "Federico Proaño"),  # Ñ perdida al exportar
        ("AV DE LAS AMERICAS", "Av. de las Américas"),
        ("", ""),
    ],
)
def test_nombre_propio(texto, esperado):
    assert nombre_propio(texto) == esperado
