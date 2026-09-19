use std::{collections::HashSet, fs::File, io::Write, path::Path};

use icu_normalizer::DecomposingNormalizerBorrowed;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

use crate::{error::AppResult, models::LocalArticle};

fn safe_file_stem(title: &str, fallback: &str) -> String {
    let cleaned = title
        .trim()
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
                )
            {
                '_'
            } else {
                character
            }
        })
        .take(80)
        .collect::<String>()
        .trim_matches([' ', '.'])
        .to_string();
    if cleaned.is_empty() {
        fallback.to_string()
    } else {
        cleaned
    }
}

fn markdown_file_name(article: &LocalArticle) -> String {
    format!("{}.md", safe_file_stem(&article.title, "未命名文章"))
}

fn unique_markdown_file_name(
    article: &LocalArticle,
    used_names: &mut HashSet<String>,
) -> String {
    let stem = safe_file_stem(&article.title, "未命名文章");
    let mut occurrence = 1;
    loop {
        let name = if occurrence == 1 {
            format!("{stem}.md")
        } else {
            format!("{stem} ({occurrence}).md")
        };
        // Keep every entry distinct when extracted on case-insensitive macOS volumes.
        let key = DecomposingNormalizerBorrowed::new_nfd()
            .normalize(&name.to_lowercase())
            .into_owned();
        if used_names.insert(key) {
            return name;
        }
        occurrence += 1;
    }
}

fn write_article(path: &Path, article: &LocalArticle) -> AppResult<()> {
    std::fs::write(path, article.markdown.as_bytes())?;
    Ok(())
}

fn write_articles_zip(path: &Path, articles: &[LocalArticle]) -> AppResult<()> {
    let file = File::create(path)?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);
    let mut used_names = HashSet::new();

    for article in articles {
        archive.start_file(
            unique_markdown_file_name(article, &mut used_names),
            options,
        )?;
        archive.write_all(article.markdown.as_bytes())?;
    }
    archive.finish()?;
    Ok(())
}

pub fn export_article(article: &LocalArticle) -> AppResult<Option<String>> {
    let Some(path) = rfd::FileDialog::new()
        .set_title("导出 Markdown 文章")
        .set_file_name(markdown_file_name(article))
        .add_filter("Markdown", &["md"])
        .save_file()
    else {
        return Ok(None);
    };
    write_article(&path, article)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

pub fn export_all_articles(articles: &[LocalArticle]) -> AppResult<Option<String>> {
    let Some(path) = rfd::FileDialog::new()
        .set_title("导出全部文章")
        .set_file_name("WeDraft文章导出.zip")
        .add_filter("ZIP 压缩包", &["zip"])
        .save_file()
    else {
        return Ok(None);
    };
    write_articles_zip(&path, articles)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn article(title: &str, markdown: &str) -> LocalArticle {
        LocalArticle {
            id: title.into(),
            title: title.into(),
            author: String::new(),
            digest: String::new(),
            markdown: markdown.into(),
            template_id: "next-edition".into(),
            created_at: "2026-08-01T00:00:00Z".into(),
            updated_at: "2026-08-01T00:00:00Z".into(),
        }
    }

    #[test]
    fn cleans_invalid_file_name_characters() {
        assert_eq!(
            markdown_file_name(&article("  标题/测试:版本?  ", "正文")),
            "标题_测试_版本_.md"
        );
    }

    #[test]
    fn zip_keeps_every_article_when_titles_repeat() {
        let directory = tempfile::tempdir().expect("temp dir");
        let path = directory.path().join("articles.zip");
        write_articles_zip(
            &path,
            &[article("同名文章", "第一篇"), article("同名文章", "第二篇")],
        )
        .expect("write zip");

        let file = File::open(path).expect("open zip");
        let mut archive = zip::ZipArchive::new(file).expect("read zip");
        assert_eq!(archive.len(), 2);
        assert_eq!(archive.by_index(0).expect("first").name(), "同名文章.md");
        assert_eq!(
            archive.by_index(1).expect("second").name(),
            "同名文章 (2).md"
        );
    }

    #[test]
    fn zip_names_do_not_collide_with_existing_numbered_titles() {
        let directory = tempfile::tempdir().expect("temp dir");
        let path = directory.path().join("articles.zip");
        let articles = [
            article("A", "one"),
            article("A", "two"),
            article("A (2)", "three"),
            article("a", "four"),
            article("Café", "five"),
            article("Cafe\u{301}", "six"),
        ];
        write_articles_zip(&path, &articles).expect("write zip");
        let mut archive = zip::ZipArchive::new(File::open(path).expect("open zip"))
            .expect("read zip");
        assert_eq!(archive.len(), articles.len());
        let mut names = std::collections::HashSet::new();
        for (index, expected) in articles.iter().enumerate() {
            let mut entry = archive.by_index(index).expect("entry");
            let key = DecomposingNormalizerBorrowed::new_nfd()
                .normalize(&entry.name().to_lowercase())
                .into_owned();
            assert!(names.insert(key));
            let mut markdown = String::new();
            std::io::Read::read_to_string(&mut entry, &mut markdown)
                .expect("read source");
            assert_eq!(markdown, expected.markdown);
        }
    }
}
