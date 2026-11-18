import os
import sys
import tempfile
import pathlib

_tmp = tempfile.mkdtemp()
os.environ["AHAHOME_DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["AHAHOME_UPLOADS_DIR"] = f"{_tmp}/uploads"
os.environ["AHAHOME_PUSH"] = "0"
os.environ["AHAHOME_PBKDF2_ITER"] = "1000"
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
import seed  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    seed.run()
    with TestClient(app) as c:
        yield c


def login(c, usuario, password="aha12345"):
    r = c.post("/auth/login", json={"usuario": usuario, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


def login_pin(c, telefono, pin="1234"):
    r = c.post("/auth/login-pin", json={"telefono": telefono, "pin": pin})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}
