import base64
import torch
import clip
from PIL import Image
import io
from fastapi import APIRouter, UploadFile, File, HTTPException
from api.config import settings
from api import deps
import tempfile
from api.model_loader import get_model

model, device, preprocess = get_model()

router = APIRouter()

s3_client = settings.get_s3_client()


@router.post("/search/image")
async def query_image(file: UploadFile = File(...)):
    try:
        # Read and validate the image
        contents = await file.read()
        with Image.open(io.BytesIO(contents)) as img:
            file_format = img.format.lower()

        if file_format not in ["bmp", "gif", "jpeg", "png", "jpg"]:
            raise HTTPException(
                status_code=400,
                detail="We only support BMP, GIF, JPG, JPEG, and PNG for images. Please upload a valid image file.",
            )

        # Save the image temporarily for processing
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_file.write(contents)
            local_image_path = temp_file.name

        # Preprocess the image and generate embeddings
        image = preprocess(Image.open(local_image_path)).unsqueeze(0).to(device)
        with torch.no_grad():  # Add no_grad here
            embeddings = model.encode_image(image).cpu().numpy().tolist()[0]

        # Query Pinecone with the generated embeddings
        query_response = deps.index.query(
            vector=embeddings, top_k=settings.k, include_metadata=True
        )

        matches = query_response["matches"]
        results = []

        for match in matches:
            metadata = match["metadata"]
            s3_file_path = metadata.get("s3_file_path")
            s3_file_name = metadata.get("s3_file_name")
            path_without_prefix = s3_file_path[5:]
            bucket_name, key = path_without_prefix.split("/", 1)

            region_name = (
                "us-east-1"
                if bucket_name == "glacier-ml-training"
                else (
                    "us-west-2"
                    if bucket_name == "scanner-data.us-west-2"
                    else settings.default_region
                )
            )
            s3_client = settings.get_s3_client(region_name=region_name)
            presigned_url = s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket_name, "Key": key},
                ExpiresIn=3600,
            )

            results.append(
                {
                    "score": match["score"],
                    "metadata": {
                        "class": metadata.get("class"),
                        "date_added": metadata.get("date_added"),
                        "file_type": metadata.get("file_type"),
                        "s3_file_name": s3_file_name,
                        "s3_file_path": s3_file_path,
                        "s3_presigned_url": presigned_url,
                        "brand": metadata.get("brand"),
                        "color": metadata.get("color"),
                        "coordinates": metadata.get("coordinates"),
                        "datetime_taken": metadata.get("datetime_taken"),
                        "embedding_id": metadata.get("embedding_id"),
                        "material": metadata.get("material"),
                        "original_s3_uri": metadata.get("original_s3_uri"),
                        "robot": metadata.get("robot"),
                        "shape": metadata.get("shape"),
                        "timestamp": metadata.get("timestamp"),
                    },
                }
            )
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
