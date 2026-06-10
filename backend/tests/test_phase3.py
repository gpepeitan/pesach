"""
Phase 3 backend tests: Ballrooms, Tables, Seat Assignment, Auto-Suggest.
Run alongside test_backend.py (Phase 1+2).
"""
import time
import pytest
import requests

state = {}


# ----- shared helpers -----
def _admin_get(api_client, base_url, headers, path, **params):
    return api_client.get(f"{base_url}{path}", headers=headers, params=params or None)


# ===========================================
# BALLROOMS
# ===========================================
class TestBallrooms:
    def test_list_ballrooms(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/ballrooms", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        state["existing_ballroom_count"] = len(data)
        # at least the seeded Grand Ballroom
        assert any(b["name"] for b in data)

    def test_list_requires_auth(self, base_url):
        r = requests.get(f"{base_url}/api/ballrooms")
        assert r.status_code == 401

    def test_create_ballroom_admin(self, api_client, base_url, admin_headers):
        name = f"TEST_Ballroom_{int(time.time())}"
        r = api_client.post(f"{base_url}/api/ballrooms", headers=admin_headers,
                            json={"name": name, "widthFt": 40.0, "heightFt": 30.0})
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["name"] == name
        assert d["widthFt"] == 40.0
        assert d["heightFt"] == 30.0
        assert "id" in d
        state["ballroom_id"] = d["id"]
        state["ballroom_name"] = name

    def test_create_ballroom_non_admin_forbidden(self, api_client, base_url):
        # create a non-admin staff first
        uname = f"TESTp3_{int(time.time())}"
        pwd = "pwdTEST!23"
        admin_login = api_client.post(f"{base_url}/api/auth/login",
                                       json={"username": "Eitanp", "password": "Gpepeitan!23"}).json()["token"]
        api_client.post(f"{base_url}/api/staff",
                        headers={"Authorization": f"Bearer {admin_login}", "Content-Type": "application/json"},
                        json={"username": uname, "password": pwd, "displayName": "TEST P3 staff", "isAdmin": False})
        tok = api_client.post(f"{base_url}/api/auth/login",
                              json={"username": uname, "password": pwd}).json()["token"]
        r = api_client.post(f"{base_url}/api/ballrooms",
                            headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
                            json={"name": "Nope", "widthFt": 1, "heightFt": 1})
        assert r.status_code == 403
        state["non_admin_token"] = tok

    def test_update_ballroom(self, api_client, base_url, admin_headers):
        bid = state["ballroom_id"]
        new_name = state["ballroom_name"] + "_upd"
        r = api_client.patch(f"{base_url}/api/ballrooms/{bid}", headers=admin_headers,
                             json={"name": new_name, "widthFt": 50.0, "heightFt": 35.0})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == new_name
        assert d["widthFt"] == 50.0
        # verify persistence
        r2 = api_client.get(f"{base_url}/api/ballrooms", headers=admin_headers)
        assert any(b["id"] == bid and b["name"] == new_name for b in r2.json())


# ===========================================
# TABLES — CRUD
# ===========================================
class TestTables:
    def test_list_tables_initial(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/tables", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # the seeded table 1 (Head Table) should exist
        for t in data:
            for k in ["id", "tableNumber", "ballroomId", "shape", "maxCapacity",
                      "seatsTaken", "seatsRemaining", "color"]:
                assert k in t

    def test_list_filter_by_ballroom(self, api_client, base_url, admin_headers):
        bid = state["ballroom_id"]
        r = api_client.get(f"{base_url}/api/tables", headers=admin_headers, params={"ballroomId": bid})
        assert r.status_code == 200
        for t in r.json():
            assert t["ballroomId"] == bid

    def test_create_table(self, api_client, base_url, admin_headers):
        bid = state["ballroom_id"]
        tnum = int(time.time()) % 100000  # somewhat unique
        r = api_client.post(f"{base_url}/api/tables", headers=admin_headers,
                            json={"tableNumber": tnum, "label": "TEST_Table",
                                  "ballroomId": bid, "shape": "round", "maxCapacity": 8})
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["tableNumber"] == tnum
        assert d["ballroomId"] == bid
        assert d["maxCapacity"] == 8
        assert d["seatsTaken"] == 0
        assert d["seatsRemaining"] == 8
        assert d["color"] == "gray"
        state["table_id"] = d["id"]
        state["table_number"] = tnum

    def test_get_table_with_empty_guests(self, api_client, base_url, admin_headers):
        tid = state["table_id"]
        r = api_client.get(f"{base_url}/api/tables/{tid}", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == tid
        assert "guests" in d and isinstance(d["guests"], list) and len(d["guests"]) == 0
        assert d["color"] == "gray"

    def test_patch_table_update_capacity(self, api_client, base_url, admin_headers):
        tid = state["table_id"]
        r = api_client.patch(f"{base_url}/api/tables/{tid}", headers=admin_headers,
                             json={"maxCapacity": 10, "label": "TEST_Table_v2"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["maxCapacity"] == 10
        assert d["label"] == "TEST_Table_v2"


# ===========================================
# SEAT ASSIGNMENT
# ===========================================
class TestSeatAssignment:
    def _get_unassigned(self, api_client, base_url, admin_headers, min_party=1, max_party=None):
        r = api_client.get(f"{base_url}/api/guests/unassigned", headers=admin_headers)
        assert r.status_code == 200
        for g in r.json():
            if g["partySize"] >= min_party and (max_party is None or g["partySize"] <= max_party):
                return g
        return None

    def test_create_unassigned_guests(self, api_client, base_url, admin_headers):
        # create 3 fresh unassigned guests for our table (cap 10)
        ts = int(time.time())
        created = []
        for i, ps in enumerate([3, 2, 4]):
            r = api_client.post(f"{base_url}/api/guests", json={
                "fullName": f"TEST_P3 Guest {ts}-{i}",
                "invoiceNumber": f"TEST-P3-{ts}-{i}",
                "partySize": ps,
                "seatingPreferences": [],
                "highChairNeeded": False,
                "highChairCount": 0,
            })
            assert r.status_code == 201, r.text
            created.append(r.json()["guest"])
        state["p3_guests"] = created

    def test_assign_first_guest(self, api_client, base_url, admin_headers):
        tid = state["table_id"]
        g = state["p3_guests"][0]  # party 3
        r = api_client.post(f"{base_url}/api/tables/{tid}/assign", headers=admin_headers,
                            json={"guestId": g["id"]})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert "preferenceMatch" in d
        assert d["preferenceMatch"] == {"mutualWith": [], "oneWayWith": []}

        # verify via GET table
        rt = api_client.get(f"{base_url}/api/tables/{tid}", headers=admin_headers)
        assert rt.status_code == 200
        td = rt.json()
        assert td["seatsTaken"] == 3
        assert td["seatsRemaining"] == 7
        assert td["color"] == "blue"  # 3 taken, 7 remaining -> blue (>2 remaining)
        assert any(gg["id"] == g["id"] for gg in td["guests"])
        # verify guest record updated
        rg = api_client.get(f"{base_url}/api/guests/{g['id']}", headers=admin_headers)
        assert rg.status_code == 200
        assert rg.json()["status"] == "fully_assigned"
        assert rg.json()["tableId"] == tid

    def test_color_yellow_state(self, api_client, base_url, admin_headers):
        tid = state["table_id"]
        # add another guest party size 4 -> 7 taken, 3 remaining (still blue since >2)
        g = state["p3_guests"][2]  # party 4
        r = api_client.post(f"{base_url}/api/tables/{tid}/assign", headers=admin_headers,
                            json={"guestId": g["id"]})
        assert r.status_code == 200, r.text
        rt = api_client.get(f"{base_url}/api/tables/{tid}", headers=admin_headers).json()
        assert rt["seatsTaken"] == 7
        assert rt["seatsRemaining"] == 3
        assert rt["color"] == "blue"  # 3 remaining is still > 2

        # add party 2 -> 9 taken, 1 remaining -> yellow
        g2 = state["p3_guests"][1]  # party 2
        r2 = api_client.post(f"{base_url}/api/tables/{tid}/assign", headers=admin_headers,
                             json={"guestId": g2["id"]})
        assert r2.status_code == 200, r2.text
        rt2 = api_client.get(f"{base_url}/api/tables/{tid}", headers=admin_headers).json()
        assert rt2["seatsTaken"] == 9
        assert rt2["seatsRemaining"] == 1
        assert rt2["color"] == "yellow"

    def test_capacity_exceeded_returns_409(self, api_client, base_url, admin_headers):
        tid = state["table_id"]
        # table now: 9 taken / 10 cap (1 remaining). Need a guest with party_size >= 2.
        ts = int(time.time())
        r = api_client.post(f"{base_url}/api/guests", json={
            "fullName": f"TEST_P3 Overflow {ts}",
            "invoiceNumber": f"TEST-P3-OF-{ts}",
            "partySize": 3,
            "seatingPreferences": [],
            "highChairNeeded": False,
            "highChairCount": 0,
        })
        assert r.status_code == 201
        ov = r.json()["guest"]
        state["overflow_guest"] = ov

        r2 = api_client.post(f"{base_url}/api/tables/{tid}/assign", headers=admin_headers,
                             json={"guestId": ov["id"]})
        assert r2.status_code == 409, r2.text
        body = r2.json()
        detail = body.get("detail", body)
        assert detail.get("error") == "capacity_exceeded"
        assert "message" in detail
        assert detail["capacity"] == 10
        assert detail["seatsTaken"] == 9
        assert detail["partySize"] == 3

    def test_assign_with_overflow_allowed(self, api_client, base_url, admin_headers):
        tid = state["table_id"]
        ov = state["overflow_guest"]
        r = api_client.post(f"{base_url}/api/tables/{tid}/assign", headers=admin_headers,
                            json={"guestId": ov["id"], "allowOverflow": True})
        assert r.status_code == 200, r.text
        rt = api_client.get(f"{base_url}/api/tables/{tid}", headers=admin_headers).json()
        assert rt["seatsTaken"] == 12  # overflow above cap 10
        # full or beyond -> green
        assert rt["color"] == "green"

    def test_mark_physically_seated(self, api_client, base_url, admin_headers):
        tid = state["table_id"]
        gid = state["p3_guests"][0]["id"]
        r = api_client.patch(f"{base_url}/api/tables/{tid}/guests/{gid}/seated",
                             headers=admin_headers, json={"seated": True})
        assert r.status_code == 200
        rt = api_client.get(f"{base_url}/api/tables/{tid}", headers=admin_headers).json()
        guest_row = next(g for g in rt["guests"] if g["id"] == gid)
        assert guest_row["physicallySeated"] is True

        r2 = api_client.patch(f"{base_url}/api/tables/{tid}/guests/{gid}/seated",
                              headers=admin_headers, json={"seated": False})
        assert r2.status_code == 200
        rt2 = api_client.get(f"{base_url}/api/tables/{tid}", headers=admin_headers).json()
        guest_row2 = next(g for g in rt2["guests"] if g["id"] == gid)
        assert guest_row2["physicallySeated"] is False

    def test_unassign_guest(self, api_client, base_url, admin_headers):
        tid = state["table_id"]
        ov = state["overflow_guest"]
        r = api_client.post(f"{base_url}/api/tables/{tid}/unassign/{ov['id']}", headers=admin_headers)
        assert r.status_code == 200
        rt = api_client.get(f"{base_url}/api/tables/{tid}", headers=admin_headers).json()
        assert not any(g["id"] == ov["id"] for g in rt["guests"])
        # guest record back to unassigned
        rg = api_client.get(f"{base_url}/api/guests/{ov['id']}", headers=admin_headers)
        assert rg.json()["status"] == "unassigned"
        assert rg.json()["tableId"] is None

    def test_delete_table_blocked_when_guests_seated(self, api_client, base_url, admin_headers):
        tid = state["table_id"]
        r = api_client.delete(f"{base_url}/api/tables/{tid}", headers=admin_headers)
        assert r.status_code == 400


# ===========================================
# PREFERENCE-MATCH DETECTION
# ===========================================
class TestPreferenceMatchOnAssign:
    """Create two guests with mutual confirmed preferences,
    assign both to the same table, verify preferenceMatch.mutualWith reports."""

    def test_setup_mutual_pref_pair_and_table(self, api_client, base_url, admin_headers):
        ts = int(time.time())
        # Two guests that prefer each other (exact name match → fuzzy 1.0, auto confirms? — let's check)
        g_alice = api_client.post(f"{base_url}/api/guests", json={
            "fullName": f"TEST_PM Alice {ts}",
            "invoiceNumber": f"TEST-PM-A-{ts}",
            "partySize": 2,
            "seatingPreferences": [f"TEST_PM Bob {ts}"],
            "highChairNeeded": False, "highChairCount": 0,
        }).json()["guest"]
        g_bob = api_client.post(f"{base_url}/api/guests", json={
            "fullName": f"TEST_PM Bob {ts}",
            "invoiceNumber": f"TEST-PM-B-{ts}",
            "partySize": 2,
            "seatingPreferences": [f"TEST_PM Alice {ts}"],
            "highChairNeeded": False, "highChairCount": 0,
        }).json()["guest"]
        state["pm_alice"] = g_alice
        state["pm_bob"] = g_bob

        # Confirm prefs: find them in unresolved and confirm each
        unr = api_client.get(f"{base_url}/api/preferences/unresolved", headers=admin_headers).json()
        confirmed = 0
        for p in unr:
            if p["guestId"] in (g_alice["id"], g_bob["id"]):
                target = g_bob["id"] if p["guestId"] == g_alice["id"] else g_alice["id"]
                r = api_client.patch(f"{base_url}/api/preferences/{p['id']}/resolve",
                                     headers=admin_headers,
                                     json={"resolutionStatus": "confirmed", "resolvedGuestId": target})
                if r.status_code == 200:
                    confirmed += 1
        assert confirmed >= 2, f"Expected to confirm 2 prefs, got {confirmed}"

        # Create dedicated empty table for them
        bid = state["ballroom_id"]
        tnum = int(time.time()) % 99999
        rt = api_client.post(f"{base_url}/api/tables", headers=admin_headers,
                             json={"tableNumber": tnum + 1, "label": "TEST_PM_Table",
                                   "ballroomId": bid, "shape": "round", "maxCapacity": 6})
        assert rt.status_code == 201, rt.text
        state["pm_table_id"] = rt.json()["id"]

    def test_assign_first_no_pref_match(self, api_client, base_url, admin_headers):
        tid = state["pm_table_id"]
        r = api_client.post(f"{base_url}/api/tables/{tid}/assign", headers=admin_headers,
                            json={"guestId": state["pm_alice"]["id"]})
        assert r.status_code == 200, r.text
        d = r.json()
        # nobody else at the table yet
        assert d["preferenceMatch"]["mutualWith"] == []
        assert d["preferenceMatch"]["oneWayWith"] == []

    def test_assign_second_detects_mutual(self, api_client, base_url, admin_headers):
        tid = state["pm_table_id"]
        r = api_client.post(f"{base_url}/api/tables/{tid}/assign", headers=admin_headers,
                            json={"guestId": state["pm_bob"]["id"]})
        assert r.status_code == 200, r.text
        d = r.json()
        assert state["pm_alice"]["id"] in d["preferenceMatch"]["mutualWith"], \
            f"Expected mutual with alice, got {d}"


# ===========================================
# AUTO-SUGGEST
# ===========================================
class TestAutoSuggest:
    def test_auto_suggest_returns_plan(self, api_client, base_url, admin_headers):
        # ensure there are unassigned guests; create a few
        ts = int(time.time())
        for i, ps in enumerate([2, 3]):
            api_client.post(f"{base_url}/api/guests", json={
                "fullName": f"TEST_AS Guest {ts}-{i}",
                "invoiceNumber": f"TEST-AS-{ts}-{i}",
                "partySize": ps,
                "seatingPreferences": [],
                "highChairNeeded": False, "highChairCount": 0,
            })
        # create a roomy table for them
        bid = state["ballroom_id"]
        tnum = (int(time.time()) % 99999) + 500
        rt = api_client.post(f"{base_url}/api/tables", headers=admin_headers,
                             json={"tableNumber": tnum, "label": "TEST_AS_Table",
                                   "ballroomId": bid, "shape": "round", "maxCapacity": 20})
        assert rt.status_code == 201
        state["as_table_id"] = rt.json()["id"]

        r = api_client.post(f"{base_url}/api/seating/auto-suggest", headers=admin_headers, json={})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "plan" in d
        assert "summary" in d
        assert isinstance(d["plan"], list)
        # plan items have required keys
        for item in d["plan"]:
            for k in ["guestId", "tableId", "ballroomId", "tableNumber", "guestName", "partySize", "reason"]:
                assert k in item, f"Missing key {k} in {item}"
            assert item["reason"] in ("mutual_cluster", "size_fit")
        state["as_plan"] = d["plan"]

    def test_auto_suggest_does_not_apply(self, api_client, base_url, admin_headers):
        # the plan should NOT have actually assigned anyone yet.
        # Verify a sample guest from the plan is still unassigned.
        plan = state.get("as_plan") or []
        if not plan:
            pytest.skip("Empty plan")
        sample_gid = plan[0]["guestId"]
        r = api_client.get(f"{base_url}/api/guests/{sample_gid}", headers=admin_headers)
        assert r.status_code == 200
        # status should still be unassigned (auto-suggest does NOT apply)
        assert r.json()["status"] == "unassigned", \
            "auto-suggest endpoint must not mutate guests"

    def test_auto_suggest_apply(self, api_client, base_url, admin_headers):
        plan = state.get("as_plan") or []
        if not plan:
            pytest.skip("Empty plan to apply")
        r = api_client.post(f"{base_url}/api/seating/auto-suggest/apply",
                            headers=admin_headers, json=plan)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "applied" in d
        assert d["applied"] >= 1
        # verify at least one of the planned guests is now fully_assigned
        sample_gid = plan[0]["guestId"]
        r2 = api_client.get(f"{base_url}/api/guests/{sample_gid}", headers=admin_headers)
        assert r2.status_code == 200
        assert r2.json()["status"] == "fully_assigned"
        assert r2.json()["tableId"] == plan[0]["tableId"]


# ===========================================
# ACTIVITY LOG — Phase 3 entries
# ===========================================
class TestActivityLogPhase3:
    @pytest.mark.parametrize("atype", [
        "ballroom_create", "table_create", "seat_assign", "seat_unassign",
        "seat_check", "auto_suggest_apply",
    ])
    def test_action_logged(self, api_client, base_url, admin_headers, atype):
        r = api_client.get(f"{base_url}/api/activity-log",
                           headers=admin_headers, params={"actionType": atype})
        assert r.status_code == 200, r.text
        entries = r.json()
        assert len(entries) >= 1, f"No activity_log entries for {atype}"
        assert all(e["actionType"] == atype for e in entries)


# ===========================================
# BALLROOM DELETE (must happen after we clean tables in this ballroom)
# ===========================================
class TestBallroomDeleteBlocked:
    def test_delete_blocked_when_tables(self, api_client, base_url, admin_headers):
        bid = state["ballroom_id"]
        r = api_client.delete(f"{base_url}/api/ballrooms/{bid}", headers=admin_headers)
        assert r.status_code == 400
