import {
    CONSTANTS,
    TRANSFER_MODES,
    calculateOptimalLaunchDay,
    getDistance,
    getLaunchGeometry,
    getModeDeltaV,
    getPlanetPosition,
    getSpacecraftVelocity,
    getTransferPosition,
} from './simulation.mjs';

const elements = Object.fromEntries([
    'orbitCanvas', 'totalDistance', 'fuelUsed', 'missionDay', 'headerStatus', 'modeBadge',
    'currentPhase', 'targetPhase', 'geometryStatus', 'alignmentMarker', 'launchWindow',
    'launchValue', 'speedSlider', 'speedValue', 'modeSummary', 'missionParams',
    'startTransfer', 'pauseButton', 'resetSimulation', 'missionStatus', 'distance',
    'velocity', 'marsDistance', 'progressText', 'progressBar', 'progressFill', 'stateTag',
    'generateBrief', 'missionDialog', 'briefContent', 'closeDialog', 'notification',
    'zoomIn', 'zoomOut', 'resetView', 'findWindow',
].map((id) => [id, document.getElementById(id)]));

const canvas = elements.orbitCanvas;
const context = canvas.getContext('2d');
const palette = {
    ink: '#05090d',
    grid: 'rgba(152, 164, 173, 0.08)',
    gridStrong: 'rgba(152, 164, 173, 0.17)',
    paper: '#ece7de',
    muted: '#98a4ad',
    quiet: '#687680',
    sun: '#e7b65a',
    earth: '#6aa5da',
    earthLand: '#76b48a',
    mars: '#d45b3e',
    marsLight: '#ef8a68',
    marsDark: '#8f392a',
    vector: '#62c8c9',
    success: '#77c69a',
    danger: '#e87967',
};

let currentMode = TRANSFER_MODES.hohmann;
let launchDay = Math.round(calculateOptimalLaunchDay(currentMode));
let animationSpeed = 24;
let simulatedDays = 0;
let isPaused = true;
let spacecraft = createSpacecraft();
let missionOutcome = null;
let lastTimestamp = 0;
let notificationTimer;
let needsRedraw = true;
let view = { zoom: 1, panX: 0, panY: 0 };
let pointerState = { active: false, x: 0, y: 0, id: null };

function createSpacecraft() {
    return {
        phase: 'waiting',
        progress: 0,
        startAngle: 0,
        position: { x: 0, y: 0 },
        trail: [],
        distanceKm: 0,
        deltaV: 0,
    };
}

function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
}

function worldToScreen(position, transform) {
    return {
        x: transform.x + position.x * transform.scale,
        y: transform.y + position.y * transform.scale,
    };
}

function getCanvasUnit() {
    return canvas.width / 1200;
}

function syncCanvasResolution() {
    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const targetWidth = Math.max(1, Math.round(bounds.width * pixelRatio));
    const targetHeight = Math.max(1, Math.round(bounds.height * pixelRatio));

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        needsRedraw = true;
    }
}

function drawBackground(transform) {
    const gradient = context.createRadialGradient(
        transform.x,
        transform.y,
        0,
        transform.x,
        transform.y,
        Math.max(canvas.width, canvas.height) * 0.72,
    );
    gradient.addColorStop(0, '#0c151b');
    gradient.addColorStop(1, palette.ink);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.save();
    context.strokeStyle = palette.grid;
    context.lineWidth = Math.max(1, getCanvasUnit() * 0.7);
    const gridSize = Math.max(34, Math.round(canvas.width / 16));
    for (let x = transform.x % gridSize; x < canvas.width; x += gridSize) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, canvas.height);
        context.stroke();
    }
    for (let y = transform.y % gridSize; y < canvas.height; y += gridSize) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(canvas.width, y);
        context.stroke();
    }
    context.strokeStyle = palette.gridStrong;
    context.beginPath();
    context.moveTo(transform.x, 0);
    context.lineTo(transform.x, canvas.height);
    context.moveTo(0, transform.y);
    context.lineTo(canvas.width, transform.y);
    context.stroke();
    context.restore();
}

function drawOrbit(radiusAU, transform, color) {
    context.save();
    context.beginPath();
    context.arc(transform.x, transform.y, radiusAU * transform.scale, 0, Math.PI * 2);
    context.strokeStyle = color;
    context.lineWidth = Math.max(1, getCanvasUnit());
    context.stroke();
    context.restore();
}

