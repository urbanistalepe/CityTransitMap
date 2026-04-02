# CityMap 🗺

Global population density & traffic map. React + FastAPI + Mapbox GL JS.

## Stack

| Layer    | Tech                          |
|----------|-------------------------------|
| Frontend | React 19 + Vite + Mapbox GL JS |
| Backend  | Python 3.11+ FastAPI + Uvicorn |
| Data     | OpenStreetMap / Overpass API   |
| Runner   | npm concurrently               |

## Quick Start

```bash
# 1. Install everything (run once)
npm run install:all

# 2. Run frontend + backend together
npm run dev
```

- Frontend → http://localhost:5173  
- Backend API → http://localhost:8000  
- API docs → http://localhost:8000/docs  

## Architecture

```
citymap/
├── package.json          ← root: npm run dev runs both
├── backend/
│   ├── main.py           ← FastAPI: /api/cities + /api/density
│   └── requirements.txt
└── frontend/
    ├── vite.config.js    ← proxies /api → localhost:8000
    └── src/
        ├── App.jsx               ← main orchestrator
        ├── hooks/useMap.js       ← all Mapbox GL logic
        ├── services/api.js       ← fetch calls to backend
        └── components/
            ├── CitySelector      ← city dropdown
            ├── LayerToggle       ← Traffic / Density buttons
            └── Legend            ← map legend
```

## Adding a New City

Only the backend needs updating — zero frontend changes required.

In `backend/main.py`, add to the `CITIES` dict:

```python
"donostia": {
    "name": "San Sebastián",
    "country": "Spain",
    "center": [-1.9812, 43.3183],   # [lng, lat]
    "zoom": 13.5,
    "bbox": [43.28, -2.02, 43.35, -1.92],  # [S, W, N, E]
},
```

The frontend will pick it up automatically via `/api/cities`.

## How Density Works

1. Frontend requests `/api/density?city=barcelona`
2. Backend queries **Overpass API** (OpenStreetMap) for all buildings in the city bbox
3. Each building → GeoJSON point with `levels` property (number of floors)
4. FastAPI caches results in memory for 1 hour (no repeat OSM requests)
5. Frontend feeds the GeoJSON into a Mapbox **heatmap layer**, weighting by building levels

This approach is 100% global — any city with OSM coverage works identically.

## Environment

No `.env` needed. If you want to add a Mapbox token override:

```bash
# frontend/.env.local
VITE_MAPBOX_TOKEN=pk.your_token_here
```

Then in `frontend/src/hooks/useMap.js`:
```js
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN
```
