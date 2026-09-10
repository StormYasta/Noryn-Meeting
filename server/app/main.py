from __future__ import annotations

import asyncio
import json
import os
import secrets
import string
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Optional, Set

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Noryn Meeting AI Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PAIRING_ALPHABET = string.ascii_uppercase + string.digits
PAIRING_LENGTH = int(os.getenv("PAIRING_CODE_LENGTH", "6"))
MAX_VIEWERS = int(os.getenv("MAX_VIEWERS", "1"))


class CreateMeetingRequest(BaseModel):
    title: str = "Nova reunião"
    owner_name: str = "Usuário A"


class JoinMeetingRequest(BaseModel):
    pairing_code: str
    participant_name: str = "Usuário B"


@dataclass
class Participant:
    id: str
    name: str
    role: str


@dataclass
class MeetingSession:
    id: str
    pairing_code: str
    title: str
    owner: Participant
    viewer: Optional[Participant] = None
    transcript: list[dict] = field(default_factory=list)
    insights: dict = field(default_factory=lambda: {
        "requirements": [],
        "objections": [],
        "decisions": [],
        "risks": [],
        "opportunities": [],
        "pendingQuestions": [],
        "nextBestAction": "",
        "summarySoFar": "",
    })
    sockets: Set[WebSocket] = field(default_factory=set)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def broadcast(self, payload: dict) -> None:
        dead: list[WebSocket] = []
        for socket in list(self.sockets):
            try:
                await socket.send_json(payload)
            except Exception:
                dead.append(socket)
        for socket in dead:
            self.sockets.discard(socket)


sessions_by_id: Dict[str, MeetingSession] = {}
sessions_by_code: Dict[str, str] = {}


def new_pairing_code() -> str:
    while True:
        code = "".join(secrets.choice(PAIRING_ALPHABET) for _ in range(PAIRING_LENGTH))
        if code not in sessions_by_code:
            return code


def public_state(session: MeetingSession) -> dict:
    return {
        "meetingId": session.id,
        "pairingCode": session.pairing_code,
        "title": session.title,
        "owner": session.owner.__dict__,
        "viewer": session.viewer.__dict__ if session.viewer else None,
        "transcript": session.transcript,
        "insights": session.insights,
        "createdAt": session.created_at,
    }


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "service": "noryn-meeting-ai",
        "activeMeetings": len(sessions_by_id),
        "whisper": "not-configured",
        "llm": "not-configured",
    }


@app.post("/meetings")
async def create_meeting(payload: CreateMeetingRequest) -> dict:
    meeting_id = secrets.token_urlsafe(12)
    code = new_pairing_code()
    owner = Participant(id=secrets.token_urlsafe(8), name=payload.owner_name, role="owner")
    session = MeetingSession(id=meeting_id, pairing_code=code, title=payload.title, owner=owner)
    sessions_by_id[meeting_id] = session
    sessions_by_code[code] = meeting_id
    return {
        "meetingId": meeting_id,
        "pairingCode": code,
        "participant": owner.__dict__,
        "role": "owner",
    }


@app.post("/meetings/join")
async def join_meeting(payload: JoinMeetingRequest) -> dict:
    code = payload.pairing_code.upper().strip()
    meeting_id = sessions_by_code.get(code)
    if not meeting_id:
        raise HTTPException(status_code=404, detail="Código de pareamento inválido ou expirado")
    session = sessions_by_id[meeting_id]
    if session.viewer is not None and MAX_VIEWERS <= 1:
        raise HTTPException(status_code=409, detail="A reunião já possui o segundo usuário")
    viewer = Participant(id=secrets.token_urlsafe(8), name=payload.participant_name, role="viewer")
    session.viewer = viewer
    await session.broadcast({"type": "participant_joined", "participant": viewer.__dict__})
    return {
        "meetingId": session.id,
        "pairingCode": session.pairing_code,
        "participant": viewer.__dict__,
        "role": "viewer",
        "state": public_state(session),
    }


@app.get("/meetings/{meeting_id}")
async def get_meeting(meeting_id: str) -> dict:
    session = sessions_by_id.get(meeting_id)
    if not session:
        raise HTTPException(status_code=404, detail="Reunião não encontrada")
    return public_state(session)


@app.websocket("/ws/{meeting_id}/{participant_id}")
async def websocket_endpoint(websocket: WebSocket, meeting_id: str, participant_id: str) -> None:
    session = sessions_by_id.get(meeting_id)
    if not session:
        await websocket.close(code=4404)
        return

    participant = session.owner if session.owner.id == participant_id else session.viewer
    if not participant or participant.id != participant_id:
        await websocket.close(code=4403)
        return

    await websocket.accept()
    session.sockets.add(websocket)
    await websocket.send_json({"type": "session_state", "state": public_state(session), "role": participant.role})

    try:
        while True:
            message = await websocket.receive()

            if "bytes" in message and message["bytes"] is not None:
                # Only User A/owner may produce meeting audio. User B is intentionally view-only
                # to avoid delay, duplicated system audio and overlapping transcription.
                if participant.role != "owner":
                    await websocket.send_json({"type": "error", "code": "VIEWER_AUDIO_FORBIDDEN"})
                    continue
                await websocket.send_json({"type": "audio_ack", "bytes": len(message["bytes"])})
                # TODO: enqueue bytes for VAD/STT worker. This transport contract is already owner-only.
                continue

            raw = message.get("text")
            if not raw:
                continue
            data = json.loads(raw)
            event_type = data.get("type")

            if event_type in {"assistant_request", "mark_moment"}:
                # Both users may ask the shared copilot; the response belongs to the shared session
                # and is broadcast to both clients once the LLM worker is wired.
                await session.broadcast({
                    "type": "assistant_event",
                    "requestedBy": participant.id,
                    "request": data,
                })
                continue

            if event_type == "append_transcript":
                # Development hook. Production STT writes transcripts server-side from owner audio.
                if participant.role != "owner":
                    await websocket.send_json({"type": "error", "code": "VIEWER_TRANSCRIPT_FORBIDDEN"})
                    continue
                segment = data.get("segment") or {}
                async with session.lock:
                    session.transcript.append(segment)
                await session.broadcast({"type": "transcript", "segment": segment})
                continue

            if event_type == "finish_meeting":
                if participant.role != "owner":
                    await websocket.send_json({"type": "error", "code": "OWNER_ONLY"})
                    continue
                await session.broadcast({"type": "meeting_finished", "state": public_state(session)})
                continue

    except WebSocketDisconnect:
        session.sockets.discard(websocket)
