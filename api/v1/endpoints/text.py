import torch
import clip
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from api.config import settings
from api import deps
from api.model_loader import get_model

router = APIRouter()

model, device, preprocess = get_model()


class TextQuery(BaseModel):
    query: str


@router.post("/search/text")
async def query_text(query: TextQuery):
    try:
        if not query.query:
            raise HTTPException(
                status_code=400, detail="The query text cannot be empty"
            )

        # Generate text embedding using CLIP
        with torch.no_grad():  # Add no_grad here
            text_tokens = clip.tokenize([query.query]).to(device)
            text_embedding = (
                model.encode_text(text_tokens).cpu().numpy().flatten().tolist()
            )

        # Query Pinecone with the generated embedding
        query_response = deps.index.query(
            vector=text_embedding, top_k=settings.k, include_metadata=True
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
