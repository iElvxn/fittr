# Sync design

Local-first. Every read and write in the app targets SQLite. A sync engine reconciles with Postgres in the background.

### Local additions
Each synced table has two extra local-only columns: `dirty boolean` and `synced_at timestamptz null`. A `sync_state` table stores a per-table pull cursor (`last_pulled_updated_at`).

### Push
1. Select rows where `dirty = true`, in dependency order: profiles, wardrobe_items, fits, fit_items, fit_wears, planned_fits.
2. Upsert in batches by primary key. Postgres keeps the incoming row only if its `updated_at` is newer (last-write-wins).
3. On success, clear `dirty` and set `synced_at`.
4. Images: for each item or Fit with a local file not yet uploaded, upload to Storage, then mark the row uploaded. Uploads retry with backoff and never block the UI.

### Pull
1. Per table, select rows where `updated_at > cursor` for this user.
2. Apply with last-write-wins against the local row. Soft deletes propagate as updates.
3. Advance the cursor to the max `updated_at` received.
4. Download images lazily on first display and cache them on disk.

### Triggers
- App launch and foreground.
- After any local write, debounced by a few seconds.
- Pull-to-refresh on the Wardrobe and My Fits screens.
- Network reconnect.

### Conflict policy
Single user, rare multi-device use, so last-write-wins on `updated_at` is acceptable and documented. Clock skew is tolerated. This is a deliberate simplification recorded in the decision log.

### Failure handling
Sync failures are logged to Sentry and surfaced as a small non-blocking indicator. The app never loses local data because of a failed sync.
