use std::fs;
use std::io::Cursor;
use std::path::PathBuf;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageFormat, ImageReader};
use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};
use crate::models::{CachedBodyImage, CachedImageContent};
use crate::storage::AppStorage;

const MAX_INPUT_BYTES: usize = 30 * 1024 * 1024;
const REENCODE_THRESHOLD_BYTES: usize = 2 * 1024 * 1024;
const LARGE_IMAGE_WARNING_BYTES: usize = 5 * 1024 * 1024;
const LARGE_GIF_WARNING_BYTES: usize = 8 * 1024 * 1024;
const MAX_DIMENSION: u32 = 2400;
const MAX_PIXELS: u64 = 40_000_000;

fn hash_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn detect_format(bytes: &[u8]) -> AppResult<(&'static str, &'static str)> {
    match image::guess_format(bytes)? {
        ImageFormat::Jpeg => Ok(("jpg", "image/jpeg")),
        ImageFormat::Png => Ok(("png", "image/png")),
        ImageFormat::Gif => Ok(("gif", "image/gif")),
        ImageFormat::WebP => Ok(("webp", "image/webp")),
        _ => Err(AppError::Message(
            "正文图片仅支持 JPG、PNG、GIF 或 WEBP。".into(),
        )),
    }
}

fn image_dimensions(bytes: &[u8]) -> AppResult<(u32, u32)> {
    let reader = ImageReader::new(Cursor::new(bytes)).with_guessed_format()?;
    let dimensions = reader.into_dimensions()?;
    if u64::from(dimensions.0) * u64::from(dimensions.1) > MAX_PIXELS {
        return Err(AppError::Message(
            "图片像素过大，请压缩到 4000 万像素以内后重试。".into(),
        ));
    }
    Ok(dimensions)
}

fn resized_dimensions(width: u32, height: u32) -> (u32, u32) {
    let longest = width.max(height);
    if longest <= MAX_DIMENSION {
        return (width, height);
    }
    let scale = f64::from(MAX_DIMENSION) / f64::from(longest);
    (
        (f64::from(width) * scale).round().max(1.0) as u32,
        (f64::from(height) * scale).round().max(1.0) as u32,
    )
}

fn encode_static_image(image: &DynamicImage, format: ImageFormat) -> AppResult<Vec<u8>> {
    let mut bytes = Vec::new();
    match format {
        ImageFormat::Jpeg => {
            JpegEncoder::new_with_quality(&mut bytes, 86).encode_image(image)?;
        }
        ImageFormat::Png | ImageFormat::WebP => {
            image.write_to(&mut Cursor::new(&mut bytes), format)?;
        }
        _ => unreachable!("static image encoder only accepts jpeg, png or webp"),
    }
    Ok(bytes)
}

fn optimize_static_image(
    bytes: Vec<u8>,
    format: ImageFormat,
    width: u32,
    height: u32,
) -> AppResult<(Vec<u8>, u32, u32, bool)> {
    let target = resized_dimensions(width, height);
    let needs_resize = target != (width, height);
    if !needs_resize && bytes.len() <= REENCODE_THRESHOLD_BYTES {
        return Ok((bytes, width, height, false));
    }

    let decoded = image::load_from_memory_with_format(&bytes, format)?;
    let output_image = if needs_resize {
        decoded.resize_exact(target.0, target.1, FilterType::Lanczos3)
    } else {
        decoded
    };
    let encoded = encode_static_image(&output_image, format)?;
    if needs_resize || encoded.len() < bytes.len() {
        let (output_width, output_height) = output_image.dimensions();
        Ok((encoded, output_width, output_height, true))
    } else {
        Ok((bytes, width, height, false))
    }
}

