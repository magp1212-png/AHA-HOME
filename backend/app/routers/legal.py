"""Páginas públicas que piden Apple y Google: términos, privacidad y eliminación de la cuenta.

/legal/terminos, /legal/privacidad y /cuenta/eliminar. Los datos marcados [ENTRE CORCHETES] los completa
el dueño, y conviene que un abogado venezolano revise el texto final.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user
from ..models import Notificacion, Orden, User
from ..security import verify_password

router = APIRouter(tags=["legal"])

ACTUALIZADO = "18 de noviembre de 2026"
EMPRESA = "Onyxa LLC"
CONTACTO = "contacto@aha-go.com"

TERMINOS = f"""
<h1>Términos de uso</h1>
<p class="meta">AHA HOME · Hacemos todo por ti · Última actualización: {ACTUALIZADO}</p>
<h2>1. Qué es AHA HOME</h2>
<p>AHA HOME, prestado por {EMPRESA}, retira en la tienda aliada (Tiendas Damasco) los artículos que compraste, los traslada a
tu domicilio y, si lo pides y pagas en caja, los desembala, instala y, si lo deseas, retira el embalaje para reciclar (cajas, anime, plásticos, flejes y precintos). El retiro es opcional: puedes quedarte con la caja y el empaque si la garantía del fabricante lo requiere.</p>
<h2>2. Tipos de servicio</h2>
<ul><li><b>Traslado:</b> se entrega tal cual sale de la tienda, en su empaque original, sin abrirlo.</li>
<li><b>Instalación:</b> la cuadrilla instala en tu domicilio artículos que ya tienes.</li>
<li><b>Traslado e instalación:</b> todo lo anterior. Solo se instalan los artículos que marcaste y pagaste en caja.</li></ul>
<h2>3. Tu cuenta</h2>
<p>Te registras con tu foto, nombre, cédula, teléfono y correo. Debes verificar tu correo en 24 horas; si no, el registro se elimina.
Debes dar datos verdaderos y cuidar tu contraseña.</p>
<h2>4. Seguridad</h2>
<p>Cada técnico y ayudante está registrado y verificado por AHA HOME. Antes de que la cuadrilla llegue verás su foto y su nombre en la app.
El retiro en tienda queda registrado con código QR (quién, qué, a qué hora).</p>
<h2>5. Citas, cambios y cancelaciones</h2>
<p>Puedes reprogramar o cancelar desde la app antes de que la cuadrilla salga. Si pagaste una instalación y cancelas, el reembolso se gestiona
en la tienda donde pagaste.</p>
<h2>6. Responsabilidad</h2>
<p>Al recibir, revisa el estado del artículo y del trabajo; la cuadrilla toma fotos de evidencia al cerrar. Los reclamos por la instalación se
reciben dentro de los 7 días siguientes en {CONTACTO}. La garantía del artículo es la del fabricante y la tienda.</p>
<h2>7. Contacto</h2><p>{CONTACTO}</p>
"""

PRIVACIDAD = f"""
<h1>Política de privacidad</h1>
<p class="meta">AHA HOME · Última actualización: {ACTUALIZADO}</p>
<h2>Qué datos usamos</h2>
<ul><li><b>Clientes:</b> foto, nombre, cédula, teléfono, correo, dirección de entrega, artículos comprados, citas y calificaciones.</li>
<li><b>Técnicos y ayudantes:</b> datos personales, foto, cédula, licencia y documentos del vehículo (expediente), escaneo facial y foto con la cédula,
la confirmación de que registraron su huella (la huella <b>nunca</b> sale del teléfono) y su ubicación GPS <b>solo mientras van en ruta o están en
servicio</b>.</li></ul>
<h2>Para qué</h2>
<p>Para prestar el servicio, asignar la cuadrilla más cercana, dar seguridad al cliente (foto de la cuadrilla), registrar el retiro en tienda,
enviar avisos (notificaciones y correo) y mejorar la calidad (calificaciones y reseñas).</p>
<h2>Con quién se comparten</h2>
<p>Con la tienda aliada donde compraste (datos de la orden) y con la cuadrilla asignada (nombre, teléfono y dirección de la entrega). El cliente solo
ve la foto y el nombre de la cuadrilla. No vendemos tus datos. Usamos proveedores para alojar el servicio, enviar correos y notificaciones.</p>
<h2>Cuánto tiempo</h2>
<p>Mientras tengas cuenta. Los registros de las órdenes se conservan para auditoría y garantía, sin vincularlos a tu cuenta si la eliminas.</p>
<h2>Tus derechos</h2>
<p>Puedes ver y corregir tus datos, y <b>eliminar tu cuenta</b> desde la app (Mi cuenta › Eliminar mi cuenta) o en
<a href="/cuenta/eliminar">/cuenta/eliminar</a>. Escríbenos a {CONTACTO}.</p>
"""

ESTILO = """<style>body{margin:0;font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#F4F7FB;color:#1A1C3D}
main{max-width:720px;margin:0 auto;padding:24px 16px 60px;line-height:1.55}header{background:#21244D;color:#fff;padding:18px 16px}
header b{font-size:20px;letter-spacing:1px}header span{color:#CFD72A;display:block;font-weight:700}.meta{color:#4A5568}
input,button{font:inherit;width:100%;box-sizing:border-box;height:48px;border-radius:12px;margin:6px 0}input{border:1px solid #CBD5E1;padding:0 12px}
button{border:none;background:#B42318;color:#fff;font-weight:800}</style>"""


def pagina(titulo: str, cuerpo: str) -> HTMLResponse:
    return HTMLResponse(f'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
                        f'<title>{titulo} · AHA HOME</title>{ESTILO}</head><body><header><b>AHA HOME</b><span>Hacemos todo por ti</span></header>'
                        f'<main>{cuerpo}</main></body></html>')


@router.get("/legal/terminos", response_class=HTMLResponse)
def terminos():
    return pagina("Términos de uso", TERMINOS)


@router.get("/legal/privacidad", response_class=HTMLResponse)
def privacidad():
    return pagina("Privacidad", PRIVACIDAD)


def eliminar_cuenta(db: Session, u: User) -> None:
    """Clientes: se borran sus datos; sus órdenes quedan para auditoría, desvinculadas. Personal: se desactiva."""
    if u.rol == "cliente":
        for o in db.scalars(select(Orden).where(Orden.cliente_id == u.id)):
            o.cliente_id = None
        for n in db.scalars(select(Notificacion).where(Notificacion.user_id == u.id)):
            db.delete(n)
        db.delete(u)
    else:
        u.activo, u.push_token = False, None
    db.commit()


@router.post("/yo/eliminar")
def eliminar_desde_app(user: User = Depends(current_user), db: Session = Depends(get_db)):
    eliminar_cuenta(db, user)
    return {"ok": True}


class Credenciales(BaseModel):
    usuario: str
    password: str


@router.post("/cuenta/eliminar")
def eliminar_desde_web(body: Credenciales, db: Session = Depends(get_db)):
    from .auth import limpiar_tel
    ident = body.usuario.strip().lower()
    u = db.scalar(select(User).where(or_(User.email == ident, User.telefono == limpiar_tel(ident))))
    if not u or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Datos incorrectos")
    eliminar_cuenta(db, u)
    return {"ok": True}


@router.get("/cuenta/eliminar", response_class=HTMLResponse)
def formulario_eliminar():
    return pagina("Eliminar mi cuenta", """<h1>Eliminar mi cuenta</h1>
<p>Escribe tu teléfono o correo y tu contraseña. Tus datos se borran de AHA HOME; esto no se puede deshacer.</p>
<form id="f" onsubmit="event.preventDefault();enviar()"><input id="u" placeholder="Teléfono o correo" required>
<input id="p" type="password" placeholder="Contraseña" required><button>Eliminar mi cuenta</button><p id="m"></p></form>
<script>async function enviar(){const r=await fetch('/cuenta/eliminar',{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({usuario:document.getElementById('u').value,password:document.getElementById('p').value})});
document.getElementById(r.ok?'f':'m').innerHTML=r.ok?'<h2>Cuenta eliminada</h2><p>Tus datos se borraron de AHA HOME.</p>':'Datos incorrectos.'}</script>""")
