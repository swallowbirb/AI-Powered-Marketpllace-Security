import json
import boto3
from app.config import settings


class BedrockService:
    def __init__(self):
        self.client = boto3.client(
            "bedrock-runtime",
            region_name=settings.bedrock_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )
        self.primary_model = settings.bedrock_model_primary
        self.fallback_model = settings.bedrock_model_fallback

    async def invoke(self, prompt: str, model_id: str = None, max_tokens: int = 2048) -> str:
        """
        Invoke a Bedrock model with a text prompt.
        Falls back to secondary model on failure.
        TODO: implement streaming support
        """
        model = model_id or self.primary_model
        body = json.dumps({
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "anthropic_version": "bedrock-2023-05-31",
        })

        try:
            response = self.client.invoke_model(
                modelId=model,
                contentType="application/json",
                accept="application/json",
                body=body,
            )
            result = json.loads(response["body"].read())
            return result["content"][0]["text"]
        except Exception as e:
            if model != self.fallback_model:
                # retry with fallback
                return await self.invoke(prompt, self.fallback_model, max_tokens)
            raise e


bedrock_service = BedrockService()
