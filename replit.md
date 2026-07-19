# GOAL AI — Webcam Gesture Edition

A browser-based football penalty kick game using real-time hand gesture tracking via MediaPipe (loaded from CDN). No backend required.

## Stack
- React 19 + TypeScript
- Vite 6
- Tailwind CSS v4
- MediaPipe Hands (CDN) for gesture tracking
- Lucide React + Motion

## How to run
```
npm run dev
```
Serves on port 5000 at `http://0.0.0.0:5000`.

## How to build for production
```
npm run build
```
Output goes to `dist/`.

## Deployment
Configured as a **static site** deployment on Replit:
- Build command: `npm run build`
- Public directory: `dist`

## Notes
- The `GEMINI_API_KEY` in `.env.example` is from the original AI Studio export but is **not used** by the app — hand tracking runs entirely via MediaPipe in the browser.
- Webcam access is requested automatically on load; the game falls back to optical-flow tracking if permission is denied.

## User preferences
