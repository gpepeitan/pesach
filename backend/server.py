"""Passover Seating Manager — FastAPI backend.

Phase 1 (intake form) + Phase 2 (staff admin dashboard).
Backed by Supabase Postgres via SQLAlchemy + asyncpg.
"""
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")

import os
import bcrypt
import jwt
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from rapidfuzz import fuzz, process as fuzz_process

from db import engine, AsyncSessionLocal, init_db, get_db

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 12

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("passover")

app = FastAPI(title="Passover Seating API")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)


# ---------- helpers ----------
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def make_token(user_id: int, username: str, is_admin: bool) -> str:
    payload = {
        "sub": str(user_id), "username": username, "is_admin": is_admin,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    row = (await db.execute(
        text("SELECT id, username, display_name, is_admin, is_active FROM staff_users WHERE id=:id"),
        {"id": int(payload["sub"])},
    )).mappings().first()
    if not row or not row["is_active"]:
        raise HTTPException(401, "User inactive or missing")
    return dict(row)


async def require_admin(user: dict = Depends(get_current_user)):
    if not user["is_admin"]:
        raise HTTPException(403, "Admin required")
    return user


async def log_activity(db: AsyncSession, user: dict, action_type: str, guest_id=None, table_id=None, ballroom_id=None, details=None):
    import json as _json
    await db.execute(text("""
        INSERT INTO activity_log (action_type, staff_member_name, staff_user_id, guest_id, table_id, ballroom_id, details)
        VALUES (:a, :n, :u, :g, :t, :b, CAST(:d AS jsonb))
    """), {"a": action_type, "n": user["display_name"], "u": user["id"],
           "g": guest_id, "t": table_id, "b": ballroom_id, "d": _json.dumps(details or {})})


# ---------- pydantic models ----------
class GuestInput(BaseModel):
    fullName: str = Field(min_length=1)
    invoiceNumber: str = Field(min_length=1)
    partySize: int = Field(ge=1)
    seatingPreferences: List[str] = Field(default_factory=list, max_length=5)
    highChairNeeded: bool = False
    highChairCount: int = 0
    specialNotes: Optional[str] = None

class LoginInput(BaseModel):
    username: str
    password: str

class StaffCreateInput(BaseModel):
    username: str
    password: str
    displayName: str
    isAdmin: bool = False

class StaffUpdateInput(BaseModel):
    displayName: Optional[str] = None
    isAdmin: Optional[bool] = None
    isActive: Optional[bool] = None
    password: Optional[str] = None

class StaffNoteInput(BaseModel):
    note: str = Field(min_length=1)

class PreferenceResolveInput(BaseModel):
    resolutionStatus: str  # 'confirmed' | 'no_match'
    resolvedGuestId: Optional[int] = None

class GuestUpdateInput(BaseModel):
    fullName: Optional[str] = None
    partySize: Optional[int] = None
    highChairNeeded: Optional[bool] = None
    highChairCount: Optional[int] = None
    specialNotes: Optional[str] = None
    isDuplicate: Optional[bool] = None


# ---------- serializers ----------
def guest_to_api(g) -> dict:
    return {
        "id": g["id"], "fullName": g["full_name"], "invoiceNumber": g["invoice_number"],
        "partySize": g["party_size"], "seatingPreferences": list(g["seating_preferences"] or []),
        "highChairNeeded": g["high_chair_needed"], "highChairCount": g["high_chair_count"],
        "status": g["status"], "ballroomId": g["ballroom_id"], "tableId": g["table_id"],
        "specialNotes": g["special_notes"], "isDuplicate": g["is_duplicate"],
        "submissionTimestamp": g["submission_timestamp"].isoformat(),
        "lastUpdatedTimestamp": g["last_updated_timestamp"].isoformat(),
    }

def note_to_api(n) -> dict:
    return {"id": n["id"], "guestId": n["guest_id"], "note": n["note"],
            "staffName": n["staff_name"], "createdAt": n["created_at"].isoformat()}

def pref_to_api(p) -> dict:
    return {"id": p["id"], "guestId": p["guest_id"], "preferenceIndex": p["preference_index"],
            "preferenceName": p["preference_name"], "resolutionStatus": p["resolution_status"],
            "resolvedGuestId": p["resolved_guest_id"],
            "fuzzyScore": float(p["fuzzy_score"]) if p["fuzzy_score"] is not None else None,
            "resolvedAt": p["resolved_at"].isoformat() if p["resolved_at"] else None,
            "createdAt": p["created_at"].isoformat()}


# ---------- PUBLIC ENDPOINTS ----------
@api.get("/health")
async def health():
    return {"status": "ok"}


@api.post("/guests", status_code=201)
async def submit_guest(body: GuestInput, db: AsyncSession = Depends(get_db)):
    """Phase 1 intake form submission. Public, no auth."""
    existing = (await db.execute(
        text("SELECT id FROM guests WHERE invoice_number=:inv"),
        {"inv": body.invoiceNumber},
    )).fetchall()
    is_dup = len(existing) > 0

    prefs = [p for p in (body.seatingPreferences or []) if p.strip()]
    res = (await db.execute(text("""
        INSERT INTO guests (full_name, invoice_number, party_size, seating_preferences,
                            high_chair_needed, high_chair_count, special_notes, is_duplicate)
        VALUES (:fn, :inv, :ps, :prefs, :hcn, :hcc, :sn, :dup)
        RETURNING *
    """), {"fn": body.fullName, "inv": body.invoiceNumber, "ps": body.partySize,
            "prefs": prefs, "hcn": body.highChairNeeded,
            "hcc": body.highChairCount if body.highChairNeeded else 0,
            "sn": body.specialNotes, "dup": is_dup})).mappings().first()

    for idx, name in enumerate(prefs):
        await db.execute(text("""
            INSERT INTO preference_resolutions (guest_id, preference_index, preference_name)
            VALUES (:g, :i, :n)
        """), {"g": res["id"], "i": idx, "n": name})

    await db.commit()
    return {"guest": guest_to_api(res), "isDuplicate": is_dup, "priorSubmissionCount": len(existing)}


@api.get("/guests/check-invoice/{invoice_number}")
async def check_invoice(invoice_number: str, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        text("SELECT id FROM guests WHERE invoice_number=:i"), {"i": invoice_number},
    )).fetchall()
    return {"invoiceNumber": invoice_number, "hasSubmissions": len(rows) > 0, "submissionCount": len(rows)}


