from PIL import Image
import piexif
import piexif.helper
import os


def add_metadata_to_user_comment(image_path, output_path, metadata):
    """
    Add custom metadata to the EXIF UserComment field of an image.

    Args:
        image_path (str): Path to the input image.
        output_path (str): Path to save the image with metadata.
        metadata (dict): The metadata to embed (e.g., original_s3_uri, s3_file_path, coordinates).
    """
    try:
        # Validate the image path
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image file not found: {image_path}")

        # Open the image
        img = Image.open(image_path)

        # Load existing EXIF data or create a new one
        try:
            exif_dict = piexif.load(img.info.get("exif", b""))
        except Exception as e:
            print(
                f"No existing EXIF data found. Initializing new EXIF data. Error: {e}"
            )
            exif_dict = {"Exif": {}}

        # Add metadata to the UserComment field
        user_comment = piexif.helper.UserComment.dump(str(metadata), encoding="unicode")
        exif_dict["Exif"][piexif.ExifIFD.UserComment] = user_comment

        # Dump the EXIF data back to bytes
        exif_bytes = piexif.dump(exif_dict)

        # Save the image with updated EXIF metadata
        img.save(output_path, "jpeg", exif=exif_bytes)
        print(f"Metadata added successfully to {output_path}")

    except Exception as e:
        print(f"Error adding metadata: {e}")


# Metadata to add
metadata = {
    "original_s3_uri": "s3://scanner-data.us-west-2/CV-021/2024/11/06/23/34/51-343122_0.jpg",
    "s3_file_path": "s3://glacier-ml-training/universal-db/AC_1205.jpg",
    "coordinates": [12.34, 56.78, 90.0, 0.0],
}

from PIL import Image
import piexif
import piexif.helper


def read_metadata_from_user_comment(image_path):
    """
    Read custom metadata from the EXIF UserComment field of an image.

    Args:
        image_path (str): Path to the image file.

    Returns:
        dict: Metadata extracted from the UserComment field.
    """
    try:
        # Open the image
        img = Image.open(image_path)

        # Load the EXIF data
        exif_dict = piexif.load(img.info.get("exif", b""))

        # Retrieve the UserComment field
        user_comment = exif_dict["Exif"].get(piexif.ExifIFD.UserComment, b"")

        if not user_comment:
            print("No UserComment field found in the image metadata.")
            return {}

        # Decode the UserComment field into a dictionary
        metadata = piexif.helper.UserComment.load(user_comment)
        print(f"Extracted metadata: {metadata}")
        return metadata

    except Exception as e:
        print(f"Error reading metadata: {e}")
        return {}


# Specify the input and output image paths
input_image = "/Users/barbiezoani/thesis/AC_1205.jpg"  # Ensure this file exists
output_image = "/Users/barbiezoani/thesis/output_with_metadata.jpg"

# Add metadata to the image
read_metadata_from_user_comment(output_image)
