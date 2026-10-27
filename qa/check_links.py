from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from bs4 import BeautifulSoup
import json
import re
import requests

root = Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text(encoding="utf-8")
script_blocks = re.findall(r"<script\b[^>]*>(.*?)</script>", html, flags=re.S | re.I)
script = next((body for body in script_blocks if "const CITY_DATA" in body), "")
urls = {a["href"] for a in BeautifulSoup(html, "html.parser").find_all("a", href=True) if a["href"].startswith(("http://", "https://"))}
urls.update(u.rstrip("),.;") for u in re.findall(r"https?://[^\s\"'`<>`]+", script))
urls = sorted(u for u in urls if not any(x in u for x in ("{s}", "{z}", "{x}", "{y}", "${")))

def check(url):
    headers = {"User-Agent": "Mozilla/5.0 (compatible; AtlasQA/1.0)"}
    try:
        response = requests.head(url, headers=headers, allow_redirects=True, timeout=15)
        if response.status_code in {400, 403, 405, 406, 429, 500, 501, 503}:
            response = requests.get(url, headers={**headers, "Range": "bytes=0-0"}, allow_redirects=True, timeout=20, stream=True)
        result = {"url": url, "status": response.status_code, "final_url": response.url}
        response.close()
        return result
    except Exception as exc:
        return {"url": url, "status": None, "error": f"{type(exc).__name__}: {exc}"}

results = []
with ThreadPoolExecutor(max_workers=4) as pool:
    futures = {pool.submit(check, url): url for url in urls}
    for future in as_completed(futures):
        result = future.result()
        results.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
results.sort(key=lambda x: x["url"])
(root / "qa" / "link-results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Checked {len(results)} unique links")
