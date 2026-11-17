import pytest


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("POKER_DB_URL", f"sqlite:///{tmp_path / 'test.db'}")
    from app import db
    db.reset_engine()
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        yield c
    db.reset_engine()
