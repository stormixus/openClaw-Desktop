use std::fmt;
use serde::{Serialize, Serializer};

#[derive(Debug)]
pub enum DocError {
    IoError(std::io::Error),
    ParseError(String),
    PatchError(String),
    SessionNotFound(String),
    UnsupportedFormat(String),
    ValidationError(String),
}

impl fmt::Display for DocError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DocError::IoError(e) => write!(f, "IO Error: {}", e),
            DocError::ParseError(msg) => write!(f, "Parse Error: {}", msg),
            DocError::PatchError(msg) => write!(f, "Patch Error: {}", msg),
            DocError::SessionNotFound(id) => write!(f, "Session not found: {}", id),
            DocError::UnsupportedFormat(fmt) => write!(f, "Unsupported format: {}", fmt),
            DocError::ValidationError(msg) => write!(f, "Validation Error: {}", msg),
        }
    }
}

impl std::error::Error for DocError {}

impl From<std::io::Error> for DocError {
    fn from(err: std::io::Error) -> Self {
        DocError::IoError(err)
    }
}

impl From<serde_json::Error> for DocError {
    fn from(err: serde_json::Error) -> Self {
        DocError::ParseError(err.to_string())
    }
}

// Serialize for Tauri IPC
impl Serialize for DocError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
