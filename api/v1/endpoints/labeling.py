import ast
import datetime
import logging
import os
import tempfile
import uuid
from typing import List, Dict, Any, Optional
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query, Request
import json
from pydantic import BaseModel
from PIL import Image
import piexif
import piexif.helper
import torch
from urllib.parse import urlparse
import boto3

from api.config import settings
from api.model_loader import model, device, preprocess

router = APIRouter()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# DynamoDB Setup
DDB_TABLE_NAME = "UDOLabelingQueue"
dynamodb = boto3.resource("dynamodb", region_name=settings.default_region)
table = dynamodb.Table(DDB_TABLE_NAME)

# Crop output folder (still S3)
CROP_OUTPUT_FOLDER = "s3://glacier-ml-training/universal-db/crops_for_labeling/"

# If a row is "in_progress", we automatically unlock it after 10 minutes
EXPIRATION_MINUTES = 10


# ---------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------

class SimilarityRequest(BaseModel):
    original_s3_uri: str
    bounding_box: List[float]


class UpdateDynamoDBRequest(BaseModel):
    original_s3_uri: str
    bounding_box: List[float]  # e.g. [0.27, 0.42, 0.71, 0.98]
    labeler_name: Optional[str] = None
    difficult: bool = False
    incoming_crop_metadata: Dict[str, Any] = {}
    similar_crop_metadata: Dict[str, Any] = {}
    embedding_id: Optional[str] = None


class UpdateDynamoDBEmbeddingRequest(BaseModel):
    original_s3_uri: str
    bounding_box: List[float]  # e.g. [0.27, 0.42, 0.71, 0.98]
    embedding_id: str


# ---------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------

@router.get("/list")
def get_labeling_list():
    """
    GET /list
    ---------
    1. Query both shard="UNLABELED" and shard="LABELED" to fetch all items.
    2. If any rows are "in_progress" and older than EXPIRATION_MINUTES (based on updated_timestamp),
       unlock them by setting "in_progress" = false.
    3. Return a list of items + stats.
    """
    now = datetime.datetime.now(datetime.timezone.utc)

    unlabeled_items = query_by_shard("UNLABELED")
    labeled_items = query_by_shard("LABELED")
    all_items = unlabeled_items + labeled_items

    total_crops = len(all_items)
    total_labeled = len(labeled_items)

    # Unlock expired
    for item in all_items:
        if item.get("in_progress") == "true":
            ts_str = item.get("updated_timestamp", "")
            if ts_str:
                try:
                    dt_obj = datetime.datetime.fromisoformat(ts_str)
                    diff_mins = (now - dt_obj).total_seconds() / 60
                    if diff_mins > EXPIRATION_MINUTES:
                        new_ts = now.isoformat()
                        # Mark in_progress = false
                        table.update_item(
                            Key={
                                "shard": item["shard"],
                                "s3_uri_bounding_box": item["s3_uri_bounding_box"],
                            },
                            UpdateExpression="SET in_progress = :ip, updated_timestamp = :uts",
                            ExpressionAttributeValues={
                                ":ip": "false",
                                ":uts": new_ts
                            }
                        )
                except ValueError:
                    logger.warning("Invalid ISO timestamp in updated_timestamp: %s", ts_str)

    # Convert to CropItem-like
    crop_list = []
    for i in all_items:
        raw_box = i.get("box", "")
        bounding_box = convert_box_to_float_list(raw_box)

        crop_list.append({
            "original_s3_uri": i.get("s3_uri", ""),
            "bounding_box": bounding_box,
            "labeled": (i.get("labeled") == "true"),
            "difficult": (i.get("difficult") == "true"),
            "labeler_name": i.get("labeler_name", "")
        })

    return {
        "crops": crop_list,
        "total_crops": total_crops,
        "total_labeled": total_labeled
    }


