from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from typing import Optional, List, Union
from PIL import Image
import io
import torch
import csv
import tempfile
from api.config import settings
from api.model_loader import model, device, preprocess
from api import deps
from datetime import datetime, timezone
from pinecone import Pinecone
import uuid
import os
import logging
import piexif
import piexif.helper
import ast
import requests

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

index = settings.get_pinecone_index()

router = APIRouter()


@router.post("/new")
async def add_new_data(
    image: Optional[UploadFile] = File(None),
    presigned_url: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
    material: Optional[str] = Form(None),
    brand: Optional[str] = Form(None),
    shape: Optional[str] = Form(None),
    original_s3_uri: Optional[str] = Form(None),
    s3_file_path: Optional[str] = Form(None),
    coordinates: Optional[Union[List[float], str]] = Form(None),
    pick_point: Union[List[float], str] = Form(...),
    comment: Optional[str] = Form(None),
    labeler_name: Optional[str] = Form(None),
    modifier: Optional[str] = Form(None),
):
    """
    Add new data to Pinecone and update metadata CSV in S3.
    """
    if not pick_point:
        raise HTTPException(status_code=400, detail="pick_point is required.")

    if not image and not presigned_url:
        raise HTTPException(
            status_code=400,
            detail="Either 'image' file or 'presigned_url' must be provided."
        )

    logger.info(
        f"Received POST request with pick point ={pick_point}"
    )
    logger.info("Starting new data entry processing...")
    try:
        if image:
            logger.info("Reading image from UploadFile input...")
            image_contents = await image.read()
        else:
            logger.info("No UploadFile provided. Using presigned_url...")
            try:
                r = requests.get(presigned_url)
                r.raise_for_status()
            except Exception as e:
                logger.error(f"Failed to fetch image from presigned_url: {e}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot fetch image from presigned_url: {str(e)}"
                )
            image_contents = r.content

        extracted_metadata = extract_metadata_from_user_comment(image_contents)
        image_embeddings = await generate_image_embeddings(image_contents)

        original_s3_uri = extracted_metadata.get("original_s3_uri") or original_s3_uri
        s3_file_path = extracted_metadata.get("s3_file_path") or s3_file_path
        coordinates = extracted_metadata.get("coordinates") or coordinates

        presigned_url = settings.generate_presigned_url(s3_file_path)
        whole_image_presigned_url = settings.generate_presigned_url(original_s3_uri)

        if not original_s3_uri:
            raise HTTPException(
                status_code=400,
                detail="original_s3_uri is required either in the request or in the image metadata.",
            )

        if not s3_file_path:
            raise HTTPException(
                status_code=400,
                detail="s3_file_path is required either in the request or in the image metadata.",
            )

        if isinstance(coordinates, str):
            try:
                coordinates = [float(x.strip()) for x in coordinates.split(",")]
            except ValueError:
                logger.error(f"Invalid coordinate format: {coordinates}")
                raise HTTPException(
                    status_code=400,
                    detail="Coordinates must be a list of floats or a comma-separated string.",
                )

        if isinstance(pick_point, str):
            try:
                pick_point = [float(x.strip()) for x in pick_point.split(",")]
            except ValueError:
                logger.error(f"Invalid coordinate format: {pick_point}")
                raise HTTPException(
                    status_code=400,
                    detail="Pick point must be a list of floats or a comma-separated string.",
                )

        if not coordinates or len(coordinates) != 4:
            logger.error(f"Invalid coordinates: {coordinates}")
            raise HTTPException(
                status_code=400,
                detail="Coordinates must be an array or string of 4 float values.",
            )

        if not pick_point or len(pick_point) != 2:
            logger.error(f"Invalid pick point: {pick_point}")
            raise HTTPException(
                status_code=400,
                detail="Pick point must be an array or string of 4 float values.",
            )

        timestamp = datetime.now(timezone.utc).isoformat()
        robot, datetime_taken = extract_metadata_from_original_s3_uri(original_s3_uri)

        logger.info(
            f"Metadata extracted from S3 URI: robot={robot}, datetime_taken={datetime_taken}"
        )

        duplicate_metadata = {
            "color": color,
            "material": material,
            "brand": brand,
            "shape": shape,
            "modifier": modifier,
            "original_s3_uri": original_s3_uri,
            "s3_file_path": s3_file_path,
        }
        if check_duplicate_in_pinecone(duplicate_metadata):
            raise HTTPException(
                status_code=400, detail="Duplicate entry detected. Entry not added."
            )

        metadata = {
            "embedding_id": str(uuid.uuid4()),
            "color": color,
            "material": material,
            "brand": brand,
            "shape": shape,
            "original_s3_uri": original_s3_uri,
            "s3_file_path": s3_file_path,
            "coordinates": coordinates,
            "timestamp": timestamp,
            "robot": robot,
            "datetime_taken": datetime_taken,
            "file_type": "image",
            "comment": comment,
            "labeler_name": labeler_name,
            "modifier": modifier,
            "pick_point": pick_point,
        }
        metadata = {
            key: (value if value is not None else "") for key, value in metadata.items()
        }
        save_to_pinecone(image_embeddings, metadata)

        metadata["status"] = "active"

        append_metadata_to_s3(metadata)

        metadata["presigned_url"] = presigned_url
        metadata["whole_image_presigned_url"] = whole_image_presigned_url

        return {
            "status": "success",
            "message": "Data successfully added.",
            "metadata": metadata,
        }

    except HTTPException as http_exc:
        logger.error(f"HTTPException: {http_exc.detail}")
        raise http_exc

    except Exception as e:
        logger.error(f"Error during processing: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


def extract_metadata_from_user_comment(image_contents: bytes) -> dict:
    """
    Extract metadata from the EXIF UserComment field in an image.

    Args:
        image_contents (bytes): The image file contents.

    Returns:
        dict: Metadata extracted from the UserComment field.
    """
    try:
        with Image.open(io.BytesIO(image_contents)) as img:
            exif_data = piexif.load(img.info.get("exif", b""))

            user_comment = exif_data["Exif"].get(piexif.ExifIFD.UserComment, b"")

            if not user_comment:
                logger.warning("No UserComment field found in the image metadata.")
                return {}

            extracted_metadata = piexif.helper.UserComment.load(user_comment)

            metadata_dict = ast.literal_eval(extracted_metadata)
            return metadata_dict

    except Exception as e:
        logger.warning(f"Error extracting UserComment metadata: {e}")
        return {}


def check_duplicate_in_pinecone(metadata: dict) -> bool:
    """
    Check if a duplicate entry exists in Pinecone.

    Args:
        metadata (dict): Metadata fields to check for duplication.

    Returns:
        bool: True if a duplicate exists, False otherwise.
    """
    logger.info("Checking for duplicates in Pinecone...")
    try:
        filter_criteria = {
            key: value
            for key, value in {
                "color": metadata.get("color"),
                "material": metadata.get("material"),
                "brand": metadata.get("brand"),
                "shape": metadata.get("shape"),
                "modifier": metadata.get("modifier"),
                "original_s3_uri": metadata.get("original_s3_uri"),
            }.items()
            if value is not None
        }

        query_response = index.query(
            vector=[0.0] * 512,
            filter=filter_criteria,
            top_k=1,
            include_metadata=True,
        )
        if query_response.get("matches"):
            logger.info(
                f"Duplicate entry found: {query_response['matches'][0]['metadata']}"
            )
            return True
        logger.info("No duplicate entry found.")
        return False
    except Exception as e:
        logger.error(f"Error checking for duplicates: {str(e)}")
        return False


def extract_metadata_from_original_s3_uri(original_s3_uri: str):
    """
    Extract robot name and datetime taken from the S3 URI.

    Args:
        original_s3_uri (str): The URI of the S3 file.

    Returns:
        Tuple[str, str]: A tuple containing the robot name and the datetime taken in ISO 8601 format.
    """
    logger.info(f"Extracting metadata from S3 URI: {original_s3_uri}")

    try:
        parts = original_s3_uri.replace("s3://", "").split("/")
        robot = parts[1]

        year, month, day, hour, minute = parts[2:7]
        last_part = parts[7].split("-")
        second, fractional_seconds = last_part[0], last_part[1].split("_")[0]

        datetime_taken = (
            f"{year}-{month}-{day} {hour}:{minute}:{second}.{fractional_seconds}+00:00"
        )
        datetime_object = datetime.fromisoformat(datetime_taken)
        logger.info(
            f"Extracted robot: {robot}, datetime_taken: {datetime_object.isoformat()}"
        )
        return robot, datetime_object.isoformat()

    except (IndexError, ValueError) as e:
        logger.error(
            f"Error extracting metadata from S3 URI: {original_s3_uri}. Error: {str(e)}"
        )
        raise HTTPException(
            status_code=400,
            detail=f"Invalid S3 URI format: {original_s3_uri}. Error: {str(e)}",
        )


async def generate_image_embeddings(image_contents: bytes):
    """
    Generate embeddings for the uploaded image using the CLIP model.

    Args:
        image_contents (bytes): The image file contents.

    Returns:
        list: Generated embeddings.
    """
    try:
        with io.BytesIO(image_contents) as buffer:
            with Image.open(buffer) as img:
                img.verify()
                logger.info("Image verified successfully.")

                buffer.seek(0)
                img = Image.open(buffer)

                processed_image = preprocess(img).unsqueeze(0).to(device)

        with torch.no_grad():
            embeddings = model.encode_image(processed_image).cpu().numpy().tolist()[0]

        logger.info("Image embeddings generated successfully.")
        return embeddings

    except Exception as e:
        logger.error(f"Error processing image: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error processing image: {str(e)}")


def save_to_pinecone(embeddings, metadata):
    """
    Save image embeddings and metadata to Pinecone.

    Args:
        embeddings (list[float]): The image embedding vector.
        metadata (dict): All associated metadata for the embedding, including the embedding_id.

    Raises:
        HTTPException: If an error occurs while saving to Pinecone.
    """
    logger.info("Saving data to Pinecone...")

    try:
        embedding_id = metadata.get("embedding_id")
        if not embedding_id:
            raise ValueError("Embedding ID is missing in metadata.")

        metadata["coordinates"] = ",".join(map(str, metadata["coordinates"]))
        metadata["pick_point"] = ",".join(map(str, metadata["pick_point"]))

        vector = [
            {
                "id": embedding_id,
                "values": embeddings,
                "metadata": metadata,
            }
        ]

        logger.info(f"Upserting vector to Pinecone: {vector}")
        index.upsert(vector)
        return embedding_id

    except Exception as e:
        logger.error(f"Error saving to Pinecone: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error saving to Pinecone: {str(e)}"
        )


def append_metadata_to_s3(metadata: dict) -> None:
    """
    Append the metadata to a CSV file in S3, including the embedding ID.

    Args:
        metadata (dict): A dictionary containing metadata fields.
    """
    s3_client = settings.get_s3_client()
    bucket_name = settings.s3_bucket_name
    csv_key = "universal-db/metadata.csv"

    try:
        response = s3_client.list_objects_v2(Bucket=bucket_name, Prefix=csv_key)
        file_exists = "Contents" in response
        logger.info(f"File exists in S3: {file_exists}")

        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_file_name = temp_file.name

            if file_exists:
                logger.info(f"Downloading existing CSV from S3: {csv_key}")
                s3_client.download_file(bucket_name, csv_key, temp_file_name)
                logger.info("Existing CSV downloaded successfully.")
            else:
                logger.warning("CSV does not exist. Creating a new one with headers.")
                with open(temp_file_name, "w", newline="") as f:
                    writer = csv.writer(f)
                    writer.writerow(
                        [
                            "id",
                            "color",
                            "material",
                            "brand",
                            "shape",
                            "original_s3_uri",
                            "s3_file_path",
                            "coordinates",
                            "timestamp",
                            "robot",
                            "datetime_taken",
                            "comment",
                            "modifier",
                            "status",
                            "pick_point",
                        ]
                    )

            with open(temp_file_name, "a", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(
                    [
                        metadata.get("embedding_id", ""),
                        metadata.get("color", ""),
                        metadata.get("material", ""),
                        metadata.get("brand", ""),
                        metadata.get("shape", ""),
                        metadata.get("original_s3_uri", ""),
                        metadata.get("s3_file_path", ""),
                        metadata.get("coordinates", ""),
                        metadata.get("timestamp", ""),
                        metadata.get("robot", ""),
                        metadata.get("datetime_taken", ""),
                        metadata.get("comment", ""),
                        metadata.get("modifier", ""),
                        metadata.get("status", ""),
                        metadata.get("pick_point", ""),
                    ]
                )
                logger.info(
                    "Appended new metadata to the temporary CSV file, including embedding ID."
                )

            logger.info(
                f"Uploading updated CSV back to S3: bucket={bucket_name}, key={csv_key}"
            )
            s3_client.upload_file(temp_file_name, bucket_name, csv_key)
            logger.info("Updated CSV uploaded to S3 successfully.")

    except Exception as e:
        logger.error(f"Error updating CSV in S3: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating CSV in S3: {str(e)}"
        )
