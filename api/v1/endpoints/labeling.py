import ast
import csv
import datetime
import logging
import os
import tempfile
import uuid
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException
import json
from pydantic import BaseModel
from PIL import Image
import piexif
import piexif.helper
import torch
from urllib.parse import urlparse

from api.config import settings
from api.model_loader import model, device, preprocess

router = APIRouter()
logger = logging.getLogger(__name__)

# CSV path in S3
LABELING_CSV_KEY = "universal-db/labeling_data.csv"
BUCKET_NAME = settings.s3_bucket_name

# Crop output folder
CROP_OUTPUT_FOLDER = "s3://glacier-ml-training/universal-db/crops_for_labeling/"

# If a row is "in_progress", we automatically unlock it after 10 minutes
EXPIRATION_MINUTES = 10


class SimilarityRequest(BaseModel):
    """
    Payload for the /similarity endpoint.
    We only know the original_s3_uri and bounding_box of the crop to label.
    """
    original_s3_uri: str
    bounding_box: List[float]


class UpdateCSVRequest(BaseModel):
    """
    Payload for /update_csv endpoint.

    - original_s3_uri, bounding_box: identify the row in the CSV
    - labeler_name: optional string for who labeled this
    - difficult: boolean for whether the crop is "difficult"
    - incoming_crop_metadata: the final metadata for the "incoming" crop
    - similar_crop_metadata: the final metadata for the "similar" crop
    - action: either "end" or "next" to decide if we continue labeling
    - embedding_id: (optional) if the incoming crop was added to the DB and has an ID
    """
    original_s3_uri: str
    bounding_box: List[float]
    labeler_name: Optional[str] = None
    difficult: bool = False
    incoming_crop_metadata: Dict[str, Any] = {}
    similar_crop_metadata: Dict[str, Any] = {}
    action: str = "end"
    embedding_id: Optional[str] = None

class UpdateCSVEmbeddingRequest(BaseModel):
    original_s3_uri: str
    bounding_box: List[float]
    embedding_id: str


