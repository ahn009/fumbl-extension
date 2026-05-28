// gmail-inject.js — content script. Watches Gmail compose windows, injects
// the Fumbl toolbar, runs the humanize flow, shows preview/undo/toasts.
//
// Privacy: never store email text outside chrome.storage.local (used only
// for the user's own undo). No telemetry, no DOM scraping for analytics.

(() => {
  'use strict';

  const COMPOSE_BODY_SELECTOR   = '.aDh';   // Gmail compose container
  const COMPOSE_FOOTER_SELECTOR = '.btC';   // Gmail compose footer (Send row)
  const EDITABLE_SELECTOR       = '[contenteditable="true"]';
  const TOOLBAR_FLAG            = 'data-fumbl-injected';
  const DEFAULT_MODE            = 'subtle';

  // ---------------------------------------------------------------------------
  // Toolbar build + injection
  // ---------------------------------------------------------------------------

  function buildToolbar() {
    const wrap = document.createElement('div');
    wrap.id = 'fumbl-toolbar';
    wrap.innerHTML = `
      <span class="fumbl-logo">fumbl</span>
      <div class="fumbl-modes" role="tablist">
        <button class="mode-btn" data-mode="subtle" type="button">Subtle</button>
        <button class="mode-btn" data-mode="human"  type="button">Human</button>
        <button class="mode-btn" data-mode="ceo"    type="button">CEO</button>
      </div>
      <button class="fumbl-run" type="button">Fumbl it</button>
      <button class="fumbl-undo" type="button" hidden title="Undo last rewrite">Undo</button>
      <span class="fumbl-count" aria-live="polite"></span>
    `;
    return wrap;
  }

  async function injectToolbar(composeContainer) {
    if (composeContainer.getAttribute(TOOLBAR_FLAG) === '1') return;
    composeContainer.setAttribute(TOOLBAR_FLAG, '1');

    const toolbar = buildToolbar();
    const footer = composeContainer.querySelector(COMPOSE_FOOTER_SELECTOR);
    if (footer) {
      footer.appendChild(toolbar);
    } else {
      // Fallback: place after the compose body itself.
      composeContainer.appendChild(toolbar);
    }

    // Restore preferred mode.
    const { preferredMode } = await chrome.storage.local.get(['preferredMode']);
    setActiveMode(toolbar, preferredMode || DEFAULT_MODE);

    // Mode buttons.
    toolbar.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = btn.getAttribute('data-mode');
        setActiveMode(toolbar, m);
        chrome.storage.local.set({ preferredMode: m });
      });
    });

    // Run button.
    const runBtn = toolbar.querySelector('.fumbl-run');
    runBtn.addEventListener('click', () => runHumanize(composeContainer, toolbar));

    // Undo button.
    const undoBtn = toolbar.querySelector('.fumbl-undo');
    undoBtn.addEventListener('click', () => restoreOriginal(composeContainer, toolbar));

    // Show last_original undo if it exists from a prior run.
    const { last_original } = await chrome.storage.local.get(['last_original']);
    if (last_original?.text) undoBtn.hidden = false;

    updateCount(toolbar);
  }

  function setActiveMode(toolbar, mode) {
    toolbar.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-mode') === mode);
    });
  }

  function getActiveMode(toolbar) {
    return toolbar.querySelector('.mode-btn.active')?.getAttribute('data-mode') || DEFAULT_MODE;
  }

  // ---------------------------------------------------------------------------
  // Mutation observer
  // ---------------------------------------------------------------------------

  const observer = new MutationObserver(() => {
    document.querySelectorAll(COMPOSE_BODY_SELECTOR).forEach(node => {
      if (node.getAttribute(TOOLBAR_FLAG) !== '1') injectToolbar(node);
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Catch composes already on the page.
  document.querySelectorAll(COMPOSE_BODY_SELECTOR).forEach(injectToolbar);

  // ---------------------------------------------------------------------------
  // Humanize flow
  // ---------------------------------------------------------------------------

  async function runHumanize(composeContainer, toolbar, opts = {}) {
    const editable = composeContainer.querySelector(EDITABLE_SELECTOR);
    if (!editable) return;

    // Use selection if it exists inside the compose body, else full body text.
    const sel = window.getSelection();
    let text = '';
    let useSelection = false;
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (editable.contains(range.commonAncestorContainer) && !range.collapsed) {
        text = sel.toString();
        useSelection = true;
      }
    }
    if (!text) text = editable.innerText.trim();
    if (!text) {
      showToast('No text to humanize.', 'warn');
      return;
    }

    const mode = getActiveMode(toolbar);
    const sync = await chrome.storage.sync.get(['voiceProfile']);
    const voiceProfile = sync.voiceProfile || null;

    // Save original for undo BEFORE sending. Stored locally only.
    const originalSnapshot = editable.innerText;
    const stamp = Date.now();
    await chrome.storage.local.set({
      ['undo_' + stamp]: { text: originalSnapshot, timestamp: stamp },
      last_original: { text: originalSnapshot, timestamp: stamp },
    });

    const runBtn = toolbar.querySelector('.fumbl-run');
    const originalLabel = runBtn.textContent;
    runBtn.dataset.loading = 'true';
    runBtn.textContent = '…';
    runBtn.disabled = true;

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'HUMANIZE',
        text,
        mode,
        voiceProfile,
        force: opts.force === true,
      });

      if (!resp) {
        showToast('No response from background.', 'error');
        return;
      }

      if (resp.error === 'LIMIT_REACHED') {
        showToast('Daily free limit reached. Upgrade to Pro for unlimited rewrites.', 'warn', {
          label: 'Go Pro',
          action: () => chrome.runtime.sendMessage({ type: 'OPEN_UPGRADE' }),
        });
        return;
      }
      if (resp.error) {
        showToast(`Fumbl error: ${resp.error}`, 'error');
        return;
      }
      if (resp.warning === 'SENSITIVE_EMAIL') {
        showToast(
          `Tone Guard: this looks like a ${resp.emailType.toLowerCase()} email. Apply anyway?`,
          'warn',
          {
            label: 'Apply anyway',
            action: () => runHumanize(composeContainer, toolbar, { force: true }),
          },
        );
        return;
      }
      if (resp.result) {
        showPreview({
          original: useSelection ? text : originalSnapshot,
          rewritten: resp.result,
          editable,
          useSelection,
          toolbar,
        });
      }
    } catch (e) {
      showToast(`Fumbl error: ${e.message}`, 'error');
    } finally {
      runBtn.dataset.loading = 'false';
      runBtn.disabled = false;
      runBtn.textContent = originalLabel;
      updateCount(toolbar);
    }
  }

  // ---------------------------------------------------------------------------
  // Preview modal + diff
  // ---------------------------------------------------------------------------

  function splitSentences(s) {
    return s.split(/(?<=[.!?])\s+/).filter(Boolean);
  }

  function diffSentences(a, b) {
    // Lightweight LCS-by-sentence diff. Good enough for visual highlight.
    const A = splitSentences(a);
    const B = splitSentences(b);
    const m = A.length, n = B.length;
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const left = [], right = [];
    let i = 0, j = 0;
    while (i < m && j < n) {
      if (A[i] === B[j]) {
        left.push({ kind: 'same', s: A[i] });
        right.push({ kind: 'same', s: B[j] });
        i++; j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        left.push({ kind: 'rm', s: A[i] }); i++;
      } else {
        right.push({ kind: 'add', s: B[j] }); j++;
      }
    }
    while (i < m) left.push({ kind: 'rm', s: A[i++] });
    while (j < n) right.push({ kind: 'add', s: B[j++] });
    return { left, right };
  }

  function escapeHTML(s) {
    return s.replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function renderDiffSide(parts, side) {
    const cls = side === 'left' ? 'fumbl-diff-removed' : 'fumbl-diff-added';
    return parts.map(p => {
      const html = escapeHTML(p.s);
      if (p.kind === 'rm' || p.kind === 'add') return `<span class="${cls}">${html}</span>`;
      return html;
    }).join(' ');
  }

  function showPreview({ original, rewritten, editable, useSelection, toolbar }) {
    const { left, right } = diffSentences(original, rewritten);

    const overlay = document.createElement('div');
    overlay.className = 'fumbl-preview-overlay';
    overlay.innerHTML = `
      <div class="fumbl-preview" role="dialog" aria-label="Fumbl preview">
        <div class="fumbl-preview__header">
          <div class="fumbl-preview__title">Preview rewrite</div>
          <button class="fumbl-preview__close" type="button" aria-label="Close">×</button>
        </div>
        <div class="fumbl-preview__panes">
          <div class="fumbl-preview__pane">
            <h4>Original</h4>
            <div>${renderDiffSide(left, 'left')}</div>
          </div>
          <div class="fumbl-preview__pane">
            <h4>Rewritten</h4>
            <div>${renderDiffSide(right, 'right')}</div>
          </div>
        </div>
        <div class="fumbl-preview__footer">
          <button class="fumbl-preview__btn fumbl-preview__btn--ghost" data-action="reject" type="button">Reject</button>
          <button class="fumbl-preview__btn" data-action="accept" type="button">Accept</button>
          <button class="fumbl-preview__btn fumbl-preview__btn--primary" data-action="accept-close" type="button">Accept &amp; close</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    overlay.querySelector('.fumbl-preview__close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        if (action === 'reject') { close(); return; }

        applyRewriteToEditable(editable, original, rewritten, useSelection);

        // Show undo button now that we've applied a change.
        toolbar?.querySelector('.fumbl-undo')?.removeAttribute('hidden');

        close();
      });
    });
  }

  function applyRewriteToEditable(editable, original, rewritten, useSelection) {
    editable.focus();

    if (useSelection) {
      // Selection should still be valid; replace it.
      try {
        document.execCommand('insertText', false, rewritten);
      } catch {
        replaceFullEditable(editable, rewritten);
      }
    } else {
      replaceFullEditable(editable, rewritten);
    }
    editable.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function replaceFullEditable(editable, newText) {
    // Select all content, then insert. Avoids innerHTML per CLAUDE.md rule.
    const range = document.createRange();
    range.selectNodeContents(editable);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('insertText', false, newText);
  }

  // ---------------------------------------------------------------------------
  // Undo
  // ---------------------------------------------------------------------------

  async function restoreOriginal(composeContainer, toolbar) {
    const { last_original } = await chrome.storage.local.get(['last_original']);
    if (!last_original?.text) {
      showToast('Nothing to undo.', 'warn');
      return;
    }
    const editable = composeContainer.querySelector(EDITABLE_SELECTOR);
    if (!editable) return;
    editable.focus();
    replaceFullEditable(editable, last_original.text);
    editable.dispatchEvent(new Event('input', { bubbles: true }));
    showToast('Restored!');
    toolbar?.querySelector('.fumbl-undo')?.setAttribute('hidden', '');
  }

  // ---------------------------------------------------------------------------
  // Usage count
  // ---------------------------------------------------------------------------

  async function updateCount(toolbar) {
    const span = toolbar.querySelector('.fumbl-count');
    if (!span) return;
    const { dailyCount = 0, isPro = false } =
      await chrome.storage.local.get(['dailyCount', 'isPro']);

    if (isPro) {
      span.textContent = '∞ pro';
      span.removeAttribute('data-zero');
      return;
    }
    const left = Math.max(0, 2 - dailyCount);
    span.textContent = `${left} left today`;
    if (left === 0) span.setAttribute('data-zero', 'true');
    else span.removeAttribute('data-zero');
  }

  // ---------------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------------

  function showToast(message, kind = 'info', actionBtn = null) {
    document.querySelectorAll('.fumbl-toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = 'fumbl-toast' + (kind === 'error' ? ' fumbl-toast--error' : kind === 'warn' ? ' fumbl-toast--warn' : '');
    const span = document.createElement('span');
    span.textContent = message;
    t.appendChild(span);
    if (actionBtn) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = actionBtn.label;
      b.addEventListener('click', () => { actionBtn.action(); t.remove(); });
      t.appendChild(b);
    }
    document.body.appendChild(t);
    setTimeout(() => t.remove(), kind === 'warn' ? 8000 : 4000);
  }

  // ---------------------------------------------------------------------------
  // Right-click universal humanizer
  // ---------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg?.type !== 'CONTEXT_HUMANIZE') return;
    const sel = window.getSelection();
    const text = (msg.text || sel?.toString() || '').trim();
    if (!text) {
      showToast('Select some text first.', 'warn');
      return;
    }
    const { preferredMode } = await chrome.storage.local.get(['preferredMode']);
    const mode = preferredMode || DEFAULT_MODE;
    const { voiceProfile = null } = await chrome.storage.sync.get(['voiceProfile']);

    showToast('Humanizing selection…');

    const resp = await chrome.runtime.sendMessage({ type: 'HUMANIZE', text, mode, voiceProfile });
    if (!resp || resp.error) {
      showToast(`Fumbl error: ${resp?.error || 'unknown'}`, 'error');
      return;
    }
    if (resp.warning === 'SENSITIVE_EMAIL') {
      showToast(`Tone Guard: ${resp.emailType.toLowerCase()} email — skipped.`, 'warn');
      return;
    }
    if (resp.result) {
      // Replace current selection in any contenteditable / input / textarea.
      const active = document.activeElement;
      if (active && (active.isContentEditable || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
        try { document.execCommand('insertText', false, resp.result); }
        catch { /* fall through */ }
      } else if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(resp.result));
      }
      showToast('Done.');
    }
  });
})();
