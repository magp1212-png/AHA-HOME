// AHA HOME · Hacemos todo por ti
// Misma forma de publicar que anunciate (Onyxa LLC): EAS en la nube, TestFlight y Google Play.
// AHAHOME_API_URL apunta la app al servidor (en la nube o en tu servidor físico): cámbialo aquí o al compilar.
module.exports = () => ({
  expo: {
    name: "AHA HOME",
    slug: "aha-home",
    scheme: "ahahome",
    version: "1.0.1",
    orientation: "portrait",
    userInterfaceStyle: "light",
    icon: "./assets/icon.png",
    splash: { image: "./assets/splash.png", resizeMode: "cover", backgroundColor: "#21244D" },
    ios: {
      bundleIdentifier: "com.ahahome.app",
      buildNumber: "1",
      appleTeamId: "RBX8RRR6ZU",  // el mismo equipo de Apple de anunciate
      supportsTablet: true,  // la caja Damasco usa tablet
      config: { usesNonExemptEncryption: false },
      infoPlist: {
        NSCameraUsageDescription: "AHA HOME usa la cámara para leer el QR de retiro en el almacén y tomar las fotos de evidencia.",
        NSFaceIDUsageDescription: "AHA HOME usa Face ID para confirmar que eres tú antes de retirar un equipo.",
      },
    },
    android: {
      package: "com.ahahome.app",
      versionCode: 1,
      adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#21244D" },
      permissions: ["CAMERA", "USE_BIOMETRIC", "USE_FINGERPRINT", "ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
      // Firebase (FCM) para el push en Android, igual que anunciate: en EAS viene de la variable de archivo
      // GOOGLE_SERVICES_JSON (se sube en expo.dev); en local, de ./google-services.json si existe.
      ...(process.env.GOOGLE_SERVICES_JSON || require("fs").existsSync(__dirname + "/google-services.json")
        ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./google-services.json" }
        : {}),
    },
    web: { bundler: "metro", favicon: "./assets/icon.png" },
    plugins: [
      "./plugins/with-ios-scenes",  // iOS 27 cierra las apps que no usan escenas (lo mismo que en anunciate)
      ["expo-camera", { cameraPermission: "AHA HOME usa la cámara para leer el QR de retiro y tomar las fotos de evidencia." }],
      ["expo-image-picker", {
        photosPermission: "AHA HOME usa tus fotos para la factura y las evidencias del servicio.",
        cameraPermission: "AHA HOME usa la cámara para tu registro (rostro y cédula) y las evidencias del servicio.",
      }],
      ["expo-local-authentication", { faceIDPermission: "AHA HOME usa Face ID para confirmar que eres tú antes de retirar un equipo." }],
      ["expo-notifications", { color: "#21244D" }],
      ["expo-location", { locationWhenInUsePermission: "AHA HOME usa tu ubicación mientras vas en ruta para que el cliente y tu supervisor sigan el servicio en el mapa." }],
    ],
    extra: {
      apiUrl: process.env.AHAHOME_API_URL || "http://127.0.0.1:8000",
      // Proyecto en expo.dev (necesario para compilar con EAS y para las notificaciones push).
      // Se obtiene con «npx eas init» y se pega aquí o en la variable AHAHOME_EAS_PROJECT_ID.
      ...(process.env.AHAHOME_EAS_PROJECT_ID ? { eas: { projectId: process.env.AHAHOME_EAS_PROJECT_ID } } : {}),
    },
  },
});
