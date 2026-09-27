CREATE TABLE control (id INTEGER PRIMARY KEY CHECK(id=1), stored INTEGER NOT NULL DEFAULT 0, storage_bytes INTEGER NOT NULL DEFAULT 0);
INSERT INTO control(id) VALUES(1);
CREATE TABLE ingest_days (day TEXT PRIMARY KEY, accepted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE events (
  id TEXT PRIMARY KEY, session TEXT NOT NULL, article TEXT, seq INTEGER NOT NULL,
  version TEXT NOT NULL, name TEXT NOT NULL, properties TEXT NOT NULL,
  variant TEXT NOT NULL, received_at INTEGER NOT NULL, day TEXT NOT NULL,
  UNIQUE(session,seq)
);
CREATE INDEX events_time ON events(received_at);
CREATE INDEX events_task ON events(session,article,seq);
CREATE TABLE daily_events(day TEXT NOT NULL,name TEXT NOT NULL,variant TEXT NOT NULL,n INTEGER NOT NULL,PRIMARY KEY(day,name,variant));
CREATE TABLE daily_tasks(day TEXT NOT NULL,method TEXT NOT NULL,started INTEGER NOT NULL,mature INTEGER NOT NULL,ready INTEGER NOT NULL,output INTEGER NOT NULL,handoff INTEGER NOT NULL,toolbar INTEGER NOT NULL,preview INTEGER NOT NULL,PRIMARY KEY(day,method));
CREATE TABLE health (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE incidents (key TEXT PRIMARY KEY,active INTEGER NOT NULL,failures INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,notified INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0);

-- Enforced inside the insert transaction, including concurrent batches. No paid fallback.
CREATE TRIGGER event_budget BEFORE INSERT ON events
WHEN NOT EXISTS(SELECT 1 FROM events WHERE id=NEW.id OR (session=NEW.session AND seq=NEW.seq))
BEGIN
  SELECT RAISE(ABORT,'monitor_budget') WHERE COALESCE((SELECT accepted FROM ingest_days WHERE day=NEW.day),0)>=5000
    OR (SELECT stored>=150000 OR storage_bytes>=350000000 FROM control WHERE id=1);
END;
CREATE TRIGGER event_count AFTER INSERT ON events
BEGIN
  UPDATE control SET stored=stored+1 WHERE id=1;
  INSERT INTO ingest_days(day,accepted) VALUES(NEW.day,1) ON CONFLICT(day) DO UPDATE SET accepted=accepted+1;
  INSERT INTO daily_events(day,name,variant,n) VALUES(NEW.day,NEW.name,NEW.variant,1)
    ON CONFLICT(day,name,variant) DO UPDATE SET n=n+1;
END;
CREATE TRIGGER event_deleted AFTER DELETE ON events
BEGIN
  UPDATE control SET stored=stored-1 WHERE id=1;
END;
