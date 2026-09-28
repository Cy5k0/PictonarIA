# Prompt para agente IA: desarrollo de **pictonarIA**

> Adjunta al agente el archivo `pictionary_600_tarjetas.md`. Es la única fuente de datos y reglas.

---

## 1. Rol y objetivo

Actúa como desarrollador front-end senior. Construye **pictonarIA**, una aplicación web **100 % estática** (sin backend, sin base de datos, sin login) para jugar Pictionary de forma presencial en un mismo dispositivo (celular, tablet o notebook puesto en la mesa). La app reemplaza el mazo físico de tarjetas y el cronómetro; el dibujo se hace en papel o pizarra, **no** dentro de la app.

Todo el contenido (tarjetas y reglas) proviene del markdown adjunto. Idioma de la interfaz: **español (Chile)**.

## 2. Restricciones técnicas

- HTML + CSS + JavaScript vanilla (ES modules). **Sin frameworks ni bundlers**, sin dependencias en runtime, sin CDNs externos, sin tracking.
- Debe funcionar desplegada en GitHub Pages / Netlify / cualquier hosting estático, y también sin conexión (PWA: `manifest.webmanifest` + service worker con caché de todos los assets).
- Las tarjetas se cargan desde `data/cards.json` con `fetch`. Como `fetch` falla con `file://`, incluye en el README instrucciones para probar con `python -m http.server`, y un mensaje de error claro en la UI si el JSON no carga.
- Persistencia solo con `localStorage` (ajustes, tarjetas ya usadas, historial de partida en curso), siempre dentro de `try/catch`.
- Mobile-first, responsive, targets táctiles ≥ 44 px, accesible (contraste AA, `aria-live` para el cronómetro, navegación por teclado, respeta `prefers-reduced-motion` y `prefers-color-scheme`).
- Estructura de proyecto sugerida:

```
pictonarIA/
├── index.html
├── css/styles.css
├── js/ (app.js, deck.js, game.js, timer.js, ui.js, storage.js)
├── data/cards.json
├── scripts/build_cards.py        # markdown -> JSON
├── tests/                        # validación del JSON y lógica del mazo
├── manifest.webmanifest
├── sw.js
├── icons/
└── README.md
```

## 3. Datos: formato JSON de las tarjetas

### 3.1 Conversión

Escribe `scripts/build_cards.py` que parsee **todas** las tablas `| ID | Tarjeta | Dificultad |` del markdown y genere `data/cards.json`. No transcribas las tarjetas a mano. El script debe ser reproducible y fallar con error si el resultado no cumple las validaciones de 3.4.

### 3.2 Esquema

```json
{
  "meta": {
    "name": "pictonarIA",
    "version": "1.0.0",
    "total": 600,
    "source": "pictionary_600_tarjetas.md"
  },
  "decks": {
    "infantil": { "label": "Infantil", "emoji": "🟢", "color": "#2e9e4f", "count": 200 },
    "adulto":   { "label": "Adulto",   "emoji": "🔵", "color": "#2f6fd6", "count": 100 },
    "mixto":    { "label": "Mixto / Familiar", "emoji": "🟡", "color": "#f2b800", "count": 100 },
    "chile":    { "label": "Chile",    "emoji": "🇨🇱", "icon": "flag-cl", "color": "#d52b1e", "count": 100 },
    "desafio":  { "label": "Desafío / Fiesta", "emoji": "🟣", "color": "#7b3fbf", "count": 100 }
  },
  "cards": [
    {
      "id": "I001",
      "text": "Perro",
      "deck": "infantil",
      "difficulty": 1,
      "points": 1,
      "category": "Animales"
    }
  ]
}
```

### 3.3 Reglas de mapeo

