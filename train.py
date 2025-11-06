import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.svm import OneClassSVM
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.base import BaseEstimator, TransformerMixin, ClassifierMixin, clone
import numpy as np
import joblib

df = pd.read_csv("tourist_full_dataset.csv")
df.head()

drop_cols = ["tourist_id", "timestamp", "is_anomaly"]
X = df.drop(columns=drop_cols)

categorical = ["time_of_day", "weather_condition", "crowd_density",
               "travel_mode", "booking_channel", "trip_purpose"]
numeric = [c for c in X.columns if c not in categorical]

# Preprocessor
preprocessor = ColumnTransformer(
    transformers=[
        ("cat", OneHotEncoder(handle_unknown="ignore"), categorical)
    ],
    remainder="passthrough"
)

# --- Ensemble Wrapper ---
class AnomalyEnsemble(BaseEstimator, ClassifierMixin):
    def _init_(self, models):
        self.models = models

    def fit(self, X, y=None):
        self.fitted_models_ = []
        for name, model in self.models:
            mdl = clone(model)
            mdl.fit(X)
            self.fitted_models_.append((name, mdl))
        return self

    def predict(self, X):
        preds = []
        for name, mdl in self.fitted_models_:
            pred = mdl.predict(X)  # -1 anomaly, 1 normal
            preds.append(pred)
        preds = np.array(preds)
        # Majority voting across models
        final_pred = np.sign(np.sum(preds, axis=0))
        final_pred[final_pred == 0] = -1  # tie = anomaly
        return final_pred

# Define anomaly detection models
models = [
    ("iforest", IsolationForest(n_estimators=200, contamination=0.1, random_state=42)),
    ("ocsvm", OneClassSVM(kernel="rbf", gamma="scale", nu=0.1)),
    ("lof", LocalOutlierFactor(n_neighbors=20, novelty=True, contamination=0.1))
]


# Build pipeline
ensemble = AnomalyEnsemble(models=models)
pipeline = Pipeline(steps=[("prep", preprocessor), ("model", ensemble)])

# Train ensemble
pipeline.fit(X)

# Predict and save results
df["prediction"] = pipeline.predict(X)
df.to_csv("tourist_predictions_ensemble.csv", index=False)

# Save model
joblib.dump(pipeline, "tourist_anomaly_detector_ensemble.pkl")
print("✅ Ensemble model saved as tourist_anomaly_detector_ensemble.pkl")

# Load the trained model
model = joblib.load("tourist_anomaly_detector_ensemble.pkl")

# Example tourist record (must include all columns except ID/timestamp/label)
sample = pd.DataFrame([{
    "latitude": 27.1,
    "longitude": 78.3,
    "altitude_m": 180,
    "time_stationary_hr": 11,
    "gps_shift_m": 1200,
    "speed_kmph": 1.2,
    "avg_speed_last_30min": 0.8,
    "distance_from_city_center_km": 8,
    "geo_fence_violation": 1,
    "altitude_change_m": 10,
    "time_of_day": "night",
    "places_visited": 2,
    "heart_rate_bpm": 165,
    "blood_pressure_sys": 180,
    "blood_pressure_dia": 110,
    "oxygen_saturation_pct": 90,
    "skin_temperature_c": 36,
    "steps_last_hour": 50,
    "stress_index": 85,
    "hydration_level_pct": 60,
    "weather_condition": "storm",
    "temperature_c": 27,
    "humidity_pct": 88,
    "air_quality_index": 120,
    "crowd_density": "low",
    "light_level_lux": 10,
    "calamity_nearby": 1,
    "area_risk_score": 70,
    "sos_pressed": 0,
    "last_checkin_min": 300,
    "phone_battery_pct": 25,
    "network_strength_dbm": -100,
    "app_open_count_last_hr": 1,
    "companion_count": 0,
    "travel_mode": "walk",
    "booking_channel": "app",
    "trip_duration_days": 5,
    "spend_per_day_usd": 120,
    "trip_purpose": "adventure"
}])

pred = model.predict(sample)[0]

print("🚨 Anomaly!" if pred == -1 else "✅ Normal")