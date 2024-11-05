import torch
import clip
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from api.config import settings
from api import deps
import boto3

router = APIRouter()

# Load the fine-tuned CLIP model
device = "cuda" if torch.cuda.is_available() else "cpu"
model, _ = clip.load("ViT-B/32", device=device)
finetuned_weights_path = "/tmp/best_fine_tuned_clip_model.pth"

# Download fine-tuned weights from S3 if needed
s3_client = settings.get_s3_client()
s3_client.download_file("glacier-ml-training", "artifacts/dev/CLIP/finetuned/best_fine_tuned_clip_model.pth", finetuned_weights_path)
model.load_state_dict(torch.load(finetuned_weights_path, map_location=device))

class TextQuery(BaseModel):
    query: str

@router.post("/search/text")
async def query_text(query: TextQuery):
    try:
        if not query.query:
            raise HTTPException(status_code=400, detail="The query text cannot be empty")

        # Generate text embedding using CLIP
        with torch.no_grad():
            text_tokens = clip.tokenize([query.query]).to(device)
            text_embedding = model.encode_text(text_tokens).cpu().numpy().flatten().tolist()

        # Query Pinecone with the generated embedding
        query_response = deps.index.query(
            vector=text_embedding,
            top_k=settings.k,
            include_metadata=True
        )

        matches = query_response['matches']
        results = []
        
        for match in matches:
            s3_file_path = match['metadata'].get('s3_file_path')
            s3_file_name = match['metadata'].get('s3_file_name')
            presigned_url = s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': settings.s3_bucket_name, 'Key': s3_file_path.replace('s3://glacier-ml-training/', '')},
                ExpiresIn=3600
            )
            results.append({
                "score": match['score'],
                "metadata": {
                    "class": match['metadata'].get('class'),
                    "date_added": match['metadata'].get('date_added'),
                    "file_type": match['metadata'].get('file_type'),
                    "s3_file_name": s3_file_name,
                    "s3_file_path": s3_file_path,
                    "s3_presigned_url": presigned_url
                }
            })
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
