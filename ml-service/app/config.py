from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    aws_region: str = "ap-south-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    bedrock_region: str = "us-east-1"
    bedrock_model_primary: str = "amazon.nova-pro-v1:0"
    bedrock_model_fallback: str = "anthropic.claude-3-5-sonnet-20241022-v2:0"
    s3_bucket_name: str = ""
    kms_key_id: str = ""
    ml_service_url: str = "http://localhost:8000"

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
