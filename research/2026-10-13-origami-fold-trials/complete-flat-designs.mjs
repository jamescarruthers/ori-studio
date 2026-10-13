// Reconstruct the corrected flat paths from the preserved original experiments.
// Uses the public Fold bridge and its stored witnesses, never model-specific engine code.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Trial, dir } from './trial-lib.mjs';

function prefix(slug, source, count) {
  const original = JSON.parse(fs.readFileSync(path.join(dir, `${source}.sequence.json`)));
  const trial = new Trial(slug, `${slug === 'heart' ? 'Heart' : 'Swan'} — completed flat sequence`, original.paper);
  for (const step of original.steps.slice(0, count)) trial.add(step.op, step.note, step.choices);
  return trial;
}
function balancedOpenings(trial, op) {
  const question = trial.e.compound_analysis(trial.state, op);
  assert.equal(question.status, 'ok');
  return question.analysis.flaps.map((flap) => {
    const opening = flap.openings.find((o) => o.upper.length === o.lower.length);
    assert.ok(opening, 'the central spine must separate two equal blocks');
    return opening.stored;
  });
}

export function completedHeart() {
  const t = prefix('heart', 'heart', 9);
  const seed = t.at([0.48, 0.9]);
  const op = {
    kind: 'tuck', direction: 'valley',
    line: { via: 'free', through: [t.at([0.15, 0.625]), t.at([0.85, 0.625])] },
    moving: seed, seed: { scope: 'depth', at: seed, layers: 1 },
    target: t.at([0.2, 0.65]), additionalTargets: [t.at([0.8, 0.65])],
  };
  const result = t.e.tuck(t.state, op);
  assert.equal(result.status, 'ok');
  assert.equal(result.outcome, 'choose_order');
  // Both completions retain the side triangles. The tutorial also leaves the
  // lowered flap ABOVE the stationary bottom triangle. At view (x, .4), that
  // exposes sheet (x, .85), rather than the old bottom strip at (x, .1).
  // Select by material identity, never by the solver's enumeration order.
  const matching = result.candidates.filter((candidate) => [0.4, 0.6].every((x) => {
    const [sx, sy] = t.at([x, 0.4], 0, candidate.state);
    return Math.abs(sx - x) < 1e-8 && Math.abs(sy - 0.85) < 1e-8;
  }));
  assert.equal(matching.length, 1, 'one tuck order must expose the lowered flap over the bottom triangle');
  t.add(op, '8: lower the upper flap beneath both side triangles, above the bottom triangle', matching[0].stored);
  t.e.release(Uint32Array.from(result.candidates.map((c) => c.state)));
  t.line([0.25, 0.5], [0.25, 0.75], [0.2, 0.65], '9a: fold left side triangle inward');
  t.line([0.75, 0.5], [0.75, 0.75], [0.8, 0.65], '9b: fold right side triangle inward');
  for (const [a, b, moving, note, scope] of [
    [[0.25, 0.625], [0.375, 0.75], [0.26, 0.73], '10a: fold outer left corner', 'all'],
    [[0.375, 0.75], [0.5, 0.625], [0.49, 0.73], '10b: fold inner left corner', 1],
    [[0.5, 0.625], [0.625, 0.75], [0.51, 0.73], '10c: fold inner right corner', 1],
    [[0.625, 0.75], [0.75, 0.625], [0.74, 0.73], '10d: fold outer right corner', 'all'],
  ]) t.line(a, b, moving, note, { scope });
  t.line([0.33, 0.705], [0.42, 0.705], [0.37, 0.735], '11: fold down both top points');
  t.turn('12: turn over the completed heart');
  return t.doc;
}

export function completedSwan() {
  const t = prefix('swan', 'swan-reverse-alternative', 8);
  const moving = t.at([-0.015, 0.15]);
  const slope = -Math.tan(Math.PI / 3);
  const neck = {
    kind: 'outside-reverse',
    line: { via: 'free', through: [-0.12, -0.005].map((x) => t.at([x, Math.SQRT1_2 + x * slope])) },
    moving, seed: { scope: 'depth', at: moving, layers: 1 },
  };
  t.add(neck, '9: outside reverse the neck around the body', { opening: balancedOpenings(t, neck) });
  const triangle = t.scene().faces.find((f) => f.outline.length === 3 && f.outline.some((p) => p.x > 0.5));
  assert.ok(triangle, 'the lifted neck is triangular');
  const [tip, ...base] = triangle.outline.map((p) => [p.x, p.y]).sort((a, b) => b[0] - a[0]);
  const atFraction = (fraction) => tip.map((v, i) => v * fraction + (base[0][i] + base[1][i]) * (1 - fraction) / 2);
  const point = atFraction(0.82), tangent = [0.5, -Math.sqrt(3) / 2];
  const headMoving = t.at(atFraction(0.95));
  const head = {
    kind: 'outside-reverse',
    line: { via: 'free', through: [-0.003, 0.003].map((d) => t.at(point.map((v, i) => v + d * tangent[i]))) },
    moving: headMoving, seed: { scope: 'depth', at: headMoving, layers: 1 },
  };
  t.add(head, '10: outside reverse the head tip', { opening: balancedOpenings(t, head) });
  t.rotate(90, 'Orient the swan upright');
  return t.doc;
}