@router.api_route("/similarity", methods=["GET", "POST"])
async def similarity_search(
    request: Request,
    original_s3_uri: Optional[str] = Query(None, description="S3 URI of the original image"),
    bounding_box: Optional[str] = Query(None, description="Bounding box in format xmin,ymin,xmax,ymax"),
    payload: Optional[SimilarityRequest] = None  # For POST requests
):
    """
    Supports both:
      - **GET** request: `/similarity?original_s3_uri=<s3_uri>&bounding_box=100,150,400,600`
      - **POST** request: JSON body `{ "original_s3_uri": "<s3_uri>", "bounding_box": [100, 150, 400, 600] }`
    """
    
    now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # Determine if request is GET or POST
    if request.method == "GET":
        if not original_s3_uri or not bounding_box:
            raise HTTPException(status_code=400, detail="Missing required parameters: original_s3_uri and bounding_box")
        
        # Convert bounding_box from "100,150,400,600" -> [100, 150, 400, 600]
        try:
            bounding_box = [int(x) for x in bounding_box.split(",")]
            if len(bounding_box) != 4:
                raise ValueError("Bounding box must have exactly 4 values.")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid bounding_box format. Expected format: xmin,ymin,xmax,ymax")
    
    elif request.method == "POST":
        if not payload:
            raise HTTPException(status_code=400, detail="Invalid request body.")
        original_s3_uri = payload.original_s3_uri
        bounding_box = payload.bounding_box

    # Build the unique identifier
    s3_uri_bb = build_s3_uri_bounding_box_int(original_s3_uri, bounding_box)

    # Try to find an existing item
    item = find_item_by_s3_and_box(original_s3_uri, bounding_box)

    if not item:
        # Create a new item in the "UNLABELED" shard
        device = parse_device_from_s3(original_s3_uri)

        item = {
            "shard": "UNLABELED",
            "s3_uri_bounding_box": s3_uri_bb,
            "device": device,
            "s3_uri": original_s3_uri,
            "box": json.dumps(bounding_box),
            "embedding_id": "",
            "crop_s3_uri": "",
            "similar_crop_s3_uri": "",
            "new_crop_metadata": "",
            "similar_crop_metadata": "",
            "labeler_name": "",
            "labeled": "false",
            "in_progress": "true",
            "similar": "false",
            "difficult": "false",
            "updated_timestamp": now_str
        }
        table.put_item(Item=item)
    else:
        # Mark as "in_progress"
        table.update_item(
            Key={
                "shard": item["shard"],
                "s3_uri_bounding_box": item["s3_uri_bounding_box"]
            },
            UpdateExpression="SET in_progress = :ip, updated_timestamp = :uts",
            ExpressionAttributeValues={
                ":ip": "true",
                ":uts": now_str
            }
        )
        item = find_item_by_s3_and_box(original_s3_uri, bounding_box)

    # Ensure we have a crop_s3_uri
    if not item.get("crop_s3_uri"):
        new_crop_uri = create_and_upload_crop(original_s3_uri, bounding_box)
        table.update_item(
            Key={
                "shard": item["shard"],
                "s3_uri_bounding_box": item["s3_uri_bounding_box"]
            },
            UpdateExpression="SET crop_s3_uri = :c, updated_timestamp = :uts",
            ExpressionAttributeValues={
                ":c": new_crop_uri,
                ":uts": now_str
            }
        )
        item["crop_s3_uri"] = new_crop_uri

    # Generate embeddings and query Pinecone
    embeddings = generate_embeddings(item["crop_s3_uri"])
    top_match = query_pinecone_for_top_match(embeddings, exclude_s3_file_path=item["crop_s3_uri"])
    similar_crop_s3_uri = ""
    similar_metadata = {}
    score = None

    if top_match:
        score = top_match["score"]
        similar_metadata = top_match["metadata"]
        similar_crop_s3_uri = similar_metadata.get("s3_file_path", "")

        table.update_item(
            Key={
                "shard": item["shard"],
                "s3_uri_bounding_box": item["s3_uri_bounding_box"]
            },
            UpdateExpression="""
                SET similar_crop_s3_uri = :sim_s3,
                    similar_crop_metadata = :sim_meta,
                    updated_timestamp = :uts
            """,
            ExpressionAttributeValues={
                ":sim_s3": similar_crop_s3_uri,
                ":sim_meta": json.dumps(similar_metadata),
                ":uts": now_str
            }
        )

    # Generate presigned URLs
    presigned_incoming = settings.generate_presigned_url(item["crop_s3_uri"])
    presigned_similar = settings.generate_presigned_url(similar_crop_s3_uri) if similar_crop_s3_uri else None

    return {
        "crop_s3_uri": item["crop_s3_uri"],
        "crop_presigned_url": presigned_incoming,
        "incoming_crop_metadata": safely_parse_str_dict(item.get("new_crop_metadata", "")),
        "similar_crop_s3_uri": similar_crop_s3_uri,
        "similar_crop_presigned_url": presigned_similar,
        "similar_crop_metadata": similar_metadata,
        "score": score,
        "embedding_id": item.get("embedding_id", ""),
    }


