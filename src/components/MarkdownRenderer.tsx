import React from 'react';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const renderContent = () => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let currentList: string[] = [];
    let currentCodeBlock: string[] = [];
    let isInCodeBlock = false;
    let listType: 'ul' | 'ol' | null = null;

    const flushList = () => {
      if (currentList.length > 0) {
        const ListTag = listType === 'ol' ? 'ol' : 'ul';
        elements.push(
          <ListTag
            key={`list-${elements.length}`}
            className={`mb-4 ${listType === 'ol' ? 'list-decimal' : 'list-disc'} list-inside space-y-1 text-gray-700`}
          >
            {currentList.map((item, idx) => (
              <li key={idx} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: item }} />
            ))}
          </ListTag>
        );
        currentList = [];
        listType = null;
      }
    };

    const flushCodeBlock = () => {
      if (currentCodeBlock.length > 0) {
        elements.push(
          <div key={`code-${elements.length}`} className="mb-4 bg-gray-900 rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-100 font-mono">
              {currentCodeBlock.join('\n')}
            </pre>
          </div>
        );
        currentCodeBlock = [];
      }
    };

    const formatInlineStyles = (text: string): string => {
      return text
        .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>')
        .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-gray-100 text-red-600 rounded text-sm font-mono">$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 hover:text-blue-700 underline" target="_blank" rel="noopener noreferrer">$1</a>');
    };

    lines.forEach((line, index) => {
      if (line.trim().startsWith('```')) {
        if (isInCodeBlock) {
          flushCodeBlock();
          isInCodeBlock = false;
        } else {
          flushList();
          isInCodeBlock = true;
        }
        return;
      }

      if (isInCodeBlock) {
        currentCodeBlock.push(line);
        return;
      }

      if (line.trim().startsWith('# ')) {
        flushList();
        const text = line.replace(/^#\s+/, '');
        elements.push(
          <h1 key={`h1-${index}`} className="text-3xl font-bold text-gray-900 mb-6 pb-3 border-b-2 border-gray-200">
            {text}
          </h1>
        );
      } else if (line.trim().startsWith('## ')) {
        flushList();
        const text = line.replace(/^##\s+/, '');
        elements.push(
          <h2 key={`h2-${index}`} className="text-2xl font-bold text-gray-900 mt-8 mb-4">
            {text}
          </h2>
        );
      } else if (line.trim().startsWith('### ')) {
        flushList();
        const text = line.replace(/^###\s+/, '');
        elements.push(
          <h3 key={`h3-${index}`} className="text-xl font-semibold text-gray-800 mt-6 mb-3">
            {text}
          </h3>
        );
      } else if (line.trim().startsWith('#### ')) {
        flushList();
        const text = line.replace(/^####\s+/, '');
        elements.push(
          <h4 key={`h4-${index}`} className="text-lg font-semibold text-gray-800 mt-4 mb-2">
            {text}
          </h4>
        );
      } else if (line.trim() === '---') {
        flushList();
        elements.push(
          <hr key={`hr-${index}`} className="my-8 border-t-2 border-gray-200" />
        );
      } else if (line.trim().match(/^[-*+]\s+/) || line.trim().match(/^\d+\.\s+/)) {
        const isOrdered = line.trim().match(/^\d+\.\s+/);
        const newListType = isOrdered ? 'ol' : 'ul';

        if (listType !== newListType) {
          flushList();
          listType = newListType;
        }

        const content = line.trim().replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '');
        currentList.push(formatInlineStyles(content));
      } else if (line.trim().startsWith('>')) {
        flushList();
        const text = line.replace(/^>\s*/, '');
        elements.push(
          <blockquote key={`quote-${index}`} className="border-l-4 border-blue-500 pl-4 py-2 my-4 bg-blue-50 text-gray-700 italic">
            <span dangerouslySetInnerHTML={{ __html: formatInlineStyles(text) }} />
          </blockquote>
        );
      } else if (line.trim() === '') {
        flushList();
        if (elements.length > 0 && elements[elements.length - 1] !== null) {
          elements.push(<div key={`space-${index}`} className="h-2" />);
        }
      } else {
        flushList();
        const formatted = formatInlineStyles(line);
        elements.push(
          <p key={`p-${index}`} className="mb-3 text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatted }} />
        );
      }
    });

    flushList();
    flushCodeBlock();

    return elements;
  };

  return (
    <div className="prose prose-slate max-w-none">
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        {renderContent()}
      </div>
    </div>
  );
}
