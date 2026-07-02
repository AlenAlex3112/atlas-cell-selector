// Global State Variables
let surveyors = [];
let cells = [];
let assignments = {}; // key: cellId, value: [{ surveyorId, distance, band }]
let activeSurveyorId = null;
let map = null;
let cellLayers = {}; // key: cellId, value: Leaflet polygon layer
let surveyorMarkers = {}; // key: surveyorId, value: Leaflet marker
let tempClickMarker = null;

// Color palette for surveyors to distinguish pins on the map
const SURVEYOR_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6',
    '#f43f5e', '#06b6d4', '#14b8a6', '#64748b', '#a855f7'
];

// Initialize Leaflet Map
function initMap() {
    // Center of Kerala (10.4, 76.5)
    map = L.map('map', {
        zoomControl: true,
        attributionControl: true
    }).setView([10.4, 76.5], 8);

    // Dark Map tile layer (standard Leaflet dark tile style)
    const darkTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <br/>&copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    });
    
    // OpenStreetMap tile layer (alternative)
    const osmTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    // Satellite imagery layer
    const satelliteTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    // Add default tile layer
    darkTiles.addTo(map);

    // Layer selection control
    const baseMaps = {
        "Dark Mode Map": darkTiles,
        "OpenStreetMap": osmTiles,
        "Satellite": satelliteTiles
    };
    L.control.layers(baseMaps, null, { position: 'topleft' }).addTo(map);

    // Map Click Handler: If not clicking on a polygon, place a surveyor location pin
    map.on('click', function(e) {
        setTempSurveyorLocation(e.latlng.lat, e.latlng.lng);
    });
}

// Haversine Distance Formula (Kilometers)
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
              
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

// Band categorization based on distance
function getDistanceBand(distanceKm) {
    if (distanceKm < 10) {
        return { code: 'A', name: '< 10 km', color: 'var(--color-band-a)' };
    } else if (distanceKm >= 10 && distanceKm <= 30) {
        return { code: 'B', name: '10 - 30 km', color: 'var(--color-band-b)' };
    } else {
        return { code: 'C', name: '30+ km', color: 'var(--color-band-c)' };
    }
}

// Parse Google Maps URL or Coordinates
function parseLocationInput(input) {
    input = input.trim();
    if (!input) return null;

    // 1. Check for standard @latitude,longitude in Google Maps URLs
    const atRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    let match = input.match(atRegex);
    if (match) {
        return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
    }

    // 2. Check for query parameter q=latitude,longitude or query=latitude,longitude
    const queryRegex = /[?&](query|q)=(-?\d+\.\d+),(-?\d+\.\d+)/;
    match = input.match(queryRegex);
    if (match) {
        return { lat: parseFloat(match[2]), lon: parseFloat(match[3]) };
    }

    // 3. Check for maps.google.com/?ll=latitude,longitude
    const llRegex = /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/;
    match = input.match(llRegex);
    if (match) {
        return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
    }

    // 4. Check for comma-separated numbers (plain lat, lon)
    const plainRegex = /^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/;
    match = input.match(plainRegex);
    if (match) {
        return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
    }

    return null;
}

