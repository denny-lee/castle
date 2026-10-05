// The entrance hall: a ring of doors, one per category.

import { makeCamera, beginView, renderScene, project, DEG } from '../camera.js';
import { PAPER, paperGrain, label, sketchPoly } from '../sketch.js';
import { hallGeometry, EYE_Y, HALL_R } from '../geom/room.js';
import { makeViewCache, camKey } from '../cache.js';
import { torchlight } from '../light.js';

export function makeHall(app, rooms, startIndex = 0) {
  const geom = hallGeometry(rooms);
  const cam = makeCamera({ y: EYE_Y, x: 0, z: 0, fov: 66 * DEG });
  let sel = Math.min(Math.max(startIndex, 0), rooms.length - 1);
  let targetYaw = geom.doors[sel].theta;
  cam.yaw = targetYaw;
  const cache = makeViewCache();
  let clock = 0;

  return {
    name: 'hall',
    get selectedIndex() { return sel; },

    update(dt) {
      clock += dt;
      // Ease the view toward the chosen door rather than snapping.
      const k = 1 - Math.exp(-dt * 7);
      cam.yaw += (targetYaw - cam.yaw) * k;
      app.setStatus('← →  look around    ↑  enter the room    E  export    I  import');
    },

    action(a) {
      if (a === 'left' && sel > 0) { sel--; targetYaw = geom.doors[sel].theta; }
      else if (a === 'right' && sel < rooms.length - 1) { sel++; targetYaw = geom.doors[sel].theta; }
      else if (a === 'up' || a === 'open') { app.go('room', { room: rooms[sel], hallIndex: sel }); }
    },

    render(ctx, w, h) {
      cache.draw(ctx, w, h, camKey(cam), (octx, ow, oh) => {
        octx.fillStyle = PAPER;
        octx.fillRect(0, 0, ow, oh);
        renderScene(octx, beginView(cam, ow, oh), geom);
        paperGrain(octx, ow, oh);
      });
      const v = beginView(cam, w, h);

      // A bracket around the door you are facing, so the choice is unambiguous.
      const d = geom.doors[sel];
      const cx = Math.sin(d.theta) * HALL_R, cz = Math.cos(d.theta) * HALL_R;
      const corners = [[-2.1, 0, 0], [2.1, 0, 0], [2.1, 6.0, 0], [-2.1, 6.0, 0]].map((p) => {
        const c = Math.cos(d.theta), s = Math.sin(d.theta);
        return [cx + p[0] * c, p[1], cz - p[0] * s];
      });
      const scr = corners.map((p) => project(v, p));
      if (scr.every(Boolean)) {
        sketchPoly(ctx, scr, 31337, { color: '#7a3b2e', alpha: 0.5, width: 1.4, passes: 1 });
      }

      torchlight(ctx, w, h, clock);

      label(ctx, rooms[sel].name, w / 2, h - 86, Math.min(40, w * 0.055), { weight: 'bold', alpha: 0.85 });
      label(ctx, `${sel + 1} / ${rooms.length}`, w / 2, h - 56, 14, { alpha: 0.45 });
    },
  };
}
