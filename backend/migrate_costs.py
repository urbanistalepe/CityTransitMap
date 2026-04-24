import asyncio
import asyncpg
import json

DB_CONFIG = {
    "host": "18.27.124.236",
    "port": 1290,
    "user": "postgres",
    "password": "cityscience",
    "database": "geospatial_db"
}

COSTS_DATA = [
    {"Category":"Heavy Rail","cost_km":35627157.69,"cost_station":20648323.32,"cost_vehicle":20045480.80,"prof_pct":0.25},
    {"Category":"Light Rail (Surface/Elevated)","cost_km":358970786.22,"cost_station":21790041.95,"cost_vehicle":10005397.72,"prof_pct":0.25},
    {"Category":"BRT (Underground)","cost_km":122868317.42,"cost_station":28296842.30,"cost_vehicle":1825595.05,"prof_pct":0.25},
    {"Category":"BRT","cost_km":0.0,"cost_station":445097.37,"cost_vehicle":1825595.05,"prof_pct":0.25},
    {"Category":"Commuter Rail","cost_km":7399780.89,"cost_station":33927083.33,"cost_vehicle":97173952.08,"prof_pct":0.25},
    {"Category":"Bus","cost_km":0.0,"cost_station":445097.37,"cost_vehicle":1715479.44,"prof_pct":0.25}
]

async def migrate():
    print("Connecting to DB...")
    conn = await asyncpg.connect(**DB_CONFIG)
    try:
        print("Creating table transit_costs...")
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS transit_costs (
                category TEXT PRIMARY KEY,
                cost_km FLOAT,
                cost_station FLOAT,
                cost_vehicle FLOAT,
                prof_services_pct FLOAT
            )
        ''')
        
        print("Inserting records...")
        for row in COSTS_DATA:
            await conn.execute('''
                INSERT INTO transit_costs (category, cost_km, cost_station, cost_vehicle, prof_services_pct)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (category) DO UPDATE SET
                    cost_km = EXCLUDED.cost_km,
                    cost_station = EXCLUDED.cost_station,
                    cost_vehicle = EXCLUDED.cost_vehicle,
                    prof_services_pct = EXCLUDED.prof_services_pct
            ''', row['Category'], row['cost_km'], row['cost_station'], row['cost_vehicle'], row['prof_pct'])
        
        print("Migration complete!")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(migrate())
