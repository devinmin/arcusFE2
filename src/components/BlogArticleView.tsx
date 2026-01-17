import { FileText, Search, Tag, Clock, Eye } from 'lucide-react';

interface BlogArticleViewProps {
  content: string;
}

export function BlogArticleView({ content }: BlogArticleViewProps) {
  const extractMetadata = (md: string) => {
    const metadata = {
      title: '',
      metaDescription: '',
      keywords: [] as string[],
      readingTime: '',
      wordCount: 0
    };

    const lines = md.split('\n');
    lines.forEach(line => {
      if (line.startsWith('# ') && !metadata.title) {
        metadata.title = line.replace('# ', '').trim();
      } else if (line.includes('Meta Description:')) {
        metadata.metaDescription = line.split('Meta Description:')[1].trim().replace(/[*_]/g, '');
      } else if (line.includes('Keywords:')) {
        const keywordText = line.split('Keywords:')[1].trim();
        metadata.keywords = keywordText.split(',').map(k => k.trim()).filter(k => k);
      } else if (line.includes('Reading Time:')) {
        metadata.readingTime = line.split('Reading Time:')[1].trim().replace(/[*_]/g, '');
      }
    });

    const words = md.split(/\s+/).length;
    metadata.wordCount = words;
    if (!metadata.readingTime) {
      const minutes = Math.ceil(words / 200);
      metadata.readingTime = `${minutes} min read`;
    }

    return metadata;
  };

  const extractSections = (md: string) => {
    const sections: { title: string; content: string }[] = [];
    const lines = md.split('\n');
    let currentSection = { title: '', content: '' };

    lines.forEach(line => {
      if (line.startsWith('## ')) {
        if (currentSection.title) {
          sections.push({ ...currentSection });
        }
        currentSection = { title: line.replace('## ', '').trim(), content: '' };
      } else if (line.startsWith('### ')) {
        currentSection.content += `\n**${line.replace('### ', '').trim()}**\n`;
      } else if (!line.startsWith('#') && !line.includes('Meta Description:') && !line.includes('Keywords:') && !line.includes('Reading Time:') && line.trim()) {
        currentSection.content += line + '\n';
      }
    });

    if (currentSection.title) {
      sections.push(currentSection);
    }

    return sections;
  };

  const metadata = extractMetadata(content);
  const sections = extractSections(content);

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50 border border-blue-200 rounded-xl p-8">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-white rounded-lg shadow-sm">
            <FileText className="w-8 h-8 text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              {metadata.title || 'Blog Article'}
            </h2>
            {metadata.metaDescription && (
              <p className="text-base text-gray-700 leading-relaxed">
                {metadata.metaDescription}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 mt-6">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-gray-200">
            <Clock className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-gray-700">{metadata.readingTime}</span>
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-gray-200">
            <Eye className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-gray-700">{metadata.wordCount} words</span>
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-gray-200">
            <Search className="w-5 h-5 text-purple-600" />
            <span className="text-sm font-medium text-gray-700">SEO Optimized</span>
          </div>
        </div>
      </div>

      {metadata.keywords.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Tag className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-bold text-gray-900">SEO Keywords</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {metadata.keywords.map((keyword, idx) => (
              <span
                key={idx}
                className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-200"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-bold text-gray-900">Article Content</h3>
        </div>

        <div className="p-8 space-y-8">
          {sections.map((section, idx) => (
            <div key={idx} className="space-y-4">
              <h4 className="text-2xl font-bold text-gray-900 pb-3 border-b-2 border-blue-200">
                {section.title}
              </h4>
              <div className="prose prose-lg max-w-none">
                {section.content.split('\n').map((paragraph, pIdx) => {
                  if (!paragraph.trim()) return null;

                  if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
                    return (
                      <h5 key={pIdx} className="text-xl font-semibold text-gray-900 mt-6 mb-3">
                        {paragraph.replace(/\*\*/g, '')}
                      </h5>
                    );
                  }

                  if (paragraph.startsWith('- ')) {
                    return (
                      <li key={pIdx} className="text-base text-gray-700 ml-6 mb-2">
                        {paragraph.replace('- ', '')}
                      </li>
                    );
                  }

                  return (
                    <p key={pIdx} className="text-base text-gray-700 leading-relaxed mb-4">
                      {paragraph}
                    </p>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
