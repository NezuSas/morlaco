import json

from morlaco.fuentes import cerca


def test_geograficas_recupera_los_formatos_rotos_y_descarta_lo_que_no_es_cuenca():
    # Formatos reales de los CSV del portal.
    assert cerca.geograficas("-291,509", "-7,903,771") == (-79.03771, -2.91509)
    assert cerca.geograficas("-2.899.263", "-78.998.809") == (-78.998809, -2.899263)
    assert cerca.geograficas("-2.8894620992847764", " -78.98729487116421") == (
        -78.98729487116421,
        -2.8894620992847764,
    )
    # Longitud a la que le falta una cifra: cae fuera de la ciudad.
    assert cerca.geograficas("-2.899.263", "-79.754.714") is None
    assert cerca.geograficas("ND", "ND") is None
    # Los mercados usan una caja más justa: -79.105738 está dentro del cantón pero no de la ciudad.
    assert cerca.geograficas("-2.893.465", "-79.105.738") is not None
    assert cerca.geograficas("-2.893.465", "-79.105.738", cerca.CAJA_MERCADOS) is None


def test_desde_utm_con_y_sin_puntos_de_miles():
    lon, lat = cerca.desde_utm("722.710.848", "9.677.643.489")
    assert round(lon, 3) == -78.996 and round(lat, 3) == -2.915
    assert cerca.desde_utm("728850", "9682300") is not None
    assert cerca.desde_utm("ND", "ND") is None
    assert cerca.desde_utm("1", "2") is None


def test_horario_legible_en_los_dos_idiomas():
    assert cerca.horario("08H00-18H00") == {"es": "De 08:00 a 18:00", "en": "08:00 to 18:00"}
    assert cerca.horario("LUNES A VIERNES / 08:00 a 16:45") == {
        "es": "Lunes a viernes, de 08:00 a 16:45",
        "en": "Monday to Friday, 08:00 to 16:45",
    }
    assert cerca.horario("365 DIAS 24/7")["es"] == "Todos los días, las 24 horas"
    assert cerca.horario("CONEXION A DISPOSITIVOS 2 HORAS CADA 24 HORAS") == {
        "es": "Conexión de 2 horas cada 24 horas",
        "en": "2 hours of connection every 24 hours",
    }
    assert cerca.horario("ND") is None


def _calle(nombre, coordenadas):
    return {
        "type": "Feature",
        "properties": {"nombre": nombre, "otros_nombres": []},
        "geometry": {"type": "MultiLineString", "coordinates": [coordenadas]},
    }


# Una cuadrícula de juguete: dos calles de este a oeste y dos de norte a sur.
CALLES = [
    _calle("Mariscal Lamar", [[-79.010, -2.8950], [-79.000, -2.8950]]),
    _calle("Mariscal Sucre", [[-79.010, -2.8975], [-79.000, -2.8975]]),
    _calle("Padre Aguirre", [[-79.006, -2.8930], [-79.006, -2.9000]]),
    _calle("Benigno Malo", [[-79.004, -2.8930], [-79.004, -2.9000]]),
]


def test_ubicar_esquina_con_errata_y_palabras_repetidas():
    lon, lat = cerca.ubicar_esquina("MARISCAL SUCRE Y PADRE AGUIRRE AGUIRRE", CALLES)
    assert round(lon, 3) == -79.006 and round(lat, 4) == -2.8975
    # "MARICAL" es una errata, pero solo Mariscal Lamar encaja con "Lamar".
    lon, lat = cerca.ubicar_esquina("MARICAL LAMAR Y BENIGNO MALO MALO", CALLES)
    assert round(lon, 3) == -79.004 and round(lat, 4) == -2.895
    assert cerca.ubicar_esquina("PADRE AGUIRRE Y BENIGNO MALO", CALLES) is None  # paralelas
    assert cerca.ubicar_esquina("UNA SOLA CALLE", CALLES) is None