pub fn cache_body_image(
    storage: &AppStorage,
    bytes: Vec<u8>,
    _file_name: String,
) -> AppResult<CachedBodyImage> {
    if bytes.is_empty() || bytes.len() > MAX_INPUT_BYTES {
        return Err(AppError::Message("正文图片为空或超过 30 MiB 限制。".into()));
    }
    let original_bytes = bytes.len();
    let format = image::guess_format(&bytes)?;
    let (extension, mime_type) = detect_format(&bytes)?;
    let (original_width, original_height) = image_dimensions(&bytes)?;
    let (bytes, width, height, optimized) = if format == ImageFormat::Gif {
        (bytes, original_width, original_height, false)
    } else {
        optimize_static_image(bytes, format, original_width, original_height)?
    };
    let output_bytes = bytes.len();
    let warning = if format == ImageFormat::Gif && output_bytes > LARGE_GIF_WARNING_BYTES {
        Some("动图已原样保留，但体积超过 8 MiB，粘贴到公众号后请重点检查。".into())
    } else if output_bytes > LARGE_IMAGE_WARNING_BYTES {
        Some("图片优化后仍超过 5 MiB，粘贴到公众号后请检查。".into())
    } else {
        None
    };
    let sha256 = hash_hex(&bytes);
    let file_name = format!("{}.{}", sha256, extension);
    let path = storage.app_data_dir.join("images").join(&file_name);
    if !path.exists() {
        fs::write(&path, &bytes)?;
    }
    Ok(CachedBodyImage {
        path: path.to_string_lossy().into_owned(),
        sha256,
        file_name,
        mime_type: mime_type.into(),
        base64: STANDARD.encode(bytes),
        width,
        height,
        original_bytes,
        output_bytes,
        optimized,
        warning,
    })
}

pub fn read_cached_image(storage: &AppStorage, path: PathBuf) -> AppResult<CachedImageContent> {
    let safe_path = storage.assert_cached_path(&path)?;
    let bytes = fs::read(&safe_path)?;
    let (_, mime_type) = detect_format(&bytes)?;
    Ok(CachedImageContent {
        base64: STANDARD.encode(bytes),
        file_name: safe_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("image.jpg")
            .into(),
        mime_type: mime_type.into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, Rgba, RgbaImage};

    fn png_bytes() -> Vec<u8> {
        let image = RgbaImage::from_pixel(20, 20, Rgba([100, 40, 20, 255]));
        let mut bytes = Cursor::new(Vec::new());
        DynamicImage::ImageRgba8(image)
            .write_to(&mut bytes, ImageFormat::Png)
            .expect("encode png");
        bytes.into_inner()
    }

    #[test]
    fn cached_body_image_can_be_read_back() {
        let directory = tempfile::tempdir().expect("temp directory");
        let storage = AppStorage::new(directory.path().to_path_buf()).expect("storage");
        let source = png_bytes();
        let cached =
            cache_body_image(&storage, source.clone(), "body.png".into()).expect("cache image");
        let read = read_cached_image(&storage, PathBuf::from(&cached.path)).expect("read cached");
        assert_eq!(STANDARD.decode(read.base64).expect("base64"), source);
        assert_eq!(read.mime_type, "image/png");
        assert_eq!((cached.width, cached.height), (20, 20));
        assert!(!cached.optimized);
    }

    #[test]
    fn oversized_static_image_is_resized_before_caching() {
        let directory = tempfile::tempdir().expect("temp directory");
        let storage = AppStorage::new(directory.path().to_path_buf()).expect("storage");
        let image = RgbaImage::from_pixel(3000, 100, Rgba([100, 40, 20, 255]));
        let mut source = Cursor::new(Vec::new());
        DynamicImage::ImageRgba8(image)
            .write_to(&mut source, ImageFormat::Png)
            .expect("encode png");
        let cached = cache_body_image(&storage, source.into_inner(), "wide.png".into())
            .expect("cache image");

        assert_eq!((cached.width, cached.height), (2400, 80));
        assert!(cached.optimized);
        assert_eq!(cached.output_bytes, STANDARD.decode(&cached.base64).expect("base64").len());
    }

    #[test]
    fn gif_is_preserved_byte_for_byte_to_keep_animation() {
        let directory = tempfile::tempdir().expect("temp directory");
        let storage = AppStorage::new(directory.path().to_path_buf()).expect("storage");
        let source = STANDARD
            .decode("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==")
            .expect("valid gif fixture");
        let cached = cache_body_image(&storage, source.clone(), "motion.gif".into())
            .expect("cache gif");

        assert_eq!(cached.mime_type, "image/gif");
        assert_eq!((cached.width, cached.height), (1, 1));
        assert!(!cached.optimized);
        assert_eq!(STANDARD.decode(cached.base64).expect("base64"), source);
    }
}
