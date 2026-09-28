# Oposi Test

Aplicación web para hacer simulacros de test de oposiciones (preguntas a, b, c; cada fallo resta 1/3).

## Funcionalidades

- **Hacer test**
  - *Examen completo*: elige un examen oficial y resuélvelo (opcionalmente con las preguntas de reserva y tiempo límite).
  - *Test aleatorio por bloques*: elige nº de preguntas y bloques; el test reparte las preguntas a partes iguales entre bloques. Puede priorizar las preguntas falladas / no vistas, o usar solo las falladas.
  - Modo *simulacro* (corrección al final) o *práctica* (ves la solución al responder). Atajos de teclado A/B/C y ←/→. El test en curso se guarda si cierras la pestaña.
- **Añadir**
  - *Examen completo*: sube el PDF del examen y el PDF de la plantilla. La app lee las preguntas y respuestas, propone el bloque de cada pregunta y te deja revisarlo (y asignar bloques por rangos) antes de guardar. Si el PDF es escaneado, pega el texto.
  - *Pregunta suelta*: a mano.
- **Preguntas**: buscar y filtrar el banco, cambiar bloque o respuesta, marcar anuladas, gestionar bloques.
- **Estadísticas**: aciertos/fallos/blancos (quesos), reparto de fallos por bloque, rendimiento por bloque, evolución de la nota, preguntas que más fallas e historial.
- **Datos**: copia de seguridad (exportar/importar .json).

Puntuación: acierto +1, fallo −1/3, blanco 0. Nota = (aciertos − fallos/3) / nº preguntas × 10.

## Datos

- Los exámenes incluidos están en `data/exams/` (JSON). Para añadir uno al repositorio para todo el mundo, copia el JSON en esa carpeta y añade su nombre a `data/exams/index.json`.
- Lo que añade cada usuario y sus resultados se guardan en el navegador (`localStorage`). Usa **Datos → Descargar copia** para pasarlo a otro dispositivo.

## Ejecutar en local

Es una web estática sin compilación:

```sh
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Despliegue

El workflow `.github/workflows/pages.yml` publica la web en GitHub Pages en cada push a `main`.
Hay que activarlo una vez: *Settings → Pages → Build and deployment → Source: GitHub Actions*.

Librerías incluidas en `vendor/`: [Chart.js](https://www.chartjs.org) 4.4.4 y [pdf.js](https://mozilla.github.io/pdf.js/) 4.10.38.
