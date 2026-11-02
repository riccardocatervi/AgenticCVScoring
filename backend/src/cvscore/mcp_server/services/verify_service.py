"""Anti-hallucination check: does a quote really appear in the CV?"""

import re
import unicodedata
from difflib import SequenceMatcher

from cvscore.mcp_server.services.cv_service import extract_text
from cvscore.schemas import VerifyResult

MIN_QUOTE_CHARS = 6
_PUNCTUATION = str.maketrans(
    {"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-",
     "•": " ", "●": " ", "▪": " ", "◦": " ", "·": " "}
)  # fmt: skip


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).translate(_PUNCTUATION).casefold()
    text = re.sub(r"-\s*\n\s*", "", text)  # word broken by a hyphen at the end of a line
    return re.sub(r"\s+", " ", text).strip()


def _best_similarity(needle: str, haystack: str) -> float:
    window = len(needle)
    if len(haystack) <= window:
        return SequenceMatcher(None, needle, haystack, autojunk=False).ratio()
    step = max(1, window // 4)
    best = 0.0
    for start in range(0, len(haystack) - window + step, step):
        matcher = SequenceMatcher(None, needle, haystack[start : start + window], autojunk=False)
        if matcher.real_quick_ratio() <= best or matcher.quick_ratio() <= best:
            continue
        best = max(best, matcher.ratio())
    return best


def verify_evidence(cv_id: str, quote: str, threshold: float = 0.85) -> VerifyResult:
    needle = normalize(quote)
    haystack = normalize(extract_text(cv_id))  # unknown cv_id raises from storage
    if len(needle) < MIN_QUOTE_CHARS:
        return VerifyResult(cv_id=cv_id, found=False, similarity=0.0)
    similarity = 1.0 if needle in haystack else _best_similarity(needle, haystack)
    return VerifyResult(cv_id=cv_id, found=similarity >= threshold, similarity=round(similarity, 3))
