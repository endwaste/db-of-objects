from fastapi import APIRouter, UploadFile, HTTPException, Form
from api.config import settings
from PIL import Image
import piexif
import io
import ast
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()


def extract_metadata_from_image(image_bytes, metadata_key: str):
    """
    Extract a specific metadata value from the image metadata.
    :param image_bytes: Raw image bytes
    :param metadata_key: Key to extract from metadata
    :return: Value of the metadata key
    """
    logger.info("Starting metadata extraction from image...")
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            logger.info("Image successfully opened.")
            exif_data = piexif.load(img.info.get("exif", b""))
            logger.info("EXIF data loaded successfully.")

            user_comment = exif_data["Exif"].get(piexif.ExifIFD.UserComment, b"")
            logger.info(f"UserComment field extracted: {user_comment}")

            if not user_comment:
                raise ValueError("No UserComment field found in metadata.")

            extracted_metadata = piexif.helper.UserComment.load(user_comment)
            logger.info(f"Extracted metadata string: {extracted_metadata}")

            metadata_dict = ast.literal_eval(extracted_metadata)
            logger.info(f"Metadata dictionary: {metadata_dict}")

            value = metadata_dict.get(metadata_key)
            if value is None:
                raise ValueError(
                    f"Metadata key '{metadata_key}' not found in metadata."
                )

            logger.info(f"Metadata value for key '{metadata_key}': {value}")
            return value
    except Exception as e:
        logger.error(f"Metadata extraction failed: {e}")
        raise HTTPException(
            status_code=400, detail=f"Metadata extraction failed: {str(e)}"
        )


@router.post("/upload-image")
async def upload_image(file: UploadFile, metadata_key: str = Form("s3_file_path")):
    """
    Upload an image, extract specified metadata, and return a presigned S3 URL.
    :param file: Uploaded image file
    :param metadata_key: Key to extract from metadata (default: s3_file_path)
    """
    logger.info("Received image upload request...")
    try:
        image_contents = await file.read()
        logger.info(
            f"Image contents read successfully. File size: {len(image_contents)} bytes"
        )

        metadata_value = extract_metadata_from_image(image_contents, metadata_key)
        logger.info(f"Metadata value extracted: {metadata_value}")

        if not metadata_value:
            logger.warning(
                f"Metadata key '{metadata_key}' not found in image metadata."
            )
            raise HTTPException(
                status_code=400, detail=f"Metadata key '{metadata_key}' not found."
            )

        logger.info(f"Generating presigned URL for metadata value: {metadata_value}")
        presigned_url = settings.generate_presigned_url(metadata_value)

        if not presigned_url:
            logger.error("Failed to generate presigned URL.")
            raise HTTPException(
                status_code=500, detail="Failed to generate presigned URL."
            )

        logger.info(f"Presigned URL generated: {presigned_url}")
        return {"presignedUrl": presigned_url}

    except Exception as e:
        logger.error(f"Error processing upload-image endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))
