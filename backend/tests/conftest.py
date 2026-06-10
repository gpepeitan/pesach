import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://seder-seat-mgmt.preview.emergentagent.com").rstrip("/")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "Eitanp")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Gpepeitan!23")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(api_client):
    r = api_client.post(f"{BASE_URL}/api/auth/login",
                        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def unique_invoice():
    return f"TEST-INV-{int(time.time())}"
