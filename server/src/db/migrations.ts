import type Database from 'better-sqlite3';

interface Migration {
  version: number;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS companies (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT NOT NULL UNIQUE,
          industry   TEXT,
          city       TEXT,
          website    TEXT,
          note       TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS applications (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          position_title TEXT NOT NULL,
          job_type       TEXT NOT NULL DEFAULT 'school',
          channel        TEXT,
          jd_url         TEXT,
          status         TEXT NOT NULL DEFAULT 'WISHLIST',
          priority       TEXT NOT NULL DEFAULT 'MEDIUM',
          deadline       TEXT,
          applied_at     TEXT,
          note           TEXT,
          created_at     TEXT NOT NULL,
          updated_at     TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS timeline_events (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
          event_type     TEXT NOT NULL,
          from_status    TEXT,
          to_status      TEXT,
          title          TEXT NOT NULL,
          description    TEXT,
          occurred_at    TEXT NOT NULL,
          created_at     TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reminders (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
          type           TEXT NOT NULL,
          title          TEXT NOT NULL,
          scheduled_at   TEXT NOT NULL,
          done           INTEGER NOT NULL DEFAULT 0,
          done_at        TEXT,
          created_at     TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS email_items (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id     TEXT NOT NULL UNIQUE,
          subject        TEXT NOT NULL,
          sender         TEXT,
          received_at    TEXT NOT NULL,
          snippet        TEXT,
          extracted      TEXT,
          status         TEXT NOT NULL DEFAULT 'pending',
          application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
          created_at     TEXT NOT NULL,
          applied_at     TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_app_company  ON applications(company_id);
        CREATE INDEX IF NOT EXISTS idx_app_status   ON applications(status);
        CREATE INDEX IF NOT EXISTS idx_app_deadline ON applications(deadline);
        CREATE INDEX IF NOT EXISTS idx_app_updated  ON applications(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_tl_app       ON timeline_events(application_id, occurred_at DESC);
        CREATE INDEX IF NOT EXISTS idx_tl_occurred  ON timeline_events(occurred_at);
        CREATE INDEX IF NOT EXISTS idx_rem_scheduled ON reminders(scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_rem_app      ON reminders(application_id);
        CREATE INDEX IF NOT EXISTS idx_email_received ON email_items(received_at DESC);
        CREATE INDEX IF NOT EXISTS idx_email_status ON email_items(status);
      `);
    },
  },
  {
    version: 2,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS crawl_jobs (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          source_id     TEXT NOT NULL,
          keyword       TEXT NOT NULL,
          recruit_type  TEXT NOT NULL DEFAULT 'school',
          max_pages     INTEGER NOT NULL DEFAULT 3,
          frequency     TEXT NOT NULL DEFAULT 'daily',
          enabled       INTEGER NOT NULL DEFAULT 1,
          last_run_at   TEXT,
          created_at    TEXT NOT NULL,
          updated_at    TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS crawl_runs (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id      INTEGER REFERENCES crawl_jobs(id) ON DELETE CASCADE,
          source_id   TEXT NOT NULL,
          keyword     TEXT NOT NULL,
          status      TEXT NOT NULL DEFAULT 'running',
          fetched     INTEGER NOT NULL DEFAULT 0,
          imported    INTEGER NOT NULL DEFAULT 0,
          skipped     INTEGER NOT NULL DEFAULT 0,
          error       TEXT,
          started_at  TEXT NOT NULL,
          finished_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_crawl_jobs_enabled ON crawl_jobs(enabled);
        CREATE INDEX IF NOT EXISTS idx_crawl_runs_job ON crawl_runs(job_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_crawl_runs_started ON crawl_runs(started_at DESC);
      `);
    },
  },
  {
    version: 3,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          kind        TEXT NOT NULL,
          target      TEXT NOT NULL,
          detail      TEXT,
          status      TEXT NOT NULL DEFAULT 'success',
          result      TEXT,
          error       TEXT,
          duration_ms INTEGER,
          started_at  TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_audit_started ON audit_logs(started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_kind ON audit_logs(kind);
      `);
    },
  },
  {
    version: 4,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS resumes (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          name         TEXT NOT NULL,
          target_role  TEXT,
          basic        TEXT,
          education    TEXT,
          experience   TEXT,
          projects     TEXT,
          skills       TEXT,
          content      TEXT,
          created_at   TEXT NOT NULL,
          updated_at   TEXT NOT NULL
        );

        ALTER TABLE applications ADD COLUMN resume_id INTEGER REFERENCES resumes(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_resumes_updated ON resumes(updated_at DESC);
      `);
    },
  },
  {
    version: 5,
    up: (db) => {
      db.exec(`
        ALTER TABLE applications ADD COLUMN jd_description TEXT;
      `);
    },
  },
  {
    version: 6,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS job_search_profiles (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          resume_id     INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
          name          TEXT NOT NULL,
          keywords      TEXT NOT NULL DEFAULT '[]',
          cities        TEXT NOT NULL DEFAULT '[]',
          source_ids    TEXT NOT NULL DEFAULT '["nowcoder"]',
          recruit_type  TEXT NOT NULL DEFAULT 'school' CHECK (recruit_type IN ('school', 'intern')),
          min_score     INTEGER NOT NULL DEFAULT 60 CHECK (min_score BETWEEN 0 AND 100),
          max_pages     INTEGER NOT NULL DEFAULT 3 CHECK (max_pages BETWEEN 1 AND 10),
          frequency     TEXT NOT NULL DEFAULT 'manual' CHECK (frequency IN ('manual', 'daily', 'weekly')),
          enabled       INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
          auto_import   INTEGER NOT NULL DEFAULT 0 CHECK (auto_import IN (0, 1)),
          last_run_at   TEXT,
          created_at    TEXT NOT NULL,
          updated_at    TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS recommendation_runs (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id   INTEGER NOT NULL REFERENCES job_search_profiles(id) ON DELETE CASCADE,
          status       TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
          fetched      INTEGER NOT NULL DEFAULT 0,
          matched      INTEGER NOT NULL DEFAULT 0,
          saved        INTEGER NOT NULL DEFAULT 0,
          imported     INTEGER NOT NULL DEFAULT 0,
          error        TEXT,
          started_at   TEXT NOT NULL,
          finished_at  TEXT
        );

        CREATE TABLE IF NOT EXISTS job_recommendations (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id        INTEGER NOT NULL REFERENCES job_search_profiles(id) ON DELETE CASCADE,
          source_id         TEXT NOT NULL,
          source_key        TEXT NOT NULL,
          company_name      TEXT NOT NULL,
          company_industry  TEXT,
          company_city      TEXT,
          company_website   TEXT,
          position_title    TEXT NOT NULL,
          job_type          TEXT NOT NULL DEFAULT 'school' CHECK (job_type IN ('school', 'intern')),
          channel           TEXT,
          jd_url            TEXT,
          deadline          TEXT,
          salary            TEXT,
          city              TEXT,
          jd_description    TEXT,
          score             INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
          summary           TEXT NOT NULL,
          reasons           TEXT NOT NULL DEFAULT '[]',
          status            TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'saved', 'dismissed', 'imported')),
          application_id    INTEGER REFERENCES applications(id) ON DELETE SET NULL,
          first_seen_at     TEXT NOT NULL,
          last_seen_at      TEXT NOT NULL,
          created_at        TEXT NOT NULL,
          updated_at        TEXT NOT NULL,
          UNIQUE (profile_id, source_id, source_key)
        );

        CREATE INDEX IF NOT EXISTS idx_search_profiles_resume ON job_search_profiles(resume_id);
        CREATE INDEX IF NOT EXISTS idx_search_profiles_due ON job_search_profiles(enabled, frequency, last_run_at);
        CREATE INDEX IF NOT EXISTS idx_recommendation_runs_profile ON recommendation_runs(profile_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_recommendation_runs_started ON recommendation_runs(started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_recommendations_profile_score ON job_recommendations(profile_id, score DESC);
        CREATE INDEX IF NOT EXISTS idx_recommendations_profile_status ON job_recommendations(profile_id, status, last_seen_at DESC);
        CREATE INDEX IF NOT EXISTS idx_recommendations_application ON job_recommendations(application_id);
      `);
    },
  },
  {
    version: 7,
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS email_ignored_receipts (
        message_id TEXT PRIMARY KEY,
        analyzed_at TEXT NOT NULL
      );`);
    },
  },
  {
    version: 8,
    up(db) {
      db.exec(`
        CREATE TABLE recruitment_schedules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('interview','written_test','assessment')),
          status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','awaiting_time')),
          data TEXT NOT NULL,
          last_received_at TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_schedule_app ON recruitment_schedules(application_id);
        CREATE TABLE schedule_sources (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          schedule_id INTEGER NOT NULL REFERENCES recruitment_schedules(id) ON DELETE CASCADE,
          email_id INTEGER REFERENCES email_items(id) ON DELETE SET NULL,
          action TEXT NOT NULL,
          snapshot TEXT NOT NULL,
          received_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(email_id)
        );
        ALTER TABLE reminders ADD COLUMN schedule_id INTEGER REFERENCES recruitment_schedules(id) ON DELETE SET NULL;
        CREATE INDEX idx_rem_schedule ON reminders(schedule_id);
      `);
      // Only dated confirmed events can be adopted. Unknown associations stay untouched.
      const rows = db.prepare("SELECT id,application_id,extracted,received_at,created_at FROM email_items WHERE status='confirmed' AND application_id IS NOT NULL ORDER BY received_at,id").all() as {id:number;application_id:number;extracted:string|null;received_at:string;created_at:string}[];
      const known = new Map<string, number>();
      for (const row of rows) {
        let e;
        try { e = JSON.parse(row.extracted ?? '{}'); } catch { continue; }
        if (!e || typeof e !== 'object') continue;
        {
          if (!['interview','written_test','assessment'].includes(e.eventType) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(e.eventTime ?? '')) continue;
          const key = JSON.stringify([row.application_id,e.eventType,e.eventTime]);
          const data = JSON.stringify({eventTime:e.eventTime,eventTimeEnd:e.eventTimeEnd ?? null,preparationTasks:e.preparationTasks ?? [],timeEvidence:e.timeEvidence ?? null,mode:'unknown'});
          let id = known.get(key);
          if (!id) {
            id = Number(db.prepare('INSERT INTO recruitment_schedules(application_id,kind,data,last_received_at,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(row.application_id,e.eventType,data,row.received_at,row.created_at,row.created_at).lastInsertRowid);
            known.set(key,id);
          } else {
            db.prepare('UPDATE recruitment_schedules SET data=?,last_received_at=?,updated_at=? WHERE id=?').run(data,row.received_at,row.created_at,id);
          }
          db.prepare("INSERT INTO schedule_sources(schedule_id,email_id,action,snapshot,received_at,created_at) VALUES (?,?,'legacy',?,?,?)").run(id,row.id,data,row.received_at,row.created_at);
          // Adopt only the exact generated email reminder, never manually authored reminders.
          db.prepare("UPDATE reminders SET schedule_id=? WHERE application_id=? AND scheduled_at=? AND title LIKE '邮件：%' AND schedule_id IS NULL").run(id,row.application_id,e.eventTime);
        }
      }
    },
  },
];

/** 按 PRAGMA user_version 顺序执行迁移 */
export function runMigrations(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (const m of migrations) {
    if (m.version > current) {
      db.transaction(() => {
        m.up(db);
        db.pragma(`user_version = ${m.version}`);
      })();
    }
  }
}
