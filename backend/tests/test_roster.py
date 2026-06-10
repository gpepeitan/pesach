"""
Roster (registered_guests) and auto-link feature tests.

Covers:
- POST /api/roster/import-csv (multipart + raw body, case-insensitive headers, re-import updates)
- GET /api/roster/lookup/{invoice} (public)
- GET /api/roster/search?q= (public, with excludeInvoice)
- GET /api/roster (auth, with search filter)
- POST /api/roster (admin, duplicates -> 400)
- DELETE /api/roster/{id} (admin)
- POST /api/guests with linkedInvoiceNumbers — auto-confirm forward + reverse
- mutual prefs after both directions linked
- backwards compat: empty linkedInvoiceNumbers falls back to fuzzy
"""
import io
import time
import pytest
import requests


state = {}


# ---------------- ROSTER CRUD ----------------
class TestRosterCRUD:
    def test_roster_list_requires_auth(self, base_url):
        r = requests.get(f"{base_url}/api/roster")
        assert r.status_code == 401

    def test_roster_create_admin(self, api_client, base_url, admin_headers):
        inv = f"TEST-ROST-{int(time.time())}"
        r = api_client.post(f"{base_url}/api/roster", headers=admin_headers,
                            json={"invoiceNumber": inv, "fullName": "TEST Roster Person", "email": "rp@x.io"})
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["invoiceNumber"] == inv
        assert d["fullName"] == "TEST Roster Person"
        assert d["email"] == "rp@x.io"
        assert "id" in d
        state["rg_id"] = d["id"]
        state["rg_inv"] = inv

    def test_roster_create_duplicate_400(self, api_client, base_url, admin_headers):
        r = api_client.post(f"{base_url}/api/roster", headers=admin_headers,
                            json={"invoiceNumber": state["rg_inv"], "fullName": "Dup"})
        assert r.status_code == 400

    def test_roster_list_search(self, api_client, base_url, admin_headers):
        r = api_client.get(f"{base_url}/api/roster", headers=admin_headers,
                           params={"search": state["rg_inv"]})
        assert r.status_code == 200
        data = r.json()
        assert any(x["invoiceNumber"] == state["rg_inv"] for x in data)

    def test_roster_delete_admin(self, api_client, base_url, admin_headers):
        # create then delete a throwaway one
        inv = f"TEST-DEL-{int(time.time())}"
        cr = api_client.post(f"{base_url}/api/roster", headers=admin_headers,
                             json={"invoiceNumber": inv, "fullName": "ToDelete"})
        assert cr.status_code == 201
        rid = cr.json()["id"]
        r = api_client.delete(f"{base_url}/api/roster/{rid}", headers=admin_headers)
        assert r.status_code == 204
        # verify gone
        r2 = api_client.get(f"{base_url}/api/roster", headers=admin_headers,
                            params={"search": inv})
        assert r2.status_code == 200
        assert not any(x["id"] == rid for x in r2.json())

    def test_roster_delete_non_admin_forbidden(self, api_client, base_url):
        # create non-admin
        uname = f"TESTrost_{int(time.time())}"
        pwd = "pwdTEST!23"
        # need an admin token to create staff
        admin_login = api_client.post(f"{base_url}/api/auth/login",
                                      json={"username": "Eitanp", "password": "Gpepeitan!23"}).json()["token"]
        ah = {"Authorization": f"Bearer {admin_login}", "Content-Type": "application/json"}
        api_client.post(f"{base_url}/api/staff", headers=ah,
                        json={"username": uname, "password": pwd, "displayName": "Rost NonAdmin", "isAdmin": False})
        tok = api_client.post(f"{base_url}/api/auth/login",
                              json={"username": uname, "password": pwd}).json()["token"]
        nh = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        r = api_client.delete(f"{base_url}/api/roster/{state['rg_id']}", headers=nh)
        assert r.status_code == 403


# ---------------- ROSTER LOOKUP / SEARCH (public) ----------------
class TestRosterPublic:
    def test_lookup_existing(self, base_url):
        r = requests.get(f"{base_url}/api/roster/lookup/{state['rg_inv']}")
        assert r.status_code == 200
        d = r.json()
        assert d["found"] is True
        assert d["fullName"] == "TEST Roster Person"
        assert d["invoiceNumber"] == state["rg_inv"]

    def test_lookup_missing(self, base_url):
        r = requests.get(f"{base_url}/api/roster/lookup/QB-DOES-NOT-EXIST-ZZZ")
        assert r.status_code == 200
        assert r.json() == {"found": False}

    def test_search_public(self, base_url):
        r = requests.get(f"{base_url}/api/roster/search", params={"q": "TEST Roster"})
        assert r.status_code == 200
        data = r.json()
        assert any(x["invoiceNumber"] == state["rg_inv"] for x in data)

    def test_search_exclude_invoice(self, base_url):
        r = requests.get(f"{base_url}/api/roster/search",
                         params={"q": "TEST Roster", "excludeInvoice": state["rg_inv"]})
        assert r.status_code == 200
        assert not any(x["invoiceNumber"] == state["rg_inv"] for x in r.json())

    def test_search_empty_q(self, base_url):
        r = requests.get(f"{base_url}/api/roster/search", params={"q": ""})
        assert r.status_code == 200
        assert r.json() == []


