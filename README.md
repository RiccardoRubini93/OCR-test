# OCR AI Platform

A modern, AI-powered OCR (Optical Character Recognition) platform that extracts text from images using various AI providers including OpenAI, Gemini, and Ollama.

## Features

### 🚀 Core OCR Capabilities
- **Multi-Provider Support**: Choose between OpenAI, Gemini, or Ollama for text extraction
- **Drag & Drop Interface**: Intuitive file upload with drag-and-drop support
- **Real-time Preview**: See your image before processing
- **Multiple Output Formats**: Copy extracted text to clipboard instantly

### 📁 Project Management (NEW!)
- **Organized Workflows**: Group related documents into projects
- **Clear Context**: Understand what you're working on at a glance
- **Easy Switching**: Switch between projects seamlessly
- **Project Descriptions**: Add context and purpose to your projects

### 🔍 Advanced Features
- **Similarity Search**: Find similar texts across your documents
- **Text Querying**: Search through extracted text content
- **Statistics & Analytics**: Get insights into your document processing
- **Text Summarization**: Generate summaries of your documents

## Project Management Guide

### Why Use Projects?
Projects help you organize your OCR work by grouping related documents together. Perfect for:

- 📄 **Receipt Analysis**: Process expense receipts and invoices
- 📚 **Document Processing**: Extract text from contracts, forms, or reports  
- 📝 **Handwriting Recognition**: Convert handwritten notes to digital text
- 🔍 **Research Projects**: Organize research materials and findings

### How to Use Projects

1. **Create a Project**: Click "New Project" and give it a descriptive name
2. **Add Description**: Optionally describe what the project is for
3. **Select Project**: Choose your project from the dropdown
4. **Process Documents**: All OCR results will be associated with your project
5. **Switch Projects**: Easily switch between different projects as needed

### Project Benefits
- **Organized Storage**: Keep related documents together
- **Better Search**: Find documents within specific projects
- **Context Awareness**: Always know what you're working on
- **Efficient Workflow**: Streamline your document processing

## Getting Started

### Prerequisites
- Docker and Docker Compose
- OpenAI API key (optional)
- Gemini API key (optional)
- Ollama (optional, for local AI processing)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd OCR-test
   ```

2. **Set up environment variables**
   ```bash
   export OPENAI_API_KEY="your-openai-key"
   export GEMINI_API_KEY="your-gemini-key"
   ```

3. **Start the platform**
   ```bash
   docker-compose up --build
   ```

4. **Access the application**
   - Frontend: http://localhost:3003
   - Backend API: http://localhost:8000

## Architecture

- **Frontend**: React.js with modern UI/UX
- **Backend**: FastAPI with async PostgreSQL
- **Database**: PostgreSQL with vector embeddings
- **AI Providers**: OpenAI, Gemini, Ollama integration
- **Containerization**: Docker with docker-compose

## API Endpoints

- `POST /ocr/` - Extract text from images
- `GET /texts/` - Retrieve saved texts
- `POST /projects/` - Create new projects
- `GET /projects/` - List all projects
- `POST /query/` - Query saved texts
- `POST /similarity/` - Find similar texts
- `POST /summarize/` - Generate text summaries

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License. 