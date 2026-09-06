use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("本地数据库操作失败。")]
    Database(#[from] rusqlite::Error),
    #[error("本地文件操作失败。")]
    Io(#[from] std::io::Error),
    #[error("图片格式无效或无法解码。")]
    Image(#[from] image::ImageError),
    #[error("本地数据格式无效。")]
    Json(#[from] serde_json::Error),
    #[error("文章压缩包生成失败。")]
    Zip(#[from] zip::result::ZipError),
    #[error("{0}")]
    Message(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
