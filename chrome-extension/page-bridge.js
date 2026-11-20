// page-bridge.js - Injected directly into the page context (MAIN world)
// Communicates with content script via window.postMessage
(function () {
    'use strict';

    function simulateMouse(element) {
        if (!element) return;
        ['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click'].forEach(evtType => {
            const ev = new MouseEvent(evtType, {
                bubbles: true,
                cancelable: true,
                view: window
            });
            element.dispatchEvent(ev);
        });
    }

    window.addEventListener('message', function (event) {
        if (!event.data || event.data.source !== 'swayam-ext-content') return;

        const action = event.data.action;
        const msgId = event.data.msgId;
        const payload = event.data.payload || {};

        if (action === 'GET_H5P_DATA') {
            try {
                let h5pData = null;
                if (window.H5PIntegration && window.H5PIntegration.contents) {
                    h5pData = window.H5PIntegration.contents;
                }
                window.postMessage({
                    source: 'swayam-ext-bridge',
                    msgId: msgId,
                    success: true,
                    data: h5pData
                }, '*');
            } catch (err) {
                window.postMessage({
                    source: 'swayam-ext-bridge',
                    msgId: msgId,
                    success: false,
                    error: err.message
                }, '*');
            }
        } else if (action === 'SEEK_VIDEO') {
            try {
                let seeked = false;
                if (window.H5P && window.H5P.instances) {
                    window.H5P.instances.forEach(function (inst) {
                        const iv = inst.interactiveVideo || inst;
                        if (iv.video && typeof iv.video.getDuration === 'function') {
                            const dur = iv.video.getDuration();
                            if (dur > 0) {
                                iv.video.seek(Math.max(0, dur - 0.5));
                                seeked = true;
                                try { iv.video.play(); } catch (e) {}
                            }
                        } else if (typeof inst.seek === 'function' && typeof inst.getDuration === 'function') {
                            const dur = inst.getDuration();
                            if (dur > 0) {
                                inst.seek(Math.max(0, dur - 0.5));
                                seeked = true;
                            }
                        }
                    });
                }

                // Native videos in doc & all accessible iframes
                const videos = Array.from(document.querySelectorAll('video'));
                document.querySelectorAll('iframe').forEach(function (ifr) {
                    try {
                        if (ifr.contentDocument) {
                            ifr.contentDocument.querySelectorAll('video').forEach(function (v) { videos.push(v); });
                        }
                    } catch (e) {}
                });

                videos.forEach(function (v) {
                    if (v.duration && !isNaN(v.duration)) {
                        v.currentTime = Math.max(0, v.duration - 0.5);
                        try { v.play(); } catch (e) {}
                        v.dispatchEvent(new Event('timeupdate', { bubbles: true }));
                        v.dispatchEvent(new Event('ended', { bubbles: true }));
                        seeked = true;
                    }
                });

                window.postMessage({
                    source: 'swayam-ext-bridge',
                    msgId: msgId,
                    success: seeked
                }, '*');
            } catch (err) {
                window.postMessage({
                    source: 'swayam-ext-bridge',
                    msgId: msgId,
                    success: false,
                    error: err.message
                }, '*');
            }
        } else if (action === 'H5P_INSTANCE_ACTION') {
            try {
                let performed = false;
                const cmd = payload.cmd;
                if (window.H5P && window.H5P.instances) {
                    window.H5P.instances.forEach(function (inst) {
                        const iv = inst.interactiveVideo || inst;
                        if (cmd === 'SHOW_ENDSCREEN') {
                            if (typeof iv.showEndscreen === 'function') { iv.showEndscreen(); performed = true; }
                            else if (typeof iv.showSummary === 'function') { iv.showSummary(); performed = true; }
                            if (iv.endscreens) {
                                iv.endscreens.forEach(es => { if (typeof es.show === 'function') { es.show(); performed = true; } });
                            }
                        } else if (cmd === 'TRIGGER_INTERACTIONS_CHECK') {
                            if (iv.interactions) {
                                iv.interactions.forEach(inter => {
                                    const mInst = inter.instance;
                                    if (mInst) {
                                        if (typeof mInst.checkAnswer === 'function') { mInst.checkAnswer(); performed = true; }
                                    }
                                });
                            }
                        }
                    });
                }
                window.postMessage({
                    source: 'swayam-ext-bridge',
                    msgId: msgId,
                    success: performed
                }, '*');
            } catch (err) {
                window.postMessage({
                    source: 'swayam-ext-bridge',
                    msgId: msgId,
                    success: false,
                    error: err.message
                }, '*');
            }
        }
    });

    console.log('[SwayamAuto] Enhanced page bridge initialized.');
})();
