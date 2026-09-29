# GeoSpectra — Model & Data Provenance

## System

GeoSpectra is an offline geospatial intelligence system for semantic retrieval and multi-temporal change analysis of satellite imagery.

## Satellite imagery

The project processes Sentinel-2 satellite imagery supplied as local GeoTIFF/COG imagery. The repository does not commit the raw imagery; local datasets remain outside Git tracking.

## Embedding model

Semantic image embeddings are generated using RemoteCLIP ViT-B/32. The model weights are stored locally under `models/` and are excluded from the Git repository.

## Vector search

FAISS is used for similarity search over generated image embeddings. The local FAISS index is generated from the project's processed tile corpus and is excluded from Git tracking.

## Metadata and catalog

SQLite is used for the local catalog, scene/tile metadata, change candidates, and related records. The local database is stored under `data/` and is excluded from Git tracking.

## Local language model

Where enabled, Qwen 2.5 is used through Ollama for local language-model functionality. Model files are maintained outside the Git repository.

## Reproducibility

The repository contains the application source code, configuration, documentation, and reproducible processing workflows. Large datasets, model weights, generated indexes, and local databases are intentionally excluded from version control.

## Licensing and attribution

This document records the provenance of the major system components. Specific third-party dataset and model licenses should be consulted from their original providers before redistribution of those assets.
