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
from fastapi import FastAPI, HTTPException, Query, Response, Request
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="CityMap API", version="1.0.0")

# ── CORS — allow Vite dev server ────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],  # Allowed all for dev
    allow_headers=["*"],
)

# ── DB Config ────────────────────────────────────────────────────────────
DB_CONFIG = {
    "host": "18.27.124.236",
    "port": 1290,
    "user": "postgres",
    "password": "cityscience",
    "database": "geospatial_db"
}

from pydantic import BaseModel
from typing import List

class Stop(BaseModel):
    lat: float
    lng: float
    line_name: str
    line_color: str
    transport_mode: str
    frequency: int

class TransitData(BaseModel):
    stops: List[Stop]

async def get_db_conn():
    import asyncpg
    return await asyncpg.connect(**DB_CONFIG, timeout=5.0)

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


from io import BytesIO
from PIL import Image

@app.get("/api/proxy/wms")
async def proxy_wms(request: Request):
    """
    Proxy point to GeoWebCache WMS. 
    Uses all parameters sent by the client to avoid dropping styles or other critical info.
    """
    params = dict(request.query_params)
    # Ensure mandatory WMS params if missing (optional fallback)
    if "SERVICE" not in params: params["SERVICE"] = "WMS"
    if "VERSION" not in params: params["VERSION"] = "1.1.1"
    if "REQUEST" not in params: params["REQUEST"] = "GetMap"
    if "FORMAT" not in params: params["FORMAT"] = "image/png"
    if "TRANSPARENT" not in params: params["TRANSPARENT"] = "true"

    base_url = "http://18.27.124.236:8080/geoserver/cityscience/wms"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(base_url, params=params)
            return Response(content=resp.content, status_code=resp.status_code, media_type=resp.headers.get("content-type"))
    except Exception as e:
        print(f"Proxy Error: {e}")
        raise HTTPException(status_code=502, detail=f"Proxy error: {str(e)}")

@app.get("/api/transit/costs")
async def get_transit_costs():
    """
    Returns reference costs per mode for KPI calculations.
    """
    try:
        conn = await get_db_conn()
        rows = await conn.fetch("SELECT * FROM transit_costs")
        await conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        print(f"DB Error: {e}")
        # Fallback to hardcoded values if DB fails
        return [
            {"category":"Heavy Rail","cost_km":35627157.69,"cost_station":20648323.32,"cost_vehicle":20045480.80,"prof_services_pct":0.25},
            {"category":"Light Rail (Surface/Elevated)","cost_km":358970786.22,"cost_station":21790041.95,"cost_vehicle":10005397.72,"prof_services_pct":0.25},
            {"category":"Bus","cost_km":0.0,"cost_station":445097.37,"cost_vehicle":1715479.44,"prof_services_pct":0.25}
        ]


@app.get("/api/proxy/wfs")
async def proxy_wfs(
    typeName: str = Query(...),
    srsname: str = Query("EPSG:4326"),
    maxFeatures: int = Query(1000)
):
    """
    Proxy point to GeoServer WFS to get vector data as GeoJSON.
    """
    base_url = "http://18.27.124.236:8080/geoserver/cityscience/ows"
    
    params = {
        "service": "WFS",
        "version": "1.0.0",
        "request": "GetFeature",
        "typeName": typeName,
        "maxFeatures": maxFeatures,
        "outputFormat": "application/json",
        "srsname": srsname
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(base_url, params=params)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"WFS Proxy error: {str(e)}")


@app.post("/api/transit/save")
async def save_transit_data(data: TransitData):
    """
    Saves drawn transit stops to PostgreSQL.
    Schema: itm_drawr
    """
    conn = await get_db_conn()
    try:
        # Ensure table exists in the specified schema
        await conn.execute("CREATE SCHEMA IF NOT EXISTS itm_drawr;")
        await conn.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS itm_drawr.transit_stops (
                id SERIAL PRIMARY KEY,
                line_name TEXT,
                line_color TEXT,
                transport_mode TEXT,
                frequency INTEGER,
                geom GEOMETRY(Point, 4326),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # Bulk insert entries
        async with conn.transaction():
            for stop in data.stops:
                await conn.execute("""
                    INSERT INTO itm_drawr.transit_stops (line_name, line_color, transport_mode, frequency, geom)
                    VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326))
                """, stop.line_name, stop.line_color, stop.transport_mode, stop.frequency, stop.lng, stop.lat)
        
        return {"status": "success", "count": len(data.stops)}
    except Exception as e:
        error_msg = f"Database error ({type(e).__name__}): {str(e)}"
        print(f"DB Error: {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)
    finally:
        if 'conn' in locals() and conn:
            await conn.close()