# ---------------- CSV IMPORT ----------------
class TestRosterCSV:
    def test_import_csv_multipart_insert(self, api_client, base_url, admin_headers):
        ts = int(time.time())
        state["csv_invs"] = [f"TEST-CSV-{ts}-A", f"TEST-CSV-{ts}-B", f"TEST-CSV-{ts}-C"]
        csv_content = (
            "Invoice_Number,Full_Name,Email\n"
            f"{state['csv_invs'][0]},Csv Alice,a@x.io\n"
            f"{state['csv_invs'][1]},Csv Bob,b@x.io\n"
            f"{state['csv_invs'][2]},Csv Carol,c@x.io\n"
        )
        files = {"file": ("roster.csv", csv_content, "text/csv")}
        h = {"Authorization": admin_headers["Authorization"]}  # no Content-Type for multipart
        r = requests.post(f"{base_url}/api/roster/import-csv", headers=h, files=files)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["inserted"] == 3
        assert d["updated"] == 0
        assert d["skipped"] == 0
        # verify they appear
        lr = api_client.get(f"{base_url}/api/roster", headers=admin_headers,
                            params={"search": f"TEST-CSV-{ts}"})
        invs_present = {x["invoiceNumber"] for x in lr.json()}
        for inv in state["csv_invs"]:
            assert inv in invs_present

    def test_import_csv_reimport_updates(self, api_client, base_url, admin_headers):
        ts = int(time.time())
        csv_content = (
            "invoice,name,Email\n"  # mixed case + alias headers
            f"{state['csv_invs'][0]},Csv Alice Updated,a2@x.io\n"
            f"{state['csv_invs'][1]},Csv Bob Updated,b2@x.io\n"
        )
        files = {"file": ("roster.csv", csv_content, "text/csv")}
        h = {"Authorization": admin_headers["Authorization"]}
        r = requests.post(f"{base_url}/api/roster/import-csv", headers=h, files=files)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["inserted"] == 0
        assert d["updated"] == 2
        # verify name actually updated
        lr = api_client.get(f"{base_url}/api/roster", headers=admin_headers,
                            params={"search": state["csv_invs"][0]})
        row = next(x for x in lr.json() if x["invoiceNumber"] == state["csv_invs"][0])
        assert row["fullName"] == "Csv Alice Updated"

    def test_import_csv_raw_body(self, api_client, base_url, admin_headers):
        ts = int(time.time())
        inv = f"TEST-CSV-RAW-{ts}"
        csv_content = f"invoice_number,full_name\n{inv},Raw Body Guest\n"
        h = {"Authorization": admin_headers["Authorization"], "Content-Type": "text/csv"}
        r = requests.post(f"{base_url}/api/roster/import-csv", headers=h, data=csv_content)
        assert r.status_code == 200, r.text
        assert r.json()["inserted"] == 1

    def test_import_csv_bad_headers_400(self, api_client, base_url, admin_headers):
        csv_content = "foo,bar\n1,2\n"
        files = {"file": ("bad.csv", csv_content, "text/csv")}
        h = {"Authorization": admin_headers["Authorization"]}
        r = requests.post(f"{base_url}/api/roster/import-csv", headers=h, files=files)
        assert r.status_code == 400
        assert "invoice" in r.text.lower() or "name" in r.text.lower()


