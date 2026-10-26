# Presentación de Nexo

La portada pública `/` conserva su comprobación de sesión en el servidor, metadata, textos, acceso al panel, configuración inicial y enlace al catálogo. El panel y PrismaByte no utilizan el controlador de animación de la portada.

## Archivos

- `src/app/access-landing.tsx`: estructura de portada, fuente display local y acceso existente.
- `src/app/access-landing.module.css`: tokens, hero, navegación, cursor, progreso y preloader.
- `src/app/landing-story.tsx`: demostraciones, planes, preguntas frecuentes y documentos existentes.
- `src/app/landing-story.module.css`: capítulos editoriales y adaptación móvil.
- `src/app/landing-heading.tsx`: palabras visuales animables con una única etiqueta accesible para cada título.
- `src/app/use-landing-experience.ts`: Lenis, GSAP, ScrollTrigger y limpieza al desmontar.
- `src/app/landing-live-preview.tsx`: demostración autónoma de inventario de la portada; conserva pausa y pasos.
- `public/fonts/SpaceGroteskVariable.ttf`: fuente display, licencia en `SpaceGrotesk-LICENSE.txt`.

## Ajustes

Los colores heredan `--nexo-surface`, `--nexo-ink` y `--nexo-accent`. Para modificar exclusivamente la presentación, cambia `--landing-paper`, `--landing-ink` y `--landing-accent` en `.page`. La separación lateral utiliza `--landing-space`.

Los títulos usan Space Grotesk mediante `next/font/local`, variable `--nexo-display`; el texto mantiene Inter, variable global `--nexo-font`. La marca mantiene su tipografía y colores actuales.

`LANDING_MOTION` en el controlador concentra velocidades en segundos: `intro`, `reveal`, `stagger`, `smooth`, longitud del pin en pantallas (`pinScreens`) y desplazamiento máximo del imán (`magnet`, píxeles). El preloader dura 720 ms en total, definido por `loaderExit` en la hoja de portada. No bloquea interacción ni espera artificialmente una petición.

## Comportamiento

En escritorio con puntero fino se activa Lenis. El ticker de GSAP actualiza Lenis y sus eventos actualizan ScrollTrigger; no se crean dos bucles RAF. Los enlaces de sección conservan su fragmento y el teclado utiliza el comportamiento nativo.

La demostración de producto se fija solamente con al menos 1000 px de ancho y 800 px de alto. Su secuencia de nueve estados representa inventario, venta local y pedido online. Seleccionar un control manual conserva esa selección y libera la demostración del avance automático por scroll. Los dispositivos pequeños mantienen flujo natural y controles manuales.

Con `prefers-reduced-motion` no se cargan los motores de animación. Cambiar la preferencia desmonta las animaciones existentes, el cursor y Lenis. Las entradas utilizan exclusivamente transform y opacity. Las cifras son datos ilustrativos; no se crean pedidos ni se modifica stock real.

GSAP utiliza contextos y matchMedia; al abandonar la portada se eliminan triggers, pin, listeners, observadores y ticker. El cursor complementa el puntero nativo y no intercepta eventos.

## Validación pendiente en navegador

Verificar visualmente 360, 390, 768, 1024 y 1440 px; teclado completo; cambio de movimiento reducido durante la navegación; pin en ambas direcciones; navegación a términos y regreso; selectores y pausa manual de demos. Medir Lighthouse con compilación de producción y contexto móvil. El objetivo de 90+ no es una puntuación medida ni garantizada.
