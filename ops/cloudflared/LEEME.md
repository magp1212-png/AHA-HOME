# Túnel de Cloudflare para AHA HOME (con token, desde el panel)

Así las direcciones de aha-go.com llegan al servidor sin abrir puertos.

1. Entra a **one.dash.cloudflare.com** → **Networks** → **Tunnels** → **Create a tunnel** → **Cloudflared**.
2. Nombre: `aha-home` → **Save tunnel**.
3. En la pantalla de instalación aparece un comando con un **token** largo (empieza con `eyJ`).
   **No instales el servicio que propone.** Copia solo el token y guárdalo en este servidor en:
   `C:\Users\Administrator\APP AHA HOME\ops\cloudflared\token.txt` (una sola línea, nada más).
4. **Next** → agrega las direcciones públicas (*Public hostnames*), todas hacia `http://127.0.0.1:8096`:
   | Subdominio | Dominio | Servicio |
   |---|---|---|
   | `superad` | `aha-go.com` | `HTTP` · `127.0.0.1:8096` |
   | `www` | `aha-go.com` | `HTTP` · `127.0.0.1:8096` |
   | `api-home` | `aha-go.com` | `HTTP` · `127.0.0.1:8096` |
5. Reinicia la tarea programada **aha home tunel** (o reinicia el servidor).

El archivo `token.txt` nunca va a GitHub. Si existe `token.txt`, la tarea usa este túnel; si no, usa `config.yml`
(túnel con nombre) o, si tampoco existe, un túnel temporal de prueba.

## En el servidor físico con Docker (`./instalar.sh`)

El instalador te pide el token del túnel y lo deja en `.env` (nunca va a GitHub). En el paso 4, las tres direcciones
(`superad`, `www` y `api-home` de `aha-go.com`) van hacia el servicio **`HTTP` · `api:8000`**.
