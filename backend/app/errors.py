from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import logging

from app.services.weather_service import WeatherUnavailableException

logger = logging.getLogger(__name__)

def add_exception_handlers(app: FastAPI):
    @app.exception_handler(WeatherUnavailableException)
    async def weather_unavailable_exception_handler(request: Request, exc: WeatherUnavailableException):
        logger.error(f"Weather unavailable: {str(exc)}")
        return JSONResponse(
            status_code=503,
            content={"error": "WEATHER_UNAVAILABLE"}
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unexpected error: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": "An unexpected server error occurred."}
        )
