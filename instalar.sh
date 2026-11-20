#!/usr/bin/env bash
# Instalador de AHA HOME para tu servidor físico (Linux o Mac).
# Uso:  ./instalar.sh
# Te pide: la clave SMTP de Brevo y el token del túnel de Cloudflare. Nada de eso sale de esta máquina.
set -euo pipefail
cd "$(dirname "$0")"

echo "== AHA HOME · instalación del servidor =="
if ! command -v docker >/dev/null 2>&1; then
  echo "Falta Docker. Instálalo primero:"
  echo "  Linux:  curl -fsSL https://get.docker.com | sh"
  echo "  Mac:    instala Docker Desktop desde https://www.docker.com/products/docker-desktop/"
  exit 1
fi
mkdir -p datos

# 1. Configuración (.env) con una clave secreta aleatoria
if [ ! -f .env ]; then
  read -rp "Dirección pública del servidor [https://api.ahahome.app]: " PUB
  PUB=${PUB:-https://api.ahahome.app}
  SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '/+=\n' | head -c 64)
  printf 'AHAHOME_JWT_SECRET=%s\nAHAHOME_PUBLIC_URL=%s\nCLOUDFLARE_TUNNEL_TOKEN=\n' "$SECRET" "$PUB" > .env
  chmod 600 .env
  echo "✓ .env creado"
fi

# 2. Correo (Brevo)
if [ ! -f datos/correo.key ]; then
  echo
  echo "Correo de verificación (Brevo → SMTP y API → pestaña SMTP). Deja vacío para configurarlo después."
  read -rp "  Usuario SMTP (ej. xxxx@smtp-brevo.com): " SMTP_USER
  if [ -n "$SMTP_USER" ]; then
    read -rsp "  Clave SMTP (no se muestra): " SMTP_PASS; echo
    read -rp "  Remitente [AHA HOME <no-responder@ahahome.app>]: " SMTP_FROM
    SMTP_FROM=${SMTP_FROM:-AHA HOME <no-responder@ahahome.app>}
    python3 - "$SMTP_USER" "$SMTP_PASS" "$SMTP_FROM" <<'PY'
import json, sys
u, p, f = sys.argv[1:4]
json.dump({"host": "smtp-relay.brevo.com", "port": 587, "user": u, "password": p, "from": f, "domain": "ahahome.app"},
          open("datos/correo.key", "w"))
PY
    chmod 600 datos/correo.key
    echo "✓ Correo configurado"
  fi
fi

# 3. Túnel de Cloudflare (HTTPS sin abrir puertos del router)
if ! grep -q '^CLOUDFLARE_TUNNEL_TOKEN=.\+' .env; then
  echo
  echo "Túnel de Cloudflare (Zero Trust → Networks → Tunnels → Create → Cloudflared → copia el token)."
  read -rsp "  Token del túnel (no se muestra; vacío = después): " TOKEN; echo
  if [ -n "$TOKEN" ]; then
    sed -i.bak "s|^CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=$TOKEN|" .env && rm -f .env.bak
    echo "✓ Túnel configurado"
  fi
fi

# 4. Levantar todo
PERFIL=""
grep -q '^CLOUDFLARE_TUNNEL_TOKEN=.\+' .env && PERFIL="--profile tunel"
docker compose $PERFIL up -d --build
sleep 4
curl -fsS http://127.0.0.1:8000/salud && echo && echo "✓ Servidor funcionando"

# 5. Superadministrador real (solo la primera vez)
if [ ! -f datos/.superadmin-listo ]; then
  echo
  echo "Crea el usuario superadministrador:"
  docker compose exec api python crear_superadmin.py && touch datos/.superadmin-listo
fi

echo
echo "Listo. En Cloudflare, en el túnel, agrega el «Public Hostname»:  api.ahahome.app  →  http://api:8000"
echo "Respaldos: copia la carpeta ./datos."
