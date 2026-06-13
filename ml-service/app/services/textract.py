import boto3
from app.config import settings


class TextractService:
    def __init__(self):
        self.client = boto3.client(
            "textract",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )

    async def extract_text(self, s3_bucket: str, s3_key: str) -> list:
        """
        Extract text blocks from a document/image in S3.
        Returns list of { BlockType, Text, Confidence }
        TODO: implement in Phase 2 for receipt/tag scanning
        """
        response = self.client.detect_document_text(
            Document={"S3Object": {"Bucket": s3_bucket, "Name": s3_key}},
        )
        blocks = response.get("Blocks", [])
        return [b for b in blocks if b.get("BlockType") == "LINE"]


textract_service = TextractService()
