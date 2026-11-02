"""CV parsing and text lookup. Pure functions, addressed by cv_id."""

import re
from functools import lru_cache
from pathlib import Path

import docx
from pypdf import PdfReader

from cvscore.mcp_server.services.errors import ServiceError
from cvscore.schemas import CvSection, ParsedCv, SearchHit, SearchResult, SectionInfo
from cvscore.storage import get_cv_path

MAX_PAGES = 15
MAX_CHARS = 60_000

KNOWN_HEADINGS = {
    "summary", "profile", "objective", "experience", "work experience",
    "professional experience", "education", "skills", "technical skills", "projects",
    "languages", "certifications", "publications", "interests", "awards",
    # Italian CVs
    "profilo", "esperienza", "esperienze", "esperienza lavorativa", "formazione",
    "istruzione", "competenze", "competenze tecniche", "progetti", "lingue",
    "certificazioni", "pubblicazioni", "interessi",
}  # fmt: skip


def _read_pdf(path: Path) -> str:
    reader = PdfReader(path)
    if reader.is_encrypted:
        raise ServiceError("the PDF is password protected")
    return "\n".join((page.extract_text() or "") for page in reader.pages[:MAX_PAGES])


def _read_docx(path: Path) -> str:
    document = docx.Document(str(path))
    parts = [p.text for p in document.paragraphs]
    for table in document.tables:
        for row in table.rows:
            parts.extend(cell.text for cell in row.cells)
    return "\n".join(parts)


@lru_cache(maxsize=64)
def _extract_cached(path_str: str) -> str:
    path = Path(path_str)
    reader = _read_pdf if path.suffix == ".pdf" else _read_docx
    try:
        text = reader(path)
    except ServiceError:
        raise
    except Exception as exc:  # third-party parsers raise many different errors on bad files
        raise ServiceError("cannot read the file: it may be corrupted") from exc
    text = text[:MAX_CHARS]
    if not text.strip():
        raise ServiceError("no extractable text: the document may be a scan or an image")
    return text


def extract_text(cv_id: str) -> str:
    return _extract_cached(str(get_cv_path(cv_id)))


def _is_heading(line: str) -> bool:
    candidate = line.strip().rstrip(":").strip()
    if not candidate or len(candidate) > 40 or candidate.endswith("."):
        return False
    if candidate.casefold() in KNOWN_HEADINGS:
        return True
    letters = [c for c in candidate if c.isalpha()]
    return len(letters) >= 3 and all(c.isupper() for c in letters) and len(candidate.split()) <= 4


def _split_sections(text: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {}
    current = "Header"
    seen_first_line = False
    for line in text.splitlines():
        if line.strip() and not seen_first_line:
            seen_first_line = True  # the first line is the name, never a heading
        elif _is_heading(line):
            current = line.strip().rstrip(":").strip()
            sections.setdefault(current, [])
            continue
        sections.setdefault(current, []).append(line)
    joined = {name: "\n".join(lines).strip() for name, lines in sections.items()}
    joined = {name: body for name, body in joined.items() if body}
    if len(joined) <= 1 and "Header" in joined:
        return {"Full text": text.strip()}
    return joined


def parse_cv(cv_id: str) -> ParsedCv:
    text = extract_text(cv_id)
    sections = _split_sections(text)
    return ParsedCv(
        cv_id=cv_id,
        n_chars=len(text),
        sections=[SectionInfo(name=n, n_chars=len(b)) for n, b in sections.items()],
    )


def get_section(cv_id: str, name: str, max_chars: int = 4000) -> CvSection:
    sections = _split_sections(extract_text(cv_id))
    for section_name, body in sections.items():
        if section_name.casefold() == name.strip().casefold():
            return CvSection(cv_id=cv_id, name=section_name, text=body[:max_chars])
    raise ServiceError(f"no section called '{name}'. Sections: {', '.join(sections)}")


def search_cv(cv_id: str, query: str, max_hits: int = 5, context_chars: int = 200) -> SearchResult:
    if not query.strip():
        raise ServiceError("empty query")
    pattern = re.compile(re.escape(query.strip()), re.IGNORECASE)
    half = context_chars // 2
    hits: list[SearchHit] = []
    for section_name, body in _split_sections(extract_text(cv_id)).items():
        last_end = -1
        for match in pattern.finditer(body):
            if len(hits) >= max_hits:
                break
            if match.start() < last_end:
                continue  # already covered by the previous snippet
            start, end = max(0, match.start() - half), min(len(body), match.end() + half)
            snippet = " ".join(body[start:end].split())
            hits.append(SearchHit(section=section_name, text=snippet))
            last_end = end
    return SearchResult(cv_id=cv_id, query=query, hits=hits)
