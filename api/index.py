from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from api.auth import router as auth_router
from api.v1.endpoints import (
    text,
    image,
    index,
    new,
    delete,
    update,
    upload,
    review,
    labeling,
    run_models,
    summary,
)

app = FastAPI()

# Add session middleware for Authlib
# Make sure you use a unique, random secret_key in production
app.add_middleware(SessionMiddleware, secret_key="SOME_LONG_RANDOM_SECRET_KEY")

@app.get("/api")
async def root():
    return {"message": "Welcome to the Universal DB of Objects API!"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://udo.endwaste.net", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include API routers
app.include_router(text.router, prefix="/api")
app.include_router(image.router, prefix="/api")
app.include_router(index.router, prefix="/api")
app.include_router(new.router, prefix="/api")
app.include_router(delete.router, prefix="/api")
app.include_router(update.router, prefix="/api")
app.include_router(upload.router, prefix="/api")
app.include_router(review.router, prefix="/api")
app.include_router(labeling.router, prefix="/api")
app.include_router(run_models.router, prefix="/api")
app.include_router(summary.router, prefix="/api")

# Register Auth Routes
app.include_router(auth_router, prefix="/api")
