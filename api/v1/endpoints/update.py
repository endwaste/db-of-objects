from fastapi import APIRouter, HTTPException, Form
from typing import Optional
from api.config import settings
import logging
import tempfile
import csv
from typing import Union

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
router = APIRouter()
index = settings.get_pinecone_index()


@router.put("/update/{embedding_id}")
async def update_metadata(
    embedding_id: str,
    color: Union[str, None] = Form(""),
    material: Union[str, None] = Form(""),
    brand: Union[str, None] = Form(""),
    shape: Union[str, None] = Form(""),
    comment: Union[str, None] = Form(""),
    modifier: Union[str, None] = Form(""),
    labeler_name: Union[str, None] = Form(""),
    pick_point: Union[str, None] = Form(""),
):
    """Update metadata for an existing entry in Pinecone and the CSV in S3."""

    try:
        current_metadata, current_vector = await fetch_metadata_from_pinecone(
            embedding_id
        )
        if not current_metadata:
            raise HTTPException(status_code=404, detail="Metadata not found.")

        updated_metadata = {
            "color": color,
            "material": material,
            "brand": brand,
            "shape": shape,
            "comment": comment,
            "modifier": modifier,
            "labeler_name": labeler_name,
            "original_s3_uri": current_metadata["original_s3_uri"],
            "s3_file_path": current_metadata["s3_file_path"],
            "coordinates": current_metadata["coordinates"],
            "timestamp": current_metadata["timestamp"],
            "robot": current_metadata["robot"],
            "datetime_taken": current_metadata["datetime_taken"],
            "file_type": current_metadata["file_type"],
            "embedding_id": embedding_id,
            "pick_point": pick_point,
        }

        await update_pinecone(embedding_id, updated_metadata, current_vector)

        updated_metadata["status"] = "active"
        await update_csv_in_s3(updated_metadata)

        return {
            "status": "success",
            "message": "Metadata updated successfully.",
            "updated_metadata": updated_metadata,
        }

    except HTTPException as http_exc:
        logger.error(f"HTTPException: {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.error(f"Error during updating metadata: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


async def fetch_metadata_from_pinecone(embedding_id: str) -> dict:
    """Fetch metadata from Pinecone using the embedding ID."""
    try:
        current_metadata_response = index.fetch([embedding_id])

        vectors = current_metadata_response.get("vectors", {})
        if embedding_id not in vectors:
            raise HTTPException(status_code=404, detail="Metadata not found.")

        current_vector = vectors[embedding_id]["values"]
        current_metadata = vectors[embedding_id]["metadata"]
        return current_metadata, current_vector

    except Exception as e:
        logger.error(f"Error fetching metadata from Pinecone: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching metadata from Pinecone: {str(e)}"
        )


async def update_pinecone(
    embedding_id: str, updated_metadata: dict, current_vector: list
):
    """Update the existing entry in Pinecone with new metadata."""
    try:
        vector = [
            {
                "id": embedding_id,
                "values": current_vector,
                "metadata": updated_metadata,
            }
        ]

        index.upsert(vector)

    except Exception as e:
        logger.error(f"Error updating Pinecone: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating Pinecone: {str(e)}"
        )


async def update_csv_in_s3(updated_metadata: dict):
    """Update the CSV file in S3 with the new metadata."""
    logger.info("Updating CSV in S3...")
    s3_client = settings.get_s3_client()
    bucket_name = settings.s3_bucket_name
    csv_key = "universal-db/metadata.csv"

    try:
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_file_name = temp_file.name
            response = s3_client.list_objects_v2(Bucket=bucket_name, Prefix=csv_key)
            file_exists = "Contents" in response

            if file_exists:
                logger.info(f"Downloading existing CSV from S3: {csv_key}")
                s3_client.download_file(bucket_name, csv_key, temp_file_name)
                logger.info("Existing CSV downloaded successfully.")

                updated_rows = []
                with open(temp_file_name, mode="r", newline="") as f:
                    reader = csv.DictReader(f)
                    if "id" not in reader.fieldnames:
                        raise ValueError(
                            "CSV file is missing the 'id' column in headers."
                        )

                    for row in reader:
                        if row.get("id") == updated_metadata["embedding_id"]:
                            logger.info(
                                f"Updating row with ID: {updated_metadata['embedding_id']}"
                            )
                            row["color"] = updated_metadata.get(
                                "color", row.get("color", "")
                            )
                            row["material"] = updated_metadata.get(
                                "material", row.get("material", "")
                            )
                            row["brand"] = updated_metadata.get(
                                "brand", row.get("brand", "")
                            )
                            row["shape"] = updated_metadata.get(
                                "shape", row.get("shape", "")
                            )
                            row["comment"] = updated_metadata.get(
                                "comment", row.get("comment", "")
                            )
                            row["modifier"] = updated_metadata.get(
                                "modifier", row.get("modifier", "")
                            )
                            row["status"] = updated_metadata.get(
                                "status", row.get("status", "")
                            )
                            row["pick_point"] = updated_metadata.get(
                                "pick_point", row.get("pick_point", "")
                            )
                        updated_rows.append(row)

                with open(temp_file_name, mode="w", newline="") as f:
                    fieldnames = (
                        reader.fieldnames
                        if reader.fieldnames
                        else updated_metadata.keys()
                    )
                    writer = csv.DictWriter(f, fieldnames=fieldnames)
                    writer.writeheader()
                    writer.writerows(updated_rows)

                logger.info(
                    f"Uploading updated CSV back to S3: bucket={bucket_name}, key={csv_key}"
                )
                s3_client.upload_file(temp_file_name, bucket_name, csv_key)
                logger.info("Updated CSV uploaded to S3 successfully.")
            else:
                logger.warning("CSV does not exist. Cannot update.")

    except ValueError as ve:
        logger.error(f"ValueError: {str(ve)}")
        raise HTTPException(status_code=400, detail=f"ValueError: {str(ve)}")

    except Exception as e:
        logger.error(f"Error updating CSV in S3: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating CSV in S3: {str(e)}"
        )
