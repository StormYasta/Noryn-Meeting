from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import settings
from .models import MeetingSession


class Persistence:
    def __init__(self) -> None:
        self.root = Path(settings.data_dir)
        self.root.mkdir(parents=True, exist_ok=True)

    def meeting_dir(self, session: MeetingSession) -> Path:
        path = self.root / session.id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save_metadata(self, session: MeetingSession) -> None:
        path = self.meeting_dir(session) / "metadata.json"
        payload = {
            "meetingId": session.id,
            "pairingCode": session.pairing_code,
            "title": session.title,
            "contextText": session.context_text,
            "createdAt": session.created_at,
            "finishedAt": session.finished_at,
            "owner": session.owner.public(),
            "viewer": session.viewer.public() if session.viewer else None,
        }
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def append_transcript(self, session: MeetingSession, segment: dict[str, Any]) -> None:
        path = self.meeting_dir(session) / "transcript.jsonl"
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(segment, ensure_ascii=False) + "\n")

    def save_state(self, session: MeetingSession) -> None:
        path = self.meeting_dir(session) / "state.json"
        path.write_text(json.dumps(session.insights, ensure_ascii=False, indent=2), encoding="utf-8")

    def save_report(self, session: MeetingSession, report: str) -> None:
        path = self.meeting_dir(session) / "final-report.md"
        path.write_text(report, encoding="utf-8")


persistence = Persistence()
