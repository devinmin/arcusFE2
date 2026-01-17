import { Megaphone, Target, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { EditControls } from './EditControls';

interface AdCopyViewProps {
  content: string;
  onContentUpdate?: (newContent: string) => void;
  onAIRefine?: (adIndex: number, prompt: string) => Promise<void>;
}

interface Ad {
  platform: string;
  headline: string;
  body: string;
  cta: string;
  format?: string;
  targeting?: string;
}

interface AdCategory {
  name: string;
  ads: Ad[];
  icon: string;
}

export function AdCopyView({ content, onContentUpdate, onAIRefine }: AdCopyViewProps) {
  const [editingAdKey, setEditingAdKey] = useState<string | null>(null);
  const [editedHeadline, setEditedHeadline] = useState('');
  const [editedBody, setEditedBody] = useState('');

  const parseAds = (md: string): Ad[] => {
    const ads: Ad[] = [];
    const sections = md.split(/(?=##\s+\d+\.|##\s+Ad\s+\d+|##\s+[A-Za-z]+\s+Ad|\*Variant)/i);

    let currentPlatform = '';

    sections.forEach(section => {
      const lines = section.split('\n').filter(line => line.trim());
      if (lines.length === 0) return;

      let platform = currentPlatform;
      let headline = '';
      let body = '';
      let cta = '';
      let format = '';
      let targeting = '';

      lines.forEach((line, idx) => {
        // Check for platform headers
        if (line.match(/\*\*(.+?)\s+(Ads?|Search)\*\*/i)) {
          const match = line.match(/\*\*(.+?)\s+(Ads?|Search)\*\*/i);
          if (match) {
            platform = match[1].trim() + ' ' + match[2].trim();
            currentPlatform = platform;
          }
        } else if (line.startsWith('## ') && !headline) {
          const match = line.match(/##\s+(.+?)(?:\s+Ad)?(?:\s+\d+)?$/i);
          if (match) {
            platform = match[1].trim();
            currentPlatform = platform;
          }
        } else if (line.includes('Platform:')) {
          platform = line.split('Platform:')[1].trim().replace(/[*_]/g, '');
          currentPlatform = platform;
        } else if (line.includes('Headline 1:')) {
          headline = line.split('Headline 1:')[1].trim().replace(/[*_]/g, '');
        } else if (line.includes('Headline:')) {
          headline = line.split('Headline:')[1].trim().replace(/[*_]/g, '');
        } else if (line.includes('Primary Text:')) {
          body = line.split('Primary Text:')[1].trim().replace(/[*_]/g, '');
        } else if (line.includes('Intro Text:')) {
          body = line.split('Intro Text:')[1].trim().replace(/[*_]/g, '');
        } else if (line.includes('Description 1:')) {
          if (!body) body = line.split('Description 1:')[1].trim().replace(/[*_]/g, '');
        } else if (line.includes('Description:')) {
          if (!body) body = line.split('Description:')[1].trim().replace(/[*_]/g, '');
        } else if (line.includes('Body:')) {
          body = line.split('Body:')[1].trim().replace(/[*_]/g, '');
        } else if (line.includes('CTA Button:')) {
          cta = line.split('CTA Button:')[1].trim().replace(/[*_]/g, '');
        } else if (line.includes('CTA:')) {
          cta = line.split('CTA:')[1].trim().replace(/[*_]/g, '');
        } else if (line.includes('Format:')) {
          format = line.split('Format:')[1].trim().replace(/[*_]/g, '');
        } else if (line.includes('Target Audience Note:')) {
          targeting = line.split('Target Audience Note:')[1].trim().replace(/[*_]/g, '');
        } else if (line.includes('Targeting:')) {
          targeting = line.split('Targeting:')[1].trim().replace(/[*_]/g, '');
        }
      });

      if (platform && (headline || body)) {
        ads.push({
          platform,
          headline: headline || body.substring(0, 50) + '...',
          body: body.trim(),
          cta: cta || 'Shop Now',
          format,
          targeting
        });
      }
    });

    return ads;
  };

  const ads = parseAds(content);

  // Group ads by platform category
  const categorizeAds = (ads: Ad[]): AdCategory[] => {
    const categories: { [key: string]: Ad[] } = {};

    ads.forEach(ad => {
      const platform = ad.platform.toLowerCase();
      let categoryName = '';

      if (platform.includes('facebook') || platform.includes('instagram') || platform.includes('meta')) {
        categoryName = 'Facebook/Instagram Ads';
      } else if (platform.includes('google') || platform.includes('search')) {
        categoryName = 'Google Search Ads';
      } else if (platform.includes('linkedin')) {
        categoryName = 'LinkedIn Ads';
      } else if (platform.includes('twitter') || platform.includes('x')) {
        categoryName = 'Twitter/X Ads';
      } else {
        categoryName = ad.platform;
      }

      if (!categories[categoryName]) {
        categories[categoryName] = [];
      }
      categories[categoryName].push(ad);
    });

    return Object.entries(categories).map(([name, ads]) => ({
      name,
      ads,
      icon: name
    }));
  };

  const categories = categorizeAds(ads);

  const handleStartEdit = (catIdx: number, adIdx: number) => {
    const ad = categories[catIdx].ads[adIdx];
    setEditingAdKey(`${catIdx}-${adIdx}`);
    setEditedHeadline(ad.headline);
    setEditedBody(ad.body);
  };

  const handleSaveEdit = () => {
    if (!editingAdKey) return;

    const [catIdx, adIdx] = editingAdKey.split('-').map(Number);
    const updatedAds = [...ads];
    const ad = categories[catIdx].ads[adIdx];

    // Find the ad in the original ads array
    const adIndexInOriginal = updatedAds.findIndex(a =>
      a.platform === ad.platform && a.headline === ad.headline && a.body === ad.body
    );

    if (adIndexInOriginal !== -1) {
      updatedAds[adIndexInOriginal].headline = editedHeadline;
      updatedAds[adIndexInOriginal].body = editedBody;

      // Rebuild markdown
      const newMarkdown = updatedAds.map((ad, idx) => {
        let md = `## ${idx + 1}. ${ad.platform}\n\n`;
        md += `**Headline:** ${ad.headline}\n\n`;
        md += `**Body:** ${ad.body}\n\n`;
        if (ad.cta) md += `**CTA:** ${ad.cta}\n\n`;
        if (ad.targeting) md += `**Targeting:** ${ad.targeting}\n\n`;
        return md;
      }).join('\n');

      onContentUpdate?.(newMarkdown);
    }

    setEditingAdKey(null);
    setEditedHeadline('');
    setEditedBody('');
  };

  const handleCancelEdit = () => {
    setEditingAdKey(null);
    setEditedHeadline('');
    setEditedBody('');
  };

  const handleAIRefine = async (catIdx: number, adIdx: number, prompt: string) => {
    if (onAIRefine) {
      // Calculate global ad index
      let globalAdIndex = 0;
      for (let i = 0; i < catIdx; i++) {
        globalAdIndex += categories[i].ads.length;
      }
      globalAdIndex += adIdx;
      await onAIRefine(globalAdIndex, prompt);
    }
  };

  const getPlatformColor = (platform: string) => {
    const lower = platform.toLowerCase();
    if (lower.includes('google')) return {
      bg: 'from-red-500 to-yellow-500',
      light: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-600',
      badge: 'bg-red-100 text-red-700'
    };
    if (lower.includes('facebook') || lower.includes('meta')) return {
      bg: 'from-blue-500 to-blue-700',
      light: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-600',
      badge: 'bg-blue-100 text-blue-700'
    };
    if (lower.includes('linkedin')) return {
      bg: 'from-blue-600 to-blue-800',
      light: 'bg-blue-50',
      border: 'border-blue-300',
      text: 'text-blue-700',
      badge: 'bg-blue-100 text-blue-800'
    };
    if (lower.includes('twitter') || lower.includes('x')) return {
      bg: 'from-sky-400 to-sky-600',
      light: 'bg-sky-50',
      border: 'border-sky-200',
      text: 'text-sky-600',
      badge: 'bg-sky-100 text-sky-700'
    };
    if (lower.includes('instagram')) return {
      bg: 'from-pink-500 to-purple-600',
      light: 'bg-pink-50',
      border: 'border-pink-200',
      text: 'text-pink-600',
      badge: 'bg-pink-100 text-pink-700'
    };
    return {
      bg: 'from-gray-500 to-gray-700',
      light: 'bg-gray-50',
      border: 'border-gray-200',
      text: 'text-gray-600',
      badge: 'bg-gray-100 text-gray-700'
    };
  };

  const getCategoryColor = (categoryName: string) => {
    const lower = categoryName.toLowerCase();
    if (lower.includes('facebook') || lower.includes('instagram')) {
      return 'from-blue-500 to-blue-700';
    } else if (lower.includes('google')) {
      return 'from-red-500 to-yellow-500';
    } else if (lower.includes('linkedin')) {
      return 'from-blue-600 to-blue-800';
    } else if (lower.includes('twitter') || lower.includes('x')) {
      return 'from-sky-400 to-sky-600';
    }
    return 'from-gray-500 to-gray-700';
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-red-50 via-orange-50 to-yellow-50 border border-red-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <Megaphone className="w-6 h-6 text-red-600" />
          <h3 className="text-xl font-bold text-gray-900">Ad Campaign Creative</h3>
        </div>
        <p className="text-base text-gray-700">
          {ads.length} ad variations across {categories.length} platforms
        </p>
      </div>

      <div className="space-y-8">
        {categories.map((category, catIdx) => {
          const colors = getPlatformColor(category.name);
          const gradientColor = getCategoryColor(category.name);

          return (
            <div key={catIdx} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className={`bg-gradient-to-r ${gradientColor} px-6 py-4`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg">
                      <Megaphone className="w-5 h-5 text-gray-700" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white">{category.name}</h4>
                      <p className="text-sm text-white/90">{category.ads.length} variant{category.ads.length > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-white/20 px-3 py-1.5 rounded-full">
                    <TrendingUp className="w-4 h-4 text-white" />
                    <span className="text-sm font-medium text-white">Optimized</span>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-gray-200">
                {category.ads.map((ad, adIdx) => {
                  const isEditing = editingAdKey === `${catIdx}-${adIdx}`;

                  return (
                  <div key={adIdx} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start gap-6">
                      <div className="flex-shrink-0">
                        <div className={`${colors.badge} px-3 py-1.5 rounded-lg text-sm font-semibold`}>
                          Variant {adIdx + 1}
                        </div>
                      </div>

                      <div className="flex-1">
                        <div className="mb-3">
                          <EditControls
                            onManualEdit={() => handleStartEdit(catIdx, adIdx)}
                            onAIEdit={(prompt) => handleAIRefine(catIdx, adIdx, prompt)}
                            isEditing={isEditing}
                            onSaveEdit={handleSaveEdit}
                            onCancelEdit={handleCancelEdit}
                          />
                        </div>

                        <div className="space-y-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Headline</span>
                            </div>
                            {isEditing ? (
                              <input
                                type="text"
                                value={editedHeadline}
                                onChange={(e) => setEditedHeadline(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-lg font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            ) : (
                              <h5 className="text-lg font-bold text-gray-900 leading-tight">
                                {ad.headline}
                              </h5>
                            )}
                          </div>

                          {ad.body && (
                            <div>
                              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Body</span>
                              {isEditing ? (
                                <textarea
                                  value={editedBody}
                                  onChange={(e) => setEditedBody(e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mt-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                  rows={3}
                                />
                              ) : (
                                <p className="text-sm text-gray-700 mt-1 leading-relaxed">
                                  {ad.body}
                                </p>
                              )}
                            </div>
                          )}

                          {ad.cta && (
                            <div>
                              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Call to Action</span>
                              <p className="text-sm text-gray-700 mt-1">
                                {ad.cta}
                              </p>
                            </div>
                          )}

                          {ad.targeting && (
                            <div className="flex items-start gap-2 pt-2">
                              <Target className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</p>
                                <p className="text-sm text-gray-600 mt-0.5">{ad.targeting}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
