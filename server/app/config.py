from __future__ import annotations

import os
from dataclasses import dataclass


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    port: int = int(os.getenv("MEETING_PORT", "8765"))
    pairing_code_length: int = int(os.getenv("PAIRING_CODE_LENGTH", "6"))
    max_viewers: int = int(os.getenv("MAX_VIEWERS", "1"))
    session_ttl_minutes: int = int(os.getenv("SESSION_TTL_MINUTES", "480"))
    data_dir: str = os.getenv("DATA_DIR", "/data")
    save_audio: bool = _bool("SAVE_AUDIO", False)
    warmup_ai: bool = _bool("WARMUP_AI", True)

    # Accuracy-first STT defaults. The Meeting Copilot is not intended to behave
    # like live captions; a controlled delay is preferable to low-quality text.
    whisper_model: str = os.getenv("WHISPER_MODEL", "small")
    whisper_device: str = os.getenv("WHISPER_DEVICE", "auto")
    whisper_compute_type: str = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
    whisper_language: str = os.getenv("WHISPER_LANGUAGE", "pt")
    whisper_beam_size: int = int(os.getenv("WHISPER_BEAM_SIZE", "5"))
    whisper_hotwords: str = os.getenv(
        "WHISPER_HOTWORDS",
        "Noryn CRM Kanban WhatsApp Webmotors Supabase Evolution Google Calendar Gmail Outlook "
        "INPI marcas patentes licença mensalidade código-fonte exclusividade API webhook filiais "
        "atendentes usuários migração integração",
    ).strip()

    audio_sample_rate: int = int(os.getenv("AUDIO_SAMPLE_RATE", "16000"))
    vad_threshold: float = float(os.getenv("VAD_RMS_THRESHOLD", "0.008"))
    # Longer utterances provide Whisper with more linguistic context. We wait for
    # ~1.1 s of silence before committing a turn and allow up to 20 s of speech.
    vad_silence_ms: int = int(os.getenv("VAD_SILENCE_MS", "1100"))
    vad_preroll_ms: int = int(os.getenv("VAD_PREROLL_MS", "450"))
    vad_min_speech_ms: int = int(os.getenv("VAD_MIN_SPEECH_MS", "450"))
    vad_max_speech_seconds: int = int(os.getenv("VAD_MAX_SPEECH_SECONDS", "20"))
    audio_queue_max_frames: int = int(os.getenv("AUDIO_QUEUE_MAX_FRAMES", "2500"))

    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434").rstrip("/")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
    analysis_interval_seconds: int = int(os.getenv("ANALYSIS_INTERVAL_SECONDS", "90"))
    ollama_timeout_seconds: int = int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "90"))


settings = Settings()
