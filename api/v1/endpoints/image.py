import base64
import torch
import clip
from PIL import Image
import io
from fastapi import APIRouter, UploadFile, File, HTTPException
from api.config import settings
from api import deps
import tempfile

# Load the CLIP model and configure the device
device = "cuda" if torch.cuda.is_available() else "cpu"
model, preprocess = clip.load("ViT-B/32", device=device)
finetuned_weights_path = "/tmp/best_fine_tuned_clip_model.pth"

# Load the fine-tuned weights
s3_client = settings.get_s3_client()
s3_client.download_file("glacier-ml-training", "artifacts/dev/CLIP/finetuned/best_fine_tuned_clip_model.pth", finetuned_weights_path)
model.load_state_dict(torch.load(finetuned_weights_path, map_location=device, weights_only=True))

router = APIRouter()

@router.post("/search/image")
async def query_image(file: UploadFile = File(...)):
    try:
        # Read and validate the image
        contents = await file.read()
        with Image.open(io.BytesIO(contents)) as img:
            file_format = img.format.lower()
        
        if file_format not in ['bmp', 'gif', 'jpeg', 'png', 'jpg']:
            raise HTTPException(status_code=400, detail="We only support BMP, GIF, JPG, JPEG, and PNG for images. Please upload a valid image file.")
        
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
            vector=embeddings,
            top_k=settings.k,
            include_metadata=True
        )

        matches = query_response['matches']
        results = []
        
        # Generate presigned URLs for each match
        s3_client = settings.get_s3_client()
        for match in matches:
            s3_file_path = match['metadata'].get('s3_file_path')
            s3_file_name = match['metadata'].get('s3_file_name')
            presigned_url = s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': settings.s3_bucket_name, 'Key': s3_file_path.replace('s3://glacier-ml-training/', '')},
                ExpiresIn=3600
            )
            print(f"presigned_url: {presigned_url}")

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
