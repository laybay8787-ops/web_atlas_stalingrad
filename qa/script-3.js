
(function () {
  if (window === window.top) return;

  const allowedParentOrigins = ["https://www.perplexity.ai","https://perplexity.ai","https://testing.perplexity.ai","https://staging.perplexity.ai","https://*.preview.i.perplexity.ai","http://perplexity.localhost","http://localhost:1420","http://127.0.0.1:1420","http://localhost:3000","http://127.0.0.1:3000","http://localhost:5173","http://127.0.0.1:5173"];
  const MAX_FONT_BYTES = 500 * 1024;
  const MAX_TOTAL_FONT_BYTES = 2 * 1024 * 1024;
  const DEFAULT_LINE_HEIGHT = 16;
  let scrollForwarding = false;
  let scrollRaf = 0;
  let trustedTopOrigin = null;

  // Allow entries like "https://*.preview.i.perplexity.ai" — the wildcard
  // matches a single DNS label (no dots), so "https://*.foo" cannot stretch
  // across multiple labels.
  function matchesAllowedOrigin(origin) {
    if (!origin) return false;
    for (const entry of allowedParentOrigins) {
      if (!entry.includes("*")) {
        if (entry === origin) return true;
        continue;
      }
      const pattern = new RegExp(
        "^" +
          entry.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^.]+") +
          "$",
      );
      if (pattern.test(origin)) return true;
    }
    return false;
  }

  // Trust decision: when the sender is same-origin-visible (event.origin is a
  // real origin like https://www.perplexity.ai) we trust event.origin directly.
  // When event.origin is "null" (opaque broker srcdoc), we fall back to the
  // broker's stamped `parentOrigin` to identify the top window. The fallback
  // is claim-only — we rely on the browser's native `targetOrigin` enforcement
  // on the response path (see postToTrustedTop) to ensure replies can't be
  // delivered to anyone but the actual top window of that claimed origin.
  function getTrustedParentOrigin(event) {
    const forwardedParentOrigin =
      typeof event.data.parentOrigin === "string" ? event.data.parentOrigin : null;
    const parentOrigin = event.origin === "null" ? forwardedParentOrigin : event.origin;
    return matchesAllowedOrigin(parentOrigin) ? parentOrigin : null;
  }

  // All responses go to window.top with targetOrigin = the allowlisted origin.
  // An attacker that iframes us inside their own null-origin broker can claim
  // any parentOrigin they like, but the browser will drop the reply whenever
  // the real top's origin doesn't match — so the screenshot never leaves.
  function postToTrustedTop(message) {
    if (!trustedTopOrigin) return;
    try {
      window.top.postMessage(message, trustedTopOrigin);
    } catch (_error) {}
  }

  const PICK_CAPABILITIES = ["pick"];
  const PICK_CHAIN_LENGTH = 4;
  const PICK_MAX_TEXT_CHARS = 120;
  const PICK_MAX_HTML_CHARS = 300;

  function truncate(value, maxChars) {
    return value.length > maxChars ? value.slice(0, maxChars - 1) + "…" : value;
  }

  function isPickableElement(element) {
    return (
      element instanceof Element &&
      element !== document.documentElement &&
      element !== document.body
    );
  }

  function resolvePickTarget(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const element = document.elementFromPoint(x, y);
    return isPickableElement(element) ? element.closest("svg") || element : null;
  }

  function pickLabel(element) {
    if (element.id) return element.localName + "#" + element.id;
    return [element.localName].concat(Array.from(element.classList).slice(0, 2)).join(".");
  }

  // Only attributes that help find the element in source. data-* values and URL
  // query strings or fragments can carry tokens.
  const PICK_ATTRIBUTES = new Set([
    "id",
    "class",
    "name",
    "type",
    "role",
    "alt",
    "aria-label",
    "href",
    "src",
  ]);

  function pickAttributeValue(attribute) {
    return attribute.name === "href" || attribute.name === "src"
      ? attribute.value.split(/[?#]/)[0]
      : attribute.value;
  }

  function describePickElement(element) {
    const chain = [];
    for (
      let current = element;
      isPickableElement(current) && chain.length < PICK_CHAIN_LENGTH;
      current = current.parentElement
    ) {
      chain.unshift(current);
    }
    const attributes = Array.from(element.attributes)
      .filter((attribute) => PICK_ATTRIBUTES.has(attribute.name))
      .map((attribute) => ` ${attribute.name}="${pickAttributeValue(attribute).replace(/"/g, "&quot;")}"`)
      .join("");
    const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
    return {
      chain: chain.map(pickLabel),
      html: truncate(`<${element.localName}${attributes}>`, PICK_MAX_HTML_CHARS),
      text: text ? truncate(text, PICK_MAX_TEXT_CHARS) : undefined,
    };
  }

  // Hover asks once per frame, and innerText on a large section forces layout,
  // so only the rect is re-read while the pointer stays on the same element.
  // Clicks ask for fresh details since the page may have changed the element.
  let lastPick = null;

  function describePickTarget(element, fresh) {
    if (fresh || lastPick?.element !== element) {
      lastPick = { element, details: describePickElement(element) };
    }
    const rect = element.getBoundingClientRect();
    return {
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      ...lastPick.details,
    };
  }

  function inlineAll(original, clone) {
    if (original.nodeType !== 1 || clone.nodeType !== 1) return;

    try {
      const computedStyle = getComputedStyle(original);
      // cssText on a computed style is the serialized declaration in modern
      // Chromium/Safari — a single read beats enumerating ~400 longhand
      // properties. Firefox returns "" here, so we fall back on empty.
      const serialized = computedStyle.cssText;
      if (serialized) {
        clone.style.cssText = serialized;
      } else {
        const parts = new Array(computedStyle.length);
        for (let index = 0; index < computedStyle.length; index += 1) {
          const property = computedStyle[index];
          parts[index] = `${property}:${computedStyle.getPropertyValue(property)};`;
        }
        clone.style.cssText = parts.join("");
      }
    } catch (_error) {}

    const originalChildren = original.children;
    const clonedChildren = clone.children;
    for (
      let index = 0;
      index < originalChildren.length && index < clonedChildren.length;
      index += 1
    ) {
      inlineAll(originalChildren[index], clonedChildren[index]);
    }
  }

  function extractFontUrl(srcValue) {
    const matches = [
      ...srcValue.matchAll(
        /url\(["']?([^"')]+)["']?\)(?:\s*format\(["']?([^"')]+)["']?\))?/gi,
      ),
    ];
    if (matches.length === 0) return null;
    const woff2 = matches.find((m) => m[2] && m[2].toLowerCase().includes("woff2"));
    if (woff2) return woff2[1];
    const woff = matches.find((m) => m[2] && m[2].toLowerCase().includes("woff"));
    if (woff) return woff[1];
    return matches[0][1];
  }

  // Cache resolved font URL -> data URI across captures. Fonts on a page
  // essentially never change, and a batch run emits multiple captures back to
  // back — without this we'd refetch + re-base64 every time.
  const fontDataUriCache = new Map();
  const SRC_DECLARATION_RE = /src\s*:\s*[^;}]+/i;

  async function fetchAsDataUri(url) {
    if (fontDataUriCache.has(url)) return fontDataUriCache.get(url);
    let dataUri = null;
    try {
      const response = await fetch(url, { mode: "cors", credentials: "omit" });
      if (response.ok) {
        const blob = await response.blob();
        if (blob.size <= MAX_FONT_BYTES) {
          dataUri = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () =>
              resolve(typeof reader.result === "string" ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
        }
      }
    } catch (_error) {
      dataUri = null;
    }
    fontDataUriCache.set(url, dataUri);
    return dataUri;
  }

  function collectFontFaceRuleTexts() {
    const rules = [];
    for (const sheet of document.styleSheets) {
      let cssRules;
      try {
        cssRules = sheet.cssRules;
      } catch (_error) {
        continue;
      }
      if (!cssRules) continue;
      for (const rule of cssRules) {
        const cssText = rule.cssText || "";
        if (cssText.startsWith("@font-face")) rules.push(cssText);
      }
    }
    return rules;
  }

  async function buildInlinedFontCss() {
    const ruleTexts = collectFontFaceRuleTexts();
    if (ruleTexts.length === 0) return null;

    const resolved = ruleTexts.map((cssText) => {
      if (!SRC_DECLARATION_RE.test(cssText)) return null;
      const srcMatch = cssText.match(/src\s*:\s*([^;}]+)[;}]/i);
      if (!srcMatch) return null;
      const url = extractFontUrl(srcMatch[1]);
      if (!url) return null;
      try {
        return { cssText, url: new URL(url, document.baseURI).href };
      } catch (_error) {
        return null;
      }
    });

    const dataUris = await Promise.all(
      resolved.map((entry) => (entry ? fetchAsDataUri(entry.url) : Promise.resolve(null))),
    );

    const inlined = [];
    let totalBytes = 0;
    for (let index = 0; index < resolved.length; index += 1) {
      const entry = resolved[index];
      const dataUri = dataUris[index];
      if (!entry || !dataUri) continue;
      const approxBytes = dataUri.length * 0.75;
      if (totalBytes + approxBytes > MAX_TOTAL_FONT_BYTES) break;
      totalBytes += approxBytes;
      inlined.push(entry.cssText.replace(SRC_DECLARATION_RE, `src: url("${dataUri}")`));
    }
    return inlined.length > 0 ? inlined.join("\n") : null;
  }

  function stripExternal(clone) {
    const images = clone.querySelectorAll("img");
    for (let index = 0; index < images.length; index += 1) {
      const src = images[index].getAttribute("src");
      if (src && !src.startsWith("data:")) images[index].removeAttribute("src");
    }

    const elements = clone.querySelectorAll("*");
    for (let index = 0; index < elements.length; index += 1) {
      const style = elements[index].style.cssText;
      if (style && style.includes("url(")) {
        elements[index].style.cssText = style.replace(
          /url\(["']?(?!data:)[^)"']*["']?\)/gi,
          "none",
        );
      }
    }
  }

  function emitScroll() {
    scrollRaf = 0;
    if (!scrollForwarding) return;
    postToTrustedTop({
      type: "INLINE_EDIT_SCROLL",
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      capabilities: PICK_CAPABILITIES,
    });
  }

  window.addEventListener(
    "scroll",
    function () {
      if (!scrollForwarding || scrollRaf) return;
      scrollRaf = requestAnimationFrame(emitScroll);
    },
    { passive: true, capture: true },
  );

  async function handleCaptureRequest(event) {
    const requestId = event.data.requestId;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const width = window.innerWidth;
    const height = window.innerHeight;

    function postResult(dataUrl) {
      postToTrustedTop({
        type: "INLINE_EDIT_SCREENSHOT_RESULT",
        requestId,
        dataUrl,
        scrollX,
        scrollY,
      });
    }

    try {
      // Wait for any pending web fonts to resolve so both inline metrics and
      // the @font-face inlining below see the same loaded faces.
      if (document.fonts && document.fonts.ready) {
        try {
          await document.fonts.ready;
        } catch (_error) {}
      }

      const clone = document.documentElement.cloneNode(true);
      inlineAll(document.documentElement, clone);

      const removedNodes = clone.querySelectorAll("script,link[rel=\"stylesheet\"],style");
      for (let index = 0; index < removedNodes.length; index += 1) {
        removedNodes[index].remove();
      }

      stripExternal(clone);

      // Re-embed web fonts as data-URI @font-face rules so the SVG rasterizer
      // can resolve them — external font URLs aren't fetched during
      // foreignObject rendering, which would otherwise force a fallback face
      // and change text metrics.
      const inlinedFontCss = await buildInlinedFontCss();
      if (inlinedFontCss) {
        const styleEl = document.createElement("style");
        styleEl.textContent = inlinedFontCss;
        const head = clone.querySelector("head");
        if (head) head.appendChild(styleEl);
        else clone.insertBefore(styleEl, clone.firstChild);
      }

      const html = new XMLSerializer().serializeToString(clone);
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
        '<foreignObject width="100%" height="100%">' +
        `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden">` +
        `<div style="position:relative;left:-${scrollX}px;top:-${scrollY}px">` +
        html +
        "</div></div></foreignObject></svg>";
      const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      const image = new Image();
      image.onload = function () {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(image, 0, 0);
        postResult(canvas.toDataURL("image/png"));
      };
      image.onerror = function () {
        postResult(null);
      };
      image.src = svgUrl;
    } catch (_error) {
      postResult(null);
    }
  }

  window.addEventListener("message", function (event) {
    if (!event.data) return;
    // Only accept messages from the direct parent frame. Blocks sibling /
    // unrelated-window postMessage senders that could otherwise reach us.
    if (event.source !== window.parent) return;

    const trustedParentOrigin = getTrustedParentOrigin(event);
    if (!trustedParentOrigin) return;
    trustedTopOrigin = trustedParentOrigin;

    if (event.data.type === "INLINE_EDIT_PICK") {
      const element = resolvePickTarget(event.data.x, event.data.y);
      postToTrustedTop({
        type: "INLINE_EDIT_PICK_RESULT",
        seq: event.data.seq,
        target: element ? describePickTarget(element, event.data.fresh === true) : null,
      });
      return;
    }

    if (event.data.type === "INLINE_EDIT_SCROLL_START") {
      scrollForwarding = true;
      emitScroll();
      return;
    }

    if (event.data.type === "INLINE_EDIT_SCROLL_STOP") {
      scrollForwarding = false;
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      scrollRaf = 0;
      return;
    }

    if (event.data.type === "INLINE_EDIT_SCROLL_BY") {
      const { deltaX, deltaY, deltaMode } = event.data;
      if (!scrollForwarding || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
      if (deltaMode !== 0 && deltaMode !== 1 && deltaMode !== 2) return;
      const lineHeight =
        parseFloat(getComputedStyle(document.documentElement).lineHeight) || DEFAULT_LINE_HEIGHT;
      const scaleX = deltaMode === 1 ? lineHeight : deltaMode === 2 ? window.innerWidth : 1;
      const scaleY = deltaMode === 1 ? lineHeight : deltaMode === 2 ? window.innerHeight : 1;
      // The selection overlay receives the wheel event instead of this iframe.
      // Instant scrolling preserves trackpad deltas even on smooth-scroll sites.
      window.scrollBy({ left: deltaX * scaleX, top: deltaY * scaleY, behavior: "instant" });
      emitScroll();
      return;
    }

    if (event.data.type !== "INLINE_EDIT_CAPTURE_REQUEST") return;

    handleCaptureRequest(event);
  });
})();