function drawTransferPlan(transform, startAngle) {
    context.save();
    context.beginPath();
    for (let index = 0; index <= 140; index += 1) {
        const position = getTransferPosition(currentMode, index / 140, startAngle);
        const point = worldToScreen(position, transform);
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
    }
    context.setLineDash([7 * getCanvasUnit(), 8 * getCanvasUnit()]);
    context.strokeStyle = 'rgba(98, 200, 201, 0.74)';
    context.lineWidth = Math.max(1.2, 1.6 * getCanvasUnit());
    context.stroke();
    context.restore();
}

function drawTrail(transform) {
    if (spacecraft.trail.length < 2) return;
    context.save();
    context.beginPath();
    spacecraft.trail.forEach((position, index) => {
        const point = worldToScreen(position, transform);
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
    });
    context.strokeStyle = palette.paper;
    context.lineWidth = Math.max(1.2, 1.7 * getCanvasUnit());
    context.stroke();
    context.restore();
}

function drawLabel(text, point, offsetX, offsetY) {
    const unit = getCanvasUnit();
    context.save();
    context.fillStyle = palette.muted;
    context.font = `${Math.max(9, 10 * unit)}px "IBM Plex Mono", monospace`;
    context.fillText(text, point.x + offsetX * unit, point.y + offsetY * unit);
    context.restore();
}

function drawSun(transform) {
    const unit = getCanvasUnit();
    const radius = 9 * unit * view.zoom;
    context.save();
    context.shadowBlur = 18 * unit;
    context.shadowColor = palette.sun;
    context.beginPath();
    context.arc(transform.x, transform.y, radius, 0, Math.PI * 2);
    context.fillStyle = palette.sun;
    context.fill();
    context.restore();
    drawLabel('SUN', { x: transform.x, y: transform.y }, 13, -12);
}

function drawEarth(position, transform, time) {
    const unit = getCanvasUnit();
    const point = worldToScreen(position, transform);
    const radius = 7 * unit * view.zoom;
    context.save();
    context.shadowBlur = 13 * unit;
    context.shadowColor = palette.earth;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fillStyle = palette.earth;
    context.fill();
    context.clip();
    context.translate(point.x, point.y);
    context.rotate(position.angle * 1.8);
    context.fillStyle = palette.earthLand;
    context.beginPath();
    context.ellipse(-radius * 0.15, 0, radius * 0.72, radius * 0.3, 0.5, 0, Math.PI * 2);
    context.ellipse(radius * 0.55, -radius * 0.45, radius * 0.34, radius * 0.2, -0.5, 0, Math.PI * 2);
    context.fill();
    context.restore();

    const moonAngle = time / 27.3 * Math.PI * 2;
    const moonOrbit = 0.06;
    const moon = worldToScreen({
        x: position.x + Math.cos(moonAngle) * moonOrbit,
        y: position.y + Math.sin(moonAngle) * moonOrbit,
    }, transform);
    context.save();
    context.fillStyle = '#b8bec3';
    context.beginPath();
    context.arc(moon.x, moon.y, Math.max(1.4, 2 * unit * view.zoom), 0, Math.PI * 2);
    context.fill();
    context.restore();
    drawLabel('EARTH', point, 12, 18);
}

function drawMars(position, transform) {
    const unit = getCanvasUnit();
    const point = worldToScreen(position, transform);
    const radius = 6 * unit * view.zoom;
    context.save();
    context.shadowBlur = 13 * unit;
    context.shadowColor = palette.mars;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fillStyle = palette.mars;
    context.fill();
    context.clip();
    context.translate(point.x, point.y);
    context.rotate(position.angle);
    context.fillStyle = palette.marsDark;
    context.beginPath();
    context.ellipse(0, radius * 0.2, radius * 0.85, radius * 0.28, -0.3, 0, Math.PI * 2);
    context.fill();
    context.restore();
    drawLabel('MARS', point, 11, -11);
}

