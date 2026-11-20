// content.js - Complete Swayam Plus Course & Quiz Auto-Complete v6.0
(function () {
    'use strict';

    if (window.__swayamAutoInitialized) return;
    window.__swayamAutoInitialized = true;

    // Inject bridge script into top window
    if (window.self === window.top) {
        try {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('page-bridge.js');
            script.onload = function () { this.remove(); };
            (document.head || document.documentElement).appendChild(script);
        } catch (e) {
            console.error('[SwayamAuto] Bridge script injection failed:', e);
        }
    }

    let CFG = {
        API_KEY: '',
        SOLVER_MODE: 'algo', // 'algo' (instant algorithm & key) or 'ai' (Gemini API)
        MODELS: [
            'gemini-2.5-flash',
            'gemini-2.5-pro',
            'gemini-1.5-flash-latest',
            'gemini-1.5-pro-latest',
            'gemini-1.5-flash-002',
            'gemini-1.5-pro-002'
        ],
        COURSE_ID: '20',
        BASE: 'https://swayam-plus-lms.iitmpravartak.org.in',
        AUTO_START: true,
        D_SHORT: 1200,
        D_MED: 2500,
        D_SEEK: 3500,
        D_QUIZ: 2500
    };

    let running = false;
    let stopped = false;
    let logEl, startBtn, stopBtn, apiInput, statusEl, countdownTimer;
    let cachedAnswersMap = {};

    // ═══════════════════════════════════════════════════
    //  EVENT DISPATCH & CLICK HELPERS
    // ═══════════════════════════════════════════════════
    function fireClick(el) {
        if (!el) return false;
        try {
            el.scrollIntoView({ behavior: 'instant', block: 'center' });
        } catch (e) {}

        const evTypes = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
        evTypes.forEach(type => {
            try {
                const ev = new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    view: el.ownerDocument.defaultView || window
                });
                el.dispatchEvent(ev);
            } catch (e) {}
        });

        if (typeof el.click === 'function') {
            try { el.click(); } catch (e) {}
        }
        return true;
    }

    function cleanText(str) {
        if (!str) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = str;
        return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
    }

    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    function chk() { if (stopped) throw new Error('USER_STOP'); }

    // Bridge RPC Helper
    function callBridge(action, payload = {}) {
        return new Promise((resolve) => {
            const msgId = 'rpc_' + Math.random().toString(36).substring(2, 9);
            const timeout = setTimeout(() => {
                window.removeEventListener('message', handler);
                resolve({ success: false, error: 'TIMEOUT' });
            }, 3000);

            function handler(e) {
                if (e.data && e.data.source === 'swayam-ext-bridge' && e.data.msgId === msgId) {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    resolve(e.data);
                }
            }

            window.addEventListener('message', handler);
            window.postMessage({
                source: 'swayam-ext-content',
                action: action,
                msgId: msgId,
                payload: payload
            }, '*');
        });
    }

    // Logging & Status
    function L(msg, type = 'i') {
        const clsMap = { i: 'li', s: 'ls', w: 'lw', e: 'le' };
        const cls = clsMap[type] || 'li';
        if (logEl) {
            const row = document.createElement('div');
            row.className = cls;
            row.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            logEl.appendChild(row);
            logEl.scrollTop = logEl.scrollHeight;
        }
        console.log(`%c[SwayamAuto] ${msg}`, type === 'e' ? 'color:#ff4757;font-weight:bold' : (type === 's' ? 'color:#2ed573;font-weight:bold' : 'color:#1e90ff'));
    }

    function S(msg) {
        if (statusEl) statusEl.textContent = msg;
    }

    // ═══════════════════════════════════════════════════
    //  FLOATING UI PANEL
    // ═══════════════════════════════════════════════════
    function buildUI() {
        if (window.self !== window.top) return;
        if (document.getElementById('sa-panel')) return;

        const p = document.createElement('div');
        p.id = 'sa-panel';
        p.innerHTML = `
        <style>
            #sa-panel {
                position: fixed; top: 14px; right: 14px; z-index: 99999999; width: 420px;
                background: #0f172a; color: #f8fafc; border: 2px solid #6366f1; border-radius: 12px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 13px; box-shadow: 0 16px 45px rgba(0,0,0,0.65); line-height: 1.4;
            }
            #sa-panel.min { width: 220px; }
            #sa-panel.min .sa-body { display: none; }
            .sa-hdr {
                background: linear-gradient(135deg, #4f46e5, #0ea5e9); padding: 10px 14px;
                border-radius: 10px 10px 0 0; display: flex; justify-content: space-between;
                align-items: center; cursor: move; user-select: none;
            }
            .sa-hdr h3 { margin: 0; font-size: 13px; font-weight: 700; color: #fff; letter-spacing: 0.5px; }
            .sa-body { padding: 12px; }
            .sa-row { margin-bottom: 8px; display: flex; gap: 8px; align-items: center; }
            .sa-row label { width: 75px; font-weight: 600; color: #94a3b8; font-size: 11px; text-transform: uppercase; }
            .sa-row input {
                flex: 1; padding: 6px 10px; border: 1px solid #334155; border-radius: 6px;
                background: #1e293b; color: #f8fafc; font-size: 12px; outline: none;
            }
            .sa-row input:focus { border-color: #6366f1; }
            .sa-btn {
                padding: 7px 16px; border: none; border-radius: 6px; cursor: pointer;
                font-weight: 700; font-size: 12px; transition: all 0.2s;
            }
            .sa-go { background: #10b981; color: #fff; }
            .sa-go:hover { background: #059669; }
            .sa-st { background: #ef4444; color: #fff; }
            .sa-st:hover { background: #dc2626; }
            .sa-mn { background: none; border: none; color: #fff; cursor: pointer; font-size: 18px; padding: 0 4px; }
            #sa-log {
                max-height: 220px; overflow-y: auto; background: #020617; border: 1px solid #1e293b;
                border-radius: 6px; padding: 8px; font-size: 11px; line-height: 1.5; margin-top: 8px;
                font-family: 'Cascadia Code', 'Consolas', monospace;
            }
            #sa-status {
                padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;
                background: #1e293b; color: #fde047; margin-top: 6px; text-align: center;
                border-left: 3px solid #eab308;
            }
            .li { color: #38bdf8; }
            .ls { color: #4ade80; font-weight: 600; }
            .lw { color: #facc15; }
            .le { color: #f87171; font-weight: 600; }
        </style>
        <div class="sa-hdr" id="sa-drag">
            <h3>⚡ SWAYAM AUTO v6.0</h3>
            <button class="sa-mn" id="sa-min">─</button>
        </div>
        <div class="sa-body">
            <div class="sa-row">
                <label>Mode</label>
                <select id="sa-mode" style="flex:1; padding:5px 8px; border:1px solid #334155; border-radius:6px; background:#1e293b; color:#38bdf8; font-size:11px; font-weight:700; outline:none;">
                    <option value="algo" ${CFG.SOLVER_MODE === 'algo' ? 'selected' : ''}>⚡ Fast Algorithm Mode (Instant & Best)</option>
                    <option value="ai" ${CFG.SOLVER_MODE === 'ai' ? 'selected' : ''}>🤖 AI Mode (Gemini API Key)</option>
                </select>
            </div>
            <div class="sa-row" id="sa-key-row" style="${CFG.SOLVER_MODE === 'ai' ? '' : 'display:none;'}">
                <label>Gemini Key</label>
                <input type="password" id="sa-key" value="${CFG.API_KEY}" placeholder="AIzaSy... (for AI Quiz solver)">
            </div>
            <div class="sa-row" style="justify-content:center; gap:10px;">
                <button class="sa-btn sa-go" id="sa-start">▶ START</button>
                <button class="sa-btn sa-st" id="sa-stop">■ PAUSE</button>
            </div>
            <div id="sa-status">Initializing...</div>
            <div id="sa-log"></div>
        </div>`;
        document.body.appendChild(p);

        logEl    = document.getElementById('sa-log');
        startBtn = document.getElementById('sa-start');
        stopBtn  = document.getElementById('sa-stop');
        apiInput = document.getElementById('sa-key');
        statusEl = document.getElementById('sa-status');
        const modeSelect = document.getElementById('sa-mode');
        const keyRow = document.getElementById('sa-key-row');

        modeSelect.onchange = () => {
            CFG.SOLVER_MODE = modeSelect.value;
            chrome.storage.local.set({ solver_mode: CFG.SOLVER_MODE });
            keyRow.style.display = CFG.SOLVER_MODE === 'ai' ? '' : 'none';
            L(`🔄 Switched to ${CFG.SOLVER_MODE === 'algo' ? 'Fast Algorithm Mode ⚡' : 'AI Mode 🤖'}`, 's');
        };

        document.getElementById('sa-min').onclick = () => p.classList.toggle('min');
        startBtn.onclick = () => { stopped = false; run(); };
        stopBtn.onclick  = () => {
            stopped = true;
            if (countdownTimer) clearInterval(countdownTimer);
            L('⏹ Automation paused by user', 'w');
            S('Paused — click START to resume');
            startBtn.disabled = false;
            startBtn.textContent = '▶ START';
            stopBtn.disabled = true;
        };

        apiInput.onchange = () => {
            CFG.API_KEY = apiInput.value.trim();
            chrome.storage.local.set({ gemini_api_key: CFG.API_KEY });
            L('🔑 Gemini API key updated and saved in storage', 's');
        };

        let ox, oy, dr = false;
        const dragHandle = document.getElementById('sa-drag');
        dragHandle.onmousedown = e => {
            dr = true;
            ox = e.clientX - p.getBoundingClientRect().left;
            oy = e.clientY - p.getBoundingClientRect().top;
            e.preventDefault();
        };
        document.onmousemove = e => {
            if (!dr) return;
            p.style.left = (e.clientX - ox) + 'px';
            p.style.top = (e.clientY - oy) + 'px';
            p.style.right = 'auto';
        };
        document.onmouseup = () => dr = false;
    }

    // ═══════════════════════════════════════════════════
    //  EXTRACT OFFICIAL H5P ANSWERS (FOR VIDEO QUIZZES)
    // ═══════════════════════════════════════════════════
    async function extractH5PAnswers() {
        try {
            const res = await callBridge('GET_H5P_DATA');
            let contents = res && res.success ? res.data : null;

            if (!contents) {
                document.querySelectorAll('script').forEach(s => {
                    const txt = s.textContent || '';
                    if (txt.includes('H5PIntegration')) {
                        const m = txt.match(/var\s+H5PIntegration\s*=\s*(\{.+?\});\s*\/\//s);
                        if (m) {
                            try {
                                const parsed = JSON.parse(m[1]);
                                contents = parsed.contents;
                            } catch (e) {}
                        }
                    }
                });
            }

            if (!contents) return {};

            const map = {};
            for (const cid in contents) {
                const item = contents[cid];
                if (!item.jsonContent) continue;
                let jc = null;
                try {
                    jc = typeof item.jsonContent === 'string' ? JSON.parse(item.jsonContent) : item.jsonContent;
                } catch (e) {
                    continue;
                }

                const iv = jc.interactiveVideo || jc;
                const interactions = iv.assets?.interactions || [];
                interactions.forEach(inter => {
                    const action = inter.action || {};
                    const params = action.params || {};
                    const qRaw = params.question || '';
                    const qClean = cleanText(qRaw);
                    const answers = params.answers || [];

                    const correctList = [];
                    answers.forEach(a => {
                        if (a.correct === true) correctList.push(cleanText(a.text));
                    });

                    if (qClean && correctList.length > 0) {
                        map[qClean] = correctList;
                        map[qClean.substring(0, 40)] = correctList;
                    }
                });
            }

            const count = Object.keys(map).length;
            if (count > 0) {
                L(`🎯 Extracted ${count} official answers directly from H5P lesson bundle!`, 's');
            }
            return map;
        } catch (e) {
            console.error('[SwayamAuto] Answer extraction error:', e);
            return {};
        }
    }

    let discoveredModels = null;

    async function getAvailableGeminiModels() {
        if (discoveredModels && discoveredModels.length > 0) return discoveredModels;
        try {
            const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${CFG.API_KEY}`;
            const res = await fetch(listUrl);
            const data = await res.json();
            if (data && data.models) {
                const supported = data.models
                    .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                    .map(m => m.name.replace('models/', ''))
                    .filter(name => !name.includes('embedding') && !name.includes('aqa') && !name.includes('imagen'));
                if (supported.length > 0) {
                    // prioritize flash models
                    supported.sort((a, b) => {
                        if (a.includes('flash') && !b.includes('flash')) return -1;
                        if (!a.includes('flash') && b.includes('flash')) return 1;
                        return 0;
                    });
                    discoveredModels = supported;
                    L(`🔍 Auto-discovered ${supported.length} active Gemini models: ${supported.slice(0, 3).join(', ')}`, 'i');
                    return discoveredModels;
                }
            }
        } catch (e) {
            console.warn('[SwayamAuto] ListModels failed, using fallback list', e);
        }
        return CFG.MODELS;
    }

    // ═══════════════════════════════════════════════════
    //  SOLVER: FAST ALGORITHM MODE vs AI MODE
    // ═══════════════════════════════════════════════════
    async function solveQuestion(question, options) {
        const qClean = cleanText(question);

        // 1. Direct official H5P answer key match (Instant & 100% accurate)
        for (const k in cachedAnswersMap) {
            if (qClean.includes(k) || k.includes(qClean) || (qClean.length > 20 && k.startsWith(qClean.substring(0, 30)))) {
                const correctTexts = cachedAnswersMap[k];
                for (const cText of correctTexts) {
                    const matchedOpt = options.find(o => cleanText(o) === cText || o.includes(cText) || cText.includes(o));
                    if (matchedOpt) {
                        L(`⚡ [Official Key] Instant Match: "${matchedOpt.substring(0, 40)}..."`, 's');
                        return matchedOpt;
                    }
                }
            }
        }

        // 2. Mode: Fast Algorithm Mode (Instant response using optimal technical question heuristic)
        if (CFG.SOLVER_MODE === 'algo') {
            const longest = options.reduce((a, b) => a.length >= b.length ? a : b, '');
            L(`⚡ [Algorithm Mode] Instant choice (longest technical answer): "${longest.substring(0, 40)}..."`, 's');
            return longest;
        }

        // 3. Mode: AI Mode (Strictly via Gemini API Key)
        if (!CFG.API_KEY) {
            L('❌ No Gemini API key provided! Please enter your key in the panel or switch to Fast Algorithm Mode.', 'e');
            S('Missing Gemini API Key');
            throw new Error('API_KEY_REQUIRED');
        }

        L(`🤖 [AI Mode] Querying Gemini for: "${qClean.substring(0, 45)}..."`, 'i');

        const modelsToTry = await getAvailableGeminiModels();

        for (const model of modelsToTry) {
            try {
                const ans = await callGeminiAPI(model, question, options);
                if (ans) {
                    L(`✓ Gemini (${model}) chose: "${ans.substring(0, 40)}..."`, 's');
                    return ans;
                }
            } catch (err) {
                L(`Gemini (${model}) error: ${err.message}`, 'w');
            }
        }

        L('❌ Failed to get answer from Gemini API (quota/key/network error)', 'e');
        throw new Error('GEMINI_API_FAILED');
    }

    function callGeminiAPI(model, question, options) {
        return new Promise((resolve, reject) => {
            const prompt = `You are taking a technical Data Center Operations, Infrastructure, and Facilities Engineer exam (CIDCOM).
Question:
${question}

Options:
${options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}

Instructions:
Respond with ONLY the single number corresponding to the correct option (e.g. "1", "2", "3", or "4"). Do not write any explanations, markdown, or punctuation.`;

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${CFG.API_KEY}`;

            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.0, maxOutputTokens: 10 }
                })
            })
            .then(res => res.json())
            .then(json => {
                if (json.error) return reject(new Error(json.error.message || 'API_ERROR'));
                const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                const match = text.match(/\d+/);
                if (match) {
                    const idx = parseInt(match[0], 10) - 1;
                    if (idx >= 0 && idx < options.length) {
                        return resolve(options[idx]);
                    }
                }
                resolve(null);
            })
            .catch(reject);
        });
    }

    // ═══════════════════════════════════════════════════
    //  H5P VIDEO IFRAME ACCESS & RUNNER
    // ═══════════════════════════════════════════════════
    function getH5PContext() {
        const iframe = document.querySelector('iframe.h5p-iframe, iframe[id*="h5p-iframe"]');
        if (!iframe) return null;
        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            const win = iframe.contentWindow;
            return { iframe, doc, win };
        } catch (e) {
            return null;
        }
    }

    async function waitForH5PLoad(maxSeconds = 25) {
        L('Waiting for H5P interactive video to initialize...', 'i');
        S('Loading H5P video...');
        for (let i = 0; i < maxSeconds; i++) {
            chk();
            const ctx = getH5PContext();
            if (ctx && ctx.doc) {
                const vid = ctx.doc.querySelector('video');
                if (vid) return ctx;
                if (ctx.win && ctx.win.H5P && ctx.win.H5P.instances && ctx.win.H5P.instances.length > 0) return ctx;
            }
            await wait(1000);
        }
        return getH5PContext();
    }

    async function seekToEnd(ctx) {
        L('⏩ Seeking video to end...', 'i');
        S('Seeking video to end...');

        try {
            await callBridge('SEEK_VIDEO');
        } catch (e) {}

        try {
            if (ctx && ctx.win && ctx.win.H5P && ctx.win.H5P.instances) {
                ctx.win.H5P.instances.forEach(inst => {
                    const iv = inst.interactiveVideo || inst;
                    if (iv.video && typeof iv.video.getDuration === 'function') {
                        const dur = iv.video.getDuration();
                        if (dur > 0) iv.video.seek(Math.max(0, dur - 0.5));
                    }
                });
            }
        } catch (e) {}

        const vid = ctx.doc.querySelector('video');
        if (vid) {
            if (!vid.duration || isNaN(vid.duration)) {
                await new Promise(r => { vid.onloadedmetadata = r; setTimeout(r, 3000); });
            }
            if (vid.duration && !isNaN(vid.duration)) {
                vid.currentTime = Math.max(0, vid.duration - 0.5);
                try { vid.play(); } catch (e) {}
                vid.dispatchEvent(new Event('timeupdate', { bubbles: true }));
                vid.dispatchEvent(new Event('ended', { bubbles: true }));
            }
        }

        await wait(CFG.D_SEEK);
        L('Video reached end duration ✓', 's');
        return true;
    }

    function getQuizButtons(doc) {
        const list = [];
        const selectors = [
            '.h5p-interaction-button',
            '.h5p-interaction',
            'button[class*="interaction"]',
            '.h5p-overlay-button',
            'button[aria-label*="Quiz"]',
            'button[aria-label*="qp"]',
            '.h5p-control[aria-label*="Quiz"]'
        ];
        selectors.forEach(sel => {
            doc.querySelectorAll(sel).forEach(el => {
                if (!list.includes(el) && el.offsetParent !== null) list.push(el);
            });
        });

        list.sort((a, b) => {
            const ta = (a.textContent || a.getAttribute('aria-label') || '').toLowerCase();
            const tb = (b.textContent || b.getAttribute('aria-label') || '').toLowerCase();
            return ta.localeCompare(tb, undefined, { numeric: true });
        });

        return list;
    }

    async function answerAllQuizzes(ctx) {
        L('📝 Scanning for Video Quiz questions (Quiz qp 1 to 5)...', 'i');
        S('Locating questions...');
        await wait(CFG.D_QUIZ);

        for (let i = 0; i < 5; i++) {
            chk();
            const quizBtns = getQuizButtons(ctx.doc);
            let targetBtn = null;

            for (const b of quizBtns) {
                const txt = (b.textContent || b.getAttribute('aria-label') || '').toLowerCase();
                if (txt.includes(`qp ${i + 1}`) || txt.includes(`quiz ${i + 1}`) || txt.includes(`question ${i + 1}`)) {
                    targetBtn = b;
                    break;
                }
            }
            if (!targetBtn && quizBtns[i]) targetBtn = quizBtns[i];

            if (targetBtn) {
                L(`\n── Attempting Question ${i + 1} ──`, 'i');
                S(`Answering Question ${i + 1}/5...`);
                fireClick(targetBtn);
                await wait(CFG.D_QUIZ);

                await answerVisibleQuestion(ctx, i + 1);
                await wait(CFG.D_SHORT);
            } else {
                const isQOpen = ctx.doc.querySelector('.h5p-question-content, .h5p-multichoice, .h5p-alternative-container');
                if (isQOpen) {
                    L(`\n── Answering visible question (${i + 1}) ──`, 'i');
                    await answerVisibleQuestion(ctx, i + 1);
                    await wait(CFG.D_SHORT);
                }
            }
        }
    }

    async function answerVisibleQuestion(ctx, qNum) {
        const doc = ctx.doc;
        const qEl = doc.querySelector('.h5p-question-content, .h5p-multichoice-title, .h5p-question-introduction, [class*="question-title"]');
        const questionText = qEl ? qEl.textContent.trim() : `Question ${qNum}`;

        const optionNodes = doc.querySelectorAll('.h5p-answer, .h5p-alternative-container li, .h5p-alternative-container label, div[role="radio"]');
        const options = [];
        const validNodes = [];

        optionNodes.forEach(node => {
            const inner = node.querySelector('.h5p-alternative-inner') || node;
            const text = cleanText(inner.textContent);
            if (text && !options.includes(text)) {
                options.push(text);
                validNodes.push(node);
            }
        });

        if (options.length === 0) {
            L(`Q${qNum}: No options detected — attempting check`, 'w');
            await clickCheckAndProceed(doc);
            return;
        }

        L(`Q${qNum}: "${cleanText(questionText).substring(0, 50)}..." (${options.length} options)`, 'i');

        const chosenText = await solveQuestion(questionText, options);
        const chosenIdx = options.findIndex(o => cleanText(o) === cleanText(chosenText));

        if (chosenIdx >= 0 && validNodes[chosenIdx]) {
            const nodeToClick = validNodes[chosenIdx];
            fireClick(nodeToClick);
            const radio = nodeToClick.querySelector('input[type="radio"], input[type="checkbox"]');
            if (radio) {
                radio.checked = true;
                fireClick(radio);
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
            await wait(800);
        }

        await clickCheckAndProceed(doc);
    }

    async function clickCheckAndProceed(doc) {
        let checkClicked = false;
        const allButtons = Array.from(doc.querySelectorAll('button, .h5p-joubelui-button, [role="button"], a.h5p-button'));

        for (const b of allButtons) {
            const txt = (b.textContent || b.innerText || b.getAttribute('aria-label') || '').trim().toLowerCase();
            const cls = (b.className || '').toLowerCase();
            if (
                txt === 'check' ||
                txt.includes('check answer') ||
                cls.includes('h5p-question-check-answer') ||
                cls.includes('check-button') ||
                b.getAttribute('data-action') === 'check'
            ) {
                if (b.offsetParent !== null || b.getClientRects().length > 0) {
                    L('  → Clicked [Check] button', 's');
                    fireClick(b);
                    checkClicked = true;
                    await wait(CFG.D_SHORT);
                    break;
                }
            }
        }

        if (!checkClicked) {
            await callBridge('H5P_INSTANCE_ACTION', { cmd: 'TRIGGER_INTERACTIONS_CHECK' });
        }

        await wait(800);

        const contButtons = Array.from(doc.querySelectorAll('button, .h5p-joubelui-button, [role="button"]'));
        for (const b of contButtons) {
            const txt = (b.textContent || b.innerText || b.getAttribute('aria-label') || '').trim().toLowerCase();
            const cls = (b.className || '').toLowerCase();
            if (
                txt === 'continue' ||
                txt === 'next' ||
                txt.includes('continue') ||
                cls.includes('continue') ||
                cls.includes('next')
            ) {
                if (b.offsetParent !== null || b.getClientRects().length > 0) {
                    L('  → Clicked [Continue] button', 's');
                    fireClick(b);
                    await wait(1000);
                    break;
                }
            }
        }

        const closeBtn = doc.querySelector('.h5p-close-button, .h5p-dialog-close, button[aria-label="Close"]');
        if (closeBtn && closeBtn.offsetParent !== null) {
            fireClick(closeBtn);
            await wait(500);
        }
    }

    async function submitModule(ctx) {
        L('⭐ Opening Star / Endscreen submit summary...', 'i');
        S('Opening submit dialog...');

        const doc = ctx.doc;
        const win = ctx.win || window;

        // 1. Direct invocation on H5P InteractiveVideo instance inside iframe
        try {
            if (win.H5P && win.H5P.instances) {
                win.H5P.instances.forEach(inst => {
                    const iv = inst.interactiveVideo || inst;
                    if (typeof iv.toggleEndscreen === 'function') iv.toggleEndscreen(true);
                    if (typeof iv.showEndscreen === 'function') iv.showEndscreen();
                    if (typeof iv.showSummary === 'function') iv.showSummary();
                    if (iv.bubbleEndscreen && typeof iv.bubbleEndscreen.toggle === 'function') {
                        iv.bubbleEndscreen.toggle(true, true);
                    }
                    if (iv.endscreens) {
                        iv.endscreens.forEach(es => {
                            if (typeof es.show === 'function') es.show();
                            if (es.container) es.container.classList.remove('h5p-hidden');
                        });
                    }
                });
            }
        } catch (e) {}

        // Also trigger via bridge in top window
        try {
            await callBridge('H5P_INSTANCE_ACTION', { cmd: 'SHOW_ENDSCREEN' });
        } catch (e) {}

        await wait(1500);

        // 2. Click Star icon on video progress bar / controls
        // In H5P source: class is '.h5p-star', '.h5p-star-bar', '.h5p-control.h5p-star', or controls.$endscreensButton
        const starCandidates = Array.from(doc.querySelectorAll(
            '.h5p-star, .h5p-star-bar, .h5p-star-background, .h5p-control.h5p-star, .h5p-controls .h5p-star, .h5p-control, .h5p-controls button, .h5p-seekbar-interaction, [class*="star"], [class*="endscreen"], button[aria-label*="Submit screen"], button[aria-label*="summary"], [data-index="endscreen"]'
        ));

        let starClicked = false;
        for (const b of starCandidates) {
            const cls = (b.className || '').toLowerCase();
            const aria = (b.getAttribute('aria-label') || b.getAttribute('title') || '').toLowerCase();
            if (
                cls.includes('h5p-star') ||
                cls.includes('star') ||
                cls.includes('endscreen') ||
                cls.includes('summary') ||
                aria.includes('star') ||
                aria.includes('summary') ||
                aria.includes('submit screen')
            ) {
                L('🌟 Found Star element on player bar — clicking!', 's');
                fireClick(b);
                starClicked = true;
                await wait(CFG.D_MED);
                break;
            }
        }

        if (!starClicked) {
            const allBtns = Array.from(doc.querySelectorAll('.h5p-controls button, .h5p-control-bar button, .h5p-controls div, .h5p-seekbar *'));
            for (const b of allBtns) {
                const html = (b.outerHTML || '').toLowerCase();
                if (html.includes('star') || html.includes('endscreen') || html.includes('polygon') || html.includes('submit screen')) {
                    L('🌟 Clicked star element by icon signature', 's');
                    fireClick(b);
                    await wait(CFG.D_MED);
                    break;
                }
            }
        }

        // 3. Click "Submit Answers" button in the summary/endcard modal
        await wait(CFG.D_SHORT);
        let submitted = false;

        // Try direct handleSubmit call on endscreen instance first
        try {
            if (win.H5P && win.H5P.instances) {
                win.H5P.instances.forEach(inst => {
                    const iv = inst.interactiveVideo || inst;
                    if (iv.endscreen && typeof iv.endscreen.handleSubmit === 'function') {
                        iv.endscreen.handleSubmit();
                        L('✅ Invoked iv.endscreen.handleSubmit() directly!', 's');
                        submitted = true;
                    }
                    if (typeof iv.setUserSubmitted === 'function') {
                        iv.setUserSubmitted(true);
                    }
                });
            }
        } catch (e) {}

        try {
            await callBridge('H5P_INSTANCE_ACTION', { cmd: 'SUBMIT_ENDSCREEN' });
        } catch (e) {}

        for (let attempt = 0; attempt < 4; attempt++) {
            const endcardText = (doc.querySelector('.h5p-endcard, .h5p-summary, .h5p-interactive-video')?.textContent || doc.body.textContent || '').toLowerCase();
            if (endcardText.includes('your answers have been submitted')) {
                L('✅ Answers confirmed submitted: "Your answers have been submitted!"', 's');
                submitted = true;
                break;
            }

            const submitBtns = Array.from(doc.querySelectorAll('button, .h5p-joubelui-button, a, .h5p-endcard-submit-button, [role="button"], input[type="submit"], [class*="submit-button"]'));
            for (const b of submitBtns) {
                const t = (b.textContent || b.innerText || b.value || '').trim().toLowerCase();
                const cls = (b.className || '').toLowerCase();
                if (
                    t.includes('submit answer') ||
                    (t.includes('submit') && !t.includes('grade') && !t.includes('feedback') && !t.includes('finish')) ||
                    cls.includes('endcard-submit-button') ||
                    cls.includes('submit-answers') ||
                    cls.includes('submit-button')
                ) {
                    if (b.offsetParent !== null || b.getClientRects().length > 0) {
                        L('✅ Successfully Clicked [Submit Answers] button!', 's');
                        fireClick(b);
                        submitted = true;
                        await wait(CFG.D_MED);
                        break;
                    }
                }
            }
            if (submitted) break;
            await wait(1000);
        }

        // 4. Close endcard if 'x' close button is present
        const closeX = doc.querySelector('.h5p-endcard-close, .h5p-close-button, .h5p-endcard .h5p-icon-close, [aria-label="Close"]');
        if (closeX && closeX.offsetParent !== null) {
            fireClick(closeX);
            await wait(600);
        }

        // 5. Click "Click to here enable the Next Video" button
        await clickEnableNextVideo(doc);
    }

    async function clickEnableNextVideo(iframeDoc) {
        L('🔍 Looking for "Click to here enable the Next Video" button...', 'i');
        for (const root of [iframeDoc, document]) {
            if (!root) continue;
            const links = Array.from(root.querySelectorAll('a, button, div[role="button"], span, p'));
            for (const el of links) {
                const t = (el.textContent || el.innerText || '').trim().toLowerCase();
                if (t.includes('enable the next video') || t.includes('enable next')) {
                    const target = el.closest('a') || el.closest('button') || el;
                    L('🔗 Clicked "Click to here enable the Next Video" button!', 's');
                    fireClick(target);
                    await wait(CFG.D_MED);
                    return;
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════
    //  MOODLE STANDALONE QUIZ AUTOMATION (/mod/quiz/*)
    // ═══════════════════════════════════════════════════

    // 1. /mod/quiz/view.php -> Click "Attempt quiz" / "Re-attempt quiz"
    async function handleQuizViewPage() {
        L('📝 On Quiz Start page — looking for Attempt Quiz button...', 'i');
        S('Attempting Quiz...');
        await wait(1500);

        const attemptButtons = Array.from(document.querySelectorAll('button, input[type="submit"], a.btn'));
        for (const b of attemptButtons) {
            const txt = (b.textContent || b.value || '').trim().toLowerCase();
            if (txt.includes('attempt quiz') || txt.includes('re-attempt quiz') || txt.includes('continue the last attempt')) {
                L(`🎯 Clicked "${txt}"!`, 's');
                fireClick(b);
                return true;
            }
        }

        L('No Attempt Quiz button found — checking if already completed', 'w');
        return false;
    }

    // 2. /mod/quiz/attempt.php -> Solve all questions on current page and proceed
    async function handleQuizAttemptPage() {
        L('🧠 On Quiz Attempt page — answering questions with AI...', 's');
        S('Solving Quiz Questions...');
        await wait(2000);

        const questionBlocks = Array.from(document.querySelectorAll('.que.multichoice, .que'));
        L(`Found ${questionBlocks.length} question(s) on this page`, 'i');

        for (let i = 0; i < questionBlocks.length; i++) {
            chk();
            const qBlock = questionBlocks[i];

            // Extract question text
            const qtextEl = qBlock.querySelector('.qtext, .formulation .qtext');
            const questionText = qtextEl ? cleanText(qtextEl.textContent) : `Question ${i + 1}`;

            // Extract answer options
            const answerContainer = qBlock.querySelector('.answer');
            if (!answerContainer) continue;

            const optionRows = Array.from(answerContainer.querySelectorAll('.r0, .r1, div[data-region="answer-label"], label'));
            const options = [];
            const nodesToClick = [];

            optionRows.forEach(row => {
                const label = row.querySelector('label') || row;
                const text = cleanText(label.textContent).replace(/^[a-z0-9][\.\)]\s*/i, '');
                if (text && !options.includes(text)) {
                    options.push(text);
                    const radio = row.querySelector('input[type="radio"], input[type="checkbox"]');
                    nodesToClick.push(radio || label);
                }
            });

            if (options.length === 0) continue;

            L(`Q${i + 1}: "${questionText.substring(0, 50)}..." (${options.length} options)`, 'i');
            const chosen = await solveQuestion(questionText, options);
            const chosenIdx = options.findIndex(o => cleanText(o) === cleanText(chosen));

            if (chosenIdx >= 0 && nodesToClick[chosenIdx]) {
                const targetNode = nodesToClick[chosenIdx];
                if (targetNode.tagName === 'INPUT') {
                    targetNode.checked = true;
                    targetNode.dispatchEvent(new Event('change', { bubbles: true }));
                }
                fireClick(targetNode);
                L(`  → Selected: "${options[chosenIdx].substring(0, 40)}..."`, 's');
                await wait(600);
            }
        }

        // Click "Next page" or "Finish attempt ..."
        await wait(1500);
        const submitNavBtns = Array.from(document.querySelectorAll('input[type="submit"], button[type="submit"], .mod_quiz-next-nav'));
        for (const b of submitNavBtns) {
            const val = (b.value || b.textContent || '').trim().toLowerCase();
            if (val.includes('finish attempt') || val.includes('next page') || val.includes('next')) {
                L(`➡️ Clicking navigation: "${val}"`, 's');
                fireClick(b);
                return;
            }
        }
    }

    // 3. /mod/quiz/summary.php -> Click "Submit all and finish" and confirm
    async function handleQuizSummaryPage() {
        L('📑 On Quiz Summary page — preparing to submit all and finish...', 'i');
        S('Submitting Quiz...');
        await wait(2000);

        const finishBtns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
        for (const b of finishBtns) {
            const val = (b.value || b.textContent || '').trim().toLowerCase();
            if (val.includes('submit all and finish')) {
                L('🚀 Clicked [Submit all and finish]!', 's');
                fireClick(b);
                break;
            }
        }

        await wait(1500);

        const modalBtns = Array.from(document.querySelectorAll('.modal-dialog button, .moodle-dialogue button, button.btn-primary, input[value*="Submit all and finish"]'));
        for (const mb of modalBtns) {
            const txt = (mb.textContent || mb.value || '').trim().toLowerCase();
            if (txt.includes('submit all and finish') || txt === 'submit') {
                if (mb.offsetParent !== null || mb.getClientRects().length > 0) {
                    L('✅ Confirmed submission in modal dialog!', 's');
                    fireClick(mb);
                    await wait(3000);
                    return;
                }
            }
        }
    }

    // 4. /mod/quiz/review.php -> Click "Finish review" and return to course
    async function handleQuizReviewPage() {
        L('🎉 Quiz completed and graded! Returning to course overview...', 's');
        S('Quiz completed! Returning to course...');
        await wait(2500);

        const finishReviewBtns = Array.from(document.querySelectorAll('a, button'));
        for (const b of finishReviewBtns) {
            const txt = (b.textContent || '').trim().toLowerCase();
            if (txt.includes('finish review')) {
                fireClick(b);
                await wait(2000);
                break;
            }
        }

        location.href = `${CFG.BASE}/course/view.php?id=${CFG.COURSE_ID}`;
    }

    // ═══════════════════════════════════════════════════
    //  FIND NEXT INCOMPLETE MODULE (H5P VIDEOS + QUIZZES)
    // ═══════════════════════════════════════════════════
    function getIncompleteModules() {
        const incomplete = [];
        const activities = document.querySelectorAll('li.activity[data-for="cmitem"]');

        activities.forEach(act => {
            const link = act.querySelector('a[href*="/mod/hvp/view.php"], a[href*="/mod/quiz/view.php"]');
            if (!link) return;

            const nameEl = act.querySelector('.instancename') || act.querySelector('.activityname');
            const name = (nameEl ? nameEl.textContent : 'Unknown').replace(/Interactive Content/g, '').trim();
            const url = link.href;

            // Skip Introduction Video (Module 918)
            if (name.toLowerCase().includes('introduction video') || url.includes('id=918')) {
                return;
            }

            const completionBtn = act.querySelector('button[data-for="dropdowndialog_button"]');
            const isDone = completionBtn && (
                completionBtn.classList.contains('btn-success') ||
                completionBtn.textContent.includes('Done') ||
                !!completionBtn.querySelector('.fa-check')
            );

            const textContent = act.textContent || '';
            const isLocked = textContent.includes('Not available unless') ||
                             act.classList.contains('dimmed') ||
                             !!act.querySelector('.dimmed_text, .isrestricted');

            const isQuiz = url.includes('/mod/quiz/');

            if (!isDone) {
                incomplete.push({ name, url, isLocked, isQuiz, id: act.getAttribute('data-id') });
            }
        });

        return incomplete;
    }

    // ═══════════════════════════════════════════════════
    //  ORCHESTRATOR
    // ═══════════════════════════════════════════════════
    async function run() {
        if (running) return;
        running = true;
        stopped = false;
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.textContent = '▶ RUNNING';
        }
        if (stopBtn) stopBtn.disabled = false;

        try {
            const url = location.href;

            // Case 1: On /my/courses.php -> Enter course
            if (url.includes('/my/courses.php') || url.includes('/my/index.php') || url.endsWith('/my/')) {
                L('📚 On My Courses page — finding CIDCOM course...', 'i');
                S('Entering CIDCOM course...');
                await wait(1200);

                const courseLink = document.querySelector('a[href*="/course/view.php?id="]');
                if (courseLink) {
                    location.href = courseLink.href;
                } else {
                    location.href = `${CFG.BASE}/course/view.php?id=${CFG.COURSE_ID}`;
                }
                return;
            }

            // Case 2: On /course/view.php -> Pick next incomplete module (Video or Quiz)
            if (url.includes('/course/view.php')) {
                L('📋 On Course View — scanning modules and quizzes...', 'i');
                S('Finding next incomplete module/quiz...');
                await wait(1500);

                const incomplete = getIncompleteModules();
                L(`Found ${incomplete.length} remaining incomplete module(s)/quiz(zes)`, incomplete.length > 0 ? 'i' : 's');

                const next = incomplete.find(m => !m.isLocked);

                if (!next) {
                    if (incomplete.length > 0) {
                        L(`⚠ Next module is locked: "${incomplete[0].name}". Prerequisite score needed!`, 'w');
                        S('Module locked');
                    } else {
                        L('🎉 All course video modules & quizzes are 100% completed!', 's');
                        S('All modules completed!');
                    }
                    running = false;
                    if (startBtn) {
                        startBtn.disabled = false;
                        startBtn.textContent = '▶ START';
                    }
                    return;
                }

                L(`🎯 Next to complete: "${next.name}" (${next.isQuiz ? 'Quiz' : 'Video'})`, 's');
                S(`Starting: ${next.name}`);
                await wait(1500);
                location.href = next.url;
                return;
            }

            // Case 3: On /mod/hvp/view.php -> Interactive video & quiz
            if (url.includes('/mod/hvp/view.php')) {
                L('📹 On Video Module page — starting completion pipeline', 's');
                S('Processing video...');

                cachedAnswersMap = await extractH5PAnswers();

                const ctx = await waitForH5PLoad();
                if (!ctx || !ctx.doc) {
                    L('❌ Could not load H5P video iframe', 'e');
                    running = false;
                    if (startBtn) startBtn.disabled = false;
                    return;
                }

                chk();
                await seekToEnd(ctx);

                chk();
                await answerAllQuizzes(ctx);

                chk();
                await submitModule(ctx);

                L('✅ Module completed! Returning to course overview in 3s...', 's');
                S('Returning to course...');
                await wait(3000);
                location.href = `${CFG.BASE}/course/view.php?id=${CFG.COURSE_ID}`;
                return;
            }

            // Case 4: On Moodle Quiz Pages (/mod/quiz/*)
            if (url.includes('/mod/quiz/view.php')) {
                await handleQuizViewPage();
                return;
            }

            if (url.includes('/mod/quiz/attempt.php')) {
                await handleQuizAttemptPage();
                return;
            }

            if (url.includes('/mod/quiz/summary.php')) {
                await handleQuizSummaryPage();
                return;
            }

            if (url.includes('/mod/quiz/review.php')) {
                await handleQuizReviewPage();
                return;
            }

        } catch (e) {
            if (e.message === 'USER_STOP') {
                L('⏹ Stopped by user', 'w');
            } else {
                L(`❌ Error: ${e.message}`, 'e');
                console.error(e);
            }
        }

        running = false;
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.textContent = '▶ START';
        }
        if (stopBtn) stopBtn.disabled = true;
    }

    function init() {
        chrome.storage.local.get(['gemini_api_key', 'course_id', 'auto_start', 'solver_mode'], (res) => {
            if (res.gemini_api_key) CFG.API_KEY = res.gemini_api_key;
            if (res.course_id) CFG.COURSE_ID = res.course_id;
            if (res.auto_start !== undefined) CFG.AUTO_START = res.auto_start;
            if (res.solver_mode) CFG.SOLVER_MODE = res.solver_mode;

            buildUI();
            L(`Swayam Auto v6.1 ready [${CFG.SOLVER_MODE === 'algo' ? '⚡ Fast Algorithm Mode' : '🤖 AI Mode'}] ✓`, 's');

            if (CFG.AUTO_START) {
                let secondsLeft = 3;
                S(`Auto-starting in ${secondsLeft}s (click PAUSE to stop)...`);

                countdownTimer = setInterval(() => {
                    secondsLeft--;
                    if (secondsLeft > 0) {
                        S(`Auto-starting in ${secondsLeft}s...`);
                    } else {
                        clearInterval(countdownTimer);
                        if (!stopped) run();
                    }
                }, 1000);
            } else {
                S('Ready — click START');
            }
        });
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})();
