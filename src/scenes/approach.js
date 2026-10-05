// The opening walk: first-person, down the path, up to the gate.

import { makeCamera, beginView, renderScene, DEG } from '../camera.js';
import { PAPER, paperGrain, label, sketchLine } from '../sketch.js';
import { castleGeometry, approachGround, CASTLE } from '../geom/castle.js';
import { easeInOut } from './fade.js';
import { daylight } from '../light.js';

const DURATION = 11.0;

let cached = null;
function geometry() {
  if (!cached) {
    const c = castleGeometry();
    const g = approachGround();
    cached = { faces: [...g.faces, ...c.faces], segs: [...g.segs, ...c.segs], texts: [] };
  }
  return cached;
}

export function makeApproach(app) {
  const cam = makeCamera({ y: 1.68, z: CASTLE.START_Z, fov: 58 * DEG });
  let t = 0;
  let arrived = false;

  return {
    name: 'approach',

    update(dt) {
      t += dt;
      const u = Math.min(1, t / DURATION);
      const e = easeInOut(u);
      cam.z = CASTLE.START_Z + (CASTLE.ARRIVE_Z - CASTLE.START_Z) * e;

      // A walking gait: vertical bob, lateral sway, and a touch of roll-free
      // head turn. Amplitude scales with speed so the pauses sit still.
      const speed = Math.abs(Math.cos(Math.PI * u)) * 0.5 + 0.5;
      const stride = t * 3.1;
      cam.y = 1.68 + Math.sin(stride * 2) * 0.035 * speed;
      cam.x = Math.sin(stride) * 0.1 * speed;
      cam.yaw = Math.sin(stride * 0.5) * 0.012 * speed;
      // Look up at the donjon as it rises overhead.
      cam.pitch = -0.02 + e * e * 0.1;

      if (u >= 1 && !arrived) {
        arrived = true;
        app.go('hall');
      }
      app.setStatus(t < DURATION * 0.75 ? 'SPACE  skip the walk' : '');
    },

    action(a) {
      if ((a === 'open' || a === 'up' || a === 'back') && !arrived) {
        arrived = true;
        app.go('hall');
      }
    },

    render(ctx, w, h) {
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, w, h);

      const v = beginView(cam, w, h);
      renderScene(ctx, v, geometry());
      daylight(ctx, w, h);
      paperGrain(ctx, w, h);

      // Title card, fading out as the walk begins.
      const titleAlpha = Math.max(0, 1 - Math.max(0, t - 1.6) / 2.2);
      if (titleAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = titleAlpha;
        label(ctx, 'CASTLE', w / 2, h * 0.3, Math.min(86, w * 0.12), { weight: 'bold', alpha: 0.9 });
        label(ctx, 'what comes next', w / 2, h * 0.3 + Math.min(72, w * 0.1), Math.min(22, w * 0.03), { alpha: 0.6 });
        const uw = Math.min(260, w * 0.3);
        sketchLine(ctx, w / 2 - uw / 2, h * 0.3 + 34, w / 2 + uw / 2, h * 0.3 + 34, 4242, { alpha: 0.5 });
        ctx.restore();
      }
    },
  };
}
