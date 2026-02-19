(function () {
  const EXAMPLES = {
    "Codex Layout": `[
=aside 1/6
  i:new "New thread"
  i:clock "Automations"
  i:box "Skills"
  ---
  # Threads
  i:folder misc
  _Read wiretext skill documentation_ \`(6m)\`
  _Activate wiretext skill_ \`(7m)\`
  _Inspect new wiretext skill_ \`(8m)\`
  i:folder lit
  "No threads"
  i:folder howcaniprayforyou
  "No threads"
  ---
  i:settings _Settings_

=section 5/6
  [
  =threads 1/4
    =threads_header
      # Open | i:filter
    =threads_list
      _Read wiretext skill documentation_ \`(misc)\`
      _Activate wiretext skill_ \`(misc)\`
      _Inspect new wiretext skill_ \`(misc)\`

  =chat 3/4
    =chat_header
      # "Read wiretext skill documentation" | misc | "Model: GPT-5 Codex" | \`(Default mode)\` | _Open in repo_
    =messages
      "now generate HTML from it and open it up in chrome"
      "I'll create a standalone HTML mock for that WireText sketch in /Users/jef/misc, then open it in Chrome."
      "Created and opened the mock in Chrome."
    =composer
      ^^ "Ask for follow-up changes"
      [] "Use plan mode" | [] "Run tools automatically"
      !Attach | !!Send
  ]
]`,
    "Simple Form": `=main
  # Create Account
  ^first_name | ^last_name
  ^email
  ^password
  [] "I agree to terms"
  !Cancel | !!"Create account"`,
    "Table": `=main
  # Contacts
  | Name | Email | Status |
  |------|-------|--------|
  | Jane | jane@example.com | \`(Active)\` |
  | Bob | bob@example.com | \`(Pending)\` |`
  };
  const KNOWN_INPUT_TYPES = new Set([
    "text", "password", "date", "time", "phone", "email", "number",
    "url", "search", "tel", "color", "file", "range"
  ]);

  const els = {
    exampleSelect: document.getElementById("exampleSelect"),
    widthInput: document.getElementById("widthInput"),
    autoRender: document.getElementById("autoRender"),
    renderBtn: document.getElementById("renderBtn"),
    shareBtn: document.getElementById("shareBtn"),
    wireInput: document.getElementById("wireInput"),
    asciiOut: document.getElementById("asciiOut"),
    previewFrame: document.getElementById("previewFrame"),
    openPreviewBtn: document.getElementById("openPreviewBtn"),
    copyAsciiBtn: document.getElementById("copyAsciiBtn"),
    astOut: document.getElementById("astOut"),
    copyAstBtn: document.getElementById("copyAstBtn"),
    downloadAstBtn: document.getElementById("downloadAstBtn"),
    errorBox: document.getElementById("errorBox")
  };

  function parseSection(line) {
    const rest = line.slice(1).trim();
    const m = rest.match(/^([^\s]+)(?:\s+(\d+)\/(\d+))?$/);
    if (!m) return { type: "section", name: rest, ratio: null, children: [] };
    const ratio = m[2] ? { n: Number(m[2]), d: Number(m[3]) } : null;
    return { type: "section", name: m[1], ratio, children: [] };
  }

  function indentLevel(line) {
    const lead = line.length - line.trimStart().length;
    return Math.floor(lead / 2);
  }

  function appendChild(target, child) {
    target.children.push(child);
  }

  function parseWireText(src) {
    const lines = src.replace(/\r\n?/g, "\n").split("\n");
    const root = { type: "root", children: [] };
    const stack = [{ node: root, indent: -1 }];

    function collapseToIndent(indent) {
      while (stack.length > 1) {
        const top = stack[stack.length - 1];
        const parent = stack[stack.length - 2];

        if (top.node.type === "group" && indent >= top.indent) return;
        if (indent > top.indent) return;

        stack.pop();
        appendChild(parent.node, top.node);
      }
    }

    function popGroup(lineNo) {
      while (stack.length > 1) {
        const top = stack.pop();
        const parent = stack[stack.length - 1];
        appendChild(parent.node, top.node);
        if (top.node.type === "group") return;
      }
      throw new Error(`line ${lineNo}: encountered ']' without matching '['`);
    }

    lines.forEach((raw, i) => {
      const lineNo = i + 1;
      const line = raw.replace(/\s+$/, "");
      if (!line.trim()) return;

      const indent = indentLevel(line);
      const trimmed = line.trimStart();

      if (trimmed === "]") {
        popGroup(lineNo);
        return;
      }

      collapseToIndent(indent);
      const parent = stack[stack.length - 1].node;
      if (!(parent.type === "root" || parent.type === "section" || parent.type === "group")) {
        throw new Error(`line ${lineNo}: cannot nest under row content`);
      }

      if (trimmed === "[") {
        stack.push({ node: { type: "group", children: [] }, indent });
        return;
      }

      if (trimmed.startsWith("=")) {
        stack.push({ node: parseSection(trimmed), indent });
        return;
      }

      appendChild(parent, { type: "row", text: trimmed });
    });

    while (stack.length > 1) {
      const top = stack.pop();
      appendChild(stack[stack.length - 1].node, top.node);
    }

    return root;
  }

  function normalizeRowText(text) {
    const t = text.trim();
    const tableRow = t.startsWith("|") && t.endsWith("|");
    let out = t
      .replace(/^#+\s+/, "")
      .replace(/^[-*]\s+/, "- ")
      .replace(/^\d+\.\s+/, "")
      .replace(/`\(([^)]*)\)`/g, "($1)")
      .replace(/^\^\^\s+"([^"]+)"$/, "[textarea: $1]")
      .replace(/^\^\^$/, "[textarea]")
      .replace(/\^([a-zA-Z0-9_]+)/g, (_m, field) => {
        if (KNOWN_INPUT_TYPES.has(field)) return `[${field}]`;
        return `${field.replace(/_/g, " ")}: [text]`;
      })
      .replace(/!!"([^"]+)"/g, "[! $1]")
      .replace(/!"([^"]+)"/g, "[$1]")
      .replace(/!!([^\s|]+)/g, "[! $1]")
      .replace(/!([^\s|]+)/g, "[$1]")
      .replace(/i:([a-zA-Z0-9_\-]+)/g, "<$1>")
      .replace(/_([^_]+)_/g, "$1");

    out = tableRow ? out.replace(/\s*\|\s*/g, " | ") : out.replace(/\|/g, " ");
    return out.replace(/\s+/g, " ").trim();
  }

  function wrapLine(text, width) {
    const t = String(text || "");
    if (!t) return [""];
    if (width <= 1) return [t.slice(0, 1)];
    const words = t.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";

    while (words.length) {
      const w = words.shift();
      if (!cur) {
        if (w.length <= width) cur = w;
        else {
          lines.push(w.slice(0, width));
          words.unshift(w.slice(width));
        }
      } else {
        const cand = `${cur} ${w}`;
        if (cand.length <= width) cur = cand;
        else {
          lines.push(cur);
          cur = "";
          words.unshift(w);
        }
      }
    }

    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }

  function childWidths(children, total) {
    const min = 18;
    const ratios = children.map((c) => (c.type === "section" && c.ratio ? c.ratio.n / c.ratio.d : null));
    const ratioSum = ratios.filter((r) => r != null).reduce((a, b) => a + b, 0);

    let widths = ratios.map((r) => {
      if (r == null) return Math.max(min, Math.floor(total / Math.max(children.length, 1)));
      if (ratioSum > 0) return Math.max(min, Math.floor(total * (r / ratioSum)));
      return Math.max(min, Math.floor(total / Math.max(children.length, 1)));
    });

    let used = widths.reduce((a, b) => a + b, 0) + Math.max(children.length - 1, 0) * 3;
    while (used < total) {
      const i = (total - used) % widths.length;
      widths[i] += 1;
      used += 1;
    }
    while (used > total) {
      const i = (used - total) % widths.length;
      if (widths[i] > min) {
        widths[i] -= 1;
        used -= 1;
      } else break;
    }
    return widths;
  }

  function padToHeight(lines, h, width) {
    const out = lines.map((l) => String(l).slice(0, width).padEnd(width, " "));
    while (out.length < h) out.push("".padEnd(width, " "));
    return out;
  }

  function joinColumns(blocks, widths) {
    const maxH = Math.max(...blocks.map((b) => b.length));
    const padded = blocks.map((b, i) => padToHeight(b, maxH, widths[i]));
    const rows = [];
    for (let i = 0; i < maxH; i++) rows.push(padded.map((b) => b[i]).join("   ").replace(/\s+$/, ""));
    return rows;
  }

  function shouldFrameSection(node) {
    if (!node.ratio) return false;
    if (
      node.children.length === 1 &&
      node.children[0].type === "group" &&
      node.children[0].children.length > 0 &&
      node.children[0].children.every((c) => c.type === "section" && c.ratio)
    ) {
      return false;
    }
    return true;
  }

  function frame(inner, width) {
    const w = Math.max(width, 18);
    const cw = w - 2;
    const border = `+${"-".repeat(cw)}+`;
    const body = [];
    inner.forEach((line) => {
      const s = String(line || "");
      const parts = s.startsWith("+") || s.startsWith("|") ? [s.slice(0, cw)] : wrapLine(s, cw);
      parts.forEach((p) => body.push(`|${p.padEnd(cw, " ")}|`));
    });
    return [border, ...body, border];
  }

  function renderAscii(node, width) {
    if (node.type === "root") return trimBlank(node.children.flatMap((c) => renderAscii(c, width)));

    if (node.type === "group") {
      if (!node.children.length) return [""];
      if (node.children.length === 1) return trimBlank(renderAscii(node.children[0], width));
      const widths = childWidths(node.children, width);
      const blocks = node.children.map((c, i) => {
        const lines = trimBlank(renderAscii(c, widths[i]));
        return lines.length ? lines : [""];
      });
      return joinColumns(blocks, widths);
    }

    if (node.type === "section") {
      const framed = shouldFrameSection(node);
      const innerW = framed ? Math.max(width - 2, 18) : Math.max(width, 18);
      const inner = trimBlank(
        node.children.flatMap((c, i) => {
          const block = renderAscii(c, innerW);
          return i === 0 ? block : ["", ...block];
        })
      );
      const nonEmpty = inner.length ? inner : ["(empty)"];
      return framed ? frame(nonEmpty, width) : nonEmpty;
    }

    if (node.type === "row") return wrapLine(normalizeRowText(node.text), Math.max(width, 18));

    return [];
  }

  function trimBlank(lines) {
    let s = 0;
    let e = lines.length - 1;
    while (s <= e && !String(lines[s]).trim()) s += 1;
    while (e >= s && !String(lines[e]).trim()) e -= 1;
    return lines.slice(s, e + 1);
  }

  function renderHTMLDocument(ast) {
    const style = `
      <style>
        html,body{margin:0;padding:0;background:#f8fafc;color:#111827;font:14px/1.45 "SF Pro Text","Segoe UI",sans-serif;}
        .root{padding:10px;display:grid;gap:10px;}
        .group{display:flex;gap:10px;align-items:stretch;min-width:0;}
        .section{display:grid;gap:8px;min-width:0;}
        .section.frame{border:1px solid #cfd8e3;border-radius:10px;padding:10px;background:#fff;}
        .wt-row{display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;min-width:0;}
        .wt-cell{display:grid;gap:6px;min-width:0;flex:0 1 auto;}
        .wt-grow{flex:1 1 220px;}
        .wt-input{display:grid;gap:4px;}
        .wt-input label{font-size:12px;color:#4b5563;font-weight:600;}
        .wt-input input,.wt-input textarea,.wt-input select{font:inherit;border:1px solid #d1d9e4;border-radius:8px;padding:7px 9px;background:#fff;}
        .wt-input textarea{min-height:86px;resize:vertical;}
        .wt-btn{display:inline-block;border:1px solid #c8d2df;border-radius:8px;padding:7px 11px;background:#fff;font-weight:600;color:#263142;}
        .wt-btn.primary{background:#0f766e;border-color:#0f766e;color:#f0fdfa;}
        .wt-choice{display:inline-flex;align-items:center;gap:6px;color:#374151;}
        .wt-link{color:#1d4ed8;text-decoration:underline;}
        .wt-icon{display:inline-block;padding:2px 7px;border:1px solid #d5dce7;border-radius:999px;background:#f3f6fb;font-size:12px;color:#334155;}
        .wt-badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#e9eef9;color:#3248a8;font-size:12px;font-weight:600;}
        .wt-table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d6dce6;border-radius:8px;overflow:hidden;}
        .wt-table th,.wt-table td{border:1px solid #d6dce6;padding:6px 8px;vertical-align:top;text-align:left;}
        .wt-table th{background:#f1f5f9;font-weight:700;}
        hr{border:0;border-top:1px solid #d7dce4;margin:4px 0;}
        h1,h2,h3,h4,h5,h6{margin:2px 0 0;line-height:1.2;}
        p{margin:0;}
        ul,ol{margin:0;padding-left:20px;}
      </style>
    `;

    function splitPipes(line) {
      const out = [];
      let cur = "";
      let inQuote = false;

      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === "\"") inQuote = !inQuote;
        if (ch === "|" && !inQuote) {
          out.push(cur.trim());
          cur = "";
        } else {
          cur += ch;
        }
      }
      out.push(cur.trim());
      return out.filter((x) => x.length > 0);
    }

    function isTableRow(text) {
      const t = text.trim();
      return t.startsWith("|") && t.endsWith("|");
    }

    function parseTableCells(text) {
      return text
        .trim()
        .slice(1, -1)
        .split("|")
        .map((x) => x.trim());
    }

    function isSeparatorRow(cells) {
      return cells.every((c) => /^:?-{3,}:?$/.test(c));
    }

    function knownInputType(name) {
      return KNOWN_INPUT_TYPES.has(name) ? name : "text";
    }

    function friendlyLabel(name) {
      return name.replace(/_/g, " ");
    }

    function inlineTextHTML(raw) {
      const text = raw.trim();
      const parts = text.split(/(_[^_]+_|`\([^)]+\)`)/g).filter(Boolean);
      return parts.map((part) => {
        const link = part.match(/^_([^_]+)_$/);
        if (link) return `<a href="#" class="wt-link">${escapeHTML(link[1])}</a>`;
        const badge = part.match(/^`\(([^)]+)\)`$/);
        if (badge) return `<span class="wt-badge">${escapeHTML(badge[1])}</span>`;
        return escapeHTML(part);
      }).join("");
    }

    function segmentHTML(segment) {
      const s = segment.trim();
      if (!s) return "";

      const heading = s.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const lvl = Math.min(heading[1].length, 6);
        return `<h${lvl}>${inlineTextHTML(heading[2])}</h${lvl}>`;
      }
      if (s === "---") return "<hr />";

      const listItem = s.match(/^-\s+(.+)$/);
      if (listItem) return `<ul><li>${inlineTextHTML(listItem[1])}</li></ul>`;

      const ordered = s.match(/^\\d+\\.\\s+(.+)$/);
      if (ordered) return `<ol><li>${inlineTextHTML(ordered[1])}</li></ol>`;

      const checkbox = s.match(/^\[(x| )?\]\s*(.+)?$/i);
      if (checkbox) {
        const checked = (checkbox[1] || "").toLowerCase() === "x" ? " checked" : "";
        const label = checkbox[2] ? inlineTextHTML(checkbox[2]) : "";
        return `<label class="wt-choice"><input type="checkbox"${checked} />${label}</label>`;
      }

      const radio = s.match(/^\((x| )?\)\s*(.+)?$/i);
      if (radio) {
        const checked = (radio[1] || "").toLowerCase() === "x" ? " checked" : "";
        const label = radio[2] ? inlineTextHTML(radio[2]) : "";
        return `<label class="wt-choice"><input type="radio"${checked} />${label}</label>`;
      }

      const primaryBtnQ = s.match(/^!!"([^"]+)"$/);
      if (primaryBtnQ) return `<button class="wt-btn primary">${escapeHTML(primaryBtnQ[1])}</button>`;
      const primaryBtn = s.match(/^!!([^\s|]+)$/);
      if (primaryBtn) return `<button class="wt-btn primary">${escapeHTML(primaryBtn[1])}</button>`;
      const btnQ = s.match(/^!"([^"]+)"$/);
      if (btnQ) return `<button class="wt-btn">${escapeHTML(btnQ[1])}</button>`;
      const btn = s.match(/^!([^\s|]+)$/);
      if (btn) return `<button class="wt-btn">${escapeHTML(btn[1])}</button>`;

      const explicitArea = s.match(/^([^:]+):\s*\^\^\s*(?:"([^"]*)")?$/);
      if (explicitArea) {
        const label = explicitArea[1].trim();
        const ph = explicitArea[2] || "";
        return `<div class="wt-input"><label>${escapeHTML(label)}</label><textarea placeholder="${escapeHTML(ph)}"></textarea></div>`;
      }

      const area = s.match(/^\^\^\s*(?:"([^"]*)")?$/);
      if (area) {
        const ph = area[1] || "";
        return `<div class="wt-input"><label>text</label><textarea placeholder="${escapeHTML(ph)}"></textarea></div>`;
      }

      const explicitInput = s.match(/^([^:]+):\s*\^([a-zA-Z0-9_]+)\s*(?:"([^"]*)")?$/);
      if (explicitInput) {
        const label = explicitInput[1].trim();
        const type = knownInputType(explicitInput[2]);
        const ph = explicitInput[3] || "";
        return `<div class="wt-input"><label>${escapeHTML(label)}</label><input type="${type}" placeholder="${escapeHTML(ph)}" /></div>`;
      }

      const input = s.match(/^\^([a-zA-Z0-9_]+)\s*(?:"([^"]*)")?$/);
      if (input) {
        const key = input[1];
        const type = knownInputType(key);
        const label = KNOWN_INPUT_TYPES.has(key) ? key : friendlyLabel(key);
        const ph = input[2] || "";
        return `<div class="wt-input"><label>${escapeHTML(label)}</label><input type="${type}" placeholder="${escapeHTML(ph)}" /></div>`;
      }

      const icon = s.match(/^i:([a-zA-Z0-9_-]+)$/);
      if (icon) return `<span class="wt-icon">${escapeHTML(icon[1])}</span>`;

      const badge = s.match(/^`\(([^)]+)\)`$/);
      if (badge) return `<span class="wt-badge">${escapeHTML(badge[1])}</span>`;

      const linkOnly = s.match(/^_([^_]+)_$/);
      if (linkOnly) return `<a href="#" class="wt-link">${escapeHTML(linkOnly[1])}</a>`;

      return `<p>${inlineTextHTML(s)}</p>`;
    }

    function rowHTML(text) {
      const t = text.trim();
      if (t.includes("|") && !isTableRow(t)) {
        const cells = splitPipes(t);
        return `<div class="wt-row">${cells.map((cell) => `<div class="wt-cell">${segmentHTML(cell)}</div>`).join("")}</div>`;
      }
      return `<div class="wt-row"><div class="wt-cell wt-grow">${segmentHTML(t)}</div></div>`;
    }

    function tableHTML(rows) {
      const parsed = rows.map(parseTableCells);
      if (!parsed.length) return "";
      const header = parsed[0];
      let i = 1;
      if (parsed[1] && isSeparatorRow(parsed[1])) i = 2;
      const body = parsed.slice(i);

      const th = header.map((c) => `<th>${inlineTextHTML(c)}</th>`).join("");
      const tr = body.map((r) => `<tr>${r.map((c) => `<td>${inlineTextHTML(c)}</td>`).join("")}</tr>`).join("");
      return `<table class="wt-table"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
    }

    function renderChildren(children) {
      const out = [];
      for (let i = 0; i < children.length; i += 1) {
        const child = children[i];
        if (child.type === "row" && isTableRow(child.text)) {
          const block = [];
          while (i < children.length && children[i].type === "row" && isTableRow(children[i].text)) {
            block.push(children[i].text);
            i += 1;
          }
          i -= 1;
          out.push(tableHTML(block));
          continue;
        }
        out.push(nodeHTML(child));
      }
      return out.join("");
    }

    function semanticTag(name) {
      if (/^(header|footer|nav|main|section|aside|article)$/.test(name)) return name;
      return "section";
    }

    function nodeHTML(node) {
      if (node.type === "root") return `<div class="root">${renderChildren(node.children)}</div>`;
      if (node.type === "row") return rowHTML(node.text);
      if (node.type === "group") return `<div class="group">${renderChildren(node.children)}</div>`;
      if (node.type === "section") {
        const ratio = node.ratio ? ` style="flex:${node.ratio.n} 1 0%"` : "";
        const cls = node.ratio ? "section frame" : "section";
        const tag = semanticTag(node.name);
        return `<${tag} class="${cls}"${ratio} data-wt="${escapeHTML(node.name)}">${renderChildren(node.children)}</${tag}>`;
      }
      return "";
    }

    return `<!doctype html><html><head><meta charset="utf-8" />${style}</head><body>${nodeHTML(ast)}</body></html>`;
  }

  function escapeHTML(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function populateExamples() {
    Object.keys(EXAMPLES).forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      els.exampleSelect.appendChild(opt);
    });
  }

  function readStateFromURL() {
    const p = new URLSearchParams(location.hash.startsWith("#") ? location.hash.slice(1) : "");
    const source = p.get("src");
    const width = p.get("w");
    const ex = p.get("ex");
    if (width && /^\d+$/.test(width)) els.widthInput.value = width;
    if (ex && EXAMPLES[ex]) els.exampleSelect.value = ex;
    if (source) els.wireInput.value = decodeURIComponent(source);
    else els.wireInput.value = EXAMPLES[els.exampleSelect.value || Object.keys(EXAMPLES)[0]];
  }

  function updateURL() {
    const p = new URLSearchParams();
    p.set("w", els.widthInput.value);
    p.set("ex", els.exampleSelect.value);
    p.set("src", encodeURIComponent(els.wireInput.value));
    history.replaceState(null, "", `#${p.toString()}`);
  }

  function setError(msg) {
    if (!msg) {
      els.errorBox.style.display = "none";
      els.errorBox.textContent = "";
      return;
    }
    els.errorBox.style.display = "block";
    els.errorBox.textContent = msg;
  }

  function renderAll() {
    setError("");
    try {
      const ast = parseWireText(els.wireInput.value);
      const width = Math.max(60, Number(els.widthInput.value) || 120);
      els.asciiOut.textContent = renderAscii(ast, width).join("\n");
      const astJson = JSON.stringify(ast, null, 2);
      els.astOut.textContent = astJson;
      const html = renderHTMLDocument(ast);
      els.previewFrame.srcdoc = html;
      els.openPreviewBtn.onclick = () => {
        const w = window.open("about:blank", "_blank");
        if (!w) return;
        w.document.open();
        w.document.write(html);
        w.document.close();
      };
      els.downloadAstBtn.onclick = () => {
        const blob = new Blob([astJson], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "wiretext.ast.json";
        a.click();
        URL.revokeObjectURL(url);
      };
      updateURL();
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  function maybeRender() {
    if (els.autoRender.checked) renderAll();
  }

  function init() {
    populateExamples();
    readStateFromURL();

    els.exampleSelect.addEventListener("change", () => {
      els.wireInput.value = EXAMPLES[els.exampleSelect.value] || "";
      renderAll();
    });

    els.wireInput.addEventListener("input", maybeRender);
    els.widthInput.addEventListener("input", maybeRender);
    els.renderBtn.addEventListener("click", renderAll);

    els.copyAsciiBtn.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(els.asciiOut.textContent || ""); } catch (_e) {}
    });
    els.copyAstBtn.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(els.astOut.textContent || ""); } catch (_e) {}
    });

    els.shareBtn.addEventListener("click", async () => {
      updateURL();
      try { await navigator.clipboard.writeText(location.href); } catch (_e) {}
    });

    renderAll();
  }

  init();
})();