function drawSpacecraft(position, transform) {
    const unit = getCanvasUnit();
    const point = worldToScreen(position, transform);
    const size = 8 * unit * view.zoom;
    let angle = Math.atan2(position.y, position.x) + Math.PI / 2;
    if (spacecraft.trail.length > 1) {
        const previous = spacecraft.trail[spacecraft.trail.length - 2];
        angle = Math.atan2(position.y - previous.y, position.x - previous.x);
    }

    context.save();
    context.translate(point.x, point.y);
    context.rotate(angle);
    context.shadowBlur = 10 * unit;
    context.shadowColor = palette.paper;
    context.fillStyle = palette.paper;
    context.beginPath();
    context.moveTo(size, 0);
    context.lineTo(-size * 0.58, size * 0.48);
    context.lineTo(-size * 0.25, 0);
    context.lineTo(-size * 0.58, -size * 0.48);
    context.closePath();
    context.fill();
    if (spacecraft.phase === 'transfer' && !isPaused) {
        context.fillStyle = palette.marsLight;
        context.beginPath();
        context.moveTo(-size * 0.28, 0);
        context.lineTo(-size * 1.15, size * 0.25);
        context.lineTo(-size * 0.85, 0);
        context.lineTo(-size * 1.15, -size * 0.25);
        context.closePath();
        context.fill();
    }
    context.restore();
}

function draw() {
    syncCanvasResolution();
    const transform = {
        x: canvas.width / 2 + view.panX,
        y: canvas.height / 2 + view.panY,
        scale: canvas.width / 5.3 * view.zoom,
    };
    drawBackground(transform);
    drawOrbit(CONSTANTS.EARTH_ORBIT_AU, transform, 'rgba(106, 165, 218, 0.33)');
    drawOrbit(CONSTANTS.MARS_ORBIT_AU, transform, 'rgba(212, 91, 62, 0.34)');

    const launchPosition = getPlanetPosition(
        CONSTANTS.EARTH_ORBIT_AU,
        CONSTANTS.EARTH_PERIOD_DAYS,
        launchDay,
    );
    drawTransferPlan(transform, spacecraft.phase === 'waiting' ? launchPosition.angle : spacecraft.startAngle);
    drawTrail(transform);
    drawSun(transform);

    const missionTime = spacecraft.phase === 'waiting' ? 0 : simulatedDays;
    const currentDay = launchDay + missionTime;
    const earth = getPlanetPosition(CONSTANTS.EARTH_ORBIT_AU, CONSTANTS.EARTH_PERIOD_DAYS, currentDay);
    const mars = getPlanetPosition(CONSTANTS.MARS_ORBIT_AU, CONSTANTS.MARS_PERIOD_DAYS, currentDay);
    drawEarth(earth, transform, currentDay);
    drawMars(mars, transform);
    drawSpacecraft(spacecraft.phase === 'waiting' ? earth : spacecraft.position, transform);
    needsRedraw = false;
}

function showNotification(message, type = 'success') {
    clearTimeout(notificationTimer);
    elements.notification.textContent = message;
    elements.notification.className = `notification is-visible${type === 'error' ? ' is-error' : ''}`;
    notificationTimer = window.setTimeout(() => {
        elements.notification.className = 'notification';
    }, 3600);
}

function getStateCopy() {
    if (spacecraft.phase === 'transfer' && isPaused) return ['轉移暫停', 'PAUSED'];
    switch (spacecraft.phase) {
        case 'transfer': return [`${currentMode.name}進行中`, 'IN FLIGHT'];
        case 'arrived': return ['成功進入火星會合區', 'ARRIVED'];
        case 'failed': return ['未命中火星會合區', 'MISSED'];
        default: return ['等待發射', 'STANDBY'];
    }
}

function updateGeometryUI() {
    const geometry = getLaunchGeometry(currentMode, launchDay);
    const markerPosition = 50 + clamp(geometry.dayOffset / 60, -1, 1) * 50;
    elements.currentPhase.textContent = `${geometry.currentPhaseDeg.toFixed(1)}°`;
    elements.targetPhase.textContent = `${geometry.targetPhaseDeg.toFixed(1)}°`;
    elements.alignmentMarker.style.left = `${markerPosition}%`;

    if (geometry.rating === 'aligned') {
        elements.geometryStatus.textContent = `窗口已對準；預估抵達誤差 ${geometry.arrivalErrorAU.toFixed(3)} AU。`;
        elements.alignmentMarker.style.background = palette.success;
    } else if (geometry.rating === 'marginal') {
        elements.geometryStatus.textContent = `接近窗口，但預估誤差仍有 ${geometry.arrivalErrorAU.toFixed(3)} AU。`;
        elements.alignmentMarker.style.background = palette.amber;
    } else {
        const direction = geometry.dayOffset < 0 ? '提早' : '延後';
        elements.geometryStatus.textContent = `相較最佳窗口${direction} ${Math.abs(geometry.dayOffset).toFixed(0)} 天；預估錯過 ${geometry.arrivalErrorAU.toFixed(2)} AU。`;
        elements.alignmentMarker.style.background = palette.danger;
    }
}

