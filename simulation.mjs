export const CONSTANTS = Object.freeze({
    G: 6.67430e-11,
    M_SUN: 1.989e30,
    AU_M: 1.496e11,
    EARTH_ORBIT_AU: 1,
    MARS_ORBIT_AU: 1.524,
    EARTH_PERIOD_DAYS: 365.25,
    MARS_PERIOD_DAYS: 687,
    ARRIVAL_THRESHOLD_AU: 0.05,
});

const hohmannSemiMajorAxisAU = (CONSTANTS.EARTH_ORBIT_AU + CONSTANTS.MARS_ORBIT_AU) / 2;
const hohmannEccentricity =
    (CONSTANTS.MARS_ORBIT_AU - CONSTANTS.EARTH_ORBIT_AU)
    / (CONSTANTS.MARS_ORBIT_AU + CONSTANTS.EARTH_ORBIT_AU);

const MU_SUN = CONSTANTS.G * CONSTANTS.M_SUN;
const DAY_SECONDS = 86400;

function circularSpeedKms(radiusAU) {
    return Math.sqrt(MU_SUN / (radiusAU * CONSTANTS.AU_M)) / 1000;
}

function visVivaSpeedKms(radiusAU, semiMajorAxisAU) {
    const radiusM = radiusAU * CONSTANTS.AU_M;
    const semiMajorAxisM = semiMajorAxisAU * CONSTANTS.AU_M;
    return Math.sqrt(MU_SUN * (2 / radiusM - 1 / semiMajorAxisM)) / 1000;
}

// 兩個預設模式的 ΔV 用同一套向量公式推導：近日點切線注入，抵達時取
// 轉移速度向量與火星圓軌道速度的向量差（含徑向分量）。
function computeTangentialModeDeltaV(semiMajorAxisAU, eccentricity, transferAngleDeg) {
    const injection = visVivaSpeedKms(CONSTANTS.EARTH_ORBIT_AU, semiMajorAxisAU)
        - circularSpeedKms(CONSTANTS.EARTH_ORBIT_AU);
    const semiLatusAU = semiMajorAxisAU * (1 - eccentricity ** 2);
    const trueAnomaly = transferAngleDeg * Math.PI / 180;
    const arrivalRadiusAU = semiLatusAU / (1 + eccentricity * Math.cos(trueAnomaly));
    const arrivalSpeed = visVivaSpeedKms(arrivalRadiusAU, semiMajorAxisAU);
    const angularMomentum = Math.sqrt(MU_SUN * semiLatusAU * CONSTANTS.AU_M);
    const tangentialSpeed = angularMomentum / (arrivalRadiusAU * CONSTANTS.AU_M) / 1000;
    const radialSpeed = Math.sqrt(Math.max(arrivalSpeed ** 2 - tangentialSpeed ** 2, 0));
    const insertion = Math.hypot(tangentialSpeed - circularSpeedKms(arrivalRadiusAU), radialSpeed);
    return {
        injection: Number(injection.toFixed(2)),
        insertion: Number(insertion.toFixed(2)),
    };
}

const hohmannDeltaV = computeTangentialModeDeltaV(hohmannSemiMajorAxisAU, hohmannEccentricity, 180);
const fastDeltaV = computeTangentialModeDeltaV(1.4, 0.2857, 123.2);

export const TRANSFER_MODES = Object.freeze({
    hohmann: Object.freeze({
        id: 'hohmann',
        name: '霍曼轉移',
        nameEn: 'Hohmann transfer',
        durationDays: 259,
        injectionDeltaV: hohmannDeltaV.injection,
        insertionDeltaV: hohmannDeltaV.insertion,
        semiMajorAxisAU: hohmannSemiMajorAxisAU,
        eccentricity: hohmannEccentricity,
        transferAngleDeg: 180,
        summary: '最低能量路徑，航程較長，但總 ΔV 較低。',
    }),
    fast: Object.freeze({
        id: 'fast',
        name: '快速轉移',
        nameEn: 'Fast transfer',
        durationDays: 156,
        injectionDeltaV: fastDeltaV.injection,
        insertionDeltaV: fastDeltaV.insertion,
        semiMajorAxisAU: 1.4,
        eccentricity: 0.2857,
        transferAngleDeg: 123.2,
        summary: '縮短 103 天航程，以更高的抵達捕獲 ΔV 為代價。',
    }),
});

