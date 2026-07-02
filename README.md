# Kerala Bird Atlas Subcell Mapping & Assignment Dashboard

A modern, high-fidelity, and fully client-side interactive map and dashboard designed for the **Kerala Bird Atlas (KBA)** project. This dashboard allows survey coordinators to select from 14 pre-bundled district subcell grids, upload new subcell grid boundaries (KML format), register surveyors with their home locations (by pasting Google Maps links or coordinates), automatically calculate distances, assign cells in bands, and export the entire assignment manifest to a CSV file.

Live dashboard ready to run locally or deploy directly to **GitHub Pages**!

---

## 🌟 Key Features

1. **Pre-Bundled Kerala Districts Grids**:
   - Contains all **14 district KML boundary files** for Kerala in the `kml/` directory.
   - Select any district from the dropdown (e.g. Alappuzha, Ernakulam, Thrissur, Wayanad) to automatically download, render, and focus on that district's subcells (*requires running via a local server or GitHub Pages*).
   - Local state persistence automatically remembers the last selected district on reload.

2. **Interactive Geographic Map (Leaflet.js)**:
   - Beautiful dark-mode vector rendering of subcells.
   - Interactive zoom, search boundary framing, and base layer controls (Dark Mode, OpenStreetMap, Satellite Imagery).
   
3. **Flexible KML Processing**:
   - Parse subcell polygon coordinates and automatically compute cell centroids on the client side (using `DOMParser`).
   - Supports drag-and-drop or browsing for KML files (e.g. from the `Kerala_Bird_Atlas_KML` folder on your Desktop) to load custom grids locally via `file://`.

4. **Google Maps Link Coordinates Extractor**:
   - Survey coordinators can paste a Google Maps location URL (copied from mobile or desktop apps) directly.
   - The regex-based parser extracts exact decimal coordinates (`latitude, longitude`) automatically.
   - Users can also click anywhere on the map to pin/set a surveyor's home coordinates.

5. **Multi-Owner Support & Distance Banding**:
   - Distance from a surveyor's home coordinates to the cell's centroid is calculated using the **Haversine formula**.
   - Cells are categorized into color-coded distance bands:
     - 🟢 **Band 1 (< 10 km)**: Close proximity (ideal)
     - 🟡 **Band 2 (10 - 30 km)**: Intermediate distance
     - 🔴 **Band 3 (30+ km)**: Far/Commute distance
   - One cell can have **multiple owners**. The map popup displays all registered owners, their distances, and respective bands.
   - Map colors dynamically refresh to highlight cell availability and assignment bands.

6. **Instant CSV Export**:
   - Download the complete summary table at any point with one click.
   - Exports columns: `Surveyor Name`, `Surveyor Latitude`, `Surveyor Longitude`, `Cell ID`, `Cell Name`, `Distance (km)`, `Distance Band`.

7. **Local Storage Auto-Save**:
   - All state (surveyors, cell definitions, assignments, and active selections) is saved in the browser's `localStorage`.
   - Data persists across browser refreshes so coordinators never lose their progress.

---

## 📂 File Structure

```
kerala-bird-atlas-map/
├── index.html        # Main dashboard UI structure
├── styles.css        # Custom dark forest green theme, glassmorphic layout & badges
├── app.js            # Leaflet map config, coordinates parsing, math engine, state & CSV logic
├── README.md         # Instructions and documentation
└── kml/              # 14 pre-loaded district KML files
    ├── Alappuzha.kml
    ├── Ernakulam.kml
    ├── Idukki.kml
    ...
```

---

## 🚀 How to Run Locally

Because the application is built entirely using vanilla web technologies and loads external dependencies (Leaflet.js) via secure CDNs, **no database is required**.

### Option A: Local Web Server (Recommended)
To support autoloading district grids via the dropdown, serve the folder using a local server to prevent browser CORS blocks on `file://` fetches:
- **Python 3**: Run `python -m http.server 8000` in the directory, then visit `http://localhost:8000`.
- **NodeJS**: Run `npx http-server` in the directory, then visit `http://localhost:8080`.

### Option B: Direct File Open (`file://`)
If opening `index.html` directly (without a server):
- Use **"Drag & drop KML file"** or **"Browse Files"** to load district KML files directly from your Desktop (this bypasses CORS blocks because it uses local HTML5 `FileReader`).

---

## 🌐 How to Host on GitHub (GitHub Pages)

You can host this package for free on GitHub Pages in under a minute:

1. Create a new repository on your GitHub account (e.g. `kerala-bird-atlas-dashboard`).
2. Initialize git and push these files to your repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of KBA mapping dashboard"
   git remote add origin https://github.com/your-username/kerala-bird-atlas-dashboard.git
   git branch -M main
   git push -u origin main
   ```
3. Enable GitHub Pages:
   - On GitHub, navigate to your repository's **Settings** tab.
   - Select **Pages** from the left sidebar.
   - Under **Build and deployment**, set the Source to **Deploy from a branch**.
   - Select the `main` branch and folder `/ (root)`, then click **Save**.
4. Within a few seconds, your dashboard will be live at:
   `https://your-username.github.io/kerala-bird-atlas-dashboard/`
   *(At this address, all district autoload select options will work perfectly!)*
