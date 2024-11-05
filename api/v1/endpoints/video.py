import os
import base64
import torch
import clip
import tempfile
import requests
import ffmpeg
from fastapi import APIRouter, UploadFile, File, HTTPException
from api.config import settings
from api import deps
from PIL import Image

router = APIRouter()

# Load the CLIP model
device = "cuda" if torch.cuda.is_available() else "cpu"
model, preprocess = clip.load("ViT-B/32", device=device)
finetuned_weights_path = "/tmp/best_fine_tuned_clip_model.pth"

# Download and load the fine-tuned weights
s3_client = settings.get_s3_client()
s3_client.download_file("glacier-ml-training", "artifacts/dev/CLIP/finetuned/best_fine_tuned_clip_model.pth", finetuned_weights_path)
model.load_state_dict(torch.load(finetuned_weights_path, map_location=device, weights_only=True))

def extract_frames(video_path, interval_sec=15, num_frames=8):
    """Extract frames from a video at a specified interval."""
    probe = ffmpeg.probe(video_path)
    duration = float(probe['format']['duration'])
    timestamps = [interval_sec * i for i in range(num_frames) if interval_sec * i < duration]
    
    frames = []
    for timestamp in timestamps:
        frame, _ = (
            ffmpeg.input(video_path, ss=timestamp)
            .filter("scale", 224, 224)
            .output("pipe:", format="image2", vframes=1)
            .run(capture_stdout=True, capture_stderr=True)
        )
        frames.append(Image.open(io.BytesIO(frame)))
    return frames

@router.post("/search/video")
async def query_video(file: UploadFile = File(...)):
    try:
        # Save the uploaded file temporarily
        file_path = f"/tmp/{file.filename}"
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
        
        # Check file size
        if os.path.getsize(file_path) > 20 * 1024 * 1024:  # 20 MB limit
            os.remove(file_path)
            raise HTTPException(status_code=400, detail="We don't support videos greater than 20 MB. Please upload a smaller video.")
        
        # Extract frames from the video
        frames = extract_frames(file_path)
        
        # Process each frame with CLIP and average the embeddings
        embeddings = []
        with torch.no_grad():
            for frame in frames:
                image_tensor = preprocess(frame).unsqueeze(0).to(device)
                embedding = model.encode_image(image_tensor).cpu().numpy().flatten()
                embeddings.append(embedding)
        
        # Compute the average embedding for the video
        video_embedding = sum(embeddings) / len(embeddings)
        
        # Query Pinecone with the generated embedding
        query_response = deps.index.query(
            vector=video_embedding.tolist(),
            top_k=settings.k,
            include_metadata=True
        )
        
        s3_client = settings.get_s3_client()
        matches = query_response['matches']
        
        # Prepare results with presigned URLs
        results = [{
            "score": match['score'],
            "metadata": {
                "date_added": match['metadata'].get('date_added'),
                "file_type": match['metadata'].get('file_type'),
                "s3_file_name": match['metadata'].get('s3_file_name'),
                "s3_file_path": match['metadata'].get('s3_file_path'),
                "s3_presigned_url": s3_client.generate_presigned_url(
                    'get_object',
                    Params={'Bucket': settings.s3_bucket_name, 'Key': match['metadata'].get('s3_file_path').replace('s3://glacier-ml-training/', '')},
                    ExpiresIn=3600
                ),
                "segment": match['metadata'].get('segment'),
                "start_offset_sec": match['metadata'].get('start_offset_sec'),
                "end_offset_sec": match['metadata'].get('end_offset_sec'),
                "interval_sec": match['metadata'].get('interval_sec'),
            }
        } for match in matches]
        
        os.remove(file_path)  # Clean up the temporary file
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
