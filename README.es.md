# Call Metrics Logger

Una extensión liviana para el panel lateral de Chrome que permite registrar la actividad de un call center sin interrumpir el trabajo del asesor.

[Read in English](README.md)

Versión actual: `0.3.0`  
Plataforma: extensión de Chrome, Manifest V3

## El problema

Los asesores de un call center suelen tener que contar manualmente las llamadas y las visitas técnicas mientras atienden a los clientes. Una misma llamada puede incluir varias gestiones diferentes, como un reclamo técnico, el envío de una instalación, la reagenda de una visita o una transferencia hacia otro sector.

Llevar esos totales a mano desvía la atención de la conversación, dificulta representar llamadas con varias gestiones y genera errores de conteo evitables.

## La solución

Call Metrics Logger permanece disponible en el panel lateral del navegador y convierte cada llamada en un flujo breve y estructurado. El asesor puede agregar todas las gestiones que necesite, revisarlas y enviar la llamada una sola vez al finalizarla.

La extensión se encarga de:

- contabilizar una llamada terminada;
- calcular todas las visitas técnicas generadas durante esa llamada;
- separar visitas comunes, instalaciones y reagendas;
- registrar el destino de las transferencias sin contarlas como visitas;
- enviar el resultado consolidado a Supabase bajo el usuario autenticado;
- mantener disponibles localmente los contadores del día actual.

## Ecosistema del producto

Call Metrics Logger es la extensión de carga que acompaña a la [aplicación web Call Metrics](https://call-metrics.netlify.app). La aplicación web permite registrar usuarios y visualizar las métricas obtenidas, mientras que la extensión ayuda a los asesores a registrar cada llamada directamente desde su flujo de trabajo en el navegador.

## Funciones principales

- Autenticación por email y contraseña con renovación automática de la sesión.
- Varias gestiones dentro de una misma llamada.
- Reclamos técnicos (`RT`) con solución online y sin solución online.
- Reclamos administrativos (`RA`), solicitudes técnicas (`ST`) y sugerencias (`SU`).
- Conteo separado de visitas comunes, instalaciones y reagendas.
- Transferencias a Comercial, Retención u Otra, limitadas a una por llamada.
- Contadores diarios de llamadas, visitas totales, instalaciones y reagendas.
- Campos del cliente bloqueables y acciones para copiar con un clic.
- Bloc de notas persistente e independiente de la llamada en curso.
- Eliminación de gestiones individuales antes de enviar la llamada.
- Opción para deshacer la última llamada enviada.
- Validación de la versión mínima mediante un registro remoto en `extension_config`.

## Reglas de conteo

Cada envío suma exactamente una llamada. El total de visitas se calcula a partir de todas las gestiones asociadas a esa llamada.

| Gestión | Resultado | Visitas totales | Categoría de visita |
| --- | --- | ---: | --- |
| `RT` | Solución online | 0 | Ninguna |
| `RT` | Ticket | 0 | Ninguna |
| `RT` | Agrego observación | 0 | Ninguna |
| `RT` | Visita técnica | 1 | Visita común |
| `ST` | Con envío de instalación | 1 | Instalación |
| `ST` | Sin envío de instalación | 0 | Ninguna |
| Reagenda de VT | Guardada | 1 | Reagenda |
| Transferencia | Comercial, Retención u Otra | 0 | Ninguna |
| `RA` / `SU` | Guardada | 0 | Ninguna |

Por ejemplo, una llamada que contiene dos visitas técnicas comunes y una instalación se guarda como una llamada y tres visitas totales: dos visitas comunes y una instalación.

## Cómo funciona

1. El asesor inicia sesión con una cuenta creada desde la aplicación principal de métricas.
2. Puede ingresar, bloquear y copiar los datos auxiliares del cliente.
3. Agrega una o más gestiones a la llamada en curso.
4. Al seleccionar **Terminar llamada**, la extensión calcula los totales e inserta un registro consolidado en Supabase.
5. El panel actualiza inmediatamente los contadores locales del día.

El registro de Supabase incluye la fecha de trabajo, los totales de visitas por categoría y la información de transferencia. Los campos auxiliares del cliente y las notas del asesor no se envían a `call_records`.

## Datos locales y privacidad

La extensión utiliza `chrome.storage.local` para conservar:

- la sesión autenticada de Supabase;
- los contadores y detalles de llamadas terminadas, agrupados por asesor y fecha local;
- el borrador de notas del asesor.

Los registros locales de llamadas y métricas con más de 10 días de antigüedad se eliminan automáticamente. Cada nueva fecha del calendario comienza un conjunto separado de contadores diarios. Las notas permanecen disponibles hasta que el asesor las borra y no se eliminan al terminar una llamada.

El nombre, número de cliente y DNI son datos auxiliares para el flujo de trabajo. Pueden estar presentes en el historial local temporal de llamadas terminadas, pero no forman parte del payload enviado a Supabase.

## Tecnología

- HTML, CSS y JavaScript sin frameworks
- Chrome Extensions Manifest V3
- APIs de Side Panel y Storage de Chrome
- Supabase Auth
- API PostgREST de Supabase con Row Level Security

El proyecto no necesita compilación ni dependencias de ejecución de terceros. Todo el código ejecutable de la extensión se incluye localmente en el paquete.

## Instalación

[Instalar Call Metrics Logger desde Chrome Web Store](https://chromewebstore.google.com/detail/lckloimobkmdjojciamcoodbmdgenobn?utm_source=item-share-cb)

Luego de instalarla, abrí la extensión desde su ícono e iniciá sesión con una cuenta creada en la [aplicación web Call Metrics](https://call-metrics.netlify.app).

## Desarrollo local

1. Cloná o descargá este repositorio.
2. Abrí `chrome://extensions` en Google Chrome.
3. Activá el **Modo de desarrollador**.
4. Seleccioná **Cargar extensión sin empaquetar**.
5. Elegí la carpeta del proyecto que contiene `manifest.json`.
6. Abrí la extensión desde su ícono e iniciá sesión.

El proyecto de Supabase debe contar previamente con las tablas `call_records` y `extension_config`, junto con sus políticas y permisos. El registro de usuarios se realiza intencionalmente desde la aplicación principal de métricas, no desde esta extensión.

## Compatibilidad

La versión actual está orientada a Google Chrome y a navegadores que implementen una API `chrome.sidePanel` compatible. Las APIs de panel lateral no están unificadas entre todos los navegadores, por lo que el funcionamiento en Opera GX, Firefox y Safari no está garantizado actualmente.

## Estructura del proyecto

```text
.
|-- manifest.json       Metadatos y permisos de la extensión
|-- background.js       Activación del panel lateral
|-- sidepanel.html      Interfaz de la aplicación
|-- sidepanel.css       Diseño visual y adaptación de tamaños
`-- sidepanel.js        Autenticación, formulario, conteo, almacenamiento y API
```

## Estado del proyecto

Call Metrics Logger es una herramienta interna de productividad en desarrollo activo. La versión `0.3.0` incorpora el registro de transferencias y el control de versión mínima, conservando el modelo de múltiples visitas por llamada introducido en la versión anterior.
