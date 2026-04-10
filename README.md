# FinSight

A personal finance analyzer that allows users to upload bank statements (PDF), automatically extract transactions using AI, and gain insights into spending patterns.

## Features

- 🔐 User authentication (signup, login, session persistence)
- 📄 Bank statement PDF upload and parsing
- 🤖 AI-powered transaction extraction (GPT-4o)
- 📊 Transaction categorization with machine learning
- 💾 Transaction history and persistence
- 🎨 Clean, responsive UI with real-time updates
- 📝 Comprehensive logging and error handling

## Tech Stack

**Frontend:**
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- React Router v6 (routing)
- Axios (HTTP client)

**Backend:**
- FastAPI (Python)
- PostgreSQL (database)
- OpenAI GPT-4o (PDF parsing)
- JWT (authentication)
- pdfplumber (PDF extraction)

## Project Structure

```
FinSight/
├── FinSight-Web/          # Frontend (React + TypeScript)
│   ├── src/
│   │   ├── api/           # API client functions
│   │   ├── components/    # React components
│   │   ├── context/       # Auth & Transaction context
│   │   ├── hooks/         # Custom hooks
│   │   ├── pages/         # Page components
│   │   └── models/        # TypeScript types
│   └── vite.config.ts
│
├── FinSigth-Rest/         # Backend (FastAPI)
│   ├── app/
│   │   ├── api/           # Route handlers
│   │   ├── services/      # Business logic
│   │   ├── core/          # Config, database
│   │   ├── ml/            # Categorization engine
│   │   └── schemas/       # Pydantic models
│   └── requirements.txt
│
└── PROJECT_DOCUMENTATION.md  # Comprehensive documentation
```

## Quick Start

### Backend Setup

1. Clone the repository and navigate to backend:
```bash
cd FinSigth-Rest
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

2. Set up environment variables (`.env`):
```env
DATABASE_URL=postgresql://user:password@localhost/finsight
SECRET_KEY=your-secret-key
OPENAI_API_KEY=sk-...
```

3. Create PostgreSQL database:
```bash
createdb finsight
```

4. Run the server:
```bash
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

1. Navigate to frontend:
```bash
cd FinSight-Web
npm install
```

2. Set up environment variables (`.env.local`):
```env
VITE_API_BASE_URL=http://localhost:8000
```

3. Run the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## API Endpoints

**Authentication:**
- `POST /auth/signup` - Create account
- `POST /auth/login` - Login user
- `GET /auth/me` - Get current user

**Transactions:**
- `POST /upload/statement` - Upload PDF statement
- `GET /upload/transactions` - Get all transactions

See [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md) for detailed API documentation.

## Key Features Explained

### Transaction Upload
1. User selects PDF bank statement
2. Backend validates file (type, size)
3. GPT-4o extracts transactions from PDF
4. Transactions stored in database
5. Dashboard shows extracted transactions

### Categorization
4-layer system for categorizing transactions:
1. **Named Patterns** - Regex matching known merchants (highest confidence)
2. **VPA Memory** - User correction history
3. **Heuristics** - AI-powered guessing (amount, merchant type)
4. **Fallback** - Manual categorization needed

### Authentication
- JWT-based stateless authentication
- 24-hour token expiry
- Session persistence via localStorage
- Automatic re-login on page refresh

## Documentation

For detailed architecture, API documentation, and development guide, see [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md)

Key topics covered:
- Architecture & data flow
- TypeScript models & types
- Frontend hooks & context
- ML categorization engine
- Error handling & logging
- Database schema
- Constants management

## Environment Variables

### Backend
```env
DATABASE_URL          # PostgreSQL connection string
SECRET_KEY            # JWT secret key
ACCESS_TOKEN_EXPIRE_HOURS  # Token expiry (default: 24)
OPENAI_API_KEY        # OpenAI API key
```

### Frontend
```env
VITE_API_BASE_URL     # Backend API URL (e.g., http://localhost:8000)
```

## Development

### Running Tests
```bash
# Backend
cd FinSigth-Rest
pytest

# Frontend
cd FinSight-Web
npm run test
```

### Code Quality
```bash
# Backend - lint & format
cd FinSigth-Rest
flake8 app/
black app/

# Frontend - lint & format
cd FinSight-Web
npm run lint
npm run format
```

## Troubleshooting

**PDF parsing slow or fails:**
- Ensure OPENAI_API_KEY is valid
- Check file is valid bank statement PDF
- File size must be < 10MB

**Login not working:**
- Verify DATABASE_URL is correct
- Ensure backend is running on port 8000
- Check JWT_SECRET_KEY is set

**Frontend can't connect to backend:**
- Check VITE_API_BASE_URL matches backend URL
- Ensure backend is running
- Check browser console for CORS errors

## Project Statistics

- 32 files enhanced with documentation
- 2000+ lines of code documentation
- 150+ centralized constants
- 200+ merchant categorization patterns
- 4-layer ML categorization engine
- 100+ logging statements

## License

MIT

## Contributing

Contributions welcome! Please follow the project structure and add documentation for new features.

---

For detailed information, see [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md)