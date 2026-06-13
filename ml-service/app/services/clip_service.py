"""
CLIP embedding service for image-text similarity.
Used in Phase 2 for counterfeit detection and product matching.
TODO: implement when CLIP model is available — Phase 2
"""


class CLIPService:
    def __init__(self):
        self.model = None  # TODO: load CLIP model

    async def get_image_embedding(self, image_bytes: bytes) -> list:
        """Returns a 512-dim CLIP embedding for the image."""
        raise NotImplementedError("CLIP service not yet implemented — Phase 2")

    async def compute_similarity(self, embedding1: list, embedding2: list) -> float:
        """Cosine similarity between two embeddings."""
        raise NotImplementedError("CLIP service not yet implemented — Phase 2")

    async def match_to_catalog(self, image_bytes: bytes, catalog_embeddings: list) -> dict:
        """
        Find the closest matching product in the brand catalog.
        Returns { productId, similarity_score }
        """
        raise NotImplementedError("CLIP service not yet implemented — Phase 2")


clip_service = CLIPService()
