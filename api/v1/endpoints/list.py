import csv
import tempfile
import datetime
from fastapi import APIRouter, HTTPException
from api.config import settings
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# S3 CSV details
s3_client = settings.get_s3_client()
bucket_name = settings.s3_bucket_name
csv_key = "universal-db/labeling_data.csv"

# Expiration time for in-progress crops (in minutes)
EXPIRATION_MINUTES = 10

def create_csv_in_s3():
    """Creates an empty CSV file in S3 if it does not exist."""
    try:
        logger.info("Creating new CSV file in S3...")
        
        # Create a temporary file with CSV headers
        with tempfile.NamedTemporaryFile(mode="w", delete=False, newline="") as temp_file:
            writer = csv.writer(temp_file)
            writer.writerow(["s3_uri", "bounding_box", "labeled", "labeler_name", "in_progress", "timestamp"])
            temp_filename = temp_file.name  # Get the filename before closing
        
        # Upload to S3
        s3_client.upload_file(temp_filename, bucket_name, csv_key)
        logger.info("CSV file created successfully in S3.")

    except Exception as e:
        logger.error(f"Error creating CSV in S3: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create CSV file in S3.")

@router.get("/list")
async def get_labeling_list():
    """
    Fetch the full list of crops from S3, including their labeling status.
    If the CSV does not exist, create it and return an empty list.
    """
    try:
        response = s3_client.list_objects_v2(Bucket=bucket_name, Prefix=csv_key)

        # If the CSV does not exist, create it
        if "Contents" not in response:
            logger.info("CSV file does not exist. Creating a new one...")
            create_csv_in_s3()
            return {"crops": [], "total_crops": 0, "total_labeled": 0}

        # Download the CSV to a temporary file
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_filename = temp_file.name
            s3_client.download_file(bucket_name, csv_key, temp_filename)

        # Read CSV contents
        crops = []
        total_crops = 0
        total_labeled = 0
        now = datetime.datetime.now(datetime.timezone.utc)

        with open(temp_filename, "r", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                total_crops += 1
                labeled = row.get("labeled", "False").lower() == "true"
                in_progress = row.get("in_progress", "False").lower() == "true"
                last_updated = row.get("timestamp", "")

                # Count labeled crops
                if labeled:
                    total_labeled += 1

                # Check if "in progress" has expired
                if in_progress and last_updated:
                    try:
                        last_updated_time = datetime.datetime.fromisoformat(last_updated)
                        time_diff = (now - last_updated_time).total_seconds() / 60
                        if time_diff > EXPIRATION_MINUTES:
                            logger.info(f"Unlocking expired crop: {row['s3_uri']}")
                            in_progress = False  # Unlock the crop
                    except ValueError:
                        logger.warning(f"Invalid timestamp in CSV: {last_updated}")

                # Append crop (both labeled & unlabeled) to return list
                crops.append({
                    "s3_uri": row["s3_uri"],
                    "bounding_box": row["bounding_box"],
                    "labeled": labeled,
                    "labeler_name": row.get("labeler_name", ""),
                })

        logger.info(f"Returning {len(crops)} crops. Total labeled: {total_labeled}, Total crops: {total_crops}")

        return {
            "crops": crops,
            "total_crops": total_crops,
            "total_labeled": total_labeled
        }

    except Exception as e:
        logger.error(f"Error fetching labeling list: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve labeling list.")
