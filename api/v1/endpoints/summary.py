from fastapi import APIRouter, HTTPException
import csv
import tempfile
import os
from api.config import settings

router = APIRouter()

@router.get("/summary")
async def get_summary():
    """
    Returns a summary of the database by extracting and aggregating metadata
    from the metadata CSV stored in S3, with brand names unified and only
    including rows with a status of "active".
    """
    s3_client = settings.get_s3_client()
    bucket_name = settings.s3_bucket_name
    csv_key = "universal-db/metadata.csv"

    with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
        tmp_filename = tmp_file.name

    try:
        s3_client.download_file(bucket_name, csv_key, tmp_filename)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error downloading CSV from S3: {str(e)}"
        )

    total_crops = 0
    color_counts = {}
    material_counts = {}
    brand_counts_raw = {}
    shape_counts = {}
    robot_counts = {}
    status_counts = {}
    modifier_counts = {}

    try:
        with open(tmp_filename, "r", encoding="utf-8") as csvfile:
            first_line = open(tmp_filename, "r", encoding="utf-8").readline()
            delimiter = "\t" if "\t" in first_line else ","
            csvfile.seek(0)

            reader = csv.DictReader(csvfile, delimiter=delimiter)
            for row in reader:
                # Get and normalize the status
                status = row.get("status", "").strip()
                if status.lower() != "active":
                    continue  # Skip rows that are not active

                # Process only active rows
                total_crops += 1

                # Color
                color = row.get("color", "").strip()
                if color:
                    color_counts[color] = color_counts.get(color, 0) + 1

                # Material
                material = row.get("material", "").strip()
                if material:
                    material_counts[material] = material_counts.get(material, 0) + 1

                # Shape
                shape = row.get("shape", "").strip()
                if shape:
                    shape_counts[shape] = shape_counts.get(shape, 0) + 1

                # Robot
                robot = row.get("robot", "").strip()
                if robot:
                    robot_counts[robot] = robot_counts.get(robot, 0) + 1

                # Status (only active rows are processed, so this will always be "active")
                status_counts["active"] = status_counts.get("active", 0) + 1

                # Brand (normalize to lowercase for counting)
                brand = row.get("brand", "").strip()
                if brand:
                    brand_lower = brand.lower()
                    brand_counts_raw[brand_lower] = brand_counts_raw.get(brand_lower, 0) + 1

                # Modifiers (comma-separated)
                modifiers = row.get("modifier", "").strip()
                if modifiers:
                    for m in modifiers.split(","):
                        m_clean = m.strip()
                        if m_clean:
                            modifier_counts[m_clean] = modifier_counts.get(m_clean, 0) + 1

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing CSV file: {str(e)}"
        )
    finally:
        os.remove(tmp_filename)

    # Unify brand names by case
    brand_counts_final = {}
    for b_lower, count in brand_counts_raw.items():
        # Convert normalized brand name to Title Case, e.g. "pepsi" -> "Pepsi"
        brand_title = b_lower.title()
        brand_counts_final[brand_title] = brand_counts_final.get(brand_title, 0) + count

    summary = {
        "totalCrops": total_crops,
        "colorCounts": color_counts,
        "materialCounts": material_counts,
        "brandCounts": brand_counts_final,
        "shapeCounts": shape_counts,
        "robotCounts": robot_counts,
        "statusCounts": status_counts,
        "modifierCounts": modifier_counts,
    }

    return summary
