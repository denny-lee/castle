import { makeCamera, beginView, project, toCam } from '../src/camera.js';
import { roomShell, shelfGeometry, WALL_FRAME, WALL_YAW, SHELF_X, EYE_Y } from '../src/geom/room.js';
import { stub } from '../src/data/stub.js';
import { castleGeometry, approachGround, CASTLE } from '../src/geom/castle.js';

function normal(p) {
  const a=[p[1][0]-p[0][0],p[1][1]-p[0][1],p[1][2]-p[0][2]];
  const b=[p[2][0]-p[0][0],p[2][1]-p[0][1],p[2][2]-p[0][2]];
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}
let fail = 0;
const ok = (c,m)=>{ if(!c){ console.log('FAIL', m); fail++; } else console.log('ok  ', m); };

// --- interior walls must face the room centre -----------------------------
const shell = roomShell();
const eye = [0, EYE_Y, 0];
let inward = 0;
for (const f of shell.faces) {
  const n = normal(f.p), c = f.p[0];
  const d = n[0]*(eye[0]-c[0]) + n[1]*(eye[1]-c[1]) + n[2]*(eye[2]-c[2]);
  if (d > 0) inward++;
}
ok(inward >= 6, `room shell: ${inward}/${shell.faces.length} faces visible from the centre (walls+floor+ceiling = 6)`);

// --- all geometry must be finite ------------------------------------------
const cg = castleGeometry(), ag = approachGround();
const allFaces = [...cg.faces, ...ag.faces, ...shell.faces];
ok(allFaces.every(f => f.p.length>=3 && f.p.every(v => v.every(Number.isFinite))),
   `${allFaces.length} castle+room faces all finite`);
ok([...cg.segs, ...ag.segs].every(s => s.a.every(Number.isFinite) && s.b.every(Number.isFinite)),
   `${cg.segs.length + ag.segs.length} segments all finite`);

// --- shelves land on the right walls, in front of the viewer --------------
await stub.init();
const rooms = await stub.listRooms();
ok(rooms.length === 5 && rooms.map(r=>r.code).join(',') === 'SKILL,INTEREST,IMAGINE,APPETENCE,WORKSHOP',
   'five rooms, in order: ' + rooms.map(r=>r.code).join(' '));
const layout = await stub.getRoomLayout(1);
ok(layout.length === 9, '9 shelves in SKILL');
ok(layout.filter(s=>s.wall==='front').length===3 && layout.filter(s=>s.wall==='left').length===3
   && layout.filter(s=>s.wall==='right').length===3, '3 shelves on each of front/left/right');

for (const wname of ['front','left','right']) {
  const onWall = layout.filter(s=>s.wall===wname).sort((a,b)=>a.number-b.number);
  const cam = makeCamera({x:0,y:EYE_Y,z:0,yaw:WALL_YAW[wname]});
  const v = beginView(cam, 1600, 900);
  onWall.forEach((shelf,i) => {
    const base = WALL_FRAME[wname];
    const place = (p)=>base([p[0]+SHELF_X[i], p[1], p[2]]);
    const g = shelfGeometry(shelf, place, 1000);
    const front = g.outline.map(p=>toCam(v,p));
    const allInFront = front.every(c=>c[2] > 0.3);
    const scr = g.outline.map(p=>project(v,p));
    const onScreen = scr.every(p=>p && p[0]>-400 && p[0]<2000);
    if (!allInFront || !onScreen) { console.log('FAIL shelf',shelf.number,wname,front, scr); fail++; }
  });
}
ok(true, 'every shelf on front/left/right projects in front of the squared-up camera');

// --- cursor cells carry a front rectangle for the highlight ---------------
const s1 = layout.find(s=>s.number===1);
const g1 = shelfGeometry(s1, (p)=>WALL_FRAME.front([p[0]+SHELF_X[0],p[1],p[2]]), 1000);
const withBox = [...g1.cells.values()].filter(c=>c.box);
ok(withBox.length === s1.boxes.length, `shelf 1: ${withBox.length} box cells == ${s1.boxes.length} seeded boxes`);
ok(withBox.every(c=>c.rect && c.rect.length===4 && c.rect.every(p=>p.every(Number.isFinite))),
   'each box cell has a finite 4-point highlight rect');
const bin = g1.cells.get(`${s1.levels-1},${s1.slots-1}`);
ok(bin && bin.bin === true, 'bottom-right cell is the bin');

