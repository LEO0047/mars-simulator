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

export const TRANSFER_MODES = Object.freeze({
    hohmann: Object.freeze({
        id: 'hohmann',
        name: '霍曼轉移',
        nameEn: 'Hohmann transfer',
        durationDays: 259,
        injectionDeltaV: 2.95,
        insertionDeltaV: 2.65,
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
        injectionDeltaV: 6.2,
        insertionDeltaV: 5.2,
        semiMajorAxisAU: 1.4,
        eccentricity: 0.2857,
        transferAngleDeg: 123.2,
        summary: '縮短 103 天航程，以更高注入與捕獲 ΔV 為代價。',
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
    const trueAnomaly = clampedProgress * toRadians(mode.transferAngleDeg);
    const radiusAU = mode.semiMajorAxisAU * (1 - mode.eccentricity ** 2)
        / (1 + mode.eccentricity * Math.cos(trueAnomaly));
    const angle = startAngle + trueAnomaly;

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
