import os
from dotenv import load_dotenv
from pinecone import Pinecone

# Load environment variables from .env.development
load_dotenv(".env.development")

# Access the Pinecone API key and environment
pinecone_api_key = os.getenv("PINECONE_API_KEY")

pc = Pinecone(api_key=pinecone_api_key)

index_name = "db-of-objects"
# Delete all vectors in the index
index = pc.Index(index_name)
index.delete(delete_all=True)
print(f"All vectors in the index '{index_name}' have been deleted.")