@router.get("/list")
def get_labeling_list():
    """
    GET /list
    ----------
    - Loads all rows from labeling_data.csv.
    - If any rows were marked "in_progress" but are older than EXPIRATION_MINUTES,
      we unlock them by setting "in_progress"=false.
    - Returns a list of "CropItem" objects, each with:
        - original_s3_uri
        - bounding_box
        - labeled (bool)
        - difficult (bool)
        - labeler_name (str)
    - Also returns total_crops, total_labeled for stats.
    """
    if not csv_exists_in_s3(LABELING_CSV_KEY):
        create_empty_labeling_csv()
        return {"crops": [], "total_crops": 0, "total_labeled": 0}

    # Download CSV to a temp file
    with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
        tmp_filename = tmp_file.name
        s3_client = settings.get_s3_client()
        s3_client.download_file(BUCKET_NAME, LABELING_CSV_KEY, tmp_filename)

    # Read + unlock expired
    now = datetime.datetime.now(datetime.timezone.utc)
    rows = []
    total_crops = 0
    total_labeled = 0

    with open(tmp_filename, "r", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            total_crops += 1
            if row.get("labeled", "false").lower() == "true":
                total_labeled += 1

            in_progress = row.get("in_progress", "false").lower() == "true"
            ts_str = row.get("timestamp", "")
            if in_progress and ts_str:
                try:
                    tstamp = datetime.datetime.fromisoformat(ts_str)
                    if (now - tstamp).total_seconds() / 60 > EXPIRATION_MINUTES:
                        row["in_progress"] = "false"
                except ValueError:
                    logger.warning("Invalid timestamp in CSV: %s", ts_str)

            rows.append(row)

    # Re-upload if we changed anything (e.g., unlocked rows)
    with tempfile.NamedTemporaryFile("w", delete=False, newline="") as wf:
        fieldnames = rows[0].keys() if rows else get_labeling_csv_headers()
        writer = csv.DictWriter(wf, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
        updated_file = wf.name

    s3_client.upload_file(updated_file, BUCKET_NAME, LABELING_CSV_KEY)

    # Convert to CropItem-like responses
    crop_list = []
    for r in rows:
        crop_list.append({
            "original_s3_uri": r["original_s3_uri"],
            "bounding_box": r["bounding_box"],
            "labeled": r.get("labeled", "false").lower() == "true",
            "difficult": r.get("difficult", "false").lower() == "true",
            "labeler_name": r.get("labeler_name", "")
        })

    return {
        "crops": crop_list,
        "total_crops": total_crops,
        "total_labeled": total_labeled
    }


@router.post("/similarity")
def similarity_search(payload: SimilarityRequest):
    """
    POST /similarity
    ----------------
    1) Find (or create) the CSV row for (original_s3_uri, bounding_box).
    2) Ensure we have a crop_s3_uri for it (upload a cropped image if needed).
    3) If the CSV row has an embedding_id => that means it's in the DB => fetch metadata from Pinecone => incoming_crop_metadata
       Else if new_crop_metadata in CSV => parse that => incoming_crop_metadata
    4) Generate embeddings => do a top-1 similarity search => that yields similar_crop_metadata + s3 URI
    5) Save any updated row fields (similar_crop_s3_uri, similar_crop_metadata) back to CSV
    6) Return:
       - crop_presigned_url
       - incoming_crop_metadata
       - similar_crop_presigned_url
       - similar_crop_metadata
       - embedding_id
       - plus any other info needed by front end
    """
    original_s3_uri = payload.original_s3_uri
    bounding_box = payload.bounding_box

    # Download CSV & find row
    rows = download_labeling_csv()
    row = find_row(rows, original_s3_uri, bounding_box)
    if not row:
        row = {
            "original_s3_uri": original_s3_uri,
            "bounding_box": ",".join(map(str, bounding_box)),
            "embedding_id": "",
            "crop_s3_uri": "",
            "similar_crop_s3_uri": "",
            "new_crop_metadata": "",
            "similar_crop_metadata": "",
            "labeler_name": "",
            "labeled": "false",
            "in_progress": "true",
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "similar": "false",
            "difficult": "false",
        }
        rows.append(row)

    # Ensure we have a cropped image in s3
    if not row["crop_s3_uri"]:
        row["crop_s3_uri"] = create_and_upload_crop(original_s3_uri, bounding_box)

    embedding_id = row["embedding_id"] or ""
    incoming_crop_metadata = {}

    if embedding_id:
        # That means the crop is in Pinecone => fetch from Pinecone => use as incoming_crop_metadata
        fetched = settings.get_pinecone_index().fetch(ids=[embedding_id])
        vectors = fetched.get("vectors", {})
        if embedding_id in vectors:
            incoming_crop_metadata = vectors[embedding_id].get("metadata", {})
    else:
        # Not in DB => let's see if CSV has stored new_crop_metadata
        raw_str = row.get("new_crop_metadata", "")
        if raw_str:
            try:
                cleaned = raw_str.strip()
                if cleaned.startswith("{") and cleaned.endswith("}"):
                    try:
                        data = ast.literal_eval(cleaned)
                        if isinstance(data, dict):
                            incoming_crop_metadata = data
                        else:
                            incoming_crop_metadata = {}
                    except Exception:
                        incoming_crop_metadata = {}
                else:
                    incoming_crop_metadata = {}
            except Exception:
                incoming_crop_metadata = {}

    embeddings = generate_embeddings(row["crop_s3_uri"])
    top_match = query_pinecone_for_top_match(embeddings, exclude_s3_file_path=row["crop_s3_uri"])
    similar_crop_s3_uri = ""
    similar_metadata = {}
    score = None
    if top_match:
        score = top_match["score"]
        similar_metadata = top_match["metadata"]
        similar_crop_s3_uri = similar_metadata.get("s3_file_path", "")
        row["similar_crop_s3_uri"] = similar_crop_s3_uri
        row["similar_crop_metadata"] = str(similar_metadata)

    # Save updated row back to CSV
    upload_labeling_csv(rows)

    return {
        "crop_s3_uri": row["crop_s3_uri"],
        "crop_presigned_url": settings.generate_presigned_url(row["crop_s3_uri"]),
        "incoming_crop_metadata": incoming_crop_metadata,
        "similar_crop_s3_uri": similar_crop_s3_uri,
        "similar_crop_presigned_url": (
            settings.generate_presigned_url(similar_crop_s3_uri)
            if similar_crop_s3_uri else None
        ),
        "similar_crop_metadata": similar_metadata,
        "score": score,
        "embedding_id": embedding_id,
    }


@router.put("/update_csv")
def update_csv_final(payload: UpdateCSVRequest):
    """
    PUT /update_csv
    ---------------
    1) Find the CSV row for (original_s3_uri, bounding_box).
    2) Save the final metadata for both "incoming" and "similar" crops:
       - row["new_crop_metadata"] = str(payload.incoming_crop_metadata)
       - row["similar_crop_metadata"] = str(payload.similar_crop_metadata)
       If you want real JSON, do json.dumps instead of str(...).
    3) Mark row as labeled=true, store labeler_name, difficult, timestamp
    4) If payload.embedding_id is set => store row["embedding_id"] = embedding_id
       (i.e. if we added it to the DB).
    5) Compute 'similar' by comparing brand/color/material/shape between incoming & similar
    6) Re-upload CSV
    7) If action=="next" => return the next unlabeled row if available
       If action=="end" => "Crop updated. Labeling session ended."
    """
    rows = download_labeling_csv()
    row = find_row(rows, payload.original_s3_uri, payload.bounding_box)
    if not row:
        raise HTTPException(status_code=404, detail="Row not found in CSV.")

    # Mark row as labeled, store labeler/difficult/timestamp
    row["labeled"] = "true"
    row["labeler_name"] = payload.labeler_name or ""
    row["difficult"] = str(payload.difficult).lower()
    row["timestamp"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # Store final metadata
    row["similar_crop_metadata"] = str(payload.similar_crop_metadata)
    row["new_crop_metadata"] = str(payload.incoming_crop_metadata)

    # If embedding_id => store it
    if payload.embedding_id:
        row["embedding_id"] = payload.embedding_id

    # Compute "similar" by comparing brand/color/material/shape
    fields_to_compare = ["brand", "color", "material", "shape"]
    incoming_filtered = {k: payload.incoming_crop_metadata.get(k) for k in fields_to_compare}
    similar_filtered = {k: payload.similar_crop_metadata.get(k) for k in fields_to_compare}
    if incoming_filtered == similar_filtered:
        row["similar"] = "true"
    else:
        row["similar"] = "false"

    # Re-upload CSV
    upload_labeling_csv(rows)

    # Action logic
    if payload.action == "end":
        return {
            "message": "Crop updated. Labeling session ended.",
            "status": "ok"
        }
    elif payload.action == "next":
        next_crop = find_next_crop(
            rows,
            payload.original_s3_uri,
            ",".join(map(str, payload.bounding_box))
        )
        if not next_crop:
            return {
                "message": "Crop updated. No more crops available.",
                "status": "ok"
            }
        else:
            return {
                "message": "Crop updated. Here's the next crop.",
                "status": "ok",
                "next_crop": {
                    "original_s3_uri": next_crop["original_s3_uri"],
                    "bounding_box": next_crop["bounding_box"],
                    "labeled": next_crop.get("labeled", "false").lower() == "true",
                    "labeler_name": next_crop.get("labeler_name", "") or row["labeler_name"],
                }
            }
    else:
        raise HTTPException(status_code=400, detail=f"Invalid action: {payload.action}")
    

@router.put("/update_csv_embedding")
def update_csv_embedding(payload: UpdateCSVEmbeddingRequest):
    """
    PUT /update_csv_embedding
    -------------------------
    This endpoint updates a CSV row (identified by original_s3_uri and bounding_box)
    with a new embedding_id. This is
    intended to be called immediately after adding the crop to the UDO, so that the
    CSV is updated even if the user does not click "Next".
    
    The payload is expected as JSON.
    """
    rows = download_labeling_csv()
    row = find_row(rows, payload.original_s3_uri, payload.bounding_box)
    if not row:
        raise HTTPException(status_code=404, detail="Row not found in CSV.")

    row["embedding_id"] = payload.embedding_id
    row["timestamp"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    upload_labeling_csv(rows)
    return {"message": "CSV updated with new embedding_id."}


def find_next_crop(rows: List[Dict[str, str]], current_s3: str, current_bb: str) -> Optional[Dict[str, str]]:
    """
    find_next_crop
    --------------
    - Given all CSV rows, skip the row matching (current_s3, current_bb).
    - Then prefer the first unlabeled row (labeled=false).
    - If none unlabeled remain, pick the first labeled row instead.
    - Return None if no other rows exist at all.
    """
    unlabeled_candidates = []
    labeled_candidates = []

    for r in rows:
        # skip current
        if r["original_s3_uri"] == current_s3 and r["bounding_box"] == current_bb:
            continue
        is_labeled = r.get("labeled", "false").lower() == "true"
        if not is_labeled:
            unlabeled_candidates.append(r)
        else:
            labeled_candidates.append(r)

    if unlabeled_candidates:
        return unlabeled_candidates[0]
    if labeled_candidates:
        return labeled_candidates[0]
    return None


def get_labeling_csv_headers() -> List[str]:
    """
    Return the headers used in labeling_data.csv.
    """
    return [
        "original_s3_uri",
        "bounding_box",
        "embedding_id",
        "crop_s3_uri",
        "similar_crop_s3_uri",
        "new_crop_metadata",
        "similar_crop_metadata",
        "labeler_name",
        "labeled",
        "in_progress",
        "timestamp",
        "similar",
        "difficult",
    ]


def csv_exists_in_s3(key: str) -> bool:
    """
    Return True if the given CSV key (LABELING_CSV_KEY) exists in S3.
    """
    s3_client = settings.get_s3_client()
    resp = s3_client.list_objects_v2(Bucket=BUCKET_NAME, Prefix=key)
    return "Contents" in resp


def create_empty_labeling_csv():
    """
    If labeling_data.csv doesn't exist, create an empty one with headers.
    """
    headers = get_labeling_csv_headers()
    with tempfile.NamedTemporaryFile("w", delete=False, newline="") as tmp:
        writer = csv.writer(tmp)
        writer.writerow(headers)
        local_name = tmp.name
    s3_client = settings.get_s3_client()
    s3_client.upload_file(local_name, BUCKET_NAME, LABELING_CSV_KEY)


def download_labeling_csv() -> List[Dict[str, str]]:
    """
    Download labeling_data.csv from S3 and return all rows as a list of dicts.
    If it doesn't exist, create an empty file first.
    """
    if not csv_exists_in_s3(LABELING_CSV_KEY):
        create_empty_labeling_csv()

    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp_name = tmp.name
        s3_client = settings.get_s3_client()
        s3_client.download_file(BUCKET_NAME, LABELING_CSV_KEY, tmp_name)

    rows = []
    with open(tmp_name, "r", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    return rows


def upload_labeling_csv(rows: List[Dict[str, str]]):
    """
    Overwrite labeling_data.csv in S3 with the given rows list (dicts).
    """
    if not rows:
        return
    fieldnames = rows[0].keys()
    with tempfile.NamedTemporaryFile("w", delete=False, newline="") as tmp:
        writer = csv.DictWriter(tmp, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
        local_name = tmp.name
    s3_client = settings.get_s3_client()
    s3_client.upload_file(local_name, BUCKET_NAME, LABELING_CSV_KEY)


def find_row(rows: List[Dict[str, str]], original_s3_uri: str, bounding_box: List[float]) -> Optional[Dict[str, str]]:
    """
    Look up the row in CSV matching (original_s3_uri, bounding_box).
    bounding_box is a list of floats => we turn it into a string "x,y,w,h" 
    and compare to row["bounding_box"].
    """
    bb_str = ",".join(map(str, bounding_box))
    for r in rows:
        if r["original_s3_uri"] == original_s3_uri and r["bounding_box"] == bb_str:
            return r
    return None


def create_and_upload_crop(original_s3_uri: str, bounding_box: List[float]) -> str:
    """
    1) Download original_s3_uri => local.
    2) Crop it by bounding_box => local_cropped.jpg
    3) Insert minimal EXIF metadata
    4) Upload the cropped file to S3 => new S3 path => return that path
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        local_full = os.path.join(tmp_dir, "full.jpg")
        download_s3_uri(original_s3_uri, local_full)

        img = Image.open(local_full)
        xmin, ymin, xmax, ymax = bounding_box
        cropped = img.crop((xmin, ymin, xmax, ymax))

        base_name = os.path.basename(urlparse(original_s3_uri).path)
        new_name = f"{os.path.splitext(base_name)[0]}_{uuid.uuid4().hex}.jpg"
        local_crop = os.path.join(tmp_dir, new_name)
        cropped.save(local_crop, "JPEG")

        # Embed EXIF
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


def download_s3_uri(s3_uri: str, local_path: str):
    """
    Download an s3://... URI to a local path.
    """
    parsed = urlparse(s3_uri)
    bucket = parsed.netloc
    key = parsed.path.lstrip("/")
    s3_client = settings.get_s3_client()
    s3_client.download_file(bucket, key, local_path)


def upload_s3_uri(local_path: str, s3_uri: str):
    """
    Upload a local file to an s3://... URI.
    """
    parsed = urlparse(s3_uri)
    bucket = parsed.netloc
    key = parsed.path.lstrip("/")
    s3_client = settings.get_s3_client()
    s3_client.upload_file(local_path, bucket, key)


def embed_exif_metadata(input_path: str, output_path: str, metadata: Dict[str, Any]):
    """
    Write 'metadata' as a string to the Exif UserComment field 
    of a JPEG file, then save to output_path.
    """
    img = Image.open(input_path)
    try:
        exif_dict = piexif.load(img.info.get("exif", b""))
    except Exception:
        exif_dict = {"Exif": {}}

    user_comment = piexif.helper.UserComment.dump(str(metadata), encoding="unicode")
    exif_dict["Exif"][piexif.ExifIFD.UserComment] = user_comment
    exif_bytes = piexif.dump(exif_dict)
    img.save(output_path, "JPEG", exif=exif_bytes)


def generate_embeddings(crop_s3_uri: str) -> List[float]:
    """
    Download the crop from s3, run it through the CLIP model to get embeddings,
    return them as a list of floats.
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        local_file = os.path.join(tmp_dir, "crop.jpg")
        download_s3_uri(crop_s3_uri, local_file)

        with Image.open(local_file) as img:
            img_tensor = preprocess(img).unsqueeze(0).to(device)
            with torch.no_grad():
                emb = model.encode_image(img_tensor).cpu().numpy().flatten().tolist()
        return emb


def query_pinecone_for_top_match(
    embedding: List[float], exclude_s3_file_path: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Query Pinecone with the given embedding.
    
    If 'exclude_s3_file_path' is provided, this function retrieves the top 5 matches and
    returns the first match whose metadata's "s3_file_path" is not equal to exclude_s3_file_path.
    Otherwise, it returns the top match (top_k=1).
    
    Returns a dictionary of the form:
      {"score": float, "metadata": { ... }}
    or None if no valid match is found.
    """
    pinecone_index = settings.get_pinecone_index()
    top_k = 5 if exclude_s3_file_path else 1
    resp = pinecone_index.query(vector=embedding, top_k=top_k, include_metadata=True)
    matches = resp.get("matches", [])
    if matches:
        if exclude_s3_file_path:
            for match in matches:
                metadata = match.get("metadata", {})
                if metadata.get("s3_file_path", "") != exclude_s3_file_path:
                    return {"score": match["score"], "metadata": metadata}
            return None
        else:
            return {"score": matches[0]["score"], "metadata": matches[0]["metadata"]}
    return None
