# pictonarIA

Pictionary **presencial** en un solo dispositivo. La app reemplaza el mazo físico de tarjetas y el
cronómetro; el dibujo se hace en papel o pizarra, **no** dentro de la app.

- 100 % estática: HTML + CSS + JavaScript vanilla (ES modules), **sin frameworks, sin bundlers, sin
  dependencias en runtime, sin CDNs ni tracking**.
- Funciona en GitHub Pages / Netlify / cualquier hosting estático y **sin conexión** tras la primera
  carga (PWA con service worker).
- Interfaz en **español (Chile)**.
- 600 tarjetas en 5 mazos, cargadas desde `data/cards.json`.

Fuente única de datos y reglas: `pictionary_600_tarjetas.md`. Las tarjetas **no** se transcriben a
mano: `scripts/build_cards.py` las parsea y genera el JSON.

## Estructura

```
pictonaria/
├── index.html
├── css/styles.css
├── js/
│   ├── app.js       # orquesta pantallas, partida y eventos
│   ├── deck.js      # mazo: Fisher-Yates, filtros, mezclas, tarjetas usadas (sin DOM)
│   ├── game.js      # equipos, turnos, puntaje, pareja familiar, modo fiesta (sin DOM)
│   ├── timer.js     # cronómetro del turno (sin DOM)
│   ├── ui.js        # render y utilidades de interfaz
│   └── storage.js   # localStorage seguro (try/catch)
├── data/cards.json  # generado por el script
├── scripts/
│   ├── build_cards.py   # markdown -> JSON + validaciones
│   └── make_icons.py    # íconos PNG de la PWA (sin dependencias)
├── tests/               # node:test: JSON + lógica del mazo/partida
├── manifest.webmanifest
├── sw.js
├── icons/
├── package.json         # solo para `npm test` (sin dependencias)
└── README.md
```

## Cómo ejecutar en local

`fetch` falla con `file://`, así que sirve la carpeta con un servidor local:

```bash
python3 -m http.server 8080
# o: npm run serve
```

Abre <http://localhost:8080>. Si abres `index.html` con doble clic (file://) la app muestra un
mensaje de error claro indicando usar un servidor local.

## Cómo regenerar `data/cards.json`

```bash
python3 scripts/build_cards.py
# o: npm run build:cards
```

El script parsea **todas** las tablas `| ID | Tarjeta | Dificultad |` del markdown y falla con error
si el resultado no cumple las validaciones: exactamente 600 tarjetas (200/100/100/100/100), IDs
únicos `^[IAMCD]\d{3}$`, `difficulty` ∈ {1, 2, 3}, `points == difficulty`, texto no vacío y conteos
coincidentes con `meta` y `decks`. También marca las repeticiones con `duplicateOf`.

Regenerar los íconos PNG de la PWA (opcional, ya están incluidos):

```bash
python3 scripts/make_icons.py
```

## Tests

```bash
npm test        # node --test tests/*.test.js   (Node >= 18, sin dependencias)
```

- `tests/cards.test.js`: valida el JSON (conteos, IDs, dificultad, categorías, duplicados).
- `tests/logic.test.js`: prueba el mazo (Fisher-Yates, filtros, no-repetición, mezclas, reinicio),
  el cronómetro (pausa/reanudar/bonus/fin) y la partida (rotación, puntaje, empates, pareja
  familiar, restricción de modo fiesta).

## Reglas y modos implementados

- Turno de 60 s configurable (30/45/60/90). El dibujante no puede hablar ni escribir letras,
  palabras o números; sí símbolos.
- Puntos por tarjeta acertada: 1 / 2 / 3 según dificultad.
- **Modalidades** (sección 4.2): al elegirla se preseleccionan los mazos y se pueden editar a mano.
  - Niño vs Niño → `infantil`, `mixto`
  - Adulto vs Adulto → `adulto`, `desafio`, `mixto`
  - Adulto + Niño vs Adulto + Niño → `mixto`, `infantil`, `chile` (Chile solo dificultad 1)
  - 2 Adultos vs Adulto + Niño → `mixto`, `chile`, `infantil` + `adulto` (solo dificultad 1)
  - Modo Chile → solo `chile`, o mezcla 50/25/25 (`chile` ×2, `mixto` ×1, `infantil` ×0,5, `adulto` ×0,5)
  - Modo Fiesta → `adulto`, `chile`, `desafio` + restricción «Dibujo imposible»
  - Personalizado → eliges mazos y rango de dificultad
- **Pareja Familiar**: si el niño dibuja, el turno recibe **+10 s** (visible en el cronómetro) y
  puede **cambiar una tarjeta por partida** con el botón «Cambiar tarjeta (1 disponible)».
- **Modo Fiesta «Dibujo imposible»**: se sortea una restricción (mano contraria, sin levantar el
  lápiz, ojos cerrados o dibujo compartido). Las tarjetas del mazo `desafio` no reciben otra
  restricción.
- **Modo campeonato**: 2 a 4 equipos, 10/20/30 rondas (una ronda = un turno por equipo). Al final,
  pantalla de resultados con ganador y aviso de empate.
- **Modo Chile familiar**: casilla que excluye la categoría «Expresiones y conceptos chilenos».

## Lógica del mazo

- Baraja **Fisher-Yates** (nunca `sort(() => Math.random() - 0.5)`).
- Una tarjeta no se repite dentro de una partida, y las usadas se guardan en `localStorage` para no
  repetirlas entre partidas hasta agotar el mazo filtrado. Ajustes → **Reiniciar tarjetas usadas**.
