# 🕵️‍♂️ Review Fraud Detection System: Solutions Breakdown

## 1. System Overview
An Amazon-style, end-to-end machine learning pipeline designed to detect fake, incentivized, and bot-generated reviews. The system prioritizes **explainability (White-box AI)** and **execution speed**, utilizing a hybrid architecture of Natural Language Processing (NLP), tabular machine learning, and structural graph analysis.

---

## 2. The Core ML Engine
The detection mechanism is split into three decoupled components that feed into a final ensemble model to generate a **Review Trust Score (0-100)**.

### A. NLP Text Analysis (DistilBERT)
* **Role:** Analyzes the semantic structure of the review text.
* **Target Patterns:** Copypasta, template spinning, extreme sentiment phrasing, and bot-generated text.
* **Implementation:** Pre-trained DistilBERT model fine-tuned on e-commerce datasets. Outputs a "Text Suspicion Score".
* *Hackathon Note:* Train on a free Colab T4 GPU, export the `.bin`/`.pt` weights, and run inference locally to save time.

### B. Graph Feature Extraction (NetworkX / Neo4j)
* **Role:** Maps the relationship between entities to catch coordinated fraud rings that look normal in isolation.
* **Nodes:** `User`, `Review`, `Product`, `Device/IP`.
* **Key Graph Features Extracted:**
    * *User-to-User Bipartite Projection:* Detects "co-reviewers" (users who review the exact same obscure products).
    * *Jaccard Similarity:* Measures the overlap of product review history between users.
    * *Clustering Coefficient:* Identifies dense, closed networks (e.g., Telegram review rings).
    * *Temporal Edge Deltas:* Flags bursts of connected activity (e.g., 50 connected users reviewing within 3 hours).

### C. The Decider: Explainable Ensemble (XGBoost)
* **Role:** Ingests standard metadata (timestamps, rating, verified purchase) + DistilBERT outputs + Graph Features to make the final prediction.
* **Why XGBoost?** Blazing fast on CPUs, handles tabular data perfectly, and most importantly, supports **SHAP values**.
* **Explainability:** Uses SHAP to generate a breakdown for the moderator (e.g., *"Flagged because: Graph User Similarity is in the 99th percentile (+40% fraud risk)"*).

---

## 3. System Architecture
A decoupled microservice architecture ensuring the heavy ML processing doesn't block the user interface.

* **Frontend (React/MERN):** * A "Moderator Dashboard" displaying a feed of incoming reviews.
    * Features a SHAP waterfall chart for the Explainable Trust Score.
    * Embeds a live node-graph visualization (D3.js or Neo4j Bloom) to visually prove fraud rings to judges.
* **Backend (Node.js/Express):** * Handles standard web CRUD, user auth, and routes data between the DB and the ML service.
* **ML Microservice (Python/FastAPI):** * Receives review payloads from Node.js.
    * Updates the in-memory NetworkX graph / queries Neo4j.
    * Runs DistilBERT inference and XGBoost prediction.
    * Returns the Trust Score and SHAP explanation.

---

## 4. Data Strategy
To ensure the system is buildable within a hackathon timeframe without scraping bottlenecks:

* **Primary Dataset:** **YelpChi / YelpRes**. Contains essential ground-truth labels (`filtered` vs `recommended`) for fake review detection, which Amazon datasets lack.
* **Secondary Dataset:** **UCSD Amazon Review Data**. For category-specific metadata and text patterns.
* **Scale Limitation:** Capped at **10,000 – 20,000 nodes** for the live demo to ensure instant local graph traversal and fast inference.

---

## 5. Threat Models & Mitigation Strategy
How the system addresses real-world attack vectors:

| Attacker Tier | Behavior | How We Catch Them |
| :--- | :--- | :--- |
| **Tier 1: Naive Bot** | Single IP, bursting 100 identical 5-star reviews on one product. | **Instant Block.** DistilBERT flags 100% text similarity. XGBoost flags IP-to-Review ratio. Graph shows a highly anomalous star-topology. |
| **Tier 2: Click Farm** | Real humans, staggered reviews over days, paraphrased text. | **Caught by Graph.** Text passes DistilBERT. Graph bipartite projection flags that 50 independent accounts share a 90% overlap in their product history. |
| **Tier 3: Sophisticated** | Aged accounts, clean residential IPs, LLM-generated text, verified purchases. | **Monitored / Gray Area.** Explores temporal anomalies in the graph (sudden shift in the user's historical review velocity) and flags the Seller for sudden spikes in conversion rates. |

---

## 6. The "Winning Edge" (Hackathon Pitch Focus)
1. **Explainable AI:** We don't just output a black-box score; our SHAP integration tells moderators *exactly* why a review is fake.
2. **Systemic over Isolated Detection:** By using graph features, we catch sophisticated rings that fool standard NLP text-checkers.
3. **Visual Proof:** A live graph UI that allows judges to physically "see" the fraud networks.