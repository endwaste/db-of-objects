from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
)

app = FastAPI()


# Add a simple test route
@app.get("/api")
async def root():
    return {"message": "Welcome to the Universal DB of Objects API!"}


# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