- Si el mazo filtrado se agota, la app avisa y ofrece reiniciar las usadas; nunca falla en silencio.
- Las mezclas porcentuales respetan las proporciones y rellenan con otros mazos cuando uno se agota.
- «Saltar tarjeta» (máx. 1 por turno, sin penalización) y «Cambiar tarjeta» **devuelven** la tarjeta
  al mazo: no se marcan como usadas y pueden volver a salir.

## Decisiones tomadas ante ambigüedades

El prompt pedía tomar la decisión más simple y documentarla:

- **Estructura en la raíz del repo** (no en una subcarpeta `pictonarIA/`) para poder desplegar
  directamente en GitHub Pages.
- **«Chile solo dificultad 1»** y **«algunas de adulto dificultad 1»** se resuelven con un tope de
  dificultad por mazo (`deckMaxDifficulty`) aplicado por el preset de la modalidad.
- **Modo Chile 50/25/25** se implementa con pesos (`weights`); el 25 % restante se reparte 12,5 %
  infantil y 12,5 % adulto para poder dibujar de ambos tipos.
- **Rotación del dibujante**: los jugadores de cada equipo rotan por ronda; cada jugador se puede
  marcar como «niño» para activar el +10 s. Equipos de 2 a 4; cada equipo, de 1 a N jugadores.
- **Guardado de partida**: se persiste al terminar cada turno. Si se cierra la app en medio de un
  turno, ese turno se reinicia con una tarjeta nueva al continuar.

## Accesibilidad y diseño

- Mobile-first, *targets* táctiles ≥ 44 px, contraste AA, navegación por teclado
  (`Espacio` revela/inicia el turno) y `aria-live` en el cronómetro.
- Respeta `prefers-reduced-motion` (desactiva el volteo) y `prefers-color-scheme`
  (tema claro/oscuro/automático en Ajustes).
- La tarjeta se mantiene **oculta** hasta que el dibujante pulsa «Ver tarjeta», y se puede volver a
  ocultar.
- **Bandera de Chile**: se renderiza siempre con un **SVG inline** (`icons`/`ui.js`), nunca con el
  emoji de la fuente del sistema, porque Windows (Chrome/Edge) muestra «CL». No aparece «CL» en
  ningún lugar de la interfaz.

## Desplegar en GitHub Pages

1. Sube el repo a GitHub (rama `main`).
2. **Settings → Pages → Build and deployment → Deploy from a branch**, rama `main`, carpeta `/root`.
3. Abre `https://<usuario>.github.io/<repo>/`. Todo es estático, no hay build.
4. Para actualizar assets tras un cambio, sube la versión de `CACHE` en `sw.js`
   (por ejemplo `pictonaria-v2`) para invalidar la caché offline.

## Cómo agregar un mazo nuevo (sin tocar el código)

El esquema es extensible por diseño:

1. Añade el mazo en `DECKS` y su prefijo en `PREFIX_TO_DECK` dentro de `scripts/build_cards.py`,
   con `label`, `emoji`, `color` y `count`.
2. Agrega en el markdown una sección `# N. <EMOJI> TARJETAS <NOMBRE> — <n>` con sus tablas
   `| ID | Tarjeta | Dificultad |` (IDs con el prefijo elegido; opcionalmente subencabezados `##`
   para `category`).
3. Ejecuta `python3 scripts/build_cards.py`.

La app lee `decks` y `cards` desde el JSON: el nuevo mazo aparece solo en el selector, con su color y
contador, sin modificar `js/*`. Los mazos futuros previstos (Películas, Música, Deportes, Personajes,
Fantasía, Colegio, Trabajo, Humor, Chile avanzado, Familia, Extremadamente difícil) se agregan así,
manteniendo la colección base en 600 tarjetas.

## Duplicados encontrados

El markdown repite 19 textos con IDs distintos. **No se borró ni renumeró nada**: el JSON mantiene
las 600 tarjetas y las repeticiones llevan `duplicateOf` apuntando a la primera aparición. El mazo
activo las excluye por defecto (ajuste «Incluir tarjetas repetidas» desactivado). El autor puede
decidir reemplazarlas por tarjetas nuevas:

| ID repetido | Texto | Primera aparición | Texto original |
|---|---|---|---|
| I110 | Bicicleta | I053 | Bicicleta |
| I189 | Volar una cometa | I165 | Volar una cometa |
| I194 | Hacer un muñeco de nieve | I169 | Hacer un muñeco de nieve |
| A033 | Vacaciones | I174 | Vacaciones |
| A074 | Superhéroe | I121 | Superhéroe |
| A089 | Acampar | I164 | Acampar |
| M021 | Cumpleaños | I171 | Cumpleaños |
| M022 | Fiesta | I173 | Fiesta |
| M023 | Vacaciones | I174 | Vacaciones |
| M031 | Acampar | I164 | Acampar |
| M033 | Abrir un regalo | I182 | Abrir un regalo |
| M034 | Soplar las velas | I183 | Soplar las velas |
| M035 | Jugar en el parque | I185 | Jugar en el parque |
| M036 | Ir al supermercado | A012 | Ir al supermercado |
| D012 | Reunión familiar incómoda | A097 | Reunión familiar incómoda |
| D034 | Contraseña olvidada | A029 | Contraseña olvidada |
| D052 | Buscar señal de celular | M079 | Buscar señal de celular |
| D058 | Fin de mes | A094 | Fin de mes |
| D061 | Comer demasiado | M045 | Comer demasiado |

## Privacidad

Todo ocurre en el navegador. No hay backend, base de datos, login, CDNs, analítica ni tracking.
La única persistencia es `localStorage` (ajustes, tarjetas usadas y partida en curso).
