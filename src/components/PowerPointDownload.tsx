import { Download, Presentation } from 'lucide-react';

interface PowerPointDownloadProps {
  downloadUrl: string;
  slideCount: number;
  title: string;
}

export function PowerPointDownload({ downloadUrl, slideCount, title }: PowerPointDownloadProps) {
  return (
    <div className="space-y-4 text-center">
      <div className="inline-flex items-center justify-center w-24 h-24 bg-violet-100 rounded-full">
        <Presentation className="w-12 h-12 text-violet-600" />
      </div>

      <div>
        <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
        <p className="text-violet-200">{slideCount} slides ready for presentation</p>
      </div>

      <a
        href={downloadUrl}
        download={`${title}.pptx`}
        className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition font-medium"
      >
        <Download className="w-5 h-5" />
        Download PowerPoint
      </a>

      <div className="text-sm text-violet-300 mt-4">
        Includes: Brand analysis, strategy, content overview, and deliverables showcase
      </div>
    </div>
  );
}
