# AI Data Generation Instructions for Brands & Product Catalogs

You can use the prompt below with any AI tool (like ChatGPT, Claude, etc.) to generate realistic brand and product catalog data. This data is designed to directly map to our Mongoose schemas (`Brand` and `BrandCatalogEntry`), making it easy to ingest into the database via a seed script.

---

## 📋 Copy-Paste Prompt for the AI Tool

Copy everything below the line and paste it into the AI tool.

***

**System Context:**
You are a data generation assistant for an e-commerce marketplace. Your task is to generate realistic, high-quality data for brands and their official product catalogs. The generated data must strictly adhere to the provided JSON schema so it can be easily ingested into a MongoDB database.

**Task:**
Please generate data for the brand **[INSERT BRAND NAME HERE, e.g., Nike]**. 
Create the brand details and a product catalog containing **[INSERT NUMBER, e.g., 4-5]** products.

**Requirements for the Data:**
1. **Brand Details:** Provide the brand's name, a compelling description, a realistic logo URL (use Unsplash source URLs or placeholder image services), the primary category, a list of protected keywords (e.g., trademarks), and the official website URL.
2. **Catalog Entries (Products):** For each product, generate:
   - `sku`: A realistic, unique alphanumeric SKU (e.g., "NIKE-AIR-MAX-97-WHT-10M").
   - `title`: The official product title.
   - `description`: A detailed, engaging product description.
   - `bulletPoints`: Exactly 3 to 5 key highlights/features (short sentences).
   - `officialImages`: An array of 2-3 realistic image URLs (use Unsplash source URLs with relevant keywords, e.g., `https://source.unsplash.com/800x800/?sneakers,white`).
   - `category`: The product category (should align with the brand's primary category).
   - `tags`: An array of 3-5 searchable keywords (e.g., `["running", "shoes", "men"]`).

**Output Format:**
You must output ONLY valid JSON. Do not include any conversational text or markdown formatting outside the JSON block.

**Expected JSON Schema:**
```json
{
  "brand": {
    "name": "String",
    "description": "String",
    "logoUrl": "String (URL)",
    "category": "String",
    "protectedKeywords": ["String", "String"],
    "website": "String (URL)"
  },
  "catalogEntries": [
    {
      "sku": "String (Uppercase alphanumeric)",
      "title": "String",
      "description": "String",
      "bulletPoints": ["String", "String"],
      "officialImages": ["String (URL)", "String (URL)"],
      "category": "String",
      "tags": ["String", "String"]
    }
  ]
}
```

***

## 💡 How to Ingest This Data

Once the AI generates the JSON, you can easily create a seed script or an API endpoint in the backend to insert this data. Here is the mapping logic:

1. **Brand Insertion:**
   - Map the `brand` object to the `Brand` model.
   - Assign an `ownerId` (e.g., an admin user or a newly created brand user).

2. **Catalog Entries Insertion:**
   - Iterate through `catalogEntries`.
   - Map each entry to the `BrandCatalogEntry` model.
   - Set `brandId` to the `_id` of the newly created `Brand`.
