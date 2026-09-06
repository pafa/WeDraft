mod error;
mod export;
mod image_processing;
mod models;
mod storage;

use std::path::PathBuf;

use tauri::{Manager, State};

use error::{AppError, AppResult};
use export::{export_all_articles as save_all_articles, export_article as save_article_file};
use image_processing::{
    cache_body_image as process_body_image, read_cached_image as load_cached_image,
};
use models::{CachedBodyImage, CachedImageContent, LocalArticle, UserSettings};
use storage::AppStorage;

#[tauri::command]
fn initialize_storage(storage: State<'_, AppStorage>) -> AppResult<()> {
    storage.initialize()
}

#[tauri::command]
fn save_article(storage: State<'_, AppStorage>, article: LocalArticle) -> AppResult<()> {
    storage.save_article(&article)
}

#[tauri::command]
fn list_articles(storage: State<'_, AppStorage>) -> AppResult<Vec<LocalArticle>> {
    storage.list_articles()
}

#[tauri::command]
fn delete_article(storage: State<'_, AppStorage>, id: String) -> AppResult<()> {
    storage.delete_article(&id)
}

#[tauri::command]
fn delete_all_articles(storage: State<'_, AppStorage>) -> AppResult<()> {
    storage.delete_all_articles()
}

#[tauri::command]
fn export_article(article: LocalArticle) -> AppResult<Option<String>> {
    save_article_file(&article)
}

#[tauri::command]
fn export_all_articles(articles: Vec<LocalArticle>) -> AppResult<Option<String>> {
    save_all_articles(&articles)
}

#[tauri::command]
fn save_settings(storage: State<'_, AppStorage>, settings: UserSettings) -> AppResult<()> {
    storage.save_settings(&settings)
}

#[tauri::command]
fn load_settings(storage: State<'_, AppStorage>) -> AppResult<Option<UserSettings>> {
    storage.load_settings()
}

#[tauri::command]
fn cache_body_image(
    storage: State<'_, AppStorage>,
    bytes: Vec<u8>,
    file_name: String,
) -> AppResult<CachedBodyImage> {
    process_body_image(&storage, bytes, file_name)
}

#[tauri::command]
fn read_cached_image(
    storage: State<'_, AppStorage>,
    path: PathBuf,
) -> AppResult<CachedImageContent> {
    load_cached_image(&storage, path)
}

#[tauri::command]
fn copy_rich_text(html: String, plain_text: String) -> AppResult<()> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|error| AppError::Message(format!("无法访问系统剪贴板：{error}")))?;
    clipboard
        .set_html(html, Some(plain_text))
        .map_err(|error| AppError::Message(format!("复制富文本失败：{error}")))
}

#[tauri::command]
fn copy_plain_text(text: String) -> AppResult<()> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|error| AppError::Message(format!("无法访问系统剪贴板：{error}")))?;
    clipboard
        .set_text(text)
        .map_err(|error| AppError::Message(format!("复制文本失败：{error}")))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let storage = AppStorage::new(app_data_dir)
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            app.asset_protocol_scope()
                .allow_directory(storage.app_data_dir.join("images"), true)?;
            app.manage(storage);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            initialize_storage,
            save_article,
            list_articles,
            delete_article,
            delete_all_articles,
            export_article,
            export_all_articles,
            save_settings,
            load_settings,
            cache_body_image,
            read_cached_image,
            copy_rich_text,
            copy_plain_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running WeDraft");
}