@router.put("/update_dynamodb")
def update_dynamodb_final(payload: UpdateDynamoDBRequest):
    """
    1) bounding_box is [float,float,float,float].
    2) Find the item using the new sort key (constructed as s3_uri#xmin#ymin#xmax#ymax).
    3) Mark the item as labeled, store metadata (and possibly embedding_id), and compute 'similar'.
    4) Move the item from shard "UNLABELED" to shard "LABELED" by deleting the old item and putting a new one.
    """
    item = find_item_by_s3_and_box(payload.original_s3_uri, payload.bounding_box)
    if not item:
        raise HTTPException(status_code=404, detail="Row not found in DB.")

    now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
    old_shard = item["shard"]
    old_s3_uri_bb = item["s3_uri_bounding_box"]

    # Delete the old item using the new primary key
    table.delete_item(Key={"shard": old_shard, "s3_uri_bounding_box": old_s3_uri_bb})

    updated_item = dict(item)
    updated_item["shard"] = "LABELED"
    updated_item["labeled"] = "true"
    updated_item["labeler_name"] = payload.labeler_name or ""
    updated_item["difficult"] = str(payload.difficult).lower()
    updated_item["in_progress"] = "false"
    updated_item["updated_timestamp"] = now_str

    # Store final metadata
    updated_item["similar_crop_metadata"] = json.dumps(payload.similar_crop_metadata)
    updated_item["new_crop_metadata"] = json.dumps(payload.incoming_crop_metadata)

    # If the crop has a "metadata" field, store it
    if "metadata" in item:
        updated_item["metadata"] = item["metadata"]

    if payload.embedding_id:
        updated_item["embedding_id"] = payload.embedding_id

    # Compute 'similar'
    fields = ["brand", "color", "material", "shape"]
    incoming_filtered = {k: payload.incoming_crop_metadata.get(k) for k in fields}
    similar_filtered = {k: payload.similar_crop_metadata.get(k) for k in fields}
    updated_item["similar"] = "true" if incoming_filtered == similar_filtered else "false"

    # Put the new item (with the same sort key)
    table.put_item(Item=updated_item)

    return {"message": "Crop updated. Labeling session ended.", "status": "ok"}


@router.put("/update_dynamodb_embedding")
def update_dynamodb_embedding(payload: UpdateDynamoDBEmbeddingRequest):
    """
    Update only the embedding_id in DynamoDB for the given bounding_box.
    """
    item = find_item_by_s3_and_box(payload.original_s3_uri, payload.bounding_box)
    if not item:
        raise HTTPException(status_code=404, detail="Row not found in DB.")

    now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
    table.update_item(
        Key={"shard": item["shard"], "s3_uri_bounding_box": item["s3_uri_bounding_box"]},
        UpdateExpression="SET embedding_id = :eid, updated_timestamp = :uts",
        ExpressionAttributeValues={
            ":eid": payload.embedding_id,
            ":uts": now_str
        }
    )
    return {"message": "DB updated with new embedding_id."}


# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------

def query_by_shard(shard_val: str) -> List[Dict[str, Any]]:
    resp = table.query(
        KeyConditionExpression="#sd = :sh",
        ExpressionAttributeNames={"#sd": "shard"},
        ExpressionAttributeValues={":sh": shard_val},
        ScanIndexForward=True
    )
    return resp.get("Items", [])

def build_s3_uri_bounding_box_int(s3_uri: str, bounding_box: List[float]) -> str:
    """
    Constructs the sort key in the format: s3_uri#xmin#ymin#xmax#ymax,
    converting bounding box values to integers.
    """
    xmin, ymin, xmax, ymax = [int(round(x)) for x in bounding_box]
    return f"{s3_uri}#{xmin}#{ymin}#{xmax}#{ymax}"


def build_s3_uri_bounding_box_float(s3_uri: str, bounding_box: List[float]) -> str:
    """
    Constructs the sort key in the format: s3_uri#xmin#ymin#xmax#ymax,
    preserving the float values.
    """
    xmin, ymin, xmax, ymax = bounding_box
    return f"{s3_uri}#{xmin}#{ymin}#{xmax}#{ymax}"


def find_item_by_s3_and_box(s3_uri: str, bounding_box: List[float]) -> Optional[Dict[str, Any]]:
    """
    Attempts to find an item in the UDOLabelingQueue table by constructing the sort key in two formats:
    one with integer coordinates and one with float coordinates.
    It checks both "UNLABELED" and "LABELED" shards.
    Returns the item if found; otherwise, returns None.
    """
    int_key = build_s3_uri_bounding_box_int(s3_uri, bounding_box)
    float_key = build_s3_uri_bounding_box_float(s3_uri, bounding_box)
    
    for shard in ["UNLABELED", "LABELED"]:
        for key in (int_key, float_key):
            try:
                resp = table.get_item(Key={"shard": shard, "s3_uri_bounding_box": key})
                if "Item" in resp:
                    return resp["Item"]
            except Exception as e:
                logger.warning("Error during get_item for shard %s and key %s: %s", shard, key, e)
    return None

def parse_device_from_s3(s3_uri: str) -> str:
    parsed = urlparse(s3_uri)
    path_parts = parsed.path.strip("/").split("/")
    valid_prefixes = ("gem-", "cv-", "scn-")
    for part in path_parts:
        lower_part = part.lower()
        for prefix in valid_prefixes:
            if lower_part.startswith(prefix):
                return part
    # fallback
    return "UNKNOWN-DEVICE"

def safely_parse_str_dict(raw_str: str) -> Dict[str, Any]:
    if not raw_str.strip():
        return {}
    try:
        return json.loads(raw_str)
    except:
        pass
    try:
        obj = ast.literal_eval(raw_str)
        if isinstance(obj, dict):
            return obj
    except:
        pass
    return {}

def convert_box_to_float_list(box_data: Any) -> List[float]:
    """
    Converts DynamoDB-stored bounding box data into a list of floats.
    Logs a warning if format is unexpected.
    """
    if isinstance(box_data, str):
        try:
            parsed = json.loads(box_data)
            if isinstance(parsed, list):
                return [float(x) for x in parsed]
        except Exception as e:
            logger.warning(f"Failed to parse bounding box string: {box_data}. Error: {e}")
    elif isinstance(box_data, list):
        return [float(x) for x in box_data]
    return []

