// AHA HOME · Hacemos todo por ti
// AHAHOME_API_URL apunta la app al servidor (en la nube o en tu servidor físico): cámbialo aquí o al compilar.
module.exports = () => ({
  expo: {
    name: "AHA HOME",
    slug: "aha-home",
    scheme: "ahahome",
    version: "0.1.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    ios: {
      bundleIdentifier: "app.ahahome.cliente",
      buildNumber: "1",
      supportsTablet: true,  // la caja Damasco usa tablet
      config: { usesNonExemptEncryption: false },
      infoPlist: {
        NSCameraUsageDescription: "AHA HOME usa la cámara para leer el QR de retiro en el almacén y tomar las fotos de evidencia.",
        NSFaceIDUsageDescription: "AHA HOME usa Face ID para confirmar que eres tú antes de retirar un equipo.",
      },
    },
    android: {
      package: "app.ahahome.cliente",
      versionCode: 1,
      permissions: ["CAMERA", "USE_BIOMETRIC", "USE_FINGERPRINT"],
    },
    web: { bundler: "metro" },
    plugins: [
      ["expo-camera", { cameraPermission: "AHA HOME usa la cámara para leer el QR de retiro y tomar las fotos de evidencia." }],
      ["expo-image-picker", {
        photosPermission: "AHA HOME usa tus fotos para la factura y las evidencias del servicio.",
        cameraPermission: "AHA HOME usa la cámara para tu registro (rostro y cédula) y las evidencias del servicio.",
      }],
      ["expo-local-authentication", { faceIDPermission: "AHA HOME usa Face ID para confirmar que eres tú antes de retirar un equipo." }],
      ["expo-notifications", { color: "#21244D" }],
    ],
    extra: {
      apiUrl: process.env.AHAHOME_API_URL || "http://127.0.0.1:8000",
    },
  },
});
