# Phase 3: Marketplace Platform Foundation (v3.43)

**Goal:** Accurately simulate Amazon's Brand/Seller/Product authority model — including the ASIN Catalog system, Brand Content ownership, and the multi-seller offer model — to maximize the realism of fraud attack surfaces and AI detection hooks.

---

## 🏗️ The Amazon Model: Research Summary

### How Amazon Actually Works (The Foundation of This Plan)

**1. The ASIN Catalog: One Product, One Page**
Amazon's core principle is "One Unique Item = One Detail Page." This is the ASIN (Amazon Standard Identification Number).
- A brand creates an ASIN for "Nike Air Max 97 — Men's — Size 10 — White."
- Every seller who sells that exact item **lists an Offer against that ASIN**, NOT a separate product page.
- The detail page (title, images, description) is **catalog data**, owned by the brand.
- The seller's data (price, quantity, shipping, seller name) is **offer data**, owned by the seller.
- Multiple offers compete for the "Buy Box" (the primary Add to Cart button).

**2. Content Authority Hierarchy**
Who controls what appears on the detail page is a ranked hierarchy:
1. **Amazon Retail (1P)** — Highest. If Amazon sells it, Amazon owns the page.
2. **Brand Registry Owner** — Controls title, images, description, bullet points for their brand's ASINs.
3. **Buy Box Winner** — Can influence some attributes if the ASIN is not brand-registered.
4. **Any Seller** — Can submit "contributions" but they are overridden by higher ranks.

**3. The Counterfeit Attack Vector**
- A fraudster seller cannot change the brand name on an existing ASIN (locked by Brand Registry).
- **BUT:** They can create a *new* ASIN claiming to be a Nike product with fake images/description.
- OR they can list on a real Nike ASIN but ship a counterfeit item.
- **Image/text similarity** between a seller's new product and the brand's catalog entry is the primary AI signal for detecting counterfeits. We'll implement this later!

**4. A+ Content (Brand Official Content)**
Brands can submit a rich content package per product:
- Official hero image (pure white background)
- Gallery images (lifestyle, detail shots, infographics)
- Official title, bullet points, description
- Brand Story section
This is the **ground truth** that AI compares against seller-submitted content.

---

## 🔑 Authority Model (v3.43)

```
BRAND (IP Owner)
├── Registers Brand Profile (name, logo, keywords)
├── Creates Brand Catalog Entries (=ASINs)
│   ├── Official title, description, images → "Brand Content"  
│   └── Protected — only the brand can edit
│
SELLER (3P Reseller)
├── Creates Offers against existing Catalog Entries (legitimate)
│   ├── Sets: price, quantity, condition, shipping
│   └── Inherits: title, images, description from Brand Content
│
├── OR: Creates a new Product with a brand name claim (FRAUD VECTOR)
│   ├── Uses brandName field freely: "Nike Air Max"
│   ├── Uploads their own images/description
│   └── AI: Cross-references against Brand Catalog → flags mismatch
│
BUYER
└── Purchases from the cheapest/fastest Offer on a Catalog Entry
    └── Reviews the Catalog Entry (product), not the seller
```

---

## 📊 Database Schema Changes (v3.43)

### 1. NEW: `BrandCatalogEntry` Model (`brandCatalogEntry.model.js`)
The **ground truth** for what a brand's product actually looks like. This is the AI's reference dataset.

```
brandId: ObjectId → Brand
sku: String (unique per brand, e.g. "AIR-MAX-97-WHT-10M")
title: String (official product title)
description: String (official description)
bulletPoints: [String] (official key features, max 5)
officialImages: [String] (official image URLs — hero + gallery)
category: String
tags: [String] (searchable, e.g. ["running", "white", "men"])
isActive: Boolean
```
**AI Hook:** The `officialImages` and `description` are the fingerprint. Any seller product with claimed `brandName` = this brand gets compared to these.

### 2. NEW: `SellerOffer` Model (`sellerOffer.model.js`)
Separates "offer data" (seller-specific) from "catalog data" (brand-controlled). This is the Amazon 3P model.

```
catalogEntryId: ObjectId → BrandCatalogEntry
sellerId: ObjectId → User
price: Number
condition: String enum ['New', 'Used', 'Refurbished']
quantity: Number (default 1 for simulation)
status: String enum ['active', 'inactive', 'flagged']
shippingNote: String (optional)
isBuyBoxWinner: Boolean (computed — lowest price among active offers)
```
**AI Hook:** Multiple offers on one catalog entry → velocity/pricing anomaly detection.