// Add temporary surveyor marker on map click
function setTempSurveyorLocation(lat, lon) {
    if (tempClickMarker) {
        map.removeLayer(tempClickMarker);
    }
    
    // Create temporary marker
    const tempIcon = L.divIcon({
        className: 'custom-temp-marker',
        html: `<div style="background-color: #ffffff; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #000; box-shadow: 0 0 8px #fff;"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });
    
    tempClickMarker = L.marker([lat, lon], { icon: tempIcon }).addTo(map);
    tempClickMarker.bindPopup("Selected location: <br><b>" + lat.toFixed(5) + ", " + lon.toFixed(5) + "</b><br>Added to surveyor form!").openPopup();
    
    // Update surveyor form location field
    document.getElementById('surveyor-location').value = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

// Parse KML text file content
function parseKMLData(kmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(kmlText, 'text/xml');
    
    // Check for XML parsing errors
    const parserError = xmlDoc.getElementsByTagName('parsererror');
    if (parserError.length > 0) {
        alert("Failed to parse KML file. Please ensure it is a valid XML file.");
        return [];
    }
    
    const placemarks = xmlDoc.getElementsByTagName('Placemark');
    const parsedCells = [];
    
    for (let i = 0; i < placemarks.length; i++) {
        const pm = placemarks[i];
        
        // Extract Name (defaults to index if missing)
        const nameEl = pm.getElementsByTagName('name')[0];
        const cellName = nameEl ? nameEl.textContent.trim() : `Subcell_${i+1}`;
        
        // Extract Polygon Coordinates
        const polygonEl = pm.getElementsByTagName('Polygon')[0];
        if (polygonEl) {
            const coordinatesEl = polygonEl.getElementsByTagName('coordinates')[0];
            if (coordinatesEl) {
                const coordString = coordinatesEl.textContent.trim();
                // Split by spaces or linebreaks to get points
                const coordArray = coordString.split(/\s+/);
                
                const points = [];
                let sumLat = 0;
                let sumLon = 0;
                
                coordArray.forEach(coord => {
                    const parts = coord.split(',');
                    if (parts.length >= 2) {
                        const lon = parseFloat(parts[0]);
                        const lat = parseFloat(parts[1]);
                        if (!isNaN(lat) && !isNaN(lon)) {
                            points.push({ lat, lon });
                            sumLat += lat;
                            sumLon += lon;
                        }
                    }
                });
                
                if (points.length > 0) {
                    const centroid = {
                        lat: sumLat / points.length,
                        lon: sumLon / points.length
                    };
                    
                    parsedCells.push({
                        id: cellName,
                        name: cellName,
                        type: 'polygon',
                        coordinates: points,
                        centroid: centroid
                    });
                }
            }
        } else {
            // Check for Point marker as fallback cell
            const pointEl = pm.getElementsByTagName('Point')[0];
            if (pointEl) {
                const coordinatesEl = pointEl.getElementsByTagName('coordinates')[0];
                if (coordinatesEl) {
                    const parts = coordinatesEl.textContent.trim().split(',');
                    if (parts.length >= 2) {
                        const lon = parseFloat(parts[0]);
                        const lat = parseFloat(parts[1]);
                        if (!isNaN(lat) && !isNaN(lon)) {
                            parsedCells.push({
                                id: cellName,
                                name: cellName,
                                type: 'point',
                                centroid: { lat, lon }
                            });
                        }
                    }
                }
            }
        }
    }
    
    return parsedCells;
}

// Display cells on Leaflet Map
function renderCellsOnMap() {
    // Clear previous cell layers from map
    for (const id in cellLayers) {
        map.removeLayer(cellLayers[id]);
    }
    cellLayers = {};

    cells.forEach(cell => {
        let layer;
        
        if (cell.type === 'polygon') {
            // Convert points array to Leaflet LatLng format
            const latLngs = cell.coordinates.map(p => [p.lat, p.lon]);
            
            // Draw Polygon
            layer = L.polygon(latLngs, getCellLayerStyle(cell.id));
        } else {
            // Draw Circle Marker for Point cell type
            layer = L.circleMarker([cell.centroid.lat, cell.centroid.lon], {
                radius: 8,
                weight: 2,
                opacity: 0.8,
                fillOpacity: 0.4,
                ...getCellLayerStyle(cell.id)
            });
        }
        
        // Add click event to cell layer
        layer.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            handleCellClick(cell);
        });
        
        // Add layer to map & state registry
        layer.addTo(map);
        cellLayers[cell.id] = layer;
        
        // Set basic tooltip
        layer.bindTooltip(cell.name, { sticky: true, className: 'cell-tooltip' });
    });
}

// Get the visual styling of a cell based on ownership and active surveyor status
function getCellLayerStyle(cellId) {
    const owners = assignments[cellId] || [];
    
    // Case 1: Unassigned cells
    if (owners.length === 0) {
        return {
            color: 'rgba(255, 255, 255, 0.25)',
            weight: 1.5,
            fillColor: 'transparent',
            fillOpacity: 0,
            dashArray: '3, 3'
        };
    }
    
    // Case 2: Assigned cells, check if active surveyor is one of the owners
    if (activeSurveyorId) {
        const activeOwner = owners.find(o => o.surveyorId === activeSurveyorId);
        if (activeOwner) {
            // Color based on active surveyor's distance band
            const bandInfo = getDistanceBand(activeOwner.distance);
            return {
                color: bandInfo.color,
                weight: 2.5,
                fillColor: bandInfo.color,
                fillOpacity: 0.5,
                dashArray: null
            };
        } else {
            // Cell owned by others, not active surveyor: show as dimmed ownership
            return {
                color: 'rgba(100, 116, 139, 0.4)',
                weight: 1.5,
                fillColor: 'rgba(100, 116, 139, 0.15)',
                fillOpacity: 0.25,
                dashArray: '1, 3'
            };
        }
    }
    
    // Case 3: Assigned cells, no active surveyor selected: color by closest distance band
    let closestBand = 'C';
    let bandColor = 'var(--color-band-c)';
    
    owners.forEach(owner => {
        const bandInfo = getDistanceBand(owner.distance);
        if (bandInfo.code === 'A') {
            closestBand = 'A';
            bandColor = bandInfo.color;
        } else if (bandInfo.code === 'B' && closestBand === 'C') {
            closestBand = 'B';
            bandColor = bandInfo.color;
        }
    });
    
    return {
        color: bandColor,
        weight: 2,
        fillColor: bandColor,
        fillOpacity: 0.4,
        dashArray: null
    };
}

// Update styling of all cells on the map
function updateAllCellStyles() {
    for (const cellId in cellLayers) {
        const layer = cellLayers[cellId];
        const style = getCellLayerStyle(cellId);
        layer.setStyle(style);
    }
}

// Handle Map clicks on Subcells
function handleCellClick(cell) {
    if (!activeSurveyorId) {
        // No active surveyor: show cell information popup with all owners
        showCellDetailsPopup(cell);
        return;
    }
    
    // Toggle active surveyor's ownership on this cell
    const surveyor = surveyors.find(s => s.id === activeSurveyorId);
    if (!surveyor) return;
    
    const owners = assignments[cell.id] || [];
    const isOwner = owners.some(o => o.surveyorId === activeSurveyorId);
    
    if (isOwner) {
        // Remove ownership
        assignments[cell.id] = owners.filter(o => o.surveyorId !== activeSurveyorId);
        if (assignments[cell.id].length === 0) {
            delete assignments[cell.id];
        }
    } else {
        // Add ownership
        const distance = calculateHaversineDistance(
            surveyor.lat, surveyor.lon,
            cell.centroid.lat, cell.centroid.lon
        );
        const band = getDistanceBand(distance).code;
        
        if (!assignments[cell.id]) {
            assignments[cell.id] = [];
        }
        assignments[cell.id].push({
            surveyorId: activeSurveyorId,
            distance: distance,
            band: band
        });
    }
    
    // Save to local storage
    saveState();
    
    // Update map style and tables
    updateAllCellStyles();
    updateActiveSurveyorPanel();
    updateAppStats();
    
    // Show quick Leaflet popup summarizing status
    showCellDetailsPopup(cell);
}

// Display detailed Popup on cell click
function showCellDetailsPopup(cell) {
    const layer = cellLayers[cell.id];
    if (!layer) return;
    
    const owners = assignments[cell.id] || [];
    let ownersHTML = '';
    
    if (owners.length === 0) {
        ownersHTML = `<div class="empty-state" style="padding:8px; margin-top:5px;">No surveyors have assigned this cell yet.</div>`;
    } else {
        ownersHTML = '<ul class="popup-owners-list">';
        owners.forEach(owner => {
            const surveyor = surveyors.find(s => s.id === owner.surveyorId);
            const surveyorName = surveyor ? surveyor.name : "Unknown";
            const bandInfo = getDistanceBand(owner.distance);
            
            ownersHTML += `
                <li class="popup-owner-item">
                    <span style="display:flex; align-items:center; gap:6px;">
                        <span style="width:8px; height:8px; border-radius:50%; background-color:${surveyor ? surveyor.color : '#fff'}; display:inline-block;"></span>
                        <strong>${escapeHTML(surveyorName)}</strong>
                    </span>
                    <span class="band-badge ${bandInfo.code.toLowerCase()}">${bandInfo.name} (${owner.distance.toFixed(1)} km)</span>
                </li>
            `;
        });
        ownersHTML += '</ul>';
    }
    
    let activeActionTip = '';
    if (activeSurveyorId) {
        const surveyor = surveyors.find(s => s.id === activeSurveyorId);
        const isOwner = owners.some(o => o.surveyorId === activeSurveyorId);
        activeActionTip = `
            <div class="popup-instructions">
                Click this cell again to <strong>${isOwner ? 'REMOVE' : 'ASSIGN'}</strong> ownership for <b>${escapeHTML(surveyor.name)}</b>.
            </div>
        `;
    } else {
        activeActionTip = `
            <div class="popup-instructions">
                Select a surveyor in the sidebar to paint/assign ownership on the map.
            </div>
        `;
    }
    
    const popupContent = `
        <div class="popup-cell-container">
            <div class="popup-cell-title">${escapeHTML(cell.name)}</div>
            <div style="font-size:0.7rem; color:var(--text-secondary); margin-bottom: 8px;">
                Centroid: ${cell.centroid.lat.toFixed(5)}, ${cell.centroid.lon.toFixed(5)}
            </div>
            <div style="font-size:0.75rem; font-weight:600; color:#fff;">Surveyor Ownerships:</div>
            ${ownersHTML}
            ${activeActionTip}
        </div>
    `;
    
    layer.bindPopup(popupContent, { maxWidth: 300 }).openPopup();
}

// Render list of registered surveyors in the left panel
function renderSurveyorsList() {
    const container = document.getElementById('surveyors-list-container');
    const countBadge = document.getElementById('badge-surveyors-count');
    
    countBadge.textContent = surveyors.length;
    
    if (surveyors.length === 0) {
        container.innerHTML = `<div class="empty-state">No surveyors added yet. Use the form above to register participants.</div>`;
        return;
    }
    
    container.innerHTML = '';
    
    surveyors.forEach(surveyor => {
        // Count cell ownerships
        let cellCount = 0;
        for (const cellId in assignments) {
            if (assignments[cellId].some(o => o.surveyorId === surveyor.id)) {
                cellCount++;
            }
        }
        
        const isSelected = surveyor.id === activeSurveyorId;
        const item = document.createElement('div');
        item.className = `surveyor-item ${isSelected ? 'active' : ''}`;
        
        item.innerHTML = `
            <div class="surveyor-info">
                <span class="surveyor-dot" style="background-color: ${surveyor.color}; box-shadow: 0 0 6px ${surveyor.color};"></span>
                <div>
                    <div class="surveyor-name-text">${escapeHTML(surveyor.name)}</div>
                    <div class="surveyor-sub-text">${cellCount} cell(s) owned &bull; ${surveyor.lat.toFixed(4)}, ${surveyor.lon.toFixed(4)}</div>
                </div>
            </div>
            <div class="surveyor-actions">
                <button class="btn-delete-surveyor" title="Delete Surveyor" data-id="${surveyor.id}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>
                    </svg>
                </button>
            </div>
        `;
        
        // Select surveyor on card click
        item.addEventListener('click', function(e) {
            // Don't select if they clicked the delete button
            if (e.target.closest('.btn-delete-surveyor')) return;
            selectSurveyor(surveyor.id);
        });
        
        // Delete surveyor click handler
        item.querySelector('.btn-delete-surveyor').addEventListener('click', function(e) {
            e.stopPropagation();
            deleteSurveyor(surveyor.id);
        });
        
        container.appendChild(item);
    });
}

// Select a surveyor to assign cells
function selectSurveyor(id) {
    if (activeSurveyorId === id) {
        // Toggle selection off if clicking the active surveyor again
        activeSurveyorId = null;
    } else {
        activeSurveyorId = id;
    }
    
    // Save to local storage
    saveState();
    
    // Update UI elements
    renderSurveyorsList();
    updateSurveyorMarkersHighlight();
    updateAllCellStyles();
    updateActiveSurveyorPanel();
    
    // Remove temporary marker if active surveyor changed
    if (tempClickMarker) {
        map.removeLayer(tempClickMarker);
        tempClickMarker = null;
    }
}

// Add surveyor markers (pins) to map
function renderSurveyorMarkersOnMap() {
    // Clear old markers
    for (const id in surveyorMarkers) {
        map.removeLayer(surveyorMarkers[id]);
    }
    surveyorMarkers = {};
    
    surveyors.forEach(surveyor => {
        const isSelected = surveyor.id === activeSurveyorId;
        
        const pinIcon = L.divIcon({
            className: `surveyor-map-pin ${isSelected ? 'active' : ''}`,
            html: `
                <div style="
                    background-color: ${surveyor.color}; 
                    width: ${isSelected ? '18px' : '12px'}; 
                    height: ${isSelected ? '18px' : '12px'}; 
                    border-radius: 50%; 
                    border: 2px solid #ffffff; 
                    box-shadow: 0 0 ${isSelected ? '12px' : '6px'} ${surveyor.color};
                    transition: all 0.2s ease-in-out;
                "></div>
            `,
            iconSize: isSelected ? [18, 18] : [12, 12],
            iconAnchor: isSelected ? [9, 9] : [6, 6]
        });
        
        const marker = L.marker([surveyor.lat, surveyor.lon], { icon: pinIcon })
            .bindTooltip(`Surveyor: ${surveyor.name}`, { permanent: false, direction: 'top' })
            .addTo(map);
            
        // Select surveyor when clicking their map pin
        marker.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            selectSurveyor(surveyor.id);
        });
        
        surveyorMarkers[surveyor.id] = marker;
    });
}

// Refresh surveyor pins visual sizes/glows without clearing all layers
function updateSurveyorMarkersHighlight() {
    surveyors.forEach(surveyor => {
        const marker = surveyorMarkers[surveyor.id];
        if (!marker) return;
        
        const isSelected = surveyor.id === activeSurveyorId;
        
        const pinIcon = L.divIcon({
            className: `surveyor-map-pin ${isSelected ? 'active' : ''}`,
            html: `
                <div style="
                    background-color: ${surveyor.color}; 
                    width: ${isSelected ? '18px' : '12px'}; 
                    height: ${isSelected ? '18px' : '12px'}; 
                    border-radius: 50%; 
                    border: 2px solid #ffffff; 
                    box-shadow: 0 0 ${isSelected ? '12px' : '6px'} ${surveyor.color};
                    transition: all 0.2s ease-in-out;
                "></div>
            `,
            iconSize: isSelected ? [18, 18] : [12, 12],
            iconAnchor: isSelected ? [9, 9] : [6, 6]
        });
        
        marker.setIcon(pinIcon);
        if (isSelected) {
            marker.setZIndexOffset(1000); // bring active surveyor pin to front
        } else {
            marker.setZIndexOffset(0);
        }
    });
}

// Add a new surveyor from form coordinates/Google URL
function handleSurveyorSubmit(e) {
    e.preventDefault();
    
    const nameInput = document.getElementById('surveyor-name');
    const locationInput = document.getElementById('surveyor-location');
    
    const name = nameInput.value.trim();
    const locationStr = locationInput.value.trim();
    
    const coords = parseLocationInput(locationStr);
    
    if (!coords) {
        alert("Invalid Location! Please enter valid coordinates (Latitude, Longitude) or paste a valid Google Maps URL.");
        return;
    }
    
    // Generate a unique ID and assign a color
    const surveyorId = 'surveyor_' + Date.now();
    const color = SURVEYOR_COLORS[surveyors.length % SURVEYOR_COLORS.length];
    
    const newSurveyor = {
        id: surveyorId,
        name: name,
        lat: coords.lat,
        lon: coords.lon,
        color: color,
        googleUrl: locationStr.startsWith('http') ? locationStr : ''
    };
    
    surveyors.push(newSurveyor);
    
    // Clear forms and temporary map markers
    nameInput.value = '';
    locationInput.value = '';
    if (tempClickMarker) {
        map.removeLayer(tempClickMarker);
        tempClickMarker = null;
    }
    
    // Auto-select the newly added surveyor
    activeSurveyorId = surveyorId;
    
    // Save to local storage
    saveState();
    
    // Render and refresh UI
    renderSurveyorsList();
    renderSurveyorMarkersOnMap();
    updateAllCellStyles();
    updateActiveSurveyorPanel();
    updateAppStats();
    
    // Center map on the newly added surveyor
    map.setView([newSurveyor.lat, newSurveyor.lon], 11);
}

// Delete Surveyor and clear their cell assignments
function deleteSurveyor(id) {
    if (!confirm("Are you sure you want to delete this surveyor? All of their cell survey assignments will be removed.")) {
        return;
    }
    
    // Remove surveyor from array
    surveyors = surveyors.filter(s => s.id !== id);
    
    // Clear surveyor's cell assignments
    for (const cellId in assignments) {
        assignments[cellId] = assignments[cellId].filter(o => o.surveyorId !== id);
        if (assignments[cellId].length === 0) {
            delete assignments[cellId];
        }
    }
    
    // If deleted surveyor was the active one, clear selection
    if (activeSurveyorId === id) {
        activeSurveyorId = null;
    }
    
    // Save to local storage
    saveState();
    
    // Render and refresh UI
    renderSurveyorsList();
    renderSurveyorMarkersOnMap();
    updateAllCellStyles();
    updateActiveSurveyorPanel();
    updateAppStats();
}

// Update Right Panel display for currently active surveyor
function updateActiveSurveyorPanel() {
    const activePanel = document.getElementById('active-surveyor-panel');
    const inactivePanel = document.getElementById('no-active-surveyor-panel');
    
    if (!activeSurveyorId) {
        activePanel.classList.add('d-none');
        inactivePanel.classList.remove('d-none');
        return;
    }
    
    activePanel.classList.remove('d-none');
    inactivePanel.classList.add('d-none');
    
    const surveyor = surveyors.find(s => s.id === activeSurveyorId);
    if (!surveyor) return;
    
    // Update headers and coordinates
    document.getElementById('active-surveyor-title').textContent = surveyor.name;
    document.getElementById('active-surveyor-subtitle').textContent = `${surveyor.lat.toFixed(5)}, ${surveyor.lon.toFixed(5)}`;
    
    const colorIndicator = document.getElementById('active-surveyor-color');
    colorIndicator.style.color = surveyor.color;
    colorIndicator.style.backgroundColor = surveyor.color;
    
    // Calculate surveyor cells and bands count
    const surveyorCells = [];
    let bandACount = 0;
    let bandBCount = 0;
    let bandCCount = 0;
    
    for (const cellId in assignments) {
        const activeOwner = assignments[cellId].find(o => o.surveyorId === activeSurveyorId);
        if (activeOwner) {
            const cell = cells.find(c => c.id === cellId);
            if (cell) {
                surveyorCells.push({
                    cellId: cellId,
                    cellName: cell.name,
                    distance: activeOwner.distance,
                    band: activeOwner.band
                });
                
                if (activeOwner.band === 'A') bandACount++;
                else if (activeOwner.band === 'B') bandBCount++;
                else if (activeOwner.band === 'C') bandCCount++;
            }
        }
    }
    
    // Sort cells by distance ascending
    surveyorCells.sort((a, b) => a.distance - b.distance);
    
    // Update band stats counters
    document.getElementById('count-band-a').textContent = bandACount;
    document.getElementById('count-band-b').textContent = bandBCount;
    document.getElementById('count-band-c').textContent = bandCCount;
    
    // Render list table
    const tableBody = document.getElementById('table-assignments-body');
    const emptyState = document.getElementById('assignments-empty-state');
    
    if (surveyorCells.length === 0) {
        tableBody.innerHTML = '';
        emptyState.classList.remove('d-none');
    } else {
        emptyState.classList.add('d-none');
        tableBody.innerHTML = '';
        
        surveyorCells.forEach(item => {
            const bandInfo = getDistanceBand(item.distance);
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td><strong>${escapeHTML(item.cellName)}</strong></td>
                <td>${item.distance.toFixed(1)} km</td>
                <td><span class="band-badge ${item.band.toLowerCase()}">${bandInfo.name}</span></td>
                <td>
                    <button class="btn-delete-assignment btn-delete-surveyor" title="Remove Assignment" data-cellid="${item.cellId}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41Z" fill="currentColor"/>
                        </svg>
                    </button>
                </td>
            `;
            
            // Delete specific cell assignment click handler
            row.querySelector('.btn-delete-assignment').addEventListener('click', function(e) {
                e.stopPropagation();
                removeCellAssignment(item.cellId, activeSurveyorId);
            });
            
            // Hover zoom interaction: Hovering list highlights the cell on the map
            row.addEventListener('mouseenter', () => {
                highlightCellOnMap(item.cellId, true);
            });
            row.addEventListener('mouseleave', () => {
                highlightCellOnMap(item.cellId, false);
            });
            
            tableBody.appendChild(row);
        });
    }
}

