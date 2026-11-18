# Publicar AHA HOME en App Store y Google Play

Es el mismo procedimiento que se usa con anunciate: la misma empresa (**Onyxa LLC**), la misma cuenta de Apple (equipo `RBX8RRR6ZU`), la misma llave de App Store Connect y el mismo token de Expo. Todo se hace desde el servidor Windows.

## Una sola vez

1. **Carpeta del proyecto:** clona el repositorio en `C:\Users\Administrator\APP AHA HOME`. Es la ruta que usan los scripts.
2. **Expo:** en `mobile`, ejecuta `npx eas init`. Con eso se crea el proyecto en la misma cuenta de expo.dev.
   - Copia el `projectId` que aparece y guárdalo como `AHAHOME_EAS_PROJECT_ID`, o pégalo en `app.config.js` como en anunciate.
3. **Apple:**
   1. En **developer.apple.com → Identifiers**, crea el App ID `com.ahahome.app` y activa **Push Notifications**. La llave API no puede activarlo; se hace a mano, igual que en anunciate.
   2. En **App Store Connect → Apps → (+) Nueva app**, completa así:
      - **Nombre:** AHA HOME
      - **Idioma:** español
      - **Bundle ID:** `com.ahahome.app`
      - **SKU:** `ahahome`
   3. Copia el **Apple ID** numérico de la app y pégalo en `mobile/eas.json`, en `ascAppId`, donde hoy dice `PENDIENTE_ID_DE_AHA_HOME_EN_APP_STORE_CONNECT`.
4. **Google Play:**
   1. En **Play Console**, crea la app «AHA HOME» con el paquete `com.ahahome.app`.
   2. Para el push en Android, en **Firebase** agrega la app Android `com.ahahome.app`. Descarga `google-services.json` y súbelo a expo.dev como variable de archivo `GOOGLE_SERVICES_JSON`.
   3. Para el envío automático, guarda la cuenta de servicio de Google Play en `C:\Users\Administrator\claves-shaazan\google-play.json`.

## Cada versión

```powershell
cd "C:\Users\Administrator\APP AHA HOME\mobile"
.\hacer-iphone.ps1             # iPhone → TestFlight (y de ahí a revisión de Apple)
.\hacer-android.ps1            # APK para instalar directo en los teléfonos del piloto
.\hacer-android.ps1 -Tienda    # Google Play (pista de pruebas internas)
```

Antes de cada versión, sube `version`, `ios.buildNumber` y `android.versionCode` en `app.config.js`.

## Ficha de la tienda

- **Nombre:** AHA HOME
- **Subtítulo:** Entrega e instalación a domicilio
- **Categoría:** Estilo de vida (secundaria: Utilidades)
- **Palabras clave:** instalación, entrega, línea blanca, nevera, lavadora, aire acondicionado, Damasco, Caracas, técnico, mudanza
- **Descripción:**

> AHA HOME hace todo por ti: retiramos tu compra en la tienda, la llevamos a tu casa y, si lo pides, la sacamos de las cajas, la instalamos y nos llevamos el embalaje (cajas, anime, plásticos y flejes).
>
> • Sigue tu pedido en vivo: confirmado, en camino, entregado e instalado.
> • Por tu seguridad, ves la foto de tu técnico y de su ayudante antes de que lleguen. Todos están verificados por AHA HOME.
> • Elige el día y la hora, reprograma si lo necesitas y califica el servicio.
> • Para técnicos: órdenes del día, retiro con código QR, checklist digital y fotos de evidencia.
>
> Piloto en Tiendas Damasco San Martín, Caracas.

- **URL de privacidad:** `https://api.ahahome.app/legal/privacidad`
- **URL de soporte y de eliminación de cuenta:** `https://api.ahahome.app/cuenta/eliminar`
- **Edad:** 4+, sin contenido sensible.
- **Privacidad de la app** (formulario de Apple y sección «Seguridad de los datos» de Google):
  - Se recogen: nombre, correo, teléfono, foto, dirección, ubicación precisa (solo técnicos, mientras están en servicio) e identificadores de usuario.
  - Uso: funcionalidad de la app. Se vinculan a la identidad. No se usan para rastreo publicitario.
- **Cuenta de prueba para el revisor de Apple:**
  - Correo `maria@ahahome.test`, contraseña `aha12345`, en el servidor de producción.
  - Explica en las notas que la caja de Damasco crea los pedidos, y que el técnico entra con huella y PIN.
- **Capturas:** iPhone de 6,7" y 6,5", y teléfono Android. Se pueden sacar de la app web con Playwright, como en anunciate.
