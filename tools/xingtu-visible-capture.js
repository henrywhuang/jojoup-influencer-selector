/**
 * Xingtu visible-page capture helper.
 *
 * Usage:
 * 1. Log in to Xingtu in the browser.
 * 2. Open a creator list, audience-package result, search result, or creator detail page.
 * 3. Run this script in the page context via the agent/browser console.
 *
 * The script only reads visible DOM text and links from the current page.
 * It does not read passwords, cookies, localStorage, hidden APIs, or bypass permissions.
 */
(async function captureXingtuVisiblePage() {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const isVisible = (node) => {
    if (!node || !node.getBoundingClientRect) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };

  const extractLinks = (node) => Array.from(node.querySelectorAll("a[href]"))
    .map((link) => ({
      text: clean(link.innerText || link.textContent),
      href: link.href
    }))
    .filter((link) => link.href || link.text);

  const tableSelectors = [
    "tbody tr",
    "[role='row']",
    ".semi-table-row",
    ".byted-table-row",
    ".arco-table-tr",
    "[class*='table-row']",
    "[class*='TableRow']"
  ];

  const cardSelectors = [
    "[class*='creator']",
    "[class*='Creator']",
    "[class*='author']",
    "[class*='Author']",
    "[class*='talent']",
    "[class*='Talent']",
    "[class*='达人']"
  ];

  const uniqueNodes = (selectors) => {
    const seen = new Set();
    return selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((node) => {
        if (seen.has(node)) return false;
        seen.add(node);
        return isVisible(node);
      });
  };

  const rows = uniqueNodes(tableSelectors)
    .map((row, index) => {
      const cells = Array.from(row.querySelectorAll("td, th, [role='cell'], .semi-table-cell, .arco-table-td, [class*='table-cell']"))
        .map((cell) => clean(cell.innerText || cell.textContent))
        .filter(Boolean);
      const text = clean(row.innerText || row.textContent);
      return {
        index,
        type: "row",
        text,
        cells,
        links: extractLinks(row)
      };
    })
    .filter((item) => item.text.length > 8);

  const cards = uniqueNodes(cardSelectors)
    .map((card, index) => ({
      index,
      type: "card",
      text: clean(card.innerText || card.textContent),
      links: extractLinks(card)
    }))
    .filter((item) => item.text.length > 20)
    .slice(0, 80);

  const payload = {
    source: "xingtu-visible-dom",
    page_title: document.title,
    page_url: location.href,
    captured_at: new Date().toISOString(),
    note: "Only visible DOM text and links were captured from the logged-in page.",
    row_count: rows.length,
    card_count: cards.length,
    rows,
    cards
  };

  const json = JSON.stringify(payload, null, 2);
  console.log("[JOJOUP Xingtu Capture]", payload);

  try {
    await navigator.clipboard.writeText(json);
    console.log("[JOJOUP Xingtu Capture] JSON copied to clipboard.");
  } catch (error) {
    console.warn("[JOJOUP Xingtu Capture] Clipboard copy failed. Use the console payload or downloaded file.", error);
  }

  try {
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `jojoup-xingtu-capture-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.warn("[JOJOUP Xingtu Capture] Download failed.", error);
  }

  return payload;
})();