// --- progression ----------------------------------------------------------
const box = s1.boxes[0];
let c = await stub.getTopCard(box.id);
ok(c.weekNo === 1, `top card of ${c.subject} is week 1: "${c.tasks[0].text}"`);
const r = await stub.markCardDone(c.id);
ok(r.nextCard.weekNo === 2, 'marking it done reveals week 2');
const tl = await stub.getTimeline(box.id);
ok(tl.length === 1 && tl[0].weekNo === 1, 'timeline records the completed week');
const after = (await stub.getRoomLayout(1)).find(s=>s.number===1).boxes.find(b=>b.id===box.id);
ok(after.doneCount === 1 && after.remaining === after.cardCount-1, 'layout reflects the completion');

// drain a box completely
let guard = 0;
while ((c = await stub.getTopCard(box.id)) && guard++ < 50) await stub.markCardDone(c.id);
ok(await stub.getTopCard(box.id) === null, 'a fully drained box reports no card');

// --- sessions, through the stub ------------------------------------------
const sess = await stub.startSession(box.id, null);
ok(typeof sess.id === 'number', 'the stub opens a visit');
ok((await stub.endSession(sess.id)).closed === true, 'and closes it');
ok((await stub.endSession(sess.id)).closed === false, 'closing twice reports false');
const stubLed = await stub.getLedger(box.id);
ok(stubLed.visits === 1 && stubLed.subject === 'Calculus',
   'the stub ledger reports the visit and the subject');

// --- the pace arithmetic, on synthetic data ------------------------------
// This is the part of the ledger that encodes a judgement rather than stored
// data, so it is worth pinning down precisely.
const { computeLedger } = await import('../src/scenes/ledger.js');
const day = 86400000;
const t0 = Date.parse('2026-03-02T09:00:00.000Z');
const iso = (offsetDays) => new Date(t0 + offsetDays * day).toISOString();

const synthetic = computeLedger({
  subject: 'Russian', boxId: 1, firstDoneAt: iso(0), firstWeekNo: 1,
  visits: 5, unfinishedVisits: 0, seconds: 3600,
  weeks: [
    { cardId: 1, seq: 0, weekNo: 1, title: 'Week 1', doneAt: iso(0), taskCount: 3 },
    { cardId: 2, seq: 1, weekNo: 2, title: 'Week 2', doneAt: iso(10), taskCount: 3 },
    { cardId: 3, seq: 2, weekNo: 3, title: 'Week 3', doneAt: iso(18), taskCount: 2 },
    { cardId: 4, seq: 3, weekNo: 4, title: 'Week 4', doneAt: null, taskCount: 2 },
  ],
});
ok(synthetic.weeks[0].driftDays === 0, 'the anchor week is zero drift by definition');
ok(synthetic.weeks[1].driftDays === 3, 'week 2 finished on day 10 is 3 days late');
ok(synthetic.weeks[2].driftDays === 4, 'week 3 finished on day 18 is 4 days late');
ok(synthetic.weeks[3].driftDays === null && synthetic.weeks[3].plannedAt !== null,
   'the unfinished week has a due date but no drift');
ok(Math.abs(synthetic.paceDays - 9) < 1e-9,
   `pace over 18 days and 3 completions is ${synthetic.paceDays} days per week`);
ok(synthetic.doneCount === 3 && synthetic.remaining === 1, 'the totals add up');

const early = computeLedger({
  subject: 'C', boxId: 2, firstDoneAt: iso(0), firstWeekNo: 1,
  visits: 0, unfinishedVisits: 0, seconds: 0,
  weeks: [
    { cardId: 1, seq: 0, weekNo: 1, title: 'Week 1', doneAt: iso(0), taskCount: 1 },
    { cardId: 2, seq: 1, weekNo: 2, title: 'Week 2', doneAt: iso(4), taskCount: 1 },
  ],
});
ok(early.weeks[1].driftDays === -3, 'finishing week 2 on day 4 reads as 3 days early');

const untouched = computeLedger({
  subject: 'Chess', boxId: 3, firstDoneAt: null, firstWeekNo: 0,
  visits: 0, unfinishedVisits: 0, seconds: 0,
  weeks: [{ cardId: 1, seq: 0, weekNo: 1, title: 'Week 1', doneAt: null, taskCount: 1 }],
});
ok(untouched.anchored === false && untouched.weeks[0].plannedAt === null,
   'with nothing finished there is no anchor and no due date');
ok(computeLedger(null) === null, 'computeLedger tolerates a missing ledger');

console.log(fail ? `\n${fail} FAILURES` : '\nall checks passed');
process.exit(fail ? 1 : 0);
