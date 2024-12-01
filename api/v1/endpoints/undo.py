from fastapi import APIRouter, HTTPException
from api.config import settings
from datetime import datetime, timezone

router = APIRouter()

@router.post("/undo")
async def undo_upload(embedding_id: str):
    """
    Undo the most recent upload by deleting its metadata and associated S3 file.
    """
    try:
        # Get the Pinecone index from settings
        index = settings.get_pinecone_index()

        # Query Pinecone to get the metadata for the given embedding_id
        query_response = index.fetch([embedding_id])

        if not query_response or not query_response.get("vectors"):
            raise HTTPException(status_code=404, detail="No matching upload found.")

        metadata = query_response["vectors"][embedding_id]["metadata"]
        s3_file_path = metadata.get("s3_file_path")
        bucket_name, key = s3_file_path.replace("s3://", "").split("/", 1)

        # Delete the file from S3
        s3_client = settings.get_s3_client()
        s3_client.delete_object(Bucket=bucket_name, Key=key)

        # Delete the entry from Pinecone
        index.delete(embedding_id)

        return {"status": "success", "message": "Upload undone successfully."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
