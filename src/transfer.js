// Export and import of the database file.
//
// IndexedDB can be wiped by the browser or by the user clearing site data, so
// being able to pull a real .db file out - and put one back - is the actual
// backup story, not a nicety.

/** Hand the browser a file to save. */
function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke late: some browsers have not finished reading the blob yet.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * Save both forms: the binary database (openable in the sqlite3 CLI) and a
 * readable .sql dump of the rows.
 */
export async function exportBoth(api) {
  const bytes = await api.exportDb();
  download(`castle-${stamp()}.db`, new Blob([bytes], { type: 'application/vnd.sqlite3' }));

  const sql = await api.exportSql();
  download(`castle-${stamp()}.sql`, new Blob([sql], { type: 'application/sql' }));

  return `exported ${(bytes.length / 1024).toFixed(0)} KB — castle-${stamp()}.db and .sql`;
}

/** Ask for a .db file and adopt it. Resolves to null if the user cancels. */
export function importFile(api) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.db,.sqlite,.sqlite3,application/vnd.sqlite3';
    input.style.display = 'none';

    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      input.remove();
      fn(value);
    };

    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) { finish(resolve, null); return; }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await api.importDb(bytes);
        finish(resolve, `imported ${file.name} (${(bytes.length / 1024).toFixed(0)} KB)`);
      } catch (err) {
        finish(reject, err);
      }
    };
    // Fires when the picker closes, including on cancel.
    input.oncancel = () => finish(resolve, null);

    document.body.appendChild(input);
    input.click();
  });
}
