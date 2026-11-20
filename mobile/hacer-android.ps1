# AHA HOME para Android: build en la nube de EAS.
#   .\hacer-android.ps1            → APK para instalar directo en los teléfonos del piloto (perfil preview)
#   .\hacer-android.ps1 -Tienda    → paquete para Google Play y envío a la pista de pruebas internas
param([switch]$Tienda)
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$env:EXPO_TOKEN = (Get-Content "C:\Users\Administrator\APP FINANZAS\mobile\.expo-token.txt" -Raw).Trim()
$env:EAS_NO_VCS = "1"
$env:EAS_BUILD_NO_EXPO_GO_WARNING = "true"
Set-Location "C:\Users\Administrator\APP AHA HOME\mobile"
if ($Tienda) {
  npx -y eas-cli@latest build --platform android --profile production --auto-submit --no-wait
} else {
  npx -y eas-cli@latest build --platform android --profile preview --no-wait
}
