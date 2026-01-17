import { Download } from 'lucide-react';

interface VideoPlayerProps {
  videoUrl: string;
  thumbnail?: string;
  title: string;
}

export function VideoPlayer({ videoUrl, thumbnail, title }: VideoPlayerProps) {
  return (
    <div className="space-y-4">
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
        <video
          className="w-full h-full"
          poster={thumbnail}
          controls
        >
          <source src={videoUrl} type="video/mp4" />
          Your browser does not support video playback.
        </video>
      </div>

      <div className="flex gap-3">
        <a
          href={videoUrl}
          download={`${title}.mp4`}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition"
        >
          <Download className="w-4 h-4" />
          Download Video
        </a>
      </div>
    </div>
  );
}
