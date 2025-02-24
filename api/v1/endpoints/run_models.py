import os
import uuid
import json
import tempfile
from typing import List, Dict, Any, Optional
from decimal import Decimal
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request
from PIL import Image
import torch

from api.config import settings
from api.model_loader import preprocess, model, da_model
import piexif
import piexif.helper
import boto3
import logging

router = APIRouter()
pinecone_index = settings.get_pinecone_index()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# --------------------------------------
# Helper functions
# --------------------------------------

def download_s3_uri(s3_uri: str, local_path: str):
    parsed = urlparse(s3_uri)
    bucket = parsed.netloc
    key = parsed.path.lstrip("/")
    s3_client = settings.get_s3_client()
    s3_client.download_file(bucket, key, local_path)

def generate_embeddings_from_image(image: Image.Image) -> List[float]:
    """
    Use the CLIP model to generate an embedding from a Pillow Image object.
    """
    img_tensor = preprocess(image).unsqueeze(0)
    if not torch.cuda.is_available():
        model.to("cpu")
        img_tensor = img_tensor.to("cpu")
    else:
        img_tensor = img_tensor.to(device)

    with torch.no_grad():
        emb = model.encode_image(img_tensor).cpu().numpy().flatten().tolist()
    
    return emb

def query_pinecone(embedding: List[float], top_k: int = 1) -> Optional[Dict[str, Any]]:
    """
    Queries Pinecone and returns the top match (with metadata).
    Returns None if no matches found.
    """
    if not pinecone_index:
        return None

    resp = pinecone_index.query(
        vector=embedding,
        top_k=top_k,
        include_metadata=True
    )
    matches = resp.get("matches", [])
    if not matches:
        return None

    return matches[0]

def load_image_from_s3(s3_uri: str) -> Image.Image:
    """
    Download from S3 into a temp file, load as PIL.Image
    """
    tmp_dir = tempfile.mkdtemp()
    filename = f"temp_{uuid.uuid4().hex}.jpg"
    local_path = os.path.join(tmp_dir, filename)
    download_s3_uri(s3_uri, local_path)
    return Image.open(local_path).convert("RGB")

def load_image_from_upload(image_file: UploadFile) -> Image.Image:
    """
    Save the uploaded file locally, load as PIL.Image
    """
    tmp_dir = tempfile.mkdtemp()
    local_path = os.path.join(tmp_dir, image_file.filename)
    with open(local_path, "wb") as f:
        f.write(image_file.file.read())
    return Image.open(local_path).convert("RGB")


# ---------------------------------------------------------------------
# Combined GET/POST route
# ---------------------------------------------------------------------
@router.api_route("/detect_infer_metadata", methods=["GET", "POST"])
async def detect_infer_metadata(
    request: Request,
    s3_uri: Optional[str] = None,  # for GET or possibly POST Form
    image_file: Optional[UploadFile] = File(None)
):
    """
    Either:
      - GET /detect_infer_metadata?s3_uri=...
         => We read from S3 and process.
      - POST /detect_infer_metadata
         => We read from the form data (s3_uri or image_file), or just image_file.
    """
    if request.method == "GET":
        # Expect a query param: ?s3_uri=...
        if not s3_uri:
            raise HTTPException(status_code=400, detail="Missing s3_uri in query params.")
        image = load_image_from_s3(s3_uri)

    else:
        # POST => either an uploaded file or a form-based s3_uri
        form = await request.form()
        # s3_uri might come from the form
        s3_uri_in_form = form.get("s3_uri")
        if s3_uri_in_form is not None and isinstance(s3_uri_in_form, str) and s3_uri_in_form.strip():
            s3_uri = s3_uri_in_form.strip()

        # If we have an uploaded file, use that
        if image_file and image_file.filename:
            image = load_image_from_upload(image_file)
        elif s3_uri:
            image = load_image_from_s3(s3_uri)
        else:
            raise HTTPException(status_code=400, detail="You must provide image_file or s3_uri in POST.")

    width, height = image.size
    results = da_model.predict(image)
    detections_response = []

    # Loop over each Results object
    for result in results:
        # result.boxes.data => [x1, y1, x2, y2, conf, cls_id]
        for box_item in result.boxes.data.tolist():
            x1, y1, x2, y2, confidence, _ = box_item

            # Crop & embed for Pinecone
            cropped = image.crop((x1, y1, x2, y2))
            embedding = generate_embeddings_from_image(cropped)

            # Query Pinecone
            top_match = query_pinecone(embedding, top_k=1)
            matched_metadata = {}
            matched_score = None
            if top_match:
                matched_score = top_match["score"]
                metadata = top_match.get("metadata", {})
                matched_metadata = {
                    "color": metadata.get("color"),
                    "shape": metadata.get("shape"),
                    "material": metadata.get("material"),
                    "brand": metadata.get("brand"),
                }

            detections_response.append({
                "box": [x1, y1, x2, y2],
                "confidence": float(confidence),
                "pinecone_score": matched_score,
                "pinecone_metadata": matched_metadata
            })

    return {
        "status": "ok",
        "image_size": {"width": width, "height": height},
        "num_detections": len(detections_response),
        "detections": detections_response
    }
