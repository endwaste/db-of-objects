import torch
import clip
# from ultralytics import YOLO
from api.config import settings

device = "cuda" if torch.cuda.is_available() else "cpu"


def get_clip_model():
    weights_path = settings.model_path
    clip_model = settings.model

    model, preprocess = clip.load(clip_model, device=device)
    finetuned_weights_path = "/tmp/best_fine_tuned_clip_model.pth"

    s3_client = settings.get_s3_client()
    s3_client.download_file("glacier-ml-training", weights_path, finetuned_weights_path)
    model.load_state_dict(torch.load(finetuned_weights_path, map_location=device, weights_only=True))
    model.eval()

    return model, device, preprocess


model, device, preprocess = get_clip_model()


# def get_detect_anything_model():
#     bucket_name = "glacier-ml-training"
#     object_key = "artifacts/dev/DETECT-ANYTHING/YOLOV11M_1280/cleaned/best.pt"
#     local_path = "/tmp/ultralytics_weights.pt"

#     s3_client = settings.get_s3_client()
#     s3_client.download_file(bucket_name, object_key, local_path)

#     detect_model = YOLO(local_path).to(device)
#     return detect_model