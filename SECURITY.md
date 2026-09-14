# Security Policy

## Reporting a Vulnerability
If you discover a security vulnerability in **Vim-For-Docs**, please report it privately via [GitHub Security Advisories](https://github.com/greenstorm5417/Vim-For-Docs/security/advisories).

Please **do not** post security vulnerabilities in public issues.

## Data Handling and Privacy
- **Vim-For-Docs** has no analytics, telemetry, or developer-operated data-upload service. Its configuration fetches load files bundled with the extension.
- Small preferences use browser sync storage and may be synchronized by your browser provider when browser sync is enabled; custom keybindings use local extension storage. The extension's developers do not receive these settings.
- Edits are made in Google Docs. Google's own document saving and collaboration remain governed by Google Docs, independently of the extension.
- Registers, macro recordings, repeat buffers, Replace restoration history, and visual-selection snapshots can contain document text in tab memory. They are not intentionally uploaded or persisted by the extension.
- The last-exit caret position is stored in Google Docs' page-local storage per document tab. It contains a SHA-256 paragraph fingerprint, paragraph length, and column, not a document excerpt. Text anchors and the most recent fingerprinted paragraph remain in tab memory only.

## Permissions Justification
We use the following Chrome extension permissions:
- **storage**: Saves user preferences (enabled state, theme selection, etc.).
- **clipboardWrite**: Writes text to the system clipboard when the user explicitly yanks/deletes to the `+` or `*` register.

The extension does not request clipboard reading, scripting, or activeTab permissions. Static content scripts run only on the Google Docs document URLs listed in the manifest. Clipboard paste from `+`/`*` uses the last in-memory register value, not a fresh system-clipboard read.

## Security Best Practices
To ensure the safety of users:
- We **do not execute arbitrary code** from external sources.
- Content scripts are **sandboxed** and run within Google Docs without elevated privileges.
- User-reported vulnerabilities will be reviewed promptly and patched in updates.
