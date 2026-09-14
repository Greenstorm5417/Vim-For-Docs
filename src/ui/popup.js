document.addEventListener("DOMContentLoaded", async function () {
  const status = document.getElementById("status");
  function setStatusErr(msg) {
    if (status) { status.className = "status err"; status.textContent = msg; }
  }

  const enableExtensionCheckbox = document.getElementById("switch1");
  const lineNumbersCheckbox = document.getElementById("lineNumbersSwitch");
  const themeDropdown = document.getElementById("dropdown");
  const controls = [enableExtensionCheckbox, lineNumbersCheckbox, themeDropdown];
  controls.forEach(control => { control.disabled = true; });
  enableExtensionCheckbox.checked = true;
  lineNumbersCheckbox.checked = true;

  // List of available themes (could be extended later)
  const themes = [
    { value: "default", name: "Default" },
    { value: "vim", name: "Vim" },
  ];

  // Populate theme dropdown dynamically
  function populateThemeDropdown() {
    themeDropdown.innerHTML = "";
    themes.forEach((theme) => {
      let option = document.createElement("option");
      option.value = theme.value;
      option.textContent = theme.name;
      themeDropdown.appendChild(option);
    });
  }

  // Open the Motions Editor in a new tab (no tabs permission needed)
  const motionsBtn = document.getElementById('openMotionsEditor');
  if (motionsBtn) {
    motionsBtn.addEventListener('click', () => {
      const url = chrome.runtime.getURL('ui/motions.html');
      window.open(url, '_blank');
    });
  }
  const commandsBtn = document.getElementById('openCommandList');
  if (commandsBtn) {
    commandsBtn.addEventListener('click', () => {
      window.open(chrome.runtime.getURL('ui/commands.html'), '_blank');
    });
  }
  populateThemeDropdown();
  themeDropdown.value = "vim";

  let helperOk = true;
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('browser-api.js');
      script.onload = () => window.browserAPI ? resolve() : reject(new Error("missing browserAPI"));
      script.onerror = () => reject(new Error("load failed"));
      document.head.appendChild(script);
    });
  } catch (e) {
    helperOk = false;
    setStatusErr("Failed to load browser helper script. Settings cannot be saved.");
  }

  if (!helperOk) return;

  // Load stored settings from browser storage
  try {
    const data = await window.browserAPI.storage.get(["enabled", "debug", "theme", "lineNumbersEnabled", "hideA11yWarning"]);
    enableExtensionCheckbox.checked = data.enabled ?? true;
    lineNumbersCheckbox.checked = data.lineNumbersEnabled ?? true;
    themeDropdown.value = data.theme || "vim";
    
    // Show accessibility warning if not dismissed
    const a11yWarning = document.getElementById('a11yWarning');
    if (a11yWarning && !data.hideA11yWarning) {
      a11yWarning.style.display = 'block';
    }
  } catch (error) {
    setStatusErr("Could not read settings; using defaults.");
  }
  
  // Handle dismissing the accessibility warning
  const dismissBtn = document.getElementById('dismissA11yWarning');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', async () => {
      try {
        await window.browserAPI.storage.set({ hideA11yWarning: true });
        const a11yWarning = document.getElementById('a11yWarning');
        if (a11yWarning) a11yWarning.style.display = 'none';
      } catch (error) {
        setStatusErr("Could not save the accessibility-warning preference.");
      }
    });
  }

  // Save settings to browser storage when changed
  const saved = { enabled: enableExtensionCheckbox.checked,
    lineNumbersEnabled: lineNumbersCheckbox.checked, theme: themeDropdown.value };
  async function saveSettings(key, control) {
    const property = control === themeDropdown ? 'value' : 'checked';
    const value = control[property];
    control.disabled = true;
    try {
      await window.browserAPI.storage.set({ [key]: value });
      saved[key] = value;
      if (status) { status.className = "status"; status.textContent = ""; }
    } catch (error) {
      control[property] = saved[key];
      setStatusErr("Failed to save settings.");
    } finally {
      control.disabled = false;
    }
  }

  enableExtensionCheckbox.addEventListener("change", () => saveSettings('enabled', enableExtensionCheckbox));
  lineNumbersCheckbox.addEventListener("change", () => saveSettings('lineNumbersEnabled', lineNumbersCheckbox));
  themeDropdown.addEventListener("change", () => saveSettings('theme', themeDropdown));
  controls.forEach(control => { control.disabled = false; });

});
