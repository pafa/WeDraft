// Constant trusted code only; article text is never interpolated into JavaScript.
export const PREVIEW_COPY_SCRIPT = `(() => {
  const button = document.getElementById('wedraft-copy');
  const body = document.getElementById('wedraft-body');
  const status = document.getElementById('wedraft-copy-status');
  if (!button || button.disabled) return;
  const html = body.innerHTML;
  const text = document.getElementById('wedraft-plain-text').textContent;
  function fallback() {
    let copied = false;
    const onCopy = event => {
      if (!event.clipboardData) return;
      event.preventDefault();
      event.clipboardData.setData('text/html', html);
      event.clipboardData.setData('text/plain', text);
      copied = true;
    };
    document.addEventListener('copy', onCopy);
    try { return document.execCommand('copy') && copied; }
    finally { document.removeEventListener('copy', onCopy); }
  }
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      let copied = false;
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' })
          })]);
          copied = true;
        } catch { /* Local files or browser permissions may require the copy event. */ }
      }
      if (!copied) copied = fallback();
      status.textContent = copied ? '正文排版已复制，可粘贴到微信编辑器。标题请单独填写。' : '浏览器未允许复制。请选中下方正文手动复制，或将文章包导入 WeDraft 网页复制。';
    } catch { status.textContent = '复制未成功。请将文章包导入 WeDraft 网页后复制。'; }
    finally { button.disabled = false; }
  });
})();`;

// Verified against the exact script bytes by core tests.
export const PREVIEW_COPY_CSP_HASH = 'sha256-dLIchCEKmWWNGoVF18ROnrBkrb30W6JzFdiM84oD+9k=';
