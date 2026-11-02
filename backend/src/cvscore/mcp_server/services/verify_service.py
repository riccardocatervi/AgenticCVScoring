"""Anti-hallucination check: does a quote really appear in the CV?"""

import re
import unicodedata
from collections import Counter
from difflib import SequenceMatcher

from cvscore.mcp_server.services.cv_service import extract_text
from cvscore.schemas import VerifyResult

MIN_QUOTE_CHARS = 6
# A number as written in a CV: 40, 3.5, 40%, 2019. A fuzzy match must not change any of them.
_NUMBER = re.compile(r"(?<!\w)\d+(?:[.,]\d+)*%?(?!\w)")
_PUNCTUATION = str.maketrans(
    {"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-",
     "•": " ", "●": " ", "▪": " ", "◦": " ", "·": " "}
)  # fmt: skip


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).translate(_PUNCTUATION).casefold()
    text = re.sub(r"-\s*\n\s*", "", text)  # word broken by a hyphen at the end of a line
    return re.sub(r"\s+", " ", text).strip()


def _best_match(needle: str, haystack: str) -> tuple[float, int]:
    """The best similarity of `needle` to any window of `haystack`, and where that window starts."""
    window = len(needle)
    if len(haystack) <= window:
        return SequenceMatcher(None, needle, haystack, autojunk=False).ratio(), 0
    step = max(1, window // 4)
    best, best_start = 0.0, 0
    for start in range(0, len(haystack) - window + step, step):
        matcher = SequenceMatcher(None, needle, haystack[start : start + window], autojunk=False)
        if matcher.real_quick_ratio() <= best or matcher.quick_ratio() <= best:
            continue
        ratio = matcher.ratio()
        if ratio > best:
            best, best_start = ratio, start
    return best, best_start


def _numbers_agree(needle: str, haystack: str, start: int) -> bool:
    """Every number of the quote is also in the CV text where the quote matched.

    Similarity alone cannot tell "reduced latency by 40%" from "by 90%": they differ by one
    character. A model inventing a figure is the failure this check exists for, so a fuzzy match
    that changes or drops a number is rejected. The region is a little wider than the quote
    because the windows are compared in steps and do not line up exactly.
    """
    wanted = Counter(_NUMBER.findall(needle))
    if not wanted:
        return True
    margin = max(1, len(needle) // 4)
    region = haystack[max(0, start - margin) : start + len(needle) + margin]
    return not wanted - Counter(_NUMBER.findall(region))


def verify_evidence(cv_id: str, quote: str, threshold: float = 0.85) -> VerifyResult:
    needle = normalize(quote)
    haystack = normalize(extract_text(cv_id))  # unknown cv_id raises from storage
    if len(needle) < MIN_QUOTE_CHARS:
        return VerifyResult(cv_id=cv_id, found=False, similarity=0.0)
    if needle in haystack:
        return VerifyResult(cv_id=cv_id, found=True, similarity=1.0)
    similarity, start = _best_match(needle, haystack)
    found = similarity >= threshold and _numbers_agree(needle, haystack, start)
    return VerifyResult(cv_id=cv_id, found=found, similarity=round(similarity, 3))
