# Vim-For-Docs
[![Install Vim for Docs (Chrome)](https://img.shields.io/badge/Install-Chrome%20Extension-blue?style=for-the-badge&logo=googlechrome)](https://chromewebstore.google.com/detail/vim-for-docs/kablhddalgenjgmoaignkfcphgmjnkno?authuser=0&hl=en)
[![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/kablhddalgenjgmoaignkfcphgmjnkno?style=for-the-badge)](https://chromewebstore.google.com/detail/vim-for-docs/kablhddalgenjgmoaignkfcphgmjnkno)

[![Install Vim for Docs (Firefox)](https://img.shields.io/badge/Install-Firefox%20Extension-orange?style=for-the-badge&logo=firefox)](https://addons.mozilla.org/en-US/firefox/addon/vim-for-docs/)
[![Firefox Add-on Users](https://img.shields.io/amo/users/vim-for-docs?style=for-the-badge)](https://addons.mozilla.org/en-US/firefox/addon/vim-for-docs/)

[![GitHub stars](https://img.shields.io/github/stars/greenstorm5417/Vim-For-Docs?style=for-the-badge)](https://github.com/greenstorm5417/Vim-For-Docs/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/greenstorm5417/Vim-For-Docs?style=for-the-badge)](https://github.com/greenstorm5417/Vim-For-Docs/issues)

Vim-For-Docs is a browser extension that brings Vim-like navigation and editing functionality to Google Docs. With Vim-For-Docs, you can navigate, edit, and manipulate your documents using familiar Vim commands—now with a new default "vim" theme that displays a full-width overlay at the bottom. The left side of the overlay shows the current mode, while the right side shows the pending motion buffer.

> **Note:** This extension intercepts keystrokes before they reach Google Docs’ internal editor and remaps them to simulate Vim motions. It is designed for users who love Vim’s efficient navigation and editing style.

## ⚠️ Requirements
**Important:** This extension requires Google Docs accessibility features to be enabled:
1. Open a Google Doc
2. Go to **Tools → Accessibility**
3. Enable **Screen reader support**
4. Enable **Braille support**

Without these settings enabled, the extension will not function properly.

## Features
- Vim-like navigation and editing for Google Docs.
- Unbound Docs and browser shortcuts pass through in every mode, including Visual mode: `Ctrl+Alt+1` for headings, `Ctrl+Shift+C` for word count, and macOS `Cmd+L` / `Cmd+R`.
- Customizable motions, operators, commands, and text objects via a built‑in Motions Editor.
- Clean, non-destructive editor UX: no row deletion, IDs locked, keys edited in modals.
- Live apply of settings and motions through storage listeners (no tabs permission).
- Permissions: storage and clipboard writing when explicitly using the `+` or `*` register.

## Configuration & Motions Editor
- Open the popup → Motions Editor to customize key sequences and text object delimiters.
- Edits are validated before saving, including supported tokens and conflicting bindings.
- Motions are saved locally and applied to open Docs tabs. Small preferences use sync storage.

Use `<Left>`, `<Right>`, `<Up>`, `<Down>`, `<SPACE>`, `<ESC>`, `<CR>`, `<BS>`,
`<TAB>`, `<Del>`, `<Home>`, `<End>`, `<PageUp>`, `<PageDown>`, or `<F1>`–`<F24>`
for named keys. Modifier prefixes are `C` (Control), `A` (Alt), `M` (Meta/Command),
and `S` (Shift), in that order: for example `<A-X>`, `<M-Z>`, `<C-S-X>`, or
`<S-TAB>`. Use the uppercase letter itself for Shift plus a letter. Shortcuts
intercepted by the browser or operating system cannot reach the extension.

Insert sequences such as `j k` buffer typing until they match. If the sequence
fails or times out, its ordinary typing is restored. Under **Advanced: Edit raw
JSON**, the `settings` object also supports:

- `mappingTimeoutMs`: insert mapping timeout, default `500` milliseconds.
- `registerPrefix`: key introducing a register name, default `"`.
- `allowRegisterPrefix`: set to `false` to release that key for another binding.
- `allowCountPrefix`: set to `false` to bind digits instead of using them as counts.
- `tokenAliases`: defaults to `{ "<C-[>": "<ESC>" }`. Set to `{}` to bind Ctrl+[ independently.
- `cancelTokens`: keys that cancel a pending Normal/Visual sequence; defaults to `["<ESC>", "<C-C>"]`. Insert/Visual exit commands have their own editable bindings.
- `promptSubmitTokens`: keys that submit search and Ex prompts; defaults to `["<CR>"]`.
- `promptBackspaceTokens`: keys that erase a character in prompts; defaults to `["<BS>"]`.

Operator Self sequences can be rebound independently of their operators.
Completed normal motions run immediately: `e a` retains its usual composition
of move-to-word-end followed by append.

## Current limitations

- This is a Vim-like editor layer, not a complete Vim implementation. Visual block mode, Ex substitution/ranges, and keyword completion are not implemented.
- Search temporarily selects document text to read a whole-document snapshot, limited to 1,000,000 characters. Search itself does not edit the text.
- Insert and Replace repeats are limited to 1,000,000 characters and 10,000 edit operations. Replace counts each overwritten grapheme as an operation; a single large text insertion counts as one operation.
- Vertical visual motions preserve their anchor across Docs' text windows. Other visual motions are cancelled if their saved offsets become invalid. Marks and jumps resolve unique text anchors across the document; changed or repeated anchor text is rejected. Last-exit restoration after reload uses a paragraph fingerprint and rejects changed or duplicate paragraphs (up to 10,000 candidate paragraphs).
- Multi-edit commands can require multiple native undo steps.
- Registers are held in tab memory. The `+` and `*` registers can write to the system clipboard, but pasting from them uses the last in-memory value; the extension does not read the system clipboard.
- IME input and native toolbar edits are not fully recorded for dot-repeat or macros. Browser- and OS-reserved shortcuts cannot always be rebound.

Use a disposable document when checking unfamiliar commands. If an edit fails,
queued keys are discarded; inspect the document before continuing. A startup
failure leaves native typing enabled and displays a retry message.

## Help
- A concise Help is available inside each edit modal.
- For general Vim references, see https://vim.rtorr.com/.

## How It Works
Vim-For-Docs intercepts key events from the Google Docs iframe and remaps them to Vim-like motions. The extension:
- **Maps keys:** For example, `h`, `j`, `k`, `l` for basic navigation.
- **Handles multi-key commands:** Such as `gg` and `ge` for document navigation.
- **Switches modes:** Between Normal, Insert, and Visual, with the "vim" theme providing a full-width overlay that shows the current mode and pending command.
- **Simulates keystroke events:** To interact with Google Docs’ editing surface.

For a detailed look at the code, please refer to the source files.

## Contributing
Contributions, issues, and feature requests are welcome!  
Feel free to check [Issues](https://github.com/greenstorm5417/Vim-For-Docs/issues) or submit a pull request.



## Links
- **Chrome Web Store:** [Vim-For-Docs Extension](https://chromewebstore.google.com/detail/vim-for-docs/kablhddalgenjgmoaignkfcphgmjnkno)


## Inspired By & Continued From
Vim-For-Docs is inspired by and continues the work started in the [DocsKeys](https://github.com/tirthd16/dockeys) repository. 

*Vim-For-Docs – Bringing Vim-like navigation and editing to Google Docs!*
