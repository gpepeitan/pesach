"""Phase-6 backend regression: undo/redo, conflicts, analytics, text/line, family-move."""
import os
import time
import json
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
    return r.json()["token"]


def hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ─── Undo / Redo ──────────────────────────────────────────────────────────────
def test_history_stack_endpoint(admin_token):
    r = requests.get(f"{BASE}/history/stack", headers=hdr(admin_token), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "undoAvailable" in body
    assert "redoAvailable" in body


def test_undo_redo_table_rotation_roundtrip(admin_token):
    tables = requests.get(f"{BASE}/tables", headers=hdr(admin_token), timeout=15).json()
    assert tables, "Need at least one table to test undo/redo"
    t = tables[0]
    original = t["rotation"]
    new_rot = (original + 30) % 360
    r = requests.patch(f"{BASE}/tables/{t['id']}",
                       headers=hdr(admin_token), json={"rotation": new_rot}, timeout=15)
    assert r.status_code == 200
    assert abs(r.json()["rotation"] - new_rot) < 0.01

    # Undo
    u = requests.post(f"{BASE}/history/undo", headers=hdr(admin_token), timeout=15).json()
    assert u.get("ok") is True
    t_after = requests.get(f"{BASE}/tables", headers=hdr(admin_token), timeout=15).json()
    rotated_back = [x for x in t_after if x["id"] == t["id"]][0]
    assert abs(rotated_back["rotation"] - original) < 0.01

    # Redo
    requests.post(f"{BASE}/history/redo", headers=hdr(admin_token), timeout=15)
    t_after = requests.get(f"{BASE}/tables", headers=hdr(admin_token), timeout=15).json()
    rotated_fwd = [x for x in t_after if x["id"] == t["id"]][0]
    assert abs(rotated_fwd["rotation"] - new_rot) < 0.01

    # Cleanup: restore original
    requests.patch(f"{BASE}/tables/{t['id']}",
                   headers=hdr(admin_token), json={"rotation": original}, timeout=15)


# ─── Conflict Detection ───────────────────────────────────────────────────────
def test_conflicts_endpoint_returns_byTableId_map(admin_token):
    r = requests.get(f"{BASE}/seating/conflicts", headers=hdr(admin_token), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "conflicts" in body and "byTableId" in body and "count" in body
    assert isinstance(body["conflicts"], list)


# ─── Analytics ────────────────────────────────────────────────────────────────
def test_analytics_summary_shape(admin_token):
    r = requests.get(f"{BASE}/analytics/summary", headers=hdr(admin_token), timeout=15)
    assert r.status_code == 200
    body = r.json()
    for key in ("totalSubmissions", "totalPeople", "seatedSubmissions",
                "tableCount", "totalCapacity", "tableUtilizationPct",
                "highChairsRequested", "activeConflicts"):
        assert key in body, f"missing analytics key: {key}"
    assert isinstance(body["totalCapacity"], int)


# ─── Text + Line canvas objects ───────────────────────────────────────────────
def test_create_text_label_object(admin_token):
    balls = requests.get(f"{BASE}/ballrooms", headers=hdr(admin_token), timeout=15).json()
    assert balls, "Need a ballroom"
    br = balls[0]["id"]
    r = requests.post(f"{BASE}/canvas-objects", headers=hdr(admin_token),
                      json={
                          "ballroomId": br, "objectType": "text",
                          "label": f"TEST_TXT_{RUN_ID}",
                          "x": 50, "y": 50, "width": 100, "height": 30, "rotation": 0,
                          "properties": {"fontSize": 14, "textContent": f"hello-{RUN_ID}"},
                      }, timeout=15)
    assert r.status_code == 201, r.text
    obj_id = r.json()["id"]
    # cleanup
    requests.delete(f"{BASE}/canvas-objects/{obj_id}", headers=hdr(admin_token), timeout=15)


def test_create_line_divider_object(admin_token):
    balls = requests.get(f"{BASE}/ballrooms", headers=hdr(admin_token), timeout=15).json()
    br = balls[0]["id"]
    r = requests.post(f"{BASE}/canvas-objects", headers=hdr(admin_token),
                      json={
                          "ballroomId": br, "objectType": "line",
                          "label": None, "x": 100, "y": 100,
                          "width": 200, "height": 6, "rotation": 0,
                      }, timeout=15)
    assert r.status_code == 201, r.text
    obj_id = r.json()["id"]
    requests.delete(f"{BASE}/canvas-objects/{obj_id}", headers=hdr(admin_token), timeout=15)


# ─── Guest update with invoiceNumber + seatingPreferences ─────────────────────
def test_guest_patch_invoice_and_prefs(admin_token):
    # find any guest
    gs = requests.get(f"{BASE}/guests", headers=hdr(admin_token), timeout=15).json()
    if not gs:
        pytest.skip("No guests in DB")
    g = gs[0]
    orig_inv = g["invoiceNumber"]
    orig_prefs = list(g["seatingPreferences"] or [])
    new_inv = f"TST-{RUN_ID}"
    new_prefs = ["Alpha Family", "Beta Family"]
    r = requests.patch(f"{BASE}/guests/{g['id']}", headers=hdr(admin_token),
                       json={"invoiceNumber": new_inv,
                             "seatingPreferences": new_prefs}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["invoiceNumber"] == new_inv
    assert body["seatingPreferences"] == new_prefs
    # restore
    requests.patch(f"{BASE}/guests/{g['id']}", headers=hdr(admin_token),
                   json={"invoiceNumber": orig_inv,
                         "seatingPreferences": orig_prefs}, timeout=15)