# ---------- AUTH ----------
@api.post("/auth/login")
async def login(body: LoginInput, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(
        text("SELECT * FROM staff_users WHERE username=:u"), {"u": body.username},
    )).mappings().first()
    if not row or not row["is_active"] or not verify_pw(body.password, row["password_hash"]):
        raise HTTPException(401, "Invalid username or password")
    await db.execute(text("UPDATE staff_users SET last_login=NOW() WHERE id=:i"), {"i": row["id"]})
    await log_activity(db, dict(row), "login")
    await db.commit()
    token = make_token(row["id"], row["username"], row["is_admin"])
    return {"token": token, "user": {"id": row["id"], "username": row["username"],
            "displayName": row["display_name"], "isAdmin": row["is_admin"]}}


@api.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await log_activity(db, user, "logout")
    await db.commit()
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"id": user["id"], "username": user["username"],
            "displayName": user["display_name"], "isAdmin": user["is_admin"]}


# ---------- STAFF MANAGEMENT (admin) ----------
@api.get("/staff")
async def list_staff(user: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(text(
        "SELECT id, username, display_name, is_admin, is_active, created_at, last_login FROM staff_users ORDER BY id"
    ))).mappings().all()
    return [{"id": r["id"], "username": r["username"], "displayName": r["display_name"],
             "isAdmin": r["is_admin"], "isActive": r["is_active"],
             "createdAt": r["created_at"].isoformat(),
             "lastLogin": r["last_login"].isoformat() if r["last_login"] else None} for r in rows]


