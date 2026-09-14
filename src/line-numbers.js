(function() {
    'use strict';
    
    // Configuration for line markers
    const config = {
        zIndex: 1000,
        fontSize: '15px',
        lineColor: '#6c6c6c',
        fontWeight: 'normal',
        minTopPosition: 120,
        markerClass: 'relative-line-marker',
        caretSelector: '.kix-cursor-caret',
        canvasTileSelector: '.kix-canvas-tile-content',
        linesToDisplay: 50
    };

    // State variables
    let enabled = false; // current active state (markers shown)
    let globalEnabled = true; // respects Vim enabled toggle
    let lineNumbersPref = true; // respects Line Numbers toggle
    let initialized = false;
    let eventListenersAdded = false;
    let settingsListenersAttached = false;
    const changedPrefs = new Set();
    let observers = [];
    let caretObserver = null;
    let editorObserver = null;
    let lifecycleObserver = null;
    let observedCaret = null;
    let observedEditor = null;
    let rafId = null;
    const trackedListeners = [];
    
    // Pool for reusing marker elements
    const markersPool = [];
    
    // Detect browser environment (Firefox: `browser` + Promises; Chrome: `chrome` + callbacks)
    const isFirefox = typeof browser !== 'undefined';
    const api = isFirefox ? browser : chrome;

    function storageGet(keys) {
        if (isFirefox) {
            return api.storage.sync.get(keys);
        }
        return new Promise((resolve, reject) => {
            api.storage.sync.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result);
                }
            });
        });
    }

    function readPref(data, key, defaultValue) {
        try {
            if (!data || typeof data !== 'object') return defaultValue;
            if (!Object.prototype.hasOwnProperty.call(data, key)) return defaultValue;
            const value = data[key];
            if (typeof value === 'undefined' || value === null) return defaultValue;
            return !!value;
        } catch (_) {
            return defaultValue;
        }
    }

    function prefFromChange(change, fallback) {
        try {
            if (!change) return fallback;
            if (typeof change.newValue === 'undefined' || change.newValue === null) return true;
            return !!change.newValue;
        } catch (_) {
            return true;
        }
    }
    
    // Create styles for the markers
    function createStyles() {
        // Only create styles once
        if (document.getElementById('relative-line-numbers-style')) return;
        
        const styleEl = document.createElement('style');
        styleEl.id = 'relative-line-numbers-style';
        styleEl.textContent = `
            .${config.markerClass} {
                position: absolute;
                color: ${config.lineColor};
                font-family: monospace;
                font-weight: ${config.fontWeight};
                z-index: ${config.zIndex};
                font-size: ${config.fontSize};
                pointer-events: none;
                text-align: right;
                width: 30px;
                user-select: none;
            }
        `;
        document.head.appendChild(styleEl);
    }
    
    // Remove all existing markers
    function clearMarkers() {
        const markers = document.querySelectorAll(`.${config.markerClass}`);
        markers.forEach(marker => {
            marker.remove();
            if (markersPool.length < 100) {
                markersPool.push(marker);
            }
        });
    }
    
    // Create a single marker element
    function createMarker(left, top, text) {
        if (top < config.minTopPosition) return null;
        
        let marker = markersPool.pop();
        if (!marker) {
            marker = document.createElement('div');
            marker.className = config.markerClass;
            marker.setAttribute('aria-hidden', 'true');
        } else {
            marker.className = config.markerClass;
        }
        
        marker.textContent = text;
        marker.style.left = `${left}px`;
        marker.style.top = `${top}px`;
        return marker;
    }
    
    // Add markers to the document
    function addMarkers(markers) {
        if (!enabled) return; // Extra check before adding markers
        
        const fragment = document.createDocumentFragment();
        markers.forEach(marker => {
            if (marker) fragment.appendChild(marker);
        });
        document.body.appendChild(fragment);
    }

    function cancelScheduledUpdate() {
        if (rafId !== null) {
            try { cancelAnimationFrame(rafId); } catch (_) {}
            rafId = null;
        }
    }

    function scheduleLineMarkerUpdate() {
        if (!enabled) return;
        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            updateLineMarkers();
        });
    }
    
    // Update relative line number markers (coalesced via scheduleLineMarkerUpdate)
    function updateLineMarkers() {
        if (!enabled) { clearMarkers(); return; }
        try {
            if (!observedEditor || !observedEditor.isConnected) {
                observeEditorChanges();
            }
            if (!observedCaret || !observedCaret.isConnected) {
                observeCaretChanges();
            }
            const caret = (observedCaret && observedCaret.isConnected)
                ? observedCaret
                : document.querySelector(config.caretSelector);
            if (!caret) { clearMarkers(); return; }
            const caretRect = caret.getBoundingClientRect();
            if (caretRect.width === 0 && caretRect.height === 0) { clearMarkers(); return; }

            const caretTopDoc = caretRect.top + window.scrollY;

            // Determine left position from canvas tiles if possible
            let lineNumberLeft;
            const tiles = Array.from(document.querySelectorAll(config.canvasTileSelector), el => el.getBoundingClientRect());
            if (tiles.length) {
                const minLeft = tiles.reduce((min, rect) => Math.min(min, rect.left + window.scrollX), Infinity);
                lineNumberLeft = isFinite(minLeft) ? minLeft : 0;
            } else {
                lineNumberLeft = 0;
            }

            // Build a list of candidate line tops near the caret
            const lineTops = getLineTopsNear();
            // Complete geometry reads before removing/reusing marker nodes.
            clearMarkers();
            const markers = [];

            if (lineTops.length) {
                // Find nearest index to caretTopDoc
                let idx = 0; let best = Infinity;
                for (let i = 0; i < lineTops.length; i++) {
                    const d = Math.abs(lineTops[i] - caretTopDoc);
                    if (d < best) { best = d; idx = i; }
                }
                for (let off = -config.linesToDisplay; off <= config.linesToDisplay; off++) {
                    if (off === 0) continue;
                    const j = idx + off;
                    if (j < 0 || j >= lineTops.length) continue;
                    const y = lineTops[j];
                    const rel = Math.abs(off);
                    markers.push(createMarker(lineNumberLeft, y, String(rel)));
                }
            } else {
                // Fallback: approximate using caret height and skip gaps between tiles
                // Bounding rectangles already include the rendered zoom.
                const lineHeight = caretRect.height; // best-effort
                if (lineHeight <= 0) return;
                const intervals = tiles.map(rect => [rect.top + window.scrollY, rect.bottom + window.scrollY])
                    .sort((a, b) => a[0] - b[0]);
                for (let off = -config.linesToDisplay; off <= config.linesToDisplay; off++) {
                    if (off === 0) continue;
                    let y = caretTopDoc + off * lineHeight;
                    if (!isInAnyInterval(y, intervals)) continue; // skip page gaps
                    const rel = Math.abs(off);
                    markers.push(createMarker(lineNumberLeft, y, String(rel)));
                }
            }

            addMarkers(markers);
        } catch (_) {}
    }

    function getLineTopsNear() {
        const selectors = [
            '.kix-lineview-content',
            '.kix-lineview',
            '.kix-paragraphrenderer',
            '.kix-paragraphrenderer *[style*="position: absolute"]'
        ];
        const seen = new Set();
        const tops = [];
        const viewMin = window.scrollY - window.innerHeight * 0.5;
        const viewMax = window.scrollY + window.innerHeight * 1.5;
        // A combined selector returns each element once, even if it matches
        // multiple line classes. Avoid duplicate synchronous layout reads.
        document.querySelectorAll(selectors.join(',')).forEach(el => {
            const r = el.getBoundingClientRect();
            if (!r || r.height === 0 && r.width === 0) return;
            const top = Math.round(r.top + window.scrollY);
            if (top < viewMin || top > viewMax) return;
            const key = String(top);
            if (!seen.has(key)) { seen.add(key); tops.push(top); }
        });
        tops.sort((a,b)=>a-b);
        return tops;
    }

    function isInAnyInterval(y, intervals) {
        for (let i=0;i<intervals.length;i++) {
            const [a,b] = intervals[i];
            if (y >= a && y <= b) return true;
        }
        return false;
    }

    function dropObserver(obs) {
        if (!obs) return;
        try { obs.disconnect(); } catch (_) {}
        const i = observers.indexOf(obs);
        if (i >= 0) observers.splice(i, 1);
    }

    // Set up mutation observer to watch for caret changes
    function observeCaretChanges() {
        if (!enabled) return null;
        if (observedCaret && observedCaret.isConnected && caretObserver) {
            return caretObserver;
        }

        dropObserver(caretObserver);
        caretObserver = null;
        observedCaret = null;

        const caret = document.querySelector(config.caretSelector);
        if (!caret) return null;

        const observer = new MutationObserver(() => {
            if (!enabled) return;
            if (!observedCaret || !observedCaret.isConnected) {
                observeCaretChanges();
            }
            scheduleLineMarkerUpdate();
        });
        
        observer.observe(caret, { 
            attributes: true, 
            characterData: true, 
            subtree: true 
        });

        caretObserver = observer;
        observedCaret = caret;
        observers.push(observer);
        return observer;
    }
    
    // Observe editor position changes
    function observeEditorChanges() {
        if (!enabled) return null;
        if (editorObserver && observedEditor && observedEditor.isConnected) {
            return editorObserver;
        }

        dropObserver(editorObserver);
        editorObserver = null;
        observedEditor = null;

        const docContainer = document.querySelector('.kix-appview-editor');
        if (!docContainer) return null;
        
        const observer = new MutationObserver(() => {
            if (!enabled) return;
            if (!observedCaret || !observedCaret.isConnected) {
                observeCaretChanges();
            }
            scheduleLineMarkerUpdate();
        });
        
        observer.observe(docContainer, { 
            attributes: true,
            attributeFilter: ['style', 'class'],
            childList: true, 
            subtree: true
        });

        editorObserver = observer;
        observedEditor = docContainer;
        observers.push(observer);
        return observer;
    }

    function addTrackedListener(target, type, handler, options) {
        if (!target) return;
        target.addEventListener(type, handler, options);
        trackedListeners.push({ target, type, handler, options });
    }

    function removeEventListeners() {
        trackedListeners.forEach(({ target, type, handler, options }) => {
            try { target.removeEventListener(type, handler, options); } catch (_) {}
        });
        trackedListeners.length = 0;
        eventListenersAdded = false;
    }

    function onInteractiveUpdate() {
        if (!enabled) return;
        if (!observedCaret || !observedCaret.isConnected) {
            observeCaretChanges();
        }
        if (!observedEditor || !observedEditor.isConnected) {
            observeEditorChanges();
        }
        scheduleLineMarkerUpdate();
    }

    function handleScroll() {
        if (!enabled) return;
        scheduleLineMarkerUpdate();
    }

    function handleResize() {
        if (!enabled) return;
        scheduleLineMarkerUpdate();
    }
    
    // Add event listeners for user interaction
    function addEventListeners() {
        if (eventListenersAdded) return;

        addTrackedListener(document, "keyup", onInteractiveUpdate, { passive: true });
        addTrackedListener(document, "keydown", onInteractiveUpdate, { passive: true });
        addTrackedListener(document, "mouseup", onInteractiveUpdate, { passive: true });
        // Scroll does not bubble; capture also covers replacement containers.
        addTrackedListener(document, "scroll", handleScroll, { passive: true, capture: true });
        addTrackedListener(window, "resize", handleResize, { passive: true });
        
        eventListenersAdded = true;
    }
    
    // Set up observers for document changes
    function setupObservers() {
        observeCaretChanges();
        observeEditorChanges();
        if (!lifecycleObserver) {
            lifecycleObserver = new MutationObserver(records => {
                // Ordinary edits need no root lookup. A replaced/missing
                // editor or caret must recover even after a long idle period.
                if (enabled && (!observedCaret?.isConnected || !observedEditor?.isConnected) &&
                    records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
                        node.nodeType === 1 && !node.classList.contains(config.markerClass)))) {
                    scheduleLineMarkerUpdate();
                }
            });
            lifecycleObserver.observe(document.documentElement, { childList: true, subtree: true });
            observers.push(lifecycleObserver);
        }
    }
    
    // Clean up observers if needed
    function cleanupObservers() {
        observers.forEach(observer => {
            try { observer.disconnect(); } catch (_) {}
        });
        observers = [];
        caretObserver = null;
        editorObserver = null;
        lifecycleObserver = null;
        observedCaret = null;
        observedEditor = null;
    }

    function teardown() {
        cancelScheduledUpdate();
        cleanupObservers();
        removeEventListeners();
        clearMarkers();
    }
    
    // Toggle line numbers on/off
    function toggleLineNumbers(showLineNumbers) {
        const shouldEnable = !!showLineNumbers;
        const wasEnabled = enabled;

        if (!shouldEnable) {
            enabled = false;
            teardown();
            return enabled;
        }

        enabled = true;
        if (!wasEnabled) {
            try {
                if (!initialized) {
                    init();
                } else {
                    addEventListeners();
                    setupObservers();
                    scheduleLineMarkerUpdate();
                }
            } catch (error) {
                enabled = false;
                teardown();
                console.warn('[Vim line numbers] Initialization failed', error);
            }
        }
        
        return enabled;
    }

    function applyEffectiveEnabled() {
        const effective = !!(globalEnabled && lineNumbersPref);
        toggleLineNumbers(effective);
    }
    
    // Initialize the script when needed
    function init() {
        if (initialized) return;
        
        createStyles();
        addEventListeners();
        if (enabled) {
            setupObservers();
            scheduleLineMarkerUpdate();
        }
        initialized = true;
    }

    function applyStorageData(data) {
        if (!changedPrefs.has('enabled')) globalEnabled = readPref(data, 'enabled', true);
        if (!changedPrefs.has('lineNumbersEnabled')) lineNumbersPref = readPref(data, 'lineNumbersEnabled', true);
    }

    function attachSettingsListeners() {
        if (settingsListenersAttached) return;
        settingsListenersAttached = true;

        // Listen for runtime messages (optional path)
        try {
            api.runtime.onMessage.addListener((message, sender, sendResponse) => {
                try {
                    if (message && message.action === "updateSettings" && message.settings) {
                        if (Object.prototype.hasOwnProperty.call(message.settings, 'enabled')) {
                            changedPrefs.add('enabled');
                            globalEnabled = readPref(message.settings, 'enabled', true);
                        }
                        if (Object.prototype.hasOwnProperty.call(message.settings, 'lineNumbersEnabled')) {
                            changedPrefs.add('lineNumbersEnabled');
                            lineNumbersPref = readPref(message.settings, 'lineNumbersEnabled', true);
                        }
                        applyEffectiveEnabled();
                    }
                } catch (_) {
                    globalEnabled = true;
                    lineNumbersPref = true;
                    applyEffectiveEnabled();
                }
                return false;
            });
        } catch (e) {
            // ignore
        }

        // Listen to storage changes for instant apply (no tabs permission needed)
        try {
            api.storage.onChanged.addListener((changes, area) => {
                try {
                    if (area !== 'sync') return;
                    if (changes && changes.enabled) {
                        changedPrefs.add('enabled');
                        globalEnabled = prefFromChange(changes.enabled, globalEnabled);
                    }
                    if (changes && changes.lineNumbersEnabled) {
                        changedPrefs.add('lineNumbersEnabled');
                        lineNumbersPref = prefFromChange(changes.lineNumbersEnabled, lineNumbersPref);
                    }
                    applyEffectiveEnabled();
                } catch (_) {
                    globalEnabled = true;
                    lineNumbersPref = true;
                    applyEffectiveEnabled();
                }
            });
        } catch (e) {
            // ignore
        }
    }
    
    // Check storage for initial state
    function checkInitialState() {
        attachSettingsListeners();
        const startWithDefaults = () => {
            applyEffectiveEnabled();
        };

        try {
            Promise.resolve(storageGet(["enabled", "lineNumbersEnabled"])).then((data) => {
                applyStorageData(data);
                applyEffectiveEnabled();
            }).catch(() => {
                startWithDefaults();
            });
        } catch (e) {
            startWithDefaults();
        }
    }
    // Expose API to window
    window.relativeLineNumbers = {
        update: function() {
            if (!enabled) { clearMarkers(); return; }
            scheduleLineMarkerUpdate();
        },
        toggle: toggleLineNumbers,
        clear: clearMarkers
    };
    
    // Start the initialization process
    checkInitialState();
})();
