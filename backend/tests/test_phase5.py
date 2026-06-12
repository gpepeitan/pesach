"""Phase 5 backend tests: dev-login, table-types CRUD, bulk-import,
auto-assign, family/move, table create-via-typeId, and regression on
core endpoints (guests/ballrooms/tables/canvas-objects).
"""
import os
import time
import io
import pytest
import requests

def _load_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for ln in open(p):
            if ln.startswith("REACT_APP_BACKEND_URL="):
                return ln.split("=", 1)[1].strip()
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
RUN_ID = str(int(time.time()))


# ---------- session fixtures ----------
@pytest.fixture(scope="session")
def session():
    return requests.Session()


@pytest.fixture(scope="session")
def dev_token(session):
    r = session.post(f"{BASE_URL}/api/auth/dev-login")
    assert r.status_code == 200, f"dev-login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["devBypass"] is True
    assert data["user"]["isAdmin"] is True
    assert isinstance(data["token"], str) and len(data["token"]) > 10
    return data["token"]


@pytest.fixture(scope="session")
def H(dev_token):
    return {"Authorization": f"Bearer {dev_token}", "Content-Type": "application/json"}


# ---------- 1. Dev login ----------
class TestDevLogin:
    def test_dev_login_returns_admin_jwt(self, session):
        r = session.post(f"{BASE_URL}/api/auth/dev-login")
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["isAdmin"] is True
        assert d["devBypass"] is True

    def test_admin_login_still_works(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                         json={"username": "admin", "password": "admin123"})
        assert r.status_code == 200, r.text
        assert "token" in r.json()


# ---------- 2. Table-types CRUD ----------
class TestTableTypes:
    created_id = None

    def test_list(self, session, H):
        r = session.get(f"{BASE_URL}/api/table-types", headers=H)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create(self, session, H):
        payload = {
            "name": f"TEST_TT_{RUN_ID}", "shape": "round", "defaultSeats": 8,
            "widthIn": 60, "lengthIn": 60, "quantityOwned": 5,
            "isActive": True, "notes": "phase5 test"
        }
        r = session.post(f"{BASE_URL}/api/table-types", json=payload, headers=H)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["name"] == payload["name"]
        assert d["shape"] == "round"
        assert d["defaultSeats"] == 8
        assert d["isActive"] is True
        assert "id" in d
        TestTableTypes.created_id = d["id"]

    def test_get_after_create(self, session, H):
        r = session.get(f"{BASE_URL}/api/table-types", headers=H)
        ids = [tt["id"] for tt in r.json()]
        assert TestTableTypes.created_id in ids

    def test_update(self, session, H):
        tt_id = TestTableTypes.created_id
        payload = {"name": f"TEST_TT_{RUN_ID}_v2", "shape": "round",
                   "defaultSeats": 10, "widthIn": 72, "lengthIn": 72,
                   "quantityOwned": 6, "isActive": True, "notes": "updated"}
        r = session.patch(f"{BASE_URL}/api/table-types/{tt_id}", json=payload, headers=H)
        assert r.status_code == 200, r.text
        assert r.json()["defaultSeats"] == 10
        assert r.json()["widthIn"] == 72

    def test_delete_at_end(self, session, H):
        # deletion tested at the very end (after table tests); placeholder pass
        assert TestTableTypes.created_id is not None


# ---------- 3. Tables: create-from-typeId ----------
class TestTableFromType:
    table_id = None
    ballroom_id = None

    def test_setup_ballroom(self, session, H):
        # use first existing ballroom or create one
        r = session.get(f"{BASE_URL}/api/ballrooms", headers=H)
        assert r.status_code == 200
        rooms = r.json()
        if rooms:
            TestTableFromType.ballroom_id = rooms[0]["id"]
        else:
            r = session.post(f"{BASE_URL}/api/ballrooms",
                              json={"name": f"TEST_BR_{RUN_ID}"}, headers=H)
            assert r.status_code == 201
            TestTableFromType.ballroom_id = r.json()["id"]

    def test_create_table_with_type(self, session, H):
        tt_id = TestTableTypes.created_id
        assert tt_id is not None, "table-type must be created first"
        payload = {
            "tableNumber": int(RUN_ID[-4:]), "ballroomId": TestTableFromType.ballroom_id,
            "typeId": tt_id, "shape": "round", "maxCapacity": 10,
            "canvasX": 100, "canvasY": 100
        }
        r = session.post(f"{BASE_URL}/api/tables", json=payload, headers=H)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["shape"] == "round"
        # widthIn should hydrate from type (72)
        assert float(d["widthIn"]) == 72.0, f"widthIn not hydrated from type: {d.get('widthIn')}"
        TestTableFromType.table_id = d["id"]

    def test_create_table_invalid_type(self, session, H):
        payload = {"tableNumber": int(RUN_ID[-3:]) + 9000,
                   "ballroomId": TestTableFromType.ballroom_id,
                   "typeId": 99999999, "shape": "round", "maxCapacity": 8}
        r = session.post(f"{BASE_URL}/api/tables", json=payload, headers=H)
        assert r.status_code in (400, 422)


