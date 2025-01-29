import torch
import clip
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from api.config import settings
from api import deps
from api.model_loader import get_clip_model

router = APIRouter()

model, device, preprocess = get_clip_model()


class TextQuery(BaseModel):
    query: str


@router.post("/search/text")
async def query_text(query: TextQuery):
    try:
        if not query.query:
            raise HTTPException(
                status_code=400, detail="The query text cannot be empty"
            )

        with torch.no_grad():
            text_tokens = clip.tokenize([query.query]).to(device)
            text_embedding = (
                model.encode_text(text_tokens).cpu().numpy().flatten().tolist()
            )

        query_response = deps.index.query(
            vector=text_embedding, top_k=settings.k, include_metadata=True
        )

        matches = query_response["matches"]
        results = []

        for match in matches:
            metadata = match["metadata"]
            s3_file_path = metadata.get("s3_file_path")
            s3_file_name = metadata.get("s3_file_name")

            results.append(
                {
                    "score": match["score"],
                    "metadata": {
                        "class": metadata.get("class"),
                        "date_added": metadata.get("date_added"),
                        "file_type": metadata.get("file_type"),
                        "s3_file_name": s3_file_name,
                        "s3_file_path": s3_file_path,
                        "s3_presigned_url": settings.generate_presigned_url(
                            s3_file_path
                        ),
                        "brand": metadata.get("brand"),
                        "modifier": metadata.get("modifier"),
                        "pick_point": metadata.get("pick_point"),
                        "color": metadata.get("color"),
                        "coordinates": metadata.get("coordinates"),
                        "datetime_taken": metadata.get("datetime_taken"),
                        "embedding_id": metadata.get("embedding_id"),
                        "material": metadata.get("material"),
                        "original_s3_uri": metadata.get("original_s3_uri"),
                        "robot": metadata.get("robot"),
                        "shape": metadata.get("shape"),
                        "comment": metadata.get("comment"),
                        "labeler_name": metadata.get("labeler_name"),
                        "timestamp": metadata.get("timestamp"),
                        "whole_image_presigned_url": settings.generate_presigned_url(
                            metadata.get("original_s3_uri")
                        ),
                    },
                }
            )
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