- Prefijo del ID → mazo: `I` = infantil, `A` = adulto, `M` = mixto, `C` = chile, `D` = desafio.
- Dificultad: `⭐` = 1, `⭐⭐` = 2, `⭐⭐⭐` = 3. `points` es igual a `difficulty`.
- `category`: el encabezado `##` bajo el cual aparece la tarjeta (ej. "Animales", "Transporte", "Comida", "Geografía chilena", etc.), sin el emoji. Los mazos sin subencabezados (Adulto, Mixto, Desafío) usan `null`.
- Conserva el texto exacto de cada tarjeta (tildes, mayúsculas, "ñ"), sin espacios sobrantes.
- Los IDs son únicos e inmutables.

### 3.4 Validaciones obligatorias (tests)

- Exactamente 600 tarjetas: 200 `infantil`, 100 `adulto`, 100 `mixto`, 100 `chile`, 100 `desafio`.
- IDs únicos y con formato `^[IAMCD]\d{3}$`; `difficulty` ∈ {1, 2, 3}; `text` no vacío.
- Los conteos por mazo deben coincidir con `meta` y `decks`.

### 3.5 Duplicados detectados en el markdown (decisión requerida)

El markdown contiene textos repetidos con IDs distintos (por ejemplo "Bicicleta", "Volar una cometa", "Hacer un muñeco de nieve", "Soplar las velas", "Abrir un regalo", "Cumpleaños", "Fiesta", "Vacaciones", "Superhéroe", "Acampar", "Jugar en el parque", "Ir al supermercado", "Fin de mes", "Contraseña olvidada", entre otros; unos 17 textos en total). Comportamiento requerido:

1. **No borres ni renumeres nada**: el JSON debe mantener las 600 tarjetas.
2. Agrega el campo `"duplicateOf": "<id de la primera aparición>"` a cada repetición.
3. En la app, el mazo activo **excluye por defecto** las tarjetas con `duplicateOf` para que un texto no salga dos veces en la misma partida (con un ajuste "Incluir tarjetas repetidas" desactivado por defecto).
4. Entrega en el README un listado de los duplicados encontrados para que el autor decida si los reemplaza por tarjetas nuevas.

## 4. Reglas y modos de juego (deben salir del markdown)

### 4.1 Reglas básicas
- Turno de **60 segundos** (configurable: 30 / 45 / 60 / 90 s).
- El dibujante no puede hablar ni escribir letras, palabras o números; sí puede usar símbolos. La app muestra estas reglas en una pantalla "Cómo se juega" y en un recordatorio corto antes de cada turno.
- Puntos por tarjeta acertada: 1 / 2 / 3 según la dificultad.

### 4.2 Composiciones de equipo y mazos sugeridos
Al crear la partida el usuario elige la **modalidad**, y la app preselecciona los mazos (editable manualmente):

| Modalidad | Mazos preseleccionados |
|---|---|
| Niño vs Niño | infantil, mixto |
| Adulto vs Adulto | adulto, desafio, mixto |
| Adulto+Niño vs Adulto+Niño | mixto, infantil, chile (solo dificultad 1) |
| 2 Adultos vs Adulto+Niño | mixto, chile, infantil, y algunas de adulto con dificultad 1 |
| Modo Chile | solo chile, o mezcla 50 % chile / 25 % mixto / 25 % infantil+adulto |
| Modo Fiesta | adulto, chile, desafio |
| Personalizado | el usuario marca los mazos y el rango de dificultad |

Nota para "Modo Chile" con equipos familiares: ofrecer un filtro que excluya la categoría "Expresiones y conceptos chilenos" y priorice comida, lugares, transporte y tradiciones.

### 4.3 Regla "Pareja Familiar"
Si un equipo se marca como adulto + niño:
- Puede pedir tarjetas del mazo mixto.
- Cuando dibuja el niño, el turno recibe **+10 segundos** (visible en el cronómetro).
- Cuando dibuja el adulto, el tiempo es el normal.
- El niño puede **cambiar una tarjeta por partida** que no conozca (botón "Cambiar tarjeta (1 disponible)", que se deshabilita al usarse).

