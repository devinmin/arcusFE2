import { Target, Users, MessageSquare, TrendingUp, Lightbulb, Calendar, DollarSign } from 'lucide-react';

interface StrategicBriefViewProps {
  content: string;
}

interface ParsedSection {
  title: string;
  content: string[];
  subsections?: { [key: string]: string[] };
}

export function StrategicBriefView({ content }: StrategicBriefViewProps) {
  const parseMarkdown = (md: string): { [key: string]: ParsedSection } => {
    const sections: { [key: string]: ParsedSection } = {};
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
        const text = line.replace('- ', '').trim();
        if (currentSubsection && sections[currentSection].subsections) {
          sections[currentSection].subsections![currentSubsection].push(text);
        } else {
          sections[currentSection].content.push(text);
        }
      } else if (line.trim() && !line.startsWith('#') && !line.startsWith('**') && currentSection) {
        if (currentSubsection && sections[currentSection].subsections) {
          sections[currentSection].subsections![currentSubsection].push(line.trim());
        } else if (!currentSubsection) {
          sections[currentSection].content.push(line.trim());
        }
      }
    });

    return sections;
  };

  const sections = parseMarkdown(content);

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
      {sections['Campaign Overview'] && (
        <SectionCard icon={Target} title="Campaign Overview">
          <div className="space-y-4">
            {sections['Campaign Overview'].content.map((item, idx) => (
              <p key={idx} className="text-base text-gray-700 leading-relaxed">{item}</p>
            ))}
          </div>
        </SectionCard>
      )}

      {sections['Target Audience'] && (
        <SectionCard icon={Users} title="Target Audience">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sections['Target Audience'].subsections && Object.entries(sections['Target Audience'].subsections).map(([key, values], idx) => (
              <div key={idx} className="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">{key}</h4>
                <ul className="space-y-2">
                  {values.map((item, itemIdx) => (
                    <li key={itemIdx} className="text-base text-gray-700 flex items-start gap-2">
                      <span className="text-blue-600 mt-1">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {sections['Target Audience'].content.length > 0 && (
              <div className="md:col-span-2 space-y-2">
                {sections['Target Audience'].content.map((item, idx) => (
                  <p key={idx} className="text-base text-gray-700">{item}</p>
                ))}
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {sections['Key Messages'] && (
        <SectionCard icon={MessageSquare} title="Key Messages">
          <div className="space-y-4">
            {sections['Key Messages'].subsections && Object.entries(sections['Key Messages'].subsections).map(([key, values], idx) => (
              <div key={idx}>
                <h4 className="text-lg font-semibold text-gray-900 mb-3">{key}</h4>
                <div className="grid grid-cols-1 gap-3">
                  {values.map((item, itemIdx) => (
                    <div key={itemIdx} className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-base text-gray-900">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {sections['Key Messages'].content.length > 0 && (
              <div className="space-y-3">
                {sections['Key Messages'].content.map((item, idx) => (
                  <div key={idx} className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-base text-gray-900">{item}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {sections['Campaign Strategy'] && (
        <SectionCard icon={TrendingUp} title="Campaign Strategy">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sections['Campaign Strategy'].subsections && Object.entries(sections['Campaign Strategy'].subsections).map(([key, values], idx) => (
              <div key={idx} className="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">{key}</h4>
                <ul className="space-y-2">
                  {values.map((item, itemIdx) => (
                    <li key={itemIdx} className="text-base text-gray-700 flex items-start gap-2">
                      <span className="text-green-600 mt-1">→</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {sections['Channel Strategy'] && (
        <SectionCard icon={Lightbulb} title="Channel Strategy">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {sections['Channel Strategy'].subsections && Object.entries(sections['Channel Strategy'].subsections).map(([key, values], idx) => (
              <div key={idx} className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">{key}</h4>
                <ul className="space-y-2">
                  {values.map((item, itemIdx) => (
                    <li key={itemIdx} className="text-sm text-gray-700 flex items-start gap-2">
                      <span className="text-blue-600 mt-1">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {sections['Timeline'] && (
        <SectionCard icon={Calendar} title="Campaign Timeline">
          <div className="space-y-3">
            {sections['Timeline'].content.map((item, idx) => (
              <div key={idx} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                  {idx + 1}
                </div>
                <p className="text-base text-gray-900 flex-1">{item}</p>
              </div>
            ))}
            {sections['Timeline'].subsections && Object.entries(sections['Timeline'].subsections).map(([key, values], idx) => (
              <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="text-base font-semibold text-gray-900 mb-2">{key}</h4>
                <ul className="space-y-1 ml-4">
                  {values.map((item, itemIdx) => (
                    <li key={itemIdx} className="text-sm text-gray-700">{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {sections['Budget Allocation'] && (
        <SectionCard icon={DollarSign} title="Budget Allocation">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sections['Budget Allocation'].content.map((item, idx) => (
              <div key={idx} className="p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-base text-gray-900">{item}</p>
              </div>
            ))}
            {sections['Budget Allocation'].subsections && Object.entries(sections['Budget Allocation'].subsections).map(([key, values], idx) => (
              <div key={idx} className="p-4 bg-green-50 rounded-lg border border-green-200">
                <h4 className="text-base font-semibold text-gray-900 mb-2">{key}</h4>
                <ul className="space-y-1">
                  {values.map((item, itemIdx) => (
                    <li key={itemIdx} className="text-sm text-gray-700">{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {Object.keys(sections).filter(key =>
        !['Campaign Overview', 'Target Audience', 'Key Messages', 'Campaign Strategy', 'Channel Strategy', 'Timeline', 'Budget Allocation'].includes(key)
      ).map((key, idx) => (
        <SectionCard key={idx} icon={Lightbulb} title={key}>
          <div className="space-y-4">
            {sections[key].content.map((item, itemIdx) => (
              <p key={itemIdx} className="text-base text-gray-700">{item}</p>
            ))}
            {sections[key].subsections && Object.entries(sections[key].subsections).map(([subKey, values], subIdx) => (
              <div key={subIdx}>
                <h4 className="text-lg font-semibold text-gray-900 mb-3">{subKey}</h4>
                <ul className="space-y-2">
                  {values.map((item, itemIdx) => (
                    <li key={itemIdx} className="text-base text-gray-700 flex items-start gap-2">
                      <span className="text-blue-600 mt-1">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
