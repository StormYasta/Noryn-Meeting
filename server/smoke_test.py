"""Run against a started Noryn Meeting server.

Usage inside container:
    python smoke_test.py http://127.0.0.1:8765

This validates session creation, pairing, shared broadcast and the owner-only audio
contract without depending on Whisper/Ollama being ready.
"""
from __future__ import annotations

import asyncio
import json
import sys

import httpx
import websockets


async def recv_type(ws, expected: str, limit: int = 12):
    for _ in range(limit):
        raw = await asyncio.wait_for(ws.recv(), timeout=5)
        if isinstance(raw, bytes):
            continue
        event = json.loads(raw)
        if event.get("type") == expected:
            return event
    raise AssertionError(f"event {expected!r} not received")


async def main() -> None:
    base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765").rstrip("/")
    ws_base = base.replace("http://", "ws://").replace("https://", "wss://")

    async with httpx.AsyncClient(timeout=10) as client:
        health = (await client.get(f"{base}/health")).json()
        assert health["status"] == "ok"

        created = (await client.post(f"{base}/meetings", json={
            "title": "Smoke test",
            "owner_name": "User A",
            "context_text": "teste de integração",
        })).json()
        assert created["role"] == "owner"
        assert len(created["pairingCode"]) >= 4

        joined_response = await client.post(f"{base}/meetings/join", json={
            "pairing_code": created["pairingCode"],
            "participant_name": "User B",
        })
        joined_response.raise_for_status()
        joined = joined_response.json()
        assert joined["role"] == "viewer"

    owner_url = f"{ws_base}/ws/{created['meetingId']}/{created['participant']['id']}"
    viewer_url = f"{ws_base}/ws/{joined['meetingId']}/{joined['participant']['id']}"

    async with websockets.connect(owner_url) as owner, websockets.connect(viewer_url) as viewer:
        await recv_type(owner, "session_state")
        await recv_type(viewer, "session_state")

        await viewer.send(b"\x00\x00\x00\x00")
        viewer_error = await recv_type(viewer, "error")
        assert viewer_error["code"] == "VIEWER_AUDIO_FORBIDDEN"

        await owner.send(json.dumps({
            "type": "append_transcript",
            "segment": {"text": "Precisamos de três usuários e integração com WhatsApp."},
        }))
        owner_transcript = await recv_type(owner, "transcript")
        viewer_transcript = await recv_type(viewer, "transcript")
        assert owner_transcript["segment"]["text"] == viewer_transcript["segment"]["text"]

        async with httpx.AsyncClient(timeout=10) as client:
            third = await client.post(f"{base}/meetings/join", json={
                "pairing_code": created["pairingCode"],
                "participant_name": "User C",
            })
            assert third.status_code == 409

    print("MVP SMOKE TEST: PASS")


if __name__ == "__main__":
    asyncio.run(main())