export const toRadians = (degrees) => degrees * Math.PI / 180;
export const toDegrees = (radians) => radians * 180 / Math.PI;

export function normalizeAngle(radians) {
    const fullTurn = Math.PI * 2;
    return ((radians % fullTurn) + fullTurn) % fullTurn;
}

export function signedAngularDifference(angle, reference) {
    const difference = normalizeAngle(angle - reference);
    return difference > Math.PI ? difference - Math.PI * 2 : difference;
}

export function getPlanetPosition(radiusAU, periodDays, day) {
    const angle = normalizeAngle(day / periodDays * Math.PI * 2);
    return {
        x: radiusAU * Math.cos(angle),
        y: radiusAU * Math.sin(angle),
        angle,
    };
}

export function getDistance(pointA, pointB) {
    return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
}

export function getSynodicPeriod() {
    const earthRate = 1 / CONSTANTS.EARTH_PERIOD_DAYS;
    const marsRate = 1 / CONSTANTS.MARS_PERIOD_DAYS;
    return 1 / Math.abs(earthRate - marsRate);
}

export function getRequiredLaunchPhase(mode) {
    const marsTravelAngle = mode.durationDays / CONSTANTS.MARS_PERIOD_DAYS * Math.PI * 2;
    return normalizeAngle(toRadians(mode.transferAngleDeg) - marsTravelAngle);
}

export function calculateOptimalLaunchDay(mode) {
    const earthAngularRate = Math.PI * 2 / CONSTANTS.EARTH_PERIOD_DAYS;
    const marsAngularRate = Math.PI * 2 / CONSTANTS.MARS_PERIOD_DAYS;
    const relativeAngularRate = marsAngularRate - earthAngularRate;
    const targetPhase = getRequiredLaunchPhase(mode);
    const synodicPeriod = getSynodicPeriod();
    let day = targetPhase / relativeAngularRate;

    while (day < 0) day += synodicPeriod;
    return day % synodicPeriod;
}

export function getTransferPosition(mode, progress, startAngle) {
    const clampedProgress = Math.min(Math.max(progress, 0), 1);
    const startTrueAnomaly = toRadians(mode.startTrueAnomalyDeg ?? 0);
    const trueAnomaly = startTrueAnomaly + clampedProgress * toRadians(mode.transferAngleDeg);
    const radiusAU = mode.semiMajorAxisAU * (1 - mode.eccentricity ** 2)
        / (1 + mode.eccentricity * Math.cos(trueAnomaly));
    const angle = startAngle + (trueAnomaly - startTrueAnomaly);

    return {
        x: radiusAU * Math.cos(angle),
        y: radiusAU * Math.sin(angle),
        radiusAU,
        angle,
    };
}

export function getSpacecraftVelocity(mode, radiusAU) {
    const radiusM = radiusAU * CONSTANTS.AU_M;
    const semiMajorAxisM = mode.semiMajorAxisAU * CONSTANTS.AU_M;
    const velocityMs = Math.sqrt(
        CONSTANTS.G * CONSTANTS.M_SUN * (2 / radiusM - 1 / semiMajorAxisM),
    );
    return velocityMs / 1000;
}

export function getLaunchGeometry(mode, launchDay) {
    const earthAtLaunch = getPlanetPosition(
        CONSTANTS.EARTH_ORBIT_AU,
        CONSTANTS.EARTH_PERIOD_DAYS,
        launchDay,
    );
    const marsAtLaunch = getPlanetPosition(
        CONSTANTS.MARS_ORBIT_AU,
        CONSTANTS.MARS_PERIOD_DAYS,
        launchDay,
    );
    const spacecraftAtArrival = getTransferPosition(mode, 1, earthAtLaunch.angle);
    const marsAtArrival = getPlanetPosition(
        CONSTANTS.MARS_ORBIT_AU,
        CONSTANTS.MARS_PERIOD_DAYS,
        launchDay + mode.durationDays,
    );
    const currentPhase = normalizeAngle(marsAtLaunch.angle - earthAtLaunch.angle);
    const targetPhase = getRequiredLaunchPhase(mode);
    const phaseError = signedAngularDifference(currentPhase, targetPhase);
    const arrivalErrorAU = getDistance(spacecraftAtArrival, marsAtArrival);
    const optimalLaunchDay = calculateOptimalLaunchDay(mode);
    const synodicPeriod = getSynodicPeriod();
    let dayOffset = launchDay - optimalLaunchDay;

    if (dayOffset > synodicPeriod / 2) dayOffset -= synodicPeriod;
    if (dayOffset < -synodicPeriod / 2) dayOffset += synodicPeriod;

    let rating = 'miss';
    if (arrivalErrorAU <= CONSTANTS.ARRIVAL_THRESHOLD_AU) rating = 'aligned';
    else if (arrivalErrorAU <= 0.15) rating = 'marginal';

    return {
        arrivalErrorAU,
        currentPhaseDeg: toDegrees(currentPhase),
        targetPhaseDeg: toDegrees(targetPhase),
        phaseErrorDeg: toDegrees(phaseError),
        optimalLaunchDay,
        dayOffset,
        rating,
    };
}

