/**
 * Shared Notion-blocks → Liminal-HTML conversion helpers.
 * Extracted from importRemaining.js so recovery scripts can reuse the
 * exact same conversion logic the original import used.
 */

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function richTextToHtml(richTexts) {
  if (!richTexts || !richTexts.length) return '';
  return richTexts.map(rt => {
    let text = escapeHtml(rt.plain_text || '');
    if (rt.annotations) {
      if (rt.annotations.bold) text = `<strong>${text}</strong>`;
      if (rt.annotations.italic) text = `<em>${text}</em>`;
      if (rt.annotations.code) text = `<code>${text}</code>`;
      if (rt.annotations.strikethrough) text = `<s>${text}</s>`;
    }
    if (rt.href) text = `<a href="${escapeAttr(rt.href)}">${text}</a>`;
    return text;
  }).join('');
}

function richTextToPlain(richTexts) {
  if (!richTexts || !richTexts.length) return '';
  return richTexts.map(rt => rt.plain_text || '').join('');
}

function blocksToHtml(blocks) {
  const html = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    const type = block.type;

    if (type === 'paragraph') {
      const text = richTextToHtml(block.paragraph?.rich_text);
      const plain = richTextToPlain(block.paragraph?.rich_text);
      const ytMatch = plain.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch && plain.trim().match(/^https?:\/\//)) {
        html.push(`<div data-youtube-embed="" data-video-id="${escapeAttr(ytMatch[1])}" data-title="" data-width="100%"></div>`);
      } else {
        html.push(`<p>${text || ''}</p>`);
      }
    } else if (type === 'heading_1') {
      html.push(`<h1>${richTextToHtml(block.heading_1?.rich_text)}</h1>`);
    } else if (type === 'heading_2') {
      html.push(`<h2>${richTextToHtml(block.heading_2?.rich_text)}</h2>`);
    } else if (type === 'heading_3') {
      html.push(`<h3>${richTextToHtml(block.heading_3?.rich_text)}</h3>`);
    } else if (type === 'bulleted_list_item') {
      const items = [];
      while (i < blocks.length && blocks[i].type === 'bulleted_list_item') {
        items.push(`<li>${richTextToHtml(blocks[i].bulleted_list_item?.rich_text)}</li>`);
        i++;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    } else if (type === 'numbered_list_item') {
      const items = [];
      while (i < blocks.length && blocks[i].type === 'numbered_list_item') {
        items.push(`<li>${richTextToHtml(blocks[i].numbered_list_item?.rich_text)}</li>`);
        i++;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    } else if (type === 'quote') {
      html.push(`<blockquote><p>${richTextToHtml(block.quote?.rich_text)}</p></blockquote>`);
    } else if (type === 'divider') {
      html.push('<p></p>');
    } else if (type === 'image') {
      const url = block.image?.file?.url || block.image?.external?.url || '';
      if (url) {
        html.push(`<div data-image-embed="" data-src="${escapeAttr(url)}" data-alt="image" data-width="100%" data-analyzed="false" data-image-hash=""></div>`);
      }
    } else if (type === 'video') {
      const url = block.video?.external?.url || '';
      const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch) {
        html.push(`<div data-youtube-embed="" data-video-id="${escapeAttr(ytMatch[1])}" data-title="" data-width="100%"></div>`);
      }
    } else if (type === 'toggle') {
      const summary = richTextToPlain(block.toggle?.rich_text);
      html.push(`<details data-toggle="" data-summary="${escapeAttr(summary)}" open><div data-details-content><p></p></div></details>`);
    } else if (type === 'callout') {
      html.push(`<blockquote><p>${richTextToHtml(block.callout?.rich_text)}</p></blockquote>`);
    } else if (type === 'code') {
      const code = richTextToPlain(block.code?.rich_text);
      html.push(`<p><code>${escapeHtml(code)}</code></p>`);
    }
    i++;
  }
  return html.join('\n');
}

function blocksToPlainText(blocks) {
  return blocks.map(b => {
    const type = b.type;
    if (b[type]?.rich_text) return richTextToPlain(b[type].rich_text);
    return '';
  }).filter(Boolean).join('\n\n');
}

function splitReflections(blocks) {
  const firstH2 = blocks.findIndex(b => b.type === 'heading_2');
  if (firstH2 === -1) return { bodyBlocks: blocks, reflectionBlocks: [] };

  let splitIdx = firstH2;
  if (firstH2 > 0 && blocks[firstH2 - 1].type === 'divider') {
    splitIdx = firstH2 - 1;
  }

  const bodyBlocks = blocks.slice(0, splitIdx);
  const refBlocks = blocks.slice(firstH2);

  const sections = [];
  let current = null;
  for (const b of refBlocks) {
    if (b.type === 'heading_2') {
      if (current) sections.push(current);
      const title = richTextToPlain(b.heading_2?.rich_text).replace(/`/g, '').trim();
      current = { title: title || 'Reflection', bodyParts: [] };
    } else if (current) {
      const text = b[b.type]?.rich_text ? richTextToPlain(b[b.type].rich_text) : '';
      if (text) current.bodyParts.push(text);
    }
  }
  if (current) sections.push(current);

  const reflectionBlocks = sections
    .filter(s => s.bodyParts.join('').trim())
    .map(s => ({
      title: s.title,
      body: s.bodyParts.join('\n\n').trim(),
      quote: null,
      archetype: 'Imported',
    }));

  return { bodyBlocks, reflectionBlocks };
}

module.exports = {
  blocksToHtml,
  blocksToPlainText,
  splitReflections,
  richTextToHtml,
  richTextToPlain,
  escapeHtml,
  escapeAttr,
};
