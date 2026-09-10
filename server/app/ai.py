from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import unicodedata
from typing import Any

import httpx

from .config import settings
from .models import MeetingSession, utc_now
from .persistence import persistence

log = logging.getLogger("noryn-meeting.ai")

KEYWORDS = {
    "pricingSignals": ["preço", "valor", "mensalidade", "orçamento", "budget", "licença", "sem mensalidade"],
    "technicalRequirements": ["api", "webhook", "integração", "servidor", "whatsapp", "calendar", "google", "outlook", "email", "migração"],
    "risks": ["exclusividade", "código-fonte", "propriedade intelectual", "prazo apertado", "urgente"],
    "requirements": ["precisamos", "necessário", "queremos", "usuários", "atendentes", "filiais", "unidades", "números"],
    "objections": ["caro", "não queremos", "problema", "dificuldade", "preocupação", "mas"],
}

STOPWORDS = {
    "a", "ao", "aos", "as", "o", "os", "um", "uma", "uns", "umas", "de", "da", "das", "do", "dos",
    "e", "em", "no", "na", "nos", "nas", "para", "por", "com", "sem", "que", "qual", "quais", "como",
    "foi", "era", "ele", "ela", "eles", "elas", "eu", "voce", "voces", "cliente", "disse", "falou", "fala",
    "sobre", "isso", "aquilo", "tem", "tinha", "ter", "ser", "sao", "estao", "esta", "estava", "me", "meu",
}


def structured_item(text: str, category: str = "") -> dict[str, Any]:
    return {
        "text": text.strip(),
        "confidence": "medium",
        "timestamp": utc_now(),
        "status": "open",
        "sourceExcerpt": text.strip()[:240],
        "category": category,
    }


def apply_rules(session: MeetingSession, segment: dict[str, Any]) -> bool:
    text = str(segment.get("text", "")).strip()
    low = text.lower()
    changed = False
    for bucket, words in KEYWORDS.items():
        if not any(word in low for word in words):
            continue
        existing = session.insights.setdefault(bucket, [])
        if any(str(item.get("sourceExcerpt", "")).lower() == low for item in existing[-10:]):
            continue
        existing.append(structured_item(text, "rule"))
        if len(existing) > 20:
            del existing[:-20]
        changed = True
    if changed:
        session.insights["lastUpdated"] = utc_now()
        if session.insights.get("objections"):
            session.insights["nextBestAction"] = "Valide a objeção mais recente e faça uma pergunta curta para entender a causa antes de responder."
        elif session.insights.get("pricingSignals"):
            session.insights["nextBestAction"] = "Confirme o modelo comercial esperado antes de apresentar preço ou discutir propriedade do software."
        persistence.save_state(session)
    return changed


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def _query_tokens(text: str) -> set[str]:
    return {tok for tok in _normalize(text).split() if len(tok) >= 3 and tok not in STOPWORDS}


def retrieve_relevant_transcript(session: MeetingSession, query: str, limit: int = 14) -> list[dict[str, Any]]:
    """Cheap lexical retrieval over the complete transcript.

    This is intentionally dependency-free for the MVP. It allows a manual question
    asked late in a meeting to recover facts mentioned much earlier instead of only
    sending the last few turns to the LLM.
    """
    if not session.transcript:
        return []
    tokens = _query_tokens(query)
    if not tokens:
        return session.transcript[-min(limit, len(session.transcript)):]

    scored: list[tuple[float, int, dict[str, Any]]] = []
    normalized_query = _normalize(query)
    for idx, segment in enumerate(session.transcript):
        text = str(segment.get("text", ""))
        normalized = _normalize(text)
        segment_tokens = set(normalized.split())
        overlap = len(tokens & segment_tokens)
        if overlap == 0 and normalized_query not in normalized:
            continue
        exact_bonus = 2.0 if normalized_query and normalized_query in normalized else 0.0
        density = overlap / max(1, len(tokens))
        recency_bonus = idx / max(1, len(session.transcript)) * 0.15
        score = overlap + density + exact_bonus + recency_bonus
        scored.append((score, idx, segment))

    scored.sort(key=lambda item: (-item[0], item[1]))
    selected = scored[:limit]
    selected.sort(key=lambda item: item[1])
    return [segment for _, _, segment in selected]