export function getModeDeltaV(mode) {
    return mode.injectionDeltaV + mode.insertionDeltaV;
}

// ---------------------------------------------------------------------------
// 即時解：共面 Lambert 求解
// 給定發射日，掃描飛行時間找最小 ΔV 的轉移軌道。仍是共面圓形行星軌道模型，
// 但出發方向不再限定切線，任何發射日都有解（代價反映在 ΔV 上）。
// ---------------------------------------------------------------------------

function stumpffC(z) {
    if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z;
    if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
    return 1 / 2 - z / 24;
}

function stumpffS(z) {
    if (z > 1e-8) {
        const root = Math.sqrt(z);
        return (root - Math.sin(root)) / root ** 3;
    }
    if (z < -1e-8) {
        const root = Math.sqrt(-z);
        return (Math.sinh(root) - root) / root ** 3;
    }
    return 1 / 6 - z / 120;
}

// 順行圓軌道在 angle 處的速度向量（m/s）。
export function getCircularVelocityVector(radiusAU, angle) {
    const speed = circularSpeedKms(radiusAU) * 1000;
    return { x: -speed * Math.sin(angle), y: speed * Math.cos(angle) };
}

// universal-variables Lambert（Bate–Mueller–White），2D 順行。
// r1Vec/r2Vec 單位公尺，tofSeconds 秒；回傳 {v1, v2}（m/s）或 null。
export function solveLambert(r1Vec, r2Vec, tofSeconds) {
    const r1 = Math.hypot(r1Vec.x, r1Vec.y);
    const r2 = Math.hypot(r2Vec.x, r2Vec.y);
    const cross = r1Vec.x * r2Vec.y - r1Vec.y * r2Vec.x;
    const cosSweep = Math.min(Math.max(
        (r1Vec.x * r2Vec.x + r1Vec.y * r2Vec.y) / (r1 * r2), -1), 1);
    let sweep = Math.acos(cosSweep);
    if (cross < 0) sweep = Math.PI * 2 - sweep;
    if (Math.abs(1 - cosSweep) < 1e-12) return null;

    const A = Math.sin(sweep) * Math.sqrt((r1 * r2) / (1 - cosSweep));
    if (Math.abs(A) < 1e-6) return null;

    const timeOfFlightFor = (z) => {
        const y = r1 + r2 + A * (z * stumpffS(z) - 1) / Math.sqrt(stumpffC(z));
        if (y < 0) return null;
        const chi = Math.sqrt(y / stumpffC(z));
        return {
            y,
            tof: (chi ** 3 * stumpffS(z) + A * Math.sqrt(y)) / Math.sqrt(MU_SUN),
        };
    };

    let zLow = -4 * Math.PI ** 2;
    let zHigh = 4 * Math.PI ** 2;
    while (timeOfFlightFor(zLow) === null) zLow = (zLow + zHigh) / 2;

    let solution = null;
    for (let i = 0; i < 200; i += 1) {
        const zMid = (zLow + zHigh) / 2;
        const result = timeOfFlightFor(zMid);
        if (result === null) {
            zLow = zMid;
            continue;
        }
        if (result.tof < tofSeconds) zLow = zMid;
        else zHigh = zMid;
        solution = { z: zMid, ...result };
        if (Math.abs(result.tof - tofSeconds) < 1) break;
    }
    if (!solution || Math.abs(solution.tof - tofSeconds) > tofSeconds * 0.001) return null;

    const { y } = solution;
    const f = 1 - y / r1;
    const g = A * Math.sqrt(y / MU_SUN);
    const gDot = 1 - y / r2;
    return {
        v1: { x: (r2Vec.x - f * r1Vec.x) / g, y: (r2Vec.y - f * r1Vec.y) / g },
        v2: { x: (gDot * r2Vec.x - r1Vec.x) / g, y: (gDot * r2Vec.y - r1Vec.y) / g },
        sweep,
    };
}