def test_mercados_con_longitud_rota_se_ubican_por_su_esquina():
    texto = (
        "nombre,direccion,horario,latitud,longitud\n"
        "PLAZA DE FLORES,MARISCAL SUCRE Y PADRE AGUIRRE AGUIRRE,08H00-18H00,-2.897.758,-79.566.913\n"
        "PLAZA PERDIDA,CALLE INEXISTENTE Y OTRA,08H00-18H00,-2.897.758,-79.566.913\n"
    )
    puntos, descartados = cerca.parsear_mercados(texto, CALLES)
    assert descartados == 1
    (flores,) = puntos
    assert flores["properties"]["nombre"] == "Plaza de Flores"
    assert flores["properties"]["direccion"] == "Mariscal Sucre y Padre Aguirre"
    assert flores["properties"]["horario"]["es"] == "De 08:00 a 18:00"
    assert [round(c, 4) for c in flores["geometry"]["coordinates"]] == [-79.006, -2.8975]


def test_guardia_un_punto_por_destacamento():
    texto = (
        "destacamento,direccion,telefono,latitud,longitud,horario\n"
        "BANIOS,CALLE ALFONSO CARRION,074150991,-2.921685979623302,-79.06537630120978,LUNES A DOMINGO / 08:00 a 17:00\n"
        "CONSEJO,SANTIAGO CARRASCO SN,074150991,-2.91172,-79.00203,LUNES A VIERNES / 08:00 a 16:45\n"
        "CONSEJO,SANTIAGO CARRASCO SN,074150991,-2.91172,-79.00203,HORARIO 24/7\n"
    )
    puntos, descartados = cerca.parsear_guardia(texto)
    assert descartados == 0
    assert [p["properties"]["nombre"] for p in puntos] == ["Baños", "Consejo"]
    assert puntos[1]["properties"]["horario"]["es"] == "Todos los días, las 24 horas"
    assert puntos[1]["properties"]["direccion"] == "Santiago Carrasco"


def test_obtener_junta_las_cuatro_fuentes():
    csvs = {
        "wifi": 'ITEM,TIPO,NOMBRE,DIRECCION,LATITUD,LONGITUD,HORARIO\n1,ZONA WIFI "AMOR POR CUENCA_ETAPA",5AP,AV. DE LAS AMERICAS Y NICOLAS DE ROCHA,"-291,509","-7,903,771",CONEXION A DISPOSITIVOS 2 HORAS CADA 24 HORAS\n',
        "mercados": "nombre,direccion,horario,latitud,longitud\nPLAZA ROTARY,VARGAS MACHUCA Y SANGURIMA,08H00-18H00,-2.89501,-78.999853\n",
        "pilas": "CODIGO,ESTABLECIMIENTO,DIRECCION,TELEFONO,PROGRAMAS,X,Y\n1000,ETAPA GAPAL,DIEZ DE AGOSTO ND Y PAUCARBAMBA,4097744,REC DE PILAS USADAS,722.710.848,9.677.643.489\n",
        "guardia": "destacamento,direccion,telefono,latitud,longitud,horario\nBARRANCO,PASEO TRES DE NOVIEMBRE,074150991,-2.9015922107041985,-79.00517108650737,LUNES A DOMINGO / 08:00 a 17:00\n",
    }
    por_id = {v: k for k, v in cerca.CONJUNTOS.items()}

    def descargar(url):
        if url == cerca.CALLES:
            return json.dumps({"type": "FeatureCollection", "features": CALLES}).encode()
        if "package_show" in url:
            clave = por_id[url.split("id=")[1]]
            recurso = {
                "format": "CSV",
                "url": f"https://csv/{clave}",
                "name": f"{clave}.csv",
                "created": "2026",
            }
            return json.dumps(
                {"success": True, "result": {"name": clave, "title": clave, "resources": [recurso]}}
            ).encode()
        return csvs[url.rsplit("/", 1)[1]].encode()

    resultado = cerca.obtener(descargar)
    datos = resultado.archivos["ciudad/cerca.geojson"]
    assert resultado.resumen == {"wifi": 1, "mercados": 1, "pilas": 1, "guardia": 1}
    assert datos["metadata"]["fuentes"]["wifi"]["fecha"] == "2026"
    assert sorted(f["properties"]["tipo"] for f in datos["features"]) == [
        "guardia",
        "mercado",
        "pilas",
        "wifi",
    ]
    wifi = next(f for f in datos["features"] if f["properties"]["tipo"] == "wifi")
    assert wifi["properties"]["nombre"] == "Av. de las Américas y Nicolas de Rocha"
    assert wifi["properties"]["red"] == "Amor por Cuenca ETAPA"
    pilas = next(f for f in datos["features"] if f["properties"]["tipo"] == "pilas")
    assert pilas["properties"]["direccion"] == "Diez de Agosto y Paucarbamba"
