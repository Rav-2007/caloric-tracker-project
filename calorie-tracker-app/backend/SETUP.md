# Backend Setup Guide

## Prerequisites

- Python 3.11 or later
- pip

## 1. Create and activate a virtual environment

```bash
# From the calorie-tracker-app/backend/ directory

# Create the venv
python3 -m venv .venv

# Activate it (Linux / macOS)
source .venv/bin/activate

# Activate it (Windows PowerShell)
.venv\Scripts\Activate.ps1
```

## 2. Install dependencies

```bash
pip install -r requirements.txt
```

## 3. Configure environment variables

```bash
cp .env.example .env
# Edit .env and fill in your Supabase and Gemini credentials
```

## 4. Run the development server

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`.
Interactive docs are at `http://localhost:8000/docs`.

## Deactivating the venv

```bash
deactivate
```