// Hover visual highlight effect on Leaflet map
function highlightCellOnMap(cellId, isHighlighted) {
    const layer = cellLayers[cellId];
    if (!layer) return;
    
    if (isHighlighted) {
        layer.setStyle({
            weight: 4,
            fillOpacity: 0.75
        });
    } else {
        layer.setStyle(getCellLayerStyle(cellId));
    }
}

// Remove cell assignment for a specific surveyor
function removeCellAssignment(cellId, surveyorId) {
    if (!assignments[cellId]) return;
    
    assignments[cellId] = assignments[cellId].filter(o => o.surveyorId !== surveyorId);
    if (assignments[cellId].length === 0) {
        delete assignments[cellId];
    }
    
    // Save to local storage
    saveState();
    
    // Render and refresh UI
    updateAllCellStyles();
    updateActiveSurveyorPanel();
    updateAppStats();
}

// Clear all assignments for active surveyor
function clearActiveSurveyorAssignments() {
    if (!activeSurveyorId) return;
    const surveyor = surveyors.find(s => s.id === activeSurveyorId);
    if (!surveyor) return;
    
    if (!confirm(`Are you sure you want to clear all grid subcell ownerships for ${surveyor.name}?`)) {
        return;
    }
    
    for (const cellId in assignments) {
        assignments[cellId] = assignments[cellId].filter(o => o.surveyorId !== activeSurveyorId);
        if (assignments[cellId].length === 0) {
            delete assignments[cellId];
        }
    }
    
    // Save to local storage
    saveState();
    
    // Render and refresh UI
    updateAllCellStyles();
    updateActiveSurveyorPanel();
    updateAppStats();
}

