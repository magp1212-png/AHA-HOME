# AHA HOME en un solo contenedor: el servidor (FastAPI) sirve también la web de la caja (www) y el panel (superad).
# Lo usa docker-compose.yml; se arma con ./instalar.sh.

# 1) La web (la misma app de React Native, exportada para navegador)
FROM node:22-slim AS web
WORKDIR /app/mobile
COPY mobile/package.json mobile/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY mobile/ ./
RUN npx expo export --platform web --output-dir dist-web

# 2) El servidor
FROM python:3.12-slim
WORKDIR /srv
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/descargar_modelos.py ./
RUN python descargar_modelos.py
COPY backend/app ./app
COPY backend/seed.py backend/crear_superadmin.py backend/crear_ceo.py ./
COPY --from=web /app/mobile/dist-web /srv/web
ENV AHAHOME_DATABASE_URL=sqlite:////datos/ahahome.db \
    AHAHOME_UPLOADS_DIR=/datos/uploads \
    AHAHOME_WEB_DIR=/srv/web
VOLUME ["/datos"]
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
