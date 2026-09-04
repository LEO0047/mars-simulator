import test from 'node:test';
import assert from 'node:assert/strict';

import {
    CONSTANTS,
    TRANSFER_MODES,
    calculateOptimalLaunchDay,
    getDistance,
    getPlanetPosition,
    getSynodicPeriod,
    getTransferPosition,
    solveTransferForLaunchDay,
} from '../simulation.mjs';

test('Lambert solver at the Hohmann window reproduces a Hohmann-like transfer', () => {
    const launchDay = Math.round(
        calculateOptimalLaunchDay(TRANSFER_MODES.hohmann),
    );
    const solution = solveTransferForLaunchDay(launchDay);
    assert.ok(solution, 'expected a solution at the Hohmann window');
    assert.ok(
        Math.abs(solution.durationDays - 259) < 15,
        `duration ${solution.durationDays}`,
    );
    assert.ok(
        Math.abs(solution.eccentricity - TRANSFER_MODES.hohmann.eccentricity) <
            0.05,
    );
    const total = solution.injectionDeltaV + solution.insertionDeltaV;
    assert.ok(Math.abs(total - 5.59) < 0.3, `total delta-v ${total}`);
});

test('Lambert solver finds an intercepting transfer for every sampled launch day', () => {
    const synodic = getSynodicPeriod();
    for (let i = 0; i < 12; i += 1) {
        const launchDay = Math.round((i / 12) * synodic);
        const solution = solveTransferForLaunchDay(launchDay);
        assert.ok(solution, `no solution on day ${launchDay}`);

        const earth = getPlanetPosition(
            CONSTANTS.EARTH_ORBIT_AU,
            CONSTANTS.EARTH_PERIOD_DAYS,
            launchDay,
        );
        const arrival = getTransferPosition(solution, 1, earth.angle);
        const mars = getPlanetPosition(
            CONSTANTS.MARS_ORBIT_AU,
            CONSTANTS.MARS_PERIOD_DAYS,
            launchDay + solution.durationDays,
        );
        const errorAU = getDistance(arrival, mars);
        assert.ok(
            errorAU < CONSTANTS.ARRIVAL_THRESHOLD_AU,
            `day ${launchDay}: arrival error ${errorAU.toFixed(4)} AU`,
        );
    }
});

test('solved transfers start on Earth orbit and end on Mars orbit', () => {
    for (const launchDay of [0, 200, 500, 684]) {
        const solution = solveTransferForLaunchDay(launchDay);
        assert.ok(solution, `no solution on day ${launchDay}`);
        assert.ok(
            Math.abs(getTransferPosition(solution, 0, 0).radiusAU - 1) < 0.01,
        );
        assert.ok(
            Math.abs(
                getTransferPosition(solution, 1, 0).radiusAU -
                    CONSTANTS.MARS_ORBIT_AU,
            ) < 0.05,
        );
    }
});

test('off-window launches cost more delta-v than the Hohmann window', () => {
    const windowDay = Math.round(
        calculateOptimalLaunchDay(TRANSFER_MODES.hohmann),
    );
    const atWindow = solveTransferForLaunchDay(windowDay);
    const offWindow = solveTransferForLaunchDay(
        Math.round(windowDay + getSynodicPeriod() / 2) % 780,
    );
    assert.ok(atWindow && offWindow);
    const windowTotal = atWindow.injectionDeltaV + atWindow.insertionDeltaV;
    const offTotal = offWindow.injectionDeltaV + offWindow.insertionDeltaV;
    assert.ok(
        offTotal > windowTotal + 1,
        `expected clear penalty: ${windowTotal} vs ${offTotal}`,
    );
});

test('Lambert flight time retains precision so arrival and displayed phase agree', () => {
    for (const day of [0, 200, 500, 684]) {
        const solution = solveTransferForLaunchDay(day);
        const earth = getPlanetPosition(1, CONSTANTS.EARTH_PERIOD_DAYS, day);
        const mars = getPlanetPosition(
            1.524,
            CONSTANTS.MARS_PERIOD_DAYS,
            day + solution.durationDays,
        );
        assert.ok(
            getDistance(getTransferPosition(solution, 1, earth.angle), mars) <
                1e-5,
        );
    }
});
