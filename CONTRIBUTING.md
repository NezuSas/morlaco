# Cómo colaborar con Morlaco

Morlaco es de y para la gente de Cuenca. Puedes ayudar aunque no sepas programar.

## Sin programar

- **¿No encuentra tu esquina?** Abre un reporte con la plantilla
  [No encuentra mi dirección](https://github.com/NezuSas/morlaco/issues/new?template=direccion.yml).
  Cada caso real mejora la búsqueda para todos.
- **¿Un horario o una parada no coincide con lo que ves en tu calle?** Usa
  [Un dato está mal](https://github.com/NezuSas/morlaco/issues/new?template=dato.yml).
- **¿Se te ocurre algo útil para la ciudad?** Cuéntalo en
  [Una idea para Morlaco](https://github.com/NezuSas/morlaco/issues/new?template=idea.yml), y si sabes dónde se
  publican esos datos, mejor.
- **Comparte la página** con tu familia, tu barrio o tu grupo de WhatsApp:
  <https://nezusas.github.io/morlaco/web/>.

Para abrir un reporte necesitas una cuenta de GitHub (es gratis). No escribas datos personales: con la esquina
basta.

## Programando

### Preparar el proyecto

Necesitas Python 3.10 o superior y Node 20 o superior.

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"     # en Linux o macOS: .venv/bin/python
```

### Antes de enviar un cambio

```bash
.venv/Scripts/python -m pytest
.venv/Scripts/python -m ruff check .
.venv/Scripts/python -m ruff format --check .
node --test "tests/web/*.test.mjs"
```

Para ver la página en tu computadora, sirve la carpeta del proyecto y abre <http://127.0.0.1:8765/web/>:

```bash
.venv/Scripts/python -m http.server 8765 --bind 127.0.0.1
```

### Cómo está hecho

- `src/morlaco/fuentes/` tiene un módulo por fuente pública. Cada uno expone `obtener(descargar)` y separa la
  descarga del parseo, que son funciones puras probadas con ejemplos.
- `web/` es la página: HTML, CSS y JavaScript sin compilación. La lógica sin DOM (`logica.js`, `calles.js`) tiene
  pruebas en `tests/web/`.
- `datos/` lo genera `morlaco actualizar`; no se edita a mano.

### Buenas primeras tareas

- **Revisar o mejorar las traducciones** de `web/textos.js` (español e inglés), o añadir otro idioma: cada texto
  tiene su clave y las pruebas avisan si falta alguna.
- **Mejorar OpenStreetMap en Cuenca**: si falta una ciclovía, una estación de BiciPública o un punto de carga,
  añádelo en [openstreetmap.org](https://www.openstreetmap.org) y Morlaco lo recogerá en la siguiente
  actualización.
- **Buscar una fuente pública de farmacias de turno** y, si existe, escribir su lector en `fuentes/`.
- **Probar la búsqueda con esquinas de tu barrio** y añadir a `tests/web/calles.test.mjs` las que fallen.

### Estilo

- Textos de la interfaz en español claro, en segunda persona y sin tecnicismos ("Saca la funda negra", no
  "Depositar residuos").
- Nombres de variables y funciones en español, como el resto del código.
- Cada cambio, con sus pruebas.

## Licencias

El código es MIT. Al enviar un cambio aceptas publicarlo bajo esa licencia. Los datos conservan la licencia de su
fuente (ver el [README](README.md#licencia-de-los-datos)).