@api.post("/staff", status_code=201)
async def create_staff(body: StaffCreateInput, user: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    try:
        row = (await db.execute(text("""
            INSERT INTO staff_users (username, password_hash, display_name, is_admin)
            VALUES (:u, :p, :d, :a) RETURNING id, username, display_name, is_admin, is_active
        """), {"u": body.username, "p": hash_pw(body.password), "d": body.displayName, "a": body.isAdmin})).mappings().first()
        await log_activity(db, user, "staff_create", details={"newUserId": row["id"], "username": body.username})
        await db.commit()
        return {"id": row["id"], "username": row["username"], "displayName": row["display_name"],
                "isAdmin": row["is_admin"], "isActive": row["is_active"]}
    except Exception as e:
        await db.rollback()
        raise HTTPException(400, f"Could not create staff: {str(e)[:200]}")


@api.patch("/staff/{staff_id}")
async def update_staff(staff_id: int, body: StaffUpdateInput, user: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    sets = []
    params: dict = {"id": staff_id}
    if body.displayName is not None: sets.append("display_name=:dn"); params["dn"] = body.displayName
    if body.isAdmin is not None: sets.append("is_admin=:ia"); params["ia"] = body.isAdmin
    if body.isActive is not None: sets.append("is_active=:ic"); params["ic"] = body.isActive
    if body.password is not None: sets.append("password_hash=:ph"); params["ph"] = hash_pw(body.password)
    if not sets:
        raise HTTPException(400, "No fields to update")
    await db.execute(text(f"UPDATE staff_users SET {', '.join(sets)} WHERE id=:id"), params)
    await log_activity(db, user, "staff_update", details={"targetId": staff_id, "fields": list(params.keys())})
    await db.commit()
    return {"ok": True}


# ---------- GUESTS (staff) ----------
@api.get("/guests")
async def list_guests(
    user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db),
    search: Optional[str] = None, status: Optional[str] = None,
    ballroomId: Optional[int] = None, isDuplicate: Optional[bool] = None,
    highChair: Optional[bool] = None, hasNotes: Optional[bool] = None,
    sort: Optional[str] = "submissionTimestamp", order: Optional[str] = "desc",
):
    conds = []; params: dict = {}
    if search:
        conds.append("(full_name ILIKE :s OR invoice_number ILIKE :s)"); params["s"] = f"%{search}%"
    if status:
        conds.append("status = :st"); params["st"] = status
    if ballroomId is not None:
        conds.append("ballroom_id = :br"); params["br"] = ballroomId
    if isDuplicate is not None:
        conds.append("is_duplicate = :dup"); params["dup"] = isDuplicate
    if highChair is not None:
        conds.append("high_chair_needed = :hc"); params["hc"] = highChair
    sort_col = {"submissionTimestamp": "submission_timestamp", "fullName": "full_name",
                "partySize": "party_size", "invoiceNumber": "invoice_number"}.get(sort, "submission_timestamp")
    order_sql = "DESC" if (order or "desc").lower() == "desc" else "ASC"
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    rows = (await db.execute(text(f"SELECT * FROM guests {where} ORDER BY {sort_col} {order_sql} LIMIT 5000"), params)).mappings().all()
    result = [guest_to_api(r) for r in rows]
    if hasNotes is not None:
        ids = [g["id"] for g in result]
        if ids:
            note_rows = (await db.execute(text("SELECT DISTINCT guest_id FROM staff_notes WHERE guest_id = ANY(:ids)"), {"ids": ids})).fetchall()
            with_notes = {r[0] for r in note_rows}
            result = [g for g in result if (g["id"] in with_notes) == hasNotes]
    return result


@api.get("/guests/unassigned")
async def unassigned_queue(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(text(
        "SELECT * FROM guests WHERE status='unassigned' ORDER BY submission_timestamp ASC"
    ))).mappings().all()
    return [guest_to_api(r) for r in rows]


@api.get("/guests/stats")
async def stats(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g = (await db.execute(text("""
      SELECT COUNT(*) AS total,
             COALESCE(SUM(party_size),0) AS total_people,
             COUNT(*) FILTER (WHERE is_duplicate) AS dups,
             COUNT(*) FILTER (WHERE status='unassigned') AS unassigned,
             COUNT(*) FILTER (WHERE status='partially_assigned') AS partial,
             COUNT(*) FILTER (WHERE status='fully_assigned') AS full,
             COALESCE(SUM(high_chair_count),0) AS high_chairs
      FROM guests
    """))).mappings().first()
    unresolved = (await db.execute(text(
        "SELECT COUNT(*) AS c FROM preference_resolutions WHERE resolution_status IN ('pending','auto_suggested')"
    ))).scalar()
    total = g["total"] or 0
    seated_pct = (g["full"] / total * 100) if total else 0
    unassigned_pct = (g["unassigned"] / total * 100) if total else 0
    return {
        "totalSubmissions": total, "totalPeople": int(g["total_people"]),
        "totalDuplicates": g["dups"], "totalHighChairs": int(g["high_chairs"]),
        "unresolvedPreferences": unresolved or 0,
        "percentSeated": round(seated_pct, 1), "percentUnassigned": round(unassigned_pct, 1),
        "statusBreakdown": {"unassigned": g["unassigned"], "partially_assigned": g["partial"], "fully_assigned": g["full"]},
    }


@api.get("/guests/{guest_id}")
async def get_guest(guest_id: int, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = (await db.execute(text("SELECT * FROM guests WHERE id=:i"), {"i": guest_id})).mappings().first()
    if not row: raise HTTPException(404, "Guest not found")
    return guest_to_api(row)


@api.patch("/guests/{guest_id}")
async def update_guest(guest_id: int, body: GuestUpdateInput, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    sets, params = [], {"id": guest_id}
    mapping = {"fullName": "full_name", "partySize": "party_size", "highChairNeeded": "high_chair_needed",
               "highChairCount": "high_chair_count", "specialNotes": "special_notes", "isDuplicate": "is_duplicate"}
    for k, col in mapping.items():
        v = getattr(body, k)
        if v is not None: sets.append(f"{col}=:{col}"); params[col] = v
    if not sets: raise HTTPException(400, "No fields to update")
    sets.append("last_updated_timestamp=NOW()")
    row = (await db.execute(text(f"UPDATE guests SET {', '.join(sets)} WHERE id=:id RETURNING *"), params)).mappings().first()
    if not row: raise HTTPException(404, "Guest not found")
    await log_activity(db, user, "guest_update", guest_id=guest_id, details=body.model_dump(exclude_none=True))
    await db.commit()
    return guest_to_api(row)


# ---------- STAFF NOTES ----------
@api.get("/guests/{guest_id}/notes")
async def list_notes(guest_id: int, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(text(
        "SELECT * FROM staff_notes WHERE guest_id=:g ORDER BY created_at DESC"
    ), {"g": guest_id})).mappings().all()
    return [note_to_api(r) for r in rows]


@api.post("/guests/{guest_id}/notes", status_code=201)
async def add_note(guest_id: int, body: StaffNoteInput, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = (await db.execute(text("""
        INSERT INTO staff_notes (guest_id, note, staff_name, staff_user_id)
        VALUES (:g, :n, :sn, :su) RETURNING *
    """), {"g": guest_id, "n": body.note, "sn": user["display_name"], "su": user["id"]})).mappings().first()
    await log_activity(db, user, "note_add", guest_id=guest_id, details={"noteId": row["id"]})
    await db.commit()
    return note_to_api(row)


@api.delete("/guests/{guest_id}/notes/{note_id}", status_code=204)
async def delete_note(guest_id: int, note_id: int, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(text("DELETE FROM staff_notes WHERE id=:i AND guest_id=:g"), {"i": note_id, "g": guest_id})
    await log_activity(db, user, "note_delete", guest_id=guest_id, details={"noteId": note_id})
    await db.commit()


# ---------- PREFERENCES ----------
@api.get("/preferences/mutual")
async def mutual_prefs(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Pairs where guest A's confirmed preference resolves to guest B AND B's confirmed preference resolves to A."""
    rows = (await db.execute(text("""
        SELECT a.guest_id AS a_id, a.resolved_guest_id AS b_id,
               ga.full_name AS a_name, gb.full_name AS b_name,
               ga.party_size AS a_size, gb.party_size AS b_size
        FROM preference_resolutions a
        JOIN preference_resolutions b ON b.guest_id = a.resolved_guest_id
                                       AND b.resolved_guest_id = a.guest_id
                                       AND b.resolution_status='confirmed'
        JOIN guests ga ON ga.id = a.guest_id
        JOIN guests gb ON gb.id = a.resolved_guest_id
        WHERE a.resolution_status='confirmed' AND a.guest_id < a.resolved_guest_id
    """))).mappings().all()
    return [dict(r) for r in rows]


@api.get("/preferences/one-way")
async def one_way_prefs(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Confirmed A→B where B doesn't have a confirmed reverse link to A."""
    rows = (await db.execute(text("""
        SELECT a.id, a.guest_id, a.resolved_guest_id,
               ga.full_name AS a_name, gb.full_name AS b_name
        FROM preference_resolutions a
        JOIN guests ga ON ga.id = a.guest_id
        JOIN guests gb ON gb.id = a.resolved_guest_id
        WHERE a.resolution_status='confirmed'
          AND NOT EXISTS (
            SELECT 1 FROM preference_resolutions b
            WHERE b.guest_id = a.resolved_guest_id AND b.resolved_guest_id = a.guest_id
              AND b.resolution_status='confirmed'
          )
    """))).mappings().all()
    return [dict(r) for r in rows]


@api.get("/preferences/unresolved")
async def unresolved_prefs(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Pending preferences with fuzzy-match suggestions against all guest names."""
    rows = (await db.execute(text("""
        SELECT p.*, g.full_name AS requester_name
        FROM preference_resolutions p
        JOIN guests g ON g.id = p.guest_id
        WHERE p.resolution_status IN ('pending','auto_suggested')
        ORDER BY p.created_at ASC
        LIMIT 500
    """))).mappings().all()
    guests = (await db.execute(text("SELECT id, full_name FROM guests"))).mappings().all()
    names = [(g["id"], g["full_name"]) for g in guests]
    result = []
    for r in rows:
        choices = {fid: name for fid, name in names if fid != r["guest_id"]}
        matches = []
        if choices:
            top = fuzz_process.extract(r["preference_name"], choices, scorer=fuzz.WRatio, limit=3)
            for matched_name, score, gid in top:
                if score >= 60:
                    matches.append({"guestId": gid, "name": matched_name, "score": round(score / 100, 4)})
        d = pref_to_api(r)
        d["requesterName"] = r["requester_name"]
        d["suggestions"] = matches
        result.append(d)
    return result


@api.patch("/preferences/{pref_id}/resolve")
async def resolve_pref(pref_id: int, body: PreferenceResolveInput, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if body.resolutionStatus not in ("confirmed", "no_match"):
        raise HTTPException(400, "Invalid status")
    score = None
    if body.resolutionStatus == "confirmed" and body.resolvedGuestId:
        pref = (await db.execute(text("SELECT preference_name FROM preference_resolutions WHERE id=:i"), {"i": pref_id})).mappings().first()
        guest = (await db.execute(text("SELECT full_name FROM guests WHERE id=:i"), {"i": body.resolvedGuestId})).mappings().first()
        if pref and guest:
            score = fuzz.WRatio(pref["preference_name"], guest["full_name"]) / 100
    row = (await db.execute(text("""
        UPDATE preference_resolutions
        SET resolution_status = CAST(:s AS preference_resolution_status),
            resolved_guest_id = :rg, resolved_at = NOW(),
            fuzzy_score = :fs
        WHERE id = :i RETURNING *
    """), {"s": body.resolutionStatus, "rg": body.resolvedGuestId, "fs": score, "i": pref_id})).mappings().first()
    if not row: raise HTTPException(404, "Resolution not found")
    await log_activity(db, user, "preference_resolve", guest_id=row["guest_id"],
                        details={"resolutionId": pref_id, "status": body.resolutionStatus, "resolvedGuestId": body.resolvedGuestId})
    await db.commit()
    return pref_to_api(row)


@api.get("/guests/{guest_id}/preference-resolutions")
async def guest_prefs(guest_id: int, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(text(
        "SELECT * FROM preference_resolutions WHERE guest_id=:g ORDER BY preference_index"
    ), {"g": guest_id})).mappings().all()
    return [pref_to_api(r) for r in rows]


# ---------- ACTIVITY LOG ----------
@api.get("/activity-log")
async def activity_log(
    user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db),
    limit: int = 200, offset: int = 0, staffName: Optional[str] = None, actionType: Optional[str] = None,
):
    conds, params = [], {"limit": min(limit, 500), "offset": offset}
    if staffName: conds.append("staff_member_name ILIKE :sn"); params["sn"] = f"%{staffName}%"
    if actionType: conds.append("action_type = :at"); params["at"] = actionType
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    rows = (await db.execute(text(f"""
        SELECT id, action_type, staff_member_name, guest_id, table_id, ballroom_id, details, created_at
        FROM activity_log {where} ORDER BY created_at DESC LIMIT :limit OFFSET :offset
    """), params)).mappings().all()
    return [{"id": r["id"], "actionType": r["action_type"], "staffMemberName": r["staff_member_name"],
             "guestId": r["guest_id"], "tableId": r["table_id"], "ballroomId": r["ballroom_id"],
             "details": r["details"], "createdAt": r["created_at"].isoformat()} for r in rows]


# ---------- STARTUP ----------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=False,
    allow_methods=["*"], allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await init_db()
    async with AsyncSessionLocal() as db:
        admin_username = os.environ["ADMIN_USERNAME"]
        admin_password = os.environ["ADMIN_PASSWORD"]
        admin_display = os.environ["ADMIN_DISPLAY_NAME"]
        existing = (await db.execute(text("SELECT id, password_hash FROM staff_users WHERE username=:u"), {"u": admin_username})).mappings().first()
        if not existing:
            await db.execute(text("""
                INSERT INTO staff_users (username, password_hash, display_name, is_admin)
                VALUES (:u, :p, :d, TRUE)
            """), {"u": admin_username, "p": hash_pw(admin_password), "d": admin_display})
            await db.commit()
            logger.info(f"Seeded admin user: {admin_username}")
        elif not verify_pw(admin_password, existing["password_hash"]):
            await db.execute(text("UPDATE staff_users SET password_hash=:p WHERE id=:i"),
                             {"p": hash_pw(admin_password), "i": existing["id"]})
            await db.commit()
            logger.info(f"Updated admin password: {admin_username}")
