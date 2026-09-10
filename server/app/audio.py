from __future__ import annotations

import collections
import math
from dataclasses import dataclass
from typing import Optional

import numpy as np

from .config import settings
from .models import AudioFrame


@dataclass
class Utterance:
    pcm: bytes
    speaker: str
    start_seconds: float
    end_seconds: float


class EnergyVadBuffer:
    """Cheap server-side VAD suited for streaming PCM16/16kHz.

    It is intentionally dependency-light. faster-whisper also runs its own VAD as a
    second line of defence against silence hallucinations.
    """

    def __init__(self) -> None:
        self.speech = bytearray()
        self.pre_roll: collections.deque[tuple[bytes, float, str]] = collections.deque()
        self.pre_roll_ms = 0.0
        self.silence_ms = 0.0
        self.speech_ms = 0.0
        self.active = False
        self.start_seconds = 0.0
        self.last_seconds = 0.0
        self.speaker_votes = {"Eu": 0, "Participante": 0}

    @staticmethod
    def rms(pcm: bytes) -> float:
        if len(pcm) < 2:
            return 0.0
        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
        if samples.size == 0:
            return 0.0
        return float(math.sqrt(float(np.mean(samples * samples))))

    @staticmethod
    def duration_ms(pcm: bytes) -> float:
        return (len(pcm) / 2 / settings.audio_sample_rate) * 1000.0

    def push(self, frame: AudioFrame, meeting_seconds: float) -> Optional[Utterance]:
        frame_ms = self.duration_ms(frame.pcm)
        voiced = self.rms(frame.pcm) >= settings.vad_threshold

        if not self.active:
            self.pre_roll.append((frame.pcm, meeting_seconds, frame.speaker))
            self.pre_roll_ms += frame_ms
            while self.pre_roll and self.pre_roll_ms > settings.vad_preroll_ms:
                old_pcm, _, _ = self.pre_roll.popleft()
                self.pre_roll_ms -= self.duration_ms(old_pcm)

            if not voiced:
                return None

            self.active = True
            self.start_seconds = self.pre_roll[0][1] if self.pre_roll else meeting_seconds
            for pcm, _, speaker in self.pre_roll:
                self.speech.extend(pcm)
                self.speaker_votes[speaker] = self.speaker_votes.get(speaker, 0) + 1
            self.pre_roll.clear()
            self.pre_roll_ms = 0.0
            self.speech_ms = len(self.speech) / 2 / settings.audio_sample_rate * 1000.0
            self.silence_ms = 0.0
            self.last_seconds = meeting_seconds
            return None

        self.speech.extend(frame.pcm)
        self.speech_ms += frame_ms
        self.last_seconds = meeting_seconds
        self.speaker_votes[frame.speaker] = self.speaker_votes.get(frame.speaker, 0) + 1
        self.silence_ms = 0.0 if voiced else self.silence_ms + frame_ms

        if self.silence_ms >= settings.vad_silence_ms or self.speech_ms >= settings.vad_max_speech_seconds * 1000:
            return self.flush()
        return None

    def flush(self) -> Optional[Utterance]:
        if not self.active:
            self.pre_roll.clear()
            self.pre_roll_ms = 0.0
            return None

        pcm = bytes(self.speech)
        speech_ms = self.speech_ms - self.silence_ms
        speaker = max(self.speaker_votes, key=self.speaker_votes.get) if self.speaker_votes else "Participante"
        utterance = None
        if speech_ms >= settings.vad_min_speech_ms:
            utterance = Utterance(
                pcm=pcm,
                speaker=speaker,
                start_seconds=self.start_seconds,
                end_seconds=max(self.start_seconds, self.last_seconds),
            )

        self.speech.clear()
        self.pre_roll.clear()
        self.pre_roll_ms = 0.0
        self.silence_ms = 0.0
        self.speech_ms = 0.0
        self.active = False
        self.speaker_votes = {"Eu": 0, "Participante": 0}
        return utterance
