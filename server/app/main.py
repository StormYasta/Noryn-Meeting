from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
import string
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .ai import apply_rules, build_report, ollama_service
from .audio import EnergyVadBuffer
from .config import settings
from .models import AudioFrame, MeetingSession, Participant, utc_now
from .persistence import persistence
from .stt import is_duplicate, whisper_service

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("noryn-meeting")

app = FastAPI(title="Noryn Meeting AI Service", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PAIRING_ALPHABET = string.ascii_uppercase + string.digits


class CreateMeetingRequest(BaseModel):
    title: str = Field(default="Nova reunião", max_length=180)
    owner_name: str = Field(default="Usuário A", max_length=80)
    context_text: str = Field(default="", max_length=12000)


class JoinMeetingRequest(BaseModel):
    pairing_code: str = Field(min_length=4, max_length=16)
    participant_name: str = Field(default="Usuário B", max_length=80)


sessions_by_id: Dict[str, MeetingSession] = {}
sessions_by_code: Dict[str, str] = {}
cleanup_task: asyncio.Task | None = None


def new_pairing_code() -> str:
    while True:
        code = "".join(secrets.choice(PAIRING_ALPHABET) for _ in range(settings.pairing_code_length))
        if code not in sessions_by_code:
            return code


def format_time(seconds: float) -> str:
    seconds = max(0, int(seconds))
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


def decode_audio_frame(data: bytes) -> tuple[int, str, bytes]:
    """Decode Noryn binary frame.

    v1 frame: [version:1][speaker:1][sequence:uint32-le][PCM16...]
    Legacy/raw frames are accepted and treated as remote participant audio.
    """
    if len(data) >= 8 and data[0] == 1:
        speaker = "Eu" if data[1] == 1 else "Participante"
        sequence = int.from_bytes(data[2:6], byteorder="little", signed=False)
        return sequence, speaker, data[6:]
    return 0, "Participante", data


async def session_audio_worker(session: MeetingSession) -> None:
    vad = EnergyVadBuffer()
    log.info("audio worker started meeting=%s", session.id)
    try:
        while session.finished_at is None or not session.audio_queue.empty():
            try:
                frame = await asyncio.wait_for(session.audio_queue.get(), timeout=0.8)
            except asyncio.TimeoutError:
                utterance = vad.flush()
                if utterance:
                    await transcribe_utterance(session, utterance)
                continue

            meeting_seconds = max(0.0, frame.received_at - session.started_monotonic)
            utterance = vad.push(frame, meeting_seconds)
            session.audio_queue.task_done()
            if utterance:
                await transcribe_utterance(session, utterance)
    except asyncio.CancelledError:
        utterance = vad.flush()
        if utterance:
            await transcribe_utterance(session, utterance)
        raise
    except Exception:
        log.exception("audio worker crashed meeting=%s", session.id)
    finally:
        log.info("audio worker stopped meeting=%s", session.id)


async def transcribe_utterance(session: MeetingSession, utterance) -> None:
    result = await whisper_service.transcribe(utterance)
    if not result:
        return
    if is_duplicate(result["text"], session.transcript):
        log.info("duplicate transcript discarded meeting=%s text=%r", session.id, result["text"][:100])
        return

    segment = {
        "id": secrets.token_urlsafe(8),
        "speaker": result.get("speaker", "Participante"),
        "text": result["text"],
        "timestamp": result.get("start", 0),
        "formattedTime": format_time(result.get("start", 0)),
        "isFinal": True,
        "start": result.get("start", 0),
        "end": result.get("end", 0),
    }
    session.stt_latency_ms = float(result.get("latencyMs", 0.0))
    async with session.lock:
        session.transcript.append(segment)
        changed = apply_rules(session, segment)
        persistence.append_transcript(session, segment)

    await session.broadcast({"type": "transcript", "segment": segment})
    if changed:
        await session.broadcast({"type": "insights_updated", "insights": session.insights, "source": "rules"})


async def session_analysis_worker(session: MeetingSession) -> None:
    while session.finished_at is None:
        await asyncio.sleep(max(15, settings.analysis_interval_seconds))
        if session.finished_at is not None:
            return
        if session.audio_queue.qsize() > 80:
            continue
        if await ollama_service.analyze(session):
            await session.broadcast({"type": "insights_updated", "insights": session.insights, "source": "ollama"})


async def ensure_workers(session: MeetingSession) -> None:
    if session.worker_task is None or session.worker_task.done():
        session.worker_task = asyncio.create_task(session_audio_worker(session), name=f"audio-{session.id}")
    if session.analysis_task is None or session.analysis_task.done():
        session.analysis_task = asyncio.create_task(session_analysis_worker(session), name=f"analysis-{session.id}")


async def cleanup_sessions_loop() -> None:
    while True:
        await asyncio.sleep(60)
        now = datetime.now(timezone.utc)
        max_age = timedelta(minutes=settings.session_ttl_minutes)
        stale: list[str] = []
        for meeting_id, session in list(sessions_by_id.items()):
            created = datetime.fromisoformat(session.created_at)
            if session.finished_at:
                ended = datetime.fromisoformat(session.finished_at)
                if now - ended > timedelta(minutes=30):
                    stale.append(meeting_id)
            elif now - created > max_age:
                stale.append(meeting_id)
        for meeting_id in stale:
            session = sessions_by_id.pop(meeting_id, None)
            if not session:
                continue
            sessions_by_code.pop(session.pairing_code, None)
            for task in (session.worker_task, session.analysis_task):
                if task and not task.done():
                    task.cancel()
            log.info("session cleaned meeting=%s", meeting_id)


@app.on_event("startup")
async def startup() -> None:
    global cleanup_task
    cleanup_task = asyncio.create_task(cleanup_sessions_loop())
    asyncio.create_task(whisper_service.ensure_loaded())
    asyncio.create_task(ollama_service.probe())


@app.on_event("shutdown")
async def shutdown() -> None:
    if cleanup_task:
        cleanup_task.cancel()
    for session in sessions_by_id.values():
        for task in (session.worker_task, session.analysis_task):
            if task and not task.done():
                task.cancel()


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "noryn-meeting-ai",
        "version": app.version,
        "activeMeetings": len(sessions_by_id),
        "whisper": {
            "status": whisper_service.status,
            "model": settings.whisper_model,
            "device": whisper_service.device,
            "error": whisper_service.error or None,
        },
        "llm": {
            "status": ollama_service.status,
            "model": settings.ollama_model,
            "baseUrl": settings.ollama_base_url,
            "error": ollama_service.last_error or None,
        },
    }


