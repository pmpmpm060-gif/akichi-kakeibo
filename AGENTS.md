<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## ローカル設計書の更新

- 機能・UI・データ構造・運用方法を変更する場合は、実装タスクに`.local-docs/system-design.md`の更新を必ず含める。
- `.local-docs/`はGit管理外のため、設計書をコミット対象へ追加しない。
