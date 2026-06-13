# ML Service

FastAPI microservice for AI/ML workloads — grading, vision, return prediction.

## Setup

```bash
cd ml-service
pip install -r requirements.txt
cp .env.example .env   # then fill in your AWS keys
uvicorn app.main:app --reload --port 8000
```

## Endpoints

| Method | Path | Status | Phase |
|--------|------|--------|-------|
| GET | /health | ✅ Ready | 0 |
| POST | /grade | 🔲 TODO | 2 |
| POST | /vision/validate-photo | 🔲 TODO | 2 |
| POST | /vision/analyze-image | 🔲 TODO | 2 |
| POST | /predict/return | 🔲 TODO | 7 |
| POST | /predict/fit-recommend | 🔲 TODO | 7 |

## Structure

```
app/
├── main.py           ← FastAPI app, CORS, router registration
├── config.py         ← Pydantic settings from .env
├── routers/          ← One file per domain
├── services/         ← AWS clients (Bedrock, Rekognition, Textract, CLIP)
└── models/           ← Pydantic request/response schemas
trained_models/       ← .joblib files for XGBoost (Phase 7)
```
