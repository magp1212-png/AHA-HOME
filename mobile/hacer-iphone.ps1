# AHA HOME para iPhone: build en la nube de EAS y envío automático a TestFlight (igual que anunciate).
# Usa la misma llave de App Store Connect y el mismo token de Expo. Responde "Y" (Enter) a lo que pregunte.
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$env:EXPO_TOKEN = (Get-Content "C:\Users\Administrator\APP FINANZAS\mobile\.expo-token.txt" -Raw).Trim()
$env:EAS_NO_VCS = "1"
$env:EAS_BUILD_NO_EXPO_GO_WARNING = "true"
$env:EXPO_ASC_API_KEY_PATH = "C:\Users\Administrator\claves-shaazan\AuthKey_9P62M8G5VW.p8"
$env:EXPO_ASC_KEY_ID = "9P62M8G5VW"
$env:EXPO_ASC_ISSUER_ID = "b60083c7-e800-4d87-be6c-52a4b53b2df5"
$env:EXPO_APPLE_TEAM_ID = "RBX8RRR6ZU"
$env:EXPO_APPLE_TEAM_TYPE = "INDIVIDUAL"
# Push Notifications se activa a mano en developer.apple.com (la llave API no puede hacerlo)
$env:EXPO_NO_CAPABILITY_SYNC = "1"
Set-Location "C:\Users\Administrator\APP AHA HOME\mobile"
npx -y eas-cli@latest build --platform ios --profile production --auto-submit --no-wait
