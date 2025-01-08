import os
import boto3
from dotenv import load_dotenv
from pinecone import Pinecone

load_dotenv(".env.development")


class Settings:
    def __init__(self):
        # AWS
        self.s3_bucket_name = os.getenv("S3_BUCKET_NAME", "glacier-ml-training")
        self.default_region = os.getenv("AWS_REGION", "us-east-1")
        self.aws_access_key_id = os.getenv("AWS_ACCESS_KEY_ID")
        self.aws_secret_access_key = os.getenv("AWS_SECRET_ACCESS_KEY")
        self.s3_clients = {}  # Dictionary to cache clients by region

        # Pinecone services
        self.api_key = os.getenv("PINECONE_API_KEY")
        self.index_name = os.getenv("PINECONE_INDEX_NAME")
        self.k = int(os.getenv("PINECONE_TOP_K", 20))

        # Model path
        self.model_path = os.getenv("MODEL_PATH")
        self.model = os.getenv("MODEL")
        self.model_dim = int(os.getenv("MODEL_DIM", 512))

    def get_s3_client(self, region_name=None):
        """Get or create an S3 client for the specified region."""
        region_name = region_name or self.default_region

        # Check if a client for the region already exists
        if region_name not in self.s3_clients:
            self.s3_clients[region_name] = boto3.client(
                "s3",
                aws_access_key_id=self.aws_access_key_id,
                aws_secret_access_key=self.aws_secret_access_key,
                region_name=region_name,
            )

        return self.s3_clients[region_name]

    def get_pinecone_index(self):
        """
        Initialize and return the Pinecone index.
        """
        if not self.api_key or not self.index_name:
            raise ValueError("Pinecone API key or index name is not set.")

        pc = Pinecone(api_key=self.api_key, source_tag="pinecone:stl_sample_app")
        return pc.Index(self.index_name)

    def generate_presigned_url(self, s3_uri):
        if not s3_uri:
            return None

        path_without_prefix = s3_uri[5:]
        bucket_name, key = path_without_prefix.split("/", 1)

        region_name = (
            "us-east-1" if bucket_name == "glacier-ml-training"
            else "us-west-2" if bucket_name == "scanner-data.us-west-2"
            else self.default_region
        )

        s3_client = self.get_s3_client(region_name=region_name)

        return s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket_name, "Key": key},
            ExpiresIn=3600,
        )


settings = Settings()
