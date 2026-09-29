# GeoSpectra — Reproducible Evaluation Report
### SIH 2026 · Problem Statement 26227 · Team QuantumCore (IIC_TMSL_P6_S21)

This report documents the indexed corpus, build procedure, performance
measurements, and hardware used for the GeoSpectra demonstration, as required
by Section 2.3 of the problem statement. All figures below were measured on
the submitted system. Measurements are reported only where they were actually verified on the submission system.
submission machine before submission.

---

## 1. Indexed area and corpus

| Item | Value |
|---|---|
| Areas of Interest (AOIs) | 4 (dholera, navi-mumbai, noida, demo-aoi-live) |
| Geographic region | Western/northern India — Dholera SIR (Gujarat), Navi Mumbai (Maharashtra), Noida region (Uttar Pradesh) |
| Observation span | Multi-year Sentinel-2 L2A archive (per-AOI histories from 2016 to 2026) |
| Satellite scenes ingested | 188 (Copernicus Sentinel-2) |
| Tiles indexed (224 px, ~2.24 km footprint) | 848 |
| Vector embeddings (ViT-B/32, 512-dim) | 848 |
| Change candidates scored | 830 temporal pairs |
| Candidates promoted above calibrated threshold | 111 |
| Candidates suppressed by quality gates | 719 (cloud/quality/seasonality gated) |
| Discovery clusters | 12 |

Indexed area per AOI (bbox, decimal degrees): [MEASURE THIS — copy from
/aois endpoint or catalog DB for each AOI]

## 2. Hardware used

| Item | Value |
|---|---|
| Machine | Apple MacBook Air M1 |
| CPU / GPU | Apple M1, 7-core GPU |
| RAM | 8 GB |
| Storage type | SSD |
| Accelerator used for inference | None (CPU-only; no dedicated GPU required) |
| Network during demonstration | Disabled after staging — fully on-premises, no external APIs |

## 3. Index build and incremental ingestion

Build procedure (full detail in PROJECT_WORKFLOW.md):

raw GeoTIFF/COG or Copernicus zip -> scene validation -> MGRS-consistent
tiling (224 px) -> spectral features (NDVI, NDWI, SCL/cloud/water) ->
SQLite provenance registration -> RemoteCLIP embedding -> FAISS index
append -> temporal pairing -> hybrid scoring + false-positive suppression.

| Item | Value |
|---|---|
| Cold index build time (full corpus) | [MEASURE THIS — time `ingest` from empty DB to complete index] |
| Incremental onboarding time (live demo, 3-scene folder) | ~2–4 seconds end-to-end, all six stages |
| Index rebuild required on new data? | No — FAISS vectors and SQLite rows are appended; duplicates auto-skipped |
| Deduplication | Scene-level identity check; re-ingesting an existing scene is skipped (verified in live demo: 3/3 skipped) |

## 4. Storage footprint

| Item | Value |
|---|---|
| Raw imagery staged locally | 8.0K |
| Processed tiles / catalog | 503M |
| FAISS index size | 1.7M |
| Model weights (RemoteCLIP ViT-B/32 + Qwen 2.5 via Ollama) | 577M in local `models/`; Qwen 2.5 0.5B verified via Ollama |
| Total footprint | 2.3G |

## 5. Query latency (measured on submission hardware)

Current post-optimization measurements (server-side, recorded in
PERFORMANCE_REPORT.md):

| Endpoint | Status | Time (ms) |
|---|---|---:|
| /stats (dashboard aggregation) | 200 | 2,138 |
| /changes/velocity (paginated, limit 8) | 200 | [RE-MEASURE after pagination] |
| /changes/candidates (paginated, limit 24) | 200 | 970 |
| /clusters | 200 | 104 |

Semantic text query end-to-end ("water body expansion", top-15):
[MEASURE THIS — wall-clock from Execute Search to results rendered]
Image-chip query end-to-end (top-15): Not re-measured on the submission Mac; no latency value is claimed.

## 6. Verification evidence

- Python regression suite: `python -m pytest -q` -> 30 passed
- Frontend production build: `npm run build` -> successful (Vite)
- Live re-ingestion test: duplicate scenes skipped, no double counting
- Audit trail: every analyst decision carries a SHA-256 record fingerprint

## 7. Model and dataset provenance

| Component | Origin | Licence | Packaged offline |
|---|---|---|---|
| RemoteCLIP (ViT-B/32) | chendelong/RemoteCLIP checkpoint | [DECLARE — copy from repo LICENSE] | Yes, staged in models/ |
| CLIP backbone tooling | OpenCLIP | MIT [verify] | Yes |
| Analyst assistant | Qwen 2.5 0.5B via Ollama, on-device | Apache 2.0 [verify] | Yes, local weights |
| Imagery | Copernicus Sentinel-2 L2A (public) | Copernicus free/open data licence | Yes, staged locally |
| SAR (where available) | Sentinel-1 IW GRD / monthly mosaic | Copernicus free/open data licence | Yes |

No cloud services or external APIs are called at any point after staging.

## 8. Reproduction steps

1. Clone the repository and install requirements (requirements.txt).
2. Stage the RemoteCLIP checkpoint and Ollama model locally.
3. Run the ingestion CLI (or the Onboard AOI page) over the provided data
   folder; observe stage-wise progress and deduplication.
4. Start the FastAPI backend + frontend; the demo video reproduces every
   screen shown in the submission video.
