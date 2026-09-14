document.addEventListener("DOMContentLoaded", async function () {
  const status = document.getElementById("status");
  function setStatusErr(msg) {
    if (status) { status.className = "status err"; status.textContent = msg; }
  }

  const debugSwitch = document.getElementById("debugSwitch");
  const useDisplayLinesSwitch = document.getElementById("useDisplayLinesSwitch");
  const controls = [debugSwitch, useDisplayLinesSwitch];
  controls.forEach(control => { control.disabled = true; });
  debugSwitch.checked = false;
  useDisplayLinesSwitch.checked = false;

  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("browser-api.js");
      script.onload = () => window.browserAPI ? resolve() : reject(new Error("missing browserAPI"));
      script.onerror = () => reject(new Error("load failed"));
      document.head.appendChild(script);
    });
  } catch (e) {
    setStatusErr("Failed to load browser helper script. Settings cannot be saved.");
    return;
  }

  try {
    const data = await window.browserAPI.storage.get(["debug", "useDisplayLines"]);
    debugSwitch.checked = data.debug ?? false;
    useDisplayLinesSwitch.checked = data.useDisplayLines ?? false;
  } catch (e) {
    debugSwitch.checked = false;
    useDisplayLinesSwitch.checked = false;
    setStatusErr("Could not read settings; using safe defaults.");
  }

  const saved = { debug: debugSwitch.checked, useDisplayLines: useDisplayLinesSwitch.checked };
  async function save(key, control) {
    control.disabled = true;
    try {
      await window.browserAPI.storage.set({ [key]: control.checked });
      saved[key] = control.checked;
      if (status) { status.className = "status"; status.textContent = ""; }
    } catch (e) {
      control.checked = saved[key];
      setStatusErr("Failed to save settings.");
    } finally {
      control.disabled = false;
    }
  }

  debugSwitch.addEventListener("change", () => save('debug', debugSwitch));
  useDisplayLinesSwitch.addEventListener("change", () => save('useDisplayLines', useDisplayLinesSwitch));
  controls.forEach(control => { control.disabled = false; });
});