### 3. MODIFY: `Product` Model
`Product` now represents a **seller-created listing with a brand name claim** (the honeypot path). These are NOT offers on catalog entries. They are standalone products where the seller typed a brand name freely.

Add fields:
- `brandName`: String (seller's free-text brand claim — the honeypot field)
- `claimedCatalogEntryId`: ObjectId → BrandCatalogEntry (nullable — set if AI auto-matches to a catalog entry)
- `catalogMatchScore`: Number (0-100, AI-assigned similarity to the claimed brand's catalog)
- Remove/deprecate: `brand` field → rename to `brandName` for clarity

### 4. MODIFY: `Brand` Model  
Add fields:
- `catalogEntryCount`: Number (denormalized, updated on create/delete)
- `website`: String (optional, for verification)

### 5. MODIFY: `Order` Model
Add field:
- `offerId`: ObjectId → SellerOffer (nullable — populated if the order was placed via a catalog offer, not a standalone product)

---

## 🏗️ Implementation Subphases (v3.43)

### Subphase 1: Brand Catalog Backend
**New module:** `src/modules/brandCatalog/`
- `brandCatalogEntry.model.js` — schema above
- `brandCatalogEntry.service.js`:
  - `createCatalogEntry(brandId, ownerId, data)` — brand creates a product entry
  - `getCatalogEntriesByBrand(brandId)` — list all entries for a brand
  - `getCatalogEntryById(entryId)` — get single entry (public)
  - `updateCatalogEntry(entryId, brandId, ownerId, data)` — brand edits (auth check)
  - `deleteCatalogEntry(entryId, brandId, ownerId)` — soft delete
- `brandCatalogEntry.controller.js` — thin wrapper
- `brandCatalogEntry.routes.js`:
  - `POST   /api/brand-catalog` — brand creates entry
  - `GET    /api/brand-catalog?brandId=` — public: list entries by brand
  - `GET    /api/brand-catalog/:id` — public: single entry
  - `PATCH  /api/brand-catalog/:id` — brand updates (auth: must own brand)
  - `DELETE /api/brand-catalog/:id` — brand deletes (auth: must own brand)
- `brandCatalogEntry.validation.js`

### Subphase 2: Seller Offer Backend
**New module:** `src/modules/offers/`
- `sellerOffer.model.js` — schema above
- `sellerOffer.service.js`:
  - `createOffer(sellerId, data)` — seller creates offer on an existing catalog entry
  - `getOffersByCatalogEntry(catalogEntryId)` — all competing offers for one product
  - `getOffersBySeller(sellerId)` — seller's own offers
  - `updateOffer(offerId, sellerId, data)` — seller updates price/condition
  - `recomputeBuyBox(catalogEntryId)` — sets `isBuyBoxWinner` on lowest-price active offer
- `sellerOffer.controller.js`
- `sellerOffer.routes.js`:
  - `POST   /api/offers` — seller creates offer
  - `GET    /api/offers?catalogEntryId=` — public: all offers for a product
  - `GET    /api/offers/my` — seller: my offers
  - `PATCH  /api/offers/:id` — seller updates offer
  - `DELETE /api/offers/:id` — seller removes offer
- `sellerOffer.validation.js`

### Subphase 3: Catalog-Aware Product Page
- Update `product.service.js → getProductById()` to also populate `claimedCatalogEntryId`
- Update `product.service.js → searchProducts()` to optionally filter by `brandName`
- Update `product.validation.js` to rename `brand` → `brandName`

### Subphase 4: Order System Update
- Update `order.service.js → createOrder()` to handle two paths:
  1. **Catalog path:** `{ catalogEntryId, offerId }` — buys from a specific seller's offer
  2. **Standalone path:** `{ productId }` — buys from a standalone seller product (existing behavior)
- Update `order.model.js` to add `offerId` field

### Subphase 5: Admin Dashboard Enhancement
- Add new stats: total catalog entries, offers per entry
- Surface `catalogMatchScore` on product listings view

### Subphase 6: Brand Dashboard — Catalog Manager Tab
**In `BrandDashboard.jsx`**, add a 4th tab: **"Product Catalog"**
- List all catalog entries for the brand
- Button: "Add Product to Catalog" → modal form (title, description, bullet points, images)
- Each entry row: shows title, SKU, image thumbnail, active offers count
- Button: "Edit" — inline edit form
- **AI Preview section** (placeholder for Phase 4): "Similarity check against this entry will be automated"

### Subphase 7: SellerDashboard — Two Listing Modes
**In `SellerDashboard.jsx`**, update "New Listing" flow to present a choice:
1. **"List on an Existing Brand Product"** (Legitimate path)
   - Search/browse Brand Catalog Entries
   - Select one → fill in price, condition, quantity → creates a `SellerOffer`
   - Product detail page content is inherited from Brand Catalog
2. **"Create an Independent Listing"** (Honeypot path / for unbranded products)
   - Existing `NewProductPage.jsx` flow
   - `brandName` field is a free-text warning: "If you claim a registered brand name, your listing will be automatically cross-referenced against that brand's catalog."

### Subphase 8: Public Product Detail Page (ASIN-style)
**Refactor `ProductDetailPage.jsx`** to support the two content types:
- **Catalog Entry View** (`/catalog/:entryId`):
  - Content: from `BrandCatalogEntry` (brand-controlled, authoritative)
  - Seller list: "Available from X sellers" → shows offer list with prices
  - Buy Box: highlights cheapest active offer
- **Standalone Product View** (`/products/:id`):
  - Content: from `Product` (seller-controlled)
  - Shows `catalogMatchScore` warning badge if `claimedCatalogEntryId` is set and score is low
  - Single seller, no competing offers

### Subphase 9: New Frontend Routes
```jsx
/catalog/:entryId       — Brand Catalog Entry detail page (ASIN-style)
/catalog/:entryId/offers — All seller offers for a catalog entry
/seller/new-offer       — Seller creates a new offer on a catalog entry
```

---

## 🧠 AI Hooks Added by This Architecture

| Signal | Where | Fraud Type Detected |
|--------|--------|---------------------|
| `brandName` mismatch vs `Brand.name` | Product creation | Typosquatting (Nike → Mike) |
| Image similarity: `Product.images` vs `BrandCatalogEntry.officialImages` | AI Phase 4 | Counterfeit with stolen images |
| Text similarity: `Product.description` vs `BrandCatalogEntry.description` | AI Phase 4 | Counterfeit with copied content |
| `catalogMatchScore` < threshold + `brandName` = registered brand | Admin/AI | Auto-flag counterfeit candidates |
| Multiple offers with identical pricing patterns on same `catalogEntryId` | AI Phase 4 | Coordinated listing manipulation |
| Offer price drastically below average (`salesVelocity` spike) | AI Phase 4 | Bait-and-switch counterfeit |

---

## 🚨 Open Questions Before Implementation

1. **Catalog Entry page URL**: Use `/catalog/:entryId` or `/p/:entryId`? Amazon uses `/dp/ASIN`. Suggest `/p/:entryId` for clarity. => Anything is fine.
2. **Seller Offer vs. Standalone Product coexistence**: Should a seller who creates a standalone "Nike Air Max" product be shown alongside the brand's official catalog entry on search? Suggest: Yes — but the standalone product gets a "Unverified Brand Claim" warning badge, and the catalog entry ranks higher. => Yes, but no need for unverified brand claim, our AI will remove this!
3. **Who creates the first catalog entry for a brand-new product?** On real Amazon: the brand creates it. Suggests we keep this strictly brand-only to maintain the fraud detection surface. => LLike amazon!
4. **Image hosting**: Currently using image URLs. Should we add a field for AI-processable image hashes (perceptual hashing for similarity)? Suggest: Add `imageHashes: [String]` to `BrandCatalogEntry` as a stub for Phase 4 AI. => Nah just images is fine for now!
5. **BuyBox simulation logic**: Should BuyBox winner be recalculated on every offer update, or periodically? Suggest: On every offer create/update for simplicity. => On every offer update!

---

## ✅ Bug Fixes (Completed Before v3.43 Planning)
- **`ProductDetailPage.jsx` crash**: Fixed missing `Star` import from `lucide-react` (was causing component error on empty reviews state).
- **Store page**: Endpoint `GET /api/users/:id/store` confirmed working. Issue was the frontend `Star` crash occurring before the page rendered correctly.
