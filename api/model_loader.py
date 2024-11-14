import torch
import clip
from api.config import settings

device = "cuda" if torch.cuda.is_available() else "cpu"

# Load the model and set it to evaluation mode
model, preprocess = clip.load("ViT-B/32", device=device)
finetuned_weights_path = "/tmp/best_fine_tuned_clip_model.pth"

# Download fine-tuned weights from S3 if needed
s3_client = settings.get_s3_client()
s3_client.download_file("glacier-ml-training", "artifacts/dev/CLIP/finetuned/3/best_fine_tuned_clip_model.pth", finetuned_weights_path)
model.load_state_dict(torch.load(finetuned_weights_path, map_location=device, weights_only=True))
model.eval()  # Set the model to evaluation mode


def get_model():
    return model, device, preprocess
