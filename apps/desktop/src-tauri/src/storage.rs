use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::AppResult;
use crate::models::{LocalArticle, UserSettings};

#[derive(Clone)]
pub struct AppStorage {
    pub app_data_dir: PathBuf,
    database_path: PathBuf,
}

impl AppStorage {
    pub fn new(app_data_dir: PathBuf) -> AppResult<Self> {
        fs::create_dir_all(&app_data_dir)?;
        let storage = Self {
            database_path: app_data_dir.join("wedraft.sqlite"),
            app_data_dir,
        };
        storage.initialize()?;
        Ok(storage)
    }

    fn connect(&self) -> AppResult<Connection> {
        let connection = Connection::open(&self.database_path)?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        Ok(connection)
    }

    pub fn initialize(&self) -> AppResult<()> {
        fs::create_dir_all(self.app_data_dir.join("images"))?;
        let connection = self.connect()?;
        connection.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS articles (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              author TEXT NOT NULL,
              digest TEXT NOT NULL,
              markdown TEXT NOT NULL,
              template_id TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_articles_updated
              ON articles(updated_at DESC);

            CREATE TABLE IF NOT EXISTS settings (
              singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
              json TEXT NOT NULL
            );
            "#,
        )?;
        Self::remove_legacy_cover_path(&connection)?;
        Ok(())
    }

    fn remove_legacy_cover_path(connection: &Connection) -> AppResult<()> {
        let has_legacy_column = {
            let mut statement = connection.prepare("PRAGMA table_info(articles)")?;
            let columns = statement.query_map([], |row| row.get::<_, String>(1))?;
            columns
                .collect::<Result<Vec<_>, _>>()?
                .iter()
                .any(|column| column == "cover_path")
        };
        if has_legacy_column {
            connection.execute_batch("ALTER TABLE articles DROP COLUMN cover_path;")?;
        }
        Ok(())
    }

    pub fn save_article(&self, article: &LocalArticle) -> AppResult<()> {
        self.connect()?.execute(
            r#"
            INSERT INTO articles (
              id, title, author, digest, markdown, template_id,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              author = excluded.author,
              digest = excluded.digest,
              markdown = excluded.markdown,
              template_id = excluded.template_id,
              updated_at = excluded.updated_at
            "#,
            params![
                article.id,
                article.title,
                article.author,
                article.digest,
                article.markdown,
                article.template_id,
                article.created_at,
                article.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn list_articles(&self) -> AppResult<Vec<LocalArticle>> {
        let connection = self.connect()?;
        let mut statement = connection.prepare(
            r#"
            SELECT id, title, author, digest, markdown, template_id,
                   created_at, updated_at
            FROM articles
            ORDER BY updated_at DESC
            LIMIT 100
            "#,
        )?;
        let rows = statement.query_map([], |row| {
            Ok(LocalArticle {
                id: row.get(0)?,
                title: row.get(1)?,
                author: row.get(2)?,
                digest: row.get(3)?,
                markdown: row.get(4)?,
                template_id: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn delete_article(&self, id: &str) -> AppResult<()> {
        self.connect()?
            .execute("DELETE FROM articles WHERE id = ?", [id])?;
        Ok(())
    }

    pub fn delete_all_articles(&self) -> AppResult<()> {
        self.connect()?.execute("DELETE FROM articles", [])?;
        Ok(())
    }

    pub fn save_settings(&self, settings: &UserSettings) -> AppResult<()> {
        self.connect()?.execute(
            r#"
            INSERT INTO settings (singleton, json) VALUES (1, ?)
            ON CONFLICT(singleton) DO UPDATE SET json = excluded.json
            "#,
            [serde_json::to_string(settings)?],
        )?;
        Ok(())
    }

    pub fn load_settings(&self) -> AppResult<Option<UserSettings>> {
        let json: Option<String> = self
            .connect()?
            .query_row("SELECT json FROM settings WHERE singleton = 1", [], |row| {
                row.get(0)
            })
            .optional()?;
        json.map(|value| serde_json::from_str(&value).map_err(Into::into))
            .transpose()
    }

    pub fn assert_cached_path(&self, path: &Path) -> AppResult<PathBuf> {
        let canonical = path.canonicalize()?;
        let images = self.app_data_dir.join("images").canonicalize()?;
        if !canonical.starts_with(images) {
            return Err(crate::error::AppError::Message(
                "拒绝读取 WeDraft 图片目录以外的文件。".into(),
            ));
        }
        Ok(canonical)
    }
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    fn article(id: &str) -> LocalArticle {
        LocalArticle {
            id: id.into(),
            title: format!("文章 {id}"),
            author: String::new(),
            digest: String::new(),
            markdown: format!("文章 {id}\n\n正文"),
            template_id: "default-business".into(),
            created_at: "2026-07-29T00:00:00Z".into(),
            updated_at: "2026-07-29T00:00:00Z".into(),
        }
    }

    #[test]
    fn articles_can_be_deleted_individually_and_all_at_once() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be valid")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("wedraft-storage-test-{nonce}"));
        let storage = AppStorage::new(directory.clone()).expect("storage should initialize");

        storage.save_article(&article("one")).expect("save one");
        storage.save_article(&article("two")).expect("save two");
        storage.delete_article("one").expect("delete one");
        let remaining = storage.list_articles().expect("list after delete");
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, "two");

        storage.delete_all_articles().expect("delete all");
        assert!(storage
            .list_articles()
            .expect("list after clear")
            .is_empty());

        fs::remove_dir_all(directory).expect("temporary storage should be removed");
    }

    #[test]
    fn legacy_cover_column_is_removed_without_losing_articles() {
        let directory = tempfile::tempdir().expect("temporary storage");
        let database_path = directory.path().join("wedraft.sqlite");
        let connection = Connection::open(&database_path).expect("legacy database");
        connection
            .execute_batch(
                r#"
                CREATE TABLE articles (
                  id TEXT PRIMARY KEY,
                  title TEXT NOT NULL,
                  author TEXT NOT NULL,
                  digest TEXT NOT NULL,
                  markdown TEXT NOT NULL,
                  cover_path TEXT,
                  template_id TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                INSERT INTO articles VALUES (
                  'legacy', '旧文章', '', '', '旧文章\n\n正文', '/tmp/cover.jpg',
                  'next-edition', '2026-07-29T00:00:00Z', '2026-07-29T00:00:00Z'
                );
                "#,
            )
            .expect("legacy schema");
        drop(connection);

        let storage = AppStorage::new(directory.path().to_path_buf()).expect("migrated storage");
        let articles = storage.list_articles().expect("articles after migration");
        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].id, "legacy");

        let connection = storage.connect().expect("database after migration");
        let mut statement = connection
            .prepare("PRAGMA table_info(articles)")
            .expect("table information");
        let columns = statement
            .query_map([], |row| row.get::<_, String>(1))
            .expect("columns")
            .collect::<Result<Vec<_>, _>>()
            .expect("column names");
        assert!(!columns.iter().any(|column| column == "cover_path"));
    }
}