### 4.4 Modo Fiesta: "Dibujo imposible"
Ronda especial opcional. Al sacar una tarjeta, la app sortea una restricción: mano contraria, sin levantar el lápiz, ojos cerrados o dibujo compartido con otro jugador, y la muestra junto a la tarjeta. Las tarjetas del mazo desafío que ya incluyen la restricción en su texto no reciben una segunda.

### 4.5 Modo campeonato
- 2 o más equipos, todos parten con 0 puntos.
- La partida dura **10, 20 o 30 rondas** (una ronda = un turno de cada equipo).
- Flujo de cada turno: sacar tarjeta → determinar quién dibuja (rotación automática entre los jugadores del equipo) → activar 60 s → adivinar → sumar puntos → pasar turno.
- Al final, pantalla de resultados con el equipo ganador, puntaje por equipo y manejo de empates (indicar empate; opcional: ronda de desempate).

## 5. Pantallas y flujo de UX

1. **Inicio**: logo/título "pictonarIA", botones *Nueva partida*, *Continuar partida* (si hay una guardada), *Cómo se juega*, *Ajustes*.
2. **Configuración de partida**: modalidad, equipos (2 a 4, nombre editable y marca "adulto + niño" para activar la regla de 4.3), mazos activos con contador de tarjetas disponibles, rango de dificultad, tiempo por turno, número de rondas.
3. **Pantalla de turno**:
   - Encabezado con el equipo y el dibujante.
   - **La tarjeta debe estar oculta** hasta que el dibujante pulse "Ver tarjeta", para que el resto del equipo no la vea. Debe poder volver a ocultarse.
   - La tarjeta replica el diseño de la sección 16 del markdown: título "PICTIONARY", texto de la tarjeta en grande, mazo con su emoji y color, dificultad en estrellas, puntos ("2 PUNTOS"). Colores por mazo: infantil verde, adulto azul, mixto amarillo, chile rojo, desafío morado.
   - Cronómetro grande con barra de progreso, sonido y vibración al terminar (configurables, con mute), botones *Iniciar / Pausar*.
   - Botones al terminar: **"¡Acertaron!"** (suma puntos) y **"No acertaron"** (0 puntos); botón *Saltar tarjeta* configurable (ej. sin penalización, máximo N por turno).
4. **Marcador**: puntaje por equipo visible en todo momento (colapsable) y ronda actual.
5. **Resultados finales** con botón *Revancha* (misma configuración) y *Nueva partida*.
6. **Ajustes**: tiempo por defecto, sonido, vibración, tema claro/oscuro/automático, incluir duplicados, reiniciar mazo usado.

## 6. Lógica del mazo

- Baraja con **Fisher-Yates** (nunca `sort(() => Math.random() - .5)`).
- Una tarjeta no se repite dentro de una partida; guarda las usadas en `localStorage` para no repetirlas tampoco entre partidas hasta agotar el mazo filtrado (con botón "Reiniciar tarjetas usadas").
- Si el mazo filtrado se agota, avisar y ofrecer reiniciar o ampliar filtros; nunca fallar en silencio.
- Para mezclas porcentuales (ej. 50/25/25), muestrear respetando las proporciones y rellenar con otros mazos cuando uno se agote.
- La lógica del mazo y del puntaje debe estar separada de la UI y ser testeable sin DOM.

## 7. Diseño visual

- Estilo lúdico y limpio, con buena legibilidad a 1-2 metros de distancia (la tarjeta se lee sobre la mesa).
- Tipografía del sistema con fallback robusto (sin web fonts obligatorias); textos de tarjeta a tamaño grande y ajuste automático para textos largos ("Construir un castillo de arena").
- Animación suave de volteo de tarjeta, desactivada con `prefers-reduced-motion`.
- Emojis de mazo tal como en el markdown; el resto de iconos, en SVG inline.
- **Bandera de Chile (🇨🇱):** en todos los lugares donde aparezca el mazo Chile (selector de mazos, tarjeta, marcador, ajustes, modalidad "Modo Chile") debe verse la **bandera chilena**, nunca las letras "CL". Windows (Chrome/Edge) no renderiza los emojis de banderas y muestra "CL" en su lugar, así que:
  1. Mantén `"emoji": "🇨🇱"` en el JSON como dato.
  2. En la UI, renderiza el ícono con un **SVG inline** de la bandera (campo `"icon": "flag-cl"`), y usa el emoji solo como texto alternativo (`aria-label="Chile"`). No dependas de la fuente de emojis del sistema para este ícono.
  3. Usa exactamente este SVG (proporción 3:2, colores oficiales):

