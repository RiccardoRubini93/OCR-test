# OCR-test

This is a sample OCR (Optical Character Recognition) application. It allows you to upload an image and extracts the text within it using the OpenAI API.

## Features
- Upload an image
- Extract text from the image using OpenAI's API
- Simple REST API backend in Python (FastAPI)

## Project Structure
```
OCR-test/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── utils.py
└── README.md
```

## Setup Instructions

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd OCR-test
   ```

2. Set up the backend:
   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. Set your OpenAI API key as an environment variable:
   ```bash
   export OPENAI_API_KEY=your_openai_api_key
   ```

4. Run the backend server:
   ```bash
   uvicorn main:app --reload
   ```

5. Use the API endpoint `/ocr/` to upload an image and extract text. 