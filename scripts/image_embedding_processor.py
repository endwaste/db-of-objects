import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
import uuid
import torch
import clip
import boto3
from PIL import Image
from pinecone import Pinecone
from datetime import datetime
import time
import tempfile
from dotenv import load_dotenv
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from api.config import settings

# Configuration
FILE_TYPE = 'image'

# Load environment variables
load_dotenv("../.env.development")

# Load the fine-tuned CLIP model
device = "cuda" if torch.cuda.is_available() else "cpu"
s3_model_path = os.getenv('MODEL_PATH')
clip_model = os.getenv('MODEL')
print(f"Loading model {clip_model} from {s3_model_path}")
model, preprocess = clip.load(clip_model, device=device)
finetuned_weights_path = "/tmp/best_fine_tuned_clip_model.pth"

# Download weights if not already downloaded
s3_client = settings.get_s3_client()
s3_client.download_file("glacier-ml-training", s3_model_path, finetuned_weights_path)
model.load_state_dict(torch.load(finetuned_weights_path, map_location=device, weights_only=True))

def process_image(image_file, bucket_name, prefix, model, index, file_path, image_index, total_images, max_retries=5):
    s3_uri = f's3://{bucket_name}/{prefix}/{image_file}'
    s3_key = f"{prefix}/{image_file}"

    with tempfile.NamedTemporaryFile(delete=False) as temp_file:
        s3_client.download_file(bucket_name, s3_key, temp_file.name)
        local_image_path = temp_file.name

    class_name = image_file.rsplit('_', 1)[0]
    class_name = "RANDOM"

    attempt = 0
    while attempt < max_retries:
        try:
            image = preprocess(Image.open(local_image_path)).unsqueeze(0).to(device)
            with torch.no_grad():
                embeddings = model.encode_image(image).cpu().numpy().tolist()

            date_added = datetime.now().isoformat()
            embedding_id = str(uuid.uuid4())

            vector = [
                {
                    'id': embedding_id,
                    'values': embeddings[0],
                    'metadata': {
                        'date_added': date_added,
                        'file_type': FILE_TYPE,
                        's3_file_path': s3_uri,
                        's3_file_name': image_file,
                        'class': class_name
                    }
                }
            ]
            index.upsert(vector)
            print(f"Processed and upserted: {image_file} ({image_index}/{total_images})")
            break
        except Exception as e:
            print(f"Error processing file {image_file}: {e}")
            attempt += 1
            if attempt < max_retries:
                wait_time = 5 ** attempt
                print(f"Retrying in {wait_time} seconds...")
                time.sleep(wait_time)
            else:
                print(f"Failed to process file {image_file} after {max_retries} attempts.")


def main(s3_bucket_name, s3_folder_name, pinecone_index_name):
    api_key = os.getenv('PINECONE_API_KEY')
    file_path = f'{s3_bucket_name}/{s3_folder_name}/'

    pc = Pinecone(api_key=api_key, source_tag="pinecone:stl_sample_app")
    index = pc.Index(pinecone_index_name)

    image_files = []
    continuation_token = None

    while True:
        if continuation_token:
            response = s3_client.list_objects_v2(
                Bucket=s3_bucket_name,
                Prefix=s3_folder_name,
                ContinuationToken=continuation_token
            )
        else:
            response = s3_client.list_objects_v2(
                Bucket=s3_bucket_name,
                Prefix=s3_folder_name
            )
        
        # Add image files from the current response
        image_files.extend(
            obj['Key'].split('/')[-1] for obj in response.get('Contents', []) if obj['Key'].endswith(('jpeg', 'jpg', 'png', 'bmp', 'gif'))
        )

        # Check if more objects need to be fetched
        if response.get('IsTruncated'):  # True if there are more objects
            continuation_token = response.get('NextContinuationToken')
        else:
            break


    total_images = len(image_files)
    print(f"Total images found: {total_images}")
    
    with ThreadPoolExecutor() as executor:
        futures = [executor.submit(process_image, image_file, s3_bucket_name, s3_folder_name, model, index, file_path, i + 1, total_images) for i, image_file in enumerate(image_files)]
        for future in as_completed(futures):
            future.result()


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Process images from an S3 bucket and upsert embeddings to Pinecone.')
    parser.add_argument('-b', '--bucket', type=str, required=True, help='The S3 bucket name.')
    parser.add_argument('-f', '--folder', type=str, required=True, help='The S3 folder containing images in the bucket.')
    parser.add_argument('-i', '--index', type=str, required=True, help='The Pinecone Index name.')

    args = parser.parse_args()
    main(args.bucket, args.folder, args.index)