@app.get("/metrics")
async def metrics() -> dict[str, Any]:
    return {
        "activeMeetings": len(sessions_by_id),
        "sessions": [
            {"meetingId": session.id, **session.public_state()["metrics"]}
            for session in sessions_by_id.values()
        ],
    }


@app.post("/meetings")
async def create_meeting(payload: CreateMeetingRequest) -> dict[str, Any]:
    meeting_id = secrets.token_urlsafe(12)
    code = new_pairing_code()
    owner = Participant(id=secrets.token_urlsafe(16), name=payload.owner_name.strip() or "Usuário A", role="owner")
    session = MeetingSession(
        id=meeting_id,
        pairing_code=code,
        title=payload.title.strip() or "Nova reunião",
        owner=owner,
        context_text=payload.context_text,
        started_monotonic=time.monotonic(),
        audio_queue=asyncio.Queue(maxsize=settings.audio_queue_max_frames),
    )
    sessions_by_id[meeting_id] = session
    sessions_by_code[code] = meeting_id
    persistence.save_metadata(session)
    persistence.save_state(session)
    await ensure_workers(session)
    return {
        "meetingId": meeting_id,
        "pairingCode": code,
        "participant": owner.public(),
        "role": "owner",
        "state": session.public_state(),
    }


@app.post("/meetings/join")
async def join_meeting(payload: JoinMeetingRequest) -> dict[str, Any]:
    code = payload.pairing_code.upper().replace("-", "").strip()
    meeting_id = sessions_by_code.get(code)
    if not meeting_id:
        raise HTTPException(status_code=404, detail="Código de pareamento inválido ou expirado")
    session = sessions_by_id[meeting_id]
    if session.finished_at:
        raise HTTPException(status_code=410, detail="Esta reunião já foi finalizada")
    if session.viewer is not None and settings.max_viewers <= 1:
        raise HTTPException(status_code=409, detail="A reunião já possui o segundo usuário")

    viewer = Participant(id=secrets.token_urlsafe(16), name=payload.participant_name.strip() or "Usuário B", role="viewer")
    session.viewer = viewer
    persistence.save_metadata(session)
    await session.broadcast({"type": "participant_joined", "participant": viewer.public()})
    return {
        "meetingId": session.id,
        "pairingCode": session.pairing_code,
        "participant": viewer.public(),
        "role": "viewer",
        "state": session.public_state(),
    }


@app.get("/meetings/{meeting_id}")
async def get_meeting(meeting_id: str) -> dict[str, Any]:
    session = sessions_by_id.get(meeting_id)
    if not session:
        raise HTTPException(status_code=404, detail="Reunião não encontrada")
    return session.public_state()


@app.get("/meetings/{meeting_id}/report")
async def get_report(meeting_id: str) -> dict[str, Any]:
    session = sessions_by_id.get(meeting_id)
    if not session:
        raise HTTPException(status_code=404, detail="Reunião não encontrada")
    return {"meetingId": meeting_id, "finishedAt": session.finished_at, "report": session.report_markdown}