function updateModeUI() {
    document.querySelectorAll('[data-mode]').forEach((button) => {
        const isActive = button.dataset.mode === currentMode.id;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
    elements.modeBadge.textContent = currentMode.id.toUpperCase();
    elements.modeSummary.textContent = currentMode.summary;
    elements.missionParams.innerHTML = `
        <div><dt>飛行時間</dt><dd>${currentMode.durationDays} 天</dd></div>
        <div><dt>預計總 ΔV</dt><dd>${getModeDeltaV(currentMode).toFixed(2)} km/s</dd></div>
    `;
}

function updateUI() {
    const [statusText, stateCode] = getStateCopy();
    const currentDay = launchDay + (spacecraft.phase === 'waiting' ? 0 : simulatedDays);
    const earth = getPlanetPosition(CONSTANTS.EARTH_ORBIT_AU, CONSTANTS.EARTH_PERIOD_DAYS, currentDay);
    const mars = getPlanetPosition(CONSTANTS.MARS_ORBIT_AU, CONSTANTS.MARS_PERIOD_DAYS, currentDay);
    const craftPosition = spacecraft.phase === 'waiting' ? earth : spacecraft.position;
    const solarDistance = getDistance({ x: 0, y: 0 }, craftPosition);
    const velocity = spacecraft.phase === 'waiting'
        ? 29.78
        : getSpacecraftVelocity(currentMode, solarDistance);
    const progressPercent = Math.round(spacecraft.progress * 100);

    document.body.dataset.state = spacecraft.phase;
    elements.headerStatus.textContent = statusText;
    elements.missionStatus.textContent = statusText;
    elements.stateTag.textContent = stateCode;
    elements.totalDistance.textContent = (spacecraft.distanceKm / 1e6).toFixed(spacecraft.distanceKm >= 1e6 ? 1 : 0);
    elements.fuelUsed.textContent = spacecraft.deltaV.toFixed(2);
    elements.missionDay.textContent = Math.floor(simulatedDays);
    elements.distance.textContent = `${solarDistance.toFixed(2)} AU`;
    elements.velocity.textContent = `${velocity.toFixed(2)} km/s`;
    elements.marsDistance.textContent = `${getDistance(craftPosition, mars).toFixed(2)} AU`;
    elements.progressText.textContent = `${progressPercent}%`;
    elements.progressFill.style.width = `${progressPercent}%`;
    elements.progressBar.setAttribute('aria-valuenow', String(progressPercent));
    elements.launchValue.textContent = `第 ${launchDay} 天`;
    elements.speedValue.textContent = `${animationSpeed}×`;
    elements.startTransfer.disabled = spacecraft.phase !== 'waiting';
    elements.pauseButton.disabled = spacecraft.phase !== 'transfer';
    elements.pauseButton.textContent = isPaused ? '繼續' : '暫停';
    elements.generateBrief.hidden = !['arrived', 'failed'].includes(spacecraft.phase);
    updateGeometryUI();
}

function resetMission({ notify = true, preserveView = false } = {}) {
    simulatedDays = 0;
    isPaused = true;
    spacecraft = createSpacecraft();
    missionOutcome = null;
    elements.generateBrief.hidden = true;
    if (!preserveView) view = { zoom: 1, panX: 0, panY: 0 };
    updateUI();
    needsRedraw = true;
    if (notify) showNotification('任務已重置，等待新的發射指令。');
}

function setMode(modeId) {
    currentMode = TRANSFER_MODES[modeId];
    launchDay = Math.round(calculateOptimalLaunchDay(currentMode));
    elements.launchWindow.value = String(launchDay);
    resetMission({ notify: false, preserveView: true });
    updateModeUI();
    updateUI();
    showNotification(`已切換為${currentMode.name}，並載入其最佳窗口。`);
}

function beginTransfer() {
    if (spacecraft.phase !== 'waiting') return;
    const startPosition = getPlanetPosition(
        CONSTANTS.EARTH_ORBIT_AU,
        CONSTANTS.EARTH_PERIOD_DAYS,
        launchDay,
    );
    simulatedDays = 0;
    spacecraft.phase = 'transfer';
    spacecraft.startAngle = startPosition.angle;
    spacecraft.position = startPosition;
    spacecraft.trail = [startPosition];
    spacecraft.deltaV = currentMode.injectionDeltaV;
    isPaused = false;
    lastTimestamp = performance.now();
    updateUI();
    needsRedraw = true;
    showNotification(`${currentMode.name}注入完成，航程計時開始。`);
}

function finishTransfer() {
    const geometry = getLaunchGeometry(currentMode, launchDay);
    const succeeded = geometry.arrivalErrorAU <= CONSTANTS.ARRIVAL_THRESHOLD_AU;
    spacecraft.phase = succeeded ? 'arrived' : 'failed';
    spacecraft.progress = 1;
    spacecraft.deltaV += succeeded ? currentMode.insertionDeltaV : 0;
    isPaused = true;
    missionOutcome = {
        succeeded,
        geometry,
        mode: currentMode,
        launchDay,
        durationDays: simulatedDays,
        distanceKm: spacecraft.distanceKm,
        deltaV: spacecraft.deltaV,
    };
    updateUI();
    needsRedraw = true;
    showNotification(
        succeeded ? '任務成功：太空船進入火星會合區。' : `任務未命中：抵達誤差 ${geometry.arrivalErrorAU.toFixed(3)} AU。`,
        succeeded ? 'success' : 'error',
    );
}

function update(deltaTime) {
    if (isPaused || spacecraft.phase !== 'transfer') return;
    simulatedDays = Math.min(
        simulatedDays + animationSpeed * deltaTime / 1000 * 2,
        currentMode.durationDays,
    );
    spacecraft.progress = simulatedDays / currentMode.durationDays;
    const previousPosition = spacecraft.position;
    spacecraft.position = getTransferPosition(currentMode, spacecraft.progress, spacecraft.startAngle);
    spacecraft.distanceKm += getDistance(previousPosition, spacecraft.position) * CONSTANTS.AU_M / 1000;
    spacecraft.trail.push(spacecraft.position);
    if (spacecraft.trail.length > 320) spacecraft.trail.shift();
    updateUI();
    needsRedraw = true;

    if (spacecraft.progress >= 1) finishTransfer();
}

function animate(timestamp) {
    const deltaTime = lastTimestamp ? Math.min(timestamp - lastTimestamp, 80) : 0;
    lastTimestamp = timestamp;
    update(deltaTime);
    if (needsRedraw) draw();
    requestAnimationFrame(animate);
}

function togglePause() {
    if (spacecraft.phase !== 'transfer') return;
    isPaused = !isPaused;
    lastTimestamp = performance.now();
    updateUI();
    needsRedraw = true;
    showNotification(isPaused ? '航程已暫停。' : '航程繼續。');
}

function buildMissionBrief() {
    if (!missionOutcome) return;
    const { succeeded, geometry, mode, distanceKm, deltaV } = missionOutcome;
    const offset = Math.abs(geometry.dayOffset);
    const recommendation = succeeded
        ? `窗口命中。若要比較時間成本，可改用快速轉移；它少 ${TRANSFER_MODES.hohmann.durationDays - TRANSFER_MODES.fast.durationDays} 天，但預計總 ΔV 增加 ${(getModeDeltaV(TRANSFER_MODES.fast) - getModeDeltaV(TRANSFER_MODES.hohmann)).toFixed(2)} km/s。`
        : `將發射日調整至第 ${Math.round(geometry.optimalLaunchDay)} 天，可把目前 ${offset.toFixed(0)} 天的窗口偏差收斂到本模型的會合區。`;
    const resultCopy = succeeded
        ? '太空船在預設容許範圍內與火星會合。'
        : '太空船完成轉移弧線，但火星未在抵達點。';

    elements.briefContent.innerHTML = `
        <section class="brief-result">
            <p class="section-code">${succeeded ? 'INTERCEPT CONFIRMED' : 'INTERCEPT MISSED'}</p>
            <h2 id="briefTitle">${succeeded ? '任務成功' : '錯過火星'}</h2>
            <p>${resultCopy}</p>
        </section>
        <div class="brief-grid">
            <div class="brief-metric"><span>轉移模式</span><strong>${mode.name}</strong></div>
            <div class="brief-metric"><span>發射日</span><strong>第 ${missionOutcome.launchDay} 天</strong></div>
            <div class="brief-metric"><span>抵達誤差</span><strong>${geometry.arrivalErrorAU.toFixed(3)} AU</strong></div>
            <div class="brief-metric"><span>窗口偏差</span><strong>${geometry.dayOffset >= 0 ? '+' : ''}${geometry.dayOffset.toFixed(1)} 天</strong></div>
            <div class="brief-metric"><span>累積航程</span><strong>${(distanceKm / 1e6).toFixed(1)} 百萬 km</strong></div>
            <div class="brief-metric"><span>已執行 ΔV</span><strong>${deltaV.toFixed(2)} km/s</strong></div>
        </div>
        <section class="brief-recommendation">
            <h3>下一次任務建議</h3>
            <p>${recommendation}</p>
        </section>
    `;
}

function openMissionBrief() {
    buildMissionBrief();
    elements.missionDialog.showModal();
}

document.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
});

