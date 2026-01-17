import { Video, Clock, Film, Volume2, Image as ImageIcon } from 'lucide-react';

interface VideoScriptViewProps {
  content: string;
}

interface Scene {
  number: number;
  duration: string;
  visual: string;
  audio: string;
  text?: string;
}

export function VideoScriptView({ content }: VideoScriptViewProps) {
  const parseScript = (md: string) => {
    const metadata = {
      title: '',
      duration: '',
      style: '',
      music: ''
    };

    const scenes: Scene[] = [];
    const lines = md.split('\n');
    let currentScene: Partial<Scene> = {};
    let inScene = false;

    lines.forEach(line => {
      if (line.startsWith('# ') && !metadata.title) {
        metadata.title = line.replace('# ', '').trim();
      } else if (line.includes('Duration:')) {
        metadata.duration = line.split('Duration:')[1].trim().replace(/[*_]/g, '');
      } else if (line.includes('Style:')) {
        metadata.style = line.split('Style:')[1].trim().replace(/[*_]/g, '');
      } else if (line.includes('Music:')) {
        metadata.music = line.split('Music:')[1].trim().replace(/[*_]/g, '');
      } else if (line.match(/##\s+Scene\s+(\d+)|##\s+(\d+)\./)) {
        if (currentScene.number) {
          scenes.push(currentScene as Scene);
        }
        const match = line.match(/(\d+)/);
        currentScene = { number: match ? parseInt(match[1]) : scenes.length + 1 };
        inScene = true;
      } else if (inScene && line.includes('Duration:')) {
        currentScene.duration = line.split('Duration:')[1].trim().replace(/[*_]/g, '');
      } else if (inScene && line.includes('Visual:')) {
        currentScene.visual = line.split('Visual:')[1].trim().replace(/[*_]/g, '');
      } else if (inScene && line.includes('Audio:')) {
        currentScene.audio = line.split('Audio:')[1].trim().replace(/[*_]/g, '');
      } else if (inScene && line.includes('Text:')) {
        currentScene.text = line.split('Text:')[1].trim().replace(/[*_]/g, '');
      }
    });

    if (currentScene.number) {
      scenes.push(currentScene as Scene);
    }

    return { metadata, scenes };
  };

  const { metadata, scenes } = parseScript(content);

  const sceneColors = [
    { bg: 'from-purple-500 to-purple-600', light: 'bg-purple-50', border: 'border-purple-200' },
    { bg: 'from-blue-500 to-blue-600', light: 'bg-blue-50', border: 'border-blue-200' },
    { bg: 'from-green-500 to-green-600', light: 'bg-green-50', border: 'border-green-200' },
    { bg: 'from-orange-500 to-orange-600', light: 'bg-orange-50', border: 'border-orange-200' },
    { bg: 'from-pink-500 to-pink-600', light: 'bg-pink-50', border: 'border-pink-200' },
  ];

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-purple-50 via-blue-50 to-cyan-50 border border-purple-200 rounded-xl p-8">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-white rounded-lg shadow-sm">
            <Video className="w-8 h-8 text-purple-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              {metadata.title || 'Video Script'}
            </h2>
            <p className="text-base text-gray-700">Professional video script ready for production</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {metadata.duration && (
            <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-lg border border-gray-200">
              <Clock className="w-5 h-5 text-purple-600" />
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Duration</p>
                <p className="text-sm font-bold text-gray-900">{metadata.duration}</p>
              </div>
            </div>
          )}
          {metadata.style && (
            <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-lg border border-gray-200">
              <Film className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Style</p>
                <p className="text-sm font-bold text-gray-900">{metadata.style}</p>
              </div>
            </div>
          )}
          {metadata.music && (
            <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-lg border border-gray-200">
              <Volume2 className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Music</p>
                <p className="text-sm font-bold text-gray-900">{metadata.music}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {scenes.map((scene, idx) => {
          const colors = sceneColors[idx % sceneColors.length];

          return (
            <div key={idx} className="relative">
              {idx < scenes.length - 1 && (
                <div className="absolute left-8 top-full w-1 h-6 bg-gray-300 -z-10" />
              )}

              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className={`bg-gradient-to-r ${colors.bg} px-6 py-4`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
                        <span className="text-xl font-bold text-gray-900">{scene.number}</span>
                      </div>
                      <div>
                        <h4 className="text-lg font-bold text-white">Scene {scene.number}</h4>
                        {scene.duration && (
                          <p className="text-sm text-white/90">{scene.duration}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {scene.visual && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <ImageIcon className="w-5 h-5 text-purple-600" />
                        <h5 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Visual</h5>
                      </div>
                      <div className={`${colors.light} ${colors.border} border rounded-lg p-4`}>
                        <p className="text-base text-gray-900 leading-relaxed">
                          {scene.visual}
                        </p>
                      </div>
                    </div>
                  )}

                  {scene.audio && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Volume2 className="w-5 h-5 text-blue-600" />
                        <h5 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Audio / Voiceover</h5>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <p className="text-base text-gray-900 leading-relaxed italic">
                          "{scene.audio}"
                        </p>
                      </div>
                    </div>
                  )}

                  {scene.text && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Film className="w-5 h-5 text-green-600" />
                        <h5 className="text-sm font-bold text-gray-900 uppercase tracking-wide">On-Screen Text</h5>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <p className="text-lg font-bold text-gray-900 text-center">
                          {scene.text}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
