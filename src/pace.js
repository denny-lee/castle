// The pace rule, in one place.
//
// It lives here rather than in scenes/ledger.js because the geometry layer needs
// it too: a shelf flags an overdue box, and the geometry must not import from
// scenes/.

const DAY = 86400000;

/**
 * When week `weekNo` was due.
 *
 * The rule: the FIRST completion is the anchor. Whenever you finished your first
 * card becomes week `firstWeekNo`, and every later week is expected one week
 * after the last. So the anchor week always has a drift of zero by construction
 * - it is the baseline, not an achievement - and what drift really tells you is
 * whether you have held the pace you set yourself.
 *
 * Null when nothing has been finished yet, because then there is no pace to
 * extrapolate from, and nothing can honestly be called late.
 */
export function dueDateFor(firstDoneAt, firstWeekNo, weekNo) {
  if (!firstDoneAt || weekNo == null || firstWeekNo == null) return null;
  return new Date(new Date(firstDoneAt).getTime() + (weekNo - firstWeekNo) * 7 * DAY);
}

/**
 * How many whole days past due the waiting card is; 0 when it is not overdue, or
 * when there is no anchor to judge it against.
 *
 * Takes anything carrying {firstDoneAt, firstWeekNo, activeWeekNo} - a layout
 * box or a top card both qualify.
 */
export function overdueDaysFor(subject, now = Date.now()) {
  if (!subject) return 0;
  const week = subject.activeWeekNo ?? subject.weekNo;
  const due = dueDateFor(subject.firstDoneAt, subject.firstWeekNo, week);
  if (!due) return 0;
  return Math.max(0, Math.floor((now - due.getTime()) / DAY));
}

export { DAY };
