# StringArt Studio for iPhone

An installable, offline iPhone app (a Progressive Web App). The whole engine runs **on the phone**:
there's no server and no account, and photos never leave the device.

## Install on your iPhone

1. Open the app's address in **Safari** (see "Publishing" below), for example
   `https://emontesinop.github.io/Keter13/`.
2. Tap **Share** (the square with the arrow), then **Add to Home Screen**, then **Add**.
3. Launch it from the home screen. It opens full screen like a normal app and keeps working offline
   after the first launch.

Your projects are stored on the iPhone (IndexedDB). Deleting the home-screen app also deletes them.
Export the sequence file to keep a backup.

## What it does

* **New from photo**: pick a photo from your library or take one. Drag and pinch to frame it inside
  the circle.
* **Tone, Board, Thread**: adjust contrast and detail; choose the board (circle or square, size,
  100–500 nails, numbering); choose the thread (white on black, black on white, red, wood, custom
  colours, or multi-colour CMYK/RGB palettes).
* **Create**: the optimiser runs on-device in a background thread with a live preview. It usually
  takes 1–5 seconds. You get one continuous thread per colour, no repeated connection, and the route
  is verified automatically.
* **Build mode**: huge "from → to" nail numbers, the nail's clock position ("nail 170 is at
  6:46"), the next nail, and a mini board with the current thread highlighted. Large Next/Back
  buttons, optional voice read-out and auto-advance. The screen stays on and progress is saved, so
  you can stop and resume any time.
* **Export & share** (through the iOS share sheet: Files, AirDrop, Mail…): sequence CSV,
  full-scale nail template SVG, artwork PNG, nail coordinates CSV, and the sequence JSON.
* **Import** a sequence file made by the desktop app to build it with the phone.

## Publishing (once)

The workflow `.github/workflows/stringart-mobile-pages.yml` builds and publishes the app to GitHub
Pages whenever `stringart-studio/mobile` changes on `main`.

1. GitHub → repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Merge this branch into `main`, or run the workflow by hand from the **Actions** tab.
3. The address appears in the workflow run and in Settings → Pages, for example
   `https://emontesinop.github.io/Keter13/`.

Any other static HTTPS host also works: upload the contents of `dist/` after `npm run build`.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173, plus a LAN address you can open on the phone
npm run build      # -> dist/
```

On a local network address (http) the app works, but iOS only enables offline mode and home-screen
installation over HTTPS.

## Differences from the desktop app

The engine is a TypeScript port of the desktop engine: the same thread physics, tone mapping,
greedy optimiser, colour unmixing and route validation. To stay fast and small on a phone it leaves
out face detection and background removal (you frame by hand), the hybrid multi-section strategy,
bridge proposals, PDF manuals, DXF/G-code and MP4/GIF export. For those, use the desktop app and
import its sequence file here to build.

A native App Store app would need a Mac with Xcode and an Apple Developer account ($99/year). This
PWA can later be wrapped with Capacitor for that, without changing the code.
