from pathlib import Path
from html.parser import HTMLParser
from PIL import Image
from io import BytesIO
import base64
import json
import re

ROOT = Path(__file__).resolve().parent.parent
html = (ROOT / "index.html").read_text(encoding="utf-8")
script_blocks = re.findall(r"<script\b([^>]*)>(.*?)</script>", html, flags=re.S | re.I)
script = next((body for _, body in script_blocks if "const CITY_DATA" in body), "")
if not script:
    raise RuntimeError("Main inline script not found")
match = re.search(r"const CITY_DATA = (\{.*\});\s*\n", script)
if not match:
    raise RuntimeError("CITY_DATA not found")
data = json.loads(match.group(1))

class AuditParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.controls = []
        self.labels_for = []
        self.implicit_labels = set()
        self.label_depth = 0
        self.images = []
        self.blank_links = []
        self.external_links = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.append(a["id"])
        if tag in {"input", "select", "textarea"} and a.get("type") != "hidden":
            self.controls.append((tag, a))
            if self.label_depth and a.get("id"):
                self.implicit_labels.add(a["id"])
        if tag == "label":
            self.label_depth += 1
            if "for" in a:
                self.labels_for.append(a["for"])
        if tag == "img":
            self.images.append(a)
        if tag == "a" and a.get("href"):
            self.external_links.append(a["href"])
            if a.get("target") == "_blank":
                self.blank_links.append(a)
    def handle_endtag(self, tag):
        if tag == "label" and self.label_depth:
            self.label_depth -= 1

parser = AuditParser()
parser.feed(html)
duplicates = sorted({x for x in parser.ids if parser.ids.count(x) > 1})
unlabelled = []
for tag, attrs in parser.controls:
    id_ = attrs.get("id")
    if not id_:
        continue
    labelled = id_ in parser.labels_for or id_ in parser.implicit_labels
    if not labelled and not attrs.get("aria-label") and not attrs.get("aria-labelledby"):
        unlabelled.append(id_)

missing_rel = [a.get("href") for a in parser.blank_links if "noopener" not in (a.get("rel") or "")]
missing_alt = [a.get("src", "")[:100] for a in parser.images if "alt" not in a]
js_id_refs = sorted(set(re.findall(r"getElementById\([\"']([^\"']+)[\"']\)", script)))
missing_ids = [id_ for id_ in js_id_refs if id_ not in parser.ids]

coordinate_issues = []
coordinate_count = 0
def walk(value, path="CITY_DATA"):
    global coordinate_count
    if isinstance(value, dict):
        for key, item in value.items():
            walk(item, f"{path}.{key}")
    elif isinstance(value, list):
        if len(value) == 2 and all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in value):
            lat, lng = value
            if -90 <= lat <= 90 and -180 <= lng <= 180:
                coordinate_count += 1
                if not (48 <= lat <= 49.5 and 43 <= lng <= 46):
                    coordinate_issues.append({"path": path, "value": value, "issue": "outside expected region"})
        else:
            for i, item in enumerate(value):
                walk(item, f"{path}[{i}]")
walk(data)

photos = []
for name, uri in data.get("photos", {}).items():
    item = {"name": name, "uri_chars": len(uri)}
    try:
        header, encoded = uri.split(",", 1)
        raw = base64.b64decode(encoded, validate=True)
        image = Image.open(BytesIO(raw))
        image.verify()
        image = Image.open(BytesIO(raw))
        item.update({"ok": True, "format": image.format, "dimensions": list(image.size), "bytes": len(raw)})
    except Exception as exc:
        item.update({"ok": False, "error": str(exc)})
    photos.append(item)

report = {
    "html_bytes": (ROOT / "index.html").stat().st_size,
    "inline_script_count": len(script_blocks),
    "inline_app_js_chars": len(script),
    "inline_editor_js_chars": sum(len(body) for attrs, body in script_blocks if "data-pplx-inline-edit" in attrs),
    "city_data_keys": list(data),
    "street_segments": len(data.get("streets", [])),
    "coordinate_pairs": coordinate_count,
    "coordinate_issues": coordinate_issues[:100],
    "photos": photos,
    "duplicate_ids": duplicates,
    "unlabelled_controls": unlabelled,
    "target_blank_missing_noopener": missing_rel,
    "static_images_missing_alt": missing_alt,
    "missing_js_id_targets": missing_ids,
    "mixed_content_links": [u for u in parser.external_links if u.startswith("http://")],
    "external_link_count": len(parser.external_links),
}
(ROOT / "qa" / "static-results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
