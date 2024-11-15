import os
import base64
import torch
import clip
import tempfile
import ffmpeg
from fastapi import APIRouter, UploadFile, File, HTTPException
from api.config import settings
from api import deps
from PIL import Image
from api.model_loader import get_model

router = APIRouter()

model, device, preprocess = get_model()

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
        with torch.no_grad():  # Add no_grad here
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

        s3_file_path = matches[0]['metadata'].get('s3_file_path')
        results = []
        for match in matches:
            s3_file_path = match['metadata'].get('s3_file_path')
            s3_file_name = match['metadata'].get('s3_file_name')
            path_without_prefix = s3_file_path[5:]
            bucket_name, key = path_without_prefix.split('/', 1)
            presigned_url = s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': bucket_name, 'Key': key},
                ExpiresIn=3600
            )
            results.append({
                "score": match['score'],
                "metadata": {
                    "date_added": match['metadata'].get('date_added'),
                    "file_type": match['metadata'].get('file_type'),
                    "s3_file_name": s3_file_name,
                    "s3_file_path": s3_file_path,
                    "s3_presigned_url": presigned_url,
                    "segment": match['metadata'].get('segment'),
                    "start_offset_sec": match['metadata'].get('start_offset_sec'),
                    "end_offset_sec": match['metadata'].get('end_offset_sec'),
                    "interval_sec": match['metadata'].get('interval_sec'),
                }
            })
        os.remove(file_path)
        return {"results": results}
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
