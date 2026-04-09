"""
CityMap Backend — FastAPI
Fetches building footprints from OpenStreetMap via Overpass API.
Results are cached in memory per city bbox to avoid repeated requests.

Endpoints:
  GET /api/cities          — list of preset cities
  GET /api/density?city=   — population proxy heatmap points for a city
  GET /api/health          — health check
"""

import asyncio
import time
from typing import Optional
import httpx
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="CityMap API", version="1.0.0")

# ── CORS — allow Vite dev server ────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ── In-memory cache: city_key → { data, timestamp } ─────────────────────
_cache: dict = {}
CACHE_TTL = 3600  # 1 hour

# ── Preset cities ────────────────────────────────────────────────────────
CITIES = {
    "boston": {
        "name": "Boston",
        "country": "USA",
        "center": [-71.0589, 42.3601],
        "zoom": 12.5,
        "bbox": [42.22, -71.19, 42.40, -70.98],   # [S, W, N, E]
    },
    "barcelona": {
        "name": "Barcelona",
        "country": "Spain",
        "center": [2.1734, 41.3851],
        "zoom": 13.0,
        "bbox": [41.31, 2.06, 41.47, 2.24],
    },
    "san_sebastian": {
        "name": "San Sebastián",
        "country": "Spain",
        "center": [-1.9812, 43.3183],
        "zoom": 13.5,
        "bbox": [43.28, -2.02, 43.35, -1.92],
    },
    "guadalajara": {
        "name": "Guadalajara",
        "country": "Mexico",
        "center": [-103.3496, 20.6597],
        "zoom": 13.0,
        "bbox": [20.50, -103.50, 20.80, -103.10],
    },
    "madrid": {
        "name": "Madrid",
        "country": "Spain",
        "center": [-3.7038, 40.4168],
        "zoom": 12.5,
        "bbox": [40.34, -3.82, 40.52, -3.57],
    },
    "new_york": {
        "name": "New York",
        "country": "USA",
        "center": [-73.9857, 40.7484],
        "zoom": 12.0,
        "bbox": [40.68, -74.05, 40.83, -73.87],
    },
}


# ── Overpass query builder ───────────────────────────────────────────────
def build_overpass_query(bbox: list[float], limit: int = 10000) -> str:
    s, w, n, e = bbox
    return f"""
[out:json][timeout:30];
(
  node["building"]({s},{w},{n},{e});
  way["building"]({s},{w},{n},{e});
);
out center {limit};
"""


def overpass_to_geojson(elements: list) -> dict:
    """Convert Overpass elements to GeoJSON FeatureCollection."""
    features = []
    for el in elements:
        if el["type"] == "node":
            lon, lat = el.get("lon"), el.get("lat")
        elif el["type"] == "way" and "center" in el:
            lon, lat = el["center"]["lon"], el["center"]["lat"]
        else:
            continue

        tags = el.get("tags", {})
        levels = 1
        try:
            levels = float(tags.get("building:levels", 1) or 1)
        except (ValueError, TypeError):
            levels = 1

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {"levels": min(levels, 50)},
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {"count": len(features)},
    }


# ── Routes ───────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "cached_cities": list(_cache.keys())}


@app.get("/api/cities")
async def get_cities():
    """Return all preset cities with their config."""
    return {
        "cities": [
            {"id": k, **{kk: vv for kk, vv in v.items() if kk != "bbox"}}
            for k, v in CITIES.items()
        ]
    }


@app.get("/api/density")
async def get_density(city: str = Query(..., description="City ID from /api/cities")):
    """
    Return GeoJSON heatmap points for a city.
    Results are cached for 1 hour per city.
    Scalable: adding a new city only requires adding it to the CITIES dict.
    """
    city = city.lower()
    if city not in CITIES:
        raise HTTPException(status_code=404, detail=f"City '{city}' not found. Use /api/cities.")

    # Cache hit
    if city in _cache:
        cached = _cache[city]
        if time.time() - cached["ts"] < CACHE_TTL:
            data = cached["data"]
            data["metadata"]["cache"] = "hit"
            return data

    # Cache miss — fetch from Overpass
    cfg = CITIES[city]
    query = build_overpass_query(cfg["bbox"])

    try:
        async with httpx.AsyncClient(timeout=35.0) as client:
            resp = await client.post(
                "https://overpass-api.de/api/interpreter",
                data={"data": query},
            )
            resp.raise_for_status()
            elements = resp.json().get("elements", [])
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Overpass API timeout. Try again.")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Overpass error: {str(e)}")

    geojson = overpass_to_geojson(elements)
    geojson["metadata"]["cache"] = "miss"
    geojson["metadata"]["city"] = city

    _cache[city] = {"data": geojson, "ts": time.time()}
    return geojson


@app.get("/api/proxy/wms")
async def proxy_wms(
    layers: str = Query(...),
    bbox: str = Query(...),
    srs: str = Query(...),
    width: int = Query(256),
    height: int = Query(256),
    format: str = Query("image/png")
):
    """
    Proxy point to GeoWebCache WMS to leverage server-side meta-tiling.
    """
    # GWC Endpoint for WMS
    base_url = "http://18.27.119.152:8080/geoserver/gwc/service/wms"
    
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "FORMAT": format,
        "TRANSPARENT": "true",
        "LAYERS": layers,
        "SRS": srs,
        "WIDTH": width,
        "HEIGHT": height,
        "BBOX": bbox,
        "TILED": "true" 
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(base_url, params=params)
            resp.raise_for_status()
            return Response(content=resp.content, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"GWC Proxy error: {str(e)}")
