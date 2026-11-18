// ==UserScript==
// @name         Swayam Plus Auto-Complete (CIDCOM)
// @namespace    https://swayam-plus-lms.iitmpravartak.org.in/
// @version      4.0
// @description  Fully automatic Swayam Plus course completion: auto-detects incomplete modules, seeks video to end, solves quizzes with Gemini 2.5 Flash, submits, and advances.
// @match        https://swayam-plus-lms.iitmpravartak.org.in/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      generativelanguage.googleapis.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════
    //  CONFIGURATION
    // ═══════════════════════════════════════════════════
    const CFG = {
        API_KEY: GM_getValue('gemini_api_key', ''), // Paste your Gemini API key in the UI panel or here
        MODEL: 'gemini-2.5-flash',
        COURSE_ID: 20,
        BASE: 'https://swayam-plus-lms.iitmpravartak.org.in',
        AUTO_START_DELAY: 3, // countdown seconds before auto-starting
        D_SHORT: 1200,
        D_MED: 2500,
        D_SEEK: 3500,
        D_QUIZ: 2000,
    };

    // ═══════════════════════════════════════════════════
    //  UI PANEL & LOGGER
    // ═══════════════════════════════════════════════════
    let logEl, startBtn, stopBtn, apiInput, statusEl, countdownTimer;
    let running = false, stopped = false;

    function buildUI() {
        if (document.getElementById('sa-panel')) return;

        const d = document.createElement('div');
        d.id = 'sa-panel';
        d.innerHTML = `
        <style>
            #sa-panel {
                position: fixed; top: 12px; right: 12px; z-index: 9999999; width: 410px;
                background: #14142b; color: #e4e4eb; border: 2px solid #6c5ce7; border-radius: 12px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 13px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); line-height: 1.4;
            }
            #sa-panel.min { width: 220px; }
            #sa-panel.min .sa-body { display: none; }
            .sa-hdr {
                background: linear-gradient(135deg, #6c5ce7, #0984e3); padding: 10px 14px;
                border-radius: 10px 10px 0 0; display: flex; justify-content: space-between;
                align-items: center; cursor: move; user-select: none;
            }
            .sa-hdr h3 { margin: 0; font-size: 13px; font-weight: 700; color: #fff; letter-spacing: 0.5px; }
            .sa-body { padding: 12px; }
            .sa-row { margin-bottom: 8px; display: flex; gap: 6px; align-items: center; }
            .sa-row label { width: 68px; font-weight: 600; color: #a4b0be; font-size: 11px; text-transform: uppercase; }
            .sa-row input {
                flex: 1; padding: 6px 10px; border: 1px solid #2f3542; border-radius: 6px;
                background: #1e1e38; color: #f1f2f6; font-size: 12px; outline: none;
            }
            .sa-row input:focus { border-color: #6c5ce7; }
            .sa-btn {
                padding: 7px 16px; border: none; border-radius: 6px; cursor: pointer;
                font-weight: 700; font-size: 12px; transition: all 0.2s;
            }
            .sa-go { background: #00b894; color: #fff; }
            .sa-go:hover { background: #00a884; }
            .sa-st { background: #d63031; color: #fff; }
            .sa-st:hover { background: #c02627; }
            .sa-mn { background: none; border: none; color: #fff; cursor: pointer; font-size: 18px; padding: 0 4px; }
            #sa-log {
                max-height: 220px; overflow-y: auto; background: #0a0a16; border: 1px solid #232342;
                border-radius: 6px; padding: 8px; font-size: 11px; line-height: 1.6; margin-top: 8px;
                font-family: 'Cascadia Code', 'Consolas', monospace;
            }
            #sa-status {
                padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;
                background: #1e1e38; color: #ffeaa7; margin-top: 6px; text-align: center;
                border-left: 3px solid #fdcb6e;
            }
            .li { color: #74b9ff; }
            .ls { color: #55efc4; font-weight: 600; }
            .lw { color: #ffeaa7; }
            .le { color: #ff7675; font-weight: 600; }
        </style>
        <div class="sa-hdr" id="sa-drag">
            <h3>⚡ SWAYAM AUTO v4</h3>
            <button class="sa-mn" id="sa-min">─</button>
        </div>
        <div class="sa-body">
            <div class="sa-row">
                <label>Gemini Key</label>
                <input type="password" id="sa-key" value="${CFG.API_KEY}">
            </div>
            <div class="sa-row" style="justify-content:center; gap:10px;">
                <button class="sa-btn sa-go" id="sa-start">▶ RUNNING</button>
                <button class="sa-btn sa-st" id="sa-stop">■ PAUSE</button>
            </div>
            <div id="sa-status">Initializing...</div>
            <div id="sa-log"></div>
        </div>`;
        document.body.appendChild(d);

        logEl    = document.getElementById('sa-log');
        startBtn = document.getElementById('sa-start');
        stopBtn  = document.getElementById('sa-stop');
        apiInput = document.getElementById('sa-key');
        statusEl = document.getElementById('sa-status');

        document.getElementById('sa-min').onclick = () => d.classList.toggle('min');
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
            GM_setValue('gemini_api_key', CFG.API_KEY);
            L('🔑 Gemini API key updated', 's');
        };

        // Drag handler
        let ox, oy, dr = false;
        const h = document.getElementById('sa-drag');
        h.onmousedown = e => { dr = true; ox = e.clientX - d.getBoundingClientRect().left; oy = e.clientY - d.getBoundingClientRect().top; e.preventDefault(); };
        document.onmousemove = e => { if (!dr) return; d.style.left = (e.clientX - ox) + 'px'; d.style.top = (e.clientY - oy) + 'px'; d.style.right = 'auto'; };
        document.onmouseup = () => dr = false;
    }

    function L(msg, t = 'i') {
        if (!logEl) return;
        const cls = { i: 'li', s: 'ls', w: 'lw', e: 'le' }[t] || 'li';
        const ln = document.createElement('div');
        ln.className = cls;
        ln.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logEl.appendChild(ln);
        logEl.scrollTop = logEl.scrollHeight;
        console.log('[SwayamAuto]', msg);
    }

    function S(msg) {
        if (statusEl) statusEl.textContent = msg;
    }

    const wait = ms => new Promise(r => setTimeout(r, ms));
    function chk() { if (stopped) throw new Error('USER_STOP'); }

    // ═══════════════════════════════════════════════════
    //  GEMINI API SOLVER (Using gemini-2.5-flash)
    // ═══════════════════════════════════════════════════
    function solveWithGemini(question, options) {
        return new Promise(resolve => {
            const fallback = () => {
                // Heuristic: longest answer is most frequently correct in technical multiple-choice
                const longest = options.reduce((a, b) => a.length >= b.length ? a : b, '');
                L(`Using longest-choice heuristic: "${longest.substring(0, 35)}..."`, 'w');
                return longest;
            };

            if (!CFG.API_KEY) {
                L('No Gemini API key provided — fallback', 'w');
                return resolve(fallback());
            }

            const prompt = `You are taking a technical Data Center Operations, Facilities, and Infrastructure exam (CIDCOM).

Question:
${question}

Options:
${options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}

Instructions:
Respond with ONLY the single number corresponding to the correct option (e.g. "1", "2", "3", or "4"). Do not write any explanations, punctuation, or other text.`;

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${CFG.MODEL}:generateContent?key=${CFG.API_KEY}`;

            GM_xmlhttpRequest({
                method: 'POST',
                url: url,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.0, maxOutputTokens: 10 }
                }),
                timeout: 10000,
                onload(resp) {
                    try {
                        const json = JSON.parse(resp.responseText);
                        if (json.error) {
                            L(`Gemini API Error (${json.error.code}): ${json.error.message}`, 'e');
                            return resolve(fallback());
                        }
                        const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                        const match = text.match(/\d+/);
                        if (match) {
                            const idx = parseInt(match[0], 10) - 1;
                            if (idx >= 0 && idx < options.length) {
                                L(`Gemini chose Option ${idx + 1}: "${options[idx].substring(0, 45)}..."`, 's');
                                return resolve(options[idx]);
                            }
                        }
                        L(`Could not parse Gemini output "${text}" — fallback`, 'w');
                        resolve(fallback());
                    } catch (e) {
                        L(`Parse error: ${e.message}`, 'e');
                        resolve(fallback());
                    }
                },
                ontimeout() {
                    L('Gemini request timed out — fallback', 'w');
                    resolve(fallback());
                },
                onerror(err) {
                    L('Network error calling Gemini — fallback', 'w');
                    resolve(fallback());
                }
            });
        });
    }

    // ═══════════════════════════════════════════════════
    //  H5P IFRAME ACCESS
    // ═══════════════════════════════════════════════════
    function getH5PContext() {
        const iframe = document.querySelector('iframe.h5p-iframe');
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
                // Check if video element is ready
                const vid = ctx.doc.querySelector('video');
                if (vid) return ctx;
                // Or check H5P instances
                if (ctx.win.H5P && ctx.win.H5P.instances && ctx.win.H5P.instances.length > 0) return ctx;
            }
            await wait(1000);
        }
        return getH5PContext();
    }

    // ═══════════════════════════════════════════════════
    //  STEP 1: SEEK VIDEO TO END
    // ═══════════════════════════════════════════════════
    async function seekToEnd(ctx) {
        L('⏩ Dragging/seeking video to end...', 'i');
        S('Seeking to end of video...');

        // Method 1: Use H5P InteractiveVideo JavaScript API directly
        try {
            if (ctx.win.H5P && ctx.win.H5P.instances) {
                for (const inst of ctx.win.H5P.instances) {
                    const iv = inst.interactiveVideo || inst;
                    if (iv.video && iv.video.seek) {
                        const dur = iv.video.getDuration ? iv.video.getDuration() : 0;
                        if (dur > 0) {
                            iv.video.seek(dur - 0.5);
                            L(`H5P API seeked to ${(dur - 0.5).toFixed(1)}s / ${dur.toFixed(1)}s`, 's');
                            try { iv.video.play(); } catch {}
                            await wait(CFG.D_SEEK);
                            return true;
                        }
                    }
                    if (inst.seek && inst.getDuration) {
                        const dur = inst.getDuration();
                        if (dur > 0) {
                            inst.seek(dur - 0.5);
                            L(`Instance seeked to ${(dur - 0.5).toFixed(1)}s`, 's');
                            await wait(CFG.D_SEEK);
                            return true;
                        }
                    }
                }
            }
        } catch (e) {
            L(`H5P seek API: ${e.message}`, 'w');
        }

        // Method 2: Native HTML5 <video> manipulation
        const vid = ctx.doc.querySelector('video');
        if (vid) {
            if (!vid.duration || isNaN(vid.duration)) {
                await new Promise(r => { vid.onloadedmetadata = r; setTimeout(r, 4000); });
            }
            if (vid.duration && !isNaN(vid.duration)) {
                vid.currentTime = Math.max(0, vid.duration - 0.5);
                try { vid.play(); } catch {}
                L(`Native video seeked to ${(vid.duration - 0.5).toFixed(1)}s`, 's');
                await wait(CFG.D_SEEK);
                vid.dispatchEvent(new Event('timeupdate'));
                vid.dispatchEvent(new Event('ended'));
                return true;
            }
        }

        L('⚠ Could not seek video element', 'w');
        return false;
    }

    // ═══════════════════════════════════════════════════
    //  STEP 2: ANSWER 5 QUESTIONS (Quiz qp 1 to 5)
    // ═══════════════════════════════════════════════════
    async function answerAllQuizzes(ctx) {
        L('📝 Scanning for Quiz questions (Quiz qp 1 to 5)...', 'i');
        S('Locating questions...');
        await wait(CFG.D_QUIZ);

        // Find all interaction buttons
        let quizBtns = getQuizButtons(ctx.doc);
        L(`Found ${quizBtns.length} quiz interaction elements`, quizBtns.length > 0 ? 's' : 'w');

        if (quizBtns.length === 0) {
            // Trigger H5P API to show interactions if hidden
            tryShowInteractions(ctx);
            await wait(2000);
            quizBtns = getQuizButtons(ctx.doc);
        }

        for (let i = 0; i < 5; i++) {
            chk();
            quizBtns = getQuizButtons(ctx.doc);

            // Find button for question (i+1)
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
                targetBtn.click();
                await wait(CFG.D_QUIZ);

                await answerVisibleQuestion(ctx, i + 1);
                await wait(CFG.D_SHORT);
            } else {
                // If button isn't found by specific index, check if a question is already on screen
                const isQOpen = ctx.doc.querySelector('.h5p-question-content, .h5p-multichoice, .h5p-alternative-container');
                if (isQOpen) {
                    L(`\n── Answering visible question (${i + 1}) ──`, 'i');
                    await answerVisibleQuestion(ctx, i + 1);
                    await wait(CFG.D_SHORT);
                }
            }
        }
    }

    function getQuizButtons(doc) {
        const list = [];
        // H5P Interactive video interaction overlay buttons
        const selectors = [
            '.h5p-interaction-button',
            '.h5p-interaction',
            'button[class*="interaction"]',
            '.h5p-overlay-button',
            'button[aria-label*="Quiz"]',
            'button[aria-label*="qp"]'
        ];
        selectors.forEach(sel => {
            doc.querySelectorAll(sel).forEach(el => {
                if (!list.includes(el)) list.push(el);
            });
        });

        // Filter or sort so "Quiz qp 1" .. "Quiz qp 5" are in order
        list.sort((a, b) => {
            const ta = (a.textContent || a.getAttribute('aria-label') || '').toLowerCase();
            const tb = (b.textContent || b.getAttribute('aria-label') || '').toLowerCase();
            return ta.localeCompare(tb, undefined, { numeric: true });
        });

        return list;
    }

    function tryShowInteractions(ctx) {
        try {
            if (ctx.win.H5P && ctx.win.H5P.instances) {
                ctx.win.H5P.instances.forEach(inst => {
                    const iv = inst.interactiveVideo || inst;
                    if (iv.interactions) {
                        iv.interactions.forEach(inter => {
                            if (inter.show) inter.show();
                        });
                    }
                });
            }
        } catch {}
    }

    async function answerVisibleQuestion(ctx, qNum) {
        const doc = ctx.doc;

        // Extract Question Text
        const qEl = doc.querySelector('.h5p-question-content, .h5p-multichoice-title, .h5p-question-introduction, [class*="question-title"]');
        let questionText = qEl ? qEl.textContent.trim() : `Question ${qNum}`;

        // Extract Options
        const optionNodes = doc.querySelectorAll('.h5p-answer, .h5p-alternative-container li, .h5p-alternative-container label, div[role="radio"]');
        const options = [];
        const validNodes = [];

        optionNodes.forEach(node => {
            // Avoid inner duplicated label texts
            const text = (node.querySelector('.h5p-alternative-inner') || node).textContent.trim();
            if (text && !options.includes(text)) {
                options.push(text);
                validNodes.push(node);
            }
        });

        if (options.length === 0) {
            L(`Q${qNum}: No options detected — clicking check/continue`, 'w');
            await clickCheckAndProceed(doc);
            return;
        }

        L(`Q${qNum}: "${questionText.substring(0, 50)}..." (${options.length} options)`, 'i');

        // Query Gemini 2.5 Flash
        const chosenText = await solveWithGemini(questionText, options);
        const chosenIdx = options.indexOf(chosenText);

        if (chosenIdx >= 0 && validNodes[chosenIdx]) {
            validNodes[chosenIdx].click();
            const radio = validNodes[chosenIdx].querySelector('input[type="radio"], input[type="checkbox"]');
            if (radio) radio.click();
            await wait(600);
        }

        // Click "Check" and "Continue"
        await clickCheckAndProceed(doc);
    }

    async function clickCheckAndProceed(doc) {
        // 1. Click "Check"
        const checkBtns = doc.querySelectorAll('button, .h5p-joubelui-button');
        for (const b of checkBtns) {
            const t = (b.textContent || '').trim().toLowerCase();
            if (t === 'check' || t.includes('check answer')) {
                if (b.offsetParent !== null) {
                    L('  → Clicked [Check]', 'i');
                    b.click();
                    await wait(CFG.D_SHORT);
                    break;
                }
            }
        }

        // 2. Click "Continue" / "Next"
        await wait(600);
        const contBtns = doc.querySelectorAll('button, .h5p-joubelui-button');
        for (const b of contBtns) {
            const t = (b.textContent || '').trim().toLowerCase();
            if (t === 'continue' || t === 'next' || t.includes('continue')) {
                if (b.offsetParent !== null) {
                    L('  → Clicked [Continue]', 'i');
                    b.click();
                    await wait(800);
                    break;
                }
            }
        }

        // 3. Close question modal if still open
        const closeBtn = doc.querySelector('.h5p-close-button, .h5p-dialog-close, button[aria-label="Close"]');
        if (closeBtn && closeBtn.offsetParent !== null) closeBtn.click();
    }

    // ═══════════════════════════════════════════════════
    //  STEP 3: STAR / SUMMARY & SUBMIT
    // ═══════════════════════════════════════════════════
    async function submitModule(ctx) {
        L('⭐ Clicking Star icon on player bar to open summary...', 'i');
        S('Opening submit dialog...');

        const doc = ctx.doc;

        // Try API first
        try {
            if (ctx.win.H5P && ctx.win.H5P.instances) {
                ctx.win.H5P.instances.forEach(inst => {
                    const iv = inst.interactiveVideo || inst;
                    if (iv.showEndscreen) iv.showEndscreen();
                    else if (iv.showSummary) iv.showSummary();
                });
            }
        } catch {}

        await wait(2000);

        // Click the star icon button in the player control bar
        const starCandidates = doc.querySelectorAll('.h5p-control, .h5p-controls button, [class*="star"], [class*="endscreen"]');
        for (const b of starCandidates) {
            const cls = (b.className || '').toLowerCase();
            const aria = (b.getAttribute('aria-label') || b.getAttribute('title') || '').toLowerCase();
            if (cls.includes('star') || aria.includes('star') || aria.includes('summary') || aria.includes('submit')) {
                L('Clicked Star button on player bar', 'i');
                b.click();
                await wait(CFG.D_MED);
                break;
            }
        }

        // Look for the green "Submit Answers" button in the summary popup
        await wait(CFG.D_SHORT);
        const submitBtns = doc.querySelectorAll('button, .h5p-joubelui-button, a');
        for (const b of submitBtns) {
            const t = (b.textContent || '').trim().toLowerCase();
            if (t.includes('submit answer') || (t.includes('submit') && !t.includes('grade'))) {
                L('✅ Clicked [Submit Answers]!', 's');
                b.click();
                await wait(CFG.D_MED);
                break;
            }
        }

        // Click "Click to here enable the Next Video" link
        await clickEnableNextVideo(doc);
    }

    async function clickEnableNextVideo(iframeDoc) {
        for (const root of [iframeDoc, document]) {
            const links = root.querySelectorAll('a, button');
            for (const el of links) {
                const t = (el.textContent || '').trim().toLowerCase();
                if (t.includes('enable the next video') || t.includes('enable next')) {
                    L('🔗 Clicked "Click to here enable the Next Video"', 's');
                    el.click();
                    await wait(CFG.D_MED);
                    return;
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════
    //  COURSE PAGE: FIND INCOMPLETE MODULES
    // ═══════════════════════════════════════════════════
    function getIncompleteModules() {
        const incomplete = [];
        const activities = document.querySelectorAll('li.activity.modtype_hvp');

        activities.forEach(act => {
            const link = act.querySelector('a[href*="/mod/hvp/view.php"]');
            if (!link) return;

            const name = (act.querySelector('.instancename')?.textContent || 'Unknown').replace(/Interactive Content/g, '').trim();
            const url = link.href;

            // Check if Done
            const completionBtn = act.querySelector('button[data-for="dropdowndialog_button"]');
            const isDone = completionBtn && completionBtn.classList.contains('btn-success');

            // Check if Locked ("Not available unless..." or dimmed)
            const textContent = act.textContent || '';
            const isLocked = textContent.includes('Not available unless') ||
                             act.classList.contains('dimmed') ||
                             !!act.querySelector('.dimmed_text, .isrestricted');

            if (!isDone) {
                incomplete.push({ name, url, isLocked });
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
        startBtn.disabled = true;
        stopBtn.disabled = false;

        try {
            const url = location.href;

            // 1. If on /my/courses.php -> Enter course
            if (url.includes('/my/courses.php')) {
                L('📚 On My Courses page — entering CIDCOM course...', 'i');
                S('Entering course...');
                await wait(1000);
                location.href = `${CFG.BASE}/course/view.php?id=${CFG.COURSE_ID}`;
                return;
            }

            // 2. If on /course/view.php -> Find incomplete module
            if (url.includes('/course/view.php')) {
                L('📋 On Course View — scanning modules...', 'i');
                S('Finding incomplete module...');
                await wait(1500);

                const incomplete = getIncompleteModules();
                L(`Found ${incomplete.length} incomplete video module(s)`, incomplete.length > 0 ? 'i' : 's');

                const next = incomplete.find(m => !m.isLocked);

                if (!next) {
                    if (incomplete.length > 0) {
                        L(`⚠ Next module is locked: "${incomplete[0].name}". Complete prerequisites first!`, 'w');
                        S('Module locked');
                    } else {
                        L('🎉 All video modules are 100% completed!', 's');
                        S('Completed all modules!');
                    }
                    running = false;
                    startBtn.disabled = false;
                    return;
                }

                L(`🎯 Next module to complete: "${next.name}"`, 's');
                S(`Starting: ${next.name}`);
                await wait(1500);
                location.href = next.url;
                return;
            }

            // 3. If on /mod/hvp/view.php -> Execute complete video pipeline
            if (url.includes('/mod/hvp/view.php')) {
                L('📹 On Video Part page — starting automation pipeline', 's');
                S('Processing video...');

                const ctx = await waitForH5PLoad();
                if (!ctx || !ctx.doc) {
                    L('❌ Could not load H5P video iframe', 'e');
                    running = false;
                    startBtn.disabled = false;
                    return;
                }

                // Step 1: Seek
                chk();
                await seekToEnd(ctx);

                // Step 2: Answer Quizzes
                chk();
                await answerAllQuizzes(ctx);

                // Step 3: Submit Answers
                chk();
                await submitModule(ctx);

                L('✅ Module completed! Returning to course list in 3s...', 's');
                S('Returning to course...');
                await wait(3000);
                location.href = `${CFG.BASE}/course/view.php?id=${CFG.COURSE_ID}`;
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
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }

    // ═══════════════════════════════════════════════════
    //  AUTO-START WITH COUNTDOWN
    // ═══════════════════════════════════════════════════
    function init() {
        buildUI();
        L('Swayam Auto v4 initialized ✓', 's');

        let secondsLeft = CFG.AUTO_START_DELAY;
        S(`Auto-starting in ${secondsLeft}s (click PAUSE to stop)...`);

        countdownTimer = setInterval(() => {
            secondsLeft--;
            if (secondsLeft > 0) {
                S(`Auto-starting in ${secondsLeft}s...`);
            } else {
                clearInterval(countdownTimer);
                if (!stopped) {
                    run();
                }
            }
        }, 1000);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})();