# ---------------- AUTO-LINKING ----------------
class TestAutoLinking:
    def test_forward_autolink_when_other_already_submitted(self, api_client, base_url):
        """B submits first, then A submits with linkedInvoiceNumbers=[B.invoice].
        A's pref should be confirmed immediately."""
        ts = int(time.time())
        inv_a = f"TEST-FWD-A-{ts}"
        inv_b = f"TEST-FWD-B-{ts}"
        # B submits first (no linked)
        rb = api_client.post(f"{base_url}/api/guests", json={
            "fullName": "Fwd Bob", "invoiceNumber": inv_b, "partySize": 2,
            "seatingPreferences": [], "linkedInvoiceNumbers": [],
        })
        assert rb.status_code == 201
        gid_b = rb.json()["guest"]["id"]
        # A submits with link to B
        ra = api_client.post(f"{base_url}/api/guests", json={
            "fullName": "Fwd Alice", "invoiceNumber": inv_a, "partySize": 2,
            "seatingPreferences": ["Fwd Bob"], "linkedInvoiceNumbers": [inv_b],
        })
        assert ra.status_code == 201
        gid_a = ra.json()["guest"]["id"]
        state["fwd_a"] = gid_a; state["fwd_b"] = gid_b
        state["fwd_a_inv"] = inv_a; state["fwd_b_inv"] = inv_b

        # need to login to read pref resolutions
        token = api_client.post(f"{base_url}/api/auth/login",
                                json={"username": "Eitanp", "password": "Gpepeitan!23"}).json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        pr = api_client.get(f"{base_url}/api/guests/{gid_a}/preference-resolutions", headers=h)
        assert pr.status_code == 200
        rows = pr.json()
        assert len(rows) == 1
        assert rows[0]["resolutionStatus"] == "confirmed"
        assert rows[0]["resolvedGuestId"] == gid_b
        assert rows[0]["fuzzyScore"] == 1.0

    def test_reverse_autolink(self, api_client, base_url, admin_headers):
        """KEY TEST: A submits with link to B BEFORE B submits.
        A's pref starts pending. Then B submits. A's pref must auto-confirm."""
        ts = int(time.time())
        inv_a = f"TEST-REV-A-{ts}"
        inv_b = f"TEST-REV-B-{ts}"

        # A submits FIRST with link to (not-yet-submitted) B
        ra = api_client.post(f"{base_url}/api/guests", json={
            "fullName": "Rev Alice", "invoiceNumber": inv_a, "partySize": 2,
            "seatingPreferences": ["Rev Bob"], "linkedInvoiceNumbers": [inv_b],
        })
        assert ra.status_code == 201
        gid_a = ra.json()["guest"]["id"]

        # verify pref is pending right now
        pr = api_client.get(f"{base_url}/api/guests/{gid_a}/preference-resolutions",
                            headers=admin_headers)
        assert pr.status_code == 200
        rows = pr.json()
        assert len(rows) == 1
        assert rows[0]["resolutionStatus"] == "pending"
        assert rows[0]["resolvedGuestId"] is None

        # NOW B submits
        rb = api_client.post(f"{base_url}/api/guests", json={
            "fullName": "Rev Bob", "invoiceNumber": inv_b, "partySize": 3,
            "seatingPreferences": [], "linkedInvoiceNumbers": [],
        })
        assert rb.status_code == 201
        gid_b = rb.json()["guest"]["id"]
        state["rev_a"] = gid_a; state["rev_b"] = gid_b
        state["rev_a_inv"] = inv_a; state["rev_b_inv"] = inv_b

        # Re-check A's preference — should now be auto-confirmed to B
        pr2 = api_client.get(f"{base_url}/api/guests/{gid_a}/preference-resolutions",
                             headers=admin_headers)
        rows2 = pr2.json()
        assert len(rows2) == 1
        assert rows2[0]["resolutionStatus"] == "confirmed", f"Expected confirmed, got {rows2[0]}"
        assert rows2[0]["resolvedGuestId"] == gid_b
        assert rows2[0]["fuzzyScore"] == 1.0

    def test_mutual_after_both_link(self, api_client, base_url, admin_headers):
        """Both A and B submit with linkedInvoiceNumbers pointing to each other → mutual."""
        ts = int(time.time())
        inv_a = f"TEST-MUT-A-{ts}"
        inv_b = f"TEST-MUT-B-{ts}"
        # A first (linking to B not yet submitted)
        ra = api_client.post(f"{base_url}/api/guests", json={
            "fullName": "Mut Alice", "invoiceNumber": inv_a, "partySize": 2,
            "seatingPreferences": ["Mut Bob"], "linkedInvoiceNumbers": [inv_b],
        })
        assert ra.status_code == 201
        gid_a = ra.json()["guest"]["id"]
        # B second (linking back to A)
        rb = api_client.post(f"{base_url}/api/guests", json={
            "fullName": "Mut Bob", "invoiceNumber": inv_b, "partySize": 3,
            "seatingPreferences": ["Mut Alice"], "linkedInvoiceNumbers": [inv_a],
        })
        assert rb.status_code == 201
        gid_b = rb.json()["guest"]["id"]

        # mutual endpoint should return the pair (in either direction)
        m = api_client.get(f"{base_url}/api/preferences/mutual", headers=admin_headers)
        assert m.status_code == 200
        pairs = m.json()
        found = any(
            (p["a_id"] == gid_a and p["b_id"] == gid_b)
            or (p["a_id"] == gid_b and p["b_id"] == gid_a)
            for p in pairs
        )
        assert found, f"Mutual pair not found for {gid_a}/{gid_b}: {pairs}"

    def test_no_linked_invoices_falls_through_to_fuzzy(self, api_client, base_url, admin_headers):
        """When linkedInvoiceNumbers is omitted/empty, pref goes to unresolved (legacy fuzzy)."""
        ts = int(time.time())
        inv = f"TEST-FUZZY-{ts}"
        r = api_client.post(f"{base_url}/api/guests", json={
            "fullName": "Fuzzy Solo", "invoiceNumber": inv, "partySize": 2,
            "seatingPreferences": ["Some Random Name 99"], "linkedInvoiceNumbers": [""],
        })
        assert r.status_code == 201
        gid = r.json()["guest"]["id"]
        pr = api_client.get(f"{base_url}/api/guests/{gid}/preference-resolutions",
                            headers=admin_headers)
        rows = pr.json()
        assert len(rows) == 1
        # still pending, no resolved guest
        assert rows[0]["resolutionStatus"] == "pending"
        assert rows[0]["resolvedGuestId"] is None
