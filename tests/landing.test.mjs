import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createLanding,
    stepLanding,
    deployChute,
    atmosphereDensity,
    LANDER,
    SITES,
    landingScore,
} from '../landing.mjs';
function fly(site, auto, dt = 0.1) {
    const state = createLanding(site);
    state.status = 'descending';
    for (let i = 0; i < 10000 && state.status === 'descending'; i++)
        stepLanding(state, dt, { auto });
    return state;
}
test('all three landing scenarios can be completed with feedback guidance', () => {
    for (const site of Object.keys(SITES)) {
        const s = fly(site, true);
        assert.equal(s.status, 'landed', site);
        assert.ok(s.touchdownSpeed <= LANDER.safeSpeed);
        assert.ok(s.fuel > 0 && s.fuel < s.initialFuel);
        assert.ok(s.time > 60 && s.time < 400);
        assert.ok(landingScore(s) > 0 && landingScore(s) <= 100);
    }
});
test('uncontrolled descent crashes; touching the surface never silently counts as success', () => {
    const s = fly('jezero', false);
    assert.equal(s.status, 'crashed');
    assert.ok(s.touchdownSpeed > 8);
    assert.equal(s.altitude, 0);
    assert.equal(landingScore(s), 0);
});
test('physics is stable across rendering speeds', () => {
    const a = fly('jezero', true, 0.04),
        b = fly('jezero', true, 0.8);
    assert.ok(Math.abs(a.time - b.time) < 0.1);
    assert.ok(Math.abs(a.fuel - b.fuel) < 0.1);
    assert.ok(Math.abs(a.touchdownSpeed - b.touchdownSpeed) < 0.01);
});
test('parachute interlocks and ignition cutaway', () => {
    const s = createLanding();
    s.status = 'descending';
    assert.equal(deployChute(s), false);
    s.altitude = 7000;
    s.velocity = -550;
    assert.equal(deployChute(s), false);
    s.velocity = -300;
    assert.equal(deployChute(s), true);
    assert.equal(deployChute(s), false);
    stepLanding(s, 0.1, { throttle: 1 });
    assert.equal(s.chute, 'cut');
    assert.equal(deployChute(s), false);
});
test('empty tank cannot produce thrust and fuel never becomes negative', () => {
    const s = createLanding();
    s.status = 'descending';
    s.fuel = 0.0001;
    stepLanding(s, 0.1, { throttle: 1 });
    assert.equal(s.fuel, 0);
    stepLanding(s, 0.1, { throttle: 1 });
    assert.equal(s.throttle, 0);
});
test('completed descent is immutable under later ticks; invalid timesteps are ignored', () => {
    const s = fly('jezero', true),
        saved = { ...s };
    stepLanding(s, 1, { throttle: 1 });
    assert.deepEqual(s, saved);
    const ready = createLanding();
    stepLanding(ready, 1);
    assert.equal(ready.time, 0);
    ready.status = 'descending';
    stepLanding(ready, NaN);
    stepLanding(ready, -1);
    assert.equal(ready.time, 0);
});
test('Mars density is positive and lower at altitude', () => {
    assert.ok(atmosphereDensity(0) > 0.014);
    assert.ok(atmosphereDensity(8000) < atmosphereDensity(0));
});
