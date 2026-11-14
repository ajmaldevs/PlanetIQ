# TerraLens Deployment Guide

## 1. Overview
TerraLens employs a container-ready microservices-oriented architecture designed for deployment on cloud infrastructures (e.g. AWS, GCP, Azure, or dedicated VPS).

## 2. Docker Compose (Local & Staging)
A multi-container setup coordinates:
- `db`: PostgreSQL 16 with PostGIS 3.4
- `backend`: FastAPI Python application with ASGI server (Uvicorn)
- `frontend`: Vite React build served via Nginx or Node preview server

## 3. Production Environment Variables
All production credentials must be injected via secret managers or environment configuration. Under no circumstances should secrets be bundled into container images or checked into source control.
