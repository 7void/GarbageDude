from fastapi import FastAPI
from pydantic import BaseModel
import joblib
import pandas as pd

# Load trained model
model = joblib.load("tourist_anomaly_detector_ensemble.pkl")

# Create FastAPI app
app = FastAPI(title="Tourist Anomaly Detector API")

# Define request body schema
class TouristRecord(BaseModel):
    latitude: float
    longitude: float
    altitude_m: float
    time_stationary_hr: float
    gps_shift_m: float
    speed_kmph: float
    avg_speed_last_30min: float
    distance_from_city_center_km: float
    geo_fence_violation: int
    altitude_change_m: float
    time_of_day: str
    places_visited: int
    heart_rate_bpm: int
    blood_pressure_sys: int
    blood_pressure_dia: int
    oxygen_saturation_pct: int
    skin_temperature_c: float
    steps_last_hour: int
    stress_index: int
    hydration_level_pct: int
    weather_condition: str
    temperature_c: float
    humidity_pct: int
    air_quality_index: int
    crowd_density: str
    light_level_lux: int
    calamity_nearby: int
    area_risk_score: int
    sos_pressed: int
    last_checkin_min: int
    phone_battery_pct: int
    network_strength_dbm: int
    app_open_count_last_hr: int
    companion_count: int
    travel_mode: str
    booking_channel: str
    trip_duration_days: int
    spend_per_day_usd: float
    trip_purpose: str

@app.get("/")
def root():
    return {"message": "✅ Tourist Anomaly Detector API is running!"}

@app.post("/predict")
def predict(record: TouristRecord):
    # Convert input to DataFrame
    sample = pd.DataFrame([record.dict()])

    # Predict using ensemble pipeline
    pred = model.predict(sample)[0]

    result = "🚨 Anomaly" if pred == -1 else "✅ Normal"
    return {"prediction": result}