```html
<svg class="flag-cl" viewBox="0 0 3 2" role="img" aria-label="Chile" xmlns="http://www.w3.org/2000/svg">
  <rect width="3" height="1" y="0" fill="#fff"/>
  <rect width="3" height="1" y="1" fill="#D52B1E"/>
  <rect width="1" height="1" fill="#0039A6"/>
  <polygon fill="#fff" points="0.5,0.18 0.5718,0.4011 0.8043,0.4011 0.6162,0.5378 0.6881,0.7589 0.5,0.6222 0.3119,0.7589 0.3838,0.5378 0.1957,0.4011 0.4282,0.4011"/>
</svg>
```

  Tamaño sugerido: `height: 1em; width: 1.5em; vertical-align: -0.15em; border-radius: 2px; box-shadow: 0 0 0 1px rgba(0,0,0,.15);` (el borde evita que la franja blanca se pierda sobre fondos claros). Incluye también esta bandera en el favicon/ícono si se usa un símbolo del mazo.
  4. Las demás banderas o emojis de mazo (🟢🔵🟡🟣) sí pueden mostrarse como emoji, pero si un test visual en Windows muestra fallas, aplica el mismo criterio de SVG inline.
- Favicon e íconos PWA con el nombre pictonarIA (destacar "IA" en el logotipo tipográfico, p. ej. con otro color).

## 8. Criterios de aceptación

- [ ] `data/cards.json` generado por script, con 600 tarjetas y los conteos 200/100/100/100/100, más `duplicateOf` marcado.
- [ ] Se puede jugar una partida completa (configurar → turnos → resultados) en móvil, sin instalar nada, solo abriendo la URL.
- [ ] Funciona sin conexión tras la primera carga.
- [ ] Las reglas de 4.2 a 4.5 están implementadas y comportan como se describe (incluidos +10 s y cambio único de tarjeta para la pareja familiar).
- [ ] La tarjeta permanece oculta hasta que el dibujante la revela.
- [ ] El mazo Chile muestra la bandera chilena (SVG inline) en todas las pantallas, también en Windows; en ningún lugar aparece el texto "CL".
- [ ] No hay errores en consola ni dependencias externas; Lighthouse ≥ 90 en Performance, Accessibility y PWA.
- [ ] Los tests de validación del JSON y de la lógica del mazo pasan.
- [ ] README con: descripción, cómo ejecutar localmente, cómo regenerar el JSON, cómo desplegar en GitHub Pages, cómo agregar un mazo nuevo y la lista de duplicados.

## 9. Extensibilidad (no implementar ahora, pero no bloquear)

El markdown prevé futuras expansiones: Películas, Música, Deportes, Personajes, Fantasía, Colegio, Trabajo, Humor, Chile avanzado, Familia y Extremadamente difícil. Diseña el esquema y el selector de mazos para que agregar un mazo sea **solo añadir entradas en `decks` y `cards`** del JSON, sin tocar el código. Mantén el mazo base en 600 tarjetas.

## 10. Forma de trabajo esperada

1. Lee el markdown completo y resume brevemente lo que entendiste (mazos, modos, reglas).
2. Genera y valida `cards.json` primero.
3. Implementa la lógica (mazo, turnos, puntaje) con tests, y luego la UI.
4. Entrega el proyecto completo con la estructura de la sección 2 y el README.
5. Si algo del markdown es ambiguo (por ejemplo, cómo mezclar mazos en "2 Adultos vs Adulto + Niño"), toma la decisión más simple, documéntala en el README y no te detengas a preguntar.
