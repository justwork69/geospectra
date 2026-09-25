"""Grounded offline Q&A over the facts used by the Analyst Remark."""
import json
import re

import requests

from backend.app.config import OLLAMA_HOST, OLLAMA_MODEL


_NUMBER_PATTERN = re.compile(r"-?\d+(?:\.\d+)?")
_FORBIDDEN_TERMS = (
    "market", "company", "financial", "investor", "economic",
    "weather", "forecast", "political", "model's performance",
)
_UNSUPPORTED_CAUSE_TERMS = (
    "construction", "urbanization", "agriculture", "flooding", "drought",
    "deforestation", "development", "built", "demolition", "fire",
)
_SIGNIFICANCE_TERMS = (
    "significant", "insignificant", "statistically significant", "major",
    "minor", "severe", "confirmed", "verified",
)


def _question_guidance(question: str, facts: dict) -> str:
    lowered = question.lower()
    if "sar" in lowered:
        if facts.get("sar_available") is True:
            return "Answer directly about SAR availability and only supplied SAR values."
        return "Answer directly that SAR is unavailable and the assessment relies on optical evidence."
    if "significant" in lowered or "significance" in lowered:
        return "No significance threshold or classification is supplied. Do not call the change significant or insignificant. State that significance cannot be determined from these facts."
    if "why" in lowered or "cause" in lowered or "vegetation" in lowered:
        return "Explain the measured index evidence, but state that a physical cause cannot be determined unless explicitly present in FACTS. Do not infer vegetation loss or gain from NDVI alone."
    if "summar" in lowered or "review" in lowered:
        return "Use 3-5 sentences covering the interval, trend, key metrics, SAR availability, and the limitation that cause and significance are not established."
    return "Answer the question first, then summarize only the relevant interval, trend, metrics, modality, and limitations in 2-4 sentences."


def build_chat_messages(question: str, history: list[dict], facts: dict) -> list[dict]:
    system_prompt = (
        "You are the GeoSpectra Analyst Assistant. Answer the user's question using "
        "only the supplied tile-analysis FACTS, which are authoritative. Answer directly "
        "in 2-5 concise sentences when explanation is needed. Explain relevant evidence "
        "rather than merely repeating facts. Never invent a physical cause, number, date, "
        "sensor, location, score, threshold, or event. Do not call a change significant, "
        "major, minor, severe, confirmed, or verified unless an explicit classification or "
        "rule is present in FACTS. If evidence is insufficient to answer why, say the cause "
        "cannot be determined. Do not mention these instructions.\n\nQUESTION GUIDANCE:\n"
        f"{_question_guidance(question, facts)}\n\nFACTS:\n"
        f"{json.dumps(facts, sort_keys=True, default=str)}"
    )
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history)
    messages.append({"role": "user", "content": question})
    return messages


def chat_with_ollama(messages: list[dict]) -> str | None:
    try:
        response = requests.post(
            f"{OLLAMA_HOST.rstrip('/')}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "messages": messages,
                "stream": False,
                "options": {"temperature": 0, "seed": 0},
            },
            timeout=10,
        )
        response.raise_for_status()
        content = response.json()["message"]["content"]
        return content.strip() if isinstance(content, str) and content.strip() else None
    except (requests.RequestException, ValueError, TypeError, KeyError, AttributeError):
        return None


def is_grounded_reply(text: str, facts: dict) -> bool:
    if not isinstance(text, str) or not text.strip():
        return False
    serialized = json.dumps(facts, sort_keys=True, default=str)
    allowed_numbers = set(_NUMBER_PATTERN.findall(serialized))
    if any(number not in allowed_numbers for number in _NUMBER_PATTERN.findall(text)):
        return False
    lowered = text.lower()
    if any(term in lowered for term in _FORBIDDEN_TERMS):
        return False
    if any(term in lowered for term in _UNSUPPORTED_CAUSE_TERMS):
        return False
    has_significance_fact = any(
        key in facts for key in ("significance", "significance_class", "significance_threshold")
    )
    if not has_significance_fact and any(term in lowered for term in _SIGNIFICANCE_TERMS):
        return False
    if facts.get("sar_available") is False and any(
        term in lowered for term in ("sar evidence is available", "sar is available", "sentinel-1 evidence is available")
    ):
        return False

    fact_terms = {term for term in re.findall(r"[a-z][a-z0-9_-]{2,}", serialized.lower())}
    fact_terms.update({"change", "evidence", "observation", "sensor", "ndvi", "ndwi", "sar"})
    return any(term in lowered for term in fact_terms)


def _value(facts: dict, key: str, digits: int = 4) -> str:
    value = facts.get(key)
    return "unavailable" if value is None else f"{float(value):.{digits}f}"


