if (typeof document !== 'undefined') {
  if (document.doctype == null) {
    const doctype = document.implementation.createDocumentType('html', '', '');
    document.insertBefore(doctype, document.documentElement);
  }
  if (document.compatMode !== 'CSS1Compat') {
    Object.defineProperty(document, 'compatMode', {
      configurable: true,
      get: () => 'CSS1Compat',
    });
  }
}

if (typeof console !== 'undefined') {
  const suppressedWarnSnippets = [
    'Yjs was already imported',
    '@blocksuite/store was already imported',
  ];
  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const message = args
      .filter(arg => typeof arg === 'string')
      .join(' ');
    if (message && suppressedWarnSnippets.some(snippet => message.includes(snippet))) {
      return;
    }
    originalWarn(...args);
  };
}