class OllamaService:
    def __init__(self) -> None:
        self.status = "unknown"
        self.last_error = ""
        self.lock = asyncio.Lock()

    async def probe(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{settings.ollama_base_url}/api/tags")
                response.raise_for_status()
            self.status = "ready"
            self.last_error = ""
            return True
        except Exception as exc:
            self.status = "unavailable"
            self.last_error = str(exc)
            return False

    async def _generate(self, prompt: str, json_mode: bool = True) -> str:
        async with self.lock:
            payload: dict[str, Any] = {
                "model": settings.ollama_model,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.15, "num_ctx": 4096},
            }
            if json_mode:
                payload["format"] = "json"
            async with httpx.AsyncClient(timeout=settings.ollama_timeout_seconds) as client:
                response = await client.post(f"{settings.ollama_base_url}/api/generate", json=payload)
                response.raise_for_status()
                data = response.json()
                return str(data.get("response", "")).strip()

    async def analyze(self, session: MeetingSession, force: bool = False) -> bool:
        if not force and len(session.transcript) <= session.last_analysis_transcript_count:
            return False
        if not await self.probe():
            return False

        recent = session.transcript[-30:]
        prompt = f"""Você é o Noryn Meeting Copilot, assistente comercial em português do Brasil.
Analise SOMENTE os fatos presentes na transcrição. Não invente requisitos.
Contexto inicial: {session.context_text[:2500]}
Resumo atual: {session.insights.get('summarySoFar', '')[:1800]}
Estado atual: {json.dumps(session.insights, ensure_ascii=False)[:5000]}
Transcrição recente: {json.dumps(recent, ensure_ascii=False)[:9000]}

Retorne JSON com exatamente estas chaves:
requirements, objections, decisions, pendingQuestions, risks, opportunities, commitments,
pricingSignals, technicalRequirements, integrations, nextBestAction, summarySoFar.
As listas devem conter objetos com text, confidence (high|medium|low), timestamp, status (open|confirmed|resolved), sourceExcerpt.
Se algo não estiver sustentado pela conversa, não inclua. Preserve fatos úteis já presentes no estado atual.
"""
        started = time.perf_counter()
        try:
            raw = await self._generate(prompt, json_mode=True)
            parsed = json.loads(raw)
            if not isinstance(parsed, dict):
                return False
            allowed = set(session.insights.keys()) - {"lastUpdated"}
            for key in allowed:
                if key in parsed:
                    session.insights[key] = parsed[key]
            session.insights["lastUpdated"] = utc_now()
            session.last_analysis_transcript_count = len(session.transcript)
            session.analysis_latency_ms = (time.perf_counter() - started) * 1000
            persistence.save_state(session)
            self.status = "ready"
            return True
        except Exception as exc:
            self.status = "error"
            self.last_error = str(exc)
            log.exception("Ollama analysis failed")
            return False

    async def manual(self, session: MeetingSession, action: str, payload: Any, requested_by: str) -> dict[str, Any]:
        query = ""
        if isinstance(payload, dict):
            query = str(payload.get("query") or payload.get("text") or "")
        elif payload is not None:
            query = str(payload)
        action_hint = {
            "next_question": "Diga qual é a melhor pergunta curta para fazer agora.",
            "help_objection": "Identifique a objeção recente e proponha resposta curta + pergunta de continuidade.",
            "analyze_recent": "Resuma os pontos novos e lacunas de descoberta.",
        }.get(action, "Responda objetivamente à pergunta do usuário usando a memória da reunião.")

        relevant = retrieve_relevant_transcript(session, query or action, limit=14)
        recent = session.transcript[-12:]
        fallback = self._fallback_manual(session, action, query, relevant)
        if not await self.probe():
            return fallback

        prompt = f"""Você é o copiloto comercial Noryn. Responda em português brasileiro, curto, factual e acionável.
{action_hint}
Pergunta manual: {query}
Estado estruturado: {json.dumps(session.insights, ensure_ascii=False)[:6500]}

TRECHOS RECUPERADOS DA MEMÓRIA DA REUNIÃO:
{json.dumps(relevant, ensure_ascii=False)[:8500]}

FALAS MAIS RECENTES:
{json.dumps(recent, ensure_ascii=False)[:5000]}

Regras:
- Para perguntas factuais como "quantos usuários ele falou?", priorize os trechos recuperados, mesmo que antigos.
- Se o fato não estiver sustentado nos trechos ou estado, diga claramente que não foi encontrado/confirmado.
- Não invente números, nomes, prazos ou decisões.
Retorne JSON: {{"type":"general|objection|next_question|gap_analysis","question":"...","answer":"...","objectionIdentified":"","interpretation":"","suggestedResponse":"","continuityQuestion":"","timestamp":"{utc_now()}"}}
"""
        try:
            raw = await self._generate(prompt, json_mode=True)
            result = json.loads(raw)
            if isinstance(result, dict):
                result.setdefault("timestamp", utc_now())
                result.setdefault("question", query or action)
                return result
        except Exception:
            log.exception("Manual Ollama request failed")
        return fallback

    @staticmethod
    def _fallback_manual(
        session: MeetingSession,
        action: str,
        query: str,
        relevant: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        if action == "next_question":
            answer = session.insights.get("nextBestAction") or "Pergunte qual é o principal resultado que o cliente espera obter com o sistema."
            kind = "next_question"
        elif action == "help_objection":
            objections = session.insights.get("objections") or []
            latest = objections[-1].get("text", "") if objections else "Nenhuma objeção clara detectada ainda."
            answer = f"Objeção observada: {latest}. Valide o ponto e pergunte o que precisaria acontecer para isso deixar de ser um impeditivo."
            kind = "objection"
        elif query and relevant:
            snippets = []
            for seg in relevant[:4]:
                stamp = seg.get("formattedTime") or seg.get("start") or ""
                speaker = seg.get("speaker", "Participante")
                text = str(seg.get("text", "")).strip()
                snippets.append(f"[{stamp}] {speaker}: {text}")
            answer = "Trechos relacionados encontrados na reunião:\n" + "\n".join(snippets)
            kind = "general"
        else:
            answer = session.insights.get("summarySoFar") or "A IA local está indisponível; o motor de regras continua coletando sinais comerciais."
            kind = "general"
        return {
            "type": kind,
            "question": query or action,
            "answer": answer,
            "timestamp": utc_now(),
        }


ollama_service = OllamaService()


def build_report(session: MeetingSession) -> str:
    def lines(key: str) -> str:
        items = session.insights.get(key) or []
        if not items:
            return "- Nenhum item confirmado."
        out = []
        for item in items:
            if isinstance(item, dict):
                out.append(f"- {item.get('text', '')}")
            else:
                out.append(f"- {item}")
        return "\n".join(out)

    transcript = "\n".join(
        f"- **{seg.get('formattedTime', '')} {seg.get('speaker', 'Participante')}:** {seg.get('text', '')}"
        for seg in session.transcript
    )
    return f"""# Relatório — {session.title}

## Resumo executivo
{session.insights.get('summarySoFar') or 'Resumo não gerado pela LLM; consulte os itens estruturados abaixo.'}

## Próxima melhor ação
{session.insights.get('nextBestAction') or '-'}

## Requisitos
{lines('requirements')}

## Requisitos técnicos e integrações
{lines('technicalRequirements')}
{lines('integrations')}

## Objeções
{lines('objections')}

## Decisões
{lines('decisions')}

## Riscos
{lines('risks')}

## Oportunidades
{lines('opportunities')}

## Compromissos e pendências
{lines('commitments')}
{lines('pendingQuestions')}

## Sinais comerciais / preço
{lines('pricingSignals')}

## Transcrição
{transcript or '- Sem transcrição.'}
"""