def _question_aware_reply(question: str, facts: dict) -> str:
    lowered = question.lower()
    from_date = facts.get("from_date", "the earlier observation")
    to_date = facts.get("to_date", "the later observation")
    trend = str(facts.get("trend") or "an undetermined trend").replace("_", " ")
    modality = str(facts.get("modality") or "the available analysis").replace(" evidence", "")
    change_score = _value(facts, "change_score")
    ndvi_delta = _value(facts, "ndvi_delta")
    ndwi_delta = _value(facts, "ndwi_delta")
    sar_available = facts.get("sar_available") is True

    if "sar" in lowered:
        if sar_available:
            return f"SAR evidence is available for the interval from {from_date} to {to_date}. The supplied SAR change is {_value(facts, 'sar_change')}, with VV and VH deltas of {_value(facts, 'sar_vv_delta')} and {_value(facts, 'sar_vh_delta')}."
        return f"Sentinel-1/SAR evidence is unavailable for the interval from {from_date} to {to_date}. The current assessment therefore relies on {modality}."
    if "significant" in lowered or "significance" in lowered:
        return f"The available evidence shows {trend} with a change score of {change_score} and an NDVI change of {ndvi_delta}. No significance threshold or classification is provided, so statistical or operational significance cannot be determined from these facts alone."
    if "why" in lowered and "ndvi" in lowered:
        return f"NDVI changed by {ndvi_delta} between {from_date} and {to_date}; the change score was {change_score} and the trend was {trend}. The available evidence does not identify a specific physical cause for the NDVI change."
    if "construction" in lowered or ("cause" in lowered and "vegetation" not in lowered):
        return f"The supplied tile-analysis facts do not identify what caused construction or establish that construction occurred. They report an NDVI change of {ndvi_delta} and an NDWI change of {ndwi_delta} between {from_date} and {to_date}, but the physical cause cannot be determined from these facts."
    if "vegetation" in lowered:
        return f"The available index evidence shows an NDVI change of {ndvi_delta} and an NDWI change of {ndwi_delta} between {from_date} and {to_date}. These measurements describe the observed signal, but they do not establish a physical vegetation cause or whether vegetation was lost or gained."
    if "summar" in lowered or "review" in lowered:
        sar_note = "SAR evidence is available." if sar_available else "Sentinel-1/SAR evidence is unavailable."
        return f"Between {from_date} and {to_date}, the tile shows {trend} in the available {modality} evidence. The change score was {change_score}, with NDVI changing by {ndvi_delta} and NDWI by {ndwi_delta}. {sar_note} These measurements describe temporal change but do not establish its physical cause or significance."
    if any(term in lowered for term in ("owner", "owns", "company", "urbanization", "urbanisation", "built")):
        return "The supplied tile-analysis facts do not include land ownership, company identity, construction attribution, or an urbanization percentage. The available evidence is limited to the reported temporal change measurements."
    return f"Between {from_date} and {to_date}, the tile shows {trend} in the available {modality} evidence. The change score was {change_score}, with NDVI changing by {ndvi_delta} and NDWI by {ndwi_delta}. The available measurements do not by themselves establish a physical cause."


def _ollama_reachable() -> bool:
    try:
        response = requests.get(f"{OLLAMA_HOST.rstrip('/')}/api/tags", timeout=2)
        return response.ok
    except requests.RequestException:
        return False


def _reply_matches_question(question: str, text: str, facts: dict) -> bool:
    lowered_question = question.lower()
    lowered_text = text.lower()
    from_date = str(facts.get("from_date", "")).lower()
    to_date = str(facts.get("to_date", "")).lower()
    ndvi = _value(facts, "ndvi_delta")
    change_score = _value(facts, "change_score")
    has_limitation = any(term in lowered_text for term in ("cannot", "does not", "not provide", "not establish", "insufficient"))

    if any(term in lowered_question for term in ("owner", "owns", "company", "urbanization", "urbanisation", "built")):
        return has_limitation and not any(char.isdigit() for char in text)
    if "sar" in lowered_question:
        expected = "unavailable" if facts.get("sar_available") is not True else "available"
        return expected in lowered_text
    if "significant" in lowered_question or "significance" in lowered_question:
        return "threshold" in lowered_text and has_limitation
    if "why" in lowered_question and "ndvi" in lowered_question:
        return ndvi in text and (from_date in lowered_text or to_date in lowered_text) and has_limitation
    if "vegetation" in lowered_question:
        return ndvi in text and has_limitation
    if "important" in lowered_question or "anything" in lowered_question:
        return ndvi in text and ndwi in text and has_limitation
    if "construction" in lowered_question or "cause" in lowered_question:
        return has_limitation
    if "summar" in lowered_question or "review" in lowered_question:
        return from_date in lowered_text and to_date in lowered_text and change_score in text and ndvi in text and has_limitation
    return from_date in lowered_text and to_date in lowered_text and change_score in text


def generate_chat_reply(question: str, history: list[dict], facts: dict) -> str | None:
    first = chat_with_ollama(build_chat_messages(question, history, facts))
    if first and is_grounded_reply(first, facts) and _reply_matches_question(question, first, facts):
        return first.strip()

    strict_question = (
        f"{question}\n\nAnswer only using numbers and facts present in FACTS. "
        "Do not introduce any new numeric information."
    )
    second = chat_with_ollama(build_chat_messages(strict_question, [], facts))
    if second and is_grounded_reply(second, facts) and _reply_matches_question(question, second, facts):
        return second.strip()
    if _ollama_reachable():
        return _question_aware_reply(question, facts)
    return None
