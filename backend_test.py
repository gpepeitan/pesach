#!/usr/bin/env python3
"""
Phase 4 Backend Test Suite for Passover Seating Manager
Tests ballroom canvas extensions: schema fields, canvas-settings endpoint, 
tables width_in/length_in, canvas_objects properties + doors + rooms
"""
import os
import sys
import requests
import json

# Read base URL from frontend/.env
BASE_URL = None
env_path = "/app/frontend/.env"
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
                break

if not BASE_URL:
    print("❌ FATAL: Could not read REACT_APP_BACKEND_URL from /app/frontend/.env")
    sys.exit(1)

API_BASE = f"{BASE_URL}/api"
print(f"🔗 Testing against: {API_BASE}\n")

# Test credentials
ADMIN_USER = "admin"
ADMIN_PASS = "admin123"

# Global token
TOKEN = None

def login():
    """Authenticate and get token"""
    global TOKEN
    print("🔐 Logging in as admin...")
    resp = requests.post(f"{API_BASE}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
    if resp.status_code != 200:
        print(f"❌ Login failed: {resp.status_code} {resp.text}")
        sys.exit(1)
    data = resp.json()
    TOKEN = data["token"]
    print(f"✅ Logged in. Token: {TOKEN[:20]}...\n")

def headers(auth=True):
    """Return headers with optional auth"""
    h = {"Content-Type": "application/json"}
    if auth and TOKEN:
        h["Authorization"] = f"Bearer {TOKEN}"
    return h

def test_health():
    """Test GET /api/health"""
    print("🧪 Test: GET /api/health")
    resp = requests.get(f"{API_BASE}/health")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    assert resp.json().get("status") == "ok", "Health check failed"
    print("✅ Health check passed\n")

def test_ballroom_schema_extensions():
    """Test that GET /api/ballrooms returns new fields with correct defaults"""
    print("🧪 Test: Ballroom schema extensions (snapEnabled, gridSizeIn, bgOpacity, bgVisible, bgCalibration, pxPerFt)")
    
    # Create a fresh ballroom
    resp = requests.post(f"{API_BASE}/ballrooms", 
                        json={"name": "Test Ballroom Schema", "widthFt": 80, "heightFt": 60},
                        headers=headers())
    assert resp.status_code == 201, f"Failed to create ballroom: {resp.status_code} {resp.text}"
    br = resp.json()
    br_id = br["id"]
    print(f"  Created ballroom ID={br_id}")
    
    # Verify all new fields are present with correct defaults
    assert "snapEnabled" in br, "Missing snapEnabled"
    assert br["snapEnabled"] == True, f"snapEnabled should default to True, got {br['snapEnabled']}"
    
    assert "gridSizeIn" in br, "Missing gridSizeIn"
    assert br["gridSizeIn"] == 6.0, f"gridSizeIn should default to 6, got {br['gridSizeIn']}"
    
    assert "bgOpacity" in br, "Missing bgOpacity"
    assert 0.54 <= br["bgOpacity"] <= 0.56, f"bgOpacity should default to ~0.55, got {br['bgOpacity']}"
    
    assert "bgVisible" in br, "Missing bgVisible"
    assert br["bgVisible"] == True, f"bgVisible should default to True, got {br['bgVisible']}"
    
    assert "bgCalibration" in br, "Missing bgCalibration"
    assert br["bgCalibration"] == {}, f"bgCalibration should default to {{}}, got {br['bgCalibration']}"
    
    assert "pxPerFt" in br, "Missing pxPerFt"
    assert br["pxPerFt"] == 12.0, f"pxPerFt should default to 12, got {br['pxPerFt']}"
    
    # Verify pre-existing fields still present
    assert "id" in br and "name" in br and "widthFt" in br and "heightFt" in br
    assert "backgroundImageUrl" in br and "scaleFactor" in br and "createdAt" in br
    
    print("✅ All ballroom schema fields present with correct defaults\n")
    return br_id

def test_canvas_settings_endpoint(ballroom_id):
    """Test PATCH /api/ballrooms/{id}/canvas-settings"""
    print(f"🧪 Test: PATCH /api/ballrooms/{ballroom_id}/canvas-settings")
    
    # Test 1: Update multiple fields
    print("  Test 1: Update snapEnabled, gridSizeIn, bgOpacity, bgVisible, pxPerFt, widthFt, heightFt")
    payload = {
        "snapEnabled": False,
        "gridSizeIn": 3,
        "bgOpacity": 0.42,
        "bgVisible": False,
        "pxPerFt": 14,
        "widthFt": 100,
        "heightFt": 75
    }
    resp = requests.patch(f"{API_BASE}/ballrooms/{ballroom_id}/canvas-settings",
                         json=payload, headers=headers())
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    br = resp.json()
    assert br["snapEnabled"] == False, f"snapEnabled not updated: {br['snapEnabled']}"
    assert br["gridSizeIn"] == 3.0, f"gridSizeIn not updated: {br['gridSizeIn']}"
    assert 0.41 <= br["bgOpacity"] <= 0.43, f"bgOpacity not updated: {br['bgOpacity']}"
    assert br["bgVisible"] == False, f"bgVisible not updated: {br['bgVisible']}"
    assert br["pxPerFt"] == 14.0, f"pxPerFt not updated: {br['pxPerFt']}"
    assert br["widthFt"] == 100.0, f"widthFt not updated: {br['widthFt']}"
    assert br["heightFt"] == 75.0, f"heightFt not updated: {br['heightFt']}"
    print("  ✅ Multiple fields updated correctly")
    
    # Test 2: Update bgCalibration (nested object)
    print("  Test 2: Update bgCalibration with nested object")
    calib = {"p1x": 10, "p1y": 20, "p2x": 110, "p2y": 20, "knownFt": 50}
    resp = requests.patch(f"{API_BASE}/ballrooms/{ballroom_id}/canvas-settings",
                         json={"bgCalibration": calib}, headers=headers())
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    br = resp.json()
    assert br["bgCalibration"] == calib, f"bgCalibration not updated correctly: {br['bgCalibration']}"
    print("  ✅ bgCalibration nested object updated correctly")
    
    # Test 3: Empty body should return 400
    print("  Test 3: Empty body should return 400")
    resp = requests.patch(f"{API_BASE}/ballrooms/{ballroom_id}/canvas-settings",
                         json={}, headers=headers())
    assert resp.status_code == 400, f"Expected 400 for empty body, got {resp.status_code}"
    print("  ✅ Empty body correctly rejected with 400")
    
    # Test 4: No auth should return 401
    print("  Test 4: No Authorization header should return 401")
    resp = requests.patch(f"{API_BASE}/ballrooms/{ballroom_id}/canvas-settings",
                         json={"snapEnabled": True}, headers={"Content-Type": "application/json"})
    assert resp.status_code == 401, f"Expected 401 without auth, got {resp.status_code}"
    print("  ✅ Correctly rejected without auth (401)")
    
    # Test 5: Invalid token should return 401
    print("  Test 5: Invalid Bearer token should return 401")
    bad_headers = {"Content-Type": "application/json", "Authorization": "Bearer GARBAGE_TOKEN_12345"}
    resp = requests.patch(f"{API_BASE}/ballrooms/{ballroom_id}/canvas-settings",
                         json={"snapEnabled": True}, headers=bad_headers)
    assert resp.status_code == 401, f"Expected 401 with bad token, got {resp.status_code}"
    print("  ✅ Correctly rejected with invalid token (401)")
    
    print("✅ PATCH /api/ballrooms/{id}/canvas-settings all tests passed\n")

def test_tables_width_length():
    """Test tables width_in / length_in"""
    print("🧪 Test: Tables width_in / length_in")
    
    # Create a ballroom for tables
    resp = requests.post(f"{API_BASE}/ballrooms",
                        json={"name": "Table Test Ballroom", "widthFt": 100, "heightFt": 80},
                        headers=headers())
    assert resp.status_code == 201, f"Failed to create ballroom: {resp.status_code}"
    br_id = resp.json()["id"]
    print(f"  Created ballroom ID={br_id}")
    
    # Test 1: Create rectangular table with explicit widthIn and lengthIn
    print("  Test 1: Create rectangular table with widthIn=96, lengthIn=48")
    resp = requests.post(f"{API_BASE}/tables",
                        json={
                            "tableNumber": 99,
                            "ballroomId": br_id,
                            "shape": "rectangular",
                            "maxCapacity": 12,
                            "widthIn": 96,
                            "lengthIn": 48
                        },
                        headers=headers())
    assert resp.status_code == 201, f"Failed to create table: {resp.status_code} {resp.text}"
    tbl = resp.json()
    tbl_id = tbl["id"]
    assert tbl["widthIn"] == 96.0, f"widthIn should be 96, got {tbl['widthIn']}"
    assert tbl["lengthIn"] == 48.0, f"lengthIn should be 48, got {tbl['lengthIn']}"
    print(f"  ✅ Rectangular table created with widthIn=96, lengthIn=48 (ID={tbl_id})")
    
    # Test 2: PATCH table to update widthIn and lengthIn
    print("  Test 2: PATCH table to update widthIn=120, lengthIn=36")
    resp = requests.patch(f"{API_BASE}/tables/{tbl_id}",
                         json={"widthIn": 120, "lengthIn": 36},
                         headers=headers())
    assert resp.status_code == 200, f"Failed to update table: {resp.status_code} {resp.text}"
    tbl = resp.json()
    assert tbl["widthIn"] == 120.0, f"widthIn should be 120, got {tbl['widthIn']}"
    assert tbl["lengthIn"] == 36.0, f"lengthIn should be 36, got {tbl['lengthIn']}"
    print("  ✅ Table dimensions updated correctly")
    
    # Test 3: Create round table (should default to 60x60)
    print("  Test 3: Create round table (should default widthIn=60, lengthIn=60)")
    resp = requests.post(f"{API_BASE}/tables",
                        json={
                            "tableNumber": 101,
                            "ballroomId": br_id,
                            "shape": "round",
                            "maxCapacity": 10
                        },
                        headers=headers())
    assert resp.status_code == 201, f"Failed to create round table: {resp.status_code} {resp.text}"
    tbl = resp.json()
    assert tbl["widthIn"] == 60.0, f"Round table widthIn should default to 60, got {tbl['widthIn']}"
    assert tbl["lengthIn"] == 60.0, f"Round table lengthIn should default to 60, got {tbl['lengthIn']}"
    print("  ✅ Round table defaults to widthIn=60, lengthIn=60")
    
    # Test 4: Create square table with widthIn=48 (should force lengthIn=48)
    print("  Test 4: Create square table with widthIn=48 (should force lengthIn=48)")
    resp = requests.post(f"{API_BASE}/tables",
                        json={
                            "tableNumber": 102,
                            "ballroomId": br_id,
                            "shape": "square",
                            "maxCapacity": 8,
                            "widthIn": 48
                        },
                        headers=headers())
    assert resp.status_code == 201, f"Failed to create square table: {resp.status_code} {resp.text}"
    tbl = resp.json()
    assert tbl["widthIn"] == 48.0, f"Square table widthIn should be 48, got {tbl['widthIn']}"
    assert tbl["lengthIn"] == 48.0, f"Square table lengthIn should be forced to 48, got {tbl['lengthIn']}"
    print("  ✅ Square table correctly forces lengthIn = widthIn")
    
    # Test 5: Verify GET /api/tables returns widthIn/lengthIn
    print("  Test 5: Verify GET /api/tables returns widthIn/lengthIn for all tables")
    resp = requests.get(f"{API_BASE}/tables?ballroomId={br_id}", headers=headers())
    assert resp.status_code == 200, f"Failed to list tables: {resp.status_code}"
    tables = resp.json()
    assert len(tables) >= 3, f"Expected at least 3 tables, got {len(tables)}"
    for t in tables:
        assert "widthIn" in t, f"Table {t['id']} missing widthIn"
        assert "lengthIn" in t, f"Table {t['id']} missing lengthIn"
    print("  ✅ All tables have widthIn and lengthIn fields")
    
    print("✅ Tables width_in / length_in all tests passed\n")

def test_canvas_objects_properties_doors_rooms():
    """Test canvas_objects properties field, door objectType, and room types"""
    print("🧪 Test: Canvas objects properties + doors + rooms")
    
    # Create a ballroom for canvas objects
    resp = requests.post(f"{API_BASE}/ballrooms",
                        json={"name": "Canvas Objects Test", "widthFt": 120, "heightFt": 90},
                        headers=headers())
    assert resp.status_code == 201, f"Failed to create ballroom: {resp.status_code}"
    br_id = resp.json()["id"]
    print(f"  Created ballroom ID={br_id}")
    
    # Test 1: Create door with properties
    print("  Test 1: Create door with properties (isDouble, swingDirection, hingeSide, widthIn)")
    door_props = {
        "isDouble": True,
        "swingDirection": "right",
        "hingeSide": "left",
        "widthIn": 72
    }
    resp = requests.post(f"{API_BASE}/canvas-objects",
                        json={
                            "ballroomId": br_id,
                            "objectType": "door",
                            "x": 100,
                            "y": 0,
                            "width": 72,
                            "height": 12,
                            "rotation": 0,
                            "properties": door_props
                        },
                        headers=headers())
    assert resp.status_code == 201, f"Failed to create door: {resp.status_code} {resp.text}"
    door = resp.json()
    door_id = door["id"]
    assert door["objectType"] == "door", f"objectType should be 'door', got {door['objectType']}"
    assert door["properties"] == door_props, f"properties not saved correctly: {door['properties']}"
    print(f"  ✅ Door created with full properties (ID={door_id})")
    
    # Test 2: PATCH door properties (merge semantics - should retain other keys)
    print("  Test 2: PATCH door properties (swingDirection only) - should MERGE, not replace")
    resp = requests.patch(f"{API_BASE}/canvas-objects/{door_id}",
                         json={"properties": {"swingDirection": "left"}},
                         headers=headers())
    assert resp.status_code == 200, f"Failed to update door: {resp.status_code} {resp.text}"
    door = resp.json()
    # Should have swingDirection updated but other keys retained
    assert door["properties"]["swingDirection"] == "left", f"swingDirection not updated: {door['properties']}"
    assert door["properties"]["isDouble"] == True, f"isDouble should be retained: {door['properties']}"
    assert door["properties"]["hingeSide"] == "left", f"hingeSide should be retained: {door['properties']}"
    assert door["properties"]["widthIn"] == 72, f"widthIn should be retained: {door['properties']}"
    print("  ✅ Properties correctly merged (swingDirection updated, other keys retained)")
    
    # Test 3: Create room_bathroom
    print("  Test 3: Create room_bathroom")
    resp = requests.post(f"{API_BASE}/canvas-objects",
                        json={
                            "ballroomId": br_id,
                            "objectType": "room_bathroom",
                            "label": "Men's Restroom",
                            "x": 200,
                            "y": 50,
                            "width": 120,
                            "height": 80,
                            "rotation": 0
                        },
                        headers=headers())
    assert resp.status_code == 201, f"Failed to create room_bathroom: {resp.status_code} {resp.text}"
    bathroom = resp.json()
    assert bathroom["objectType"] == "room_bathroom", f"objectType should be 'room_bathroom', got {bathroom['objectType']}"
    print(f"  ✅ room_bathroom created (ID={bathroom['id']})")
    
    # Test 4: Create room_hallway
    print("  Test 4: Create room_hallway")
    resp = requests.post(f"{API_BASE}/canvas-objects",
                        json={
                            "ballroomId": br_id,
                            "objectType": "room_hallway",
                            "label": "Main Hallway",
                            "x": 50,
                            "y": 200,
                            "width": 300,
                            "height": 60,
                            "rotation": 0
                        },
                        headers=headers())
    assert resp.status_code == 201, f"Failed to create room_hallway: {resp.status_code} {resp.text}"
    hallway = resp.json()
    assert hallway["objectType"] == "room_hallway", f"objectType should be 'room_hallway', got {hallway['objectType']}"
    print(f"  ✅ room_hallway created (ID={hallway['id']})")
    
    # Test 5: Create room_ballroom
    print("  Test 5: Create room_ballroom")
    resp = requests.post(f"{API_BASE}/canvas-objects",
                        json={
                            "ballroomId": br_id,
                            "objectType": "room_ballroom",
                            "label": "Main Ballroom",
                            "x": 400,
                            "y": 100,
                            "width": 500,
                            "height": 400,
                            "rotation": 0
                        },
                        headers=headers())
    assert resp.status_code == 201, f"Failed to create room_ballroom: {resp.status_code} {resp.text}"
    ballroom_obj = resp.json()
    assert ballroom_obj["objectType"] == "room_ballroom", f"objectType should be 'room_ballroom', got {ballroom_obj['objectType']}"
    print(f"  ✅ room_ballroom created (ID={ballroom_obj['id']})")
    
    # Test 6: GET /api/ballrooms/{id}/canvas-objects - verify all objects with properties
    print("  Test 6: GET /api/ballrooms/{id}/canvas-objects - verify all objects present")
    resp = requests.get(f"{API_BASE}/ballrooms/{br_id}/canvas-objects", headers=headers())
    assert resp.status_code == 200, f"Failed to list canvas objects: {resp.status_code}"
    objects = resp.json()
    assert len(objects) >= 4, f"Expected at least 4 objects, got {len(objects)}"
    
    # Find door and verify properties
    door_obj = next((o for o in objects if o["id"] == door_id), None)
    assert door_obj is not None, "Door not found in list"
    assert "properties" in door_obj, "Door missing properties field"
    assert door_obj["properties"]["swingDirection"] == "left", "Door properties not persisted correctly"
    
    # Verify room types present
    room_types = [o["objectType"] for o in objects]
    assert "room_bathroom" in room_types, "room_bathroom not in list"
    assert "room_hallway" in room_types, "room_hallway not in list"
    assert "room_ballroom" in room_types, "room_ballroom not in list"
    print("  ✅ All canvas objects (door + rooms) present with properties")
    
    print("✅ Canvas objects properties + doors + rooms all tests passed\n")

def test_backwards_compatibility():
    """Smoke test existing endpoints from earlier phases"""
    print("🧪 Test: Backwards compatibility (smoke tests)")
    
    # GET /api/health
    resp = requests.get(f"{API_BASE}/health")
    assert resp.status_code == 200, "GET /api/health failed"
    print("  ✅ GET /api/health")
    
    # GET /api/ballrooms
    resp = requests.get(f"{API_BASE}/ballrooms", headers=headers())
    assert resp.status_code == 200, "GET /api/ballrooms failed"
    ballrooms = resp.json()
    assert isinstance(ballrooms, list), "GET /api/ballrooms should return list"
    print(f"  ✅ GET /api/ballrooms (found {len(ballrooms)} ballrooms)")
    
    # POST /api/ballrooms
    resp = requests.post(f"{API_BASE}/ballrooms",
                        json={"name": "Compat Test", "widthFt": 50, "heightFt": 40},
                        headers=headers())
    assert resp.status_code == 201, f"POST /api/ballrooms failed: {resp.status_code}"
    br_id = resp.json()["id"]
    print(f"  ✅ POST /api/ballrooms (created ID={br_id})")
    
    # GET /api/tables
    resp = requests.get(f"{API_BASE}/tables?ballroomId={br_id}", headers=headers())
    assert resp.status_code == 200, "GET /api/tables failed"
    print("  ✅ GET /api/tables")
    
    # Create a canvas object and delete it
    resp = requests.post(f"{API_BASE}/canvas-objects",
                        json={
                            "ballroomId": br_id,
                            "objectType": "stage",
                            "x": 10,
                            "y": 10,
                            "width": 100,
                            "height": 50
                        },
                        headers=headers())
    assert resp.status_code == 201, f"POST /api/canvas-objects failed: {resp.status_code}"
    obj_id = resp.json()["id"]
    print(f"  ✅ POST /api/canvas-objects (created ID={obj_id})")
    
    # DELETE /api/canvas-objects/{id}
    resp = requests.delete(f"{API_BASE}/canvas-objects/{obj_id}", headers=headers())
    assert resp.status_code == 204, f"DELETE /api/canvas-objects failed: {resp.status_code}"
    print("  ✅ DELETE /api/canvas-objects")
    
    print("✅ Backwards compatibility smoke tests passed\n")

def main():
    print("=" * 70)
    print("Phase 4 Backend Test Suite - Ballroom Canvas Extensions")
    print("=" * 70)
    print()
    
    try:
        # Login first
        login()
        
        # Run all tests
        test_health()
        
        # Task 1: Ballroom schema extensions
        br_id = test_ballroom_schema_extensions()
        
        # Task 2: PATCH /api/ballrooms/{id}/canvas-settings
        test_canvas_settings_endpoint(br_id)
        
        # Task 3: Tables width_in / length_in
        test_tables_width_length()
        
        # Task 4: Canvas objects properties + doors + rooms
        test_canvas_objects_properties_doors_rooms()
        
        # Task 5: Backwards compatibility
        test_backwards_compatibility()
        
        print("=" * 70)
        print("🎉 ALL TESTS PASSED")
        print("=" * 70)
        return 0
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return 1
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
