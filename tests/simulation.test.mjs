import test from 'node:test';
import assert from 'node:assert/strict';

import {
    CONSTANTS,
    TRANSFER_MODES,
    calculateOptimalLaunchDay,
    getLaunchGeometry,
    getModeDeltaV,
    getSynodicPeriod,
    getTransferPosition,
} from '../simulation.mjs';

test('Earth–Mars synodic period remains close to 780 days', () => {
    assert.ok(Math.abs(getSynodicPeriod() - 779.9) < 0.2);
});

test('calculated Hohmann window reproduces the known launch epoch', () => {
    assert.ok(Math.abs(calculateOptimalLaunchDay(TRANSFER_MODES.hohmann) - 684) < 1);
});

test('each calculated window intercepts Mars inside the arrival threshold', () => {
    for (const mode of Object.values(TRANSFER_MODES)) {
        const launchDay = calculateOptimalLaunchDay(mode);
        const geometry = getLaunchGeometry(mode, launchDay);
        assert.equal(geometry.rating, 'aligned');
        assert.ok(geometry.arrivalErrorAU < CONSTANTS.ARRIVAL_THRESHOLD_AU);
    }
});

test('a deliberately late Hohmann launch misses Mars', () => {
    const launchDay = calculateOptimalLaunchDay(TRANSFER_MODES.hohmann) + 40;
    assert.equal(getLaunchGeometry(TRANSFER_MODES.hohmann, launchDay).rating, 'miss');
});

test('transfer endpoints begin at Earth orbit and finish at Mars orbit', () => {
    for (const mode of Object.values(TRANSFER_MODES)) {
        assert.ok(Math.abs(getTransferPosition(mode, 0, 0).radiusAU - 1) < 0.001);
        assert.ok(Math.abs(getTransferPosition(mode, 1, 0).radiusAU - CONSTANTS.MARS_ORBIT_AU) < 0.001);
    }
});

test('mode delta-v includes injection and Mars insertion burns', () => {
    assert.equal(getModeDeltaV(TRANSFER_MODES.hohmann), 5.6);
    assert.equal(getModeDeltaV(TRANSFER_MODES.fast), 11.4);
});
