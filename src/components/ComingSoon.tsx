import { ArrowLeft, Clock } from 'lucide-react';
import { useEffect } from 'react';

interface ComingSoonProps {
  onBack: () => void;
}

export default function ComingSoon({ onBack }: ComingSoonProps) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center px-6">
      <div className="max-w-2xl w-full text-center">
        <div className="flex justify-center mb-8">
          <div className="p-6 bg-blue-600/20 rounded-full">
            <Clock className="w-16 h-16 text-blue-400" />
          </div>
        </div>

        <h1 className="text-5xl font-bold text-white mb-4">
          Coming Soon
        </h1>

        <p className="text-xl text-gray-300 mb-8">
          We're working hard to bring you something amazing. Stay tuned!
        </p>

        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Home
        </button>
      </div>
    </div>
  );
}
