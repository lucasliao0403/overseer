# Overseer

## Overview

Overseer filters hiring data for fairness.

Users input source data, such as resumes or text-based records, which are then transformed into text embeddings to capture the semantic meaning of the text. Next, clusters are identified and an LLM (Cohere CMD-A) extracts common traits that define each group. Finally, we prune over-concentrated sections to ensure that no dominant category skews the dataset, leading to a more balanced and representative distribution.

See our [Devpost](https://devpost.com/software/overseer-vn8fpc) for more information.

## Tech Stack

- Flask
- Next.js
- Cohere CMD-A
- NumPy
- Pandas

## Setup

1.  **Environment Variables:**

    - Create a `.env` file in the root directory.
    - Add your Cohere API key: `COHERE_API_KEY=your_api_key_here`

2.  **Backend (Flask):**

    - Navigate to the backend directory: `cd api`
    - Create and activate a virtual environment (optional but recommended):
      ```bash
      python -m venv venv
      source venv/bin/activate  # On Windows use `venv\Scripts\activate`
      ```
    - Install dependencies: `pip install -r requirements.txt`
    - Run the Flask app: `python flask_app.py`
    - The backend will be running at `http://127.0.0.1:5000` (or the port specified in the app).

3.  **Frontend (Next.js):**
    - Navigate back to the root directory: `cd ..` (if you are in `api/`)
    - Install dependencies: `npm install`
    - Run the development server: `npm run dev`
    - The frontend will be available at `http://localhost:3000`.
