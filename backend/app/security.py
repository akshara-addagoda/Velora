import hashlib
import secrets
from collections import defaultdict, deque
from datetime import timedelta
from threading import Lock
from time import monotonic

from fastapi import Depends, HTTPException, Request
from pwdlib import PasswordHash
from sqlalchemy import select

from .database import get_db, now, settings
from .models import Session, User

passwords = PasswordHash.recommended()
attempts = defaultdict(deque)
attempt_lock = Lock()


def rate_limit(request: Request):
    key = request.client.host if request.client else "local"
    with attempt_lock:
        queue = attempts[key]
        current = monotonic()
        while queue and queue[0] < current - 60:
            queue.popleft()
        if len(queue) >= 15:
            raise HTTPException(429, "Too many attempts. Please wait a minute.")
        queue.append(current)


def token_digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def issue_session(db, user):
    token = secrets.token_urlsafe(48)
    db.add(
        Session(
            user_id=user.id,
            token_hash=token_digest(token),
            expires_at=now() + timedelta(hours=settings.session_hours),
        )
    )
    db.commit()
    return {"token": token, "user": public_user(user)}


def public_user(user):
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "roles": user.roles.split(","),
        "suspended": user.suspended,
    }


def current_user(request: Request, db=Depends(get_db)):
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Please sign in to continue")
    session = db.scalar(
        select(Session).where(
            Session.token_hash == token_digest(authorization[7:]), Session.expires_at > now()
        )
    )
    user = db.get(User, session.user_id) if session else None
    if not user or user.suspended:
        raise HTTPException(401, "Your session has expired or the account is unavailable")
    return user


def admin_user(user=Depends(current_user)):
    if "admin" not in user.roles.split(","):
        raise HTTPException(403, "Administrator access required")
    return user
