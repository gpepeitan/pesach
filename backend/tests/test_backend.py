"""
Comprehensive backend tests for Passover Seating Manager Phase 2.
Covers: auth, guest intake (duplicates), staff list/filter/stats, notes,
preferences (unresolved/mutual/one-way + resolve), activity log, staff admin.
"""
import time
import pytest
import requests

# ---------- shared state across tests ----------
state = {}


# ---------- HEALTH ----------
def test_health(api_client, base_url):
    r = api_client.get(f"{base_url}/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ---------- AUTH ----------
class TestAuth:
    def test_login_success(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/login",
                            json={"username": "Eitanp", "password": "Gpepeitan!23"})
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 20
        assert data["user"]["username"] == "Eitanp"
        assert data["user"]["displayName"] == "eitan prigan"
        assert data["user"]["isAdmin"] is True

    def test_login_wrong_password(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/login",
                            json={"username": "Eitanp", "password": "wrongpass"})
        assert r.status_code == 401

    def test_login_unknown_user(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/login",
                            json={"username": "nobody_xyz", "password": "x"})
        assert r.status_code == 401

    def test_me_with_token(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/auth/me", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["username"] == "Eitanp"
        assert d["displayName"] == "eitan prigan"
        assert d["isAdmin"] is True

    def test_me_without_token(self, api_client, base_url):
        r = requests.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401


# ---------- GUEST INTAKE (public, duplicates) ----------
class TestGuestIntake:
    def test_create_guest_first_time(self, api_client, base_url, unique_invoice):
        payload = {
            "fullName": "TEST Guest Alpha",
            "invoiceNumber": unique_invoice,
            "partySize": 4,
            "seatingPreferences": ["TEST Guest Beta", "TEST Guest Gamma"],
            "highChairNeeded": True,
            "highChairCount": 1,
            "specialNotes": "automated test note",
        }
        r = api_client.post(f"{base_url}/api/guests", json=payload)
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["isDuplicate"] is False
        assert data["priorSubmissionCount"] == 0
        g = data["guest"]
        assert g["fullName"] == payload["fullName"]
        assert g["invoiceNumber"] == unique_invoice
        assert g["partySize"] == 4
        assert g["highChairNeeded"] is True
        assert g["highChairCount"] == 1
        assert g["isDuplicate"] is False
        assert isinstance(g["seatingPreferences"], list) and len(g["seatingPreferences"]) == 2
        state["guest_id_1"] = g["id"]

    def test_check_invoice_after_first(self, api_client, base_url, unique_invoice):
        r = api_client.get(f"{base_url}/api/guests/check-invoice/{unique_invoice}")
        assert r.status_code == 200
        d = r.json()
        assert d["hasSubmissions"] is True
        assert d["submissionCount"] >= 1

    def test_create_guest_duplicate(self, api_client, base_url, unique_invoice):
        payload = {
            "fullName": "TEST Guest Alpha (dup)",
            "invoiceNumber": unique_invoice,
            "partySize": 2,
            "seatingPreferences": [],
            "highChairNeeded": False,
            "highChairCount": 0,
        }
        r = api_client.post(f"{base_url}/api/guests", json=payload)
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["isDuplicate"] is True
        assert data["priorSubmissionCount"] >= 1
        assert data["guest"]["isDuplicate"] is True
        state["guest_id_2"] = data["guest"]["id"]
        # ensure both records exist (no overwrite)
        assert state["guest_id_2"] != state.get("guest_id_1")

    def test_check_invoice_two_submissions(self, api_client, base_url, unique_invoice):
        r = api_client.get(f"{base_url}/api/guests/check-invoice/{unique_invoice}")
        assert r.status_code == 200
        assert r.json()["submissionCount"] >= 2

    def test_check_invoice_unknown(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/guests/check-invoice/NOSUCH-{int(time.time())}")
        assert r.status_code == 200
        assert r.json()["hasSubmissions"] is False
        assert r.json()["submissionCount"] == 0


# ---------- GUESTS (authenticated list/filter/stats) ----------
class TestGuestsList:
    def test_list_requires_auth(self, base_url):
        r = requests.get(f"{base_url}/api/guests")
        assert r.status_code == 401

    def test_list_basic(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/guests", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert any(g["id"] == state["guest_id_1"] for g in data)

    def test_list_search(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/guests",
                           headers=admin_headers, params={"search": "TEST Guest Alpha"})
        assert r.status_code == 200
        results = r.json()
        assert len(results) >= 1
        assert all("TEST Guest Alpha" in g["fullName"] or "TEST" in g["fullName"] for g in results)

    def test_list_filter_duplicate(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/guests",
                           headers=admin_headers, params={"isDuplicate": "true"})
        assert r.status_code == 200
        for g in r.json():
            assert g["isDuplicate"] is True

    def test_list_filter_highchair(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/guests",
                           headers=admin_headers, params={"highChair": "true"})
        assert r.status_code == 200
        for g in r.json():
            assert g["highChairNeeded"] is True

    def test_list_sort_party_size_asc(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/guests",
                           headers=admin_headers, params={"sort": "partySize", "order": "asc"})
        assert r.status_code == 200
        sizes = [g["partySize"] for g in r.json()]
        assert sizes == sorted(sizes)

    def test_unassigned_queue(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/guests/unassigned", headers=admin_headers)
        assert r.status_code == 200
        for g in r.json():
            assert g["status"] == "unassigned"

    def test_stats(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/guests/stats", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ["totalSubmissions", "totalPeople", "totalDuplicates", "totalHighChairs",
                  "unresolvedPreferences", "percentSeated", "percentUnassigned", "statusBreakdown"]:
            assert k in d
        assert d["totalSubmissions"] >= 2
        assert d["totalDuplicates"] >= 1
        assert d["totalHighChairs"] >= 1
        assert "unassigned" in d["statusBreakdown"]

    def test_patch_guest(self, api_client, base_url, admin_headers):
        gid = state["guest_id_1"]
        r = api_client.patch(f"{base_url}/api/guests/{gid}",
                             headers=admin_headers, json={"specialNotes": "updated by test"})
        assert r.status_code == 200
        assert r.json()["specialNotes"] == "updated by test"
        # verify persisted
        r2 = api_client.get(f"{base_url}/api/guests/{gid}", headers=admin_headers)
        assert r2.status_code == 200
        assert r2.json()["specialNotes"] == "updated by test"


# ---------- STAFF NOTES ----------
class TestStaffNotes:
    def test_add_note(self, api_client, base_url, admin_headers):
        gid = state["guest_id_1"]
        r = api_client.post(f"{base_url}/api/guests/{gid}/notes",
                            headers=admin_headers, json={"note": "TEST note from pytest"})
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["note"] == "TEST note from pytest"
        assert d["staffName"] == "eitan prigan"
        assert d["guestId"] == gid
        state["note_id"] = d["id"]

    def test_list_notes_newest_first(self, api_client, base_url, admin_headers):
        gid = state["guest_id_1"]
        # add a second note
        api_client.post(f"{base_url}/api/guests/{gid}/notes",
                        headers=admin_headers, json={"note": "TEST second note"})
        r = api_client.get(f"{base_url}/api/guests/{gid}/notes", headers=admin_headers)
        assert r.status_code == 200
        notes = r.json()
        assert len(notes) >= 2
        # newest-first ordering
        ts = [n["createdAt"] for n in notes]
        assert ts == sorted(ts, reverse=True)

    def test_delete_note(self, api_client, base_url, admin_headers):
        gid = state["guest_id_1"]
        nid = state["note_id"]
        r = api_client.delete(f"{base_url}/api/guests/{gid}/notes/{nid}", headers=admin_headers)
        assert r.status_code == 204
        r2 = api_client.get(f"{base_url}/api/guests/{gid}/notes", headers=admin_headers)
        assert all(n["id"] != nid for n in r2.json())


# ---------- PREFERENCES ----------
class TestPreferences:
    def test_unresolved_with_suggestions(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/preferences/unresolved", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # the prefs we created should have suggestions (we created sibling guests)
        found_any = False
        for p in data:
            if p["guestId"] == state.get("guest_id_1"):
                assert "suggestions" in p
                for s in p["suggestions"]:
                    assert "guestId" in s and "name" in s and "score" in s
                    assert s["score"] >= 0.6
                found_any = True
                state["pref_to_resolve"] = p
        # not an absolute requirement, but log
        if not found_any:
            pytest.skip("No unresolved prefs belonged to current test guest")

    def test_resolve_preference_confirmed(self, api_client, base_url, admin_headers):
        pref = state.get("pref_to_resolve")
        if not pref or not pref.get("suggestions"):
            pytest.skip("No suggestion available to confirm")
        target = pref["suggestions"][0]["guestId"]
        r = api_client.patch(
            f"{base_url}/api/preferences/{pref['id']}/resolve",
            headers=admin_headers,
            json={"resolutionStatus": "confirmed", "resolvedGuestId": target},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["resolutionStatus"] == "confirmed"
        assert d["resolvedGuestId"] == target
        assert d["fuzzyScore"] is not None and 0 <= d["fuzzyScore"] <= 1

    def test_resolve_preference_no_match(self, api_client, base_url, admin_headers):
        # find an unresolved one
        r = api_client.get(f"{base_url}/api/preferences/unresolved", headers=admin_headers)
        prefs = r.json()
        candidate = next((p for p in prefs if p["guestId"] == state.get("guest_id_1")), None)
        if not candidate:
            pytest.skip("No other unresolved pref for this test guest")
        r2 = api_client.patch(
            f"{base_url}/api/preferences/{candidate['id']}/resolve",
            headers=admin_headers,
            json={"resolutionStatus": "no_match"},
        )
        assert r2.status_code == 200
        assert r2.json()["resolutionStatus"] == "no_match"

    def test_mutual_list(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/preferences/mutual", headers=admin_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_one_way_list(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/preferences/one-way", headers=admin_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- ACTIVITY LOG ----------
class TestActivityLog:
    def test_activity_log_recent(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/activity-log", headers=admin_headers)
        assert r.status_code == 200
        entries = r.json()
        assert isinstance(entries, list) and len(entries) > 0
        types = {e["actionType"] for e in entries}
        # login should be present (we logged in)
        assert "login" in types
        # newest first
        ts = [e["createdAt"] for e in entries]
        assert ts == sorted(ts, reverse=True)

    def test_filter_by_action_type(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/activity-log",
                           headers=admin_headers, params={"actionType": "login"})
        assert r.status_code == 200
        assert all(e["actionType"] == "login" for e in r.json())

    def test_filter_by_staff_name(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/activity-log",
                           headers=admin_headers, params={"staffName": "eitan"})
        assert r.status_code == 200
        for e in r.json():
            assert "eitan" in (e["staffMemberName"] or "").lower()

    def test_note_add_logged(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/activity-log",
                           headers=admin_headers, params={"actionType": "note_add"})
        assert r.status_code == 200
        assert len(r.json()) >= 1


# ---------- STAFF ADMIN ----------
class TestStaffAdmin:
    def test_list_staff_admin_only(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/staff", headers=admin_headers)
        assert r.status_code == 200
        assert any(s["username"] == "Eitanp" for s in r.json())

    def test_create_staff(self, api_client, base_url, admin_headers):
        uname = f"TEST_staff_{int(time.time())}"
        r = api_client.post(f"{base_url}/api/staff", headers=admin_headers,
                            json={"username": uname, "password": "tempPass!23",
                                  "displayName": "TEST staff", "isAdmin": False})
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["username"] == uname
        assert d["isAdmin"] is False
        assert d["isActive"] is True
        state["new_staff_username"] = uname
        state["new_staff_password"] = "tempPass!23"
        state["new_staff_id"] = d["id"]

    def test_duplicate_username_rejected(self, api_client, base_url, admin_headers):
        uname = state["new_staff_username"]
        r = api_client.post(f"{base_url}/api/staff", headers=admin_headers,
                            json={"username": uname, "password": "x", "displayName": "dup"})
        assert r.status_code == 400

    def test_new_staff_can_login(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/login",
                            json={"username": state["new_staff_username"],
                                  "password": state["new_staff_password"]})
        assert r.status_code == 200
        assert r.json()["user"]["isAdmin"] is False
        state["new_staff_token"] = r.json()["token"]

    def test_non_admin_cannot_list_staff(self, api_client, base_url):
        h = {"Authorization": f"Bearer {state['new_staff_token']}",
             "Content-Type": "application/json"}
        r = api_client.get(f"{base_url}/api/staff", headers=h)
        assert r.status_code == 403

    def test_non_admin_cannot_create_staff(self, api_client, base_url):
        h = {"Authorization": f"Bearer {state['new_staff_token']}",
             "Content-Type": "application/json"}
        r = api_client.post(f"{base_url}/api/staff", headers=h,
                            json={"username": "x", "password": "y", "displayName": "z"})
        assert r.status_code == 403

    def test_deactivate_blocks_login(self, api_client, base_url, admin_headers):
        sid = state["new_staff_id"]
        r = api_client.patch(f"{base_url}/api/staff/{sid}",
                             headers=admin_headers, json={"isActive": False})
        assert r.status_code == 200
        r2 = api_client.post(f"{base_url}/api/auth/login",
                             json={"username": state["new_staff_username"],
                                   "password": state["new_staff_password"]})
        assert r2.status_code == 401