// Update Top header summary numbers
function updateAppStats() {
    document.getElementById('stat-total-cells').querySelector('.stat-value').textContent = cells.length;
    document.getElementById('stat-total-surveyors').querySelector('.stat-value').textContent = surveyors.length;
    
    // Calculate total uniquely assigned cells
    const assignedCellCount = Object.keys(assignments).length;
    document.getElementById('stat-assigned-cells').querySelector('.stat-value').textContent = assignedCellCount;
}

// Download CSV Data Summary
function downloadCSV() {
    if (surveyors.length === 0) {
        alert("No surveyor records found. Please add surveyors and assign cells before exporting.");
        return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,";
    
    // CSV Header Columns
    csvContent += "Surveyor Name,Surveyor Latitude,Surveyor Longitude,Cell ID,Cell Name,Distance (km),Distance Band\r\n";
    
    let assignmentCount = 0;
    
    // Write surveyor cell assignments rows
    for (const cellId in assignments) {
        const cell = cells.find(c => c.id === cellId);
        if (!cell) continue;
        
        assignments[cellId].forEach(owner => {
            const surveyor = surveyors.find(s => s.id === owner.surveyorId);
            if (!surveyor) return;
            
            const bandInfo = getDistanceBand(owner.distance);
            
            // Escape values containing commas or quotes
            const surveyorName = `"${surveyor.name.replace(/"/g, '""')}"`;
            const cellName = `"${cell.name.replace(/"/g, '""')}"`;
            const distance = owner.distance.toFixed(3);
            const bandName = `"${bandInfo.name.replace(/"/g, '""')}"`;
            
            csvContent += `${surveyorName},${surveyor.lat},${surveyor.lon},${cell.id},${cellName},${distance},${bandName}\r\n`;
            assignmentCount++;
        });
    }
    
    // Write surveyors who have 0 assignments as separate lines
    surveyors.forEach(surveyor => {
        let hasAssignments = false;
        for (const cellId in assignments) {
            if (assignments[cellId].some(o => o.surveyorId === surveyor.id)) {
                hasAssignments = true;
                break;
            }
        }
        
        if (!hasAssignments) {
            const surveyorName = `"${surveyor.name.replace(/"/g, '""')}"`;
            csvContent += `${surveyorName},${surveyor.lat},${surveyor.lon},,,0,Unassigned\r\n`;
        }
    });

    // Create browser file download trigger
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    
    const timestamp = new Date().toISOString().slice(0,10);
    link.setAttribute("download", `kerala_bird_atlas_assignments_${timestamp}.csv`);
    document.body.appendChild(link); // Required for FF
    
    link.click();
    document.body.removeChild(link);
}

// Adjust map bounds to display the entire loaded subcell grid
function fitMapToGrid() {
    if (cells.length === 0) return;
    
    const latLngs = [];
    cells.forEach(cell => {
        latLngs.push([cell.centroid.lat, cell.centroid.lon]);
    });
    
    const bounds = L.latLngBounds(latLngs);
    map.fitBounds(bounds, { padding: [30, 30] });
}

// Load KML files processed from drag-and-drop or select inputs
function loadKMLFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const kmlText = e.target.result;
        const parsed = parseKMLData(kmlText);
        
        if (parsed.length === 0) {
            alert("No cells detected in KML file. Ensure that the KML file contains Placemarks with Polygon boundary rings or Point locations.");
            return;
        }
        
        cells = parsed;
        
        // Retain only cell assignments that exist in the newly loaded cells grid
        const cleanedAssignments = {};
        for (const cellId in assignments) {
            if (cells.some(c => c.id === cellId)) {
                cleanedAssignments[cellId] = assignments[cellId];
            }
        }
        assignments = cleanedAssignments;
        
        // Re-calculate distances for existing assignments in case centroid locations shifted
        recalculateAllDistances();
        
        // Save to local storage
        saveState();
        
        // Render UI
        renderCellsOnMap();
        updateAllCellStyles();
        updateActiveSurveyorPanel();
        updateAppStats();
        fitMapToGrid();
    };
    reader.readAsText(file);
}

