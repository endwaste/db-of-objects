import pytest
from fastapi.testclient import TestClient
from api.index import app

client = TestClient(app)


@pytest.fixture
def mock_image():
    from io import BytesIO
    from PIL import Image

    img = Image.new("RGB", (100, 100), color="red")
    img_bytes = BytesIO()
    img.save(img_bytes, format="JPEG")
    img_bytes.seek(0)
    return img_bytes


def test_add_new_data(mock_image, monkeypatch):
    """
    Test the /new endpoint.
    """

    def mock_get_s3_client():
        class MockS3Client:
            def download_file(self, bucket, key, filename):
                raise Exception("NoSuchKey")

            def upload_file(self, filename, bucket, key):
                pass

        return MockS3Client()

    def mock_upsert(vector):
        pass

    monkeypatch.setattr("api.config.settings.get_s3_client", mock_get_s3_client)
    monkeypatch.setattr("api.endpoints.new.index.new", mock_upsert)

    data = {
        "color": "red",
        "material": "plastic",
        "brand": "TestBrand",
        "shape": "cylinder",
        "s3_uri": "s3://scanner-data.us-west-2/CV-021/2024/11/06/23/34/51-343122_0.jpg",
        "coordinates": [12.34, 56.78, 90.12, 34.56],
    }

    files = {"image": ("test_image.jpg", mock_image, "image/jpeg")}

    response = client.post("/new", data=data, files=files)

    assert response.status_code == 200
    json_response = response.json()
    assert json_response["status"] == "success"
    assert "timestamp" in json_response["data"]
    assert json_response["data"]["s3_uri"] == data["s3_uri"]
