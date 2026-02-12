use std::path::Path;
use crate::document::types::*;
use crate::document::error::DocError;

pub mod excel;
pub mod pdf;
pub mod docx;
pub mod hwp;
pub mod pptx;
pub mod xlsx_visuals;

pub trait DocumentAdapter: Send + Sync {
    fn read(path: &Path) -> Result<DocState, DocError>;
    fn save(state: &DocState, path: &Path) -> Result<(), DocError>;
}
