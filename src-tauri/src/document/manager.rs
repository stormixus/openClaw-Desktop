use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};
use crate::document::types::*;
use crate::document::error::DocError;
use crate::document::patch;

pub struct DocumentSession {
    pub state: DocState,
    pub undo_stack: Vec<DocState>,
    pub redo_stack: Vec<DocState>,
    pub staged_state: Option<DocState>,
    pub staged_patch: Option<JsonPatch>,
}

pub struct SessionManager {
    pub sessions: Mutex<HashMap<String, DocumentSession>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    fn lock_sessions(&self) -> Result<MutexGuard<'_, HashMap<String, DocumentSession>>, DocError> {
        self.sessions
            .lock()
            .map_err(|e| DocError::LockError(e.to_string()))
    }

    pub fn create_session(&self, state: DocState) -> Result<String, DocError> {
        let id = state.id.clone();
        let session = DocumentSession {
            state,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            staged_state: None,
            staged_patch: None,
        };
        self.lock_sessions()?.insert(id.clone(), session);
        Ok(id)
    }

    pub fn get_session<F, R>(&self, id: &str, f: F) -> Result<R, DocError>
    where
        F: FnOnce(&DocumentSession) -> R,
    {
        let sessions = self.lock_sessions()?;
        match sessions.get(id) {
            Some(session) => Ok(f(session)),
            None => Err(DocError::SessionNotFound(id.to_string())),
        }
    }

    pub fn get_session_mut<F, R>(&self, id: &str, f: F) -> Result<R, DocError>
    where
        F: FnOnce(&mut DocumentSession) -> R,
    {
        let mut sessions = self.lock_sessions()?;
        match sessions.get_mut(id) {
            Some(session) => Ok(f(session)),
            None => Err(DocError::SessionNotFound(id.to_string())),
        }
    }

    pub fn close_session(&self, id: &str) -> Result<(), DocError> {
        let mut sessions = self.lock_sessions()?;
        if sessions.remove(id).is_some() {
            Ok(())
        } else {
            Err(DocError::SessionNotFound(id.to_string()))
        }
    }

    pub fn list_sessions(&self) -> Result<Vec<SessionSummary>, DocError> {
        let sessions = self.lock_sessions()?;
        Ok(sessions.values().map(|s| SessionSummary {
            id: s.state.id.clone(),
            file_name: s.state.file_name.clone(),
            doc_type: s.state.doc_type.clone(),
            modified: s.state.modified,
        }).collect())
    }

    pub fn stage_patch(&self, id: &str, json_patch: JsonPatch) -> Result<PatchPreview, DocError> {
        let mut sessions = self.lock_sessions()?;
        let session = sessions.get_mut(id).ok_or_else(|| DocError::SessionNotFound(id.to_string()))?;

        let preview = patch::apply_patch(&session.state, json_patch.clone())?;

        // Rebuild staged state by applying the patch
        let mut staged = session.state.clone();
        for op in &json_patch.operations {
            patch::apply_single_op(&mut staged, op)?;
        }

        session.staged_state = Some(staged);
        session.staged_patch = Some(json_patch);

        Ok(preview)
    }

    pub fn commit_staged(&self, id: &str) -> Result<(), DocError> {
        let mut sessions = self.lock_sessions()?;
        let session = sessions.get_mut(id).ok_or_else(|| DocError::SessionNotFound(id.to_string()))?;

        if let Some(staged) = session.staged_state.take() {
            session.undo_stack.push(session.state.clone());

            const MAX_UNDO_DEPTH: usize = 20;
            if session.undo_stack.len() > MAX_UNDO_DEPTH {
                session.undo_stack.remove(0);
            }

            session.redo_stack.clear();
            session.state = staged;
            session.state.modified = true;
            session.staged_patch = None;
            Ok(())
        } else {
            Ok(())
        }
    }

    pub fn discard_staged(&self, id: &str) -> Result<(), DocError> {
        let mut sessions = self.lock_sessions()?;
        let session = sessions.get_mut(id).ok_or_else(|| DocError::SessionNotFound(id.to_string()))?;
        session.staged_state = None;
        session.staged_patch = None;
        Ok(())
    }

    pub fn undo(&self, id: &str) -> Result<DocState, DocError> {
        let mut sessions = self.lock_sessions()?;
        let session = sessions.get_mut(id).ok_or_else(|| DocError::SessionNotFound(id.to_string()))?;

        if let Some(prev) = session.undo_stack.pop() {
            session.redo_stack.push(session.state.clone());
            session.state = prev;
        }
        Ok(session.state.clone())
    }

    pub fn redo(&self, id: &str) -> Result<DocState, DocError> {
        let mut sessions = self.lock_sessions()?;
        let session = sessions.get_mut(id).ok_or_else(|| DocError::SessionNotFound(id.to_string()))?;

        if let Some(next) = session.redo_stack.pop() {
            session.undo_stack.push(session.state.clone());
            session.state = next;
        }
        Ok(session.state.clone())
    }
}
