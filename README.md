# ClipBatch — GitHub Pages edition

ClipBatch is a static website that cuts a video into short MP4 clips **inside the visitor's browser** using FFmpeg.wasm. It does not require Flask, Python, a database, or a paid video-processing server.

## Features

- Upload a video from your device.
- Optionally load a direct video-file URL (the host must allow cross-origin browser requests / CORS).
- Batch mode: creates up to 10 consecutive 60-second clips at a time. Press **Generate next 10** to continue from the next timestamp.
- Custom mode: enter a start time, end time, and clip count. It divides the selected range evenly. Example: 10:00–15:00 with 5 clips creates five 60-second clips.
- Output as vertical 9:16 (center-cropped) or original aspect ratio.
- Download clips individually or together as a ZIP.
- Video processing stays on the user's device. The FFmpeg engine is loaded from jsDelivr the first time processing starts.

## Deploy to GitHub Pages (no backend required)

1. Download and extract this project ZIP.
2. On GitHub, create a **new public repository** (for example, `clipbatch`).
3. Upload the **contents** of the extracted folder to the repository root. Make sure `index.html`, `package.json`, `src/`, and `.github/workflows/deploy.yml` are at the root level — do not upload only the ZIP file.
4. Open the repository's **Settings → Pages**.
5. Under **Build and deployment → Source**, select **GitHub Actions**.
6. Open the **Actions** tab. Wait for the “Deploy ClipBatch to GitHub Pages” workflow to finish successfully.
7. Your website will be available at `https://YOUR-USERNAME.github.io/REPOSITORY-NAME/`.

Every push to the `main` branch automatically rebuilds and redeploys the website. If your default branch is not `main`, update the branch in `.github/workflows/deploy.yml`.

## Run locally (optional)

Install Node.js 22 or newer, then in this folder run:

```bash
npm install
npm run dev
```

Open the local address printed by Vite (usually `http://localhost:5173`).

## Important limits

- **A normal YouTube, Instagram, TikTok, or Facebook watch-page link is not a direct video file.** This static GitHub Pages app cannot extract those sites' video streams. Download a video you own or have permission to use, then upload the file. Direct MP4/MOV/WEBM URLs only work when the remote host permits CORS access.
- Large videos can use substantial RAM and CPU. Browser memory, device performance, video codec, and available storage affect the practical limit. Try a shorter or smaller MP4 if the tab runs out of memory.
- Vertical mode uses a center crop; it does not automatically track faces or reframe moving subjects.
- Cuts are chronological. The app does not yet use AI to detect highlights, add subtitles, or select viral moments.
- FFmpeg's WebAssembly engine is downloaded from jsDelivr when processing starts, so the browser needs an internet connection for the first processing run.
- Use content you own or are authorized to edit. This app does not bypass DRM or access restrictions.

## Tech

Vite, vanilla JavaScript, `@ffmpeg/ffmpeg`, `@ffmpeg/util`, FFmpeg WebAssembly core, and JSZip. GitHub Pages serves the static build from `dist/` using the included GitHub Actions workflow.
