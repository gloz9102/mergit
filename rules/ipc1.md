## Envelope 패턴
- 모든 IPC 응답은 { ok: true, data } | { ok: false, error: GitErrorDto } 봉투로 감싼다
- preload의 unwrap이 실패 시 GitErrorDto를 그대로 throw한다