@app.websocket("/ws/{meeting_id}/{participant_id}")
async def websocket_endpoint(websocket: WebSocket, meeting_id: str, participant_id: str) -> None:
    session = sessions_by_id.get(meeting_id)
    if not session:
        await websocket.close(code=4404)
        return
    participant = session.participant(participant_id)
    if not participant:
        await websocket.close(code=4403)
        return

    await websocket.accept()
    old_socket = session.sockets.get(participant_id)
    if old_socket and old_socket is not websocket:
        try:
            await old_socket.close(code=4001)
        except Exception:
            pass
    session.sockets[participant_id] = websocket
    participant.connected = True
    await websocket.send_json({"type": "session_state", "state": session.public_state(), "role": participant.role})
    await session.broadcast({"type": "presence", "owner": session.owner.public(), "viewer": session.viewer.public() if session.viewer else None})

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break

            binary = message.get("bytes")
            if binary is not None:
                if participant.role != "owner":
                    await websocket.send_json({"type": "error", "code": "VIEWER_AUDIO_FORBIDDEN", "message": "Somente o Usuário A envia áudio."})
                    continue
                sequence, speaker, pcm = decode_audio_frame(binary)
                if len(pcm) < 2:
                    continue
                if sequence and sequence <= session.last_audio_sequence:
                    continue
                if sequence:
                    session.last_audio_sequence = sequence
                frame = AudioFrame(pcm=pcm, sequence=sequence, speaker=speaker, received_at=time.monotonic())
                try:
                    session.audio_queue.put_nowait(frame)
                    session.audio_frames_received += 1
                except asyncio.QueueFull:
                    session.audio_frames_dropped += 1
                    if session.audio_frames_dropped % 20 == 1:
                        await websocket.send_json({
                            "type": "error",
                            "code": "AUDIO_BACKLOG",
                            "message": "Fila de áudio cheia; análise LLM será preterida para preservar STT.",
                        })
                if session.audio_frames_received % 100 == 0:
                    await websocket.send_json({"type": "audio_status", "metrics": session.public_state()["metrics"]})
                continue

            raw = message.get("text")
            if not raw:
                continue
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "code": "INVALID_JSON"})
                continue

            event_type = data.get("type")
            if event_type == "ping":
                await websocket.send_json({"type": "pong", "ts": data.get("ts")})
                continue

            if event_type == "assistant_request":
                action = str(data.get("action") or "general")
                response = await ollama_service.manual(session, action, data.get("payload"), participant.id)
                await session.broadcast({"type": "assistant_response", "requestedBy": participant.id, "response": response})
                continue

            if event_type == "mark_moment":
                payload = {
                    "type": "assistant_response",
                    "requestedBy": participant.id,
                    "response": {
                        "type": "general",
                        "question": "Momento marcado",
                        "answer": f"Momento marcado em {format_time(time.monotonic() - session.started_monotonic)}.",
                        "timestamp": utc_now(),
                    },
                }
                await session.broadcast(payload)
                continue

            if event_type == "trigger_analysis":
                if session.audio_queue.qsize() > 80:
                    await websocket.send_json({"type": "error", "code": "STT_PRIORITY", "message": "Análise adiada: há backlog de áudio."})
                    continue
                changed = await ollama_service.analyze(session, force=True)
                await session.broadcast({"type": "insights_updated", "insights": session.insights, "source": "ollama" if changed else "rules"})
                continue

            if event_type == "append_transcript":
                if participant.role != "owner":
                    await websocket.send_json({"type": "error", "code": "VIEWER_TRANSCRIPT_FORBIDDEN"})
                    continue
                segment = data.get("segment") or {}
                if segment.get("text") and not is_duplicate(str(segment["text"]), session.transcript):
                    segment.setdefault("id", secrets.token_urlsafe(8))
                    segment.setdefault("speaker", "Participante")
                    segment.setdefault("timestamp", max(0, time.monotonic() - session.started_monotonic))
                    segment.setdefault("formattedTime", format_time(float(segment["timestamp"])))
                    segment.setdefault("isFinal", True)
                    session.transcript.append(segment)
                    apply_rules(session, segment)
                    persistence.append_transcript(session, segment)
                    await session.broadcast({"type": "transcript", "segment": segment})
                continue

            if event_type == "finish_meeting":
                if participant.role != "owner":
                    await websocket.send_json({"type": "error", "code": "OWNER_ONLY"})
                    continue
                session.finished_at = utc_now()
                try:
                    await asyncio.wait_for(session.audio_queue.join(), timeout=8)
                except asyncio.TimeoutError:
                    pass
                await ollama_service.analyze(session, force=True)
                session.report_markdown = build_report(session)
                persistence.save_metadata(session)
                persistence.save_state(session)
                persistence.save_report(session, session.report_markdown)
                await session.broadcast({
                    "type": "meeting_finished",
                    "state": session.public_state(),
                    "report": session.report_markdown,
                })
                for task in (session.worker_task, session.analysis_task):
                    if task and not task.done():
                        task.cancel()
                continue

            await websocket.send_json({"type": "error", "code": "UNKNOWN_EVENT", "message": str(event_type)})

    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("websocket error meeting=%s participant=%s", meeting_id, participant_id)
    finally:
        if session.sockets.get(participant_id) is websocket:
            session.sockets.pop(participant_id, None)
        participant.connected = False
        await session.broadcast({"type": "presence", "owner": session.owner.public(), "viewer": session.viewer.public() if session.viewer else None})
