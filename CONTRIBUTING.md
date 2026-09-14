# Contributing to Vim-For-Docs

Thank you for your interest in contributing to **Vim-For-Docs**! Your help is welcome and appreciated. This guide explains how you can contribute to the project, whether by reporting bugs, suggesting improvements, or submitting pull requests.

## Table of Contents

- [Reporting Issues](#reporting-issues)
- [Submitting Pull Requests](#submitting-pull-requests)
- [Code Style Guidelines](#code-style-guidelines)
- [Project Structure](#project-structure)
- [Testing Your Changes](#testing-your-changes)
- [Additional Resources](#additional-resources)

## Reporting Issues

If you encounter any bugs or have suggestions for new features:

- **Search Existing Issues:** Before opening a new issue, please check the [issues list](https://github.com/greenstorm5417/Vim-For-Docs/issues) to see if your concern has already been reported.
- **Create a New Issue:** When opening a new issue, please include as much detail as possible:
  - A clear description of the problem or suggestion.
  - Steps to reproduce the issue.
  - Expected and actual behavior.
  - Screenshots or logs (if applicable).

## Submitting Pull Requests

We welcome pull requests for bug fixes, new features, or improvements to documentation. Please follow these steps:

1. **Fork the Repository:** Create a personal fork on GitHub.
2. **Create a Branch:** Use a descriptive branch name (e.g., `fix/mode-indicator-bug` or `feat/new-theme`).
3. **Implement Your Changes:** Make sure your code adheres to the style guidelines.
4. **Test Your Changes:** Run the extension locally (see [Testing Your Changes](#testing-your-changes)) to ensure everything works as expected.
5. **Submit a Pull Request:** Include a clear description of your changes and reference any related issues.

## Code Style Guidelines

- **JavaScript:**  
  - Use modern ES6+ syntax.
  - Write clear and concise comments where necessary.
  - Follow consistent naming conventions and code formatting.
  - When modifying files such as `src/content.js`, `src/executor.js`, or `src/ui/popup.js`, keep in mind that these files interact with browser APIs and the DOM. Ensure your changes are well-tested.

- **HTML/CSS:**  
  - Follow semantic HTML practices.
  - Use clear, descriptive class names.
  - Keep styles modular and maintain consistency with the existing design.

- **Commit Messages:**  
  - Write descriptive commit messages that explain the “what” and “why” of your changes.
  - Reference any related issue numbers when applicable.

## Project Structure

Below is a brief overview of the key directories and files:

- **`src/content.js`** – Contains the main logic for handling Vim-like commands and mode indicators.
- **`src/ui/index.html`** – The popup interface for the extension.
- **`src/ui/commands.html`** – A searchable command reference.
- **`src/executor.js`** – Executes commands against the Docs editor.
- **`src/ui/popup.js`** – Manages settings from the extension’s popup and communicates with the content script.

Understanding the project structure will help you locate the relevant parts of the code when making changes.

## Testing Your Changes

To test changes locally:

1. **Load the Extension in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable "Developer mode."
   - Click "Load unpacked" and select the project's `src/` directory.
2. **Try Out the Features:**
   - Open Google Docs and test the Vim-like motions.
   - Use the popup interface to change settings (e.g., themes, debug mode).
3. **Check the Console:**
   - Open the Developer Tools console to view any logs or errors.

## Additional Resources

- **GitHub Repository:**  
  [Vim-For-Docs on GitHub](https://github.com/greenstorm5417/Vim-For-Docs)

- **Chrome Extension Documentation:**  
  [Chrome Extensions Overview](https://developer.chrome.com/docs/extensions/)

- **Vim Documentation:**  
  [Vim Official Documentation](https://www.vim.org/docs.php)

We appreciate your contributions and feedback. If you have any questions or need further assistance, please feel free to open an issue or contact the maintainers.

Happy coding!

---
