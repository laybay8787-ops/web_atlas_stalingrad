"""Compare atlas marker positions with independent Nominatim/OSM geocoding.

This is a reproducibility aid, not proof of historical accuracy. Building centres,
address points and entrances may legitimately differ by tens of metres.
"""
import json
import math
import time
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent / "geolocation-results.json"
OBJECTS = [
    ("pavlov", "Дом Павлова", 48.716086, 44.531389, "Волгоград, Советская улица, 39"),
    ("zabolotny", "Дом Заболотного", 48.715470, 44.530860, "Дом Заболотного, Волгоград"),
    ("mill", "Мельница Гергардта", 48.715220, 44.533070, "Мельница Гергардта, Волгоград"),
    ("gruzchikov", "Дом грузчиков", 48.694674, 44.495311, "Волгоград, Рабоче-Крестьянская улица, 22"),
    ("kommunal", "Дом коммунальщиков", 48.693680, 44.495080, "Дом консервщиков, Волгоград"),
    ("ogareva5", "Особняк Огарёва, 5", 48.693430, 44.495330, "Волгоград, улица Огарёва, 5"),
    ("elevator", "Сталинградский элеватор", 48.681075, 44.489200, "Волгоград, элеватор"),
    ("vokzal", "Вокзал Волгоград I", 48.710000, 44.514000, "Волгоград, Привокзальная площадь, 1"),
    ("universmag", "Центральный универмаг", 48.708597, 44.516501, "Волгоград, площадь Павших Борцов, 2"),
    ("square", "Площадь 9-го Января", 48.716400, 44.530350, "Площадь 9-го Января, Волгоград"),
    ("mamayev", "Мамаев курган", 48.742400, 44.536900, "Мамаев курган, Волгоград"),
    ("stz", "Сталинградский тракторный завод", 48.793800, 44.602900, "Сталинградский тракторный завод, Волгоград"),
]


def haversine_m(a_lat, a_lon, b_lat, b_lon):
    radius = 6371008.8
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(h))


def nominatim(query):
    params = urllib.parse.urlencode({"q": query, "format": "jsonv2", "limit": 3})
    request = urllib.request.Request(
        "https://nominatim.openstreetmap.org/search?" + params,
        headers={"User-Agent": "StalingradAtlasQA/1.0 (one-time local project audit)"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


results = []
for key, title, lat, lon, query in OBJECTS:
    row = {"id": key, "title": title, "atlas": [lat, lon], "query": query}
    try:
        matches = nominatim(query)
        row["matches"] = [
            {
                "display_name": item.get("display_name"),
                "type": item.get("type"),
                "category": item.get("category"),
                "lat": float(item["lat"]),
                "lon": float(item["lon"]),
                "distance_m": round(haversine_m(lat, lon, float(item["lat"]), float(item["lon"])), 1),
                "osm_type": item.get("osm_type"),
                "osm_id": item.get("osm_id"),
            }
            for item in matches
        ]
    except Exception as exc:
        row["error"] = repr(exc)
    results.append(row)
    print(key, row.get("error") or [(m["distance_m"], m["display_name"]) for m in row["matches"][:1]])
    time.sleep(1.1)

# Official heritage-catalogue points independently retrieved during source review.
references = {
    "gruzchikov": ("ВООПИиК", 48.694554, 44.494976, "https://voopiik34.ru/object/dom-gruzchikov-zhiloj-dom-restoran-gruziya-upravlenie-rechnogo-porta-g-volgograd-voroshilovskij-rajon-ul-raboche-krestyanskaya-22/"),
    "vokzal": ("ВООПИиК", 48.712571, 44.513374, "https://voopiik34.ru/object/zheleznodorozhnyj-vokzal-stanczii-volgograd-i-g-volgograd-czentralnyj-rajon-privokzalnaya-ploshhad/"),
}
for row in results:
    if row["id"] in references:
        source, lat, lon, url = references[row["id"]]
        row["heritage_reference"] = {
            "source": source,
            "url": url,
            "lat": lat,
            "lon": lon,
            "distance_m": round(haversine_m(row["atlas"][0], row["atlas"][1], lat, lon), 1),
        }

OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
print("Saved", OUT)
