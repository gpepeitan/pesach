"""Phase-6 extended: deeper coverage of history stack counts, analytics keys,
PATCH canvas-objects (text label edit), and dev-login JWT shape."""
import os
import time
import pytest
import requests

API = (os.environ.get("REACT_APP_BACKEND_URL")
       or "https://ballroom-planner.preview.emergentagent.com").rstrip("/")
BASE = f"{API}/api"
RUN_ID = str(int(time.time()))


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/auth/dev-login", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "token" in body and isinstance(body["token"], str) and len(body["token"]) > 20
    return body["token"]


def hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# Verify history stack counts grow when we PATCH a table rotation
def test_history_stack_grows_after_patch(admin_token):
    tables = requests.get(f"{BASE}/tables", headers=hdr(admin_token), timeout=15).json()
    if not tables:
        pytest.skip("Need at least one table")
    t = tables[0]
    orig = t["rotation"]

    stack_before = requests.get(f"{BASE}/history/stack",
                                headers=hdr(admin_token), timeout=15).json()
    before_u = stack_before["undoAvailable"]

    requests.patch(f"{BASE}/tables/{t['id']}",
                   headers=hdr(admin_token),
                   json={"rotation": (orig + 12) % 360}, timeout=15)
    stack_after = requests.get(f"{BASE}/history/stack",
                               headers=hdr(admin_token), timeout=15).json()
    assert stack_after["undoAvailable"] >= before_u + 1, \
        f"expected undo stack to grow from {before_u}, got {stack_after['undoAvailable']}"

    # undo + restore
    requests.post(f"{BASE}/history/undo", headers=hdr(admin_token), timeout=15)
    requests.patch(f"{BASE}/tables/{t['id']}",
                   headers=hdr(admin_token), json={"rotation": orig}, timeout=15)


# Analytics shape — all 10 keys the UI expects
def test_analytics_full_key_coverage(admin_token):
    body = requests.get(f"{BASE}/analytics/summary",
                        headers=hdr(admin_token), timeout=15).json()
    # Backend currently exposes 'partialSubmissions' (not 'partiallySeatedSubmissions')
    required = [
        "totalSubmissions", "totalPeople", "seatedSubmissions",
        "unassignedSubmissions", "partialSubmissions",
        "tableCount", "totalCapacity", "tableUtilizationPct",
        "highChairsRequested", "activeConflicts",
    ]
    missing = [k for k in required if k not in body]
    assert not missing, f"Analytics missing keys: {missing}"


# Text label edit via PATCH /api/canvas-objects/{id}
def test_text_label_edit_persists(admin_token):
    balls = requests.get(f"{BASE}/ballrooms", headers=hdr(admin_token), timeout=15).json()
    if not balls:
        pytest.skip("No ballroom")
    br = balls[0]["id"]
    r = requests.post(f"{BASE}/canvas-objects", headers=hdr(admin_token),
                      json={"ballroomId": br, "objectType": "text",
                            "label": f"TEST_LABEL_{RUN_ID}",
                            "x": 10, "y": 10, "width": 80, "height": 24, "rotation": 0,
                            "properties": {"textContent": "orig"}},
                      timeout=15)
    assert r.status_code == 201, r.text
    obj_id = r.json()["id"]
    try:
        p = requests.patch(f"{BASE}/canvas-objects/{obj_id}",
                           headers=hdr(admin_token),
                           json={"properties": {"textContent": "edited"}},
                           timeout=15)
        assert p.status_code == 200, p.text
        body = p.json()
        # properties may be a JSON object
        assert (body.get("properties") or {}).get("textContent") == "edited"
    finally:
        requests.delete(f"{BASE}/canvas-objects/{obj_id}",
                        headers=hdr(admin_token), timeout=15)


# Conflicts endpoint shape — byTableId is a dict keyed by table id
def test_conflicts_grouping_shape(admin_token):
    body = requests.get(f"{BASE}/seating/conflicts",
                        headers=hdr(admin_token), timeout=15).json()
    assert isinstance(body["byTableId"], dict)
    assert isinstance(body["count"], int)
    assert body["count"] == len(body["conflicts"])