function evaluateTransferCandidate(launchDay, tofDays) {
    const earth = getPlanetPosition(CONSTANTS.EARTH_ORBIT_AU, CONSTANTS.EARTH_PERIOD_DAYS, launchDay);
    const mars = getPlanetPosition(
        CONSTANTS.MARS_ORBIT_AU,
        CONSTANTS.MARS_PERIOD_DAYS,
        launchDay + tofDays,
    );
    const r1Vec = { x: earth.x * CONSTANTS.AU_M, y: earth.y * CONSTANTS.AU_M };
    const r2Vec = { x: mars.x * CONSTANTS.AU_M, y: mars.y * CONSTANTS.AU_M };
    const lambert = solveLambert(r1Vec, r2Vec, tofDays * DAY_SECONDS);
    if (!lambert) return null;

    const earthVelocity = getCircularVelocityVector(CONSTANTS.EARTH_ORBIT_AU, earth.angle);
    const marsVelocity = getCircularVelocityVector(CONSTANTS.MARS_ORBIT_AU, mars.angle);
    const injection = Math.hypot(lambert.v1.x - earthVelocity.x, lambert.v1.y - earthVelocity.y) / 1000;
    const insertion = Math.hypot(marsVelocity.x - lambert.v2.x, marsVelocity.y - lambert.v2.y) / 1000;
    return { tofDays, lambert, r1Vec, injection, insertion, total: injection + insertion, earth };
}

export function solveTransferForLaunchDay(launchDay, options = {}) {
    const { tofMinDays = 90, tofMaxDays = 450 } = options;

    let best = null;
    let step = 6;
    let low = tofMinDays;
    let high = tofMaxDays;
    for (let pass = 0; pass < 3; pass += 1) {
        for (let tof = low; tof <= high; tof += step) {
            const candidate = evaluateTransferCandidate(launchDay, tof);
            if (candidate && (!best || candidate.total < best.total)) best = candidate;
        }
        if (!best) return null;
        low = Math.max(tofMinDays, best.tofDays - step);
        high = Math.min(tofMaxDays, best.tofDays + step);
        step /= 4;
    }

    // 從最佳解的狀態向量推軌道元素，供渲染與遙測使用。
    const { v1 } = best.lambert;
    const { r1Vec } = best;
    const r1 = Math.hypot(r1Vec.x, r1Vec.y);
    const speedSq = v1.x ** 2 + v1.y ** 2;
    const semiMajorAxisM = 1 / (2 / r1 - speedSq / MU_SUN);
    const angularMomentum = r1Vec.x * v1.y - r1Vec.y * v1.x;
    const eccVector = {
        x: (v1.y * angularMomentum) / MU_SUN - r1Vec.x / r1,
        y: (-v1.x * angularMomentum) / MU_SUN - r1Vec.y / r1,
    };
    const eccentricity = Math.hypot(eccVector.x, eccVector.y);
    const cosNu = Math.min(Math.max(
        (eccVector.x * r1Vec.x + eccVector.y * r1Vec.y) / (eccentricity * r1), -1), 1);
    let startTrueAnomaly = Math.acos(cosNu);
    if (r1Vec.x * v1.x + r1Vec.y * v1.y < 0) startTrueAnomaly = Math.PI * 2 - startTrueAnomaly;

    return {
        id: 'custom',
        name: '即時解轉移',
        nameEn: 'Coplanar Lambert transfer',
        durationDays: Math.round(best.tofDays),
        injectionDeltaV: Number(best.injection.toFixed(2)),
        insertionDeltaV: Number(best.insertion.toFixed(2)),
        semiMajorAxisAU: semiMajorAxisM / CONSTANTS.AU_M,
        eccentricity,
        transferAngleDeg: toDegrees(best.lambert.sweep),
        startTrueAnomalyDeg: toDegrees(startTrueAnomaly),
        summary: `此發射日的最小 ΔV 解：${Math.round(best.tofDays)} 天抵達，總 ΔV ${(best.injection + best.insertion).toFixed(2)} km/s。`,
    };
}