// Recalculate all distances and bands for active assignments
function recalculateAllDistances() {
    for (const cellId in assignments) {
        const cell = cells.find(c => c.id === cellId);
        if (!cell) continue;
        
        assignments[cellId].forEach(owner => {
            const surveyor = surveyors.find(s => s.id === owner.surveyorId);
            if (surveyor) {
                const distance = calculateHaversineDistance(
                    surveyor.lat, surveyor.lon,
                    cell.centroid.lat, cell.centroid.lon
                );
                owner.distance = distance;
                owner.band = getDistanceBand(distance).code;
            }
        });
    }
}



// Reset entire dashboard
function resetApplication() {
    if (!confirm("Are you sure you want to reset all dashboard data? This will clear all loaded cells, surveyors, and assignments.")) {
        return;
    }
    
    // Reset memory state
    surveyors = [];
    cells = [];
    assignments = {};
    activeSurveyorId = null;
    
    // Clear map layers
    for (const id in cellLayers) {
        map.removeLayer(cellLayers[id]);
    }
    cellLayers = {};
    
    for (const id in surveyorMarkers) {
        map.removeLayer(surveyorMarkers[id]);
    }
    surveyorMarkers = {};
    
    if (tempClickMarker) {
        map.removeLayer(tempClickMarker);
        tempClickMarker = null;
    }
    
    // Clear localStorage
    localStorage.removeItem('kba_dashboard_state');
    
    // Refresh interfaces
    renderSurveyorsList();
    updateActiveSurveyorPanel();
    updateAppStats();
    
    // Set map back to Kerala center
    map.setView([10.4, 76.5], 8);
    alert("Application data reset successfully.");
}

