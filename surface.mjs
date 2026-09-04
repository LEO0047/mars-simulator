import {
    LANDER,
    SITES,
    createLanding,
    deployChute,
    stepLanding,
    landingScore,
} from './landing.mjs';

export function initSurface({ notify, onComplete }) {
    const ids = [
        'surfaceCanvas',
        'surfaceTitle',
        'surfaceCoordinates',
        'surfaceCallout',
        'surfacePhase',
        'landingAltitude',
        'landingVelocity',
        'landingFuel',
        'landingClock',
        'landingState',
        'landingSite',
        'siteDescription',
        'pilotAuto',
        'pilotManual',
        'pilotHelp',
        'throttle',
        'throttleValue',
        'deployChute',
        'descentSpeed',
        'descentSpeedValue',
        'startLanding',
        'pauseLanding',
        'resetLanding',
        'landingResult',
        'descentLog',
        'stageEntry',
        'stageChute',
        'stageBurn',
        'stageTouchdown',
        'flightDock',
        'dockThrottle',
        'dockThrottleValue',
        'dockChute',
        'dockPause',
    ];
    const el = Object.fromEntries(
        ids.map((id) => [id, document.getElementById(id)]),
    );
    const canvas = el.surfaceCanvas;
    const ctx = canvas.getContext('2d');
    let state = createLanding();
    let auto = true;
    let paused = true;
    let visible = false;
    let dirty = true;
    let speed = 4;
    let stage = 0;
    let uiElapsed = 0;
    const events = [];
    const labels = {
        ready: 'READY',
        descending: 'DESCENDING',
        landed: 'TOUCHDOWN',
        crashed: 'SIGNAL LOST',
    };

    function log(message) {
        events.push({ time: state.time, message });
        const row = document.createElement('li');
        const time = document.createElement('time');
        time.textContent = `T+${state.time.toFixed(0)}`;
        row.append(time, document.createTextNode(message));
        el.descentLog.append(row);
    }
    function setPilot(value) {
        auto = value;
        if (!auto) el.throttle.value = String(Math.round(state.throttle * 100));
        el.pilotAuto.classList.toggle('is-active', auto);
        el.pilotManual.classList.toggle('is-active', !auto);
        el.pilotAuto.setAttribute('aria-pressed', String(auto));
        el.pilotManual.setAttribute('aria-pressed', String(!auto));
        el.pilotHelp.textContent = auto
            ? '電腦控制降落傘與推力，觀察完整降落流程。'
            : '推動滑桿調整引擎，按鈕開傘。接地速度須 ≤ 8 m/s；點火會切傘。';
        if (state.status === 'descending')
            log(auto ? '自動引導接管' : '切換手動飛行');
        updateUI();
    }
    function reset() {
        state = createLanding(el.landingSite.value);
        paused = true;
        stage = 0;
        events.length = 0;
        el.throttle.value = '0';
        el.descentLog.replaceChildren();
        log('降落系統就緒');
        el.landingResult.hidden = true;
        dirty = true;
        updateUI();
    }
    function pause() {
        if (state.status !== 'descending') return;
        paused = true;
        updateUI();
        dirty = true;
    }
    function togglePause() {
        if (state.status !== 'descending') return;
        paused = !paused;
        updateUI();
        dirty = true;
    }
    function updateUI() {
        const site = SITES[state.site];
        el.surfaceTitle.textContent = site.name;
        el.surfaceCoordinates.textContent = site.coordinates;
        el.siteDescription.textContent = site.description;
        el.landingAltitude.innerHTML = `${Math.round(state.altitude).toLocaleString('en-US')}<small> m</small>`;
        el.landingVelocity.innerHTML = `${Math.abs(state.velocity).toFixed(1)}<small> m/s ${state.velocity > 0 ? '↑' : '↓'}</small>`;
        el.landingFuel.innerHTML = `${state.fuel.toFixed(0)}<small> kg</small>`;
        el.landingClock.textContent = `T + ${state.time.toFixed(1).padStart(5, '0')} s`;
        const isRunning = state.status === 'descending';
        el.landingState.textContent =
            isRunning && paused ? 'PAUSED' : labels[state.status];
        el.surfaceCallout.hidden = state.status !== 'ready';
        el.startLanding.disabled = state.status !== 'ready';
        el.pauseLanding.disabled = !isRunning;
        el.pauseLanding.textContent = paused ? '繼續' : '暫停';
        el.landingSite.disabled = state.status !== 'ready';
        el.throttle.disabled = auto || !isRunning || state.fuel <= 0;
        if (auto) el.throttle.value = String(Math.round(state.throttle * 100));
        el.throttleValue.textContent = `${Math.round(state.throttle * 100)}%`;
        el.deployChute.disabled =
            auto ||
            !isRunning ||
            state.chute !== 'packed' ||
            state.altitude > 7800 ||
            Math.abs(state.velocity) > 500;
        el.deployChute.textContent =
            state.chute === 'open'
                ? '降落傘已展開'
                : state.chute === 'cut'
                  ? '降落傘已切離'
                  : '展開降落傘';
        const phase = [
            'ATMOSPHERIC BRAKING',
            'PARACHUTE DEPLOYED',
            'POWERED DESCENT',
            'SURFACE CONTACT',
        ];
        el.flightDock.hidden = auto || !isRunning;
        el.dockThrottle.disabled = state.fuel <= 0;
        el.dockThrottle.value = el.throttle.value;
        el.dockThrottleValue.textContent = `${el.throttle.value}%`;
        el.dockChute.disabled = el.deployChute.disabled;
        el.dockChute.textContent =
            state.chute === 'packed'
                ? '開傘'
                : state.chute === 'open'
                  ? '已開傘'
                  : '已切傘';
        el.dockPause.textContent = paused ? '繼續' : '暫停';
        el.surfacePhase.textContent =
            state.status === 'ready' ? 'DESCENT SYSTEM ARMED' : phase[stage];
        ['stageEntry', 'stageChute', 'stageBurn', 'stageTouchdown'].forEach(
            (id, i) => el[id].classList.toggle('active', i <= stage),
        );
        if (visible)
            document.getElementById('headerStatus').textContent =
                state.status === 'ready'
                    ? '降落系統就緒'
                    : state.status === 'landed'
                      ? '火星著陸成功'
                      : state.status === 'crashed'
                        ? '降落器墜毀'
                        : paused
                          ? '降落已暫停'
                          : '正在接近火星地表';
    }
    function complete() {
        paused = true;
        stage = 3;
        const success = state.status === 'landed';
        log(success ? '接觸地表，著陸成功' : '接地速度過高，失去訊號');
        el.landingResult.hidden = false;
        el.landingResult.className = `landing-result${success ? '' : ' failed'}`;
        const heading = document.createElement('h3');
        heading.textContent = success
            ? `WELCOME TO MARS. / ${landingScore(state)} 分`
            : '這一次，差一點。';
        const detail = document.createElement('p');
        detail.textContent = `接地 ${state.touchdownSpeed.toFixed(1)} m/s · 剩餘 ${state.fuel.toFixed(0)} kg · ${state.time.toFixed(1)} 秒。${success ? '地表訊號正常。' : '提早開傘與煞車，或啟用自動引導再試一次。'}`;
        el.landingResult.replaceChildren(heading, detail);
        onComplete({
            kind: 'landing',
            title: `${SITES[state.site].name} / ${auto ? '自動' : '手動'}結束`,
            success,
            detail: `${state.touchdownSpeed.toFixed(1)} m/s · ${state.fuel.toFixed(0)} kg`,
            data: { ...state, score: landingScore(state), events: [...events] },
        });
        notify(
            success
                ? '著陸確認。歡迎來到火星。'
                : '接地速度過高。試試提早煞車。',
            success ? 'success' : 'error',
        );
    }
    function draw() {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const dpr = Math.min(devicePixelRatio || 1, 2);
        if (
            canvas.width !== Math.round(rect.width * dpr) ||
            canvas.height !== Math.round(rect.height * dpr)
        ) {
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const w = rect.width,
            h = rect.height;
        const low = 1 - Math.min(state.altitude / 8000, 1);
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, '#10121d');
        sky.addColorStop(0.4, '#432d35');
        sky.addColorStop(0.73, '#955847');
        sky.addColorStop(1, '#cf8864');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);
        // Deterministic stars and distant sun. No random frame-to-frame flicker.
        for (let i = 0; i < 65; i++) {
            const x = ((((Math.sin(i * 123.7) * 43758.5453) % 1) + 1) % 1) * w;
            const y =
                ((((Math.cos(i * 19.3) * 1739.31) % 1) + 1) % 1) * h * 0.58;
            ctx.fillStyle = `rgba(255,231,211,${0.15 + (i % 4) * 0.12})`;
            ctx.fillRect(x, y, i % 6 === 0 ? 1.5 : 1, 1);
        }
        const sunX = w * 0.8,
            sunY = h * 0.3;
        const glow = ctx.createRadialGradient(
            sunX,
            sunY,
            0,
            sunX,
            sunY,
            w * 0.22,
        );
        glow.addColorStop(0, '#ffd5b025');
        glow.addColorStop(1, '#ffd5b000');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#f4c59a';
        ctx.beginPath();
        ctx.arc(sunX, sunY, 6, 0, Math.PI * 2);
        ctx.fill();
        const horizon = h * (0.65 - low * 0.11);
        for (let layer = 0; layer < 4; layer++) {
            const y = horizon + layer * h * 0.047;
            ctx.beginPath();
            ctx.moveTo(0, h);
            for (let x = 0; x <= w + 12; x += 12) {
                const ridge =
                    Math.sin(x * 0.011 + layer * 2.6) * 20 +
                    Math.sin(x * 0.027 + layer * 4) * 10 +
                    Math.cos(x * 0.052 + layer) * 4;
                ctx.lineTo(x, y - ridge * (0.8 + layer * 0.17));
            }
            ctx.lineTo(w, h);
            ctx.closePath();
            ctx.fillStyle = ['#79554d', '#815146', '#754335', '#57372c'][layer];
            ctx.fill();
        }
        const floor = h * 0.88;
        const ground = ctx.createLinearGradient(0, h * 0.76, 0, h);
        ground.addColorStop(0, '#674033');
        ground.addColorStop(1, '#362824');
        ctx.fillStyle = ground;
        ctx.beginPath();
        ctx.moveTo(0, h * 0.8);
        ctx.quadraticCurveTo(w * 0.45, h * 0.73, w, h * 0.82);
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.fill();
        // Perspective landing grid, rocks and the target ellipse.
        ctx.lineWidth = 0.7;
        ctx.strokeStyle = '#d9956c25';
        for (let i = -8; i <= 8; i++) {
            ctx.beginPath();
            ctx.moveTo(w / 2 + i * 17, h * 0.79);
            ctx.lineTo(w / 2 + i * w * 0.14, h);
            ctx.stroke();
        }
        for (let i = 0; i < 6; i++) {
            const y = h * 0.8 + i * i * h * 0.009;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
        for (let i = 0; i < 21; i++) {
            const x = (((i * 173 + 53) % 997) / 997) * w,
                y = h * (0.81 + (((i * 37) % 100) / 100) * 0.18);
            if (Math.abs(x - w * 0.5) < w * 0.14) continue;
            ctx.fillStyle = i % 2 ? '#432d26' : '#8a5840';
            ctx.beginPath();
            ctx.ellipse(x, y, 3 + (i % 7), 1.5 + (i % 3), 0.2, 0, Math.PI * 2);
            ctx.fill();
        }
        const padW = w * 0.14;
        ctx.save();
        ctx.translate(w / 2, floor);
        ctx.scale(1, 0.29);
        ctx.strokeStyle = '#b8d5b89c';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, padW, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = '#c9d9be55';
        ctx.beginPath();
        ctx.moveTo(-18, 0);
        ctx.lineTo(18, 0);
        ctx.moveTo(0, -18);
        ctx.lineTo(0, 18);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#dabdab';
        ctx.font = '8px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
            'LZ / ' + SITES[state.site].en,
            w / 2,
            floor + padW * 0.29 + 20,
        );
        // Camera is illustrative: altitude is compressed logarithmically to keep the craft visible.
        const visualAltitude =
            Math.log1p(Math.min(state.altitude, 12000)) / Math.log1p(8000);
        const craftX = w * 0.5,
            craftY = floor - 22 - visualAltitude * h * 0.49;
        ctx.save();
        ctx.translate(craftX, craftY);
        const craftScale = Math.min(w / 560, 1.2);
        ctx.scale(craftScale, craftScale);
        const crashed = state.status === 'crashed';
        if (crashed) ctx.rotate(0.45);
        if (state.chute === 'open' && state.status === 'descending') {
            ctx.strokeStyle = '#ddcab9';
            ctx.lineWidth = 1;
            for (const x of [-61, -30, 0, 30, 61]) {
                ctx.beginPath();
                ctx.moveTo(x, -72);
                ctx.lineTo(x < 0 ? -17 : 17, -5);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.ellipse(0, -72, 65, 32, 0, Math.PI, Math.PI * 2);
            ctx.lineTo(65, -72);
            ctx.quadraticCurveTo(30, -87, 0, -72);
            ctx.quadraticCurveTo(-30, -87, -65, -72);
            ctx.fillStyle = '#d4bba4';
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(0, -72, 32, 32, 0, Math.PI, Math.PI * 2);
            ctx.fillStyle = '#bf583a';
            ctx.fill();
        }
        if (state.throttle > 0 && state.status === 'descending') {
            const flame = 18 + state.throttle * 64;
            for (const x of [-17, 17]) {
                const grad = ctx.createLinearGradient(0, 10, 0, 10 + flame);
                grad.addColorStop(0, '#f9eee3');
                grad.addColorStop(0.25, '#ffb67e');
                grad.addColorStop(1, '#ff795800');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.moveTo(x - 6, 8);
                ctx.quadraticCurveTo(x - 10, flame * 0.5, x, flame + 8);
                ctx.quadraticCurveTo(x + 10, flame * 0.5, x + 6, 8);
                ctx.fill();
            }
        }
        ctx.strokeStyle = '#c8c5b7';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-15, 4);
        ctx.lineTo(-33, 22);
        ctx.lineTo(-41, 22);
        ctx.moveTo(15, 4);
        ctx.lineTo(33, 22);
        ctx.lineTo(41, 22);
        ctx.stroke();
        ctx.fillStyle = crashed ? '#58433b' : '#d9d7c8';
        ctx.beginPath();
        ctx.moveTo(-28, 2);
        ctx.lineTo(-20, -11);
        ctx.lineTo(-10, -19);
        ctx.lineTo(10, -19);
        ctx.lineTo(20, -11);
        ctx.lineTo(28, 2);
        ctx.lineTo(23, 10);
        ctx.lineTo(-23, 10);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#887551';
        ctx.fillRect(-15, -4, 30, 12);
        ctx.fillStyle = '#506970';
        ctx.fillRect(-8, -15, 16, 8);
        ctx.strokeStyle = '#dedfce';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -19);
        ctx.lineTo(0, -31);
        ctx.lineTo(9, -36);
        ctx.stroke();
        ctx.restore();
        // Radar ruler and an actual numeric altitude, distinct from the illustrative scene scale.
        ctx.textAlign = 'left';
        ctx.font = '9px "IBM Plex Mono", monospace';
        ctx.strokeStyle = '#f1d2ba55';
        ctx.fillStyle = '#f1d2ba';
        const rulerX = 25;
        for (let i = 0; i <= 10; i++) {
            const y = h * 0.3 + i * h * 0.042;
            ctx.beginPath();
            ctx.moveTo(rulerX, y);
            ctx.lineTo(rulerX + (i % 5 === 0 ? 13 : 6), y);
            ctx.stroke();
        }
        ctx.fillText('RADAR', rulerX, h * 0.25);
        ctx.fillText(`${Math.round(state.altitude)} m`, rulerX, h * 0.28);
        if (state.status === 'descending') {
            ctx.textAlign = 'right';
            ctx.fillText(
                `V/S ${Math.abs(state.velocity).toFixed(1)} m/s ${state.velocity > 0 ? '↑' : '↓'}`,
                w - 20,
                h * 0.25,
            );
            ctx.fillText(`FUEL ${state.fuel.toFixed(0)} kg`, w - 20, h * 0.28);
        }
        if (state.status === 'landed') {
            ctx.fillStyle = '#d9edcf';
            ctx.textAlign = 'center';
            ctx.font = '600 25px "Barlow Condensed", sans-serif';
            ctx.fillText('TOUCHDOWN CONFIRMED', w / 2, h * 0.22);
        }
        if (crashed) {
            ctx.fillStyle = '#ffb49b';
            ctx.textAlign = 'center';
            ctx.font = '600 25px "Barlow Condensed", sans-serif';
            ctx.fillText('SIGNAL LOST', w / 2, h * 0.22);
        }
        dirty = false;
    }
    function tick(dt) {
        if (!visible) return;
        if (!paused && state.status === 'descending') {
            const oldChute = state.chute,
                oldFuel = state.fuel,
                oldStage = stage;
            stepLanding(state, (dt / 1000) * speed, {
                auto,
                throttle: Number(el.throttle.value) / 100,
            });
            if (state.chute !== oldChute)
                log(state.chute === 'open' ? '降落傘展開' : '切傘，動力下降');
            if (state.chute === 'open') stage = 1;
            if (state.throttle > 0) stage = 2;
            if (stage === 2 && oldStage < 2 && oldChute !== 'open')
                log('引擎啟動，動力下降');
            if (oldFuel > 0 && state.fuel <= 0) log('推進劑耗盡');
            if (state.status === 'landed' || state.status === 'crashed')
                complete();
            dirty = true;
            uiElapsed += dt;
            if (uiElapsed >= 80 || paused) {
                updateUI();
                uiElapsed = 0;
            }
        }
        if (dirty) draw();
    }
    el.startLanding.addEventListener('click', () => {
        if (state.status !== 'ready') return;
        state.status = 'descending';
        paused = false;
        log('進入終端下降段');
        updateUI();
        dirty = true;
        if (matchMedia('(max-width:800px)').matches)
            canvas.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
    el.pauseLanding.addEventListener('click', togglePause);
    el.dockPause.addEventListener('click', togglePause);
    el.dockChute.addEventListener('click', () => el.deployChute.click());
    el.dockThrottle.addEventListener('input', () => {
        el.throttle.value = el.dockThrottle.value;
        el.throttleValue.textContent = `${el.throttle.value}%`;
        el.dockThrottleValue.textContent = `${el.throttle.value}%`;
    });
    el.resetLanding.addEventListener('click', reset);
    el.landingSite.addEventListener('change', reset);
    el.pilotAuto.addEventListener('click', () => setPilot(true));
    el.pilotManual.addEventListener('click', () => setPilot(false));
    el.deployChute.addEventListener('click', () => {
        if (deployChute(state)) {
            stage = 1;
            log('手動展開降落傘');
            updateUI();
            dirty = true;
        }
    });
    el.throttle.addEventListener('input', () => {
        el.throttleValue.textContent = `${el.throttle.value}%`;
    });
    el.descentSpeed.addEventListener('input', () => {
        speed = Number(el.descentSpeed.value);
        el.descentSpeedValue.textContent = `${speed}×`;
    });
    new ResizeObserver(() => {
        dirty = true;
    }).observe(canvas);
    reset();
    return {
        tick,
        pause,
        togglePause,
        setVisible(value) {
            visible = value;
            if (!value) pause();
            dirty = true;
            updateUI();
        },
    };
}