elements.launchWindow.addEventListener('input', (event) => {
    if (spacecraft.phase !== 'waiting') resetMission({ notify: false, preserveView: true });
    launchDay = Number.parseInt(event.target.value, 10);
    updateUI();
    needsRedraw = true;
});

elements.speedSlider.addEventListener('input', (event) => {
    animationSpeed = Number.parseInt(event.target.value, 10);
    updateUI();
});

elements.findWindow.addEventListener('click', () => {
    launchDay = Math.round(calculateOptimalLaunchDay(currentMode));
    elements.launchWindow.value = String(launchDay);
    if (spacecraft.phase !== 'waiting') resetMission({ notify: false, preserveView: true });
    updateUI();
    needsRedraw = true;
    showNotification(`已對準第 ${launchDay} 天的最佳發射窗口。`);
});

elements.startTransfer.addEventListener('click', beginTransfer);
elements.pauseButton.addEventListener('click', togglePause);
elements.resetSimulation.addEventListener('click', () => resetMission());
elements.generateBrief.addEventListener('click', openMissionBrief);
elements.closeDialog.addEventListener('click', () => elements.missionDialog.close());
elements.missionDialog.addEventListener('click', (event) => {
    if (event.target === elements.missionDialog) elements.missionDialog.close();
});

elements.zoomIn.addEventListener('click', () => {
    view.zoom = clamp(view.zoom * 1.18, 0.55, 2.4);
    needsRedraw = true;
});
elements.zoomOut.addEventListener('click', () => {
    view.zoom = clamp(view.zoom / 1.18, 0.55, 2.4);
    needsRedraw = true;
});
elements.resetView.addEventListener('click', () => {
    view = { zoom: 1, panX: 0, panY: 0 };
    needsRedraw = true;
});

