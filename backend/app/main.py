from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router
from app.errors import add_exception_handlers

app = FastAPI(
    title="HeatDebt API",
    version="0.1.0",
    description="HeatDebt deadline-aware heat-planning application."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

add_exception_handlers(app)

app.include_router(router)

@app.get("/")
def root():
    return {
        "name": "HeatDebt API",
        "version": "0.1.0",
        "docs_url": "/docs"
    }
