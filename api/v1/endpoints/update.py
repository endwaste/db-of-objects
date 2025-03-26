from fastapi import APIRouter, HTTPException, Form
from typing import Optional, Union, List
import logging
import tempfile
import csv

from api.config import settings

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
    """
    Update metadata for an existing entry in Pinecone and the CSV in S3,
    including multiple pick points of the form "x1,y1;x2,y2".
    """
    try:
        current_metadata, current_vector = await fetch_metadata_from_pinecone(embedding_id)
        if not current_metadata:
            raise HTTPException(status_code=404, detail="Metadata not found.")

        if pick_point:
            parsed_points = parse_pick_points_from_string(pick_point)
            formatted_points = format_pick_points(parsed_points)
        else:
            formatted_points = current_metadata.get("pick_point", "")

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
            "pick_point": formatted_points,
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


async def update_pinecone(embedding_id: str, updated_metadata: dict, current_vector: list):
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
    """
    Update the CSV file in S3 with the new metadata row.
    Ensures labeler_name is in the CSV headers and updated row.
    """
    logger.info("Updating CSV in S3...")
    s3_client = settings.get_s3_client()
    bucket_name = settings.s3_bucket_name
    csv_key = "universal-db/metadata.csv"

    try:
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_file_name = temp_file.name
            response = s3_client.list_objects_v2(Bucket=bucket_name, Prefix=csv_key)
            file_exists = "Contents" in response

            if not file_exists:
                logger.warning("CSV does not exist in S3; cannot update a non-existent file.")
                return

            logger.info(f"Downloading existing CSV from S3: {csv_key}")
            s3_client.download_file(bucket_name, csv_key, temp_file_name)
            logger.info("CSV downloaded successfully.")

            updated_rows = []
            with open(temp_file_name, mode="r", newline="") as f:
                reader = csv.DictReader(f)
                if "id" not in reader.fieldnames:
                    raise ValueError("CSV file missing required 'id' column in headers.")

                # Ensure labeler_name column is in the headers
                fieldnames = list(reader.fieldnames)
                if "labeler_name" not in fieldnames:
                    fieldnames.insert(fieldnames.index("comment") + 1, "labeler_name")

                for row in reader:
                    if row.get("id") == updated_metadata["embedding_id"]:
                        # Update fields
                        row["color"] = updated_metadata.get("color", row.get("color", ""))
                        row["material"] = updated_metadata.get("material", row.get("material", ""))
                        row["brand"] = updated_metadata.get("brand", row.get("brand", ""))
                        row["shape"] = updated_metadata.get("shape", row.get("shape", ""))
                        row["comment"] = updated_metadata.get("comment", row.get("comment", ""))
                        row["modifier"] = updated_metadata.get("modifier", row.get("modifier", ""))
                        row["pick_point"] = updated_metadata.get("pick_point", row.get("pick_point", ""))
                        row["status"] = updated_metadata.get("status", row.get("status", ""))
                        row["labeler_name"] = updated_metadata.get("labeler_name", row.get("labeler_name", ""))
                    updated_rows.append(row)

            with open(temp_file_name, mode="w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(updated_rows)

            logger.info(f"Uploading updated CSV back to S3: {csv_key}")
            s3_client.upload_file(temp_file_name, bucket_name, csv_key)
            logger.info("Updated CSV uploaded to S3 successfully.")

    except ValueError as ve:
        logger.error(f"ValueError: {str(ve)}")
        raise HTTPException(status_code=400, detail=f"ValueError: {str(ve)}")
    except Exception as e:
        logger.error(f"Error updating CSV in S3: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating CSV in S3: {str(e)}"
        )


# -----------------------------
#  Helpers for pick_point
# -----------------------------
def parse_pick_points_from_string(pick_point_str: str) -> List[List[float]]:
    """
    Parse a pick point string that may contain one or multiple points.
    Format: "x1,y1;x2,y2;...".
    Returns a list of [x, y] pairs.
    Raises 400 if invalid.
    """
    if not pick_point_str:
        raise HTTPException(status_code=400, detail="pick_point is required.")

    points = pick_point_str.strip().split(";")
    parsed_points = []
    for point in points:
        coords = point.strip().split(",")
        if len(coords) != 2:
            raise HTTPException(
                status_code=400,
                detail="Each pick point must contain exactly two comma-separated numbers."
            )
        try:
            x = float(coords[0].strip())
            y = float(coords[1].strip())
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Pick point coordinates must be valid floats."
            )
        parsed_points.append([x, y])
    return parsed_points


def format_pick_points(parsed_points: List[List[float]]) -> str:
    """
    Format the list of pick points back into "x1,y1;x2,y2;...".
    """
    return ";".join(f"{pt[0]},{pt[1]}" for pt in parsed_points)
