import ast
import datetime
import logging
import os
import tempfile
import uuid
from typing import List, Dict, Any, Optional
from decimal import Decimal

from fastapi import APIRouter, HTTPException
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
DDB_TABLE_NAME = "LabelingQueue"
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
                                "timestamp": item["timestamp"]
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

        # Ensure bounding_box is always in the correct format
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


@router.post("/similarity")
def similarity_search(payload: SimilarityRequest):
    """
    1) bounding_box is [float,float,float,float] from the client.
    2) We'll do a GSI lookup in 2 ways:
       - First with the normal array JSON string
       - If not found, try the old "DB format" string
    3) If still not found, create a new item with bounding_box stored in normal array format.
    4) If no crop_s3_uri, crop & upload.
    5) Generate embeddings, do Pinecone, set similar_crop_*.
    6) Return presigned URLs, etc.
    """
    now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
    # 1) Try to find item
    item = find_item_by_s3_and_box(payload.original_s3_uri, payload.bounding_box)

    if not item:
        # Create new item => shard="UNLABELED"
        device = parse_device_from_s3(payload.original_s3_uri)

        item = {
            "shard": "UNLABELED",
            "timestamp": now_str,
            "device": device,
            "s3_uri": payload.original_s3_uri,
            # We'll store the bounding box in normal array format JSON
            "box": json.dumps(payload.bounding_box),

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
        # Mark in_progress
        table.update_item(
            Key={
                "shard": item["shard"],
                "timestamp": item["timestamp"]
            },
            UpdateExpression="SET in_progress = :ip, updated_timestamp = :uts",
            ExpressionAttributeValues={
                ":ip": "true",
                ":uts": now_str
            }
        )
        # Reload
        item = find_item_by_s3_and_box(payload.original_s3_uri, payload.bounding_box)

    # 2) Ensure we have a crop_s3_uri
    if not item["crop_s3_uri"]:
        # For cropping, we need the bounding box in numeric form
        # 'payload.bounding_box' is already a list of floats
        new_crop_uri = create_and_upload_crop(payload.original_s3_uri, payload.bounding_box)
        table.update_item(
            Key={
                "shard": item["shard"],
                "timestamp": item["timestamp"]
            },
            UpdateExpression="SET crop_s3_uri = :c, updated_timestamp = :uts",
            ExpressionAttributeValues={
                ":c": new_crop_uri,
                ":uts": now_str
            }
        )
        item["crop_s3_uri"] = new_crop_uri

    # 3) incoming_crop_metadata
    embedding_id = item.get("embedding_id") or ""
    incoming_crop_metadata = {}
    if embedding_id:
        fetched = settings.get_pinecone_index().fetch(ids=[embedding_id])
        vectors = fetched.get("vectors", {})
        if embedding_id in vectors:
            incoming_crop_metadata = vectors[embedding_id].get("metadata", {})
    else:
        raw_str = item.get("new_crop_metadata", "")
        incoming_crop_metadata = safely_parse_str_dict(raw_str)

    # 4) Generate embeddings => Pinecone => set similar_...
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
                "timestamp": item["timestamp"]
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

    # 5) Return
    presigned_incoming = settings.generate_presigned_url(item["crop_s3_uri"])
    presigned_similar = None
    if similar_crop_s3_uri:
        presigned_similar = settings.generate_presigned_url(similar_crop_s3_uri)

    return {
        "crop_s3_uri": item["crop_s3_uri"],
        "crop_presigned_url": presigned_incoming,
        "incoming_crop_metadata": incoming_crop_metadata,
        "similar_crop_s3_uri": similar_crop_s3_uri,
        "similar_crop_presigned_url": presigned_similar,
        "similar_crop_metadata": similar_metadata,
        "score": score,
        "embedding_id": embedding_id,
    }


@router.put("/update_dynamodb")
def update_dynamodb_final(payload: UpdateDynamoDBRequest):
    """
    1) bounding_box is [float,float,float,float].
    2) find item using the bounding_box in both normal & old DB format.
    3) Mark labeled, store metadata, possibly embedding_id, compute 'similar'.
    4) Move item from shard=UNLABELED => shard=LABELED (delete + put).
    """
    item = find_item_by_s3_and_box(payload.original_s3_uri, payload.bounding_box)
    if not item:
        raise HTTPException(status_code=404, detail="Row not found in DB.")

    now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
    old_shard = item["shard"]
    old_created = item["timestamp"]

    # Delete old
    table.delete_item(Key={"shard": old_shard, "timestamp": old_created})

    updated_item = dict(item)
    updated_item["shard"] = "LABELED"
    updated_item["labeled"] = "true"
    updated_item["labeler_name"] = payload.labeler_name or ""
    updated_item["difficult"] = str(payload.difficult).lower()
    updated_item["in_progress"] = "false"
    updated_item["updated_timestamp"] = now_str

    # final metadata
    updated_item["similar_crop_metadata"] = json.dumps(payload.similar_crop_metadata)
    updated_item["new_crop_metadata"] = json.dumps(payload.incoming_crop_metadata)

    if payload.embedding_id:
        updated_item["embedding_id"] = payload.embedding_id

    # compute 'similar'
    fields = ["brand", "color", "material", "shape"]
    incoming_filtered = {k: payload.incoming_crop_metadata.get(k) for k in fields}
    similar_filtered = {k: payload.similar_crop_metadata.get(k) for k in fields}
    updated_item["similar"] = "true" if incoming_filtered == similar_filtered else "false"

    # Put new item with same timestamp
    table.put_item(Item=updated_item)

    return {"message": "Crop updated. Labeling session ended.", "status": "ok"}


@router.put("/update_dynamodb_embedding")
def update_dynamodb_embedding(payload: UpdateDynamoDBEmbeddingRequest):
    """
    Just update embedding_id in Dynamo for a bounding_box (list of floats).
    """
    item = find_item_by_s3_and_box(payload.original_s3_uri, payload.bounding_box)
    if not item:
        raise HTTPException(status_code=404, detail="Row not found in DB.")

    now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
    table.update_item(
        Key={"shard": item["shard"], "timestamp": item["timestamp"]},
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
        # Instead of "shard = :sh", do "#sd = :sh" and map "#sd" => "shard"
        KeyConditionExpression="#sd = :sh",
        ExpressionAttributeNames={"#sd": "shard"},
        ExpressionAttributeValues={":sh": shard_val},
        ScanIndexForward=True  # or False if you want latest first
    )
    return resp.get("Items", [])


def find_item_by_s3_and_box(s3_uri: str, bounding_box: List[float]) -> Optional[Dict[str, Any]]:
    """
    Attempts to find an item via GSI by checking both:
      1) normal JSON array format (e.g. "[0.27,0.42,0.71,0.98]")
      2) old DB format (e.g. '[{"N":"0.27"}, ...]')

    If neither query returns an item, returns None.
    """
    # 1) normal array JSON
    normal_str = json.dumps(bounding_box)  # e.g. "[0.27,0.42,0.71,0.98]"
    item = do_gsi_lookup(s3_uri, normal_str)
    if item:
        return item

    # 2) old "DB format"
    db_format_str = convert_box_to_special_format(bounding_box)
    item = do_gsi_lookup(s3_uri, db_format_str)
    if item:
        return item

    # None found
    return None


def do_gsi_lookup(s3_uri: str, box_str: str) -> Optional[Dict[str, Any]]:
    """
    Attempt a single GSI query with (s3_uri, box_str).
    """
    resp = table.query(
        IndexName="s3_uri-box-index",  # name of your GSI
        KeyConditionExpression="s3_uri = :uriVal AND box = :boxVal",
        ExpressionAttributeValues={
            ":uriVal": s3_uri,
            ":boxVal": box_str
        }
    )
    items = resp.get("Items", [])
    return items[0] if items else None


def get_next_crop(old_shard: str, old_created: str) -> Optional[Dict[str, Any]]:
    unlabeled = query_by_shard("UNLABELED")
    for it in unlabeled:
        if it["timestamp"] != old_created:
            return it

    labeled = query_by_shard("LABELED")
    for it in labeled:
        if it["timestamp"] != old_created:
            return it

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
    Supports:
      - JSON string format: "[x, y, z, w]"
      - List of Decimal values: [Decimal(x), Decimal(y), Decimal(z), Decimal(w)]
    Logs a warning if format is unexpected.
    """
    if isinstance(box_data, list):
        if all(isinstance(x, Decimal) for x in box_data):
            return [float(x) for x in box_data]
        if all(isinstance(x, (int, float)) for x in box_data):
            logger.info("[DEBUG] Bounding box is already a list of floats.")
            return box_data
    if isinstance(box_data, str):
        try:
            parsed_data = json.loads(box_data)

            if isinstance(parsed_data, list) and all(isinstance(x, (int, float)) for x in parsed_data):
                return parsed_data

        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(f"[WARNING] Failed to parse bounding box string: {box_data}. Error: {e}")
    return []


def convert_box_to_special_format(box_list: List[float]) -> str:
    """
    Convert [0.27, 0.42, 0.71, 0.98] -> '[{"N":"0.27"},{"N":"0.42"},{"N":"0.71"},{"N":"0.98"}]'
    Old DB format. We only use this to do a fallback GSI query or read old items.
    """
    arr = [{"N": str(val)} for val in box_list]
    return json.dumps(arr)


def create_and_upload_crop(original_s3_uri: str, bounding_box: List[float]) -> str:
    logger.info(f"[DEBUG] Received original_s3_uri: {original_s3_uri}")
    logger.info(f"[DEBUG] Received bounding_box: {bounding_box}")

    with tempfile.TemporaryDirectory() as tmp_dir:
        local_full = os.path.join(tmp_dir, "full.jpg")
        download_s3_uri(original_s3_uri, local_full)
        img = Image.open(local_full)
        width, height = img.size
        if len(bounding_box) == 4 and all(0 <= c <= 1 for c in bounding_box):
            logger.info("[DEBUG] Detected normalized coords => converting to absolute.")
            # scale x coords by width, y coords by height
            bounding_box[0] *= width   # xmin
            bounding_box[2] *= width   # xmax
            bounding_box[1] *= height  # ymin
            bounding_box[3] *= height  # ymax
            logger.info(f"[DEBUG] bounding_box after un‐normalize: {bounding_box}")

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
                # We'll store the final, un‐normalized bounding_box in EXIF
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
