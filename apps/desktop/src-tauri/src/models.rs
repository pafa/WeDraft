use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalArticle {
    pub id: String,
    pub title: String,
    pub author: String,
    pub digest: String,
    pub markdown: String,
    pub template_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserSettings {
    #[serde(default)]
    pub default_author: String,
    #[serde(default = "default_template_id")]
    pub default_template_id: String,
    #[serde(default = "default_autosave_interval")]
    pub autosave_interval_seconds: u32,
    #[serde(default)]
    pub template_default_version: Option<u32>,
}

fn default_template_id() -> String {
    "next-edition".into()
}

fn default_autosave_interval() -> u32 {
    15
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedBodyImage {
    pub path: String,
    pub sha256: String,
    pub file_name: String,
    pub mime_type: String,
    pub base64: String,
    pub width: u32,
    pub height: u32,
    pub original_bytes: usize,
    pub output_bytes: usize,
    pub optimized: bool,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedImageContent {
    pub base64: String,
    pub file_name: String,
    pub mime_type: String,
}
