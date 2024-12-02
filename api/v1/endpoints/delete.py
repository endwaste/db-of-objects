from fastapi import APIRouter, HTTPException
from api.config import settings
import tempfile
import csv
import logging
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class DeleteRequest(BaseModel):
    embedding_id: str


router = APIRouter()

index = settings.get_pinecone_index()


@router.post("/delete")
async def delete_entry(delete_request: DeleteRequest):
    """
    Delete an entry by marking its status as 'inactive' in the S3 CSV and removing it from Pinecone.

    Args:
        embedding_id (str): The unique ID of the embedding to delete.

    Returns:
        dict: Success message upon completion.
    """
    try:
        embedding_id = delete_request.embedding_id
        logger.info(f"Starting delete process for embedding_id={embedding_id}")

        query_response = index.fetch([embedding_id])

        if not query_response or not query_response.get("vectors"):
            logger.warning(f"No matching entry found for embedding_id={embedding_id}")
            raise HTTPException(status_code=404, detail="No matching entry found.")

        index.delete(embedding_id)
        logger.info(f"Removed embedding_id={embedding_id} from Pinecone.")

        update_metadata_status_in_s3(embedding_id, "inactive")

        return {
            "status": "success",
            "message": f"Entry with embedding_id={embedding_id} deleted successfully.",
        }

    except HTTPException as http_exc:
        logger.error(f"HTTPException during delete: {http_exc.detail}")
        raise http_exc

    except Exception as e:
        logger.error(f"Unexpected error during delete: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error during delete: {str(e)}")


def update_metadata_status_in_s3(embedding_id: str, new_status: str) -> None:
    """
    Update the status of a metadata entry in the S3 CSV file.

    Args:
        embedding_id (str): The ID of the entry to update.
        new_status (str): The new status to set (e.g., "inactive").
    """
    logger.info(f"Updating status for embedding_id={embedding_id} to {new_status}...")

    s3_client = settings.get_s3_client()
    bucket_name = settings.s3_bucket_name
    csv_key = "universal-db/metadata.csv"

    try:
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_file_name = temp_file.name
            logger.info(f"Downloading metadata CSV from S3: {csv_key}")
            s3_client.download_file(bucket_name, csv_key, temp_file_name)

            with open(temp_file_name, "r", newline="") as f:
                reader = csv.DictReader(f)
                rows = list(reader)

            with open(temp_file_name, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=reader.fieldnames)
                writer.writeheader()

                for row in rows:
                    if row["id"] == embedding_id:
                        logger.info(
                            f"Marking embedding_id={embedding_id} as {new_status}"
                        )
                        row["status"] = new_status
                    writer.writerow(row)

            logger.info(f"Uploading updated metadata CSV back to S3: {csv_key}")
            s3_client.upload_file(temp_file_name, bucket_name, csv_key)
            logger.info(f"Status updated for embedding_id={embedding_id}.")

    except Exception as e:
        logger.error(f"Error updating metadata status in S3: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating metadata status in S3: {str(e)}"
        )
