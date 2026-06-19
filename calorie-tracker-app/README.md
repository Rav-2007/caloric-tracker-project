# Indian Calorie Tracker

A mobile app for tracking calories in Indian meals. Point your camera at a dish and get instant nutritional analysis powered by Google Gemini.

## Stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Backend   | Python · FastAPI · Uvicorn              |
| AI        | Google Gemini (via `google-genai`)      |
| Database  | Supabase (PostgreSQL + Auth)            |
| Frontend  | Expo (React Native) · Expo Router       |
| Camera    | `expo-camera` · `expo-image-manipulator`|

---

## Project Structure

```
calorie-tracker-app/
├── backend/
│   ├── main.py            # FastAPI app entry point
│   ├── requirements.txt   # Python dependencies
│   ├── .env.example       # Environment variable template
│   └── SETUP.md           # Detailed venv + server guide
└── frontend/
    ├── app/
    │   ├── _layout.tsx    # Expo Router root layout
    │   ├── index.tsx      # Home screen
    │   └── camera.tsx     # Meal camera screen
    ├── app.json           # Expo configuration
    ├── package.json       # JS dependencies
    └── tsconfig.json      # TypeScript config
```

---

## Running Locally

### Backend

```bash
cd backend

# 1. Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your Supabase and Gemini credentials

# 4. Start the dev server (auto-reloads on file changes)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API available at: `http://localhost:8000`
Interactive docs at: `http://localhost:8000/docs`

---

### Frontend

> **Prerequisite:** Node.js 18+ and npm (or yarn/bun).

```bash
cd frontend

# 1. Install JS dependencies
npm install

# 2. Start the Expo dev server
npm start
```

Then press:
- `a` to open on a connected Android device / emulator
- `i` to open on iOS Simulator (macOS only)
- `w` to open in the browser (limited camera support)

Or install **Expo Go** on your phone and scan the QR code shown in the terminal.

#### First-time package setup (if cloning fresh)

```bash
npm install
npx expo install expo-camera expo-image-manipulator
```

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable                    | Where to get it                        |
|-----------------------------|----------------------------------------|
| `SUPABASE_URL`              | Supabase project → Settings → API      |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API      |
| `DATABASE_URL`              | Supabase project → Settings → Database |
| `GEMINI_API_KEY`            | Google AI Studio → API Keys            |

---

## Development Tips

- The backend and frontend can run concurrently in separate terminals.
- On Android, replace `localhost` in API calls with your machine's local IP (e.g., `192.168.x.x:8000`) since the emulator cannot reach `localhost` directly.
- Camera permissions are requested at runtime and must be granted on the device.
