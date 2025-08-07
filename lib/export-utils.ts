export function exportToMarkdown(messages: any[]) {
  let markdown = '# AI Chat Conversation\n\n';
  markdown += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;
  
  messages.forEach(msg => {
    if (msg.role === 'user') {
      markdown += `## 👤 You\n\n${msg.content}\n\n`;
    } else {
      markdown += `## 🤖 AI Assistant\n\n${msg.content}\n\n`;
    }
    markdown += '---\n\n';
  });
  
  return markdown;
}

export function exportToJSON(messages: any[]) {
  return JSON.stringify({
    exported: new Date().toISOString(),
    messages: messages
  }, null, 2);
}

export function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}