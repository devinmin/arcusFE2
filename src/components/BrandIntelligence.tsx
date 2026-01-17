import { Palette, Type, MessageCircle, Target, Eye, Lightbulb, Users, TrendingUp, Award, CheckCircle, XCircle, Sparkles, BookOpen } from 'lucide-react';

interface BrandIntelligenceProps {
  jsonData: string;
  extractedImages: string[];
  guidelines: string | null;
}

interface ColorInfo {
  name: string;
  hex: string;
  type: 'primary' | 'secondary';
}

interface Section {
  title: string;
  content: string[];
  subsections?: { [key: string]: string[] };
}

export function BrandIntelligence({ jsonData, extractedImages, guidelines }: BrandIntelligenceProps) {
  let brandData;
  try {
    brandData = JSON.parse(jsonData);
  } catch (e) {
    return <div className="text-gray-900">Invalid brand data</div>;
  }

  const parseMarkdownGuidelines = (md: string | null): { [key: string]: Section } => {
    if (!md) return {};

    const sections: { [key: string]: Section } = {};
    const lines = md.split('\n');
    let currentSection = '';
    let currentSubsection = '';

    lines.forEach(line => {
      if (line.startsWith('## ')) {
        currentSection = line.replace('## ', '').replace(/^\d+\.\s*/, '').trim();
        sections[currentSection] = { title: currentSection, content: [], subsections: {} };
        currentSubsection = '';
      } else if (line.startsWith('### ') && currentSection) {
        currentSubsection = line.replace('### ', '').trim();
        if (!sections[currentSection].subsections) {
          sections[currentSection].subsections = {};
        }
        sections[currentSection].subsections![currentSubsection] = [];
      } else if (line.startsWith('- ') && currentSection) {
        const content = line.replace('- ', '').trim();
        if (currentSubsection && sections[currentSection].subsections) {
          sections[currentSection].subsections![currentSubsection].push(content);
        } else {
          sections[currentSection].content.push(content);
        }
      } else if (line.trim() && !line.startsWith('#') && currentSection && !currentSubsection) {
        sections[currentSection].content.push(line.trim());
      }
    });

    return sections;
  };

  const extractColors = (md: string | null): ColorInfo[] => {
    if (!md) return [];
    const colors: ColorInfo[] = [];
    const lines = md.split('\n');
    let currentType: 'primary' | 'secondary' = 'primary';
    let inColorSection = false;

    lines.forEach(line => {
      if (line.includes('### Color Palette')) {
        inColorSection = true;
      } else if (line.startsWith('###') && inColorSection) {
        inColorSection = false;
      } else if (inColorSection) {
        if (line.includes('Primary Colors:')) {
          currentType = 'primary';
        } else if (line.includes('Secondary Colors:')) {
          currentType = 'secondary';
        } else if (line.startsWith('- ') && line.includes('#')) {
          const match = line.match(/- ([^:]+):\s*(#[A-Fa-f0-9]{6}|#[A-Fa-f0-9]{3})/);
          if (match) {
            colors.push({
              name: match[1].trim(),
              hex: match[2].toUpperCase(),
              type: currentType
            });
          }
        }
      }
    });

    return colors;
  };

  const extractTypography = (md: string | null): { [key: string]: string } => {
    if (!md) return {};
    const typography: { [key: string]: string } = {};
    const lines = md.split('\n');
    let inTypographySection = false;

    lines.forEach(line => {
      if (line.includes('### Typography')) {
        inTypographySection = true;
      } else if (line.startsWith('###') && inTypographySection) {
        inTypographySection = false;
      } else if (inTypographySection && (line.startsWith('- ') || line.startsWith('  - '))) {
        const cleanLine = line.replace(/^[\s-]+/, '');
        const parts = cleanLine.split(':');
        if (parts.length >= 2) {
          typography[parts[0].trim()] = parts.slice(1).join(':').trim();
        }
      }
    });

    return typography;
  };

  const extractVisualPatterns = (md: string | null): string[] => {
    if (!md) return [];
    const patterns: string[] = [];
    const lines = md.split('\n');
    let inVisualPatternsSection = false;

    lines.forEach(line => {
      if (line.includes('### Visual Patterns & Design Elements')) {
        inVisualPatternsSection = true;
      } else if (line.startsWith('###') && inVisualPatternsSection) {
        inVisualPatternsSection = false;
      } else if (inVisualPatternsSection && line.startsWith('- ')) {
        patterns.push(line.replace('- ', '').trim());
      }
    });

    return patterns;
  };

  const sections = parseMarkdownGuidelines(guidelines);
  const extractedColors = extractColors(guidelines);
  const typography = extractTypography(guidelines);
  const visualPatterns = extractVisualPatterns(guidelines);

  const SectionCard = ({ icon: Icon, title, children, bgColor = "bg-white" }: {
    icon: any;
    title: string;
    children: React.ReactNode;
    bgColor?: string;
  }) => (
    <div className={`${bgColor} border border-gray-200 rounded-xl p-8 shadow-sm`}>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-blue-50 rounded-lg">
          <Icon className="w-6 h-6 text-blue-600" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  );

  return (
    <div className="space-y-8">
      {(extractedColors.length > 0 || Object.keys(typography).length > 0 || visualPatterns.length > 0) && (
        <SectionCard icon={Palette} title="Brand Identity Extraction">
          <div className="space-y-8">
            {extractedColors.length > 0 && (
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Color Palette</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-3">Primary Colors</p>
                    <div className="grid grid-cols-3 gap-6">
                      {extractedColors.filter(c => c.type === 'primary').map((color, idx) => (
                        <div key={idx} className="group flex flex-col items-center">
                          <div
                            className="w-32 h-32 rounded-full shadow-md transition-all group-hover:shadow-lg border-4 border-white ring-2 ring-gray-200"
                            style={{ backgroundColor: color.hex }}
                          />
                          <div className="mt-3 text-center">
                            <div className="text-sm font-semibold text-gray-900">{color.name}</div>
                            <div className="text-sm font-mono text-gray-600 mt-1">{color.hex}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {extractedColors.filter(c => c.type === 'secondary').length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-600 mb-3">Secondary Colors</p>
                      <div className="grid grid-cols-3 gap-6">
                        {extractedColors.filter(c => c.type === 'secondary').map((color, idx) => (
                          <div key={idx} className="group flex flex-col items-center">
                            <div
                              className="w-32 h-32 rounded-full shadow-md transition-all group-hover:shadow-lg border-4 border-white ring-2 ring-gray-200"
                              style={{ backgroundColor: color.hex }}
                            />
                            <div className="mt-3 text-center">
                              <div className="text-sm font-semibold text-gray-900">{color.name}</div>
                              <div className="text-sm font-mono text-gray-600 mt-1">{color.hex}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {Object.keys(typography).length > 0 && (
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Typography</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(typography).map(([key, value], idx) => (
                    <div key={idx} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-gray-700">{key}</div>
                        <div className="text-base text-gray-900 mt-1">{value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {visualPatterns.length > 0 && (
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Visual Patterns & Design Elements</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {visualPatterns.map((pattern, idx) => (
                    <div key={idx} className="flex items-start gap-3 text-base text-gray-700 p-3 rounded-lg bg-gray-50">
                      <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <span>{pattern}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {sections['VISUAL ASSET ANALYSIS'] && (
        <SectionCard icon={Eye} title="Visual Asset Analysis">
          <div className="space-y-6">
            {sections['VISUAL ASSET ANALYSIS'].subsections?.['Image Style Guidelines'] && (
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Image Style Guidelines</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {sections['VISUAL ASSET ANALYSIS'].subsections['Image Style Guidelines'].map((guideline, idx) => (
                    <div key={idx} className="flex items-start gap-3 text-base text-gray-700 p-3 rounded-lg bg-gray-50">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>{guideline}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sections['VISUAL ASSET ANALYSIS'].subsections?.['Visual Patterns'] && (
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Visual Patterns</h4>
                <div className="flex flex-wrap gap-2">
                  {sections['VISUAL ASSET ANALYSIS'].subsections['Visual Patterns'].map((pattern, idx) => (
                    <span key={idx} className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-200">
                      {pattern}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {extractedImages.length > 0 && (
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Extracted Visual Assets</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {extractedImages.map((url, idx) => (
                    <div key={idx} className="group relative">
                      <img
                        src={url}
                        alt={`Brand asset ${idx + 1}`}
                        className="w-full h-32 object-cover rounded-lg border border-gray-200 transition-transform group-hover:scale-105 shadow-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {sections['VOICE & MESSAGING ANALYSIS'] && (
        <SectionCard icon={MessageCircle} title="Voice & Messaging Analysis">
          <div className="space-y-6">
            {sections['VOICE & MESSAGING ANALYSIS'].subsections?.['Tone of Voice'] && (
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Tone of Voice</h4>
                <div className="flex flex-wrap gap-2">
                  {sections['VOICE & MESSAGING ANALYSIS'].subsections['Tone of Voice'].map((tone, idx) => (
                    <span key={idx} className="px-4 py-2 bg-green-50 text-green-700 rounded-lg text-base font-medium border border-green-200">
                      {tone}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {sections['VOICE & MESSAGING ANALYSIS'].subsections?.['Key Phrases & Language Patterns'] && (
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Key Phrases & Language Patterns</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {sections['VOICE & MESSAGING ANALYSIS'].subsections['Key Phrases & Language Patterns']
                    .filter(phrase => phrase.startsWith('"'))
                    .map((phrase, idx) => (
                      <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="text-gray-900 text-base">{phrase}</div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {sections['VOICE & MESSAGING ANALYSIS'].subsections?.['Emotional Triggers'] && (
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Emotional Triggers</h4>
                <div className="flex flex-wrap gap-2">
                  {sections['VOICE & MESSAGING ANALYSIS'].subsections['Emotional Triggers'].map((trigger, idx) => (
                    <span key={idx} className="px-4 py-2 bg-amber-50 text-amber-700 rounded-lg text-sm font-medium border border-amber-200">
                      {trigger}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {sections['TARGET AUDIENCE ANALYSIS'] && (
        <SectionCard icon={Users} title="Target Audience Analysis">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sections['TARGET AUDIENCE ANALYSIS'].subsections?.['Primary Persona Demographics'] && (
              <div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-blue-600" />
                  Demographics
                </h4>
                <ul className="space-y-2">
                  {sections['TARGET AUDIENCE ANALYSIS'].subsections['Primary Persona Demographics'].map((item, idx) => (
                    <li key={idx} className="text-base text-gray-700 flex items-start gap-2">
                      <span className="text-blue-600 mt-1">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sections['TARGET AUDIENCE ANALYSIS'].subsections?.['Psychographics'] && (
              <div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  Psychographics
                </h4>
                <ul className="space-y-2">
                  {sections['TARGET AUDIENCE ANALYSIS'].subsections['Psychographics'].map((item, idx) => (
                    <li key={idx} className="text-base text-gray-700 flex items-start gap-2">
                      <span className="text-blue-600 mt-1">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sections['TARGET AUDIENCE ANALYSIS'].subsections?.['Motivations'] && (
              <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 md:col-span-2">
                <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  Motivations
                </h4>
                <div className="flex flex-wrap gap-2">
                  {sections['TARGET AUDIENCE ANALYSIS'].subsections['Motivations'].map((motivation, idx) => (
                    <span key={idx} className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-200">
                      {motivation}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {sections['COMPETITIVE & MARKET CONTEXT'] && (
        <SectionCard icon={TrendingUp} title="Competitive & Market Context">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sections['COMPETITIVE & MARKET CONTEXT'].subsections?.['Industry Positioning'] && (
              <div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Industry Positioning</h4>
                <ul className="space-y-2">
                  {sections['COMPETITIVE & MARKET CONTEXT'].subsections['Industry Positioning'].map((item, idx) => (
                    <li key={idx} className="text-base text-gray-700 flex items-start gap-2">
                      <span className="text-blue-600 mt-1">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sections['COMPETITIVE & MARKET CONTEXT'].subsections?.['Competitive Advantages'] && (
              <div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Competitive Advantages</h4>
                <ul className="space-y-2">
                  {sections['COMPETITIVE & MARKET CONTEXT'].subsections['Competitive Advantages'].map((item, idx) => (
                    <li key={idx} className="text-base text-gray-700 flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {sections['BRAND ESSENCE SUMMARY'] && (
        <SectionCard icon={Award} title="Brand Essence Summary">
          <div className="space-y-6">
            {sections['BRAND ESSENCE SUMMARY'].subsections?.['Brand Archetype'] && (
              <div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-3">Brand Archetype</h4>
                <div className="space-y-2">
                  {sections['BRAND ESSENCE SUMMARY'].subsections['Brand Archetype'].map((item, idx) => (
                    <div key={idx} className="text-base text-gray-700">{item}</div>
                  ))}
                </div>
              </div>
            )}

            {sections['BRAND ESSENCE SUMMARY'].subsections?.['Brand Promise'] && (
              <div className="p-6 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg border border-blue-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-3">Brand Promise</h4>
                <div className="text-lg text-gray-900 font-medium italic leading-relaxed">
                  "{sections['BRAND ESSENCE SUMMARY'].subsections['Brand Promise'][0]}"
                </div>
              </div>
            )}

            {sections['BRAND ESSENCE SUMMARY'].subsections?.['Brand Personality'] && (
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Brand Personality</h4>
                <div className="flex flex-wrap gap-2">
                  {sections['BRAND ESSENCE SUMMARY'].subsections['Brand Personality'].map((trait, idx) => (
                    <span key={idx} className="px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-base font-medium border border-blue-200">
                      {trait}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {sections['STRATEGIC RECOMMENDATIONS'] && (
        <SectionCard icon={Lightbulb} title="Strategic Recommendations">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {sections['STRATEGIC RECOMMENDATIONS'].subsections?.['Content Strategy'] && (
              <div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Content Strategy</h4>
                <ul className="space-y-2">
                  {sections['STRATEGIC RECOMMENDATIONS'].subsections['Content Strategy'].map((item, idx) => (
                    <li key={idx} className="text-base text-gray-700 flex items-start gap-2">
                      <span className="text-blue-600 mt-1">→</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sections['STRATEGIC RECOMMENDATIONS'].subsections?.['Visual Strategy'] && (
              <div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Visual Strategy</h4>
                <ul className="space-y-2">
                  {sections['STRATEGIC RECOMMENDATIONS'].subsections['Visual Strategy'].map((item, idx) => (
                    <li key={idx} className="text-base text-gray-700 flex items-start gap-2">
                      <span className="text-blue-600 mt-1">→</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sections['STRATEGIC RECOMMENDATIONS'].subsections?.['Messaging Strategy'] && (
              <div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Messaging Strategy</h4>
                <ul className="space-y-2">
                  {sections['STRATEGIC RECOMMENDATIONS'].subsections['Messaging Strategy'].map((item, idx) => (
                    <li key={idx} className="text-base text-gray-700 flex items-start gap-2">
                      <span className="text-blue-600 mt-1">→</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {sections['BRAND GUIDELINES FOR CAMPAIGN'] && (
        <SectionCard icon={BookOpen} title="Brand Guidelines for Campaign">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sections['BRAND GUIDELINES FOR CAMPAIGN'].subsections?.["DO's"] && (
              <div className="p-6 bg-green-50 rounded-lg border border-green-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  DO&apos;s
                </h4>
                <ul className="space-y-2">
                  {sections['BRAND GUIDELINES FOR CAMPAIGN'].subsections["DO's"].map((item, idx) => (
                    <li key={idx} className="text-base text-gray-700 flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sections['BRAND GUIDELINES FOR CAMPAIGN'].subsections?.["DON'Ts"] && (
              <div className="p-6 bg-red-50 rounded-lg border border-red-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <XCircle className="w-6 h-6 text-red-600" />
                  DON&apos;Ts
                </h4>
                <ul className="space-y-2">
                  {sections['BRAND GUIDELINES FOR CAMPAIGN'].subsections["DON'Ts"].map((item, idx) => (
                    <li key={idx} className="text-base text-gray-700 flex items-start gap-2">
                      <XCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
