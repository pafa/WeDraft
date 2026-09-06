use std::{collections::HashMap, fs::File, io::Write, path::Path};

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
    occurrences: &mut HashMap<String, usize>,
) -> String {
    let stem = safe_file_stem(&article.title, "未命名文章");
    let occurrence = occurrences.entry(stem.clone()).or_insert(0);
    *occurrence += 1;
    if *occurrence == 1 {
        format!("{stem}.md")
    } else {
        format!("{stem} ({occurrence}).md")
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
    let mut occurrences = HashMap::new();

    for article in articles {
        archive.start_file(
            unique_markdown_file_name(article, &mut occurrences),
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
}
