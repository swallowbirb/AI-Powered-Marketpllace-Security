# Phase 3: Marketplace Platform Foundation (v2.67)

**Goal:** Build a functional e-commerce marketplace (Amazon-inspired) with a dedicated authority model optimized for AI Fraud Detection. The platform must allow realistic fraudulent actions (like counterfeit listings and fake reviews) so the AI layers can catch them.

---

## 🔑 Authority & Honeypot Model

### 1. The Seller (The Potential Fraudster)
- **Authority:** Can create `Products`.
- **The Catch:** Sellers define a `brandName` string freely. They do NOT select from a dropdown. This allows a bad seller to type "Nike" even if they aren't authorized.
- **AI Hook:** This creates the "Counterfeit Honeypot." If a seller lists a "Nike" product without an approved `BrandEnrollment`, the AI flags it.

### 2. The Brand (The IP Owner)
- **Authority:** Can register a `Brand` profile (Name, Logo, Protected Keywords).
- **Authority:** Can approve or reject `BrandEnrollment` requests from Sellers who want to be authorized resellers.
- **AI Hook:** Acts as the ground truth for counterfeit detection.

### 3. The Buyer (The Fake Review Vector)
- **Authority:** Can purchase products (simulated) and leave reviews.
- **AI Hook:** NLP and Graph AI analyze buyer activity to detect "Review Rings" padding generic seller products.

---

## 📊 Database Schema Migration

### 1. User Model (`user.model.js`) - MODIFY
- `role`: add 'brand'
- `profileImageUrl`, `storeName`, `storeDescription`
- `reviewCount`, `totalReviewsReceived`, `averageRating`

### 2. Product Model (`product.model.js`) - MODIFY
- `images`: [String] (For MLLM logo detection)
- `brandName`: String (Seller's claim)
- `brandId`: ObjectId (If explicitly linked)
- `condition`: String enum ['New', 'Used'] (Prevents used items from triggering strict brand gates)
- `averageRating`, `reviewCount`, `totalSales`, `salesVelocity`

### 3. Review Model (`review.model.js`) - NEW
- `productId`, `buyerId`, `sellerId`
- `rating`, `title`, `text`
- `isVerifiedPurchase`: Boolean
- AI Fields: `reviewRS`, `isFlagged`, `flagReasons`, `ipAddress`

### 4. Order Model (`order.model.js`) - NEW
- `buyerId`, `sellerId`, `productId`
- `quantity`, `totalPrice`, `status`

### 5. Brand Model (`brand.model.js`) - NEW
- `name`, `ownerId`, `logoUrl`, `protectedKeywords`
- `isVerified`: Boolean (Default false, Admin must approve. Auto-true for demo).

### 6. Brand Enrollment Model (`brandEnrollment.model.js`) - NEW
- `brandId`, `sellerId`
- `status`: ['pending', 'approved', 'rejected']
- `appliedAt`, `reviewedAt`
- *Note: Rejecting an enrollment should trigger a check on active products.*

---

## 🏗️ Implementation Subphases

### Subphase 1: Backend Database & Models
- Update `User` and `Product` models.
- Create `Review`, `Order`, `Brand`, `BrandEnrollment` models.

### Subphase 2: Backend Review & Order Modules
- CRUD endpoints for Reviews.
- Lightweight Order creation endpoints (to trigger verified purchases).

### Subphase 3: Backend Brand & Enrollment Modules
- Endpoints for registering a Brand.
- Endpoints for Sellers to apply (`POST /api/brands/:id/enroll`).
- Endpoints for Brands to approve/reject (`PATCH /api/brands/:id/enrollments/:enrollmentId`).

### Subphase 4: Admin & Endpoint Updates
- Admin review moderation endpoints.
- Product search endpoint with filtering.
- Public Store page endpoint.

### Subphase 5: Frontend Core & Layout
- Amazon-style Navbar (search, category dropdown).
- `MarketplaceLayout` wrapper.

### Subphase 6: Frontend Public Pages
- `HomePage` (Categories, Featured Products).
- `SearchResultsPage` (Filters, Sorting, Grid).
- `ProductDetailPage` (Images, Details, Reviews, "Buy Now").
- `StorePage` (Seller's public profile).

### Subphase 7: Frontend Dashboards & Workflows
- `BrandDashboard` (Enrollment Requests, Enrolled Sellers, Products).
- `SellerDashboard` (Request Brand Auth tab, Trust Score).
- Auth updates (Role selection for Brand).
