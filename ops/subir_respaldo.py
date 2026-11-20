"""Uploads a backup file to Cloudflare R2 (S3-compatible) so a copy survives if this server dies.

Credentials live in ops/r2.json (never in the code):
  {"account_id": "...", "access_key_id": "...", "secret_access_key": "...", "bucket": "anunciate-respaldos"}  (AHA HOME puede usar el mismo: copia ops\r2.json de anunciate; sus archivos van bajo ahahome/)
Without that file it does nothing and says so. Signs requests with AWS Signature V4 (no extra packages).
"""
import datetime as dt
import email.utils
import hashlib
import hmac
import json
import pathlib
import urllib.error
import urllib.request

CRED = pathlib.Path(__file__).resolve().parent / "r2.json"
# R2 is free up to 10 GB. The bucket deletes objects after 30 days, so 30 copies at most:
# refusing files over 250 MB keeps the total under 7.5 GB and the bill at $0.
MAX_BYTES = 250 * 1024 * 1024


def _sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()


def _now(host: str) -> dt.datetime:
    """R2 rejects signatures more than 15 minutes off. This server's clock has been seen 4 hours
    ahead (wrong time zone), so the time comes from R2's own Date header."""
    try:
        req = urllib.request.Request(f"https://{host}/", method="HEAD")
        try:
            date = urllib.request.urlopen(req, timeout=20).headers["Date"]
        except urllib.error.HTTPError as e:  # an unsigned request is refused, but still carries Date
            date = e.headers["Date"]
        return email.utils.parsedate_to_datetime(date)
    except Exception:
        return dt.datetime.now(dt.timezone.utc)


def upload(path: pathlib.Path, key: str | None = None) -> str:
    if not CRED.exists():
        return "R2 sin configurar (falta ops/r2.json): el respaldo quedó solo en este servidor."
    size = path.stat().st_size
    if size > MAX_BYTES:
        return f"NO subido a R2: {size // (1024 * 1024)} MB supera el tope de 250 MB (para no salir del plan gratis)."
    c = json.loads(CRED.read_text(encoding="utf-8"))
    host = f"{c['account_id']}.r2.cloudflarestorage.com"
    key = key or path.name
    uri = f"/{c['bucket']}/{key}"
    body = path.read_bytes()
    payload_hash = hashlib.sha256(body).hexdigest()
    now = _now(host)
    amz_date, day = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
    headers = {"host": host, "x-amz-content-sha256": payload_hash, "x-amz-date": amz_date}
    signed = ";".join(sorted(headers))
    canonical = "\n".join(["PUT", uri, "", "".join(f"{k}:{headers[k]}\n" for k in sorted(headers)), signed, payload_hash])
    scope = f"{day}/auto/s3/aws4_request"
    to_sign = "\n".join(["AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical.encode()).hexdigest()])
    k = _sign(_sign(_sign(_sign(("AWS4" + c["secret_access_key"]).encode(), day), "auto"), "s3"), "aws4_request")
    sig = hmac.new(k, to_sign.encode(), hashlib.sha256).hexdigest()
    auth = f"AWS4-HMAC-SHA256 Credential={c['access_key_id']}/{scope}, SignedHeaders={signed}, Signature={sig}"
    req = urllib.request.Request(f"https://{host}{uri}", data=body, method="PUT",
                                 headers={**{k2: v for k2, v in headers.items() if k2 != "host"}, "Authorization": auth})
    with urllib.request.urlopen(req, timeout=120) as r:
        return f"subido a R2 ({r.status}): {key}"


if __name__ == "__main__":
    import sys
    print(upload(pathlib.Path(sys.argv[1])))
