#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Phase 4 — Ballroom Canvas engineering brief. Improvements to /app/frontend/src/pages/BallroomCanvas.jsx
  and supporting backend changes:
    1. Hide grid lines on the canvas, but keep snapping. Add toolbar toggle for snap.
    2. Display room dimensions on the canvas edges and allow live edits via a side panel.
    3. Upload an image OR PDF floor plan, two-click calibration, opacity slider, show/hide toggle.
    4. Auto-place chairs around tables based on capacity (round=around perimeter, rect/square=along sides).
    5. Display table dimensions ("60in round" / "8ft x 4ft") on canvas and allow resize via corner handles & side panel.
    6. Universal corner-resize + 45-degree-snap rotation handle for every object (Shift = free rotate).
    7. Door object (single + double); auto-snap to nearest wall; configurable swing direction (L/R) and hinge side.
    8. Multi-room layout on a single canvas (ballroom / bathroom / hallway placeable rooms).
    9. Bathroom placeable as a labelable, resizable room.
    10. Fix the drag bug where dragging continues after mouse release (use window-level pointerup/pointercancel).

  Also save the Commercialization-Phase brief to repo for later (FUTURE_COMMERCIAL_READINESS.md) and
  maintain TASKS.md and PROGRESS_LOG.md.

backend:
  - task: "Extend ballroom schema (snap, grid, bg opacity/visible, calibration, pxPerFt)"
    implemented: true
    working: true
    file: "backend/db.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Idempotent ALTER TABLE statements added; existing columns preserved. Smoke-tested via curl."
        - working: true
          agent: "testing"
          comment: "✅ PASSED. All ballroom schema fields present with correct defaults: snapEnabled=true, gridSizeIn=6.0, bgOpacity=0.55, bgVisible=true, bgCalibration={}, pxPerFt=12.0. Pre-existing fields (id, name, widthFt, heightFt, backgroundImageUrl, scaleFactor, createdAt) all intact. Idempotent ALTER TABLE statements work correctly."

  - task: "Extend tables with width_in / length_in"
    implemented: true
    working: true
    file: "backend/server.py, backend/db.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "create_table / update_table accept widthIn and lengthIn; table_to_api returns them. Defaults: round=60in dia, rect=96x30in."
        - working: true
          agent: "testing"
          comment: "✅ PASSED. POST /api/tables correctly accepts widthIn/lengthIn and returns them. PATCH /api/tables updates dimensions correctly. Defaults work: round=60x60in, rect=96x48in (note: code uses 96x48, not 96x30). Square tables correctly force lengthIn=widthIn. GET /api/tables returns widthIn/lengthIn for all tables."

  - task: "Extend canvas_objects with properties (jsonb) and door support"
    implemented: true
    working: true
    file: "backend/server.py, backend/db.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "CanvasObjectInput/Update include `properties` dict; door objectType accepted; properties merge-on-update."
        - working: true
          agent: "testing"
          comment: "✅ PASSED. POST /api/canvas-objects accepts properties dict and persists it correctly. Door objectType works. PATCH /api/canvas-objects correctly MERGES properties (partial update retains other keys). Room types (room_bathroom, room_hallway, room_ballroom) all work. GET /api/ballrooms/{id}/canvas-objects returns all objects with properties intact."

  - task: "New endpoint PATCH /api/ballrooms/{id}/canvas-settings"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Accepts snapEnabled, gridSizeIn, bgOpacity, bgVisible, bgCalibration, pxPerFt, widthFt, heightFt. Admin-only (require_admin). Smoke-tested via curl returns updated ballroom."
        - working: true
          agent: "testing"
          comment: "✅ PASSED. PATCH /api/ballrooms/{id}/canvas-settings correctly updates all fields (snapEnabled, gridSizeIn, bgOpacity, bgVisible, pxPerFt, widthFt, heightFt). bgCalibration nested object updates correctly. Empty body returns 400. No auth returns 401. Invalid token returns 401. Admin-only enforcement working."

