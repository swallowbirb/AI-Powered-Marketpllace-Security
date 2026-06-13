from fastapi import APIRouter
from app.models.schemas import GradingRequest, GradingResponse

router = APIRouter()


@router.post("/", response_model=GradingResponse)
async def grade_item(request: GradingRequest):
    """
    Two-pass AI grading pipeline.
    Pass 1: Vision analysis (Rekognition + OpenCV)
    Pass 2: LLM reasoning (Bedrock Nova Pro)
    TODO: implement in Phase 2
    """
    raise NotImplementedError("Grading pipeline not yet implemented — Phase 2")