def create_and_upload_crop(original_s3_uri: str, bounding_box: List[float]) -> str:
    """
    Crop the image using absolute pixel coordinates and upload the crop to S3.
    Raises an error if the bounding_box appears to be normalized (i.e. all values between 0 and 1).
    """
    # Ensure the bounding box has exactly 4 values.
    if len(bounding_box) != 4:
        raise HTTPException(status_code=400, detail="Bounding box must have exactly 4 values.")

    # If all coordinates are between 0 and 1, assume they are normalized and raise an error.
    if all(0 <= c <= 1 for c in bounding_box):
        raise HTTPException(status_code=400, detail="Normalized coordinates detected. Expected absolute pixel values.")

    with tempfile.TemporaryDirectory() as tmp_dir:
        local_full = os.path.join(tmp_dir, "full.jpg")
        download_s3_uri(original_s3_uri, local_full)
        img = Image.open(local_full)

        # Use the provided absolute coordinates directly.
        xmin, ymin, xmax, ymax = bounding_box
        cropped = img.crop((xmin, ymin, xmax, ymax))

        base_name = os.path.basename(urlparse(original_s3_uri).path)
        new_name = f"{os.path.splitext(base_name)[0]}_{uuid.uuid4().hex}.jpg"
        local_crop = os.path.join(tmp_dir, new_name)
        cropped.save(local_crop, "JPEG")

        embedded_path = os.path.join(tmp_dir, f"meta_{new_name}")
        final_s3 = f"{CROP_OUTPUT_FOLDER}{new_name}"
        exif_meta = {
            "original_s3_uri": original_s3_uri,
            "s3_file_path": final_s3,
            "coordinates": bounding_box
        }
        embed_exif_metadata(local_crop, embedded_path, exif_meta)
        upload_s3_uri(embedded_path, final_s3)
        return final_s3

def embed_exif_metadata(input_path: str, output_path: str, metadata: Dict[str, Any]):
    img = Image.open(input_path)
    try:
        exif_dict = piexif.load(img.info.get("exif", b""))
    except Exception:
        exif_dict = {"Exif": {}}
    user_comment = piexif.helper.UserComment.dump(str(metadata), encoding="unicode")
    exif_dict["Exif"][piexif.ExifIFD.UserComment] = user_comment
    exif_bytes = piexif.dump(exif_dict)
    img.save(output_path, "JPEG", exif=exif_bytes)

def download_s3_uri(s3_uri: str, local_path: str):
    parsed = urlparse(s3_uri)
    bucket = parsed.netloc
    key = parsed.path.lstrip("/")
    s3_client = settings.get_s3_client()
    s3_client.download_file(bucket, key, local_path)

def upload_s3_uri(local_path: str, s3_uri: str):
    parsed = urlparse(s3_uri)
    bucket = parsed.netloc
    key = parsed.path.lstrip("/")
    s3_client = settings.get_s3_client()
    s3_client.upload_file(local_path, bucket, key)

def generate_embeddings(crop_s3_uri: str) -> List[float]:
    with tempfile.TemporaryDirectory() as tmp_dir:
        local_file = os.path.join(tmp_dir, "crop.jpg")
        download_s3_uri(crop_s3_uri, local_file)
        with Image.open(local_file) as img:
            img_tensor = preprocess(img).unsqueeze(0).to(device)
            with torch.no_grad():
                emb = model.encode_image(img_tensor).cpu().numpy().flatten().tolist()
    return emb

def query_pinecone_for_top_match(
    embedding: List[float],
    exclude_s3_file_path: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    pinecone_index = settings.get_pinecone_index()
    top_k = 5 if exclude_s3_file_path else 1
    resp = pinecone_index.query(vector=embedding, top_k=top_k, include_metadata=True)
    matches = resp.get("matches", [])
    if not matches:
        return None

    if exclude_s3_file_path:
        for m in matches:
            md = m.get("metadata", {})
            if md.get("s3_file_path", "") != exclude_s3_file_path:
                return {"score": m["score"], "metadata": md}
        return None
    else:
        best = matches[0]
        return {"score": best["score"], "metadata": best.get("metadata", {})}