// Save application state to LocalStorage
function saveState() {
    const selectEl = document.getElementById('district-select');
    const state = {
        surveyors: surveyors,
        cells: cells,
        assignments: assignments,
        activeSurveyorId: activeSurveyorId,
        selectedDistrict: selectEl ? selectEl.value : ""
    };
    localStorage.setItem('kba_dashboard_state', JSON.stringify(state));
}

// Load application state from LocalStorage
function loadState() {
    const saved = localStorage.getItem('kba_dashboard_state');
    if (!saved) return false;
    
    try {
        const state = JSON.parse(saved);
        surveyors = state.surveyors || [];
        cells = state.cells || [];
        assignments = state.assignments || {};
        activeSurveyorId = state.activeSurveyorId || null;
        
        // Restore dropdown value
        const selectEl = document.getElementById('district-select');
        if (selectEl && state.selectedDistrict) {
            selectEl.value = state.selectedDistrict;
        }
        return true;
    } catch (e) {
        console.error("Failed to load saved state", e);
        return false;
    }
}

// Escape HTML utility to prevent XSS in dynamic renders
function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Load a district KML file from the server/repo
function loadDistrictKML(districtName) {
    const filePath = `kml/${districtName}.kml`;
    
    const selectEl = document.getElementById('district-select');
    selectEl.disabled = true;
    
    fetch(filePath)
        .then(response => {
            if (!response.ok) {
                throw new Error(`KML file not found: ${filePath}. Make sure the file exists in the kml/ directory of your host.`);
            }
            return response.text();
        })
        .then(kmlText => {
            const parsed = parseKMLData(kmlText);
            
            if (parsed.length === 0) {
                throw new Error("No cells detected in KML file.");
            }
            
            cells = parsed;
            
            // Retain only cell assignments that exist in the newly loaded cells grid
            const cleanedAssignments = {};
            for (const cellId in assignments) {
                if (cells.some(c => c.id === cellId)) {
                    cleanedAssignments[cellId] = assignments[cellId];
                }
            }
            assignments = cleanedAssignments;
            
            // Re-calculate distances for existing assignments
            recalculateAllDistances();
            
            // Save to local storage
            saveState();
            
            // Render UI
            renderCellsOnMap();
            updateAllCellStyles();
            updateActiveSurveyorPanel();
            updateAppStats();
            fitMapToGrid();
            
            // Reset temp markers
            if (tempClickMarker) {
                map.removeLayer(tempClickMarker);
                tempClickMarker = null;
            }
        })
        .catch(err => {
            console.error(err);
            alert("Error loading district: " + err.message + "\n\nNote: Auto-loading district grids requires serving the dashboard from a web server (like python -m http.server or hosted on GitHub). Direct file opening (file://) blocks this due to browser CORS policies. Please use the 'Drag & drop' or 'Browse Files' button above to upload KML files locally.");
            // Reset selector
            selectEl.value = "";
        })
        .finally(() => {
            selectEl.disabled = false;
        });
}

