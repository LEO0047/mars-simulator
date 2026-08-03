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

test('mode delta-v matches the textbook Hohmann burns under this model', () => {
    assert.ok(Math.abs(TRANSFER_MODES.hohmann.injectionDeltaV - 2.94) < 0.05);
    assert.ok(Math.abs(TRANSFER_MODES.hohmann.insertionDeltaV - 2.65) < 0.05);
    assert.ok(Math.abs(getModeDeltaV(TRANSFER_MODES.hohmann) - 5.59) < 0.1);
});

test('fast-transfer delta-v is derived from the same vector formula as Hohmann', () => {
    // 舊版寫死 6.2/5.2，與模型推不出的值；現改為同一套公式計算。
    assert.ok(Math.abs(TRANSFER_MODES.fast.injectionDeltaV - 3.99) < 0.05);
    assert.ok(Math.abs(TRANSFER_MODES.fast.insertionDeltaV - 6.57) < 0.05);
    assert.ok(getModeDeltaV(TRANSFER_MODES.fast) > getModeDeltaV(TRANSFER_MODES.hohmann));
});
