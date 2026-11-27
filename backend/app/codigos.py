"""Códigos únicos de cada registro (6 dígitos). El número nunca cambia ni se reutiliza (es el número interno del registro);
las letras dicen qué es: PRO mixto (conduce e instala) · TRA conductor · TEC técnico instalador · AYU ayudante · CLI cliente ·
VER verificación · DOC documento · FOR título o curso."""

DIGITOS = 6


def _c(letras: str, n: int) -> str:
    return f"{letras}-{n:0{DIGITOS}d}"


def profesional(t) -> str:
    if t.es_ayudante:
        letras = "AYU"
    elif t.conduce and t.instala:
        letras = "PRO"
    elif t.conduce:
        letras = "TRA"
    else:
        letras = "TEC"
    return _c(letras, t.id)


def cliente(u) -> str:
    return _c("CLI", u.id)


def verificacion(t) -> str:
    return _c("VER", t.id)


def documento(d) -> str:
    return _c("DOC", d.id)


def formacion(f) -> str:
    return _c("FOR", f.id)


def actividad_texto(t) -> str:
    """Tipo de perfil: Conductor, Técnico instalador o Mixto (las dos)."""
    if t.es_ayudante:
        return "Ayudante"
    return "Mixto" if t.conduce and t.instala else "Conductor" if t.conduce else "Técnico instalador"
