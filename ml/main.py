from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional
from sentence_transformers import SentenceTransformer, util
import difflib

app = FastAPI(title="AI Trust & Safety ML Service")

# Load lightweight SBERT model
print("Loading sentence-transformers model...")
model = SentenceTransformer('all-MiniLM-L6-v2')
print("Model loaded successfully.")

class CatalogEntry(BaseModel):
    id: str
    title: str
    description: str
    officialImages: List[str]

class BrandInfo(BaseModel):
    id: str
    name: str
    protectedKeywords: List[str]
    catalogEntries: List[CatalogEntry]

class ProductAnalysisRequest(BaseModel):
    productId: str
    title: str
    description: str
    brandName: Optional[str] = None
    images: List[str] = []
    category: str
    brands: List[BrandInfo]

class ProductAnalysisResponse(BaseModel):
    productRS: int
    riskLevel: str
    matchedBrandId: Optional[str] = None
    matchedCatalogEntryId: Optional[str] = None
    catalogMatchScore: Optional[int] = None

@app.get("/health")
def health_check():
    return {"status": "ok", "model": "all-MiniLM-L6-v2 loaded"}

def compute_string_similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()

@app.post("/ml/analyze-product", response_model=ProductAnalysisResponse)
def analyze_product(req: ProductAnalysisRequest):
    matched_brand = None
    max_brand_score = 0.0
    
    if req.brandName:
        for brand in req.brands:
            score = compute_string_similarity(req.brandName, brand.name)
            if score > max_brand_score:
                max_brand_score = score
                matched_brand = brand
            
            for kw in brand.protectedKeywords:
                kw_score = compute_string_similarity(req.brandName, kw)
                if kw_score > max_brand_score:
                    max_brand_score = kw_score
                    matched_brand = brand

    is_brand_match = max_brand_score > 0.8
    
    best_catalog_entry = None
    best_catalog_score = 0.0
    
    if is_brand_match and matched_brand and matched_brand.catalogEntries:
        product_emb = model.encode(req.description, convert_to_tensor=True)
        for entry in matched_brand.catalogEntries:
            entry_emb = model.encode(entry.description, convert_to_tensor=True)
            cosine_scores = util.cos_sim(product_emb, entry_emb)
            score = cosine_scores[0][0].item()
            
            if score > best_catalog_score:
                best_catalog_score = score
                best_catalog_entry = entry

    image_cloned = False
    if best_catalog_entry and req.images:
        official_images = set(best_catalog_entry.officialImages)
        for img in req.images:
            if img in official_images:
                image_cloned = True
                break

    product_rs = 0
    if is_brand_match:
        product_rs += 30
        
    catalog_match_score = int(best_catalog_score * 100) if best_catalog_entry else 0
    if catalog_match_score > 85:
        product_rs += 50
    elif catalog_match_score > 60:
        product_rs += 30
        
    if image_cloned:
        product_rs += 40
        
    product_rs = min(product_rs, 100)
    
    if product_rs >= 70:
        risk_level = "high"
    elif product_rs >= 40:
        risk_level = "medium"
    else:
        risk_level = "low"
        
    return ProductAnalysisResponse(
        productRS=product_rs,
        riskLevel=risk_level,
        matchedBrandId=matched_brand.id if matched_brand else None,
        matchedCatalogEntryId=best_catalog_entry.id if best_catalog_entry else None,
        catalogMatchScore=catalog_match_score if best_catalog_entry else None
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
