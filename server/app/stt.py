from __future__ import annotations

import asyncio
import logging
import re
import time
from difflib import SequenceMatcher
from typing import Any

import numpy as np

from .config import settings
from .audio import Utterance

log = logging.getLogger("noryn-meeting.stt")


class WhisperService:
    def __init__(self) -> None:
        self.model: Any = None
        self.status = "loading"
        self.device = settings.whisper_device
        self.error = ""
        self._load_lock = asyncio.Lock()

    async def ensure_loaded(self) -> None:
        if self.model is not None or self.status == "ready":
            return
        async with self._load_lock:
            if self.model is not None:
                return
            try:
                self.model = await asyncio.to_thread(self._load_model)
                self.status = "ready"
                log.info(
                    "Whisper ready model=%s device=%s beam=%s hotwords=%s",
                    settings.whisper_model,
                    self.device,
                    settings.whisper_beam_size,
                    bool(settings.whisper_hotwords),
                )
            except Exception as exc:
                self.status = "error"
                self.error = str(exc)
                log.exception("Failed to load Whisper")

    def _load_model(self):
        from faster_whisper import WhisperModel

        kwargs = {"compute_type": settings.whisper_compute_type}
        device = settings.whisper_device
        try:
            return WhisperModel(settings.whisper_model, device=device, **kwargs)
        except Exception:
            if device == "cpu":
                raise
            log.warning("Whisper device=%s failed; falling back to CPU int8", device, exc_info=True)
            self.device = "cpu"
            return WhisperModel(settings.whisper_model, device="cpu", compute_type="int8")

    async def transcribe(self, utterance: Utterance) -> dict[str, Any] | None:
        await self.ensure_loaded()
        if not self.model:
            return None
        started = time.perf_counter()
        result = await asyncio.to_thread(self._transcribe_sync, utterance)
        if result:
            result["latencyMs"] = round((time.perf_counter() - started) * 1000, 1)
        return result

    def _transcribe_sync(self, utterance: Utterance) -> dict[str, Any] | None:
        audio = np.frombuffer(utterance.pcm, dtype="<i2").astype(np.float32) / 32768.0
        if audio.size < settings.audio_sample_rate // 5:
            return None

        # Accuracy-first decoding. The product does not need live-caption latency;
        # it needs reliable semantic recall for requirements, objections and Q&A.
        segments, _ = self.model.transcribe(
            audio,
            language=settings.whisper_language,
            beam_size=max(1, settings.whisper_beam_size),
            best_of=max(1, settings.whisper_beam_size),
            temperature=0.0,
            vad_filter=True,
            condition_on_previous_text=False,
            word_timestamps=False,
            repetition_penalty=1.05,
            no_repeat_ngram_size=3,
            no_speech_threshold=0.6,
            hotwords=settings.whisper_hotwords or None,
        )
        pieces: list[str] = []
        no_speech_scores: list[float] = []
        for segment in segments:
            text = (segment.text or "").strip()
            if text:
                pieces.append(text)
            score = getattr(segment, "no_speech_prob", None)
            if score is not None:
                no_speech_scores.append(float(score))
        text = " ".join(pieces).strip()
        if not text:
            return None
        if no_speech_scores and sum(no_speech_scores) / len(no_speech_scores) > 0.80:
            return None
        duration = max(0.5, utterance.end_seconds - utterance.start_seconds)
        if self._looks_like_hallucination(text, duration):
            return None
        return {
            "text": text,
            "speaker": utterance.speaker,
            "start": round(utterance.start_seconds, 2),
            "end": round(utterance.end_seconds, 2),
        }

    @classmethod
    def _looks_like_hallucination(cls, text: str, duration_seconds: float = 0.0) -> bool:
        normalized = re.sub(r"[^\wÀ-ÿ ]+", " ", text.lower()).strip()
        words = [w for w in normalized.split() if w]
        if not words:
            return True

        # Bordões clássicos de silêncio do Whisper
        silence_cliches = [
            r"^(?:é isso|e isso|é isso aí|e isso ai)$",
            r"^(?:eu não sei|eu nao sei|não sei|nao sei)$",
            r"^(?:obrigad[oa]|muito obrigad[oa]|valeu) por assistir(?: ao vídeo)?$",
            r"^(?:tchau|tchau tchau|até a próxima)$",
            r"^(?:inscreva-se|deixe seu like)$",
            r"^(?:legendas?(?: pela comunidade)?|subtitles? by|transcrição por)$",
        ]
        for pat in silence_cliches:
            if re.match(pat, normalized):
                return True

        # Sanity check de taxa de fala
        if duration_seconds > 0.5:
            wps = len(words) / duration_seconds
            if wps > 7.0:
                return True

        if len(words) >= 8:
            unique_ratio = len(set(words)) / len(words)
            if unique_ratio < 0.35:
                return True

        # Detecção de n-grams repetidos (1 a 6 palavras) em qualquer ponto do texto
        total = len(words)
        max_window = min(6, total // 3)
        for window in range(1, max_window + 1):
            for start in range(0, total - window * 3 + 1):
                phrase = words[start:start + window]
                repeats = 1
                pos = start + window
                while pos + window <= total:
                    if words[pos:pos + window] == phrase:
                        repeats += 1
                        pos += window
                        if repeats >= 3:
                            return True
                    else:
                        break
        return False


def remove_overlap(prev_text: str, curr_text: str) -> str:
    norm = lambda s: re.sub(r"[^\wÀ-ÿ ]+", " ", s.lower()).strip()
    prev_words = norm(prev_text).split()
    curr_words = norm(curr_text).split()
    if not prev_words or not curr_words:
        return curr_text
    max_k = min(len(prev_words), len(curr_words), 10)
    best_overlap = 0
    for k in range(max_k, 0, -1):
        if prev_words[-k:] == curr_words[:k]:
            if k >= 2 or (k == 1 and len(prev_words[-1]) >= 7):
                best_overlap = k
                break
    if best_overlap > 0:
        orig_tokens = curr_text.split()
        if best_overlap < len(orig_tokens):
            return " ".join(orig_tokens[best_overlap:]).strip()
        return ""
    return curr_text


def is_duplicate(new_text: str, transcript: list[dict[str, Any]]) -> bool:
    if not transcript:
        return False
    norm = lambda s: re.sub(r"\W+", " ", s.lower()).strip()
    new = norm(new_text)
    if not new:
        return True
    for item in transcript[-4:]:
        old = norm(str(item.get("text", "")))
        if not old:
            continue
        if new == old:
            return True
        if len(new) > 20 and SequenceMatcher(None, new, old).ratio() > 0.88:
            return True
    return False


whisper_service = WhisperService()
