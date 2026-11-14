from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="TerraLens Scientific API",
    version="0.1.0",
    description="Earth Observation and Environmental Analysis Backend"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/v1/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "TerraLens Backend",
        "version": "0.1.0"
    }

@app.get("/")
async def root():
    return {
        "message": "Welcome to TerraLens Earth Observation API",
        "docs_url": "/docs"
    }
