# FinSight Project Structure & Architecture

A comprehensive guide to understand the full-stack architecture of FinSight, including frontend (React) and backend (FastAPI) components, authentication flow, and project organization.

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Authentication Flow](#authentication-flow)
4. [Frontend Structure & Components](#frontend-structure--components)
5. [Backend Structure & API](#backend-structure--api)
6. [API Endpoints Reference](#api-endpoints-reference)
7. [Database Schema](#database-schema)
8. [Core Concepts](#core-concepts)
9. [How to Use](#how-to-use)

---

## 🎯 Project Overview

FinSight is a full-stack financial application with:

### **Frontend (FinSight-Web)**
- React + TypeScript with Vite for fast development
- Authentication system - Login/Signup pages with JWT token management
- Protected routes - Dashboard and other secure pages only accessible to authenticated users
- Global auth state using React Context API
- File upload feature - Upload and parse bank statements (CSV, PDF)
- Intelligent parsing - Uses OpenAI to detect columns and extract transactions
- Tailwind CSS for styling UI components

### **Backend (FinSight-Rest)**
- FastAPI (Python) - Modern, fast web framework
- PostgreSQL database - Reliable relational database
- JWT token-based authentication with bcrypt password hashing
- File parsing - Supports CSV and PDF bank statements
- AI-powered parsing - Uses OpenAI GPT to intelligently detect statement columns
- CORS middleware for frontend-backend communication
- Modular architecture with services, schemas, and API routers

### **Architecture**
- **Frontend** → Makes API calls to Backend → **Backend**
- **Backend** → Validates requests, manages database → **Backend**
- **Backend** → Returns JWT token & user data → **Frontend**
- **Frontend** → Stores token, uses for authenticated requests → **Frontend**

---

## 🏗️ Architecture Diagram

### **Full Stack Overview**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React)                              │
│                         FinSight-Web                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│    ┌──────────────────────────────────────────────────────────────┐    │
│    │                       App.tsx                                │    │
│    │                  (Router Setup)                             │    │
│    └──────────────────────┬───────────────────────────────────────┘    │
│                           │                                             │
│                 ┌─────────▼──────────┐                                  │
│                 │  AuthProvider      │                                  │
│                 │  (Global State)    │                                  │
│                 └─────────┬──────────┘                                  │
│                           │                                             │
│        ┌──────────────────┴───────────────────┐                        │
│        │                                      │                        │
│    ┌───▼────────┐                     ┌──────▼──────┐                  │
│    │ Public     │                     │ Protected   │                  │
│    │ Routes     │                     │ Routes      │                  │
│    │            │                     │             │                  │
│    │ /login     │                     │ /dashboard  │                  │
│    │ /signup    │                     │             │                  │
│    └────────────┘                     └─────────────┘                  │
│                                                                          │
│  Uses useAuth() hook to access auth state                              │
│  Makes API calls via axios (with JWT token)                            │
│                                                                          │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ HTTP Requests
                               │ (GET, POST, etc.)
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          BACKEND (FastAPI)                               │
│                        FinSight-Rest                                     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                      FastAPI App                               │    │
│  │                    main.py                                     │    │
│  │  • CORS Middleware (allows frontend requests)                 │    │
│  │  • Health check endpoint                                      │    │
│  └────────────────────┬───────────────────────────────────────────┘    │
│                       │                                                  │
│         ┌─────────────▼──────────────┐                                  │
│         │   Auth Router             │                                  │
│         │   /auth/signup            │                                  │
│         │   /auth/login             │                                  │
│         │   /auth/me (protected)    │                                  │
│         └──────────┬────────────────┘                                  │
│                    │                                                    │
│         ┌──────────▼──────────────┐                                    │
│         │  Auth Service           │                                    │
│         │  • create_user()        │                                    │
│         │  • authenticate_user()  │                                    │
│         │  • create_access_token()│                                    │
│         │  • decode_access_token()│                                    │
│         │  • Hash passwords       │                                    │
│         └──────────┬──────────────┘                                    │
│                    │                                                    │
│         ┌──────────▼──────────────┐                                    │
│         │   Database Layer        │                                    │
│         │   (PostgreSQL)          │                                    │
│         │   • get_db()            │                                    │
│         │   • Connections         │                                    │
│         └─────────────────────────┘                                    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     DATABASE (PostgreSQL)                                │
│                        finsight DB                                       │
│                                                                           │
│  • users table (id, email, password_hash, created_at)                  │
│  • Other tables (for future features)                                   │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### **Request/Response Flow**

```
1. USER SIGNUP FLOW:
   Frontend (User fills signup form)
   ↓
   POST /auth/signup {email, password}
   ↓
   Backend validates & hashes password
   ↓
   Stores in PostgreSQL
   ↓
   Returns {"message": "Account created successfully"}
   ↓
   Frontend redirects to login

2. USER LOGIN FLOW:
   Frontend (User fills login form)
   ↓
   POST /auth/login {email, password}
   ↓
   Backend authenticates (verify password with bcrypt)
   ↓
   Creates JWT token with user_id
   ↓
   Returns {"access_token": "jwt_token_here", "token_type": "bearer"}
   ↓
   Frontend stores token in localStorage
   ↓
   Frontend redirects to /dashboard

3. PROTECTED REQUEST FLOW:
   Frontend calls GET /auth/me
   ↓
   HTTP header: Authorization: Bearer jwt_token_here
   ↓
   Backend middleware: OAuth2PasswordBearer extracts token
   ↓
   Service: decode_access_token() validates JWT
   ↓
   Service: get_user_by_id() fetches user from DB
   ↓
   Returns UserResponse {id, email, created_at}
   ↓
   Frontend displays user data in Dashboard

4. LOGOUT FLOW:
   Frontend clears token from localStorage
   ↓
   Frontend redirects to /login
   ↓
   Token is invalid, so can't access protected routes
```

## 🔐 Authentication Flow (Detailed)

### **Complete User Journey - Sign Up**

```
1. User visits app → App mounts
   ├─ AuthProvider initializes
   └─ Checks localStorage for existing token
      └─ If exists: validates with GET /auth/me
         └─ If valid: loads user, user is logged in
         └─ If invalid: clears token, user is logged out

2. User sees /login page (via PublicRoute)
   ├─ PublicRoute checks isAuthenticated
   └─ If true: redirects to /dashboard
   └─ If false: shows SignupPage form

3. User fills signup form
   ├─ Email: user@example.com
   ├─ Password: mySecurePassword
   └─ Clicks "Sign Up" button

4. Frontend calls API
   └─ POST /auth/signup with credentials
   └─ axios (HTTP client) adds CORS headers

5. Backend receives signup request
   ├─ Validates email format (EmailStr)
   ├─ Checks if email unique
   ├─ Hashes password with bcrypt
   ├─ Inserts into PostgreSQL: users table
   └─ Returns {"message": "Account created successfully"}

6. Frontend shows success message
   └─ User clicks "Go to Login" or redirects automatically

7. Login flow begins...
```

### **Complete User Journey - Login**

```
1. User visits /login page (PublicRoute allows it if not authenticated)

2. User fills login form
   ├─ Email: user@example.com
   ├─ Password: mySecurePassword
   └─ Clicks "Login" button

3. Frontend calls API
   └─ POST /auth/login with credentials
   └─ axios sends HTTP request

4. Backend receives login request
   ├─ Validates email format
   ├─ Queries PostgreSQL: SELECT * FROM users WHERE email = 'user@example.com'
   ├─ Gets password_hash from database
   ├─ Verifies: bcrypt.verify(entered_password, stored_hash)
   │  ├─ If false: return 401 Unauthorized
   │  └─ If true: continue
   ├─ Creates JWT token:
   │  └─ payload = {
   │       "sub": "550e8400-e29b-41d4-a716-446655440000",
   │       "exp": 1679100000 (24 hours from now)
   │     }
   ├─ Signs JWT with SECRET_KEY using HS256 algorithm
   └─ Returns {"access_token": "eyJ...", "token_type": "bearer"}

5. Frontend receives token
   ├─ Stores in localStorage: localStorage.setItem('authToken', token)
   ├─ Calls AuthProvider.login(token)
   │  ├─ Sets token in state
   │  ├─ Calls GET /auth/me to fetch user data
   │  └─ Sets user in state
   └─ Sets isAuthenticated = true

6. Frontend redirects to /dashboard
   └─ ProtectedRoute checks isAuthenticated = true
      └─ Allows access, renders Dashboard component

7. User sees dashboard with their email
   └─ Data comes from AuthContext.user
```

### **Protected Route Access - GET /auth/me**

```
1. Frontend needs to access protected endpoint
   ├─ GET /auth/me
   └─ axios interceptor:
      ├─ Reads token from localStorage
      ├─ Adds to headers: Authorization: Bearer eyJ...
      └─ Sends request with token

2. Backend receives request
   ├─ FastAPI router recognizes Authorization header
   ├─ OAuth2PasswordBearer extracts token
   ├─ Calls get_current_user() dependency:
   │  ├─ Calls decode_access_token(token)
   │  │  ├─ Verifies JWT signature with SECRET_KEY
   │  │  ├─ Checks if exp > current_time (not expired)
   │  │  ├─ Extracts "sub" (user_id) from payload
   │  │  └─ Returns user_id or raises 401
   │  ├─ Queries DB: SELECT * FROM users WHERE id = user_id
   │  ├─ If found: returns user dict
   │  └─ If not found: raises 401
   └─ Route handler receives user data

3. Backend returns user info
   └─ {"id": "550e8400-e29b...", "email": "user@example.com", "created_at": "..."}

4. Frontend receives response
   └─ Updates AuthContext with user data
   └─ Component re-renders with new user info
```

### **Logout Flow**

```
1. User clicks logout button on Dashboard
   ├─ Calls AuthProvider.logout()
   │  ├─ Clears token from state
   │  ├─ Clears user from state
   │  ├─ Sets isAuthenticated = false
   │  └─ Removes token from localStorage
   └─ Frontend redirects to /login

2. All subsequent requests fail
   └─ localStorage has no token
   └─ Authorization header is missing
   └─ Backend returns 401 if trying protected endpoint
   └─ axios interceptor catches 401 and redirects to /login

3. User is now logged out
   └─ PublicRoute shows login/signup pages
   └─ ProtectedRoute shows loading, then redirects to login
```

### **Token Expiration Handling**

```
Token stored 24 hours ago:
│
├─ exp timestamp: 1679100000 (24 hours from creation)
├─ Current time: 1679186400 (now)
└─ Result: Token EXPIRED

When user tries any request:
├─ axios adds token to header
├─ Backend tries to decode token
├─ JWT validation fails: "exp" claim is in past
├─ Returns 401 Unauthorized
├─ axios interceptor catches 401
│  ├─ Clears localStorage token
│  └─ Redirects to /login
└─ User must login again

Good for security! Forces users to re-authenticate regularly.
```

---

## 💡 Core Concepts

## 📁 Frontend Structure & Components

### **`src/`** - Main Source Code

```
src/
├── App.tsx                           # Root component with routing setup
├── main.tsx                          # React app entry point
├── api/                              # API calls & HTTP client
│   ├── auth.ts                       # Authentication API functions
│   ├── upload.ts                     # File upload API functions
│   └── axios.ts                      # Axios instance with interceptors
├── components/                       # Reusable React components
│   ├── auth/                         # Auth-related route components
│   │   ├── ProtectedRoute.tsx        # Wrapper for authenticated routes
│   │   └── PublicRoute.tsx           # Wrapper for public routes (redirects if logged in)
│   └── upload/                       # File upload components
│       ├── DropZone.tsx              # Drag-and-drop file input
│       ├── UploadModal.tsx           # Modal dialog for file upload
│       ├── UploadContent.tsx         # Upload form and progress display
│       └── PrivacyModal.tsx          # User data privacy information
├── context/                          # React Context for global state
│   └── AuthContext.tsx               # Auth state management provider
├── hooks/                            # Custom React hooks
│   ├── useAuth.ts                    # Hook to access auth state anywhere
│   └── useUpload.ts                  # Hook to manage file upload state and logic
├── models/                           # TypeScript interfaces & types
│   ├── index.ts                      # User & AuthContextType interfaces
│   ├── login.ts                      # Login request/response types
│   └── signup.ts                     # Signup request types
├── pages/                            # Page components (different screens)
│   ├── LoginPage.tsx                 # Login page
│   ├── SignupPage.tsx                # Signup page
│   ├── DashboardPage.tsx             # Protected dashboard (main app)
│   └── UploadPage.tsx                # Statement file upload page
├── shared/                           # Shared UI components
│   ├── Button.tsx                    # Reusable button component
│   └── Input.tsx                     # Reusable input field component
├── utils/                            # Utility functions (currently empty)
└── assets/                           # Images, fonts, etc. (currently empty)
```

---

## 🧩 Component Descriptions

### **🔧 Core Components**

#### **`App.tsx`** (Main Component)
- **Purpose**: Root component that sets up routing and wraps everything with AuthProvider
- **Key Duties**:
  - Defines all routes (/login, /signup, /dashboard)
  - Wraps public routes with `<PublicRoute>` (redirects if logged in)
  - Wraps protected routes with `<ProtectedRoute>` (redirects if not logged in)
- **Flow**: AuthProvider → Routes → Pages/Components

#### **`AuthContext.tsx`** (Context Provider)
- **Purpose**: Global authentication state management
- **State Variables**:
  - `user`: Current logged-in user data (null if not logged in)
  - `token`: JWT token (null if not logged in)
  - `isLoading`: Boolean flag indicating if auth is being validated
  - `isAuthenticated`: Computed property from token (true if token exists)
- **Methods**:
  - `login(token)`: Store token, fetch & store user data
  - `logout()`: Clear token, clear user data, redirect to login
- **Initialization**: On app load, checks localStorage for stored token and validates with `/auth/me`
- **Used By**: Entire app via `useAuth()` hook

### **🛣️ Route Components**

#### **`PublicRoute.tsx`** (Public Routes Wrapper)
- **Purpose**: Prevents logged-in users from accessing login/signup pages
- **Logic**:
  - If `isLoading` → show "Loading..." spinner
  - If `isAuthenticated` → redirect to `/dashboard`
  - Otherwise → render the page (LoginPage, SignupPage)
- **Used In**: `/login`, `/signup` routes

#### **`ProtectedRoute.tsx`** (Protected Routes Wrapper)
- **Purpose**: Prevents unauthenticated users from accessing secure pages
- **Logic**:
  - If `isLoading` → show "Loading..." spinner
  - If NOT `isAuthenticated` → redirect to `/login`
  - Otherwise → render the page (Dashboard, etc.)
- **Used In**: `/dashboard` and any future protected routes

### **📄 Page Components**

#### **`LoginPage.tsx`** (Login Screen)
- **Purpose**: User login form
- **Features**: Email & password inputs, login button
- **Flow**: Collects credentials → calls backend → stores token → redirects to dashboard
- **State**: Local form inputs (email, password)

#### **`SignupPage.tsx`** (Signup Screen)
- **Purpose**: New user registration form
- **Features**: Email & password inputs, signup button
- **Flow**: Collects credentials → calls backend → stores token → redirects to dashboard
- **State**: Local form inputs (email, password)

#### **`DashboardPage.tsx`** (Main Protected Page)
- **Purpose**: Main application page shown to authenticated users
- **Features**: Displays user email, upload button, logout button
- **Access**: Only accessible to logged-in users (protected by `<ProtectedRoute>`)
- **Data Source**: Gets user info from `useAuth()` hook
- **Interactivity**: Can open UploadModal to upload bank statements

#### **`UploadPage.tsx`** (File Upload Page)
- **Purpose**: Page for uploading and parsing bank statements
- **Features**:
  - Drag-and-drop file upload
  - Progress bar showing upload status
  - Live transaction preview (displays parsed transactions)
  - Privacy information modal
- **Access**: Only accessible to logged-in users (protected by `<ProtectedRoute>`)
- **Upload States**: idle → selected → uploading → parsing → success/error
- **Integration**: Uses `useUpload()` hook to manage upload state

### **📤 Upload Components**

#### **`DropZone.tsx`** (Drag-and-Drop Input)
- **Purpose**: Accept file uploads via drag-n-drop or file picker
- **Features**:
  - Validates file type (CSV, PDF)
  - Validates file size (max 10MB)
  - Visual feedback when dragging over
  - Hidden file input triggered on click
- **Props**:
  - `onFileSelect`: Called with File when valid file selected
  - `onError`: Called with error message if invalid file
  - `disabled`: Boolean to disable during upload
- **Validation**:
  - Accepted types: CSV, PDF
  - Max size: 10MB
  - Shows user-friendly error messages

#### **`UploadModal.tsx`** (Upload Dialog)
- **Purpose**: Modal wrapper for upload workflow
- **State Management**: Uses `useUpload()` hook internally
- **Props**:
  - `isOpen`: Boolean to show/hide modal
  - `onClose`: Called when user closes modal
  - `onUploadSuccess`: Called with transaction count after successful upload
- **Content**: Renders `UploadContent` component (actual upload form)
- **Callback Flow**: After upload succeeds, calls `onUploadSuccess` so parent can refresh data

#### **`UploadContent.tsx`** (Upload Form)
- **Purpose**: Main upload UI - file selection, progress, results
- **States**:
  - `idle`: No file selected, show DropZone
  - `selected`: File selected, show file info and upload button
  - `uploading`: File being transferred, show progress bar
  - `parsing`: Backend parsing file, show "Parsing..." message
  - `success`: Show parsed transactions in table
  - `error`: Show error message and recovery options
- **Interaction**: Managed by `useUpload()` hook

#### **`PrivacyModal.tsx`** (Data Privacy Info)
- **Purpose**: Inform users about data privacy and usage
- **Content**: Explains how statements are processed, data security
- **Props**:
  - `isOpen`: Boolean to show/hide
  - `onClose`: Called when user acknowledges
- **Styling**: Modal overlay with backdrop, accessible close button

### **🎨 Shared UI Components**

#### **`Button.tsx`** (Reusable Button)
- **Purpose**: Standardized button across the application
- **Props**:
  - `label`: Button text
  - `onClick`: Click handler function
  - `type`: 'button' or 'submit' (for forms)
  - `disabled`: Boolean to disable button
  - `isLoading`: Show loading state
  - `variant`: 'primary' (blue) or 'secondary' (gray)
  - `fullWidth`: Boolean to make button full width
- **Styling**: Tailwind CSS with hover effects and disabled states

#### **`Input.tsx`** (Reusable Input Field)
- **Purpose**: Standardized form input field
- **Props**:
  - `label`: Input label text
  - `type`: Input type ('text', 'email', 'password', etc.)
  - `value`: Current value (controlled component)
  - `onChange`: Change handler function
  - `placeholder`: Placeholder text
  - `error`: Error message to display (if any)
  - `disabled`: Boolean to disable input
- **Features**: Shows error messages in red below the input

### **🪝 Hooks**

#### **`useAuth()`** (Authentication Hook)
- **Purpose**: Access authentication state and methods from anywhere in the app
- **Returns**: `AuthContextType` object containing:
  - `user`: Current user data or null
  - `token`: JWT token or null
  - `isAuthenticated`: Boolean
  - `isLoading`: Boolean
  - `login(token)`: Function to login
  - `logout()`: Function to logout
- **Usage Example**:
  ```tsx
  const { user, logout, isAuthenticated } = useAuth()
  ```
- **Error**: Throws error if used outside `AuthProvider` (safety check)

#### **`useUpload()`** (File Upload Hook)
- **Purpose**: Manage file upload state and logic centrally
- **Parameters**:
  - `onUploadSuccess`: Callback function called when upload completes with transaction count
- **Returns**: Object containing:
  - `uploadState`: Current state ('idle' | 'selected' | 'uploading' | 'parsing' | 'success' | 'error')
  - `selectedFile`: The File object selected by user (or null)
  - `uploadProgress`: Number 0-100 showing upload percentage
  - `errorMessage`: String with error description (empty if no error)
  - `transactionCount`: Number of transactions parsed from statement
  - `handleFileSelect(file)`: Function to call when valid file selected
  - `handleDropError(message)`: Function to call when invalid file dropped
  - `handleUpload()`: Function to call to start upload process
  - `reset()`: Function to reset state back to 'idle'
- **Upload Flow**:
  1. User selects/drags file → `handleFileSelect()` → state='selected'
  2. User clicks upload → `handleUpload()` → state='uploading'
  3. API uploads file → `uploadProgress` increases
  4. Backend parses → state='parsing'
  5. Success → state='success', calls `onUploadSuccess(count)`
  6. Error → state='error', shows `errorMessage`
- **Usage Example**:
  ```tsx
  const { uploadState, handleFileSelect, handleUpload } = useUpload(
    (count) => console.log(`Uploaded ${count} transactions`)
  )
  ```

### **📊 Models/Types**

#### **`models/index.ts`** (Core Types)
```typescript
// User interface - represents a logged-in user
interface User {
  id: string              // Unique user identifier
  email: string           // User email address
  created_at: string      // Account creation timestamp
}

// AuthContextType - entire auth state structure
interface AuthContextType {
  user: User | null                    // null = not logged in
  token: string | null                 // null = no token
  isAuthenticated: boolean             // derived from token
  isLoading: boolean                   // checking auth on load
  login: (token: string) => Promise<void>   // login method
  logout: () => void                   // logout method
}
```

#### **`models/login.ts`** (Login Types)
```typescript
interface LoginPayload {
  email: string          // User email
  password: string       // User password
}

interface LoginResponse {
  access_token: string   // JWT token from backend
  token_type: string     // Usually "Bearer"
}
```

#### **`models/signup.ts`** (Signup Types)
```typescript
interface SignupPayload {
  email: string          // New user email
  password: string       // New user password
}
```

### **🔌 API Layer**

#### **`api/axios.ts`** (HTTP Client)
- **Purpose**: Axios instance with auto-token injection
- **Features**:
  - BASE URL from `.env` file
  - **Request Interceptor**: Automatically adds JWT token to all API calls
  - **Response Interceptor**: Handles 401 errors (expired token) and redirects to login
- **Usage**: Import this configured instance for all API calls

#### **`api/auth.ts`** (Auth API Functions)
```typescript
loginApi(email, password)        // POST /auth/login → returns token
signupApi(email, password)       // POST /auth/signup → returns success
getMeApi()                        // GET /auth/me → returns user data
```
- **Purpose**: Encapsulates all authentication-related API calls
- **Called By**: AuthProvider, Page components

---

## � Backend Structure & API

### **Backend Technology Stack**
- **Framework**: FastAPI (Python) - Fast, modern, with automatic OpenAPI documentation
- **Database**: PostgreSQL - Reliable relational database
- **Authentication**: JWT (JSON Web Tokens) + bcrypt password hashing
- **ORM**: Raw SQL with psycopg2 (lightweight, direct control)
- **Validation**: Pydantic - For request/response validation

### **Backend Folder Structure**

```
FinSigth-Rest/
├── .env                              # Environment variables (DATABASE_URL, SECRET_KEY, etc.)
├── .gitignore                        # Files to ignore in git
├── requirements.txt                  # Python dependencies (FastAPI, psycopg2, etc.)
├── app/
│   ├── __init__.py                   # Python package marker
│   ├── main.py                       # FastAPI app setup, CORS, route registration
│   │
│   ├── api/                          # API routers (endpoint definitions)
│   │   ├── __init__.py
│   │   ├── auth.py                   # Authentication endpoints
│   │   │                             # POST /auth/signup
│   │   │                             # POST /auth/login
│   │   │                             # GET /auth/me (protected)
│   │   └── upload.py                 # File upload endpoints
│   │                                 # POST /upload/statement (protected)
│   │
│   ├── core/                         # Core utilities (config, database)
│   │   ├── __init__.py
│   │   ├── config.py                 # Settings from .env file
│   │   │                             # DATABASE_URL, SECRET_KEY, ALGORITHM, etc.
│   │   └── database.py               # PostgreSQL connection management
│   │                                 # get_db() context manager
│   │
│   ├── models/                       # Database models (currently empty)
│   │   └── __init__.py               # Future: SQLAlchemy models or direct SQL queries
│   │
│   ├── schemas/                      # Request/Response validation schemas
│   │   ├── __init__.py
│   │   ├── auth.py                   # SignupRequest, LoginRequest, UserResponse
│   │   └── upload.py                 # ParsedTransaction, UploadResponse
│   │
│   └── services/                     # Business logic, database queries
│       ├── __init__.py
│       ├── auth_service.py           # create_user(), authenticate_user()
│       │                             # JWT token creation/validation
│       │                             # Password hashing functions
│       └── parsing_service.py        # File validation, column detection
│                                     # CSV/PDF parsing with OpenAI
```

### **Backend Components Explained**

#### **`main.py`** - FastAPI Application
- **Purpose**: Entry point for the backend API
- **Responsibilities**:
  - Initialize FastAPI app with metadata (title, version)
  - Add CORS middleware (allow frontend at localhost:5173)
  - Register all API routers (auth_router, upload_router)
  - Health check endpoint (`GET /health`)
- **Key Code**:
  ```python
  app = FastAPI(title="FinSight API", version="1.0.0")
  app.add_middleware(
      CORSMiddleware,
      allow_origins=["http://localhost:5173"],  # Frontend URL
      allow_credentials=True,
      allow_methods=["*"],
      allow_headers=["*"],
  )
  app.include_router(auth_router)      # Register auth endpoints
  app.include_router(upload_router)    # Register upload endpoints
  ```

#### **`core/config.py`** - Configuration Management
- **Purpose**: Load environment variables and provide settings
- **Settings Managed**:
  - `DATABASE_URL`: PostgreSQL connection string
  - `SECRET_KEY`: Secret key for JWT signing
  - `ALGORITHM`: JWT algorithm (HS256)
  - `ACCESS_TOKEN_EXPIRE_HOURS`: Token expiration duration (24 hours)
  - `OPENAI_API_KEY`: OpenAI GPT API key for statement parsing
- **Usage**: Import `settings` everywhere you need config values
- **From `.env` file**:
  ```
  DATABASE_URL=postgresql://finsight_user:password@localhost:5432/finsight
  SECRET_KEY=your_secret_key_here
  ALGORITHM=HS256
  ACCESS_TOKEN_EXPIRE_HOURS=24
  OPENAI_API_KEY=sk-...
  ```

#### **`core/database.py`** - Database Connection Management
- **Purpose**: Handle PostgreSQL connections safely
- **Functions**:
  - `get_connection()`: Creates new PostgreSQL connection
  - `get_db()`: Context manager (use with `with get_db() as conn:`)
- **Features**:
  - Uses `RealDictCursor` so rows are dicts, not tuples
  - Automatically closes connections (even on errors)
  - Auto-commits on success, rolls back on errors
- **Usage in Services**:
  ```python
  with get_db() as conn:
      user = create_user(conn, email, password)
  ```

#### **`api/auth.py`** - Authentication Endpoints
- **Purpose**: Define HTTP endpoints for authentication
- **Endpoints**:
  1. **POST `/auth/signup`**
     - Request: `{"email": "user@example.com", "password": "pwd123"}`
     - Response: `{"message": "Account created successfully"}`
     - Status: 201 (Created)
  
  2. **POST `/auth/login`**
     - Request: `{"email": "user@example.com", "password": "pwd123"}`
     - Response: `{"access_token": "jwt_token_here", "token_type": "bearer"}`
     - Status: 200 (OK)
  
  3. **GET `/auth/me`** (Protected)
     - Headers: `Authorization: Bearer jwt_token_here`
     - Response: `{"id": "uuid", "email": "user@example.com", "created_at": "2026-03-15T..."}`
     - Status: 200 (OK)
     - Error: 401 if token invalid/expired

- **OAuth2 Dependency**: 
  - `OAuth2PasswordBearer(tokenUrl="/auth/login")` - Standard FastAPI auth
  - `get_current_user()` dependency - Validates token and fetches user
  - Automatically handles `Authorization: Bearer token` header

#### **`schemas/auth.py`** - Request/Response Validation
- **Purpose**: Define and validate data structures
- **Schemas**:
  ```python
  class SignupRequest:
      email: EmailStr  # Validated email
      password: str
  
  class LoginRequest:
      email: EmailStr
      password: str
  
  class LoginResponse:
      access_token: str
      token_type: str = "bearer"
  
  class UserResponse:
      id: UUID
      email: str
      created_at: datetime
  ```
- **Benefits**: 
  - Automatic validation
  - Type hints for IDE
  - OpenAPI documentation

#### **`services/auth_service.py`** - Business Logic
- **Purpose**: Core authentication logic and JWT/password utilities
- **Functions**:
  
  1. **Password Utilities**:
     - `hash_password(plain_password)`: Uses bcrypt to hash (one-way encryption)
     - `verify_password(plain, hashed)`: Compares plain password with hash
  
  2. **JWT Utilities**:
     - `create_access_token(user_id)`: Creates JWT with expiration
     - `decode_access_token(token)`: Validates JWT and extracts user_id
  
  3. **User Operations**:
     - `create_user(conn, email, password)`: Insert user in DB
     - `authenticate_user(conn, email, password)`: Find user + verify password
     - `get_user_by_id(conn, user_id)`: Fetch user from DB

- **JWT Payload Structure**:
  ```python
  {
      "sub": "user_id_uuid",              # Subject (user ID)
      "exp": 1679000000                   # Expiration timestamp
  }
  ```

#### **`api/upload.py`** - File Upload Endpoints
- **Purpose**: Handle file upload and parsing requests
- **Endpoint**: **POST `/upload/statement`** (Protected)
  - Requires valid JWT token (uses `get_current_user` dependency)
  - Accepts multipart/form-data with file
  - Calls parsing_service to validate and parse file
  - Returns parsed transactions
- **Features**:
  - File never written to disk (processed in memory)
  - Supports CSV and PDF formats
  - Validates file size and type
  - Extracts transactions from statements

#### **`schemas/upload.py`** - Upload Data Models
- **Purpose**: Define request/response structures for file upload
- **Schemas**:
  ```python
  class ParsedTransaction(BaseModel):
      transaction_id: str          # Unique transaction ID
      date: str                    # Transaction date (YYYY-MM-DD)
      description: str             # Transaction description/narration
      amount: float                # Amount (negative=debit, positive=credit)
      type: str                    # "debit" or "credit"
      balance: Optional[float]     # Account balance after transaction
  
  class UploadResponse(BaseModel):
      message: str                 # Success message
      upload_id: str               # UUID for this upload
      transaction_count: int       # Number of transactions parsed
      filename: str                # Original filename
      transactions: list[ParsedTransaction]  # Parsed transactions
  ```

#### **`services/parsing_service.py`** - Statement Parsing
- **Purpose**: Parse bank statements and extract transaction data
- **Key Functions**:

  1. **`validate_file(filename, content_type, file_size)`** - File Validation
     - Checks file extension and MIME type
     - Validates file size ≤ 10MB
     - Returns file type: 'csv' or 'pdf'
     - Raises HTTPException if invalid
     - Supports multiple CSV MIME types (browsers send different ones)

  2. **`parse_statement(file_bytes, file_type)`** - Parse File
     - **For CSV files**:
       - Reads CSV using pandas
       - Detects column headers using OpenAI GPT
       - Maps columns (date, description, debit, credit, balance)
       - Extracts transactions from rows
     - **For PDF files**:
       - Extracts tables using pdfplumber
       - Converts to pandas DataFrame
       - Uses same column detection logic as CSV
     - Returns list of transactions

  3. **`detect_columns_with_openai(df)`** - AI-Powered Column Detection
     - Sends sample data + column names to OpenAI GPT
     - GPT identifies which column represents which field
     - Handles various bank statement formats automatically
     - Returns mapping: `{"date": "Date", "description": "Narration", ...}`
     - **Prompt Logic**: Describes task to GPT, shows sample data, asks for column mapping
     - **Cost Efficient**: Only sends first 5 rows to reduce token usage

  4. **`extract_transactions(df, column_mapping)`** - Extract Data
     - Iterates through DataFrame rows
     - Transforms dates from various formats to YYYY-MM-DD
     - Parses amounts (handles currency symbols, etc.)
     - Determines debit/credit from amount sign
     - Generates transaction IDs
     - Returns list of ParsedTransaction objects

- **Error Handling**:
  - Invalid file format → 400 Bad Request
  - Unsupported file type → 400 Bad Request
  - File too large → 400 Bad Request
  - Parsing failure (corrupted file) → 422 Unprocessable Entity
  - OpenAI API failure → 500 Internal Server Error

- **Environment Variables Needed**:
  - `OPENAI_API_KEY`: For GPT API calls

- **Process Flow**:
  ```
  1. validate_file(filename, content_type, file_size)
     ↓
  2. parse_statement(file_bytes, file_type)
     ├─ If CSV: Read with pandas.read_csv()
     ├─ If PDF: Extract tables with pdfplumber
     ↓
  3. detect_columns_with_openai(df)
     ├─ Send to OpenAI GPT
     ├─ GPT identifies columns
     ↓
  4. extract_transactions(df, column_mapping)
     ├─ Process each row
     ├─ Format data
     ├─ Generate transaction IDs
     ↓
  5. Return ParsedTransaction list
  ```

---

## 📡 API Endpoints Reference

### **Authentication Endpoints**

| Method | Endpoint | Protected | Description |
|--------|----------|-----------|-------------|
| POST | `/auth/signup` | ❌ No | Register new user |
| POST | `/auth/login` | ❌ No | Login and get JWT token |
| GET | `/auth/me` | ✅ Yes | Get current user info |
| GET | `/health` | ❌ No | Health check |

### **File Upload Endpoints**

| Method | Endpoint | Protected | Description |
|--------|----------|-----------|-------------|
| POST | `/upload/statement` | ✅ Yes | Upload and parse bank statement |

### **Endpoint Details**

#### **1. POST `/auth/signup`**
Create a new user account.

**Request**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (201 Created)**:
```json
{
  "message": "Account created successfully"
}
```

**Possible Errors**:
- 400: Invalid email format
- 400: Email already exists
- 422: Missing required fields

---

#### **2. POST `/auth/login`**
Authenticate user and get JWT token.

**Request**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200 OK)**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Possible Errors**:
- 401: Invalid email or password
- 422: Missing required fields

**Frontend Usage**:
```typescript
const response = await api.post('/auth/login', {
  email: 'user@example.com',
  password: 'password'
})
localStorage.setItem('authToken', response.data.access_token)
```

---

#### **3. GET `/auth/me`** (Protected)
Get current user information. Requires valid JWT token.

**Headers**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200 OK)**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "created_at": "2026-03-15T10:30:45.123456"
}
```

**Possible Errors**:
- 401: No token provided
- 401: Token expired or invalid
- 401: User not found

**Frontend Usage**:
```typescript
// Token is auto-added by axios interceptor
const response = await api.get('/auth/me')
const user = response.data
```

---

#### **4. GET `/health`**
Simple health check endpoint.

**Response (200 OK)**:
```json
{
  "status": "ok"
}
```

---

#### **5. POST `/upload/statement`** (Protected)
Upload and parse a bank statement file (CSV or PDF).

**Headers**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: multipart/form-data
```

**Request**:
- Form data with file upload field
- File types: CSV or PDF
- Max size: 10MB

**Response (200 OK)**:
```json
{
  "message": "Statement parsed successfully",
  "upload_id": "550e8400-e29b-41d4-a716-446655440000",
  "transaction_count": 15,
  "filename": "statement.csv",
  "transactions": [
    {
      "transaction_id": "txn_001",
      "date": "2026-03-15",
      "description": "Online Transfer",
      "amount": -500.00,
      "type": "debit",
      "balance": 4500.00
    },
    {
      "transaction_id": "txn_002",
      "date": "2026-03-14",
      "description": "Salary Deposit",
      "amount": 5000.00,
      "type": "credit",
      "balance": 5000.00
    }
  ]
}
```

**Possible Errors**:
- 400: File too large (>10MB)
- 400: Unsupported file format (not CSV or PDF)
- 401: No token or unauthorized
- 422: File format unrecognizable or parsing failed

**Frontend Usage**:
```typescript
const response = await uploadStatementApi(file, (percent) => {
  console.log(`Upload progress: ${percent}%`)
})
const { transactions, transaction_count } = response
```

---

## 🗄️ Database Schema

### **Database Setup**
- **Type**: PostgreSQL
- **Database Name**: `finsight`
- **User**: `finsight_user`
- **Connection**: `postgresql://finsight_user:password@localhost:5432/finsight`

### **Users Table**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### **Columns**:
- `id`: Unique identifier (UUID)
- `email`: User email (unique, required)
- `password_hash`: Bcrypt-hashed password (never stored plain)
- `created_at`: Account creation timestamp

#### **Example Data**:
```
id                                  | email           | password_hash                         | created_at
550e8400-e29b-41d4-a716-446655440000 | user@example.com | $2b$12$8aB9kL2mC3D4e5F6g7H8i... | 2026-03-15 10:30:45
```

---

## 🔐 Authentication Flow (Detailed)

### **1. React Context API**
- **What**: Global state management without Redux
- **Why Used**: Simple auth state that needs to be accessible everywhere
- **How**: `AuthProvider` wraps entire app, `useAuth()` hook accesses state

### **2. Protected Routes Pattern**
- **What**: Routes that check authentication before rendering
- **Why**: Secure pages (dashboard) shouldn't be accessible to logged-out users
- **How**: Wrapper components check `isAuthenticated` and redirect accordingly

### **3. Token-Based Authentication**
- **What**: JWT (JSON Web Token) sent with every API request
- **Why**: Stateless authentication - server doesn't need to store session
- **How**: Token stored in localStorage, automatically added to all API calls via interceptor

### **4. Loading State**
- **What**: `isLoading` flag that's true while checking auth on app start
- **Why**: Prevents flash of redirect before we know if user is authenticated
- **How**: Routes show "Loading..." spinner while `isLoading === true`

### **5. Controlled Components**
- **What**: Form inputs whose value is controlled by React state
- **Why**: Easy to access form values, validation, and submission
- **How**: Input value = state, onChange updates state

---

## 🚀 How to Use

### **Add a New Protected Page**

1. Create page in `src/pages/NewPage.tsx`:
   ```tsx
   const NewPage = () => {
     const { user } = useAuth()
     return <div>Hello {user?.email}</div>
   }
   export default NewPage
   ```

2. Add route in `App.tsx`:
   ```tsx
   <Route path="/new-page" element={
     <ProtectedRoute>
       <NewPage />
     </ProtectedRoute>
   } />
   ```

### **Access Auth State Anywhere**

```tsx
import { useAuth } from '../hooks/useAuth'

const MyComponent = () => {
  const { user, logout, isAuthenticated } = useAuth()
  
  if (!isAuthenticated) return <p>Not logged in</p>
  return <button onClick={logout}>Logout {user?.email}</button>
}
```

### **Make an API Call**

```tsx
import api from '../api/axios'

const response = await api.get('/some-endpoint')
// Token is AUTOMATICALLY added to headers!
```

### **Add a Shared Component**

1. Create in `src/shared/MyComponent.tsx`
2. Import and use in any page:
   ```tsx
   import Button from '../shared/Button'
   ```

### **Handle File Uploads**

1. Import and use the `useUpload` hook:
   ```tsx
   import { useUpload } from '../hooks/useUpload'
   
   const MyComponent = () => {
     const { uploadState, handleFileSelect, handleUpload } = useUpload(
       (count) => console.log(`Uploaded ${count} transactions`)
     )
     
     return (
       <DropZone 
         onFileSelect={handleFileSelect}
         onError={(msg) => console.error(msg)}
         disabled={uploadState === 'uploading'}
       />
     )
   }
   ```

2. Or use the pre-built UploadModal component:
   ```tsx
   import UploadModal from '../components/upload/UploadModal'
   
   const Dashboard = () => {
     const [isOpen, setIsOpen] = useState(false)
     
     return (
       <>
         <button onClick={() => setIsOpen(true)}>Upload Statement</button>
         <UploadModal 
           isOpen={isOpen}
           onClose={() => setIsOpen(false)}
           onUploadSuccess={(count) => {
             console.log(`Uploaded ${count} transactions!`)
             // Refresh data, close modal, etc.
           }}
         />
       </>
     )
   }
   ```

3. Backend will automatically parse CSV/PDF and extract transactions
   - Uses OpenAI GPT to detect columns intelligently
   - Handles various bank statement formats
   - Returns list of ParsedTransaction objects

### **Add a Protected API Endpoint**

1. Create service function in `FinSigth-Rest/app/services/new_service.py`
2. Create schema in `FinSigth-Rest/app/schemas/new.py`
3. Create router in `FinSigth-Rest/app/api/new.py`:
   ```python
   from fastapi import APIRouter
   from app.api.auth import get_current_user
   
   router = APIRouter(prefix="/new", tags=["new"])
   
   @router.get("/something")
   async def get_something(current_user=Depends(get_current_user)):
       # current_user is already validated & contains user data
       return {"result": "data", "user_id": current_user["id"]}
   ```
4. Register in `main.py`:
   ```python
   from app.api.new import router as new_router
   app.include_router(new_router)
   ```

---

## 🔄 Data Flow Summary

```
User Opens App
     ↓
App.tsx mounts with AuthProvider
     ↓
AuthProvider checks localStorage for token
     ↓
If valid token → load user data, set isAuthenticated=true
If no token → set isAuthenticated=false
     ↓
isLoading=false (ready to render)
     ↓
Routes check isAuthenticated and render accordingly
     ↓
User interacts with pages, components use useAuth() for state
     ↓
API calls automatically include token via interceptor
     ↓
On logout → clear token, redirect to login
```

---

## 📝 Notes

- **Token Validation**: On first app load, the stored token is validated by checking with the backend (`/auth/me`). This ensures we don't trust expired tokens.
- **Error Handling**: If a 401 error occurs (unauthorized), the axios interceptor clears the token and redirects to login.
- **Persistence**: Tokens are stored in `localStorage` so users stay logged in after page refresh.
- **Type Safety**: Entire project is TypeScript - all interfaces are defined in `models/` for type checking.

---

## 🎓 Key Takeaway

The app follows this architecture:

### **Authentication System**
1. **Context** (AuthContext) = where auth state lives
2. **Hook** (useAuth) = how components access auth state
3. **Route Wrappers** (PublicRoute, ProtectedRoute) = how we control access
4. **API Layer** (axios with interceptors) = how we send JWT token with requests
5. **Pages** = user-facing components that consume auth state

### **File Upload System**
1. **Frontend Hook** (useUpload) = manages upload state and progress
2. **Upload Components** (DropZone, UploadModal) = user interface for file selection
3. **API Functions** (uploadStatementApi) = communicates with backend
4. **Backend Endpoint** (`POST /upload/statement`) = validates file and calls parsing service
5. **Parsing Service** (parsing_service.py) = extracts transactions using OpenAI GPT

### **Key Flow**
- User (authenticated) uploads bank statement → Frontend sends to Backend
- Backend validates file type/size → Calls OpenAI to detect columns
- Backend extracts transactions → Returns parsed data to Frontend
- Frontend displays transactions → User can review/confirm data

Everything connects through modular, reusable components to create a secure, scalable system!
