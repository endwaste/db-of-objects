import argparse
import base64
import os
import uuid
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import torch
import clip
import cv2  # For handling video files
import boto3
from PIL import Image
from dotenv import load_dotenv
from pinecone import Pinecone

# Constants
FILE_TYPE = 'video'
MAX_RETRIES = 5
SUPPORTED_VIDEO_FORMATS = ('mov', 'mp4', 'avi', 'flv', 'mkv', 'mpeg', 'mpg', 'webm', 'wmv')

# Video embedding settings
INTERVAL_SEC = 15
START_OFFSET_SEC = 0
END_OFFSET_SEC = 120

# Load environment variables
load_dotenv("../.env.development")

# Initialize the CLIP model
device = "cuda" if torch.cuda.is_available() else "cpu"
model, preprocess = clip.load("ViT-B/32", device=device)

# Load fine-tuned weights from S3
finetuned_weights_path = "/tmp/best_fine_tuned_clip_model.pth"
s3_client = boto3.client('s3')
s3_client.download_file("glacier-ml-training", "artifacts/dev/CLIP/finetuned/best_fine_tuned_clip_model.pth", finetuned_weights_path)
model.load_state_dict(torch.load(finetuned_weights_path, map_location=device, weights_only=True))


def process_video(video_file, bucket_name, prefix, model, index, video_index, total_videos):

    s3_uri = f's3://{bucket_name}/{prefix}/{video_file}'
    s3_key = f"{prefix}/{video_file}"

    # Download video to temporary location
    with tempfile.NamedTemporaryFile(delete=False) as temp_file:
        s3_client.download_file(bucket_name, s3_key, temp_file.name)
        local_video_path = temp_file.name

    # Extract frames at intervals and generate embeddings
    cap = cv2.VideoCapture(local_video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_interval = int(fps * INTERVAL_SEC)
    embeddings = []

    for frame_num in range(0, int(cap.get(cv2.CAP_PROP_FRAME_COUNT)), frame_interval):
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
        ret, frame = cap.read()
        if not ret:
            break

        # Calculate segment metadata
        start_offset_sec = frame_num / fps
        end_offset_sec = min(start_offset_sec + INTERVAL_SEC, END_OFFSET_SEC)

        # Convert frame to PIL image for CLIP
        frame_pil = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        image_tensor = preprocess(frame_pil).unsqueeze(0).to(device)

        # Generate embedding
        with torch.no_grad():
            embedding = model.encode_image(image_tensor).cpu().numpy().tolist()
            embeddings.append({
                "embedding": embedding[0],
                "segment": frame_num // frame_interval,
                "start_offset_sec": start_offset_sec,
                "end_offset_sec": end_offset_sec,
                "interval_sec": end_offset_sec - start_offset_sec
            })

    cap.release()

    # Aggregate embeddings and metadata for the video
    for embedding_data in embeddings:
        date_added = datetime.now().isoformat()
        embedding_id = str(uuid.uuid4())

        vector = [
            {
                'id': embedding_id,
                'values': embedding_data["embedding"],
                'metadata': {
                    'date_added': date_added,
                    'file_type': FILE_TYPE,
                    's3_file_path': s3_uri,
                    's3_file_name': video_file,
                    'segment': embedding_data["segment"],
                    'start_offset_sec': embedding_data["start_offset_sec"],
                    'end_offset_sec': embedding_data["end_offset_sec"],
                    'interval_sec': embedding_data["interval_sec"]
                }
            }
        ]
        index.upsert(vector)
        print(f"Processed and upserted: {video_file} ({video_index}/{total_videos})")

def main(s3_bucket_name, s3_folder_name, pinecone_index_name):
    # Initialize Pinecone
    api_key = os.getenv('PINECONE_API_KEY')
    if not api_key:
        raise ValueError("PINECONE_API_KEY environment variable is not set.")
    pc = Pinecone(api_key=api_key, source_tag="pinecone:stl_sample_app")
    index = pc.Index(pinecone_index_name)

    # List video files in S3 bucket
    response = s3_client.list_objects_v2(Bucket=s3_bucket_name, Prefix=s3_folder_name)
    video_files = [
        obj['Key'].split('/')[-1]
        for obj in response.get('Contents', [])
        if obj['Key'].lower().endswith(SUPPORTED_VIDEO_FORMATS)
    ]

    total_videos = len(video_files)
    with ThreadPoolExecutor() as executor:
        futures = [
            executor.submit(
                process_video,
                video_file,
                s3_bucket_name,
                s3_folder_name,
                model,
                index,
                i + 1,
                total_videos
            )
            for i, video_file in enumerate(video_files)
        ]
        for future in as_completed(futures):
            future.result()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Process videos from an S3 bucket and upsert embeddings to Pinecone.')
    parser.add_argument('-b', '--bucket', type=str, required=True, help='The S3 bucket name.')
    parser.add_argument('-f', '--folder', type=str, required=True, help='The S3 folder containing videos in the bucket.')
    parser.add_argument('-i', '--index', type=str, required=True, help='The Pinecone Index name.')

    args = parser.parse_args()
    main(args.bucket, args.folder, args.index)
