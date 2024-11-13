from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from api.v1.endpoints import text, image, video, index

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
    expose_headers=["*"]
)

# Include API routers
print("Loading routes...")
app.include_router(text.router, prefix="/api")
app.include_router(image.router, prefix="/api")
app.include_router(video.router, prefix="/api")
app.include_router(index.router, prefix="/api")
print("Routes loaded.")
