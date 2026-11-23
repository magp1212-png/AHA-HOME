"""Verificación facial del técnico: la foto con la cédula en el pecho contra el escaneo de la cara.

Se hace en nuestro propio servidor con modelos abiertos de OpenCV (YuNet para encontrar caras y SFace para
compararlas): las fotos no salen a ningún servicio externo. Los modelos se descargan con
`python descargar_modelos.py` y viven en backend/modelos (no van en git).

En la foto con la cédula suele haber dos caras: la de la persona (la grande) y la de la foto impresa en la
cédula (la pequeña). Se comparan las dos con el escaneo.
"""
from __future__ import annotations

import threading
from pathlib import Path

from . import config

DET = "face_detection_yunet_2023mar.onnx"
REC = "face_recognition_sface_2021dec.onnx"
UMBRAL = 0.363          # similitud coseno de SFace a partir de la cual es la misma persona
UMBRAL_CEDULA = 0.30    # la foto impresa de la cédula es pequeña y vieja: umbral algo más bajo, solo informativo
_lock = threading.Lock()
_modelos: tuple | None = None


def disponible() -> bool:
    try:
        import cv2  # noqa: F401
    except ImportError:
        return False
    return (config.MODELOS_DIR / DET).exists() and (config.MODELOS_DIR / REC).exists()


def _cargar():
    global _modelos
    if _modelos is None:
        import cv2
        det = cv2.FaceDetectorYN.create(str(config.MODELOS_DIR / DET), "", (320, 320), 0.8, 0.3, 5000)
        rec = cv2.FaceRecognizerSF.create(str(config.MODELOS_DIR / REC), "")
        _modelos = (det, rec)
    return _modelos


def _leer(ruta: Path):
    import cv2
    img = cv2.imread(str(ruta))
    if img is None:
        raise ValueError("No se pudo leer la foto")
    h, w = img.shape[:2]
    escala = 1280 / max(h, w)
    if escala < 1:
        img = cv2.resize(img, (int(w * escala), int(h * escala)))
    return img


def _caras(det, img):
    h, w = img.shape[:2]
    det.setInputSize((w, h))
    _, caras = det.detect(img)
    if caras is None:
        return []
    return sorted(caras, key=lambda c: c[2] * c[3], reverse=True)  # la más grande primero


def comparar(selfie_cedula: Path, escaneo: Path) -> dict:
    """Devuelve si la persona del escaneo es la misma de la foto con la cédula (y la de la cédula impresa)."""
    if not disponible():
        return {"disponible": False, "coincide": None, "motivo": "Verificación automática no disponible: la revisa la oficina."}
    import cv2
    with _lock:
        det, rec = _cargar()
        a, b = _leer(selfie_cedula), _leer(escaneo)
        ca, cb = _caras(det, a), _caras(det, b)
        if not ca:
            return {"disponible": True, "coincide": False, "caras_selfie": 0, "caras_escaneo": len(cb),
                    "motivo": "No se ve tu cara en la foto con la cédula. Repite la foto con buena luz."}
        if not cb:
            return {"disponible": True, "coincide": False, "caras_selfie": len(ca), "caras_escaneo": 0,
                    "motivo": "No se detectó tu cara en el escaneo. Mira de frente a la cámara."}
        if len(cb) > 1:
            return {"disponible": True, "coincide": False, "caras_selfie": len(ca), "caras_escaneo": len(cb),
                    "motivo": "En el escaneo aparece más de una persona. Repítelo solo."}
        fb = rec.feature(rec.alignCrop(b, cb[0]))
        persona = float(rec.match(rec.feature(rec.alignCrop(a, ca[0])), fb, cv2.FaceRecognizerSF_FR_COSINE))
        cedula = float(rec.match(rec.feature(rec.alignCrop(a, ca[1])), fb, cv2.FaceRecognizerSF_FR_COSINE)) if len(ca) > 1 else None
    coincide = persona >= UMBRAL
    return {
        "disponible": True, "coincide": coincide, "caras_selfie": len(ca), "caras_escaneo": len(cb),
        "similitud": round(persona, 3), "nivel": "alta" if persona >= 0.5 else "suficiente" if coincide else "no coincide",
        "cedula_visible": len(ca) > 1, "similitud_cedula": round(cedula, 3) if cedula is not None else None,
        "cedula_coincide": (cedula >= UMBRAL_CEDULA) if cedula is not None else None,
        "motivo": "La persona del escaneo es la misma de la foto con la cédula." if coincide
        else "La cara del escaneo no coincide con la de la foto con la cédula. Repite las dos fotos tú mismo.",
    }