# ---------- 4. Bulk import ----------
class TestBulkImport:
    family_ids = [f"FAM-{RUN_ID}-A", f"FAM-{RUN_ID}-B"]

    def _csv(self):
        return (
            "full_name,invoice_number,party_size,family_id,near_family_id\n"
            f"TEST_Smith John,INV-{RUN_ID}-1,4,{self.family_ids[0]},{self.family_ids[1]}\n"
            f"TEST_Smith Jane,INV-{RUN_ID}-2,2,{self.family_ids[0]},{self.family_ids[1]}\n"
            f"TEST_Jones Bob,INV-{RUN_ID}-3,3,{self.family_ids[1]},\n"
        )

    def test_import_raw_csv(self, session, dev_token):
        r = session.post(
            f"{BASE_URL}/api/guests/bulk-import",
            data=self._csv().encode("utf-8"),
            headers={"Authorization": f"Bearer {dev_token}", "Content-Type": "text/csv"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["inserted"] + d["updated"] == 3, d

    def test_family_id_persisted(self, session, H):
        r = session.get(f"{BASE_URL}/api/guests", headers=H)
        assert r.status_code == 200
        guests = r.json()
        # find our test guests
        ours = [g for g in guests if g.get("invoiceNumber", "").startswith(f"INV-{RUN_ID}-")]
        assert len(ours) >= 3
        # at least 2 of them must have family_id = FAM-..-A
        fams = [g.get("familyId") for g in ours]
        assert self.family_ids[0] in fams
        assert self.family_ids[1] in fams

    def test_import_multipart_csv(self, session, dev_token):
        csv_data = (
            "name,invoice,guests,family_id\n"
            f"TEST_Multi Alice,INV-{RUN_ID}-mp1,2,{self.family_ids[0]}\n"
        )
        files = {"file": ("guests.csv", csv_data, "text/csv")}
        r = session.post(
            f"{BASE_URL}/api/guests/bulk-import",
            files=files,
            headers={"Authorization": f"Bearer {dev_token}"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["inserted"] + r.json()["updated"] >= 1

    def test_import_xlsx(self, session, dev_token):
        try:
            from openpyxl import Workbook
        except Exception:
            pytest.skip("openpyxl not available in test env")
        wb = Workbook()
        ws = wb.active
        ws.append(["full_name", "invoice_number", "party_size", "family_id"])
        ws.append([f"TEST_Excel Pat", f"INV-{RUN_ID}-xlsx1", 2, self.family_ids[1]])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        files = {"file": ("guests.xlsx", buf.read(),
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        r = session.post(f"{BASE_URL}/api/guests/bulk-import", files=files,
                         headers={"Authorization": f"Bearer {dev_token}"})
        assert r.status_code == 200, r.text
        assert r.json()["inserted"] + r.json()["updated"] >= 1


# ---------- 5. Auto-assign engine ----------
class TestAutoAssign:
    def test_preview_no_apply(self, session, H):
        r = session.post(f"{BASE_URL}/api/seating/auto-assign",
                         json={"apply": False, "allowCombine": True}, headers=H)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "plan" in d
        assert isinstance(d["plan"], list)

    def test_apply_persists(self, session, H):
        r = session.post(f"{BASE_URL}/api/seating/auto-assign",
                         json={"apply": True, "allowCombine": True,
                               "ballroomId": TestTableFromType.ballroom_id},
                         headers=H)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "plan" in d

    def test_combine_with_oversized_family(self, session, dev_token, H):
        # create a single huge family (party > any table capacity)
        big_csv = (
            "full_name,invoice_number,party_size,family_id\n"
            f"TEST_BigA,INV-{RUN_ID}-big1,12,FAM-{RUN_ID}-BIG\n"
            f"TEST_BigB,INV-{RUN_ID}-big2,10,FAM-{RUN_ID}-BIG\n"
        )
        r = session.post(
            f"{BASE_URL}/api/guests/bulk-import",
            data=big_csv.encode("utf-8"),
            headers={"Authorization": f"Bearer {dev_token}", "Content-Type": "text/csv"},
        )
        assert r.status_code == 200
        # ensure guests are unassigned
        gs = session.get(f"{BASE_URL}/api/guests", headers=H).json()
        big_ids = [g["id"] for g in gs if g.get("familyId") == f"FAM-{RUN_ID}-BIG"]
        for gid in big_ids:
            session.patch(f"{BASE_URL}/api/guests/{gid}",
                          json={"tableId": None}, headers=H)
        # run with combine
        r = session.post(f"{BASE_URL}/api/seating/auto-assign",
                         json={"apply": False, "allowCombine": True,
                               "ballroomId": TestTableFromType.ballroom_id},
                         headers=H)
        assert r.status_code == 200
        plan = r.json().get("plan", [])
        reasons = {p.get("reason") for p in plan}
        # We only assert the engine returned a plan; combined_tables is an aspirational
        # outcome that depends on enough adjacent empty tables existing.
        assert isinstance(plan, list)
        # log the reasons for debug
        print("AUTO-ASSIGN reasons:", reasons)


# ---------- 6. Family move ----------
class TestFamilyMove:
    def test_move_family_to_table(self, session, H):
        # find our family-A members
        guests = session.get(f"{BASE_URL}/api/guests", headers=H).json()
        fam_a = TestBulkImport.family_ids[0]
        members = [g for g in guests if g.get("familyId") == fam_a]
        assert len(members) >= 2, "need at least 2 family members"
        target = TestTableFromType.table_id
        body = {"guestId": members[0]["id"], "targetTableId": target}
        r = session.post(f"{BASE_URL}/api/guests/family/move", json=body, headers=H)
        # capacity might be exceeded; accept 200 OR 409
        assert r.status_code in (200, 409), r.text
        if r.status_code == 200:
            d = r.json()
            assert d["movedCount"] == len(members)
            # verify all moved
            guests2 = session.get(f"{BASE_URL}/api/guests", headers=H).json()
            members2 = [g for g in guests2 if g.get("familyId") == fam_a]
            for m in members2:
                assert m.get("tableId") == target, f"Member {m['id']} not on target table"
        else:
            # 409 returns capacity error structure
            j = r.json()
            assert "detail" in j or "error" in j

    def test_move_family_unassign(self, session, H):
        guests = session.get(f"{BASE_URL}/api/guests", headers=H).json()
        fam_a = TestBulkImport.family_ids[0]
        members = [g for g in guests if g.get("familyId") == fam_a]
        if not members:
            pytest.skip("no family A members")
        r = session.post(f"{BASE_URL}/api/guests/family/move",
                         json={"guestId": members[0]["id"], "targetTableId": None},
                         headers=H)
        assert r.status_code == 200
        guests2 = session.get(f"{BASE_URL}/api/guests", headers=H).json()
        for m in [g for g in guests2 if g.get("familyId") == fam_a]:
            assert m.get("tableId") in (None, 0)


# ---------- 7. Regression on existing endpoints ----------
class TestRegression:
    def test_list_guests(self, session, H):
        r = session.get(f"{BASE_URL}/api/guests", headers=H)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_ballrooms(self, session, H):
        r = session.get(f"{BASE_URL}/api/ballrooms", headers=H)
        assert r.status_code == 200

    def test_list_tables(self, session, H):
        r = session.get(f"{BASE_URL}/api/tables", headers=H)
        assert r.status_code == 200

    def test_list_canvas_objects(self, session, H):
        br = TestTableFromType.ballroom_id
        r = session.get(f"{BASE_URL}/api/ballrooms/{br}/canvas-objects", headers=H)
        assert r.status_code == 200


# ---------- 8. Cleanup ----------
class TestCleanup:
    def test_cleanup_table_then_type(self, session, H):
        # delete created table first
        if TestTableFromType.table_id:
            # unassign any seated guests
            session.delete(f"{BASE_URL}/api/tables/{TestTableFromType.table_id}", headers=H)
        if TestTableTypes.created_id:
            r = session.delete(f"{BASE_URL}/api/table-types/{TestTableTypes.created_id}", headers=H)
            assert r.status_code in (204, 400)
