"""Descarga los modelos abiertos de OpenCV para la verificación facial del técnico (YuNet + SFace, ~39 MB).

Uso:  python descargar_modelos.py      (los deja en backend/modelos; no van en git)
"""
import pathlib
import urllib.request

BASE = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/"
MODELOS = ["face_detection_yunet/face_detection_yunet_2023mar.onnx", "face_recognition_sface/face_recognition_sface_2021dec.onnx"]
destino = pathlib.Path(__file__).resolve().parent / "modelos"
destino.mkdir(exist_ok=True)
for m in MODELOS:
    archivo = destino / m.rsplit("/", 1)[1]
    if archivo.exists() and archivo.stat().st_size > 100_000:
        print("ya está", archivo.name)
        continue
    print("descargando", archivo.name)
    urllib.request.urlretrieve(BASE + m, archivo)
    if archivo.read_bytes()[:20].startswith(b"version https://git-lfs"):
        raise SystemExit(f"{archivo.name}: se descargó el puntero LFS, no el modelo")
print("listo")
