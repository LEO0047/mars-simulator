// A one-dimensional terminal-descent sandbox. SI units throughout.
// Density: NASA Glenn Mars atmosphere curve fit (0–8 km in this simulation).
// https://www.grc.nasa.gov/www/k-12/airplane/atmosmrm.html
export const LANDER = Object.freeze({
    gravity: 3.711,
    dryMass: 900,
    fuel: 450,
    thrust: 18000,
    isp: 225,
    safeSpeed: 8,
});
export const SITES = Object.freeze({
    jezero: {
        name: '傑澤羅隕石坑',
        en: 'JEZERO CRATER',
        coordinates: '18.38° N / 77.58° E',
        density: 1,
        fuel: 450,
        description: '標準大氣・450 kg 燃料',
        color: '#d88962',
    },
    elysium: {
        name: '埃律西昂平原',
        en: 'ELYSIUM PLANITIA',
        coordinates: '4.50° N / 135.90° E',
        density: 1.15,
        fuel: 450,
        description: '濃厚大氣・450 kg 燃料',
        color: '#c99770',
    },
    olympus: {
        name: '奧林帕斯高地',
        en: 'OLYMPUS HIGHLANDS',
        coordinates: '18.65° N / 226.20° E',
        density: 0.6,
        fuel: 330,
        description: '稀薄大氣・330 kg 燃料',
        color: '#b97562',
    },
});
export function atmosphereDensity(altitude) {
    const h = Math.max(0, Math.min(altitude, 8000));
    const temperature = h > 7000 ? -23.4 - 0.00222 * h : -31 - 0.000998 * h;
    return (0.699 * Math.exp(-0.00009 * h)) / (0.1921 * (temperature + 273.1));
}
export function createLanding(site = 'jezero') {
    const config = SITES[site] ?? SITES.jezero;
    return {
        site: SITES[site] ? site : 'jezero',
        altitude: 8000,
        velocity: -320,
        fuel: config.fuel,
        initialFuel: config.fuel,
        time: 0,
        chute: 'packed',
        throttle: 0,
        status: 'ready',
        peakDeceleration: 0,
        touchdownSpeed: null,
    };
}
export function deployChute(state) {
    if (
        state.status !== 'descending' ||
        state.chute !== 'packed' ||
        Math.abs(state.velocity) > 500 ||
        state.altitude > 7800
    )
        return false;
    state.chute = 'open';
    return true;
}
export function autopilotControls(state) {
    const chute =
        state.altitude < 7700 &&
        state.velocity > -500 &&
        state.chute === 'packed';
    // Velocity feedback follows a braking envelope, then slows to 2.5 m/s.
    if (state.altitude > 1500) return { chute, throttle: 0 };
    const targetSpeed = Math.min(
        65,
        Math.sqrt(Math.max(0, state.altitude - 8) * 1.4) + 2.5,
    );
    const acceleration = LANDER.gravity + (-targetSpeed - state.velocity) * 0.8;
    return {
        chute,
        throttle: Math.max(
            0,
            Math.min(
                1,
                (acceleration * (LANDER.dryMass + state.fuel)) / LANDER.thrust,
            ),
        ),
    };
}
export function stepLanding(
    state,
    dt,
    { throttle = 0, chute = false, auto = false } = {},
) {
    if (state.status !== 'descending' || !Number.isFinite(dt) || dt <= 0)
        return state;
    // Fixed 20 ms substeps make physics independent of animation frame rate.
    let remaining = Math.min(dt, 1);
    while (remaining > 1e-9 && state.status === 'descending') {
        const step = Math.min(0.02, remaining);
        remaining -= step;
        const control = auto ? autopilotControls(state) : { throttle, chute };
        if (control.chute) deployChute(state);
        state.throttle =
            state.fuel > 0 && Number.isFinite(control.throttle)
                ? Math.max(0, Math.min(1, control.throttle))
                : 0;
        if (state.throttle > 0 && state.chute === 'open') state.chute = 'cut';
        const consumed = Math.min(
            state.fuel,
            ((LANDER.thrust * state.throttle) / (LANDER.isp * 9.80665)) * step,
        );
        const thrust = (consumed * LANDER.isp * 9.80665) / step;
        const mass = LANDER.dryMass + state.fuel;
        const cdArea = state.chute === 'open' ? 420 : 12;
        const density =
            atmosphereDensity(state.altitude) * SITES[state.site].density;
        const drag =
            -0.5 * density * cdArea * state.velocity * Math.abs(state.velocity);
        const acceleration = -LANDER.gravity + (drag + thrust) / mass;
        const nextVelocity = state.velocity + acceleration * step;
        const nextAltitude =
            state.altitude + ((state.velocity + nextVelocity) * step) / 2;
        const fraction =
            nextAltitude < 0
                ? state.altitude / (state.altitude - nextAltitude)
                : 1;
        state.velocity += acceleration * step * fraction;
        state.altitude = Math.max(0, nextAltitude);
        state.fuel -= consumed * fraction;
        state.time += step * fraction;
        state.peakDeceleration = Math.max(
            state.peakDeceleration,
            (drag + thrust) / mass,
        );
        if (state.altitude === 0) {
            state.touchdownSpeed = Math.abs(state.velocity);
            state.status =
                state.touchdownSpeed <= LANDER.safeSpeed ? 'landed' : 'crashed';
            state.throttle = 0;
        }
    }
    return state;
}
export function landingScore(state) {
    if (state.status !== 'landed') return 0;
    return Math.round(
        70 * (1 - state.touchdownSpeed / LANDER.safeSpeed) +
            (30 * state.fuel) / state.initialFuel,
    );
}
