import { Edit2, Sparkles, Save, X } from 'lucide-react';
import { useState } from 'react';

interface EditControlsProps {
  onManualEdit?: () => void;
  onAIEdit: (prompt: string) => void;
  isEditing: boolean;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  showManualEdit?: boolean;
}

export function EditControls({
  onManualEdit,
  onAIEdit,
  isEditing,
  onSaveEdit,
  onCancelEdit,
  showManualEdit = true
}: EditControlsProps) {
  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [aiPrompt, setAIPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAISubmit = async () => {
    if (!aiPrompt.trim()) return;

    setIsProcessing(true);
    try {
      await onAIEdit(aiPrompt);
      setAIPrompt('');
      setShowAIPrompt(false);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isEditing && onSaveEdit && onCancelEdit) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={onSaveEdit}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
        >
          <Save className="w-4 h-4" />
          Save Changes
        </button>
        <button
          onClick={onCancelEdit}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {showManualEdit && (
          <button
            onClick={onManualEdit}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            Manual Edit
          </button>
        )}
        <button
          onClick={() => setShowAIPrompt(!showAIPrompt)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          AI Refine
        </button>
      </div>

      {showAIPrompt && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
          <label className="block text-sm font-medium text-gray-900">
            What would you like to change?
          </label>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAIPrompt(e.target.value)}
            placeholder="E.g., Make it more professional, add statistics, shorten to 50 words..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            rows={3}
            disabled={isProcessing}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleAISubmit}
              disabled={!aiPrompt.trim() || isProcessing}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4" />
              {isProcessing ? 'Processing...' : 'Refine with AI'}
            </button>
            <button
              onClick={() => {
                setShowAIPrompt(false);
                setAIPrompt('');
              }}
              disabled={isProcessing}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
