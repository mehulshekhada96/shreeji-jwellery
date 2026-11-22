import fs from 'fs';

async function main() {
  const tabsRes = await fetch('http://localhost:9222/json');
  const tabs = await tabsRes.json();
  const wsUrl = tabs[0].webSocketDebuggerUrl;
  console.log('Connecting to:', wsUrl);

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));

  let msgId = 1;
  const pending = new Map();

  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve } = pending.get(data.id);
      pending.delete(data.id);
      resolve(data.result);
    }
  });

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      pending.set(id, { resolve });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function screenshot(filename) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(res.data, 'base64');
    const path = `/Users/mehulshekhada/.gemini/antigravity/brain/b2b86074-32e9-4a20-835e-1f976246d16c/${filename}`;
    fs.writeFileSync(path, buf);
    console.log(`Saved screenshot: ${path}`);
  }

  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:3000/extract-sku' });
  await new Promise((r) => setTimeout(r, 2000));

  // 1. Click MEESHO RECONCILIATION
  await send('Runtime.evaluate', {
    expression: `
      const meeshoBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('MEESHO RECONCILIATION'));
      if (meeshoBtn) meeshoBtn.click();
    `,
    returnByValue: true
  });
  await new Promise((r) => setTimeout(r, 1500));

  // 2. Click Returns subtab
  await send('Runtime.evaluate', {
    expression: `
      const returnsTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Returns');
      if (returnsTab) returnsTab.click();
    `,
    returnByValue: true
  });
  await new Promise((r) => setTimeout(r, 2000));
  await screenshot('step1_returns_screen_with_keywords_btn.png');

  // Check what buttons exist now in the returns view
  const buttonsInView = await send('Runtime.evaluate', {
    expression: `Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean)`,
    returnByValue: true
  });
  console.log('Buttons visible in Returns tab:', buttonsInView.result.value);

  // 3. Open Return Keywords Manager Modal
  await send('Runtime.evaluate', {
    expression: `
      const kwBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Return Keywords'));
      if (kwBtn) kwBtn.click();
    `,
    returnByValue: true
  });
  await new Promise((r) => setTimeout(r, 1200));
  await screenshot('step2_return_keywords_manager_modal.png');

  // Close Keywords modal
  await send('Runtime.evaluate', {
    expression: `
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Close');
      if (closeBtn) closeBtn.click();
    `,
    returnByValue: true
  });
  await new Promise((r) => setTimeout(r, 800));

  // 4. Open Delete Modal (Portals Deletion Modal)
  await send('Runtime.evaluate', {
    expression: `
      const delBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes('Delete'));
      if (delBtn) delBtn.click();
    `,
    returnByValue: true
  });
  await new Promise((r) => setTimeout(r, 1200));
  await screenshot('step3_portals_cascade_delete_modal.png');

  // Close Delete modal
  await send('Runtime.evaluate', {
    expression: `
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel');
      if (cancelBtn) cancelBtn.click();
    `,
    returnByValue: true
  });
  await new Promise((r) => setTimeout(r, 800));

  // 5. Open Upload Modal to verify upload modal UI
  await send('Runtime.evaluate', {
    expression: `
      const upBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes('Upload') && !b.textContent.includes('Returns'));
      if (upBtn) upBtn.click();
    `,
    returnByValue: true
  });
  await new Promise((r) => setTimeout(r, 1200));
  await screenshot('step4_upload_modal.png');

  ws.close();
  console.log('All CDP visual tests completed successfully!');
}

main().catch(console.error);