// Setup Event Listeners
function setupEventListeners() {
    // District Dropdown Change Selector
    document.getElementById('district-select').addEventListener('change', function(e) {
        if (e.target.value) {
            loadDistrictKML(e.target.value);
        }
    });

    // KML File Input Select
    document.getElementById('kml-file-input').addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            // Reset district dropdown when manual file is selected
            const selectEl = document.getElementById('district-select');
            if (selectEl) selectEl.value = "";
            loadKMLFile(e.target.files[0]);
        }
    });
    
    // Drag & Drop Handlers
    const uploadZone = document.getElementById('kml-upload-zone');
    
    uploadZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });
    
    uploadZone.addEventListener('dragleave', function() {
        uploadZone.classList.remove('dragover');
    });
    
    uploadZone.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            // Reset district dropdown when manual file is selected
            const selectEl = document.getElementById('district-select');
            if (selectEl) selectEl.value = "";
            loadKMLFile(e.dataTransfer.files[0]);
        }
    });
    
    // Click upload zone trigger
    uploadZone.addEventListener('click', function(e) {
        // Prevent click trigger loop if they click on browse label button
        if (e.target.tagName !== 'LABEL' && e.target.tagName !== 'INPUT') {
            document.getElementById('kml-file-input').click();
        }
    });

    
    // Surveyor Form Submission
    document.getElementById('form-surveyor').addEventListener('submit', handleSurveyorSubmit);
    
    // Clean assignments buttons
    document.getElementById('btn-clear-assignments').addEventListener('click', clearActiveSurveyorAssignments);
    
    // Export CSV Download button
    document.getElementById('btn-download-csv').addEventListener('click', downloadCSV);
    
    // Fit bounds Map control
    document.getElementById('btn-fit-bounds').addEventListener('click', fitMapToGrid);
    
    // Reset App configuration button
    document.getElementById('btn-reset-app').addEventListener('click', resetApplication);
}

// App Initialization entrypoint
document.addEventListener('DOMContentLoaded', function() {
    // 1. Initialize Map view
    initMap();
    
    // 2. Setup Event listener bindings
    setupEventListeners();
    
    // 3. Load from LocalStorage if data exists
    if (loadState()) {
        renderSurveyorsList();
        renderSurveyorMarkersOnMap();
        renderCellsOnMap();
        updateAllCellStyles();
        updateActiveSurveyorPanel();
        updateAppStats();
        
        if (cells.length > 0) {
            fitMapToGrid();
        }
    } else {
        // First load: set active surveyor panel empty state
        updateActiveSurveyorPanel();
    }
});
