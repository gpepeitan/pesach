"""Phase 4 backend tests: ballroom floor-plan, canvas_objects, table canvas persistence."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://seder-seat-mgmt.preview.emergentagent.com").rstrip("/")

# Tiny 1x1 PNG data URL
TINY_PNG = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


# ---------------- Module-level fixtures (use admin_headers/api_client from conftest) ----------------

@pytest.fixture(scope="module")
def ballroom_id(api_client, admin_headers):
    # Try to fetch existing first
    r = api_client.get(f"{BASE_URL}/api/ballrooms", headers=admin_headers)
    assert r.status_code == 200, r.text
    rooms = r.json()
    if rooms:
        return rooms[0]["id"]
    r = api_client.post(f"{BASE_URL}/api/ballrooms",
                       json={"name": "TEST_BR_P4", "widthFt": 80, "heightFt": 60},
                       headers=admin_headers)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


# ---------------- Floor plan endpoint ----------------

class TestFloorPlan:
    def test_set_floor_plan_admin(self, api_client, admin_headers, ballroom_id):
        r = api_client.patch(f"{BASE_URL}/api/ballrooms/{ballroom_id}/floor-plan",
                             json={"backgroundImageUrl": TINY_PNG, "scaleFactor": 12.0},
                             headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == ballroom_id
        # Verify persistence via GET
        r2 = api_client.get(f"{BASE_URL}/api/ballrooms", headers=admin_headers)
        room = next(b for b in r2.json() if b["id"] == ballroom_id)
        assert room.get("backgroundImageUrl") == TINY_PNG

    def test_clear_floor_plan(self, api_client, admin_headers, ballroom_id):
        r = api_client.patch(f"{BASE_URL}/api/ballrooms/{ballroom_id}/floor-plan",
                             json={"backgroundImageUrl": ""},
                             headers=admin_headers)
        assert r.status_code == 200, r.text
        r2 = api_client.get(f"{BASE_URL}/api/ballrooms", headers=admin_headers)
        room = next(b for b in r2.json() if b["id"] == ballroom_id)
        assert room.get("backgroundImageUrl") in ("", None)

    def test_floor_plan_requires_auth(self, api_client, ballroom_id):
        r = requests.patch(f"{BASE_URL}/api/ballrooms/{ballroom_id}/floor-plan",
                           json={"backgroundImageUrl": TINY_PNG})
        assert r.status_code in (401, 403), r.text

    def test_floor_plan_nothing_to_update(self, api_client, admin_headers, ballroom_id):
        r = api_client.patch(f"{BASE_URL}/api/ballrooms/{ballroom_id}/floor-plan",
                             json={}, headers=admin_headers)
        assert r.status_code == 400, r.text


# ---------------- Canvas objects CRUD ----------------

class TestCanvasObjects:
    created_id = None

    def test_list_empty_or_ok(self, api_client, admin_headers, ballroom_id):
        r = api_client.get(f"{BASE_URL}/api/ballrooms/{ballroom_id}/canvas-objects", headers=admin_headers)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_create_canvas_object(self, api_client, admin_headers, ballroom_id):
        payload = {
            "ballroomId": ballroom_id, "objectType": "stage", "label": "TEST_Stage",
            "x": 100.0, "y": 200.0, "width": 200.0, "height": 80.0, "rotation": 0,
        }
        r = api_client.post(f"{BASE_URL}/api/canvas-objects", json=payload, headers=admin_headers)
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["objectType"] == "stage"
        assert data["x"] == 100.0 and data["y"] == 200.0
        assert data["width"] == 200.0 and data["height"] == 80.0
        assert data["ballroomId"] == ballroom_id
        assert "id" in data
        TestCanvasObjects.created_id = data["id"]

        # Verify in list
        r2 = api_client.get(f"{BASE_URL}/api/ballrooms/{ballroom_id}/canvas-objects", headers=admin_headers)
        ids = [o["id"] for o in r2.json()]
        assert data["id"] in ids

    def test_update_canvas_object_partial(self, api_client, admin_headers):
        oid = TestCanvasObjects.created_id
        assert oid is not None, "create must run first"
        r = api_client.patch(f"{BASE_URL}/api/canvas-objects/{oid}",
                             json={"x": 300.0, "label": "TEST_Stage_Updated"},
                             headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["x"] == 300.0
        assert d["label"] == "TEST_Stage_Updated"
        # y/width/height preserved
        assert d["y"] == 200.0
        assert d["width"] == 200.0
        assert d["height"] == 80.0

    def test_update_canvas_object_dimensions(self, api_client, admin_headers):
        oid = TestCanvasObjects.created_id
        r = api_client.patch(f"{BASE_URL}/api/canvas-objects/{oid}",
                             json={"width": 250.0, "height": 90.0, "rotation": 45},
                             headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["width"] == 250.0 and d["height"] == 90.0
        assert d["rotation"] == 45

    def test_delete_canvas_object(self, api_client, admin_headers, ballroom_id):
        oid = TestCanvasObjects.created_id
        r = api_client.delete(f"{BASE_URL}/api/canvas-objects/{oid}", headers=admin_headers)
        assert r.status_code in (200, 204), r.text
        # Verify removed
        r2 = api_client.get(f"{BASE_URL}/api/ballrooms/{ballroom_id}/canvas-objects", headers=admin_headers)
        ids = [o["id"] for o in r2.json()]
        assert oid not in ids

    def test_delete_nonexistent(self, api_client, admin_headers):
        r = api_client.delete(f"{BASE_URL}/api/canvas-objects/999999", headers=admin_headers)
        assert r.status_code == 404

    def test_canvas_objects_requires_auth(self, ballroom_id):
        r = requests.get(f"{BASE_URL}/api/ballrooms/{ballroom_id}/canvas-objects")
        assert r.status_code in (401, 403)
        r2 = requests.post(f"{BASE_URL}/api/canvas-objects",
                           json={"ballroomId": ballroom_id, "objectType": "bar",
                                 "x": 0, "y": 0, "width": 10, "height": 10})
        assert r2.status_code in (401, 403)


# ---------------- Table canvas_x/canvas_y persistence ----------------

class TestTableCanvasPersistence:
    def test_patch_table_canvas_coords(self, api_client, admin_headers, ballroom_id):
        # Create a temp table
        ts = int(time.time())
        r = api_client.post(f"{BASE_URL}/api/tables", json={
            "tableNumber": 9000 + (ts % 1000), "label": "TEST_P4_Table",
            "ballroomId": ballroom_id, "shape": "round", "maxCapacity": 10,
            "canvasX": 50, "canvasY": 50,
        }, headers=admin_headers)
        assert r.status_code in (200, 201), r.text
        table_id = r.json()["id"]

        # PATCH new canvasX/Y
        r2 = api_client.patch(f"{BASE_URL}/api/tables/{table_id}",
                              json={"canvasX": 340.5, "canvasY": 420.25},
                              headers=admin_headers)
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["canvasX"] == 340.5
        assert d["canvasY"] == 420.25

        # Verify via GET list
        r3 = api_client.get(f"{BASE_URL}/api/tables?ballroomId={ballroom_id}", headers=admin_headers)
        t = next(x for x in r3.json() if x["id"] == table_id)
        assert t["canvasX"] == 340.5
        assert t["canvasY"] == 420.25

        # Cleanup
        api_client.delete(f"{BASE_URL}/api/tables/{table_id}", headers=admin_headers)
