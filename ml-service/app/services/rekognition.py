import boto3
from app.config import settings


class RekognitionService:
    def __init__(self):
        self.client = boto3.client(
            "rekognition",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )

    async def detect_labels(self, s3_bucket: str, s3_key: str, max_labels: int = 20) -> list:
        """
        Detect labels in an image stored in S3.
        Returns list of { Name, Confidence, Instances, Parents }
        TODO: implement in Phase 2
        """
        response = self.client.detect_labels(
            Image={"S3Object": {"Bucket": s3_bucket, "Name": s3_key}},
            MaxLabels=max_labels,
            MinConfidence=50.0,
        )
        return response.get("Labels", [])

    async def detect_moderation_labels(self, s3_bucket: str, s3_key: str) -> list:
        """
        Detect unsafe content in an image.
        TODO: implement in Phase 2
        """
        response = self.client.detect_moderation_labels(
            Image={"S3Object": {"Bucket": s3_bucket, "Name": s3_key}},
            MinConfidence=60.0,
        )
        return response.get("ModerationLabels", [])


rekognition_service = RekognitionService()
