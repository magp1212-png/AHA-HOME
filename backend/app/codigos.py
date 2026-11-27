"""Códigos únicos de cada registro. El número nunca cambia ni se reutiliza (es el número interno del registro);
las letras dicen qué es: PRO conduce e instala · TRA conduce · TEC instala · AYU ayudante · CLI cliente · VER verificación · DOC documento."""


def profesional(t) -> str:
    if t.es_ayudante:
        letras = "AYU"
    elif t.conduce and t.instala:
        letras = "PRO"
    elif t.conduce:
        letras = "TRA"
    else:
        letras = "TEC"
    return f"{letras}-{t.id:04d}"


def cliente(u) -> str:
    return f"CLI-{u.id:04d}"


def verificacion(t) -> str:
    return f"VER-{t.id:04d}"


def documento(d) -> str:
    return f"DOC-{d.id:04d}"


def actividad_texto(t) -> str:
    if t.es_ayudante:
        return "Ayudante"
    return "Conduce e instala" if t.conduce and t.instala else "Conduce" if t.conduce else "Instala"
