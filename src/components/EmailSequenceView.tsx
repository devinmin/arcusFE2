import { Mail, Send, Target, Clock } from 'lucide-react';

interface EmailSequenceViewProps {
  content: string;
}

interface Email {
  number: number;
  subject: string;
  preheader?: string;
  body: string;
  cta?: string;
  timing?: string;
}

export function EmailSequenceView({ content }: EmailSequenceViewProps) {
  const parseEmails = (md: string): Email[] => {
    const emails: Email[] = [];
    const sections = md.split(/(?=##\s+Email\s+\d+|##\s+\d+\.)/);

    sections.forEach(section => {
      const lines = section.split('\n').filter(line => line.trim());
      if (lines.length === 0) return;

      let number = 0;
      let subject = '';
      let preheader = '';
      let body = '';
      let cta = '';
      let timing = '';

      lines.forEach(line => {
        if (line.match(/##\s+Email\s+(\d+)|##\s+(\d+)\./)) {
          const match = line.match(/(\d+)/);
          if (match) number = parseInt(match[1]);
        } else if (line.includes('Subject:')) {
          subject = line.split('Subject:')[1].trim().replace(/[*_]/g, '');
        } else if (line.includes('Preheader:')) {
          preheader = line.split('Preheader:')[1].trim().replace(/[*_]/g, '');
        } else if (line.includes('CTA:')) {
          cta = line.split('CTA:')[1].trim().replace(/[*_]/g, '');
        } else if (line.includes('Timing:')) {
          timing = line.split('Timing:')[1].trim().replace(/[*_]/g, '');
        } else if (!line.startsWith('#') && !line.includes('Subject:') && !line.includes('Preheader:') && !line.includes('CTA:') && !line.includes('Timing:') && line.trim() && !line.startsWith('**')) {
          body += line.trim() + '\n';
        }
      });

      if (number && subject && body) {
        emails.push({ number, subject, preheader, body: body.trim(), cta, timing });
      }
    });

    return emails.sort((a, b) => a.number - b.number);
  };

  const emails = parseEmails(content);

  const emailColors = [
    { bg: 'from-blue-500 to-blue-600', light: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600' },
    { bg: 'from-green-500 to-green-600', light: 'bg-green-50', border: 'border-green-200', text: 'text-green-600' },
    { bg: 'from-purple-500 to-purple-600', light: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-600' },
    { bg: 'from-orange-500 to-orange-600', light: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600' },
    { bg: 'from-pink-500 to-pink-600', light: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <Mail className="w-6 h-6 text-blue-600" />
          <h3 className="text-xl font-bold text-gray-900">Email Sequence Campaign</h3>
        </div>
        <p className="text-base text-gray-700">
          {emails.length}-part email series designed to nurture and convert leads
        </p>
      </div>

      <div className="space-y-8">
        {emails.map((email, idx) => {
          const colors = emailColors[idx % emailColors.length];

          return (
            <div key={idx} className="relative">
              {idx < emails.length - 1 && (
                <div className="absolute left-6 top-full w-0.5 h-8 bg-gray-300 -z-10" />
              )}

              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className={`bg-gradient-to-r ${colors.bg} px-6 py-4`}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                      <span className={`text-xl font-bold ${colors.text}`}>{email.number}</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-lg font-bold text-white mb-1">{email.subject}</h4>
                      {email.preheader && (
                        <p className="text-sm text-white/90 italic">{email.preheader}</p>
                      )}
                    </div>
                    {email.timing && (
                      <div className="flex items-center gap-2 text-white/90 text-sm bg-white/20 px-3 py-1 rounded-full">
                        <Clock className="w-4 h-4" />
                        <span>{email.timing}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-6">
                  <div className="mb-4">
                    <div className={`${colors.light} ${colors.border} border rounded-lg p-6`}>
                      <p className="text-base text-gray-900 leading-relaxed whitespace-pre-line">
                        {email.body}
                      </p>
                    </div>
                  </div>

                  {email.cta && (
                    <div className="flex items-center justify-center pt-4">
                      <div className={`bg-gradient-to-r ${colors.bg} text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 shadow-md`}>
                        <Send className="w-5 h-5" />
                        <span>{email.cta}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className={`${colors.light} px-6 py-3 border-t ${colors.border}`}>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Target className={`w-4 h-4 ${colors.text}`} />
                      <span className="text-gray-700">Email #{email.number} in sequence</span>
                    </div>
                    <span className={`${colors.text} font-medium`}>Ready to send</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