frontend:
  - task: "Ballroom Canvas: hide grid + snap toggle + finer grid"
    implemented: true
    working: true
    file: "frontend/src/pages/BallroomCanvas.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Grid pattern made transparent. Snap toggle in top toolbar + side panel. Grid size in inches configurable (default 6in)."
        - working: true
          agent: "testing"
          comment: "✅ PASSED. Grid is intentionally near-transparent (rgba(255,255,255,0.04)). Snap toggle in toolbar changes text between 'Snap on' and 'Snap off'. Grid size input in side panel accepts values (tested with 3in) and updates via PATCH /canvas-settings without errors."

  - task: "Ballroom Canvas: blueprint dimension labels + live edit"
    implemented: true
    working: true
    file: "frontend/src/pages/BallroomCanvas.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Edges show width/height in ft+in; side panel inputs commit on blur via PATCH /canvas-settings."
        - working: true
          agent: "testing"
          comment: "✅ PASSED. Room dimension labels visible on canvas edges (top and right). Side panel inputs for Width (ft) and Height (ft) accept changes and update live. Tested changing from 120x90ft to 90x70ft - dimension labels updated correctly on canvas."

  - task: "Ballroom Canvas: floor-plan upload (image + PDF) + calibration + opacity + visibility"
    implemented: true
    working: false
    file: "frontend/src/pages/BallroomCanvas.jsx"
    stuck_count: 1
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Uses pdfjs-dist@4.7.76 (CDN worker) for first-page PDF render. Calibration: two-click + known-distance modal updates pxPerFt and stores calibration. Slider for opacity + eye toggle for visibility."
        - working: false
          agent: "testing"
          comment: "❌ PARTIAL FAILURE. Floor plan upload works (PNG uploaded successfully). Toggle visibility button works (eye icon toggles show/hide). Opacity slider works (tested changing to 0.8). HOWEVER, calibration flow has issues: clicking calibrate button shows 'first point' help text, but after clicking first point, the help text doesn't update to ask for 'second point', and the distance input never appears. Calibration click handling appears broken."

  - task: "Ballroom Canvas: chairs around tables (auto-distribute)"
    implemented: true
    working: true
    file: "frontend/src/pages/BallroomCanvas.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Round = chairs around perimeter; rect/square = walk perimeter. Visible in screenshot for capacity=10."
        - working: true
          agent: "testing"
          comment: "✅ PASSED. Round table shows 10 white circles (chairs) distributed evenly around perimeter. Rectangular table shows chairs along all four sides. Chairs are visible and properly positioned relative to table dimensions."

  - task: "Ballroom Canvas: table dimension labels + resize handles + side-panel inputs"
    implemented: true
    working: true
    file: "frontend/src/pages/BallroomCanvas.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Label under each table: '60in round' or '8ft x 4ft'. Corner handles set widthIn/lengthIn via pxToIn."
        - working: true
          agent: "testing"
          comment: "✅ PASSED. Dimension labels visible below each table. Round table shows '60in round' initially, updates to '72in round' after side panel resize. Rectangular table shows dimension format. Side panel inputs for table dimensions work correctly (tested changing diameter from 60in to 72in)."

  - task: "Ballroom Canvas: universal resize + 45-snap rotation (Shift = free)"
    implemented: true
    working: true
    file: "frontend/src/pages/BallroomCanvas.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Four corner handles per selected item; rotation handle at top of bbox; snap to 45 unless Shift held."
        - working: true
          agent: "testing"
          comment: "✅ PASSED. When table is selected, four yellow corner handles appear (tl, tr, bl, br). Rotation handle (yellow circle) visible above selected object with data-testid='rotate-handle'. Visual confirmation of handles present."

  - task: "Ballroom Canvas: door object (single + double) with auto wall-snap"
    implemented: true
    working: false
    file: "frontend/src/pages/BallroomCanvas.jsx"
    stuck_count: 1
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "DoorBody draws blueprint arc + slab. Snap to nearest wall on creation and on release. Side panel: swing direction L/R, hinge side."
        - working: false
          agent: "testing"
          comment: "❌ CRITICAL BUG. Doors are added and auto-snap to walls correctly (visible at bottom of canvas). HOWEVER, when a door object is selected, the side panel does NOT show door-specific controls (door-double-toggle and door-swing-direction selectors are missing). The ObjectPanel component is not rendering door properties correctly. This prevents users from configuring door swing direction and double/single mode via UI."

  - task: "Ballroom Canvas: multi-room placeable shapes (ballroom/bathroom/hallway) on shared canvas"
    implemented: true
    working: true
    file: "frontend/src/pages/BallroomCanvas.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Rooms render as dashed outlined rectangles with label; resizable like any other object."
        - working: true
          agent: "testing"
          comment: "✅ PASSED. Bathroom room added successfully (dashed blue outline with 'BATHROOM' label). Hallway room added successfully (dashed gray outline with 'MAIN HALLWAY' label). Main ballroom room visible (dashed yellow outline with 'MAIN BALLROOM' label). All rooms show dimension labels and are selectable."

  - task: "Ballroom Canvas: drag bug fix (window-level pointer events)"
    implemented: true
    working: true
    file: "frontend/src/pages/BallroomCanvas.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "pointermove + pointerup + pointercancel registered on window in useEffect; drag/resize/rotate state cleared on release regardless of mouse position."
        - working: true
          agent: "testing"
          comment: "✅ PASSED. Code review confirms window.addEventListener is used for pointermove, pointerup, and pointercancel events (lines 373-379). Drag state is cleared on pointerup regardless of mouse position. Ghost-drag bug fix is correctly implemented."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "Ballroom Canvas: door object (single + double) with auto wall-snap"
    - "Ballroom Canvas: floor-plan upload (image + PDF) + calibration + opacity + visibility"
  stuck_tasks:
    - "Ballroom Canvas: door object (single + double) with auto wall-snap"
    - "Ballroom Canvas: floor-plan upload (image + PDF) + calibration + opacity + visibility"
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: |
        Phase 4 ballroom-canvas work complete. Backend changes:
          • idempotent ALTER TABLEs add snap_enabled, grid_size_in, bg_opacity, bg_visible, bg_calibration, px_per_ft on ballrooms;
            width_in / length_in on tables; properties (jsonb) on canvas_objects.
          • PATCH /api/ballrooms/{id}/canvas-settings (admin-only) accepts: snapEnabled, gridSizeIn, bgOpacity, bgVisible,
            bgCalibration, pxPerFt, widthFt, heightFt — returns the full ballroom object.
          • POST/PATCH /api/tables now accept widthIn / lengthIn and return them.
          • POST/PATCH /api/canvas-objects now accept `properties` (dict). On PATCH, properties are MERGED (not replaced).
          • new objectType values accepted: "door", "room_ballroom", "room_bathroom", "room_hallway"
            (server doesn't restrict object_type enum — see server.py CanvasObjectInput).

        Auth: log in via POST /api/auth/login with {username:"admin", password:"admin123"} (seed admin).

        Please test the four backend tasks above. Confirm:
          (a) ALTER TABLEs run idempotently on existing DBs without error.
          (b) Returned JSON from /api/ballrooms includes snapEnabled, gridSizeIn, bgOpacity, bgVisible, bgCalibration, pxPerFt.
          (c) Tables created/updated with widthIn=72 / lengthIn=48 round-trip those values.
          (d) Creating a canvas-object with objectType="door" and properties={isDouble:true, swingDirection:"right"}
              persists and is returned. A PATCH that supplies a different swingDirection only changes that key (merge).
          (e) PATCH /api/ballrooms/{id}/canvas-settings updates partial fields and 401s for non-admin / unauthenticated.

        Local DB: Postgres on 127.0.0.1:5432 (db=pesach, user=pesach, password=pesach_local).
        Admin creds in /app/memory/test_credentials.md.

    - agent: "testing"
      message: |
        ✅ Phase 4 Backend Testing Complete - ALL TESTS PASSED

        Comprehensive test suite executed against https://f147e353-80f8-4b34-b2b8-c1d929d661a8.preview.emergentagent.com/api
        
        Test Results Summary:
        
        1. ✅ Ballroom Schema Extensions (Task 1)
           - All new fields present with correct defaults: snapEnabled=true, gridSizeIn=6.0, bgOpacity=0.55, bgVisible=true, bgCalibration={}, pxPerFt=12.0
           - Pre-existing fields intact (id, name, widthFt, heightFt, backgroundImageUrl, scaleFactor, createdAt)
           - Idempotent ALTER TABLE statements work correctly
        
        2. ✅ PATCH /api/ballrooms/{id}/canvas-settings (Task 4)
           - Successfully updates all fields: snapEnabled, gridSizeIn, bgOpacity, bgVisible, pxPerFt, widthFt, heightFt
           - bgCalibration nested object updates correctly
           - Empty body correctly returns 400
           - No auth correctly returns 401
           - Invalid token correctly returns 401
           - Admin-only enforcement working
        
        3. ✅ Tables width_in / length_in (Task 2)
           - POST /api/tables accepts and returns widthIn/lengthIn
           - PATCH /api/tables updates dimensions correctly
           - Defaults work: round=60x60in, rectangular=96x48in
           - Square tables correctly force lengthIn=widthIn
           - GET /api/tables returns widthIn/lengthIn for all tables
        
        4. ✅ Canvas Objects properties + doors + rooms (Task 3)
           - POST /api/canvas-objects accepts properties dict and persists correctly
           - Door objectType works with full properties (isDouble, swingDirection, hingeSide, widthIn)
           - PATCH /api/canvas-objects correctly MERGES properties (partial update retains other keys)
           - Room types work: room_bathroom, room_hallway, room_ballroom
           - GET /api/ballrooms/{id}/canvas-objects returns all objects with properties intact
        
        5. ✅ Backwards Compatibility
           - GET /api/health: working
           - GET /api/ballrooms: working
           - POST /api/ballrooms: working
           - GET /api/tables: working
           - POST /api/canvas-objects: working
           - DELETE /api/canvas-objects: working
        
        All 4 backend tasks verified and working correctly. No issues found.

    - agent: "testing"
      message: |
        ✅ Phase 4 Ballroom Canvas E2E Testing Complete - 7/9 Features PASSED, 2 CRITICAL BUGS FOUND
        
        Comprehensive end-to-end test executed on https://f147e353-80f8-4b34-b2b8-c1d929d661a8.preview.emergentagent.com
        Login: eitan / Gpepeitan!23 (admin)
        
        === PASSED FEATURES (7/9) ===
        
        ✅ A. Canvas Opens & Renders
           - Ballroom canvas overlay opens successfully
           - Palette visible with all object types (tables, doors, rooms, features)
           - Side panel visible with properties controls
           - SVG canvas renders correctly
           - No console errors on load
        
        ✅ B. Grid & Snap Controls
           - Grid is intentionally near-transparent (rgba(255,255,255,0.04))
           - Snap toggle button changes text between "Snap on" / "Snap off"
           - Grid size input accepts changes (tested 3in) and updates backend
        
        ✅ C. Live Room Dimensions
           - Room dimension labels visible on canvas edges (top: width, right: height)
           - Side panel inputs update dimensions live (tested 120x90ft → 90x70ft)
           - Blueprint labels update correctly after dimension changes
        
        ✅ D. Tables with Auto-Placed Chairs
           - Round table added with 10 chairs distributed evenly around perimeter
           - Rectangular table added with chairs along all four sides
           - Chairs are white circles, properly positioned relative to table
        
        ✅ E. Table Resize & Dimension Labels
           - Dimension labels visible below tables ("60in round", "8ft × 2ft 6in" format)
           - Side panel inputs resize tables correctly (tested 60in → 72in diameter)
           - Labels update after resize
        
        ✅ F. Universal Resize & Rotation Handles
           - Four yellow corner handles appear on selected objects (tl, tr, bl, br)
           - Rotation handle (yellow circle) visible above selected object
           - data-testid="rotate-handle" present
        
        ✅ G. Multi-Room Layout
           - Bathroom room added (dashed blue outline, "BATHROOM" label)
           - Hallway room added (dashed gray outline, "MAIN HALLWAY" label)
           - Main ballroom room visible (dashed yellow outline, "MAIN BALLROOM" label)
           - All rooms show dimension labels and are selectable
        
        ✅ H. Drag Bug Fix
           - Code review confirms window.addEventListener for pointermove/pointerup/pointercancel
           - Drag state cleared on pointerup regardless of mouse position
           - Ghost-drag bug fix correctly implemented (lines 373-379)
        
        ✅ I. Zoom & Pan Controls
           - Zoom in/out buttons work, percentage indicator updates
           - Zoom fit button resets view
           - Close button returns to Tables & Seating page
        
        === CRITICAL BUGS FOUND (2) ===
        
        ❌ BUG 1: Door Properties Not Showing in Side Panel (HIGH PRIORITY)
           Location: /app/frontend/src/pages/BallroomCanvas.jsx - ObjectPanel component
           Issue: When a door object is selected, the side panel does NOT display door-specific controls
           Expected: Should show door-double-toggle and door-swing-direction selectors
           Actual: Side panel shows generic object properties only (width, length, rotation, label)
           Impact: Users cannot configure door swing direction or double/single mode via UI
           Root Cause: ObjectPanel component (lines 999-1044) renders door controls conditionally based on isDoor flag,
                       but the door object may not be properly identified or the properties are not being passed correctly
        
        ❌ BUG 2: Calibration Flow Broken (HIGH PRIORITY)
           Location: /app/frontend/src/pages/BallroomCanvas.jsx - Calibration click handling
           Issue: Calibration two-click flow does not progress past first point
           Steps to Reproduce:
             1. Upload a floor plan image
             2. Click "Calibrate" button
             3. Help banner shows "Click the first point..."
             4. Click first point on canvas
             5. Help banner text does NOT update to "Click the second point..."
             6. Click second point - nothing happens
             7. Distance input never appears
           Expected: After first click, banner should ask for second point, then show distance input
           Actual: Calibration state appears stuck after first click
           Impact: Users cannot calibrate floor plan scale, making uploaded floor plans unusable for accurate measurements
           Root Cause: Calibration click handling in onSvgPointerDown (lines 236-241) may have event propagation issues
                       or the calibration state is not updating correctly
        
        === ADDITIONAL OBSERVATIONS ===
        
        ✓ Floor plan upload works (PNG uploaded successfully)
        ✓ Toggle visibility button works (eye icon shows/hides floor plan)
        ✓ Opacity slider works (tested changing to 0.8)
        ✓ Doors auto-snap to nearest wall on creation
        ✓ Single and double doors both add successfully
        ✓ All palette items clickable and functional
        ✓ No console errors during testing (only CDN rum request failed - not critical)
        
        === RECOMMENDATIONS FOR MAIN AGENT ===
        
        1. Fix door properties display in ObjectPanel:
           - Debug why door-specific controls are not rendering when door is selected
           - Verify isDoor flag is set correctly when door object is selected
           - Check if properties object is being passed to ObjectPanel correctly
        
        2. Fix calibration click handling:
           - Debug calibration state updates in onSvgPointerDown
           - Verify calibration.step transitions from "awaiting-p1" → "awaiting-p2" → "awaiting-distance"
           - Check if event.target checks are preventing calibration clicks from registering
           - Consider adding console.log statements to track calibration state changes
        
        3. After fixes, retest scenarios J (door controls) and N (calibration) specifically
