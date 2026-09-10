from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import WebSocket


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def empty_insights() -> dict[str, Any]:
    return {
        "requirements": [],
        "objections": [],
        "decisions": [],
        "pendingQuestions": [],
        "risks": [],
        "opportunities": [],
        "commitments": [],
        "pricingSignals": [],
        "technicalRequirements": [],
        "integrations": [],
        "nextBestAction": "Descubra objetivo, volume de atendimento, usuários, filiais e integrações necessárias.",
        "summarySoFar": "",
        "lastUpdated": utc_now(),
    }


@dataclass
class Participant:
    id: str
    name: str
    role: str
    connected: bool = False

    def public(self) -> dict[str, Any]:
        return {"id": self.id, "name": self.name, "role": self.role, "connected": self.connected}


@dataclass
class AudioFrame:
    pcm: bytes
    sequence: int
    speaker: str
    received_at: float


@dataclass
class MeetingSession:
    id: str
    pairing_code: str
    title: str
    owner: Participant
    context_text: str = ""
    viewer: Optional[Participant] = None
    transcript: list[dict[str, Any]] = field(default_factory=list)
    insights: dict[str, Any] = field(default_factory=empty_insights)
    sockets: dict[str, WebSocket] = field(default_factory=dict)
    created_at: str = field(default_factory=utc_now)
    started_monotonic: float = 0.0
    finished_at: Optional[str] = None
    report_markdown: str = ""
    audio_queue: asyncio.Queue[AudioFrame] = field(default_factory=asyncio.Queue)
    worker_task: Optional[asyncio.Task] = None
    analysis_task: Optional[asyncio.Task] = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    last_analysis_transcript_count: int = 0
    audio_frames_received: int = 0
    audio_frames_dropped: int = 0
    last_audio_sequence: int = 0
    stt_latency_ms: float = 0.0
    analysis_latency_ms: float = 0.0

    def participant(self, participant_id: str) -> Optional[Participant]:
        if self.owner.id == participant_id:
            return self.owner
        if self.viewer and self.viewer.id == participant_id:
            return self.viewer
        return None

    def public_state(self) -> dict[str, Any]:
        return {
            "meetingId": self.id,
            "pairingCode": self.pairing_code,
            "title": self.title,
            "contextText": self.context_text,
            "owner": self.owner.public(),
            "viewer": self.viewer.public() if self.viewer else None,
            "transcript": self.transcript,
            "insights": self.insights,
            "createdAt": self.created_at,
            "finishedAt": self.finished_at,
            "metrics": {
                "audioFramesReceived": self.audio_frames_received,
                "audioFramesDropped": self.audio_frames_dropped,
                "audioQueueFrames": self.audio_queue.qsize(),
                "sttLatencyMs": round(self.stt_latency_ms, 1),
                "analysisLatencyMs": round(self.analysis_latency_ms, 1),
            },
        }

    async def broadcast(self, payload: dict[str, Any]) -> None:
        dead: list[str] = []
        for participant_id, socket in list(self.sockets.items()):
            try:
                await socket.send_json(payload)
            except Exception:
                dead.append(participant_id)
        for participant_id in dead:
            self.sockets.pop(participant_id, None)
            participant = self.participant(participant_id)
            if participant:
                participant.connected = False