canvas.addEventListener('pointerdown', (event) => {
    pointerState = { active: true, x: event.clientX, y: event.clientY, id: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
});
canvas.addEventListener('pointermove', (event) => {
    if (!pointerState.active || pointerState.id !== event.pointerId) return;
    const ratio = canvas.width / canvas.getBoundingClientRect().width;
    view.panX += (event.clientX - pointerState.x) * ratio;
    view.panY += (event.clientY - pointerState.y) * ratio;
    pointerState.x = event.clientX;
    pointerState.y = event.clientY;
    needsRedraw = true;
});
canvas.addEventListener('pointerup', (event) => {
    if (pointerState.id === event.pointerId) {
        pointerState.active = false;
        canvas.releasePointerCapture(event.pointerId);
        canvas.classList.remove('is-dragging');
    }
});
canvas.addEventListener('pointercancel', () => {
    pointerState.active = false;
    canvas.classList.remove('is-dragging');
});
canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    view.zoom = clamp(view.zoom * (event.deltaY < 0 ? 1.08 : 0.92), 0.55, 2.4);
    needsRedraw = true;
}, { passive: false });

const resizeObserver = new ResizeObserver(() => {
    syncCanvasResolution();
    needsRedraw = true;
});
resizeObserver.observe(canvas);

elements.launchWindow.value = String(launchDay);
elements.speedSlider.value = String(animationSpeed);
updateModeUI();
resetMission({ notify: false });
requestAnimationFrame(animate);
